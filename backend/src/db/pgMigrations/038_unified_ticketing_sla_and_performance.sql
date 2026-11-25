-- Migration: 038_unified_ticketing_sla_and_performance.sql (PostgreSQL)
-- Description: Unifies Central Operations & Operational Tasks into a structured Ticket Lifecycle,
--              Priority Acknowledgment SLA & Reminders/Escalation, Reassignment & Deadline History,
--              and Attendance + Ticket Staff Performance Scoring Configuration.

-- 1. Extend central_operations with Ticket Lifecycle, SLA, Extension, Closure & Reopen Metadata
ALTER TABLE central_operations
  ADD COLUMN IF NOT EXISTS ticket_reference VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS acknowledgment_sla_hours INT NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS acknowledgment_deadline_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS first_acknowledged_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS closed_by_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_outcome VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS closure_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS rejected_by_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS rejection_category VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS reassignment_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS escalated_to_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_first_reminder_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS sla_final_reminder_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS extension_status VARCHAR(30) NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS requested_deadline_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS extension_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS extension_requested_by_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extension_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS extension_reviewed_by_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extension_reviewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS extension_review_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS clarification_question TEXT NULL,
  ADD COLUMN IF NOT EXISTS clarification_requested_by_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clarification_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS clarification_response TEXT NULL,
  ADD COLUMN IF NOT EXISTS clarification_responded_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_progress_percent INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_co_ticket_reference ON central_operations (ticket_reference) WHERE ticket_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_co_ack_deadline ON central_operations (acknowledgment_deadline_at);
CREATE INDEX IF NOT EXISTS idx_co_extension_status ON central_operations (extension_status);
CREATE INDEX IF NOT EXISTS idx_co_escalated_at ON central_operations (escalated_at);

-- 2. Extend central_operation_recipients with reassignment & fresh-acknowledgement tracking
ALTER TABLE central_operation_recipients
  ADD COLUMN IF NOT EXISTS reassigned_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_reacknowledgement BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NULL;

-- 3. Relax/update CHECK constraints to support full Priority levels, Ticket statuses, Events & Categories
DO $$
BEGIN
  ALTER TABLE central_operations DROP CONSTRAINT IF EXISTS central_operations_priority_check;
  ALTER TABLE central_operations ADD CONSTRAINT central_operations_priority_check
    CHECK (priority IN ('LOW', 'NORMAL', 'IMPORTANT', 'HIGH', 'URGENT', 'CRITICAL'));

  ALTER TABLE central_operations DROP CONSTRAINT IF EXISTS central_operations_status_check;
  ALTER TABLE central_operations ADD CONSTRAINT central_operations_status_check
    CHECK (status IN (
      'DRAFT', 'OPEN', 'ISSUED', 'PENDING_DELIVERY', 'DELIVERED', 'AWAITING_ACKNOWLEDGEMENT', 'AWAITING_OWNERSHIP',
      'ACKNOWLEDGED', 'ACCEPTED', 'IN_PROGRESS', 'REASSIGNED', 'BLOCKED', 'PENDING_INFORMATION',
      'AWAITING_CLARIFICATION', 'SUBMITTED_FOR_REVIEW', 'AWAITING_REVIEW', 'PENDING_APPROVAL',
      'REVISION_REQUIRED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'OVERDUE', 'ESCALATED', 'CLOSED'
    ));

  ALTER TABLE central_operations DROP CONSTRAINT IF EXISTS central_operations_target_audience_type_check;
  ALTER TABLE central_operations ADD CONSTRAINT central_operations_target_audience_type_check
    CHECK (target_audience_type IN (
      'ALL_MANAGEMENT', 'MANAGERS_ONLY', 'ALL_RECEPTIONISTS', 'ALL_STAFF',
      'PROPERTY_STAFF', 'PROPERTY_RECEPTIONISTS', 'PROPERTY_ALL', 'DEPARTMENT', 'DEPARTMENT_GROUP',
      'SPECIFIC_USERS', 'SPECIFIC_USER', 'MULTI_RECIPIENT_TEAM'
    ));

  ALTER TABLE operational_tasks DROP CONSTRAINT IF EXISTS operational_tasks_priority_check;
  ALTER TABLE operational_tasks ADD CONSTRAINT operational_tasks_priority_check
    CHECK (priority IN ('LOW', 'NORMAL', 'IMPORTANT', 'HIGH', 'URGENT', 'CRITICAL'));

  ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_priority_check;
  ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_priority_check
    CHECK (priority IN ('LOW', 'NORMAL', 'IMPORTANT', 'HIGH', 'URGENT', 'CRITICAL'));

  ALTER TABLE central_operation_recipients DROP CONSTRAINT IF EXISTS central_operation_recipients_acceptance_status_check;
  ALTER TABLE central_operation_recipients ADD CONSTRAINT central_operation_recipients_acceptance_status_check
    CHECK (acceptance_status IN ('PENDING', 'ACKNOWLEDGED', 'ACCEPTED', 'DECLINED', 'CLARIFICATION_REQUESTED', 'REASSIGNED_OUT'));

  ALTER TABLE central_operation_events DROP CONSTRAINT IF EXISTS central_operation_events_event_type_check;
  ALTER TABLE central_operation_events ADD CONSTRAINT central_operation_events_event_type_check
    CHECK (event_type IN (
      'INITIATED', 'ISSUED', 'DELIVERED', 'VIEWED', 'ACKNOWLEDGED', 'ACCEPTED', 'ASSIGNED', 'REASSIGNED',
      'STARTED', 'CLARIFICATION_REQUESTED', 'CLARIFICATION_RESPONDED',
      'PROGRESS_UPDATE', 'PROGRESS_UPDATED', 'BLOCKER_REPORTED', 'BLOCKED', 'BLOCKER_RESOLVED',
      'TASK_LINKED', 'TASK_COMPLETED', 'EXTENSION_REQUESTED', 'EXTENSION_APPROVED', 'EXTENSION_REJECTED',
      'COMPLETION_SUBMITTED', 'REVIEWED', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED',
      'AMENDED', 'CANCELLED', 'CLOSED', 'REOPENED',
      'SLA_REMINDER_SENT', 'ESCALATED', 'OVERDUE_MARKED', 'EVIDENCE_UPLOADED'
    ));

  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_category_check
    CHECK (category IN ('RESERVATION', 'PAYMENT', 'MAINTENANCE', 'COMMUNICATION', 'SECURITY', 'SYSTEM', 'APPROVAL', 'ANNOUNCEMENT', 'TICKET'));
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END $$;

-- 4. Reassignment History Ledger (retains previous owners, reason, actor, and new acknowledgment)
CREATE TABLE IF NOT EXISTS ticket_reassignment_history (
  id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  operation_id INT NOT NULL REFERENCES central_operations(id) ON DELETE CASCADE,
  previous_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  new_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reassigned_by_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  reassigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  new_recipient_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  new_recipient_acknowledged_at TIMESTAMPTZ NULL,
  notification_thread_id INT NULL REFERENCES chat_threads(id) ON DELETE SET NULL,
  notification_message_id INT NULL REFERENCES chat_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_trh_operation ON ticket_reassignment_history (operation_id, reassigned_at);
CREATE INDEX IF NOT EXISTS idx_trh_prev_user ON ticket_reassignment_history (previous_user_id);
CREATE INDEX IF NOT EXISTS idx_trh_new_user ON ticket_reassignment_history (new_user_id);

-- 5. Deadline Change & Extension History Ledger
CREATE TABLE IF NOT EXISTS ticket_deadline_history (
  id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  operation_id INT NOT NULL REFERENCES central_operations(id) ON DELETE CASCADE,
  previous_deadline_at TIMESTAMPTZ NULL,
  new_deadline_at TIMESTAMPTZ NOT NULL,
  change_type VARCHAR(40) NOT NULL CHECK (change_type IN ('INITIAL', 'EXTENSION_APPROVED', 'AMENDMENT')),
  reason TEXT NULL,
  requested_by_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_by_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tdh_operation ON ticket_deadline_history (operation_id, created_at);

-- 6. Idempotent Reminder & Escalation Delivery Audit Table
CREATE TABLE IF NOT EXISTS ticket_reminder_logs (
  id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  operation_id INT NOT NULL REFERENCES central_operations(id) ON DELETE CASCADE,
  recipient_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_stage VARCHAR(60) NOT NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'ALL',
  delivery_status VARCHAR(30) NOT NULL DEFAULT 'SENT' CHECK (delivery_status IN ('PENDING', 'SENT', 'FAILED')),
  attempt_count INT NOT NULL DEFAULT 1,
  last_error TEXT NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_trl_op_user_stage UNIQUE (operation_id, recipient_user_id, reminder_stage)
);

CREATE INDEX IF NOT EXISTS idx_trl_operation_stage ON ticket_reminder_logs (operation_id, reminder_stage);

-- 7. Seed Default Ticket SLA Hours & Staff Performance Weights into system_settings
INSERT INTO system_settings (category, setting_key, setting_value, description)
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
  )
ON CONFLICT (setting_key) DO NOTHING;

-- 8. Backfill ticket_reference & ack SLA for any preserved operations
UPDATE central_operations
SET ticket_reference = COALESCE(ticket_reference, operation_code),
    acknowledgment_sla_hours = CASE priority
      WHEN 'CRITICAL' THEN 3
      WHEN 'URGENT' THEN 6
      WHEN 'HIGH' THEN 6
      WHEN 'LOW' THEN 24
      ELSE 12
    END,
    acknowledgment_deadline_at = COALESCE(
      acknowledgment_deadline_at,
      COALESCE(created_at, CURRENT_TIMESTAMP) + (
        CASE priority
          WHEN 'CRITICAL' THEN INTERVAL '3 hours'
          WHEN 'URGENT' THEN INTERVAL '6 hours'
          WHEN 'HIGH' THEN INTERVAL '6 hours'
          WHEN 'LOW' THEN INTERVAL '24 hours'
          ELSE INTERVAL '12 hours'
        END
      )
    )
WHERE ticket_reference IS NULL OR acknowledgment_deadline_at IS NULL;
