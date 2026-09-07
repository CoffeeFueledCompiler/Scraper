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

export async function scrapeGoogleMaps(query: string, limit: number, headless = true): Promise<Lead[]> {
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

  const seenNames = new Set<string>();
  let stagnantRounds = 0;

  while (results.length < limit && stagnantRounds < 5) {
    // Match on the stable /maps/place/ URL pattern rather than a specific div
    // nesting depth or class name — Google reshuffles those often enough
    // that a structural selector silently matches zero cards.
    const cards = await page.locator(`${feedSelector} a[href*="/maps/place/"]`).all();
    console.error(`scrape_maps: found ${cards.length} card(s) this round, ${results.length}/${limit} collected so far`);
    const before = results.length;

    for (const card of cards) {
      if (results.length >= limit) break;
      const name = await card.getAttribute("aria-label").catch(() => null);
      if (!name) continue; // card had no aria-label — likely a photo/thumbnail link, not the name link
      if (seenNames.has(name)) continue;
      seenNames.add(name);

      try {
        await card.click();
        await pause(1000, 2000);
      } catch {
        continue;
      }

      let phone = "";
      let website = "";
      let address = "";
      let category = "";

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

      results.push({
        ...emptyLead(),
        name,
        phone,
        website,
        city: address || fallback.city,
        niche: category || fallback.niche,
      });
    }

    stagnantRounds = results.length === before ? stagnantRounds + 1 : 0;

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
