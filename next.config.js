/** @type {import('next').NextConfig} */
const nextConfig = {
  // Run Playwright from node_modules as-is; the bundler can't package a
  // browser driver.
  serverExternalPackages: ["playwright", "playwright-core"],
};

module.exports = nextConfig;
