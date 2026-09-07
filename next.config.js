/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
};

module.exports = nextConfig;
