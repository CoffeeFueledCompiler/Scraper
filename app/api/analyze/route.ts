import { NextResponse } from "next/server";
import { AIClient } from "@/lib/aiClient";
import { ANALYZE_SYSTEM_PROMPT, analyzeUserPrompt, noWebsiteUserPrompt } from "@/lib/prompts";
import { readLeads, upsertLeads } from "@/lib/store";
import { Lead, leadKey } from "@/lib/schema";
import { fetchWebsiteText } from "@/lib/webtext";

export const runtime = "nodejs";
// Vercel Hobby hard-kills any function at 60s regardless of this value —
// declaring the real cap here instead of a number the plan can't honor.
// Safe as-is: leads are analyzed fully concurrently (Promise.all below), so
// wall time tracks the slowest single AI call, not the batch size.
export const maxDuration = 60;

const COST_WARNING_THRESHOLD = 50;

async function analyzeLead(client: AIClient, lead: Lead): Promise<Lead> {
  const websiteText = await fetchWebsiteText(lead.website);
  // No website is this app's highest-value lead type (a Tier 1 "missing
  // revenue path" by definition) — still runs through the AI, just off
  // Google profile fields instead of website text, so it gets a real
  // observation/impact/solution instead of a blank placeholder.
  const userPrompt = websiteText
    ? analyzeUserPrompt(lead.name, lead.niche, lead.rating, websiteText)
    : noWebsiteUserPrompt(lead.name, lead.niche, lead.city, lead.rating, lead.phone);
  const requiredKeys = ["observation", "impact", "solution"];
  let data = await client.generateJson<{ observation: string; impact: string; solution: string }>(
    ANALYZE_SYSTEM_PROMPT,
    userPrompt,
    requiredKeys
  );
  if (!data) {
    data = await client.generateJson(ANALYZE_SYSTEM_PROMPT, userPrompt, requiredKeys); // one retry
  }

  if (!data) {
    return { ...lead, observation: "", impact: "", solution: "", status: "NEEDS_REVIEW" };
  }
  return { ...lead, observation: data.observation, impact: data.impact, solution: data.solution, status: "ok" };
}

export async function POST(req: Request) {
  const { batchSize, keys } = await req.json().catch(() => ({ batchSize: 10 }));

  const leads = await readLeads();
  // `keys` scopes this run to a specific scrape batch (see /api/scrape's
  // scrapedKeys) instead of sweeping in every unanalyzed lead ever saved.
  const scoped = Array.isArray(keys) ? leads.filter((l) => keys.includes(leadKey(l))) : leads;
  const fullTodo = scoped.filter((l) => !l.observation);
  const batch = fullTodo.slice(0, batchSize ?? 10);

  // Every lead now makes an AI call, website or not (see analyzeLead).
  const nCalls = batch.length;
  const warning = nCalls > COST_WARNING_THRESHOLD ? `This run makes ~${nCalls} AI calls.` : null;

  const client = new AIClient();
  const results = await Promise.all(batch.map((lead) => analyzeLead(client, lead)));
  const merged = await upsertLeads(results);

  return NextResponse.json({
    analyzed: results.length,
    remaining: fullTodo.length - batch.length,
    usage: client.usage(),
    warning,
    leads: merged,
  });
}
