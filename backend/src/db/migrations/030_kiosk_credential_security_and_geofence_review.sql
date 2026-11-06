-- Migration: 030_kiosk_credential_security_and_geofence_review.sql
-- Description: Workspace C Remediation for DEF-C03 (Kiosk Credential Security) and DEF-C02 (Geofence Review Workflow)
-- Workspace: Workspace C (Backend & Database Schema)
-- Priority: High (Security & Workforce Governance)
-- Date: November 2, 2026

-- 1. Ensure property_kiosks.kiosk_secret_hash column has sufficient length for bcrypt hashes (60 chars minimum, 255 allocated)
-- Note: Already VARCHAR(255) in migration 028/029. Verified compatible with 60-character bcrypt output.

-- 2. Add requires_review flag to attendance_records to support fast querying and filtering of flagged exceptions
ALTER TABLE `attendance_records`
  ADD COLUMN IF NOT EXISTS `requires_review` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_verified`,
  ADD INDEX IF NOT EXISTS `idx_att_requires_review` (`requires_review`, `property_id`);

-- 3. Backfill requires_review for existing unverified punches that carry geofence exceptions
UPDATE `attendance_records`
SET `requires_review` = TRUE
WHERE `is_verified` = 0 AND (`verification_notes` LIKE '%GEOFENCE%' OR `verification_notes` LIKE '%GPS%');

-- 4. Operational Rollback SQL:
-- ALTER TABLE `attendance_records` DROP INDEX `idx_att_requires_review`;
-- ALTER TABLE `attendance_records` DROP COLUMN `requires_review`;

