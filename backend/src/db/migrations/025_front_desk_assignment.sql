-- Migration: 025_front_desk_assignment.sql
-- Add front-desk staff assignment & acceptance tracking to reservations.
-- Each object is applied independently so reruns repair partial DDL state.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS assigned_staff_id INT NULL AFTER agent_id;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS accepted_by_user_id INT NULL AFTER assigned_staff_id;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP NULL AFTER accepted_by_user_id;
ALTER TABLE reservations
  ADD INDEX IF NOT EXISTS idx_res_assigned_staff (assigned_staff_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations' AND CONSTRAINT_NAME = 'fk_res_assigned_staff' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @fk_sql := IF(@fk_exists = 0, 'ALTER TABLE reservations ADD CONSTRAINT fk_res_assigned_staff FOREIGN KEY (assigned_staff_id) REFERENCES users(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt_res_assigned_fk FROM @fk_sql;
EXECUTE stmt_res_assigned_fk;
DEALLOCATE PREPARE stmt_res_assigned_fk;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations' AND CONSTRAINT_NAME = 'fk_res_accepted_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @fk_sql := IF(@fk_exists = 0, 'ALTER TABLE reservations ADD CONSTRAINT fk_res_accepted_by FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt_res_accepted_fk FROM @fk_sql;
EXECUTE stmt_res_accepted_fk;
DEALLOCATE PREPARE stmt_res_accepted_fk;
