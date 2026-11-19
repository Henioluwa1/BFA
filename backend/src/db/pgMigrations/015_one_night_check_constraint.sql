-- ==============================================================================
-- BFA Apartments Management System
-- Migration: 015_one_night_check_constraint.sql
-- Description: Add database-level CHECK constraint enforcing the BFA one-night
--              stay rule (check_out_date MUST equal check_in_date + INTERVAL 1 DAY).
--
-- TiDB-compatible idempotent DDL. Migration 003 creates this constraint on a
-- fresh database; this migration repairs installations where it is missing.
-- TiDB exposes CHECK definitions through TIDB_CHECK_CONSTRAINTS. TABLE_CONSTRAINTS
-- does not include CHECK constraints, so checking it can miss the existing rule.
--
-- Application-layer guard already exists in reservations.service.js
-- (validateOneNightStay). This migration adds defense-in-depth at the DB layer.
-- ==============================================================================

DO $$ BEGIN
  ALTER TABLE reservations ADD CONSTRAINT chk_one_night_stay CHECK ((check_out_date - check_in_date) = 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
