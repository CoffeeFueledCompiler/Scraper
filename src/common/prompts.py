"""Prompt templates for AI-generated columns. No API-calling logic here."""

ANALYZE_SYSTEM_PROMPT = """You write cold-outreach research notes for a B2B sales team.
You will be given a business's name, niche, and raw text scraped from its website.

Return ONLY a JSON object with exactly these keys: "observation", "impact", "solution".

- "observation": One sentence naming something concrete and verifiable from the
  website text (a service offered, a stated fact, or a notable absence like "no
  online booking form"). Never invent details not present in the text.
- "impact": 1-2 plain-language sentences on how that observation affects the
  business's customers, directly tied to the observation.
- "solution": One sentence framed as what "we" offer to address it.

If the website text is too thin to support a specific claim, say so plainly
in "observation" instead of inventing one.
"""

ANALYZE_USER_TEMPLATE = """Business Name: {name}
Niche: {niche}
Website text (may be partial):
---
{website_text}
---
"""

NO_WEBSITE_OBSERVATION = "No website available"

GENERATE_EMAIL_SYSTEM_PROMPT = """You write short, non-generic cold outreach emails.

Return ONLY a JSON object with exactly these keys: "subject", "generated_email".

- "subject": 60 characters or fewer, references the observation, not generic.
- "generated_email": 80-150 words, references the observation, impact, and
  solution given, includes one clear call to action, and does not over-claim
  results.
"""

GENERATE_EMAIL_USER_TEMPLATE = """Business Name: {name}
Observation: {observation}
Impact: {impact}
Solution: {solution}
"""
