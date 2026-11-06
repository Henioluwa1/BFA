-- Migration: 029_role_migration_operations_manager_and_attendance_policy.sql
-- Description: Formal role migration: Rename MANAGER to OPERATIONS_MANAGER,
--              Provision Attendance Policies, Authorized Property Kiosks, and Register Capabilities.

-- 1. Expand role enum on users table and migrate existing records
ALTER TABLE `users` MODIFY COLUMN `role` ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER') NOT NULL DEFAULT 'STAFF';
UPDATE `users` SET `role` = 'OPERATIONS_MANAGER' WHERE `role` = 'MANAGER';

-- 2. Update author_role enum on property_review_comments
ALTER TABLE `property_review_comments` MODIFY COLUMN `author_role` ENUM('OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER') NOT NULL;
UPDATE `property_review_comments` SET `author_role` = 'OPERATIONS_MANAGER' WHERE `author_role` = 'MANAGER';

-- 3. Attendance Policies Table (Configurable per-property and global attendance policies)
CREATE TABLE IF NOT EXISTS `attendance_policies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NULL UNIQUE COMMENT 'NULL represents company-wide default policy',
  `allow_mobile` BOOLEAN NOT NULL DEFAULT TRUE,
  `allow_gps` BOOLEAN NOT NULL DEFAULT TRUE,
  `require_gps` BOOLEAN NOT NULL DEFAULT TRUE,
  `allow_kiosk` BOOLEAN NOT NULL DEFAULT TRUE,
  `allow_manager_assisted` BOOLEAN NOT NULL DEFAULT TRUE,
  `geofence_lat` DECIMAL(10,8) NULL,
  `geofence_lng` DECIMAL(11,8) NULL,
  `geofence_radius_meters` INT NOT NULL DEFAULT 200,
  `grace_period_minutes` INT NOT NULL DEFAULT 15,
  `overtime_threshold_hours` DECIMAL(4,2) NOT NULL DEFAULT 40.00,
  `missing_punch_threshold_hours` DECIMAL(4,2) NOT NULL DEFAULT 12.00,
  `delegated_leave_limit_days` INT NOT NULL DEFAULT 14,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_attpol_prop` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Authorized Property Kiosks Table (Dedicated on-site attendance terminals)
CREATE TABLE IF NOT EXISTS `property_kiosks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NOT NULL,
  `kiosk_name` VARCHAR(100) NOT NULL,
  `kiosk_code` VARCHAR(50) NOT NULL UNIQUE,
  `kiosk_secret_hash` VARCHAR(255) NOT NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  `registered_by_id` INT NOT NULL,
  `last_heartbeat_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_kiosk_prop` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kiosk_reg_by` FOREIGN KEY (`registered_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_kiosk_prop` (`property_id`),
  INDEX `idx_kiosk_code` (`kiosk_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Seed Default Global and Property Attendance Policies
INSERT IGNORE INTO `attendance_policies` (
  `property_id`, `allow_mobile`, `allow_gps`, `require_gps`, `allow_kiosk`, `allow_manager_assisted`,
  `geofence_lat`, `geofence_lng`, `geofence_radius_meters`, `grace_period_minutes`, `overtime_threshold_hours`
) VALUES
(NULL, TRUE, TRUE, TRUE, TRUE, TRUE, 6.42810000, 3.42190000, 200, 15, 40.00),
(1, TRUE, TRUE, TRUE, TRUE, TRUE, 6.42810000, 3.42190000, 250, 15, 40.00),
(2, TRUE, TRUE, TRUE, TRUE, TRUE, 6.43500000, 3.44000000, 200, 15, 40.00);

-- 6. Register New System Capabilities
INSERT IGNORE INTO `capabilities` (`name`, `description`, `category`, `is_enabled`, `restriction_level`) VALUES
('ROSTER_VIEW', 'View published team duty rosters and shift schedules', 'OPERATIONS', TRUE, 'NONE'),
('ROSTER_CREATE', 'Create and manage department shift rosters and templates', 'OPERATIONS', TRUE, 'NONE'),
('ROSTER_EDIT', 'Modify draft rosters, adjust shift times and break allotments', 'OPERATIONS', TRUE, 'NONE'),
('ROSTER_PUBLISH', 'Publish rosters and dispatch duty alerts to assigned staff', 'OPERATIONS', TRUE, 'NONE'),
('SHIFT_ASSIGN', 'Assign shifts to eligible employees within property scope', 'OPERATIONS', TRUE, 'NONE'),
('SHIFT_SWAP_REQUEST', 'Request peer shift swap with another eligible employee', 'OPERATIONS', TRUE, 'NONE'),
('SHIFT_SWAP_APPROVE', 'Authorize or reject shift swap transfers between staff', 'OPERATIONS', TRUE, 'NONE'),
('AVAILABILITY_MANAGE', 'Submit and update regular or temporary shift availability', 'OPERATIONS', TRUE, 'NONE'),
('ATTENDANCE_CLOCK', 'Perform mobile, GPS, or kiosk attendance clock-in and clock-out', 'OPERATIONS', TRUE, 'NONE'),
('ATTENDANCE_VIEW', 'Inspect live attendance ledger and punch verification status', 'OPERATIONS', TRUE, 'NONE'),
('ATTENDANCE_CORRECTION_REQUEST', 'Submit missed punch adjustment request with justification', 'OPERATIONS', TRUE, 'NONE'),
('ATTENDANCE_CORRECTION_APPROVE', 'Authorize attendance correction under maker-checker guard', 'OPERATIONS', TRUE, 'NONE'),
('ATTENDANCE_POLICY_MANAGE', 'Configure property geofence, attendance methods, and grace periods', 'OPERATIONS', TRUE, 'NONE'),
('KIOSK_MANAGE', 'Register and authorize on-site property attendance kiosk terminals', 'OPERATIONS', TRUE, 'NONE'),
('LEAVE_REQUEST', 'Submit annual, sick, maternity, study or compassionate leave', 'OPERATIONS', TRUE, 'NONE'),
('LEAVE_VIEW', 'Review team leave applications, balances, and coverage calendars', 'OPERATIONS', TRUE, 'NONE'),
('LEAVE_APPROVE', 'Approve ordinary leave requests within delegated authority', 'OPERATIONS', TRUE, 'NONE'),
('LEAVE_ESCALATE', 'Escalate leave requests exceeding delegated authority to Admin', 'OPERATIONS', TRUE, 'NONE'),
('LEAVE_POLICY_MANAGE', 'Configure leave categories, allotments, and escalation thresholds', 'OPERATIONS', TRUE, 'NONE'),
('TIMESHEET_VIEW', 'Inspect aggregated payroll-ready timesheets and variance reports', 'OPERATIONS', TRUE, 'NONE'),
('TIMESHEET_EXPORT', 'Export payroll-ready CSV timesheets for authorized accounting', 'OPERATIONS', TRUE, 'NONE'),
('PROPERTY_MEDIA_UPLOAD', 'Upload high-resolution property and building photographs', 'PROPERTIES', TRUE, 'NONE'),
('PROPERTY_MEDIA_EDIT', 'Update property photo categories, captions, and cover status', 'PROPERTIES', TRUE, 'NONE'),
('PROPERTY_MEDIA_PUBLISH', 'Authorize public visibility of property photos on web portal', 'PROPERTIES', TRUE, 'NONE'),
('PROPERTY_MEDIA_DELETE', 'Remove obsolete property photographs from building gallery', 'PROPERTIES', TRUE, 'NONE');
