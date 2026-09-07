"""
Final export — Stage 5
-------------------------
Merges analyzed_leads.csv into the final output schema with a sequential
S. No. Rows missing Business Name or Phone Number are rejected (logged,
not silently dropped); rows missing Email Address are logged but kept.

USAGE:
    uv run python -m src.export --in data/analyzed_leads.csv --out data/final_output.csv
"""

import argparse

import pandas as pd

from src.common.schema import FINAL_COLUMN_MAP, FINAL_COLUMNS


def build_final_df(analyzed):
    missing_required = analyzed[analyzed["name"].isna() | analyzed["phone"].isna()]
    for _, row in missing_required.iterrows():
        print(f"Rejected row missing Business Name or Phone Number: {row.to_dict()}")
    analyzed = analyzed.drop(missing_required.index)

    missing_email = analyzed[analyzed["email"].isna() | (analyzed["email"] == "")]
    for name in missing_email["name"]:
        print(f"Missing Email Address for: {name}")

    final = analyzed.rename(columns=FINAL_COLUMN_MAP)
    final.insert(0, "S. No", range(1, len(final) + 1))
    return final[FINAL_COLUMNS]


def main():
    parser = argparse.ArgumentParser(description="Assemble the final outreach CSV.")
    parser.add_argument("--in", dest="in_path", required=True)
    parser.add_argument("--out", dest="out_path", default="data/final_output.csv")
    args = parser.parse_args()

    analyzed = pd.read_csv(args.in_path)
    final = build_final_df(analyzed)
    final.to_csv(args.out_path, index=False)
    print(f"Saved {len(final)} rows to {args.out_path}")


if __name__ == "__main__":
    main()
