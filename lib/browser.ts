// Local dev (your desktop): the regular `playwright` package, with its own
// downloaded Chromium, works fine and can run non-headless so you can solve
// a CAPTCHA by hand.
//
// On Vercel: there's no persistent disk for playwright's ~300MB downloaded
// browser and no display for a non-headless window, so this uses
// playwright-core (no bundled browser) plus @sparticuz/chromium — a
// Chromium build made specifically for serverless functions — and always
// runs headless, since there's no one to click through a CAPTCHA anyway.
import type { Browser } from "playwright-core";

// Tuned for a 512MB container, where Chromium plus the Next.js server is a
// tight fit and overrunning gets the whole instance OOM-killed and restarted.
const LOW_MEMORY_ARGS = [
  // A container's /dev/shm is 64MB by default; once Chromium outgrows it it
  // falls back to disk-backed shared memory and thrashes.
  "--disable-dev-shm-usage",
  // Headless has no GPU to use anyway — skips the failed-init path.
  "--disable-gpu",
  // Reuse one renderer instead of spawning a process per site. Site isolation
  // stays on, so this trades some crash isolation, not a security boundary.
  "--renderer-process-limit=1",
  // Chrome services we never use but that hold memory for the whole session.
  "--disable-background-networking",
  "--disable-extensions",
  "--disable-default-apps",
  "--disable-sync",
  "--mute-audio",
  "--no-first-run",
];

export async function launchBrowser(headless: boolean): Promise<Browser> {
  if (process.env.VERCEL) {
    const { chromium } = await import("playwright-core");
    const sparticuzChromium = (await import("@sparticuz/chromium")).default;
    return chromium.launch({
      args: sparticuzChromium.args,
      executablePath: await sparticuzChromium.executablePath(),
      headless: true,
    });
  }
  const { chromium } = await import("playwright");
  return chromium.launch({ headless, args: LOW_MEMORY_ARGS });
}
