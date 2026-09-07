"""Canonical column names for each stage's CSV. Every stage imports from here."""

# Stage 1: scrape_maps.py
RAW_COLUMNS = ["name", "phone", "website", "city", "niche"]

# Stage 2: enrich.py (adds email)
ENRICHED_COLUMNS = RAW_COLUMNS + ["email"]

# Stage 3: analyze.py (adds AI observation/impact/solution)
ANALYZED_COLUMNS = ENRICHED_COLUMNS + [
    "observation",
    "impact",
    "solution",
    "status",  # "ok" or "NEEDS_REVIEW"
]

# Stage 4: generate_email.py (adds subject/email, writes back into analyzed_leads.csv)
GENERATED_COLUMNS = ANALYZED_COLUMNS + ["subject", "generated_email"]

# Stage 5: export.py — final output schema, per PROJECT_PLAN.md #2
FINAL_COLUMNS = [
    "S. No",
    "Business Name",
    "Email Address",
    "City",
    "Niche",
    "Specific Observation",
    "Customer Impact",
    "Recommended Solution",
    "Phone Number",
    "Subject",
    "Generated Email",
]

# Maps internal column name -> final CSV header
FINAL_COLUMN_MAP = {
    "name": "Business Name",
    "email": "Email Address",
    "city": "City",
    "niche": "Niche",
    "observation": "Specific Observation",
    "impact": "Customer Impact",
    "solution": "Recommended Solution",
    "phone": "Phone Number",
    "subject": "Subject",
    "generated_email": "Generated Email",
}
