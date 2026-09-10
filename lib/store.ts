// Leads store — the app's own Lead table in the shared Postgres DB (see
// prisma/schema.prisma and scripts/create-lead-table.sql). Strongly
// consistent, unlike the Vercel Blob approach this replaced: a write is
// visible to the very next read, no propagation lag.
import { prisma } from "./prisma.ts";
import type { Lead } from "./schema.ts";

// Prisma's `status` column is a plain string; narrow it to the TS union.
function fromRow(row: { id: string; createdAt: Date; status: string } & Omit<Lead, "status">): Lead {
  const { id, createdAt, ...lead } = row;
  return lead as Lead;
}

export async function readLeads(): Promise<Lead[]> {
  const rows = await prisma.lead.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(fromRow);
}

// Replaces the entire table's contents — used by the "clear local data" action.
//
// ponytail: not wrapped in a $transaction — batching N+1 dependent queries
// under one deadline was timing out (P2028) against Render's Postgres
// round-trip latency. Atomicity isn't load-bearing here (single-user tool,
// each row independent); a crash mid-write leaving a partial table is an
// acceptable ceiling, not one worth a slower/more complex fix for.
export async function writeLeads(leads: Lead[]): Promise<void> {
  await prisma.lead.deleteMany();
  for (const data of leads) {
    await prisma.lead.create({ data });
  }
}

// Save one lead without reading the table back — for the scrape loop's
// per-lead checkpoint, which discards the result anyway. upsertLeads' full
// readLeads() there meant a whole-table SELECT per business scraped.
export async function saveLead(lead: Lead): Promise<void> {
  await prisma.lead.upsert({
    where: { name_city: { name: lead.name, city: lead.city } },
    create: lead,
    update: lead,
  });
}

// Merge new/updated leads into the store, keyed by name+city.
export async function upsertLeads(updates: Lead[]): Promise<Lead[]> {
  for (const data of updates) {
    await prisma.lead.upsert({
      where: { name_city: { name: data.name, city: data.city } },
      create: data,
      update: data,
    });
  }
  return readLeads();
}
