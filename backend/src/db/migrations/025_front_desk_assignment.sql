-- Migration: 025_front_desk_assignment.sql
-- Description: Add front-desk staff assignment & acceptance tracking to reservations

SET @exist_staff_col := (SELECT COUNT(*) FROM information_schema.COLUMNS 
                         WHERE TABLE_SCHEMA = DATABASE() 
                           AND TABLE_NAME = 'reservations' 
                           AND COLUMN_NAME = 'assigned_staff_id');

SET @add_staff_sql := IF(@exist_staff_col = 0, 
  'ALTER TABLE reservations 
     ADD COLUMN assigned_staff_id INT NULL AFTER agent_id,
     ADD COLUMN accepted_by_user_id INT NULL AFTER assigned_staff_id,
     ADD COLUMN accepted_at TIMESTAMP NULL AFTER accepted_by_user_id,
     ADD INDEX idx_res_assigned_staff (assigned_staff_id),
     ADD CONSTRAINT fk_res_assigned_staff FOREIGN KEY (assigned_staff_id) REFERENCES users(id) ON DELETE SET NULL,
     ADD CONSTRAINT fk_res_accepted_by FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT "assigned_staff_id already exists on reservations"');

PREPARE stmt_staff FROM @add_staff_sql;
EXECUTE stmt_staff;
DEALLOCATE PREPARE stmt_staff;

