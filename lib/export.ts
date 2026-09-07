// Pure row-assembly logic for Stage 5, split out from the routes so it's
// testable without spinning up a server. Shared by CSV export and Google
// Sheets export — both are just different ways to render the same rows.
import { FINAL_COLUMNS } from "./schema.ts";
import type { Lead } from "./schema.ts";

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildFinalRows(leads: Lead[]): { header: string[]; rows: string[][]; rejected: Lead[]; missingEmail: Lead[] } {
  const rejected = leads.filter((l) => !l.name || !l.phone);
  const kept = leads.filter((l) => l.name && l.phone);
  const missingEmail = kept.filter((l) => !l.email);

  const header = ["S. No", ...FINAL_COLUMNS.map((c) => c.header)];
  const rows = kept.map((lead, i) => [
    String(i + 1),
    ...FINAL_COLUMNS.map((c) => {
      const value = lead[c.field];
      // A leading apostrophe forces Sheets/Excel to treat the cell as text,
      // so a phone number like "+1 626-359-0204" doesn't get read as a formula.
      return c.field === "phone" && value ? `'${value}` : value;
    }),
  ]);

  return { header, rows, rejected, missingEmail };
}

export function buildFinalCsv(leads: Lead[]): { csv: string; rejected: Lead[]; missingEmail: Lead[] } {
  const { header, rows, rejected, missingEmail } = buildFinalRows(leads);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return { csv, rejected, missingEmail };
}
