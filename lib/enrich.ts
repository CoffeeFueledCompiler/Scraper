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

export async function enrichWebsites(websites: string[], headless = true): Promise<string[]> {
  const browser = await launchBrowser(headless);
  const context = await browser.newContext();
  const emails: string[] = new Array(websites.length);
  for (let i = 0; i < websites.length; i += CONCURRENCY) {
    const chunk = websites.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((site) => findEmailOnSite(context, site)));
    results.forEach((email, j) => {
      emails[i + j] = email;
    });
    await pause();
  }
  await browser.close();
  return emails;
}
