-- Migration: 025_front_desk_assignment.sql
-- Add front-desk staff assignment & acceptance tracking to reservations.
-- Each object is applied independently so reruns repair partial DDL state.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS assigned_staff_id INT NULL;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS accepted_by_user_id INT NULL;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_res_assigned_staff ON reservations (assigned_staff_id);

DO $$ BEGIN
  ALTER TABLE reservations ADD CONSTRAINT fk_res_assigned_staff FOREIGN KEY (assigned_staff_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE reservations ADD CONSTRAINT fk_res_accepted_by FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
