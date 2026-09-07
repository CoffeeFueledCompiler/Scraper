"""
AI analysis — Stage 3
-----------------------
For each enriched lead, generates Observation / Impact / Solution from the
business's website text. Resumable: rows already present in --out are
skipped. --batch-size caps how many AI calls this run makes.

USAGE:
    uv run python -m src.analyze --in data/enriched_leads.csv --out data/analyzed_leads.csv --batch-size 10
"""

import argparse

import pandas as pd

from src.common.ai_client import AIClient
from src.common.prompts import ANALYZE_SYSTEM_PROMPT, ANALYZE_USER_TEMPLATE, NO_WEBSITE_OBSERVATION
from src.common.schema import ANALYZED_COLUMNS
from src.common.webtext import fetch_website_text

REQUIRED_KEYS = ("observation", "impact", "solution")
COST_WARNING_THRESHOLD = 50


def analyze_row(client, row):
    website_text = fetch_website_text(row.get("website", ""))
    if not website_text:
        return {
            **row,
            "observation": NO_WEBSITE_OBSERVATION,
            "impact": "",
            "solution": "",
            "status": "ok",
        }

    user_prompt = ANALYZE_USER_TEMPLATE.format(
        name=row.get("name", ""), niche=row.get("niche", ""), website_text=website_text
    )

    data = client.generate_json(ANALYZE_SYSTEM_PROMPT, user_prompt, REQUIRED_KEYS)
    if data is None:
        data = client.generate_json(ANALYZE_SYSTEM_PROMPT, user_prompt, REQUIRED_KEYS)  # one retry

    if data is None:
        return {**row, "observation": "", "impact": "", "solution": "", "status": "NEEDS_REVIEW"}

    return {
        **row,
        "observation": data["observation"],
        "impact": data["impact"],
        "solution": data["solution"],
        "status": "ok",
    }


def main():
    parser = argparse.ArgumentParser(description="Generate Observation/Impact/Solution via AI.")
    parser.add_argument("--in", dest="in_path", required=True)
    parser.add_argument("--out", dest="out_path", default="data/analyzed_leads.csv")
    parser.add_argument("--batch-size", type=int, default=10)
    args = parser.parse_args()

    enriched = pd.read_csv(args.in_path)

    existing = pd.DataFrame(columns=ANALYZED_COLUMNS)
    try:
        existing = pd.read_csv(args.out_path)
    except FileNotFoundError:
        pass
    done_keys = set(zip(existing.get("name", []), existing.get("city", [])))

    todo = [r for r in enriched.to_dict("records") if (r["name"], r["city"]) not in done_keys]
    batch = todo[: args.batch_size]

    n_calls = sum(1 for r in batch if r.get("website"))
    if n_calls > COST_WARNING_THRESHOLD:
        print(f"Warning: this run will make ~{n_calls} AI calls.")

    client = AIClient()
    results = [analyze_row(client, r) for r in batch]

    combined = pd.concat([existing, pd.DataFrame(results, columns=ANALYZED_COLUMNS)], ignore_index=True)
    combined = combined[ANALYZED_COLUMNS]
    combined.to_csv(args.out_path, index=False)

    client.print_usage()
    remaining = len(todo) - len(batch)
    print(f"Analyzed {len(batch)} rows, {remaining} remaining. Saved to {args.out_path}")


if __name__ == "__main__":
    main()
