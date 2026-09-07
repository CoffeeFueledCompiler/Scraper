/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
  // serverExternalPackages keeps the bundler from rewriting @sparticuz/chromium's
  // code, but Vercel's separate output-file-tracing step still needs to be
  // told to actually copy its binary (bin/**) into the deployed function —
  // without this it builds fine locally and then 500s in production with
  // "input directory .../bin does not exist".
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

module.exports = nextConfig;
