import { NextResponse } from "next/server";
import { scrapeGoogleMaps } from "@/lib/scrapeMaps";
import { readLeads, upsertLeads } from "@/lib/store";

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

  // headless: false — this runs on the user's own machine, so a visible
  // browser window lets them solve a CAPTCHA manually if Google shows one.
  // (On Vercel this is forced to true regardless — see lib/browser.ts.)
  const scraped = await scrapeGoogleMaps(query, limit ?? 20, false, alreadyKnown);
  const leads = await upsertLeads(scraped);
  return NextResponse.json({ scraped: scraped.length, leads });
}
