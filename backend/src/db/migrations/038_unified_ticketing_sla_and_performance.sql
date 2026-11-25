-- Migration: 038_unified_ticketing_sla_and_performance.sql (MySQL / MariaDB)
-- Description: Unifies Central Operations & Operational Tasks into a structured Ticket Lifecycle,
--              Priority Acknowledgment SLA & Reminders/Escalation, Reassignment & Deadline History,
--              and Attendance + Ticket Staff Performance Scoring Configuration.

-- 1. Extend central_operations with Ticket Lifecycle, SLA, Extension, Closure & Reopen Metadata
ALTER TABLE central_operations
  ADD COLUMN IF NOT EXISTS ticket_reference VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS acknowledgment_sla_hours INT NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS acknowledgment_deadline_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS first_acknowledged_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS closed_by_user_id INT NULL,
  ADD COLUMN IF NOT EXISTS closure_outcome VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS closure_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS rejected_by_user_id INT NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS rejection_category VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS reassignment_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS escalated_to_user_id INT NULL,
  ADD COLUMN IF NOT EXISTS sla_first_reminder_sent_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS sla_final_reminder_sent_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS extension_status VARCHAR(30) NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS requested_deadline_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS extension_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS extension_requested_by_id INT NULL,
  ADD COLUMN IF NOT EXISTS extension_requested_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS extension_reviewed_by_id INT NULL,
  ADD COLUMN IF NOT EXISTS extension_reviewed_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS extension_review_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS clarification_question TEXT NULL,
  ADD COLUMN IF NOT EXISTS clarification_requested_by_id INT NULL,
  ADD COLUMN IF NOT EXISTS clarification_requested_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS clarification_response TEXT NULL,
  ADD COLUMN IF NOT EXISTS clarification_responded_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS last_progress_percent INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_co_ticket_reference ON central_operations (ticket_reference);
CREATE INDEX IF NOT EXISTS idx_co_ack_deadline ON central_operations (acknowledgment_deadline_at);
CREATE INDEX IF NOT EXISTS idx_co_extension_status ON central_operations (extension_status);
CREATE INDEX IF NOT EXISTS idx_co_escalated_at ON central_operations (escalated_at);

-- 2. Extend central_operation_recipients with reassignment & fresh-acknowledgement tracking
ALTER TABLE central_operation_recipients
  ADD COLUMN IF NOT EXISTS reassigned_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_reacknowledgement BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP NULL;

-- 3. Reassignment History Ledger
CREATE TABLE IF NOT EXISTS ticket_reassignment_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  previous_user_id INT NULL,
  new_user_id INT NOT NULL,
  reassigned_by_id INT NOT NULL,
  reason TEXT NOT NULL,
  reassigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  new_recipient_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  new_recipient_acknowledged_at TIMESTAMP NULL,
  notification_thread_id INT NULL,
  notification_message_id INT NULL,
  INDEX idx_trh_operation (operation_id, reassigned_at),
  INDEX idx_trh_prev_user (previous_user_id),
  INDEX idx_trh_new_user (new_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Deadline Change & Extension History Ledger
CREATE TABLE IF NOT EXISTS ticket_deadline_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  previous_deadline_at TIMESTAMP NULL,
  new_deadline_at TIMESTAMP NOT NULL,
  change_type VARCHAR(40) NOT NULL,
  reason TEXT NULL,
  requested_by_id INT NULL,
  approved_by_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tdh_operation (operation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Idempotent Reminder & Escalation Delivery Audit Table
CREATE TABLE IF NOT EXISTS ticket_reminder_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  recipient_user_id INT NOT NULL,
  reminder_stage VARCHAR(60) NOT NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'ALL',
  delivery_status VARCHAR(30) NOT NULL DEFAULT 'SENT',
  attempt_count INT NOT NULL DEFAULT 1,
  last_error TEXT NULL,
  dispatched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trl_op_user_stage (operation_id, recipient_user_id, reminder_stage),
  INDEX idx_trl_operation_stage (operation_id, reminder_stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Seed Default Ticket SLA Hours & Staff Performance Weights into system_settings
INSERT IGNORE INTO system_settings (category, setting_key, setting_value, description)
VALUES
  (
    'ticketing',
    'ticket_ack_sla_hours',
    '{"CRITICAL":3,"URGENT":6,"HIGH":6,"NORMAL":12,"IMPORTANT":12,"LOW":24}',
    'Priority-based ticket acknowledgment SLA in hours (Owner-configurable 3-24 hours)'
  ),
  (
    'performance',
    'performance_scoring_weights',
    '{"attendance":20,"acknowledgment":15,"execution":30,"quality":20,"workload":15}',
    'Configurable staff performance scoring weights totaling 100%'
  ),
  (
    'performance',
    'performance_min_ticket_threshold',
    '3',
    'Minimum assessed ticket sample required before full scored evaluation rating without insufficient-data qualification'
  );

-- 7. Backfill ticket_reference & ack SLA for any preserved operations
UPDATE central_operations
SET ticket_reference = COALESCE(ticket_reference, operation_code),
    acknowledgment_sla_hours = CASE priority
      WHEN 'CRITICAL' THEN 3
      WHEN 'URGENT' THEN 6
      WHEN 'HIGH' THEN 6
      WHEN 'LOW' THEN 24
      ELSE 12
    END
WHERE ticket_reference IS NULL;
