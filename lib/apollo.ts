// Apollo.io lookup for Stage 2 — the alternative to scraping the business's
// own website (see lib/enrich.ts). Finds the most senior person Apollo knows at
// the business's domain and reveals their work email. Direct phone numbers
// Apollo only delivers asynchronously, POSTed to a webhook
// (app/api/apollo-webhook), so contactPhone lands on the lead a little later.
//
// Needs a paid Apollo plan: people search and reveal return 403 on Free.
import { createHmac } from "crypto";

const API = "https://api.apollo.io/api/v1";

// When Apollo lists several senior people, these titles are the ones who
// decide, so they go first — "Senior Vice President" loses to "Owner".
const DECISION_MAKER = /owner|founder|ceo|chief executive|president|principal|partner|broker/i;

// Apollo returns this placeholder instead of null when an email exists but
// wasn't revealed — it's an address shape, so it must never be saved.
const LOCKED_EMAIL = /email_not_unlocked/i;

export class ApolloError extends Error {}

export type ApolloContact = { name: string; title: string; email: string; phoneRequested: boolean };

// has_direct_phone comes back as "Yes" (a string); has_email as a boolean.
const isYes = (v: unknown) => v === true || /^yes$/i.test(String(v));

async function post(path: string, body: unknown): Promise<any> {
  const key = process.env.APOLLO_API?.trim();
  if (!key) throw new ApolloError("APOLLO_API is not set in .env.local");
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "x-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ApolloError(`Apollo ${path} failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export function domainOf(websiteUrl: string): string {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// A per-lead token for the webhook URL, so the (unauthenticated) webhook can't
// be used to write to arbitrary leads. Derived from NEXTAUTH_SECRET rather than
// the secret itself, since the URL passes through Apollo's systems.
export function webhookToken(leadKey: string): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "").update(`apollo-webhook:${leadKey}`).digest("hex");
}

// Pull the first phone number out of a webhook payload. Walks the whole body
// rather than trusting one exact path, so a person-vs-people wrapper change on
// Apollo's side doesn't silently drop every number.
export function firstPhone(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const node = payload as Record<string, unknown>;
  if (Array.isArray(node.phone_numbers)) {
    for (const p of node.phone_numbers as Record<string, unknown>[]) {
      const number = String(p?.sanitized_number || p?.raw_number || "");
      if (number) return number;
    }
  }
  for (const value of Object.values(node)) {
    const found = firstPhone(value);
    if (found) return found;
  }
  return "";
}

export async function findTopContact(websiteUrl: string, leadKey: string): Promise<ApolloContact | null> {
  const domain = domainOf(websiteUrl);
  if (!domain) return null;

  // Search is free of credits but returns no contact details — only whether
  // Apollo *has* an email/phone for each person.
  const { people = [] } = await post("mixed_people/api_search", {
    q_organization_domains_list: [domain],
    person_seniorities: ["owner", "founder", "c_suite", "partner", "vp", "head", "director"],
    per_page: 10,
  });
  // The reveal below costs credits, so never spend one on someone Apollo has
  // nothing for.
  const revealable = (people as any[]).filter((p) => p.has_email || isYes(p.has_direct_phone));
  if (revealable.length === 0) return null;
  const rank = (p: any) => (DECISION_MAKER.test(p.title ?? "") ? 0 : 2) + (p.has_email ? 0 : 1);
  const top = [...revealable].sort((a, b) => rank(a) - rank(b))[0];

  // Phone reveals need a public URL for Apollo to call back on. Without one,
  // still reveal the email rather than fail the lead.
  const base = process.env.PUBLIC_URL?.trim().replace(/\/$/, "");
  const phoneRequested = !!base && isYes(top.has_direct_phone);
  const { person } = await post("people/match", {
    id: top.id,
    ...(phoneRequested && {
      reveal_phone_number: true,
      webhook_url: `${base}/api/apollo-webhook?lead=${encodeURIComponent(leadKey)}&token=${webhookToken(leadKey)}`,
    }),
  });
  if (!person) return null;

  const email = person.email && !LOCKED_EMAIL.test(person.email) ? String(person.email) : "";
  const name = person.name || [person.first_name, person.last_name].filter(Boolean).join(" ");
  return { name, title: person.title ?? "", email, phoneRequested };
}
