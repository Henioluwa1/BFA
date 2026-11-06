-- Migration: 031_maintenance_evidence_and_dispatch_verification.sql
-- Description: Stage 2.5B Maintenance Evidence and Dispatch Verification
-- Workspace: Workspace C (Backend & Database Schema)
-- Date: November 3, 2026

-- 1. Extend operational_evidence_attachments to support maintenance work orders and reference snapshots
ALTER TABLE `operational_evidence_attachments`
  ADD COLUMN IF NOT EXISTS `maintenance_id` INT NULL AFTER `case_id`,
  ADD COLUMN IF NOT EXISTS `work_order_reference` VARCHAR(50) NULL AFTER `maintenance_id`;

-- 2. Add foreign key constraint safely if not already present
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'operational_evidence_attachments' AND CONSTRAINT_NAME = 'fk_oea_maintenance');
SET @add_fk = IF(@fk_exists = 0, 'ALTER TABLE `operational_evidence_attachments` ADD CONSTRAINT `fk_oea_maintenance` FOREIGN KEY (`maintenance_id`) REFERENCES `maintenance_requests`(`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @add_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Add performance and retrieval indexes
ALTER TABLE `operational_evidence_attachments`
  ADD INDEX IF NOT EXISTS `idx_oea_maintenance_cat` (`maintenance_id`, `evidence_category`),
  ADD INDEX IF NOT EXISTS `idx_oea_work_order_ref` (`work_order_reference`);

-- 4. Add index on maintenance_requests(assigned_to_id, status) for fast active workload and dispatch queries
ALTER TABLE `maintenance_requests`
  ADD INDEX IF NOT EXISTS `idx_maint_assigned_status` (`assigned_to_id`, `status`);

-- 5. Seed maintenance settings into system_settings if not already present
INSERT INTO `system_settings` (`category`, `setting_key`, `setting_value`, `description`)
VALUES
  ('maintenance', 'maintenance_evidence_retention_days', '1825', 'Provisional default retention period in days for private maintenance evidence attachments'),
  ('maintenance', 'maintenance_workload_warning_threshold', '5', 'Active work orders threshold to trigger advisory overload warning during dispatch')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

