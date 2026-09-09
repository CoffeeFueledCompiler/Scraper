import { NextResponse } from "next/server";
import { enrichWebsites } from "@/lib/enrich";
import { readLeads, upsertLeads } from "@/lib/store";
import { leadKey } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { limit, force, keys } = await req.json().catch(() => ({}));

  const leads = await readLeads();
  // `keys` scopes this run to a specific scrape batch (see /api/scrape's
  // scrapedKeys) instead of sweeping in every un-emailed lead ever saved.
  const scoped = Array.isArray(keys) ? leads.filter((l) => keys.includes(leadKey(l))) : leads;
  const fullTodo = force ? scoped : scoped.filter((l) => !l.email);
  const todo = fullTodo.slice(0, limit ?? undefined);

  const emails = await enrichWebsites(todo.map((l) => l.website));
  const updates = todo.map((l, i) => ({ ...l, email: emails[i] }));
  const merged = await upsertLeads(updates);

  return NextResponse.json({ enriched: updates.length, remaining: fullTodo.length - todo.length, leads: merged });
}
