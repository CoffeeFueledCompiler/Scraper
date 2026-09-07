# Agent: Design

## Scope
Owns the data model, pipeline shape, prompt design (for AI-generated
columns), and CSV/UX conventions. Does not write scraping or AI-calling
code — hands specs to Backend and AI-Content agents.

## Responsibilities
1. **Canonical schema** — define and maintain `src/common/schema.py`:
   exact column names, order, and types for every stage's CSV
   (`raw_leads.csv` → `enriched_leads.csv` → `analyzed_leads.csv` →
   `final_output.csv`). Every other agent imports from this file rather
   than hardcoding column names.
2. **Prompt specs** — write the prompt templates (not the calling code)
   for:
   - *Specific Observation*: must reference something concrete and
     verifiable from the business's own website (service offered, stated
     years in business, notable absence like "no online booking"). Must
     explicitly instruct the model not to invent facts not present on
     the site.
   - *Customer Impact*: 1–2 sentences, plain language, tied directly to
     the Observation.
   - *Recommended Solution*: 1 sentence, framed as what "we" offer.
   - *Subject*: ≤ 60 chars, references the Observation, not generic
     ("Quick question about [Business Name]'s online booking").
   - *Generated Email*: 80–150 words, references Observation + Impact +
     Solution, one clear CTA, no over-claiming.
   Hand these templates to the AI-Content agent as constants/config, not
   inline strings buried in code.
3. **Manual limit UX** — decide flag names/defaults (`--limit`,
   `--batch-size`, `--resume`) and how progress/cost is surfaced to the
   user (console log, or frontend progress bar).
4. **Review cadence** — spot-check a sample of AI-generated rows each
   milestone for genericness/hallucination before Backend wires up the
   next stage.

## Inputs
- `PROJECT_PLAN.md` (source of truth for schema/stages)
- Sample scraped data from Backend to calibrate prompts against

## Outputs
- `src/common/schema.py`
- `src/common/prompts.py` (templates only, no API logic)
- A short `docs/prompt_rationale.md` explaining why each prompt is shaped the way it is

## Definition of done
- Schema file matches the table in `PROJECT_PLAN.md` §2 exactly
- Each prompt template has been test-run against 3 sample businesses and
  reviewed for hallucination/genericness
- Flag names agreed with Backend and Frontend agents before implementation starts
