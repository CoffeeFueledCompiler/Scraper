# Agent: Testing

## Scope
Owns correctness and regression safety across all stages. Tests run
without hitting real Google Maps or the real OpenAI API — everything
network-facing is mocked.

## Responsibilities
1. **`tests/test_enrich.py`**
   - Mock `find_email_on_site` HTTP responses (fixture HTML with/without
     `mailto:` links, with generic vs. specific addresses) — assert the
     "prefer non-generic email" logic in the existing script.
   - Test resumability: pre-populate `enriched_leads.csv` with a row,
     assert it's skipped unless `--force`.
2. **`tests/test_analyze.py`** and **`tests/test_generate_email.py`**
   - Mock `ai_client` responses (valid JSON, malformed JSON, empty
     response) — assert:
     - valid → columns populated correctly
     - malformed → row flagged `NEEDS_REVIEW`, not silently written
     - no-website input → model is never called (assert mock not called)
   - Assert `--batch-size N` results in exactly N mocked calls, not more.
3. **`tests/test_export.py`**
   - Assert final CSV column order matches `schema.py` exactly.
   - Assert `S. No` is sequential starting at 1.
   - Assert a row missing Phone Number or Business Name is rejected/logged,
     not silently included.
4. **`tests/test_limit_flags.py`** (cross-stage)
   - Assert `--limit` is honored exactly at Stage 1 (off-by-one check,
     e.g. request 5 when 7 are available on the page → exactly 5 saved).
5. **Scraper tests** (`tests/test_scrape_maps.py`)
   - Since live Maps scraping can't run in CI, use a saved fixture HTML
     page for the results feed and test the parsing/extraction logic in
     isolation from the Playwright navigation itself.

## Inputs
- Fixture data (sample HTML snapshots, sample AI JSON responses) —
  stored under `tests/fixtures/`
- Schema/contract from Design and Backend

## Outputs
- Full `tests/` suite runnable via `uv run pytest`
- `tests/fixtures/` sample data

## Definition of done
- `uv run pytest` passes with zero network calls (verify via a
  network-blocking fixture/conftest that fails the test if a real
  request is attempted)
- Every "Definition of done" bullet in the other four agent files has at
  least one corresponding test
- CI-friendly: no test depends on a real API key being present
