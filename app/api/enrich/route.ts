import { NextResponse } from "next/server";
import { enrichWebsites } from "@/lib/enrich";
import { readLeads, upsertLeads } from "@/lib/store";
import { leadKey } from "@/lib/schema";

export const runtime = "nodejs";
// Vercel Hobby hard-kills any function at 60s regardless of this value —
// declaring the real cap here instead of a number the plan can't honor.
export const maxDuration = 60;

export async function POST(req: Request) {
  const { limit, force, keys, skip } = await req.json().catch(() => ({}));

  const leads = await readLeads();
  // `keys` scopes this run to a specific scrape batch (see /api/scrape's
  // scrapedKeys) instead of sweeping in every un-emailed lead ever saved.
  const scoped = Array.isArray(keys) ? leads.filter((l) => keys.includes(leadKey(l))) : leads;
  // `skip` is every lead this run already tried (the frontend accumulates
  // attemptedKeys). A site with no email still has email "" afterwards, so
  // without this those failures stayed at the head of the list and were
  // re-tried every call — the batch filled up with them, found nothing, the
  // no-progress guard stopped the stage, and leads further down were never
  // visited at all. No website means nothing to search, so those are out too.
  const skipped = new Set(Array.isArray(skip) ? skip : []);
  const fullTodo = scoped.filter((l) => l.website && (force || !l.email) && !skipped.has(leadKey(l)));
  const todo = fullTodo.slice(0, limit ?? undefined);

  // enrichWebsites may return fewer than todo.length if it ran out of its
  // own time budget — only the ones it actually got to count as processed,
  // the rest fall through to `remaining` for the next call.
  const emails = await enrichWebsites(todo.map((l) => l.website));
  const processed = todo.slice(0, emails.length);
  const updates = processed.map((l, i) => ({ ...l, email: emails[i] }));
  const merged = await upsertLeads(updates);

  return NextResponse.json({
    enriched: updates.length,
    attemptedKeys: processed.map(leadKey),
    remaining: fullTodo.length - processed.length,
    leads: merged,
  });
}
