import { NextResponse } from "next/server";
import { enrichWebsites } from "@/lib/enrich";
import { readLeads, upsertLeads } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { limit, force } = await req.json().catch(() => ({}));

  const leads = await readLeads();
  const fullTodo = force ? leads : leads.filter((l) => !l.email);
  const todo = fullTodo.slice(0, limit ?? undefined);

  const emails = await enrichWebsites(todo.map((l) => l.website));
  const updates = todo.map((l, i) => ({ ...l, email: emails[i] }));
  const merged = await upsertLeads(updates);

  return NextResponse.json({ enriched: updates.length, remaining: fullTodo.length - todo.length, leads: merged });
}
