// Leads store, backed by Vercel Blob — a serverless function's local disk is
// ephemeral and not shared across instances, so a plain JSON file (the old
// approach) doesn't survive between requests once deployed.
//
// Needs a BLOB_READ_WRITE_TOKEN env var — from the Vercel dashboard's
// Storage tab (create a Blob store, copy its token), works from local dev
// too, not just when actually running on Vercel.
//
// ponytail: every write creates a new blob rather than overwriting in place
// (avoids depending on @vercel/blob's overwrite semantics matching what this
// was written against) — old versions pile up in the store. Fine at personal
// scale; add a cleanup pass (delete all but the newest per prefix) if the
// blob list ever gets large enough to slow reads down.
import { put, list } from "@vercel/blob";
import { Lead, leadKey } from "./schema.ts";

const PATHNAME_PREFIX = "leads.json";

export async function readLeads(): Promise<Lead[]> {
  const { blobs } = await list({ prefix: PATHNAME_PREFIX });
  if (blobs.length === 0) return [];
  const latest = blobs.reduce((a, b) => (new Date(a.uploadedAt) > new Date(b.uploadedAt) ? a : b));
  // A private-store blob URL isn't fetchable on its own — it needs the same
  // token as an Authorization header.
  const res = await fetch(latest.url, { headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } });
  return res.json();
}

export async function writeLeads(leads: Lead[]): Promise<void> {
  await put(PATHNAME_PREFIX, JSON.stringify(leads), { access: "private", contentType: "application/json" });
}

// Merge new/updated leads into the store, keyed by name+city.
export async function upsertLeads(updates: Lead[]): Promise<Lead[]> {
  const leads = await readLeads();
  const byKey = new Map(leads.map((l) => [leadKey(l), l]));
  for (const u of updates) {
    byKey.set(leadKey(u), { ...byKey.get(leadKey(u)), ...u });
  }
  const merged = Array.from(byKey.values());
  await writeLeads(merged);
  return merged;
}
