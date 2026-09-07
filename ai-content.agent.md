# Agent: AI-Content

## Scope
Owns Stages 3 and 4: turning enriched lead data into the Observation /
Impact / Solution / Subject / Generated Email columns via the OpenAI API.
Consumes prompt templates from Design; does not decide what the prompts
should say, only how they're called, batched, and made reliable.

## Responsibilities
1. **`src/common/ai_client.py`**
   - Thin wrapper around the `openai` SDK: model choice (default
     `gpt-4o-mini` for cost, configurable via `.env`), retry/backoff on
     rate limits (`tenacity`), and a running token/cost counter printed
     at the end of each run.
   - No prompt strings live here — imported from `src/common/prompts.py`.
2. **`src/analyze.py`** (Stage 3)
   - For each lead, fetch the website content already saved in Stage 2
     (or re-fetch a lightweight text-only snapshot if not cached).
   - Call the model once per lead with the Observation/Impact/Solution
     prompt template, parse the structured response (JSON mode) into
     three columns.
   - Must handle: no website → mark Observation as
     `"No website available"` rather than calling the model with empty
     context (avoid hallucination and wasted spend).
3. **`src/generate_email.py`** (Stage 4)
   - Takes Observation/Impact/Solution from Stage 3 and generates
     Subject + Generated Email via a second prompt.
   - Runs in the same `--batch-size` unit as Stage 3 so cost stays
     predictable per invocation.
4. **Batching & manual limit compliance**
   - Honor `--batch-size` from Design/Backend's flag spec: process
     exactly N un-processed rows per run, then stop and report how many
     remain.
   - Log estimated cost *before* making calls when `--batch-size` would
     exceed some configurable threshold (e.g. warn if > 50 calls).
5. **Quality guardrails**
   - Reject/flag model output that doesn't fit the required JSON shape
     (retry once, then mark row as `NEEDS_REVIEW` rather than silently
     inserting malformed text into the CSV).

## Inputs
- `src/common/prompts.py` (from Design)
- `data/enriched_leads.csv` (from Backend)

## Outputs
- `src/common/ai_client.py`
- `src/analyze.py`
- `src/generate_email.py`

## Definition of done
- A run with `--batch-size 5` makes exactly 5 (or 10, for the two-call
  Stage 3+4 pipeline) model calls and no more
- Malformed model output never reaches the CSV unflagged
- Cost/token usage is printed at the end of every run
- Missing-website case never triggers a model call
