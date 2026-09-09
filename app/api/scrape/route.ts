import { NextResponse } from "next/server";
import { scrapeGoogleMaps } from "@/lib/scrapeMaps";
import { readLeads, upsertLeads } from "@/lib/store";
import { leadKey } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { query, limit } = await req.json();
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

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
  const scraped = await scrapeGoogleMaps(query, limit ?? 20, headless, alreadyKnown);
  const leads = await upsertLeads(scraped);
  // The exact set of leads this call scraped, so the pipeline's later stages
  // can be scoped to just this run instead of sweeping in the whole backlog.
  const scrapedKeys = scraped.map(leadKey);
  return NextResponse.json({ scraped: scraped.length, scrapedKeys, leads });
}
