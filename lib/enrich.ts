// Email enrichment — Stage 2. Visits each business's website looking for a
// published email address.
import { launchBrowser } from "./browser.ts";
import type { BrowserContext } from "playwright-core";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const GENERIC_PREFIXES = ["info@", "contact@", "admin@", "office@", "support@"];

const pause = (a = 1000, b = 2000) => new Promise((r) => setTimeout(r, a + Math.random() * (b - a)));

export function pickBestEmail(found: Set<string>): string {
  if (found.size === 0) return "";
  const nonGeneric = [...found].filter((e) => !GENERIC_PREFIXES.some((p) => e.toLowerCase().startsWith(p)));
  const pool = nonGeneric.length > 0 ? nonGeneric : [...found];
  return pool.sort()[0];
}

async function findEmailOnSite(context: BrowserContext, websiteUrl: string, timeoutMs = 15000): Promise<string> {
  if (!websiteUrl) return "";

  const page = await context.newPage();
  const found = new Set<string>();
  try {
    await page.goto(websiteUrl, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
    const html = await page.content();
    for (const m of html.matchAll(EMAIL_RE)) found.add(m[0]);

    if (found.size === 0) {
      const contactHref = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"));
        const match = links.find(
          (a) => /contact/i.test(a.textContent || "") || /contact/i.test(a.getAttribute("href") || "")
        );
        return match ? match.getAttribute("href") : null;
      });
      if (contactHref) {
        const contactUrl = new URL(contactHref, websiteUrl).toString();
        await page.goto(contactUrl, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
        const html2 = await page.content();
        for (const m of html2.matchAll(EMAIL_RE)) found.add(m[0]);
      }
    }
  } catch {
    // best-effort — leave found as-is
  } finally {
    await page.close();
  }

  return pickBestEmail(found);
}

// ponytail: fixed concurrency of 4, not tuned/configurable — good enough to
// cut wall time ~4x on a single shared browser context without risking
// overwhelming a single site's server. Revisit if batches grow much larger.
const CONCURRENCY = 4;

// Vercel Hobby hard-kills a function at 60s regardless of maxDuration — a
// large batchSize could otherwise run chunk after chunk past that wall. This
// budgets the loop so it always returns early with whatever's done; the
// caller (see /api/enrich) treats the shorter result as "processed so far"
// and the rest as still `remaining`, same idea as scrapeMaps.ts's budget.
// Hosts with no function cap get a longer budget for the same reason as
// there: each resumed call pays for a fresh browser launch.
const DEFAULT_BUDGET_MS = process.env.VERCEL ? 30_000 : 90_000;

export async function enrichWebsites(
  websites: string[],
  headless = true,
  budgetMs: number = DEFAULT_BUDGET_MS
): Promise<string[]> {
  const startedAt = Date.now();
  const browser = await launchBrowser(headless);
  const context = await browser.newContext();
  // Only raw HTML matters here (regex over page.content(), plus textContent /
  // getAttribute), so anything that exists purely to render the page is dead
  // weight — stylesheets included, unlike the Maps scraper.
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    return type === "image" || type === "media" || type === "font" || type === "stylesheet"
      ? route.abort()
      : route.continue();
  });
  const emails: string[] = [];
  for (let i = 0; i < websites.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > budgetMs) break; // out of time this call — resume next call
    const chunk = websites.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((site) => findEmailOnSite(context, site)));
    emails.push(...results);
    await pause();
  }
  await browser.close();
  return emails;
}
