# Local Business Lead & Outreach Generator

Scrapes local business contact info from Google Maps for a search query,
then uses the OpenAI API to draft a personalized cold outreach email per
business. See `PROJECT_PLAN.md` for the full pipeline design and
`agents/*.agent.md` for role-by-role responsibilities if multiple people
(or multiple agent sessions) are building this together.

## Setup (uv)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # if uv isn't installed yet
uv sync                                            # installs deps into .venv from pyproject.toml
uv run playwright install chromium
cp .env.example .env                               # then add your OPENAI_API_KEY
```

## Running the pipeline

```bash
# Stage 1 — scrape leads from Google Maps (you control volume here)
uv run python -m src.scrape_maps "dentists in Bhopal" --limit 20 --out data/raw_leads.csv

# Stage 2 — find emails from each business's website
uv run python -m src.enrich --in data/raw_leads.csv --out data/enriched_leads.csv

# Stage 3 — AI-generated Observation / Impact / Solution (costs API credits)
uv run python -m src.analyze --in data/enriched_leads.csv --out data/analyzed_leads.csv --batch-size 10

# Stage 4 — AI-generated Subject + Email
uv run python -m src.generate_email --in data/analyzed_leads.csv --out data/analyzed_leads.csv --batch-size 10

# Stage 5 — assemble final CSV with S. No
uv run python -m src.export --in data/analyzed_leads.csv --out data/final_output.csv
```

`--limit` (Stage 1) and `--batch-size` (Stages 3–4) are your manual output
controls — see `PROJECT_PLAN.md` §4.

## Important caveats

- **Google's ToS** prohibit automated scraping of its services. Keep
  usage light/occasional, not continuous or high-volume.
- **Email accuracy**: not every business publishes a public email; expect
  gaps.
- **AI-generated content** ("Specific Observation", etc.) is only as
  accurate as what's visible on the business's public website — review
  before sending real outreach.
- For serious/ongoing lead volume, consider the official
  [Google Places API](https://developers.google.com/maps/documentation/places/web-service/overview)
  instead of browser scraping.
