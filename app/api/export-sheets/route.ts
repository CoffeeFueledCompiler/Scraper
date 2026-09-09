import { NextResponse } from "next/server";
import { readLeads } from "@/lib/store";
import { buildFinalRows } from "@/lib/export";
import { writeSheetRows } from "@/lib/googleSheets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json({ error: "GOOGLE_SHEET_ID is not set in .env.local" }, { status: 400 });
  }
  const sheetName = process.env.GOOGLE_SHEET_NAME || "Sheet1";

  const leads = await readLeads();
  const { header, rows, rejected, missingEmail } = buildFinalRows(leads);

  for (const r of rejected) {
    console.log(`Rejected row missing Business Name or Phone Number: ${JSON.stringify(r)}`);
  }
  for (const l of missingEmail) {
    console.log(`Missing Email Address for: ${l.name}`);
  }

  try {
    await writeSheetRows(spreadsheetId, sheetName, header, rows);
  } catch (err) {
    console.error(`export-sheets failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  return NextResponse.json({
    exported: rows.length,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  });
}
