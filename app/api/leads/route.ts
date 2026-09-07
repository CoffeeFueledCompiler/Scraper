import { NextResponse } from "next/server";
import { readLeads, writeLeads } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await readLeads());
}

export async function DELETE() {
  await writeLeads([]);
  return NextResponse.json([]);
}
