// Lightweight text-only fetch of a webpage, for feeding AI prompts.
export async function fetchWebsiteText(url: string, maxChars = 4000): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
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
    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}
