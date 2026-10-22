-- ==============================================================================
-- BFA Apartments Management System
-- Migration: 017_add_confirmation_token_to_reservations.sql
-- Description: Add unique confirmation_token column to reservations table
--              to provide strict, durable, and indexed idempotency linkage
--              for automation operations without leaking tokens into notes.
-- ==============================================================================

ALTER TABLE reservations
  ADD COLUMN confirmation_token VARCHAR(64) NULL UNIQUE AFTER reservation_code;
