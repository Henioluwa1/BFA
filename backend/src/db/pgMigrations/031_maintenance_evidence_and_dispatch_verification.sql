-- Migration: 031_maintenance_evidence_and_dispatch_verification.sql
-- Description: Stage 2.5B Maintenance Evidence and Dispatch Verification
-- Workspace: Workspace C (Backend & Database Schema)
-- Date: November 3, 2026

-- 1. Extend operational_evidence_attachments to support maintenance work orders and reference snapshots
ALTER TABLE operational_evidence_attachments
  ADD COLUMN IF NOT EXISTS maintenance_id INT NULL;
ALTER TABLE operational_evidence_attachments
  ADD COLUMN IF NOT EXISTS work_order_reference VARCHAR(50) NULL;

-- 2. Add the FK if absent; fail closed if its name exists with another definition.
DO $$ BEGIN
  ALTER TABLE operational_evidence_attachments ADD CONSTRAINT fk_oea_maintenance FOREIGN KEY (maintenance_id) REFERENCES maintenance_requests(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Add performance and retrieval indexes
CREATE INDEX IF NOT EXISTS idx_oea_maintenance_cat ON operational_evidence_attachments (maintenance_id, evidence_category);
CREATE INDEX IF NOT EXISTS idx_oea_work_order_ref ON operational_evidence_attachments (work_order_reference);

-- 4. Add index on maintenance_requests(assigned_to_id, status) for fast active workload and dispatch queries
CREATE INDEX IF NOT EXISTS idx_maint_assigned_status ON maintenance_requests (assigned_to_id, status);

-- 5. Seed maintenance settings into system_settings if not already present
INSERT INTO system_settings (category, setting_key, setting_value, description)
VALUES
  ('maintenance', 'maintenance_evidence_retention_days', '1825', 'Provisional default retention period in days for private maintenance evidence attachments'),
  ('maintenance', 'maintenance_workload_warning_threshold', '5', 'Active work orders threshold to trigger advisory overload warning during dispatch')
ON CONFLICT (setting_key) DO UPDATE SET description = EXCLUDED.description;

