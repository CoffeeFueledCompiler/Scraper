import { NextResponse } from "next/server";
import { scrapeGoogleMaps } from "@/lib/scrapeMaps";
import { upsertLeads } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { query, limit } = await req.json();
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  // headless: false — this runs on the user's own machine, so a visible
  // browser window lets them solve a CAPTCHA manually if Google shows one.
  const scraped = await scrapeGoogleMaps(query, limit ?? 20, false);
  const leads = await upsertLeads(scraped);
  return NextResponse.json({ scraped: scraped.length, leads });
}
