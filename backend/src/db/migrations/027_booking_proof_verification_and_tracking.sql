-- Migration: Add payment proof, decline details, and room change tracking.
-- Keep every DDL operation independent and retryable after partial application.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS payment_proof_path VARCHAR(255) NULL AFTER notes;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS decline_reason VARCHAR(255) NULL AFTER cancellation_reason;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP NULL AFTER decline_reason;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS declined_by_user_id INT NULL AFTER declined_at;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS room_change_requested_apartment_id INT NULL AFTER declined_by_user_id;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS room_change_status VARCHAR(50) NULL AFTER room_change_requested_apartment_id;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS room_change_notes TEXT NULL AFTER room_change_status;

-- Validate a same-named constraint completely before treating it as applied.
-- TABLE_CONSTRAINTS detects any name collision; KEY_COLUMN_USAGE and
-- REFERENTIAL_CONSTRAINTS verify the actual child/parent columns and actions.
SET @fk_res_declined_named_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'fk_res_declined_by'
);
SET @fk_res_declined_valid := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS tc
  JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
    ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
   AND rc.TABLE_NAME = tc.TABLE_NAME
   AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
  WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
    AND tc.TABLE_SCHEMA = DATABASE()
    AND tc.TABLE_NAME = 'reservations'
    AND tc.CONSTRAINT_NAME = 'fk_res_declined_by'
    AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND rc.DELETE_RULE = 'SET NULL'
    AND rc.UPDATE_RULE = 'NO ACTION'
    AND (
      SELECT COUNT(*)
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
        AND kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = 'reservations'
        AND kcu.CONSTRAINT_NAME = 'fk_res_declined_by'
    ) = 1
    AND EXISTS (
      SELECT 1
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
        AND kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = 'reservations'
        AND kcu.CONSTRAINT_NAME = 'fk_res_declined_by'
        AND kcu.COLUMN_NAME = 'declined_by_user_id'
        AND kcu.REFERENCED_TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME = 'users'
        AND kcu.REFERENCED_COLUMN_NAME = 'id'
        AND kcu.ORDINAL_POSITION = 1
    )
);
SET @fk_res_declined_sql := IF(
  @fk_res_declined_valid = 1,
  'SELECT 1',
  IF(
    @fk_res_declined_named_exists = 0,
    'ALTER TABLE reservations ADD CONSTRAINT fk_res_declined_by FOREIGN KEY (declined_by_user_id) REFERENCES users(id) ON DELETE SET NULL',
    'BFA_MIGRATION_027_FK_DEFINITION_MISMATCH_fk_res_declined_by'
  )
);
PREPARE stmt_res_declined_fk FROM @fk_res_declined_sql;
EXECUTE stmt_res_declined_fk;
DEALLOCATE PREPARE stmt_res_declined_fk;

SET @fk_res_room_change_named_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'fk_res_rc_apt'
);
SET @fk_res_room_change_valid := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS tc
  JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
    ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
   AND rc.TABLE_NAME = tc.TABLE_NAME
   AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
  WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
    AND tc.TABLE_SCHEMA = DATABASE()
    AND tc.TABLE_NAME = 'reservations'
    AND tc.CONSTRAINT_NAME = 'fk_res_rc_apt'
    AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND rc.DELETE_RULE = 'SET NULL'
    AND rc.UPDATE_RULE = 'NO ACTION'
    AND (
      SELECT COUNT(*)
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
        AND kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = 'reservations'
        AND kcu.CONSTRAINT_NAME = 'fk_res_rc_apt'
    ) = 1
    AND EXISTS (
      SELECT 1
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
        AND kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = 'reservations'
        AND kcu.CONSTRAINT_NAME = 'fk_res_rc_apt'
        AND kcu.COLUMN_NAME = 'room_change_requested_apartment_id'
        AND kcu.REFERENCED_TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME = 'apartments'
        AND kcu.REFERENCED_COLUMN_NAME = 'id'
        AND kcu.ORDINAL_POSITION = 1
    )
);
SET @fk_res_room_change_sql := IF(
  @fk_res_room_change_valid = 1,
  'SELECT 1',
  IF(
    @fk_res_room_change_named_exists = 0,
    'ALTER TABLE reservations ADD CONSTRAINT fk_res_rc_apt FOREIGN KEY (room_change_requested_apartment_id) REFERENCES apartments(id) ON DELETE SET NULL',
    'BFA_MIGRATION_027_FK_DEFINITION_MISMATCH_fk_res_rc_apt'
  )
);
PREPARE stmt_res_room_change_fk FROM @fk_res_room_change_sql;
EXECUTE stmt_res_room_change_fk;
DEALLOCATE PREPARE stmt_res_room_change_fk;
