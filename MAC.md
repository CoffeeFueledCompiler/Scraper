# Mac setup

Setup for running the app on a Mac. Once it's running, `README.md` covers how
to use it.

## 1. Install the tools

- **Node.js 22 or newer** — download the macOS installer from
  https://nodejs.org (LTS). Then check, in Terminal:

  ```bash
  node -p process.arch
  ```

  It should print **`arm64`** on an Apple Silicon Mac (any Mac from 2020 on,
  including the MacBook Neo). If it prints `x64`, you have the Intel build,
  which runs everything through Rosetta translation, noticeably slower.
  Reinstall Node from nodejs.org. `npm install` warns you about this too.

- **Git** — run `git --version`. If macOS offers to install the command line
  developer tools, accept; that includes git.

## 2. Get the code

```bash
git clone https://github.com/CoffeeFueledCompiler/Scraper.git
cd Scraper
git checkout mac
npm install
```

`npm install` downloads the Apple Silicon build of Chromium (~150MB) that the
scraper drives. Don't copy a `node_modules` folder over from Windows; it
contains the Windows browser and won't run.

## 3. Add `.env.local`

Get a copy of `.env.local` from your partner and put it in the `Scraper`
folder. It's never committed to git: it holds the database login and API
keys.

One line will need changing: `GOOGLE_APPLICATION_CREDENTIALS` holds a Windows
path (`C:\...`). Put the Google key file somewhere on your Mac and use its Mac
path, e.g.:

```
GOOGLE_APPLICATION_CREDENTIALS=/Users/yourname/keys/service-account-key.json
```

## 4. Run it

```bash
npm run dev
```

Open http://localhost:3000 and sign in.

On this branch, `npm run dev` runs under `caffeinate`, which keeps the Mac
from going to sleep while the server is running — a long scrape won't be cut
off halfway. It does **not** stop sleep when you close the lid, so keep it
open during a run. Stop the server with Ctrl+C and normal sleep resumes.

A Chromium window opens and works through Google Maps on its own; leave it
be, and solve a CAPTCHA in it by hand if Google shows one.

## Getting updates

New features land on `main` first. To get them on your Mac:

```bash
git pull                # latest Mac branch
git pull origin main    # bring in everything new on main
npm install
git push                # share the merged result, so you don't redo it
```

If `git pull origin main` reports a conflict, it will be in one of the few
files this branch changes: `package.json` (the `dev`/`start` scripts),
`scripts/postinstall.js`, or `.env.example`. Keep both sides' changes.

## What's different on this branch

| File | Change |
|---|---|
| `package.json` | `dev` and `start` run under `caffeinate` |
| `scripts/postinstall.js` | warns if Node is the Intel build under Rosetta |
| `.env.example` | Mac-style path for the Google key file |
| `MAC.md` | this file |

Everything else is identical to `main`.
