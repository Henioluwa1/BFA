-- Migration: 031_maintenance_evidence_and_dispatch_verification.sql
-- Description: Stage 2.5B Maintenance Evidence and Dispatch Verification
-- Workspace: Workspace C (Backend & Database Schema)
-- Date: November 3, 2026

-- 1. Extend operational_evidence_attachments to support maintenance work orders and reference snapshots
ALTER TABLE `operational_evidence_attachments`
  ADD COLUMN IF NOT EXISTS `maintenance_id` INT NULL AFTER `case_id`;
ALTER TABLE `operational_evidence_attachments`
  ADD COLUMN IF NOT EXISTS `work_order_reference` VARCHAR(50) NULL AFTER `maintenance_id`;

-- 2. Add the FK if absent; fail closed if its name exists with another definition.
SET @fk_named_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operational_evidence_attachments'
    AND CONSTRAINT_NAME = 'fk_oea_maintenance'
);
SET @fk_valid = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS tc
  JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
    ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
   AND rc.TABLE_NAME = tc.TABLE_NAME
   AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
  WHERE tc.CONSTRAINT_SCHEMA = DATABASE() AND tc.TABLE_SCHEMA = DATABASE()
    AND tc.TABLE_NAME = 'operational_evidence_attachments'
    AND tc.CONSTRAINT_NAME = 'fk_oea_maintenance'
    AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND rc.DELETE_RULE = 'SET NULL' AND rc.UPDATE_RULE = 'NO ACTION'
    AND (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE kcu
         WHERE kcu.CONSTRAINT_SCHEMA = DATABASE() AND kcu.TABLE_SCHEMA = DATABASE()
           AND kcu.TABLE_NAME = 'operational_evidence_attachments'
           AND kcu.CONSTRAINT_NAME = 'fk_oea_maintenance') = 1
    AND EXISTS (SELECT 1 FROM information_schema.KEY_COLUMN_USAGE kcu
                WHERE kcu.CONSTRAINT_SCHEMA = DATABASE() AND kcu.TABLE_SCHEMA = DATABASE()
                  AND kcu.TABLE_NAME = 'operational_evidence_attachments'
                  AND kcu.CONSTRAINT_NAME = 'fk_oea_maintenance'
                  AND kcu.COLUMN_NAME = 'maintenance_id'
                  AND kcu.REFERENCED_TABLE_SCHEMA = DATABASE()
                  AND kcu.REFERENCED_TABLE_NAME = 'maintenance_requests'
                  AND kcu.REFERENCED_COLUMN_NAME = 'id'
                  AND kcu.ORDINAL_POSITION = 1)
);
SET @add_fk := IF(@fk_valid = 1, 'SELECT 1',
  IF(@fk_named_exists = 0,
    'ALTER TABLE `operational_evidence_attachments` ADD CONSTRAINT `fk_oea_maintenance` FOREIGN KEY (`maintenance_id`) REFERENCES `maintenance_requests`(`id`) ON DELETE SET NULL',
    'SELECT * FROM `__BFA_FK_DEFINITION_MISMATCH_fk_oea_maintenance__`'));
PREPARE stmt_oea_maintenance_fk FROM @add_fk;
EXECUTE stmt_oea_maintenance_fk;
DEALLOCATE PREPARE stmt_oea_maintenance_fk;

-- 3. Add performance and retrieval indexes
ALTER TABLE `operational_evidence_attachments`
  ADD INDEX IF NOT EXISTS `idx_oea_maintenance_cat` (`maintenance_id`, `evidence_category`);
ALTER TABLE `operational_evidence_attachments`
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

