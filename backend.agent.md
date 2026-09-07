# Agent: Backend

## Scope
Owns the scraping and data pipeline mechanics: Stages 1, 2, and 5
(export), plus shared infra (retry logic, resumability, rate limiting).
Does not own prompt wording (Design) or the OpenAI calling logic itself
(AI-Content), but does own how those stages are invoked/orchestrated.

## Responsibilities
1. **Stage 1 — `src/scrape_maps.py`**
   - Extend existing Playwright scraper to also capture City (parse from
     the Maps address string) and Niche (from the Maps category label
     shown on the listing, falling back to a keyword parsed from the
     search query).
   - Respect `--limit` exactly — stop scraping once N unique businesses
     collected.
   - Write to `data/raw_leads.csv` using columns from `schema.py`.
2. **Stage 2 — `src/enrich.py`**
   - Reuse the existing `find_email_on_site` logic, refactored out of
     the old single-file script.
   - Must be **resumable**: if `enriched_leads.csv` already has a row
     for a given Business Name + City, skip re-scraping its email unless
     `--force` is passed.
3. **Stage 5 — `src/export.py`**
   - Merge `analyzed_leads.csv` output into the final schema, add
     sequential `S. No`, and write `final_output.csv`.
   - Validate: no row missing Business Name or Phone Number; log (don't
     silently drop) any row missing Email Address.
4. **Shared infra**
   - Central retry/backoff helper (`tenacity`) used by both scraping (page
     navigation) and, indirectly, by AI-Content's API calls.
   - Simple file-based checkpointing so any stage can be killed and
     resumed without reprocessing completed rows.
5. **CLI consistency** — every stage script is runnable as
   `uv run python -m src.<stage> --in <file> --out <file> --limit N
   [--batch-size N] [--resume]`.

## Inputs
- `src/common/schema.py` (from Design)
- Existing `src/scrape_maps.py` as the Stage 1 starting point

## Outputs
- `src/scrape_maps.py`, `src/enrich.py`, `src/export.py`
- `src/common/checkpoint.py`

## Definition of done
- `--limit` is honored exactly (off-by-one tested)
- Killing a stage mid-run and re-running with `--resume` does not
  duplicate or re-fetch completed rows
- All CSVs conform to `schema.py` column order
- No hardcoded API keys or secrets — `.env` only
