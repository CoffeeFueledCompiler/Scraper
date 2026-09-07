const { execSync } = require("child_process");

execSync("prisma generate", { stdio: "inherit" });

// Playwright's ~300MB Chromium download is only needed for local dev — on
// Vercel we use @sparticuz/chromium instead (see lib/browser.ts), and this
// download would just slow down every build for nothing.
if (!process.env.VERCEL) {
  execSync("playwright install chromium", { stdio: "inherit" });
}
