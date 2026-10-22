-- ==============================================================================
-- BFA Apartments Management System
-- Migration: 015_one_night_check_constraint.sql
-- Description: Add database-level CHECK constraint enforcing the BFA one-night
--              stay rule (check_out_date MUST equal check_in_date + INTERVAL 1 DAY).
--
-- Compatibility:
--   MySQL  >= 8.0.16 -- CHECK constraints are enforced.
--   MariaDB >= 10.2.1 -- CHECK constraints are enforced.
--
-- Application-layer guard already exists in reservations.service.js
-- (validateOneNightStay). This migration adds defense-in-depth at the DB layer.
-- ==============================================================================

DROP PROCEDURE IF EXISTS bfa_add_one_night_constraint;

CREATE PROCEDURE bfa_add_one_night_constraint()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME        = 'reservations'
      AND CONSTRAINT_NAME   = 'chk_one_night_stay'
      AND CONSTRAINT_TYPE   = 'CHECK'
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT chk_one_night_stay
        CHECK (DATEDIFF(check_out_date, check_in_date) = 1);
  END IF;
END;

CALL bfa_add_one_night_constraint();

DROP PROCEDURE IF EXISTS bfa_add_one_night_constraint;
