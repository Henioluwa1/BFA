-- Migration: 022_support_multinight_stays.sql
-- Description: Replace historical one-night-only CHECK constraints with the
--              minimum-one-night rule required for multi-night reservations.
-- TiDB exposes CHECK names and clauses through TIDB_CHECK_CONSTRAINTS.

-- Read the definitions of only the known reservation CHECK names. An unrelated
-- CHECK constraint is never selected or changed by this migration.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_one_night_stay;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_one_night;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_min_one_night;

DO $$ BEGIN
  ALTER TABLE reservations ADD CONSTRAINT chk_min_one_night CHECK ((check_out_date - check_in_date) >= 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
