const { execSync } = require("child_process");

execSync("prisma generate", { stdio: "inherit" });
// The Chromium build the scraper drives (see lib/browser.ts) — downloaded per
// machine, so it matches this OS and CPU.
execSync("playwright install chromium", { stdio: "inherit" });
