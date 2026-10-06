// Google Maps business scraper — Stage 1.
// Automates a real Chromium browser against Google Maps' public UI. Google's
// ToS prohibit automated scraping of their services — keep usage light and
// occasional, not continuous/high-volume.
import { launchBrowser } from "./browser.ts";
import { dedupeKey, emptyLead } from "./schema.ts";
import type { Lead } from "./schema.ts";
import type { BrowserContext } from "playwright";

export function guessNicheAndCityFromQuery(query: string): { niche: string; city: string } {
  const match = query.match(/\bin\s+(.+)$/i);
  if (match) {
    return { niche: query.slice(0, match.index).trim(), city: match[1].trim() };
  }
  return { niche: query.trim(), city: "" };
}

const pause = (a = 800, b = 1800) => new Promise((r) => setTimeout(r, a + Math.random() * (b - a)));

// Each /api/scrape call stops after this and the frontend loops on
// `remaining` for the rest. A port-forwarding tunnel (sharing a local
// instance) cuts a request at ~100s, and the old 90s budget plus the listing
// still in flight plus browser teardown ran straight past that. Resuming is
// cheap now that phase 1 only scrolls (no clicks) to catch up.
const DEFAULT_BUDGET_MS = 60_000;

// How long to wait for a business's detail panel to render. 8s timed out on
// a slow machine, and each lead was saved with phone/website/address blank —
// which is what left the CSV export with nothing but headers.
const PANEL_TIMEOUT_MS = 15_000;

// Listings scraped in parallel, each in its own tab. 3 is comfortable on an
// 8GB laptop. Higher is faster but also looks more like a bot to Google.
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY) || 3;

const FEED = 'div[role="feed"]';
const CARD = `${FEED} a[href*="/maps/place/"]`;

type Candidate = { name: string; mapsUrl: string };

// Phase 1: scroll the results feed and collect listing links — no clicking.
// Scrolling is the cheap part of a scrape, so doing all of it up front means a
// resumed call catches up past already-saved businesses in seconds, and phase 2
// never has to find its place in the feed again.
async function collectCandidates(
  context: BrowserContext,
  query: string,
  limit: number,
  seen: Set<string>,
  withinBudget: () => boolean
): Promise<{ candidates: Candidate[]; exhausted: boolean }> {
  const page = await context.newPage();
  try {
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

    try {
      await page.waitForSelector(FEED, { timeout: 15000 });
    } catch {
      // Not "no more results" — a CAPTCHA, or a query that resolved straight to
      // one place. Returning not-exhausted lets the caller's no-progress guard
      // stop the loop instead of reporting the search as finished.
      console.error("scrape_maps: results feed never appeared — Google may be showing a CAPTCHA.");
      return { candidates: [], exhausted: false };
    }

    const candidates: Candidate[] = [];
    let stagnantRounds = 0;
    while (candidates.length < limit && withinBudget()) {
      // One round-trip for every card, instead of two getAttribute calls each.
      const cards = await page
        .locator(CARD)
        .evaluateAll((els) => els.map((a) => [a.getAttribute("aria-label"), a.getAttribute("href")]));

      for (const [name, href] of cards) {
        if (candidates.length >= limit) break;
        if (!name) continue; // photo/thumbnail link, not the name link
        const mapsUrl = href || "";
        const key = dedupeKey({ name, mapsUrl });
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ name, mapsUrl });
      }
      console.error(`scrape_maps: ${cards.length} card(s) in feed, ${candidates.length}/${limit} new queued`);
      if (candidates.length >= limit) break;

      if ((await page.getByText("reached the end of the list").count()) > 0) {
        return { candidates, exhausted: true };
      }

      // Wait for the feed to actually grow rather than sleeping a fixed time —
      // returns the moment new cards land, usually well under a second.
      await page.evaluate((sel) => {
        const feed = document.querySelector(sel);
        if (feed) feed.scrollTop = feed.scrollHeight;
      }, FEED);
      const grew = await page
        .waitForFunction(([sel, n]) => document.querySelectorAll(sel).length > n, [CARD, cards.length] as const, {
          timeout: 5000,
        })
        .then(
          () => true,
          () => false
        );
      stagnantRounds = grew ? 0 : stagnantRounds + 1;
      if (stagnantRounds >= 3) return { candidates, exhausted: true };
    }
    return { candidates, exhausted: false };
  } finally {
    await page.close().catch(() => {});
  }
}

// Phase 2: open one listing directly and read its detail panel. A fresh tab per
// listing, closed straight after, so memory can't build up over a run the way
// it did clicking through one long-lived Maps page — which is what the old
// every-10-leads browser recycle (and its re-scroll) was working around.
async function scrapePlace(
  context: BrowserContext,
  { name, mapsUrl }: Candidate,
  fallback: { niche: string; city: string }
): Promise<Lead | null> {
  const page = await context.newPage();
  try {
    await page.goto(new URL(mapsUrl, "https://www.google.com").toString(), {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });
    // The detail panel is a role="main" whose accessible name is the business
    // name. Waiting for it proves *this* business's panel is up, and scoping
    // every read to it keeps locators off anything else on the page — the
    // page-wide version is how every lead once got the same rating.
    const panel = page.getByRole("main", { name });
    try {
      await panel.waitFor({ timeout: PANEL_TIMEOUT_MS });
    } catch {
      // Panel never opened — a slow instance, or Google throttling. Skip rather
      // than save a row with every field blank; leaving it unsaved means a later
      // call retries it, since the exclude set is seeded from saved leads only.
      return null;
    }
    await pause(400, 900);

    let phone = "";
    let website = "";
    let address = "";
    let category = "";
    let rating = "";
    let reviews = "";

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

    try {
      // Sits beside the stars as "(17)" with aria-label "17 reviews". The
      // per-star breakdown rows say "5 stars, 2 reviews" too, but those are
      // <tr>s — matching only a span keeps them out. Commas stripped so the
      // column stays numeric in Sheets/Excel.
      const reviewsEl = panel.locator('span[aria-label*="review"]').first();
      if ((await reviewsEl.count()) > 0) {
        const label = ((await reviewsEl.getAttribute("aria-label")) || "").trim();
        reviews = label.match(/^([\d,]+)\s+reviews?$/i)?.[1].replace(/,/g, "") ?? "";
      }
    } catch {}

    return {
      ...emptyLead(),
      name,
      mapsUrl,
      phone,
      rating,
      reviews,
      website,
      city: address || fallback.city,
      niche: category || fallback.niche,
    };
  } catch {
    return null; // navigation failed — same as a panel timeout, retried next call
  } finally {
    await page.close().catch(() => {});
  }
}

export async function scrapeGoogleMaps(
  query: string,
  limit: number,
  headless = true,
  // Place IDs (see dedupeKey) of businesses already collected, so a re-scrape
  // skips them instead of re-opening the same listings.
  excludeKeys: Set<string> = new Set(),
  // Persisting each business as it's found means a mid-run stop — whether
  // from the time budget or a platform kill — loses at most the listings in
  // flight; the next call picks up from there via excludeKeys.
  onLead?: (lead: Lead) => Promise<void>,
  budgetMs: number = DEFAULT_BUDGET_MS
): Promise<{ leads: Lead[]; exhausted: boolean }> {
  const startedAt = Date.now();
  const withinBudget = () => Date.now() - startedAt < budgetMs;
  const fallback = guessNicheAndCityFromQuery(query);

  const browser = await launchBrowser(headless);
  try {
    const context = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
    // Map tiles and business photos are the bulk of what Maps downloads and
    // decodes, and every field scraped comes from the DOM (aria-labels, text) —
    // never from a rendered image. Stylesheets are deliberately NOT blocked:
    // the panel waitFor() checks visibility, which needs real layout.
    await context.route("**/*", (route) => {
      const type = route.request().resourceType();
      return type === "image" || type === "media" || type === "font" ? route.abort() : route.continue();
    });

    const { candidates, exhausted: feedExhausted } = await collectCandidates(
      context,
      query,
      limit,
      new Set(excludeKeys),
      withinBudget
    );

    const results: Lead[] = [];
    let next = 0;
    const worker = async () => {
      while (next < candidates.length && withinBudget()) {
        const lead = await scrapePlace(context, candidates[next++], fallback);
        if (!lead) continue;
        results.push(lead);
        console.error(`scrape_maps: ${results.length}/${candidates.length} scraped — ${lead.name}`);
        // A failed checkpoint isn't fatal: the route upserts every returned lead
        // again once scraping finishes.
        if (onLead) await onLead(lead).catch((err) => console.error(`scrape_maps: save failed for ${lead.name}:`, err));
        await pause(300, 800);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // "No more results exist" only when the feed itself ran out *and* every
    // listing it gave us was attempted — running out of time budget just means
    // resume on the next call.
    return { leads: results, exhausted: feedExhausted && next >= candidates.length };
  } finally {
    await browser.close();
  }
}
