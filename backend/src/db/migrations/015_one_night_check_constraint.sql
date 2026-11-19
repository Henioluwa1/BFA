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

SET @one_night_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME IN ('chk_one_night_stay', 'chk_one_night')
);

SET @one_night_check_correct := (
  SELECT COUNT(*)
  FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME IN ('chk_one_night_stay', 'chk_one_night')
    AND LOWER(REPLACE(REPLACE(CHECK_CLAUSE, '`', ''), ' ', '')) IN (
      '(datediff(check_out_date,check_in_date)=1)',
      'datediff(check_out_date,check_in_date)=1'
    )
);

-- Reuse only a matching rule. If a known constraint name exists with a
-- different definition, PREPARE receives an intentionally invalid sentinel
-- and fails before DDL instead of silently accepting it or attempting duplicate
-- DDL. That schema needs review.
SET @add_one_night_check := IF(
  @one_night_check_correct > 0,
  'SELECT 1',
  IF(
    @one_night_check_exists = 0,
    'ALTER TABLE reservations ADD CONSTRAINT chk_one_night_stay CHECK (DATEDIFF(check_out_date, check_in_date) = 1)',
    'BFA_MIGRATION_015_CHECK_DEFINITION_MISMATCH'
  )
);
PREPARE add_one_night_check_stmt FROM @add_one_night_check;
EXECUTE add_one_night_check_stmt;
DEALLOCATE PREPARE add_one_night_check_stmt;
