# Agent: Frontend

## Scope
Owns the optional user-facing control surface for running the pipeline
and reviewing/editing rows before final export. Not required for v1 (CLI
is sufficient), but this agent owns it if/when it's built.

## Responsibilities
1. **Pipeline runner UI** (Streamlit, per `pyproject.toml`
   `[project.optional-dependencies].frontend`)
   - Form inputs: search query, `--limit`, `--batch-size` — mirrors the
     CLI flags exactly (no separate config format to keep in sync).
   - "Run Stage 1 / 2 / 3 / 4" buttons that shell out to the
     corresponding `src/*.py` script and stream stdout/progress into the
     UI (progress bar keyed off rows processed vs. `--limit`).
2. **Review/edit table**
   - After Stage 3 (Analyze) and before Stage 4 (Generate), show a table
     of Observation/Impact/Solution per lead so the user can hand-edit
     rows the model got wrong before spending API credits on Stage 4's
     email generation.
   - Editable cells write straight back to `analyzed_leads.csv`.
3. **Cost/limit visibility**
   - Surface AI-Content's per-run token/cost estimate before the user
     confirms running Stage 3 or 4, especially when `--batch-size`
     exceeds the warning threshold Design/AI-Content agreed on.
4. **Final export view**
   - Preview `final_output.csv` in a sortable/filterable table, with a
     download button.

## Inputs
- CLI contract from Backend (`--in/--out/--limit/--batch-size/--resume`)
- Schema from Design (`src/common/schema.py`)

## Outputs
- `frontend/app.py` (Streamlit entrypoint)
- `frontend/components/` (table view, progress view, run form)

## Definition of done
- Every CLI flag has a corresponding UI control — no hidden defaults
  the CLI user couldn't also set
- User can edit a row's Observation/Impact/Solution and have Stage 4
  pick up the edited version
- Cost estimate is shown and requires explicit confirmation before any
  batch of AI calls larger than the agreed threshold
