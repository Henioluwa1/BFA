-- Migration: Add payment proof, decline details, and room change tracking.
-- Keep every DDL operation independent and retryable application.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS payment_proof_path VARCHAR(255) NULL;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS decline_reason VARCHAR(255) NULL;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ NULL;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS declined_by_user_id INT NULL;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS room_change_requested_apartment_id INT NULL;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS room_change_status VARCHAR(50) NULL;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS room_change_notes TEXT NULL;

-- Validate a same-named constraint completely before treating it as applied.
-- TABLE_CONSTRAINTS detects any name collision; KEY_COLUMN_USAGE and
-- REFERENTIAL_CONSTRAINTS verify the actual child/parent columns and actions.
DO $$ BEGIN
  ALTER TABLE reservations ADD CONSTRAINT fk_res_declined_by FOREIGN KEY (declined_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE reservations ADD CONSTRAINT fk_res_rc_apt FOREIGN KEY (room_change_requested_apartment_id) REFERENCES apartments(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
