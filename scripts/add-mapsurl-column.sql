-- Adds the "mapsUrl" column to the existing ScrapeLead table (see
-- create-lead-table.sql). Additive only — IF NOT EXISTS, touches nothing
-- else. Run once; safe to re-run (no-ops if the column already exists).
ALTER TABLE "ScrapeLead" ADD COLUMN IF NOT EXISTS "mapsUrl" TEXT NOT NULL DEFAULT '';
