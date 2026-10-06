# The Clientist Outreach Generator

Turns a Google Maps search (`"roofers in San Diego"`) into a list of local
businesses with their phone, website, email, an AI-written observation about
their web presence, and a drafted cold email. Runs on your own computer.

> **On a Mac?** Use the `mac` branch (`git checkout mac`) — same app, plus
> Mac-specific setup. Its README picks up where this one leaves off.

## What you need

- **Node.js 22 or newer** — https://nodejs.org (the LTS installer is fine)
- **Git**
- **The `.env.local` file** — get a copy from your partner. It holds the
  database login and API keys, so it is never committed to git.

## First-time setup

```bash
git clone https://github.com/CoffeeFueledCompiler/Scraper.git
cd Scraper
npm install
```

`npm install` also downloads the Chromium browser the scraper drives
(~150MB) and generates the database client.

Then put `.env.local` in the `Scraper` folder. To build one from scratch
instead, copy `.env.example` and fill it in.

## Running it

```bash
npm run dev
```

Open http://localhost:3000 and sign in with your account from the shared
database.

While it scrapes, a Chromium window opens and clicks through Google Maps on
its own — leave it alone. If Google shows a CAPTCHA in that window, solve it
by hand and the scrape carries on.

To update to the latest version later: `git pull`, then `npm install`.

## Using it

1. **Search query** — e.g. `plumbers in Austin TX`. **Limit** is how many
   businesses to collect. **Batch size** is how many leads each AI step
   handles per call.
2. **Emails via** — *Website* searches each business's own site (free).
   *Apollo* finds the top person (owner, founder, CEO) and their work email,
   using Apollo credits, and falls back to the website search when Apollo has
   nobody.
3. **Scrape → Emails → Analyze → Generate** runs the whole pipeline. **Stop**
   is safe: everything finished so far is saved, and **Resume unfinished**
   picks it back up.
4. **Export final CSV** downloads the results; **Export to Google Sheet**
   appends them to the sheet set in `.env.local`.

Leads marked **needs review** had a website the app couldn't read (a bot
check, or a page that only renders in a browser) — check those by hand
rather than trusting an empty observation.

## Settings worth knowing

All optional, in `.env.local`:

| Setting | Default | What it does |
|---|---|---|
| `SCRAPE_CONCURRENCY` | `3` | Google Maps listings scraped at once. Higher is faster but more likely to trigger a CAPTCHA. |
| `OPENROUTER_MODEL` | `openai/gpt-4o-mini` | The AI model for observations and emails. |
| `PUBLIC_URL` | unset | Needed only for Apollo **phone numbers**: a public tunnel URL to your `localhost:3000` that Apollo can call. Without it you still get Apollo names and emails. |

## Tests

```bash
npm test
```

## Caveats

- Google's Terms of Service prohibit automated scraping. Keep runs small and
  occasional.
- Not every business publishes an email — gaps are expected.
- AI observations are only as good as the website text behind them. Read them
  before sending.
