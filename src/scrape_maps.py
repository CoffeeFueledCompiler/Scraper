"""
Google Maps business scraper — Stage 1
---------------------------------------
Pulls business name, phone, website, city, and niche for a Google Maps
search query. Email lookup happens later in Stage 2 (src/enrich.py).

USAGE:
    uv run python -m src.scrape_maps "dentists in Bhopal" --limit 20 --out data/raw_leads.csv

NOTES / CAVEATS (read before running at any real volume):
- This automates a real Chromium browser against Google Maps' public UI.
  Google's Terms of Service prohibit automated scraping of their
  services. This script is meant for light, occasional, personal use
  (a handful of queries), not continuous or high-volume scraping.
- Google may show a CAPTCHA / consent dialog, especially on the first
  run or from a new IP. If a CAPTCHA appears, the script will pause
  and let you solve it manually in the opened browser window
  (headless=False by default for this reason).
"""

import argparse
import asyncio
import csv
import random
import re
import sys

from playwright.async_api import async_playwright

from src.common.schema import RAW_COLUMNS

CITY_FROM_QUERY_RE = re.compile(r"\bin\s+(.+)$", re.IGNORECASE)


def guess_niche_and_city_from_query(query):
    """Fallback when the Maps listing doesn't expose a clean category/address."""
    match = CITY_FROM_QUERY_RE.search(query)
    if match:
        city = match.group(1).strip()
        niche = query[: match.start()].strip()
    else:
        city = ""
        niche = query.strip()
    return niche, city


async def human_pause(a=0.8, b=1.8):
    await asyncio.sleep(random.uniform(a, b))


async def scrape_google_maps(query, limit, headless):
    results = []
    fallback_niche, fallback_city = guess_niche_and_city_from_query(query)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context(
            locale="en-US",
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        search_url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
        await page.goto(search_url, timeout=30000)

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

        feed_selector = 'div[role="feed"]'
        try:
            await page.wait_for_selector(feed_selector, timeout=15000)
        except Exception:
            print(
                "Could not find results panel — Google may be showing a "
                "CAPTCHA or a different layout. Check the browser window.",
                file=sys.stderr,
            )
            input("Press Enter once the results are visible...")

        seen_names = set()
        stagnant_rounds = 0

        while len(results) < limit and stagnant_rounds < 5:
            cards = await page.locator(f"{feed_selector} > div > a").all()
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

                phone, website, address, category = "", "", "", ""
                try:
                    phone_el = page.locator('button[data-item-id^="phone:"]').first
                    if await phone_el.count() > 0:
                        phone = (await phone_el.get_attribute("aria-label") or "").replace(
                            "Phone: ", ""
                        ).strip()
                except Exception:
                    pass

                try:
                    site_el = page.locator('a[data-item-id="authority"]').first
                    if await site_el.count() > 0:
                        website = await site_el.get_attribute("href") or ""
                except Exception:
                    pass

                try:
                    address_el = page.locator('button[data-item-id="address"]').first
                    if await address_el.count() > 0:
                        address = (
                            await address_el.get_attribute("aria-label") or ""
                        ).replace("Address: ", "").strip()
                except Exception:
                    pass

                try:
                    category_el = page.locator("button.DkEaL").first
                    if await category_el.count() > 0:
                        category = (await category_el.inner_text()).strip()
                except Exception:
                    pass

                results.append(
                    {
                        "name": name,
                        "phone": phone,
                        "website": website,
                        "city": address or fallback_city,
                        "niche": category or fallback_niche,
                    }
                )
                print(f"  [{len(results)}/{limit}] {name} | {phone} | {website}", file=sys.stderr)

            if len(results) == before:
                stagnant_rounds += 1
            else:
                stagnant_rounds = 0

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

    return results[:limit]


def save_csv(results, out_path):
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=RAW_COLUMNS)
        writer.writeheader()
        writer.writerows(results)


def main():
    parser = argparse.ArgumentParser(description="Scrape business leads from Google Maps.")
    parser.add_argument("query", help='Search query, e.g. "dentists in Bhopal"')
    parser.add_argument("--limit", type=int, default=20, help="Max number of businesses to collect")
    parser.add_argument("--out", default="data/raw_leads.csv", help="Output CSV path")
    parser.add_argument(
        "--headless", action="store_true", help="Run browser headless (default: visible, recommended)"
    )
    args = parser.parse_args()

    results = asyncio.run(scrape_google_maps(query=args.query, limit=args.limit, headless=args.headless))

    save_csv(results, args.out)
    print(f"\nSaved {len(results)} businesses to {args.out}")


if __name__ == "__main__":
    main()
