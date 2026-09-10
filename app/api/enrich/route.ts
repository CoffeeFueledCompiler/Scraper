import { NextResponse } from "next/server";
import { enrichWebsites } from "@/lib/enrich";
import { readLeads, upsertLeads } from "@/lib/store";
import { leadKey } from "@/lib/schema";

export const runtime = "nodejs";
// Vercel Hobby hard-kills any function at 60s regardless of this value —
// declaring the real cap here instead of a number the plan can't honor.
export const maxDuration = 60;

export async function POST(req: Request) {
  const { limit, force, keys } = await req.json().catch(() => ({}));

  const leads = await readLeads();
  // `keys` scopes this run to a specific scrape batch (see /api/scrape's
  // scrapedKeys) instead of sweeping in every un-emailed lead ever saved.
  const scoped = Array.isArray(keys) ? leads.filter((l) => keys.includes(leadKey(l))) : leads;
  const fullTodo = force ? scoped : scoped.filter((l) => !l.email);
  const todo = fullTodo.slice(0, limit ?? undefined);

  // enrichWebsites may return fewer than todo.length if it ran out of its
  // own time budget — only the ones it actually got to count as processed,
  // the rest fall through to `remaining` for the next call.
  const emails = await enrichWebsites(todo.map((l) => l.website));
  const processed = todo.slice(0, emails.length);
  const updates = processed.map((l, i) => ({ ...l, email: emails[i] }));
  const merged = await upsertLeads(updates);

  return NextResponse.json({ enriched: updates.length, remaining: fullTodo.length - processed.length, leads: merged });
}
