// Launches Playwright's own Chromium (downloaded by `npm install`, see
// scripts/postinstall.js). In `npm run dev` the window is visible, so a
// Google CAPTCHA can be solved by hand; `npm start` runs it headless.
import type { Browser } from "playwright";

const ARGS = [
  // Chrome services we never use but that hold memory for the whole session.
  "--disable-background-networking",
  "--disable-extensions",
  "--disable-default-apps",
  "--disable-sync",
  "--mute-audio",
  "--no-first-run",
  // Deliberately no --renderer-process-limit: a renderer runs all its tabs' JS
  // on one thread, so sharing one made scrapeMaps.ts's parallel tabs take
  // turns — a renderer per tab scraped the same 8 listings in 6.8s vs 12-13s.
];

export async function launchBrowser(headless: boolean): Promise<Browser> {
  const { chromium } = await import("playwright");
  return chromium.launch({ headless, args: ARGS });
}
