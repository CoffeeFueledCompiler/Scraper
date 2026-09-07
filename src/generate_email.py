"""
AI email generation — Stage 4
--------------------------------
Generates Subject + Generated Email from each analyzed lead's
Observation/Impact/Solution. Writes back into the same analyzed_leads.csv.
Resumable: rows that already have a subject are skipped. --batch-size caps
how many AI calls this run makes.

USAGE:
    uv run python -m src.generate_email --in data/analyzed_leads.csv --out data/analyzed_leads.csv --batch-size 10
"""

import argparse

import pandas as pd

from src.common.ai_client import AIClient
from src.common.prompts import GENERATE_EMAIL_SYSTEM_PROMPT, GENERATE_EMAIL_USER_TEMPLATE
from src.common.schema import GENERATED_COLUMNS

REQUIRED_KEYS = ("subject", "generated_email")


def generate_row(client, row):
    if row.get("status") == "NEEDS_REVIEW" or not row.get("observation"):
        return {**row, "subject": "", "generated_email": ""}

    user_prompt = GENERATE_EMAIL_USER_TEMPLATE.format(
        name=row.get("name", ""),
        observation=row.get("observation", ""),
        impact=row.get("impact", ""),
        solution=row.get("solution", ""),
    )

    data = client.generate_json(GENERATE_EMAIL_SYSTEM_PROMPT, user_prompt, REQUIRED_KEYS)
    if data is None:
        data = client.generate_json(GENERATE_EMAIL_SYSTEM_PROMPT, user_prompt, REQUIRED_KEYS)

    if data is None:
        return {**row, "subject": "", "generated_email": "", "status": "NEEDS_REVIEW"}

    return {**row, "subject": data["subject"], "generated_email": data["generated_email"]}


def main():
    parser = argparse.ArgumentParser(description="Generate Subject + Email via AI.")
    parser.add_argument("--in", dest="in_path", required=True)
    parser.add_argument("--out", dest="out_path", default="data/analyzed_leads.csv")
    parser.add_argument("--batch-size", type=int, default=10)
    args = parser.parse_args()

    analyzed = pd.read_csv(args.in_path)
    if "subject" not in analyzed.columns:
        analyzed["subject"] = ""
        analyzed["generated_email"] = ""

    done_mask = analyzed["subject"].fillna("").astype(bool)
    todo_idx = analyzed.index[~done_mask].tolist()[: args.batch_size]

    client = AIClient()
    for idx in todo_idx:
        result = generate_row(client, analyzed.loc[idx].to_dict())
        for col in ("subject", "generated_email", "status"):
            analyzed.at[idx, col] = result[col]

    analyzed = analyzed[GENERATED_COLUMNS]
    analyzed.to_csv(args.out_path, index=False)

    client.print_usage()
    remaining = len(analyzed.index[~done_mask]) - len(todo_idx)
    print(f"Generated emails for {len(todo_idx)} rows, {remaining} remaining. Saved to {args.out_path}")


if __name__ == "__main__":
    main()
