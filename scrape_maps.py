"""
Google Maps business contact scraper
-------------------------------------
Small-scale agent for pulling business name, phone, website, and a
best-effort email (found by visiting the business's own website) for
a Google Maps search query.

USAGE:
    python scraper.py "dentists in Bhopal" --limit 20 --out results.csv

NOTES / CAVEATS (read before running at any real volume):
- This automates a real Chromium browser against Google Maps' public UI.
  Google's Terms of Service prohibit automated scraping of their
  services. This script is meant for light, occasional, personal use
  (a handful of queries), not continuous or high-volume scraping.
- Google may show a CAPTCHA / consent dialog, especially on the first
  run or from a new IP. If a CAPTCHA appears, the script will pause
  and let you solve it manually in the opened browser window
  (headless=False by default for this reason).
- Email extraction visits each business's website and looks for a
  mailto: link or an email pattern on the homepage / contact page.
  This will miss businesses that don't publish an email, and may not
  find emails buried deeper in the site.
- Be a good citizen: keep delays between actions, don't hammer Maps
  with hundreds of rapid queries, and respect any site's own
  robots.txt when visiting business websites for email lookup.
"""

import argparse
import asyncio
import csv
import random
import re
import sys
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

# Generic addresses we deprioritize if a "better" one is found
GENERIC_PREFIXES = ("info@", "contact@", "admin@", "office@", "support@")


async def human_pause(a=0.8, b=1.8):
    await asyncio.sleep(random.uniform(a, b))


async def find_email_on_site(context, website_url, timeout_ms=15000):
    """Best-effort: visit homepage (and a contact page if easy to find),
    look for an email address."""
    if not website_url:
        return ""

    page = await context.new_page()
    found = set()
    try:
        await page.goto(website_url, timeout=timeout_ms, wait_until="domcontentloaded")
        html = await page.content()
        found.update(EMAIL_RE.findall(html))

        # Try to find a contact page link and check that too
        if not found:
            contact_href = await page.evaluate(
                """() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const match = links.find(a =>
                        /contact/i.test(a.textContent || '') ||
                        /contact/i.test(a.getAttribute('href') || '')
                    );
                    return match ? match.getAttribute('href') : null;
                }"""
            )
            if contact_href:
                contact_url = urljoin(website_url, contact_href)
                await page.goto(contact_url, timeout=timeout_ms, wait_until="domcontentloaded")
                html2 = await page.content()
                found.update(EMAIL_RE.findall(html2))
    except Exception:
        pass
    finally:
        await page.close()

    if not found:
        return ""

    # Prefer a non-generic address if one exists
    non_generic = [e for e in found if not e.lower().startswith(GENERIC_PREFIXES)]
    return sorted(non_generic)[0] if non_generic else sorted(found)[0]


async def scrape_google_maps(query, limit, headless, fetch_emails):
    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context(
            locale="en-US",
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        search_url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
        await page.goto(search_url, timeout=30000)

        # Handle consent dialog if it appears
        try:
            consent_btn = page.locator("button:has-text('Accept all')")
            if await consent_btn.count() > 0:
                await consent_btn.first.click()
                await human_pause()
        except Exception:
            pass

        print(
            "If a CAPTCHA appears in the browser window, solve it manually, "
            "then press Enter here to continue...",
            file=sys.stderr,
        )

        # Results panel scroll container
        feed_selector = 'div[role="feed"]'
        try:
            await page.wait_for_selector(feed_selector, timeout=15000)
        except Exception:
            print("Could not find results panel — Google may be showing a "
                  "CAPTCHA or a different layout. Check the browser window.",
                  file=sys.stderr)
            input("Press Enter once the results are visible...")

        seen_names = set()
        stagnant_rounds = 0

        while len(results) < limit and stagnant_rounds < 5:
            cards = await page.locator(f'{feed_selector} > div > a').all()
            before = len(results)

            for card in cards:
                if len(results) >= limit:
                    break
                try:
                    name = await card.get_attribute("aria-label")
                except Exception:
                    name = None
                if not name or name in seen_names:
                    continue
                seen_names.add(name)

                try:
                    await card.click()
                    await human_pause(1.0, 2.0)
                except Exception:
                    continue

                phone, website = "", ""
                try:
                    phone_el = page.locator('button[data-item-id^="phone:"]').first
                    if await phone_el.count() > 0:
                        phone = (await phone_el.get_attribute("aria-label") or "").replace("Phone: ", "").strip()
                except Exception:
                    pass

                try:
                    site_el = page.locator('a[data-item-id="authority"]').first
                    if await site_el.count() > 0:
                        website = await site_el.get_attribute("href") or ""
                except Exception:
                    pass

                results.append({
                    "name": name,
                    "phone": phone,
                    "website": website,
                    "email": "",
                })
                print(f"  [{len(results)}/{limit}] {name} | {phone} | {website}", file=sys.stderr)

            if len(results) == before:
                stagnant_rounds += 1
            else:
                stagnant_rounds = 0

            # Scroll the feed to load more results
            try:
                await page.evaluate(
                    f"""() => {{
                        const feed = document.querySelector('{feed_selector}');
                        if (feed) feed.scrollTop = feed.scrollHeight;
                    }}"""
                )
            except Exception:
                pass
            await human_pause(1.2, 2.2)

        await browser.close()

        # Email enrichment pass (separate browser context, sequential + polite)
        if fetch_emails and results:
            print("Looking up emails from business websites...", file=sys.stderr)
            browser2 = await p.chromium.launch(headless=headless)
            context2 = await browser2.new_context()
            for r in results:
                if r["website"]:
                    r["email"] = await find_email_on_site(context2, r["website"])
                    await human_pause(1.0, 2.0)
            await browser2.close()

    return results


def save_csv(results, out_path):
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "phone", "website", "email"])
        writer.writeheader()
        writer.writerows(results)


def main():
    parser = argparse.ArgumentParser(description="Scrape business contact info from Google Maps.")
    parser.add_argument("query", help='Search query, e.g. "dentists in Bhopal"')
    parser.add_argument("--limit", type=int, default=20, help="Max number of businesses to collect")
    parser.add_argument("--out", default="results.csv", help="Output CSV path")
    parser.add_argument("--headless", action="store_true", help="Run browser headless (default: visible, recommended)")
    parser.add_argument("--no-emails", action="store_true", help="Skip visiting websites to find emails")
    args = parser.parse_args()

    results = asyncio.run(
        scrape_google_maps(
            query=args.query,
            limit=args.limit,
            headless=args.headless,
            fetch_emails=not args.no_emails,
        )
    )

    save_csv(results, args.out)
    print(f"\nSaved {len(results)} businesses to {args.out}")


if __name__ == "__main__":
    main()
