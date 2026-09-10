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
  // --disable-dev-shm-usage: a container's /dev/shm is 64MB by default, and
  // once Chromium outgrows it it falls back to disk-backed shared memory,
  // which thrashes hard on a small instance. --disable-gpu: headless has no
  // GPU to use anyway, this skips the failed-init path.
  return chromium.launch({ headless, args: ["--disable-dev-shm-usage", "--disable-gpu"] });
}
