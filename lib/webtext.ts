// Lightweight text-only fetch of a webpage, for feeding AI prompts.

// A bare "Mozilla/5.0" with no supporting headers reads as a bot and gets
// challenged by Cloudflare and friends, even though the same page loads fine
// in a real browser. A full, realistic header set clears most naive checks.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
};

// Pages that are a bot wall rather than the business's site. Passing one to the
// model produced outreach telling a real prospect their site was "blocked by
// Cloudflare" when it loads perfectly in a browser — the block was ours, not
// theirs. No evidence is far safer than false evidence, so these read as
// "couldn't fetch it" and the caller declines to analyze.
const BLOCK_MARKERS = [
  /just a moment/i,
  /checking your browser/i,
  /enable javascript and cookies to continue/i,
  /attention required.{0,20}cloudflare/i,
  /cf-browser-verification|cf_chl_|__cf_chl/i,
  /verify you are human/i,
  /are you a robot/i,
  /access denied/i,
  /request blocked/i,
  /ddos protection by/i,
];

// A JS-only shell returns almost no server-side text. That isn't a block, but
// it's just as useless as evidence: judging a single-page app on its empty HTML
// would have the model reporting "no services listed" about a site that lists
// plenty. Below this, treat the page as unread.
const MIN_USABLE_CHARS = 200;

export function looksUnusable(text: string): boolean {
  if (text.length < MIN_USABLE_CHARS) return true;
  // Only the top of the page — "access denied" can appear innocently in body
  // copy further down.
  return BLOCK_MARKERS.some((re) => re.test(text.slice(0, 2000)));
}

// Returns "" when the page could not be read — blocked, errored, or empty.
// Callers must not take that to mean the business has no website.
export async function fetchWebsiteText(url: string, maxChars = 4000): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    // On 403/503 the body is the block page itself, never the site.
    if (!res.ok) return "";
    // Cap before the regex passes below — they're the expensive part, and a
    // multi-MB page would otherwise get four full scans just to keep 4000
    // chars of it. analyze runs a whole batch of these concurrently.
    const html = (await res.text()).slice(0, 200_000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return looksUnusable(text) ? "" : text.slice(0, maxChars);
  } catch {
    return "";
  }
}
