const { execSync } = require("child_process");

// On an Apple Silicon Mac, an Intel build of Node runs under Rosetta
// translation — and then Playwright downloads the Intel Chromium too, so the
// whole scraper runs translated and noticeably slower. Easy to end up with
// (an old installer, a Homebrew under /usr/local), invisible otherwise.
if (process.platform === "darwin" && process.arch === "x64") {
  let translated = "0";
  try {
    translated = execSync("sysctl -n sysctl.proc_translated", { encoding: "utf8" }).trim();
  } catch {
    // key missing = a real Intel Mac, where x64 Node is correct
  }
  if (translated === "1") {
    console.warn(
      "\n⚠️  Node is the Intel (x64) build, running under Rosetta on an Apple Silicon Mac.\n" +
        "   Everything will work, but slower. Install the Apple Silicon Node from\n" +
        "   https://nodejs.org (or `brew install node` with Homebrew in /opt/homebrew),\n" +
        "   delete node_modules, and run `npm install` again. See MAC.md.\n"
    );
  }
}

execSync("prisma generate", { stdio: "inherit" });
// The Chromium build the scraper drives (see lib/browser.ts) — downloaded per
// machine, so it matches this OS and CPU.
execSync("playwright install chromium", { stdio: "inherit" });
