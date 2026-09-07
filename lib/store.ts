// Single-file JSON store for leads. This is a local single-user tool — a JSON
// file is enough; add a real DB only if concurrent multi-user access matters.
import { promises as fs } from "fs";
import path from "path";
import { Lead, leadKey } from "./schema.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "leads.json");

export async function readLeads(): Promise<Lead[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function writeLeads(leads: Lead[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(leads, null, 2), "utf-8");
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
