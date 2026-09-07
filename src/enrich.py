"""
Email enrichment — Stage 2
---------------------------
Visits each business's website and looks for a published email address.
Resumable: rows already present in --out (matched by name+city) are
skipped unless --force is passed.

USAGE:
    uv run python -m src.enrich --in data/raw_leads.csv --out data/enriched_leads.csv
"""

import argparse
import asyncio
import random
import re
from urllib.parse import urljoin

import pandas as pd
from playwright.async_api import async_playwright

from src.common.schema import ENRICHED_COLUMNS

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
GENERIC_PREFIXES = ("info@", "contact@", "admin@", "office@", "support@")


async def human_pause(a=0.8, b=1.8):
    await asyncio.sleep(random.uniform(a, b))


async def find_email_on_site(context, website_url, timeout_ms=15000):
    """Best-effort: visit homepage (and a contact page if easy to find), look for an email."""
    if not website_url:
        return ""

    page = await context.new_page()
    found = set()
    try:
        await page.goto(website_url, timeout=timeout_ms, wait_until="domcontentloaded")
        html = await page.content()
        found.update(EMAIL_RE.findall(html))

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

    return pick_best_email(found)


def pick_best_email(found):
    """Prefer a non-generic address (not info@/contact@/etc.) if one exists."""
    if not found:
        return ""
    non_generic = [e for e in found if not e.lower().startswith(GENERIC_PREFIXES)]
    return sorted(non_generic)[0] if non_generic else sorted(found)[0]


def filter_todo(rows, done_keys):
    """Rows not already present in done_keys (matched by name+city)."""
    return [r for r in rows if (r["name"], r["city"]) not in done_keys]


async def enrich_rows(rows, headless=True):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context()
        for row in rows:
            row["email"] = await find_email_on_site(context, row.get("website", ""))
            await human_pause(1.0, 2.0)
        await browser.close()
    return rows


def main():
    parser = argparse.ArgumentParser(description="Find email addresses for scraped leads.")
    parser.add_argument("--in", dest="in_path", required=True)
    parser.add_argument("--out", dest="out_path", default="data/enriched_leads.csv")
    parser.add_argument("--limit", type=int, default=None, help="Max rows to process this run")
    parser.add_argument("--force", action="store_true", help="Re-enrich rows already in --out")
    parser.add_argument("--headless", action="store_true", default=True)
    args = parser.parse_args()

    raw = pd.read_csv(args.in_path)

    done_keys = set()
    existing = pd.DataFrame(columns=ENRICHED_COLUMNS)
    if not args.force:
        try:
            existing = pd.read_csv(args.out_path)
            done_keys = set(zip(existing["name"], existing["city"]))
        except FileNotFoundError:
            pass

    todo = [r for r in raw.to_dict("records") if (r["name"], r["city"]) not in done_keys]
    if args.limit is not None:
        todo = todo[: args.limit]

    print(f"Enriching {len(todo)} rows ({len(done_keys)} already done, skipped)...")
    enriched = asyncio.run(enrich_rows(todo, headless=args.headless)) if todo else []

    combined = pd.concat([existing, pd.DataFrame(enriched, columns=ENRICHED_COLUMNS)], ignore_index=True)
    combined = combined[ENRICHED_COLUMNS]
    combined.to_csv(args.out_path, index=False)
    print(f"Saved {len(combined)} total rows to {args.out_path}")


if __name__ == "__main__":
    main()
