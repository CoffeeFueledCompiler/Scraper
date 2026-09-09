// Google Maps business scraper — Stage 1.
// Automates a real Chromium browser against Google Maps' public UI. Google's
// ToS prohibit automated scraping of their services — keep usage light and
// occasional, not continuous/high-volume.
import { launchBrowser } from "./browser.ts";
import { emptyLead } from "./schema.ts";
import type { Lead } from "./schema.ts";

export function guessNicheAndCityFromQuery(query: string): { niche: string; city: string } {
  const match = query.match(/\bin\s+(.+)$/i);
  if (match) {
    return { niche: query.slice(0, match.index).trim(), city: match[1].trim() };
  }
  return { niche: query.trim(), city: "" };
}

const pause = (a = 800, b = 1800) => new Promise((r) => setTimeout(r, a + Math.random() * (b - a)));

export async function scrapeGoogleMaps(
  query: string,
  limit: number,
  headless = true,
  excludeNames: Set<string> = new Set()
): Promise<Lead[]> {
  const results: Lead[] = [];
  const fallback = guessNicheAndCityFromQuery(query);

  const browser = await launchBrowser(headless);
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(`https://www.google.com/maps/search/${query.replace(/ /g, "+")}`, { timeout: 30000 });

  try {
    const consentBtn = page.locator("button:has-text('Accept all')");
    if ((await consentBtn.count()) > 0) {
      await consentBtn.first().click();
      await pause();
    }
  } catch {
    // no consent dialog — fine
  }

  const feedSelector = 'div[role="feed"]';
  try {
    await page.waitForSelector(feedSelector, { timeout: 15000 });
  } catch {
    console.error("scrape_maps: results feed never appeared — Google may be showing a CAPTCHA.");
  }

  // Seeding with already-saved names lets a Vercel Hobby deployment (60s
  // function cap) build up a full result set across several small, separate
  // scrape calls instead of one call needing to finish the whole limit —
  // each call skips past what's already collected and clicks into fresh
  // cards instead of re-fetching the same first N results every time.
  const seenNames = new Set(excludeNames);
  let stagnantRounds = 0;
  let lastCardCount = 0;

  while (results.length < limit && stagnantRounds < 5) {
    // Match on the stable /maps/place/ URL pattern rather than a specific div
    // nesting depth or class name — Google reshuffles those often enough
    // that a structural selector silently matches zero cards.
    const cards = await page.locator(`${feedSelector} a[href*="/maps/place/"]`).all();
    console.error(`scrape_maps: found ${cards.length} card(s) this round, ${results.length}/${limit} collected so far`);

    for (const card of cards) {
      if (results.length >= limit) break;
      const name = await card.getAttribute("aria-label").catch(() => null);
      if (!name) continue; // card had no aria-label — likely a photo/thumbnail link, not the name link
      if (seenNames.has(name)) continue;
      seenNames.add(name);

      try {
        await card.click();
        // Wait for the details panel heading to actually switch to this
        // business before reading its fields — a fixed pause isn't enough
        // when Google is slow to re-render, and scraping too early reads
        // the *previous* card's still-visible phone/website/address.
        await page.locator("h1.DUwDvf").filter({ hasText: name }).first().waitFor({ timeout: 8000 });
      } catch {
        // fall through and try to scrape anyway — better than skipping
        // the business entirely, though fields may end up blank/stale
      }
      await pause(400, 900);

      let phone = "";
      let website = "";
      let address = "";
      let category = "";
      let rating = "";

      try {
        const phoneEl = page.locator('button[data-item-id^="phone:"]').first();
        if ((await phoneEl.count()) > 0) {
          phone = ((await phoneEl.getAttribute("aria-label")) || "").replace("Phone: ", "").trim();
        }
      } catch {}

      try {
        const siteEl = page.locator('a[data-item-id="authority"]').first();
        if ((await siteEl.count()) > 0) website = (await siteEl.getAttribute("href")) || "";
      } catch {}

      try {
        const addressEl = page.locator('button[data-item-id="address"]').first();
        if ((await addressEl.count()) > 0) {
          address = ((await addressEl.getAttribute("aria-label")) || "").replace("Address: ", "").trim();
        }
      } catch {}

      try {
        const categoryEl = page.locator("button.DkEaL").first();
        if ((await categoryEl.count()) > 0) category = (await categoryEl.innerText()).trim();
      } catch {}

      try {
        // The star-rating icon's aria-label carries both figures, e.g.
        // "4.6 stars 191 Reviews" — parse it down to "4.6 (191)" and fall
        // back to the raw label if Google's wording ever shifts.
        const ratingEl = page.locator('span[role="img"][aria-label*="star"]').first();
        if ((await ratingEl.count()) > 0) {
          const label = ((await ratingEl.getAttribute("aria-label")) || "").trim();
          const match = label.match(/^([\d.]+)\s*stars?\s+([\d,]+)\s*Reviews?/i);
          rating = match ? `${match[1]} (${match[2]})` : label;
        }
      } catch {}

      results.push({
        ...emptyLead(),
        name,
        phone,
        rating,
        website,
        city: address || fallback.city,
        niche: category || fallback.niche,
      });
    }

    // Stagnation means scrolling isn't loading more cards into the DOM at
    // all — not "no new-to-us results this round," which can legitimately
    // happen for several rounds in a row when excludeNames pre-seeds a lot
    // of already-collected businesses near the top of the results.
    stagnantRounds = cards.length === lastCardCount ? stagnantRounds + 1 : 0;
    lastCardCount = cards.length;

    try {
      await page.evaluate((sel) => {
        const feed = document.querySelector(sel);
        if (feed) feed.scrollTop = feed.scrollHeight;
      }, feedSelector);
    } catch {}
    await pause(1200, 2200);
  }

  await browser.close();
  return results.slice(0, limit);
}
