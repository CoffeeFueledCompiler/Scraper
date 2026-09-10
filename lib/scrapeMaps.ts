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

// Vercel Hobby hard-kills a function at 60s no matter what maxDuration says.
// Each business can take ~30s to scrape (Google's detail panel is slow), so
// a `limit` of even 5-10 can't safely fit one call — this budgets the
// scraping loop itself so it always returns well before that wall, instead
// of relying on the platform to kill it mid-work.
const DEFAULT_BUDGET_MS = 40_000;

// How long to wait for a clicked business's detail panel to render. The old
// 8s was tuned on a desktop; on Render's 0.5 CPU the panel routinely took
// longer, every wait timed out, and each lead was saved with phone/website/
// address blank — which is what left the CSV export with nothing but headers.
const PANEL_TIMEOUT_MS = 15_000;

export async function scrapeGoogleMaps(
  query: string,
  limit: number,
  headless = true,
  excludeNames: Set<string> = new Set(),
  // Persisting each business as it's found (see below) means a mid-run stop
  // — whether from the time budget or a platform kill — loses at most the
  // one business in flight; the next call picks up from there via excludeNames.
  onLead?: (lead: Lead) => Promise<void>,
  budgetMs: number = DEFAULT_BUDGET_MS
): Promise<{ leads: Lead[]; exhausted: boolean }> {
  const startedAt = Date.now();
  const withinBudget = () => Date.now() - startedAt < budgetMs;
  const results: Lead[] = [];
  const fallback = guessNicheAndCityFromQuery(query);

  const browser = await launchBrowser(headless);
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  // Map tiles and business photos are the bulk of what Maps downloads and
  // decodes, and every field scraped below comes from the DOM (aria-labels,
  // text) — never from a rendered image. Stylesheets are deliberately NOT
  // blocked: the detail-panel waitFor() below checks visibility, which needs
  // real layout to resolve.
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    return type === "image" || type === "media" || type === "font" ? route.abort() : route.continue();
  });
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

  while (results.length < limit && stagnantRounds < 5 && withinBudget()) {
    // Match on the stable /maps/place/ URL pattern rather than a specific div
    // nesting depth or class name — Google reshuffles those often enough
    // that a structural selector silently matches zero cards.
    const cards = await page.locator(`${feedSelector} a[href*="/maps/place/"]`).all();
    console.error(`scrape_maps: found ${cards.length} card(s) this round, ${results.length}/${limit} collected so far`);

    for (const card of cards) {
      if (results.length >= limit) break;
      if (!withinBudget()) break; // out of time this call — return what we have, resume next call
      const name = await card.getAttribute("aria-label").catch(() => null);
      if (!name) continue; // card had no aria-label — likely a photo/thumbnail link, not the name link
      if (seenNames.has(name)) continue;
      seenNames.add(name);

      // The open detail panel is a second role="main" whose accessible name
      // is the business name, so waiting for it proves *this* business's
      // panel is up — and scoping every read below to it is what stops the
      // page-wide locators from matching the results feed instead, which is
      // how every lead ended up with the first feed card's rating.
      const panel = page.getByRole("main", { name });
      try {
        await card.click();
        await panel.waitFor({ timeout: PANEL_TIMEOUT_MS });
      } catch {
        // Panel never opened — a slow instance, or Google throttling. Skip
        // rather than save a row with every field blank: nothing was learned
        // about this business, and leaving it unsaved means a later call
        // retries it, since excludeNames is seeded from saved leads only.
        continue;
      }
      await pause(400, 900);

      let phone = "";
      let website = "";
      let address = "";
      let category = "";
      let rating = "";

      try {
        const phoneEl = panel.locator('button[data-item-id^="phone:"]').first();
        if ((await phoneEl.count()) > 0) {
          phone = ((await phoneEl.getAttribute("aria-label")) || "").replace("Phone: ", "").trim();
        }
      } catch {}

      try {
        const siteEl = panel.locator('a[data-item-id="authority"]').first();
        if ((await siteEl.count()) > 0) website = (await siteEl.getAttribute("href")) || "";
      } catch {}

      try {
        const addressEl = panel.locator('button[data-item-id="address"]').first();
        if ((await addressEl.count()) > 0) {
          address = ((await addressEl.getAttribute("aria-label")) || "").replace("Address: ", "").trim();
        }
      } catch {}

      try {
        const categoryEl = panel.locator("button.DkEaL").first();
        if ((await categoryEl.count()) > 0) category = (await categoryEl.innerText()).trim();
      } catch {}

      try {
        // Bare number only ("4.7", "5"): the panel's label reads "4.7 stars",
        // with no review count on it unlike the feed card's.
        const ratingEl = panel.locator('span[role="img"][aria-label*="star"]').first();
        if ((await ratingEl.count()) > 0) {
          rating = ((await ratingEl.getAttribute("aria-label")) || "").match(/[\d.]+/)?.[0] ?? "";
        }
      } catch {}

      const lead: Lead = {
        ...emptyLead(),
        name,
        phone,
        rating,
        website,
        city: address || fallback.city,
        niche: category || fallback.niche,
      };
      results.push(lead);
      if (onLead) await onLead(lead);
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

  // Only treat it as "no more results exist" when scrolling genuinely
  // stopped loading new cards — not when we simply ran out of time budget,
  // which just means resume on the next call.
  const exhausted = stagnantRounds >= 5;

  await browser.close();
  return { leads: results.slice(0, limit), exhausted };
}
