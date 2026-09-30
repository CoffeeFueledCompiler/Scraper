-- Adds the Apollo contact columns (the business's top person — see
-- lib/apollo.ts) to the existing ScrapeLead table (see create-lead-table.sql).
-- Additive only — IF NOT EXISTS, touches nothing else. Run once; safe to
-- re-run (no-ops if the columns already exist).
ALTER TABLE "ScrapeLead" ADD COLUMN IF NOT EXISTS "contactName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ScrapeLead" ADD COLUMN IF NOT EXISTS "contactTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ScrapeLead" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT NOT NULL DEFAULT '';
