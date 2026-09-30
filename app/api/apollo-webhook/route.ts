import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { firstPhone, webhookToken } from "@/lib/apollo";
import { setContactPhone } from "@/lib/store";

export const runtime = "nodejs";

// Apollo POSTs revealed phone numbers here, some time after /api/enrich asked
// for them (see lib/apollo.ts). It can't log in, so middleware.ts lets this
// path through — the per-lead HMAC token in the URL is what authorizes it.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const lead = url.searchParams.get("lead") ?? "";
  const token = Buffer.from(url.searchParams.get("token") ?? "");
  const expected = Buffer.from(webhookToken(lead));
  if (!lead || token.length !== expected.length || !timingSafeEqual(token, expected)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const phone = firstPhone(payload);
  if (!phone) {
    // Logged whole so a payload shape firstPhone doesn't recognize is visible.
    console.log(`apollo-webhook: no phone for ${lead}: ${JSON.stringify(payload).slice(0, 2000)}`);
    return NextResponse.json({ ok: true, saved: false });
  }

  const split = lead.indexOf("::"); // leadKey is `${name}::${city}`
  const saved = await setContactPhone(lead.slice(0, split), lead.slice(split + 2), phone);
  console.log(`apollo-webhook: ${lead} -> ${phone} (${saved ? "saved" : "lead no longer exists"})`);
  return NextResponse.json({ ok: true, saved: saved > 0 });
}
