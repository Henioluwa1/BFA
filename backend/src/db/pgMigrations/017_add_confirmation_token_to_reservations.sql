-- ============================================================================
-- BFA Apartments Management System
-- Migration: 017_add_confirmation_token_to_reservations.sql
-- Description: Add a nullable unique confirmation token to reservations.
-- TiDB requires column creation and unique-index creation as separate DDL.
-- ============================================================================

-- Validate an existing column before treating IF NOT EXISTS as a successful
-- retry. A column created by a prior partial attempt must retain its exact
-- type, nullability, and position.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS confirmation_token VARCHAR(64) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_res_confirmation_token ON reservations (confirmation_token);
