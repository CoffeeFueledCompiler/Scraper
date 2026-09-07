# Project Plan — Local Business Lead & Outreach Generator

## 1. Goal

Given a search query (e.g. `"dentists in Bhopal"`), produce a CSV of local
businesses enriched with contact info **and** an AI-drafted, personalized
cold outreach email for each one.

## 2. Output schema (final CSV)

| # | Column | Source |
|---|---|---|
| 1 | S. No | Generated at export time |
| 2 | Business Name | Google Maps |
| 3 | Email Address | Scraped from business website (best-effort) |
| 4 | City | Parsed from Maps address / query |
| 5 | Niche | Parsed from Maps category, or query keyword |
| 6 | Specific Observation | AI — generated from website content |
| 7 | Customer Impact | AI — generated from the observation |
| 8 | Recommended Solution | AI — generated (your pitch) |
| 9 | Phone Number | Google Maps |
| 10 | Subject | AI (ChatGPT API) |
| 11 | Generated Email | AI (ChatGPT API) |

## 3. Pipeline (4 stages, each independently limit-able)

```
Stage 1: SCRAPE          Stage 2: ENRICH           Stage 3: ANALYZE          Stage 4: GENERATE
Google Maps  ──────▶  Visit website  ──────▶  AI reads site/niche ──────▶  ChatGPT drafts
name/phone/city/niche    find email               observation/impact/       subject + email
                                                    recommended solution
        │                     │                          │                        │
        ▼                     ▼                          ▼                        ▼
   raw_leads.csv        enriched_leads.csv        analyzed_leads.csv        final_output.csv
```

Each stage reads the previous stage's CSV and writes its own — so you can
inspect, manually edit, or re-run any single stage without redoing earlier
(slower / rate-limited) work.

## 4. Manual output limit control

Limits are controllable at **two levels**, both via CLI flags (no code
edits needed):

- `--limit N` — hard cap on total businesses scraped from Google Maps in
  Stage 1. This is the primary "how many leads do I want" control.
- `--batch-size N` (Stages 3–4 only) — how many AI calls to make per run,
  so you can generate emails for e.g. 10 leads at a time to review quality
  before spending API credits on the rest. Re-running Stage 3/4 skips
  leads that already have output (checked by `Business Name` + resumable
  via a `--resume` flag).

Example:
```bash
uv run python -m src.scrape_maps "dentists in Bhopal" --limit 50
uv run python -m src.enrich --in raw_leads.csv --limit 50
uv run python -m src.analyze --in enriched_leads.csv --batch-size 10
uv run python -m src.generate_email --in analyzed_leads.csv --batch-size 10
uv run python -m src.export --in analyzed_leads.csv --out final_output.csv
```

## 5. Tech stack

- **Package/env management:** [`uv`](https://docs.astral.sh/uv/) (replaces pip/venv)
- **Scraping:** Playwright (Chromium) — see existing `src/scrape_maps.py`
- **Data handling:** pandas + CSV (SQLite optional later if volume grows)
- **AI generation:** OpenAI API (`gpt-4o-mini` or similar) via `openai` SDK
- **Config:** `.env` file for `OPENAI_API_KEY`, loaded via `python-dotenv`
- **Optional frontend:** a small Streamlit or React+FastAPI dashboard to
  run stages, watch progress, and review/edit rows before export (see
  `agents/frontend.agent.md`)

## 6. Folder structure

```
gmaps_scraper/
├── pyproject.toml            # uv-managed deps
├── .env.example
├── PROJECT_PLAN.md
├── README.md
├── agents/                   # role playbooks (see below)
│   ├── design.agent.md
│   ├── backend.agent.md
│   ├── frontend.agent.md
│   ├── ai-content.agent.md
│   └── testing.agent.md
├── src/
│   ├── scrape_maps.py        # Stage 1
│   ├── enrich.py             # Stage 2
│   ├── analyze.py            # Stage 3
│   ├── generate_email.py     # Stage 4
│   ├── export.py             # Final CSV assembly + S.No
│   └── common/
│       ├── schema.py         # canonical column names/order
│       └── ai_client.py      # shared OpenAI wrapper, retries, batching
├── tests/
│   ├── test_enrich.py
│   ├── test_analyze.py
│   └── test_export.py
└── data/                      # gitignored — CSV outputs per stage
```

## 7. Milestones

| Phase | Deliverable |
|---|---|
| 1 | uv project scaffold + updated `scrape_maps.py` producing City/Niche columns |
| 2 | `enrich.py` — email lookup (already built), resumable |
| 3 | `common/ai_client.py` — OpenAI wrapper with retry/backoff and cost logging |
| 4 | `analyze.py` — Observation/Impact/Solution generation from website content |
| 5 | `generate_email.py` — Subject + email body generation |
| 6 | `export.py` — merges everything into final schema with S. No |
| 7 | Tests for enrich/analyze/export (mocked AI + network) |
| 8 | (Optional) minimal frontend to run pipeline + review/edit before export |

## 8. Risks & constraints

- **Google ToS**: Maps scraping stays light/occasional (see existing README caveats).
- **AI cost**: batch-size flag exists specifically so you never accidentally generate 500 emails in one run.
- **Data quality**: "Specific Observation" is only as good as what's visible on the business's public website — sites with little content will get generic observations; the AI prompt should say so explicitly rather than inventing detail.
- **Email accuracy**: same caveats as before — not all businesses publish an email.

## 9. Environment setup (uv)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # install uv, if not already
cd gmaps_scraper
uv sync                                            # creates .venv, installs deps from pyproject.toml
uv run playwright install chromium
cp .env.example .env                               # then fill in OPENAI_API_KEY
```
