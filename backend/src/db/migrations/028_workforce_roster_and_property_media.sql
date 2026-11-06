-- Migration: 028_workforce_roster_and_property_media.sql
-- Description: Provision Workforce Roster Management, Employee Availability, Attendance, Leave Management,
--              Timesheet Records, and Expand Media Assets for Multiple Property Images.

-- 1. Shift Templates Table (Reusable shift configurations)
CREATE TABLE IF NOT EXISTS `shift_templates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NULL,
  `department` ENUM('FRONT_DESK', 'HOUSEKEEPING', 'MAINTENANCE', 'SECURITY', 'MANAGEMENT', 'OPERATIONS', 'OTHER') NOT NULL DEFAULT 'OPERATIONS',
  `name` VARCHAR(100) NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `break_minutes` INT NOT NULL DEFAULT 60,
  `required_staff_count` INT NOT NULL DEFAULT 1,
  `color_code` VARCHAR(20) NOT NULL DEFAULT '#2563eb',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_st_prop` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
  INDEX `idx_st_prop_dept` (`property_id`, `department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Rosters Table (Weekly/Monthly schedule headers)
CREATE TABLE IF NOT EXISTS `rosters` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `roster_code` VARCHAR(50) NOT NULL UNIQUE,
  `property_id` INT NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `notes` TEXT NULL,
  `created_by_id` INT NOT NULL,
  `published_by_id` INT NULL,
  `published_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_roster_prop` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_roster_created_by` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_roster_pub_by` FOREIGN KEY (`published_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_roster_prop_dates` (`property_id`, `start_date`, `end_date`),
  INDEX `idx_roster_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Scheduled Shifts Table (Individual duty shifts)
CREATE TABLE IF NOT EXISTS `shifts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `roster_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `department` ENUM('FRONT_DESK', 'HOUSEKEEPING', 'MAINTENANCE', 'SECURITY', 'MANAGEMENT', 'OPERATIONS', 'OTHER') NOT NULL DEFAULT 'OPERATIONS',
  `employee_id` INT NULL,
  `template_id` INT NULL,
  `shift_date` DATE NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `break_minutes` INT NOT NULL DEFAULT 60,
  `status` ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SWAPPED') NOT NULL DEFAULT 'SCHEDULED',
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_shift_roster` FOREIGN KEY (`roster_id`) REFERENCES `rosters`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_shift_prop` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_shift_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_shift_tmpl` FOREIGN KEY (`template_id`) REFERENCES `shift_templates`(`id`) ON DELETE SET NULL,
  INDEX `idx_shift_emp_date` (`employee_id`, `shift_date`),
  INDEX `idx_shift_prop_date` (`property_id`, `shift_date`),
  INDEX `idx_shift_roster` (`roster_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Employee Availability Preferences
CREATE TABLE IF NOT EXISTS `employee_availability` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `availability_status` ENUM('AVAILABLE', 'UNAVAILABLE', 'PREFERRED') NOT NULL DEFAULT 'AVAILABLE',
  `preferred_shift_id` INT NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ea_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ea_tmpl` FOREIGN KEY (`preferred_shift_id`) REFERENCES `shift_templates`(`id`) ON DELETE SET NULL,
  UNIQUE KEY `uq_emp_date` (`employee_id`, `date`),
  INDEX `idx_ea_emp_date` (`employee_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Shift Swap Requests (Peer-to-peer coverage workflow)
CREATE TABLE IF NOT EXISTS `shift_swap_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `shift_id` INT NOT NULL,
  `requesting_employee_id` INT NOT NULL,
  `target_employee_id` INT NULL,
  `target_shift_id` INT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by_id` INT NULL,
  `review_notes` VARCHAR(255) NULL,
  `reviewed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_swap_shift` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_swap_req_emp` FOREIGN KEY (`requesting_employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_swap_tgt_emp` FOREIGN KEY (`target_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_swap_rev_by` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_swap_status` (`status`),
  INDEX `idx_swap_req_emp` (`requesting_employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Attendance & Time Tracking Records
CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `shift_id` INT NULL,
  `work_date` DATE NOT NULL,
  `clock_in_time` DATETIME NOT NULL,
  `clock_out_time` DATETIME NULL,
  `break_start_time` DATETIME NULL,
  `break_end_time` DATETIME NULL,
  `total_break_minutes` INT NOT NULL DEFAULT 0,
  `scheduled_hours` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `actual_hours` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `overtime_hours` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `attendance_status` ENUM('PRESENT', 'LATE', 'HALF_DAY', 'EARLY_DEPARTURE', 'ABSENT', 'ON_LEAVE') NOT NULL DEFAULT 'PRESENT',
  `clock_in_method` ENUM('WEB', 'MOBILE_LOCATION', 'KIOSK', 'MANUAL') NOT NULL DEFAULT 'WEB',
  `location_lat` DECIMAL(10,8) NULL,
  `location_lng` DECIMAL(11,8) NULL,
  `verification_notes` VARCHAR(255) NULL,
  `is_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `verified_by_id` INT NULL,
  `verified_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_att_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_prop` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_att_shift` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_att_ver_by` FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_att_emp_date` (`employee_id`, `work_date`),
  INDEX `idx_att_prop_date` (`property_id`, `work_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Attendance Correction Requests (Maker-checker timesheet corrections)
CREATE TABLE IF NOT EXISTS `attendance_corrections` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `attendance_record_id` INT NOT NULL,
  `employee_id` INT NOT NULL,
  `requested_clock_in` DATETIME NOT NULL,
  `requested_clock_out` DATETIME NOT NULL,
  `reason` TEXT NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by_id` INT NULL,
  `review_notes` VARCHAR(255) NULL,
  `reviewed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ac_rec` FOREIGN KEY (`attendance_record_id`) REFERENCES `attendance_records`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ac_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ac_rev_by` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_ac_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Leave Categories Table
CREATE TABLE IF NOT EXISTS `leave_categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `default_days_per_year` INT NOT NULL DEFAULT 14,
  `is_paid` BOOLEAN NOT NULL DEFAULT TRUE,
  `requires_document` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Leave Requests Table
CREATE TABLE IF NOT EXISTS `leave_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `request_code` VARCHAR(50) NOT NULL UNIQUE,
  `employee_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `leave_category_id` INT NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `total_days` INT NOT NULL DEFAULT 1,
  `reason` TEXT NOT NULL,
  `document_url` VARCHAR(255) NULL,
  `status` ENUM('PENDING_MANAGER', 'PENDING_ADMIN', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_MANAGER',
  `manager_reviewed_by_id` INT NULL,
  `manager_decision` ENUM('APPROVED', 'REJECTED', 'ESCALATED') NULL,
  `manager_notes` TEXT NULL,
  `manager_reviewed_at` TIMESTAMP NULL,
  `admin_reviewed_by_id` INT NULL,
  `admin_decision` ENUM('APPROVED', 'REJECTED') NULL,
  `admin_notes` TEXT NULL,
  `admin_reviewed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_lr_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lr_prop` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_lr_cat` FOREIGN KEY (`leave_category_id`) REFERENCES `leave_categories`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_lr_mgr_by` FOREIGN KEY (`manager_reviewed_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_lr_adm_by` FOREIGN KEY (`admin_reviewed_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_lr_emp_dates` (`employee_id`, `start_date`, `end_date`),
  INDEX `idx_lr_prop_status` (`property_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Leave Balances Table
CREATE TABLE IF NOT EXISTS `leave_balances` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `leave_category_id` INT NOT NULL,
  `year` INT NOT NULL,
  `total_allocated` DECIMAL(5,2) NOT NULL DEFAULT 14.00,
  `used_days` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `pending_days` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `remaining_days` DECIMAL(5,2) NOT NULL DEFAULT 14.00,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_lb_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lb_cat` FOREIGN KEY (`leave_category_id`) REFERENCES `leave_categories`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_emp_cat_year` (`employee_id`, `leave_category_id`, `year`),
  INDEX `idx_lb_emp_year` (`employee_id`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Modify Media Assets category to support comprehensive building spaces
ALTER TABLE `media_assets` MODIFY COLUMN `category` VARCHAR(50) NOT NULL DEFAULT 'BUILDING_EXTERIOR';

-- 12. Seed Configurable Leave Categories
INSERT INTO `leave_categories` (`code`, `name`, `description`, `default_days_per_year`, `is_paid`, `requires_document`)
VALUES 
  ('ANNUAL', 'Annual Vacation Leave', 'Standard statutory paid annual leave allowance', 20, TRUE, FALSE),
  ('SICK', 'Sick Leave', 'Medical absence leave (requires medical certificate for >2 days)', 12, TRUE, TRUE),
  ('EMERGENCY', 'Emergency Leave', 'Short-notice compassionate or family emergency leave', 5, TRUE, FALSE),
  ('UNPAID', 'Unpaid Leave of Absence', 'Authorized leave without salary remuneration', 30, FALSE, FALSE),
  ('COMPASSIONATE', 'Compassionate / Bereavement Leave', 'Bereavement leave for immediate family members', 5, TRUE, FALSE),
  ('MATERNITY_PATERNITY', 'Parental Leave', 'Parental leave following childbirth or adoption', 60, TRUE, TRUE)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 13. Seed Dynamic Workforce & Media Capabilities
INSERT INTO `capabilities` (`name`, `category`, `description`, `restriction_level`, `is_enabled`)
VALUES 
  ('ROSTER_VIEW', 'WORKFORCE', 'View daily, weekly, and monthly workforce schedules and shifts', 'ROLE_RESTRICTED', TRUE),
  ('ROSTER_CREATE', 'WORKFORCE', 'Create shift rosters and schedule shifts for staff', 'ROLE_RESTRICTED', TRUE),
  ('ROSTER_EDIT', 'WORKFORCE', 'Edit and reschedule assigned shifts', 'ROLE_RESTRICTED', TRUE),
  ('ROSTER_PUBLISH', 'WORKFORCE', 'Publish official rosters and broadcast shift notices', 'ROLE_RESTRICTED', TRUE),
  ('SHIFT_ASSIGN', 'WORKFORCE', 'Assign employees to duty shifts', 'ROLE_RESTRICTED', TRUE),
  ('SHIFT_SWAP_REQUEST', 'WORKFORCE', 'Submit peer shift swap or coverage requests', 'ROLE_RESTRICTED', TRUE),
  ('SHIFT_SWAP_APPROVE', 'WORKFORCE', 'Review, approve, or reject employee shift swaps', 'ROLE_RESTRICTED', TRUE),
  ('AVAILABILITY_MANAGE', 'WORKFORCE', 'Submit and maintain work availability preferences', 'ROLE_RESTRICTED', TRUE),
  ('ATTENDANCE_CLOCK', 'WORKFORCE', 'Perform authorized clock-in, break, and clock-out events', 'ROLE_RESTRICTED', TRUE),
  ('ATTENDANCE_VIEW', 'WORKFORCE', 'View employee attendance logs and timestamps', 'ROLE_RESTRICTED', TRUE),
  ('ATTENDANCE_CORRECT_REQUEST', 'WORKFORCE', 'Request timesheet correction for missed punch', 'ROLE_RESTRICTED', TRUE),
  ('ATTENDANCE_CORRECT_APPROVE', 'WORKFORCE', 'Approve or reject attendance correction requests', 'ROLE_RESTRICTED', TRUE),
  ('LEAVE_REQUEST', 'WORKFORCE', 'Submit time-off and leave requests', 'ROLE_RESTRICTED', TRUE),
  ('LEAVE_VIEW', 'WORKFORCE', 'View leave requests and remaining balances', 'ROLE_RESTRICTED', TRUE),
  ('LEAVE_APPROVE', 'WORKFORCE', 'Approve or reject delegated leave requests', 'ROLE_RESTRICTED', TRUE),
  ('LEAVE_POLICY_MANAGE', 'WORKFORCE', 'Configure corporate leave policies and entitlements', 'ROLE_RESTRICTED', TRUE),
  ('TIMESHEET_VIEW', 'WORKFORCE', 'View calculated scheduled versus actual working hours', 'ROLE_RESTRICTED', TRUE),
  ('TIMESHEET_EXPORT', 'WORKFORCE', 'Export payroll-preparation timesheet reports (CSV/Excel)', 'ROLE_RESTRICTED', TRUE),
  ('PROPERTY_MEDIA_UPLOAD', 'PROPERTIES', 'Upload multiple building images and captions', 'ROLE_RESTRICTED', TRUE),
  ('PROPERTY_MEDIA_PUBLISH', 'PROPERTIES', 'Review, order, and publish property gallery media', 'ROLE_RESTRICTED', TRUE)
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

