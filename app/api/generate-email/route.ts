import { NextResponse } from "next/server";
import { AIClient } from "@/lib/aiClient";
import { GENERATE_EMAIL_SYSTEM_PROMPT, generateEmailUserPrompt } from "@/lib/prompts";
import { readLeads, upsertLeads } from "@/lib/store";
import { Lead, leadKey } from "@/lib/schema";

export const runtime = "nodejs";
// Vercel Hobby hard-kills any function at 60s regardless of this value —
// declaring the real cap here instead of a number the plan can't honor.
// Safe as-is: leads are drafted fully concurrently (Promise.all below), so
// wall time tracks the slowest single AI call, not the batch size.
export const maxDuration = 60;

async function generateForLead(client: AIClient, lead: Lead): Promise<Lead> {
  if (lead.status === "NEEDS_REVIEW" || !lead.observation) {
    return { ...lead, subject: "", generatedEmail: "" };
  }

  const userPrompt = generateEmailUserPrompt(lead.name, lead.observation, lead.impact, lead.solution);
  const requiredKeys = ["subject", "generated_email"];
  let data = await client.generateJson<{ subject: string; generated_email: string }>(
    GENERATE_EMAIL_SYSTEM_PROMPT,
    userPrompt,
    requiredKeys
  );
  if (!data) {
    data = await client.generateJson(GENERATE_EMAIL_SYSTEM_PROMPT, userPrompt, requiredKeys);
  }

  if (!data) {
    return { ...lead, subject: "", generatedEmail: "", status: "NEEDS_REVIEW" };
  }
  return { ...lead, subject: data.subject, generatedEmail: data.generated_email };
}

export async function POST(req: Request) {
  const { batchSize, keys } = await req.json().catch(() => ({ batchSize: 10 }));

  const leads = await readLeads();
  // `keys` scopes this run to a specific scrape batch (see /api/scrape's
  // scrapedKeys) instead of sweeping in every un-drafted lead ever saved.
  const scoped = Array.isArray(keys) ? leads.filter((l) => keys.includes(leadKey(l))) : leads;
  const fullTodo = scoped.filter((l) => l.observation && !l.subject);
  const batch = fullTodo.slice(0, batchSize ?? 10);

  const client = new AIClient();
  const results = await Promise.all(batch.map((lead) => generateForLead(client, lead)));
  const merged = await upsertLeads(results);

  return NextResponse.json({
    generated: results.length,
    remaining: fullTodo.length - batch.length,
    usage: client.usage(),
    leads: merged,
  });
}
