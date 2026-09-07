import { NextResponse } from "next/server";
import { AIClient } from "@/lib/aiClient";
import { ANALYZE_SYSTEM_PROMPT, analyzeUserPrompt, NO_WEBSITE_OBSERVATION } from "@/lib/prompts";
import { readLeads, upsertLeads } from "@/lib/store";
import { Lead } from "@/lib/schema";
import { fetchWebsiteText } from "@/lib/webtext";

export const runtime = "nodejs";
export const maxDuration = 300;

const COST_WARNING_THRESHOLD = 50;

async function analyzeLead(client: AIClient, lead: Lead): Promise<Lead> {
  const websiteText = await fetchWebsiteText(lead.website);
  if (!websiteText) {
    return { ...lead, observation: NO_WEBSITE_OBSERVATION, impact: "", solution: "", status: "ok" };
  }

  const userPrompt = analyzeUserPrompt(lead.name, lead.niche, websiteText);
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
  const { batchSize } = await req.json().catch(() => ({ batchSize: 10 }));

  const leads = await readLeads();
  const fullTodo = leads.filter((l) => !l.observation);
  const batch = fullTodo.slice(0, batchSize ?? 10);

  const nCalls = batch.filter((l) => l.website).length;
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
