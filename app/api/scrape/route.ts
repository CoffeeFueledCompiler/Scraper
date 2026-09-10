import { NextResponse } from "next/server";
import { scrapeGoogleMaps } from "@/lib/scrapeMaps";
import { readLeads, upsertLeads } from "@/lib/store";
import { leadKey } from "@/lib/schema";

export const runtime = "nodejs";
// Vercel Hobby hard-kills any function at 60s regardless of this value —
// declaring the real cap here instead of a number the plan can't honor.
export const maxDuration = 60;

export async function POST(req: Request) {
  const { query, limit } = await req.json();
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  const target = limit ?? 20;

  // Skip businesses already saved so re-clicking Scrape with the same query
  // picks up new results instead of re-fetching the same first N — needed on
  // Vercel Hobby's 60s function cap, where one call often can't finish a
  // large limit and building it up across several clicks is the workaround.
  const alreadyKnown = new Set((await readLeads()).map((l) => l.name));

  // Only run non-headless in local dev, where there's a real display to
  // solve a CAPTCHA on by hand. Any deployed host (Render, Vercel, ...) has
  // no display — headless:false there just crashes trying to open a window.
  // (Vercel forces headless regardless — see lib/browser.ts — but Render and
  // other persistent-server hosts go through the same "headless" flag here.)
  const headless = process.env.NODE_ENV === "production";
  // Save each business as it's found, not just once scraping finishes — a
  // business can take ~30s, so even a modest limit can outrun the scraping
  // loop's own time budget (see scrapeMaps.ts), and without this, a mid-run
  // stop would discard everything scraped so far instead of just the one
  // business in flight.
  const { leads: scraped, exhausted } = await scrapeGoogleMaps(query, target, headless, alreadyKnown, (lead) =>
    upsertLeads([lead]).then(() => undefined)
  );
  const leads = await upsertLeads(scraped);
  // The exact set of leads this call scraped, so the pipeline's later stages
  // can be scoped to just this run instead of sweeping in the whole backlog.
  const scrapedKeys = scraped.map(leadKey);
  // Exhausted (scrolling stopped surfacing new cards) means asking again
  // won't find more — otherwise report what's still short of the target so
  // the frontend's loop can re-request exactly that many.
  const remaining = exhausted ? 0 : Math.max(0, target - scraped.length);
  return NextResponse.json({ scraped: scraped.length, scrapedKeys, remaining, leads });
}
