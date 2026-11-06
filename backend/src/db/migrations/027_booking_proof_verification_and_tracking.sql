-- Migration: 027_booking_proof_verification_and_tracking.sql
-- Description: Add payment proof, decline details, and room change tracking to reservations

SET @exist_proof_col := (SELECT COUNT(*) FROM information_schema.COLUMNS 
                         WHERE TABLE_SCHEMA = DATABASE() 
                           AND TABLE_NAME = 'reservations' 
                           AND COLUMN_NAME = 'payment_proof_path');

SET @add_proof_sql := IF(@exist_proof_col = 0, 
  'ALTER TABLE reservations 
     ADD COLUMN payment_proof_path VARCHAR(255) NULL AFTER notes,
     ADD COLUMN decline_reason VARCHAR(255) NULL AFTER cancellation_reason,
     ADD COLUMN declined_at TIMESTAMP NULL AFTER decline_reason,
     ADD COLUMN declined_by_user_id INT NULL AFTER declined_at,
     ADD COLUMN room_change_requested_apartment_id INT NULL AFTER declined_by_user_id,
     ADD COLUMN room_change_status VARCHAR(50) NULL AFTER room_change_requested_apartment_id,
     ADD COLUMN room_change_notes TEXT NULL AFTER room_change_status,
     ADD CONSTRAINT fk_res_declined_by FOREIGN KEY (declined_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
     ADD CONSTRAINT fk_res_rc_apt FOREIGN KEY (room_change_requested_apartment_id) REFERENCES apartments(id) ON DELETE SET NULL',
  'SELECT "proof columns already exist on reservations"');

PREPARE stmt_proof FROM @add_proof_sql;
EXECUTE stmt_proof;
DEALLOCATE PREPARE stmt_proof;

