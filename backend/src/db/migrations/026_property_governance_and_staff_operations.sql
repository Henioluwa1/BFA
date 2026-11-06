-- Migration: 026_property_governance_and_staff_operations.sql
-- Description: Multi-property scoping, media assets, dual-review publications, operational cases,
--              staff incidents, evidence attachments, claim desk history, receipts, and decoupled apartment readiness.

-- 1. Multi-Property Assignments
CREATE TABLE IF NOT EXISTS `user_property_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `assigned_by_id` INT NOT NULL,
  `assigned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_upa_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_upa_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_upa_assigned_by` FOREIGN KEY (`assigned_by_id`) REFERENCES `users`(`id`),
  UNIQUE KEY `uq_user_property` (`user_id`, `property_id`),
  INDEX `idx_upa_user` (`user_id`),
  INDEX `idx_upa_prop` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Property Submissions for Dual Review
CREATE TABLE IF NOT EXISTS `property_submissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submission_code` VARCHAR(50) NOT NULL UNIQUE,
  `property_id` INT NOT NULL,
  `version_number` INT NOT NULL DEFAULT 1,
  `submission_type` ENUM('NEW_PROPERTY', 'CONTENT_UPDATE', 'PHOTO_UPDATE') NOT NULL,
  `status` ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED_BY_ADMIN', 'APPROVED_BY_OWNER', 'FULLY_APPROVED', 'PUBLISHED', 'REJECTED') DEFAULT 'DRAFT',
  `content_snapshot` JSON NOT NULL,
  `submitted_by_id` INT NOT NULL,
  `submitted_at` TIMESTAMP NULL,
  `admin_review_status` ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED') DEFAULT 'PENDING',
  `admin_reviewed_by_id` INT NULL,
  `admin_reviewed_at` TIMESTAMP NULL,
  `admin_decision_notes` TEXT NULL,
  `owner_review_status` ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED') DEFAULT 'PENDING',
  `owner_reviewed_by_id` INT NULL,
  `owner_reviewed_at` TIMESTAMP NULL,
  `owner_decision_notes` TEXT NULL,
  `published_at` TIMESTAMP NULL,
  `published_by_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_sub_prop` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sub_submitted_by` FOREIGN KEY (`submitted_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_sub_admin_rev` FOREIGN KEY (`admin_reviewed_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_sub_owner_rev` FOREIGN KEY (`owner_reviewed_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_sub_prop_status` (`property_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Review Comments (Targeted Feedback)
CREATE TABLE IF NOT EXISTS `property_review_comments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submission_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `target_type` ENUM('PROPERTY', 'APARTMENT', 'MEDIA_ASSET') NOT NULL,
  `target_id` INT NOT NULL,
  `author_id` INT NOT NULL,
  `author_role` ENUM('OWNER', 'ADMIN', 'MANAGER') NOT NULL,
  `comment_type` ENUM('GENERAL_FEEDBACK', 'CORRECTION_REQUIRED', 'APPROVAL_NOTE', 'REJECTION_REASON') NOT NULL,
  `content` TEXT NOT NULL,
  `resolution_status` ENUM('OPEN', 'RESOLVED', 'SUPERSEDED') DEFAULT 'OPEN',
  `resolved_by_id` INT NULL,
  `resolved_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_prc_submission` FOREIGN KEY (`submission_id`) REFERENCES `property_submissions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_prc_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_prc_author` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_prc_resolved_by` FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_com_sub_target` (`submission_id`, `target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Shared Media Assets Table
CREATE TABLE IF NOT EXISTS `media_assets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `entity_type` ENUM('PROPERTY', 'APARTMENT') NOT NULL,
  `entity_id` INT NOT NULL,
  `category` ENUM('EXTERIOR', 'GROUNDS', 'FACILITIES', 'INTERIOR', 'AMENITY') NOT NULL DEFAULT 'INTERIOR',
  `file_path` VARCHAR(255) NOT NULL,
  `file_name` VARCHAR(150) NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(50) NOT NULL,
  `file_size_bytes` INT NOT NULL,
  `caption` VARCHAR(200) NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_representative` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_published` BOOLEAN NOT NULL DEFAULT FALSE,
  `submission_id` INT NULL,
  `uploaded_by` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_media_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_media_submission` FOREIGN KEY (`submission_id`) REFERENCES `property_submissions`(`id`) ON DELETE SET NULL,
  INDEX `idx_media_lookup` (`entity_type`, `entity_id`, `category`, `is_published`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Structured Operational Cases
CREATE TABLE IF NOT EXISTS `operational_cases` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `case_code` VARCHAR(50) NOT NULL UNIQUE,
  `property_id` INT NOT NULL,
  `apartment_id` INT NULL,
  `reservation_id` INT NULL,
  `category` ENUM('GUEST_COMPLAINT', 'MAINTENANCE', 'CLEANING', 'PAYMENT_DISCREPANCY', 'SAFETY', 'PROPERTY_REVIEW', 'OTHER') NOT NULL,
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `status` ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'AWAITING_VERIFICATION', 'RESOLVED', 'REOPENED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NOT NULL,
  `reported_by_id` INT NOT NULL,
  `assigned_to_id` INT NULL,
  `resolved_by_id` INT NULL,
  `resolved_at` TIMESTAMP NULL,
  `resolution_notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_oc_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_oc_apartment` FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_oc_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_oc_reported_by` FOREIGN KEY (`reported_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_oc_assigned_to` FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_oc_resolved_by` FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_case_prop_status` (`property_id`, `status`),
  INDEX `idx_case_assigned` (`assigned_to_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Structured Staff Incidents (Disciplinary & Due-Process Telemetry)
CREATE TABLE IF NOT EXISTS `staff_incidents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `incident_code` VARCHAR(50) NOT NULL UNIQUE,
  `staff_user_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `case_id` INT NULL,
  `incident_type` ENUM('UNAUTHORIZED_ABSENCE', 'CASH_VARIANCE', 'UNVERIFIED_CHECKIN', 'GUEST_COMPLAINT', 'UNAUTHORIZED_DISCOUNT', 'SAFETY_BREACH', 'INSUBORDINATION', 'OTHER') NOT NULL,
  `severity` ENUM('MINOR', 'MODERATE', 'MAJOR', 'GROSS_MISCONDUCT') NOT NULL DEFAULT 'MINOR',
  `status` ENUM('PENDING_STAFF_EXPLANATION', 'STAFF_RESPONDED', 'AWAITING_REVIEW_NO_RESPONSE', 'UNDER_INVESTIGATION', 'UPHELD', 'DISMISSED', 'APPEALED') NOT NULL DEFAULT 'PENDING_STAFF_EXPLANATION',
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NOT NULL,
  `reported_by_id` INT NOT NULL,
  `response_deadline_at` TIMESTAMP NULL,
  `staff_response` TEXT NULL,
  `staff_responded_at` TIMESTAMP NULL,
  `extension_requested_at` TIMESTAMP NULL,
  `extension_granted_hours` INT DEFAULT 0,
  `investigated_by_id` INT NULL,
  `outcome_notes` TEXT NULL,
  `penalty_type` ENUM('NONE', 'WRITTEN_WARNING', 'PERFORMANCE_DEDUCTION', 'SUSPENSION', 'TERMINATION') DEFAULT 'NONE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_si_staff_user` FOREIGN KEY (`staff_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_si_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_si_case` FOREIGN KEY (`case_id`) REFERENCES `operational_cases`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_si_reported_by` FOREIGN KEY (`reported_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_si_investigated_by` FOREIGN KEY (`investigated_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_si_staff_status` (`staff_user_id`, `status`),
  INDEX `idx_si_prop_date` (`property_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Operational Evidence Attachments
CREATE TABLE IF NOT EXISTS `operational_evidence_attachments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `case_id` INT NULL,
  `property_id` INT NOT NULL,
  `apartment_id` INT NULL,
  `reservation_id` INT NULL,
  `evidence_category` ENUM('DAMAGE', 'DEFECT', 'MAINTENANCE_BEFORE', 'MAINTENANCE_AFTER', 'CLEANING_RESULT', 'INSPECTION_CHECK', 'MISSING_ITEM', 'BANK_TRANSFER_SLIP', 'IDENTIFICATION', 'OTHER') NOT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `file_name` VARCHAR(150) NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(50) NOT NULL,
  `file_size_bytes` INT NOT NULL,
  `caption` VARCHAR(255) NULL,
  `uploaded_by_id` INT NOT NULL,
  `verification_status` ENUM('PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'REPLACEMENT_REQUIRED') DEFAULT 'PENDING_REVIEW',
  `verified_by_id` INT NULL,
  `verified_at` TIMESTAMP NULL,
  `verification_notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_oea_case` FOREIGN KEY (`case_id`) REFERENCES `operational_cases`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oea_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_oea_apartment` FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_oea_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_oea_uploaded_by` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_oea_verified_by` FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_oea_case` (`case_id`),
  INDEX `idx_oea_prop` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Historical Staff Assignments Ledger
CREATE TABLE IF NOT EXISTS `reservation_staff_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `reservation_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `assigned_receptionist_id` INT NOT NULL,
  `assignment_type` ENUM('INITIAL_CLAIM', 'MANAGER_REASSIGNED', 'SHIFT_HANDOVER', 'ESCALATION') NOT NULL,
  `assigned_by_id` INT NOT NULL,
  `service_status` ENUM('AWAITING_ASSIGNMENT', 'CLAIMED', 'GUEST_CONTACTED', 'FOLLOW_UP_REQUIRED', 'SERVICE_IN_PROGRESS', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'REASSIGNED', 'ESCALATED') DEFAULT 'CLAIMED',
  `contact_attempt_count` INT NOT NULL DEFAULT 0,
  `last_contact_at` TIMESTAMP NULL,
  `handover_notes` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `claimed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `ended_at` TIMESTAMP NULL,
  `reassignment_reason` VARCHAR(255) NULL,
  CONSTRAINT `fk_rsa_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rsa_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rsa_receptionist` FOREIGN KEY (`assigned_receptionist_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_rsa_assigned_by` FOREIGN KEY (`assigned_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_rsa_res_active` (`reservation_id`, `is_active`),
  INDEX `idx_rsa_staff_date` (`assigned_receptionist_id`, `claimed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Authoritative Payment Receipts (No Cascade Delete)
CREATE TABLE IF NOT EXISTS `payment_receipts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `receipt_number` VARCHAR(50) NOT NULL UNIQUE,
  `reservation_id` INT NOT NULL,
  `payment_transaction_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `apartment_id` INT NULL,
  `payer_name` VARCHAR(150) NOT NULL,
  `payer_email` VARCHAR(191) NULL,
  `payer_phone` VARCHAR(50) NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'NGN',
  `payment_method` ENUM('CASH', 'BANK_TRANSFER', 'POS', 'CARD', 'ONLINE') NOT NULL,
  `payment_status` ENUM('PAID', 'PARTIAL', 'REVERSED', 'VOIDED') NOT NULL DEFAULT 'PAID',
  `verification_status` ENUM('VERIFIED', 'UNVERIFIED_REPORTED', 'REJECTED') NOT NULL DEFAULT 'VERIFIED',
  `verified_by_id` INT NULL,
  `verified_at` TIMESTAMP NULL,
  `issued_by_id` INT NOT NULL,
  `issued_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `receipt_status` ENUM('ORIGINAL', 'REISSUED', 'VOIDED') DEFAULT 'ORIGINAL',
  `original_receipt_id` INT NULL,
  `void_reason` VARCHAR(255) NULL,
  `pdf_path` VARCHAR(255) NULL,
  `verification_token` VARCHAR(64) NOT NULL UNIQUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_pr_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pr_transaction` FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pr_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pr_apartment` FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pr_issued_by` FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_pr_verified_by` FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_pr_original_receipt` FOREIGN KEY (`original_receipt_id`) REFERENCES `payment_receipts`(`id`) ON DELETE SET NULL,
  INDEX `idx_rec_res` (`reservation_id`),
  INDEX `idx_rec_txn` (`payment_transaction_id`),
  INDEX `idx_rec_token` (`verification_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Decoupled Housekeeping & Maintenance from Occupancy
SET @exist_hk_col := (SELECT COUNT(*) FROM information_schema.COLUMNS 
                      WHERE TABLE_SCHEMA = DATABASE() 
                        AND TABLE_NAME = 'apartments' 
                        AND COLUMN_NAME = 'housekeeping_status');

SET @add_readiness_sql := IF(@exist_hk_col = 0, 
  'ALTER TABLE `apartments`
     ADD COLUMN `housekeeping_status` ENUM(\'DIRTY\', \'CLEANING_IN_PROGRESS\', \'CLEANED\', \'INSPECTED_READY\') NOT NULL DEFAULT \'INSPECTED_READY\' AFTER `status`,
     ADD COLUMN `maintenance_status` ENUM(\'OPERATIONAL\', \'INSPECTION_REQUIRED\', \'UNDER_REPAIR\', \'OUT_OF_ORDER\') NOT NULL DEFAULT \'OPERATIONAL\' AFTER `housekeeping_status`,
     ADD INDEX `idx_apt_readiness` (`property_id`, `housekeeping_status`, `maintenance_status`, `status`)',
  'SELECT "housekeeping_status already exists on apartments"');

PREPARE stmt_readiness FROM @add_readiness_sql;
EXECUTE stmt_readiness;
DEALLOCATE PREPARE stmt_readiness;

