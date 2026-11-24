-- Migration: 037_operations_connected_task_ownership.sql
-- Description: Establish connected Operation-to-Task model with explicit responsibility ownership,
--              group-vs-individual assignment, unambiguous next actions, and enhanced status lifecycle.

-- 1. Add Ownership and Next Action columns to central_operations
ALTER TABLE central_operations ADD COLUMN IF NOT EXISTS current_responsible_user_id INT NULL;
ALTER TABLE central_operations ADD COLUMN IF NOT EXISTS current_responsible_group VARCHAR(60) NULL;
ALTER TABLE central_operations ADD COLUMN IF NOT EXISTS next_action TEXT NULL;
ALTER TABLE central_operations ADD COLUMN IF NOT EXISTS execution_plan TEXT NULL;
ALTER TABLE central_operations ADD COLUMN IF NOT EXISTS completion_evidence_url TEXT NULL;
ALTER TABLE central_operations ADD COLUMN IF NOT EXISTS completion_notes TEXT NULL;
ALTER TABLE central_operations ADD COLUMN IF NOT EXISTS review_notes TEXT NULL;
ALTER TABLE central_operations ADD COLUMN IF NOT EXISTS reviewed_by_user_id INT NULL;
ALTER TABLE central_operations ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP NULL;

-- 2. Indexes for fast query lookup
CREATE INDEX IF NOT EXISTS idx_co_responsible_user ON central_operations (current_responsible_user_id);
CREATE INDEX IF NOT EXISTS idx_co_responsible_group ON central_operations (current_responsible_group);

-- 3. Backfill existing operations
UPDATE central_operations co
SET current_responsible_user_id = (
  SELECT cor.user_id 
  FROM central_operation_recipients cor 
  WHERE cor.operation_id = co.id 
  ORDER BY cor.id ASC 
  LIMIT 1
)
WHERE co.current_responsible_user_id IS NULL AND co.target_audience_type = 'SPECIFIC_USER';

UPDATE central_operations co
SET current_responsible_group = co.target_audience_type
WHERE co.current_responsible_group IS NULL AND co.target_audience_type != 'SPECIFIC_USER';

UPDATE central_operations
SET next_action = CASE 
  WHEN status = 'ISSUED' THEN 'Awaiting recipient acknowledgement from designated personnel.'
  WHEN status = 'ACKNOWLEDGED' AND current_responsible_user_id IS NULL THEN 'Awaiting ownership: an eligible member must accept responsibility or supervisor must assign.'
  WHEN status = 'ACKNOWLEDGED' AND current_responsible_user_id IS NOT NULL THEN 'Responsibility accepted. Review directives and begin operational execution.'
  WHEN status = 'IN_PROGRESS' THEN 'Execute directives and submit progress update or completion evidence.'
  WHEN status = 'BLOCKED' THEN 'Operational blocker reported. Supervisor intervention required.'
  WHEN status = 'COMPLETED' THEN 'Operation completed and verified. No further action required.'
  ELSE 'Review directive instructions.'
END
WHERE next_action IS NULL;
