import { NextResponse } from "next/server";
import { enrichWebsites } from "@/lib/enrich";
import { findTopContact } from "@/lib/apollo";
import { readLeads, upsertLeads } from "@/lib/store";
import { Lead, leadKey } from "@/lib/schema";

export const runtime = "nodejs";
// Vercel Hobby hard-kills any function at 60s regardless of this value —
// declaring the real cap here instead of a number the plan can't honor.
export const maxDuration = 60;

// Apollo misses fall back to the website search, which has to fit in what's
// left of a request after the Apollo calls — well inside a tunnel's ~100s.
const FALLBACK_BUDGET_MS = 40_000;

export async function POST(req: Request) {
  const { limit, force, keys, skip, source } = await req.json().catch(() => ({}));

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

  if (source === "apollo") return enrichWithApollo(todo, fullTodo.length);

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

async function enrichWithApollo(todo: Lead[], todoTotal: number) {
  const updates: Lead[] = [];
  let phonesRequested = 0;
  try {
    // Sequential: a batch is ~10 leads at a second or two each, and Apollo
    // rate-limits per minute — concurrency would buy little and risk 429s.
    for (const lead of todo) {
      const contact = await findTopContact(lead.website, leadKey(lead));
      if (contact?.phoneRequested) phonesRequested++;
      updates.push({
        ...lead,
        email: contact?.email ?? "",
        contactName: contact?.name ?? "",
        contactTitle: contact?.title ?? "",
      });
    }
  } catch (err) {
    // A bad key, a plan without API access, or a rate limit — every later
    // call would fail the same way, so stop and say so. Keep what worked.
    const merged = await upsertLeads(updates);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), leads: merged },
      { status: 502 }
    );
  }

  // Apollo has nobody for a lot of small businesses; the website search costs
  // no credits, so try it for those rather than leave them empty.
  const misses = updates.filter((u) => !u.email);
  const found = await enrichWebsites(misses.map((u) => u.website), true, FALLBACK_BUDGET_MS);
  found.forEach((email, i) => (misses[i].email = email));

  const merged = await upsertLeads(updates);
  return NextResponse.json({
    enriched: updates.length,
    apollo: {
      contacts: updates.filter((u) => u.contactName).length,
      emails: updates.length - misses.length,
      websiteFallbackEmails: found.filter(Boolean).length,
      phonesRequested,
      ...(!process.env.PUBLIC_URL && {
        note: "PUBLIC_URL is not set, so no phone numbers were requested — Apollo needs a public URL to deliver them to.",
      }),
    },
    attemptedKeys: todo.map(leadKey),
    remaining: todoTotal - todo.length,
    leads: merged,
  });
}
