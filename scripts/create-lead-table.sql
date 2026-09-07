-- Creates this app's ScrapeLead table in the shared Postgres DB (named to
-- avoid reading like a CRM lead next to Contact/Opportunity). Additive
-- only — IF NOT EXISTS, touches nothing named User/Ticket/Task/etc. Run
-- once; safe to re-run (no-ops if the table already exists).
CREATE TABLE IF NOT EXISTS "ScrapeLead" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "phone"          TEXT NOT NULL DEFAULT '',
  "website"        TEXT NOT NULL DEFAULT '',
  "city"           TEXT NOT NULL DEFAULT '',
  "niche"          TEXT NOT NULL DEFAULT '',
  "email"          TEXT NOT NULL DEFAULT '',
  "observation"    TEXT NOT NULL DEFAULT '',
  "impact"         TEXT NOT NULL DEFAULT '',
  "solution"       TEXT NOT NULL DEFAULT '',
  "status"         TEXT NOT NULL DEFAULT '',
  "subject"        TEXT NOT NULL DEFAULT '',
  "generatedEmail" TEXT NOT NULL DEFAULT '',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScrapeLead_name_city_key" ON "ScrapeLead" ("name", "city");
