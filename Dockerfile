FROM node:22-bookworm-slim

WORKDIR /app

COPY . .
RUN npm ci

# npm ci's postinstall (scripts/postinstall.js) already ran `prisma generate`
# and downloaded the Chromium browser build; this adds the OS-level shared
# libraries (libnss3, libatk-bridge, etc.) Chromium needs to actually launch,
# which the browser download alone doesn't install and Render's native
# runtime has no apt access to add.
RUN npx playwright install-deps chromium

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
