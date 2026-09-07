import { NextResponse } from "next/server";
import { readLeads } from "@/lib/store";
import { buildFinalCsv } from "@/lib/export";

export async function GET() {
  const leads = await readLeads();
  const { csv, rejected, missingEmail } = buildFinalCsv(leads);

  for (const r of rejected) {
    console.log(`Rejected row missing Business Name or Phone Number: ${JSON.stringify(r)}`);
  }
  for (const l of missingEmail) {
    console.log(`Missing Email Address for: ${l.name}`);
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="final_output.csv"',
    },
  });
}
