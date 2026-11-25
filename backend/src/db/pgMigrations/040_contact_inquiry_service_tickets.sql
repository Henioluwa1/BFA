-- ============================================================
-- Migration 040: Contact Inquiry / Client Service Ticket System (PostgreSQL)
-- BFA Apartments Management System
-- Forward-only | PostgreSQL 18.7 compatible
-- ============================================================

-- 1. Contact Inquiries — the primary service ticket table
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id SERIAL PRIMARY KEY,

  -- References
  inquiry_reference VARCHAR(30) NOT NULL UNIQUE,
  client_access_code_hash VARCHAR(255) NOT NULL,
  client_access_code_salt VARCHAR(255) NOT NULL,
  client_access_token VARCHAR(255) NULL,
  access_token_expires_at TIMESTAMPTZ NULL,

  -- Client identity
  client_name VARCHAR(150) NOT NULL,
  client_email VARCHAR(255) NULL,
  client_phone VARCHAR(40) NULL,
  matched_guest_id INT NULL,
  matched_user_id INT NULL,
  booking_reference VARCHAR(50) NULL,
  matched_reservation_id INT NULL,
  is_new_client BOOLEAN NOT NULL DEFAULT FALSE,
  match_confidence VARCHAR(20) NOT NULL DEFAULT 'NONE',

  -- Inquiry classification
  property_id INT NULL,
  inquiry_department VARCHAR(80) NOT NULL,
  inquiry_category VARCHAR(80) NULL,
  inquiry_subject VARCHAR(255) NULL,
  inquiry_message TEXT NOT NULL,
  attachment_path TEXT NULL,
  attachment_filename VARCHAR(255) NULL,
  attachment_mime VARCHAR(100) NULL,

  -- Assignment
  assigned_receptionist_id INT NULL,
  assigned_manager_id INT NULL,
  current_assignee_id INT NOT NULL,
  current_assignee_role VARCHAR(40) NOT NULL DEFAULT 'MANAGER',
  routing_reason VARCHAR(100) NULL,

  -- SLA
  response_sla_minutes INT NOT NULL DEFAULT 90,
  response_sla_deadline_at TIMESTAMPTZ NOT NULL,
  response_sla_met BOOLEAN NULL,
  sla_breached_at TIMESTAMPTZ NULL,
  first_response_at TIMESTAMPTZ NULL,
  first_response_by_id INT NULL,

  -- Status lifecycle
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  escalated_to_id INT NULL,
  escalated_at TIMESTAMPTZ NULL,
  escalation_reason TEXT NULL,
  resolution_note TEXT NULL,
  resolved_by_id INT NULL,
  resolved_at TIMESTAMPTZ NULL,
  closed_by_id INT NULL,
  closed_at TIMESTAMPTZ NULL,

  -- Client feedback
  client_feedback_rating INT NULL,
  client_feedback_text TEXT NULL,
  client_marked_resolved BOOLEAN NULL,
  feedback_submitted_at TIMESTAMPTZ NULL,

  -- Audit
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_ip VARCHAR(60) NULL,
  lookup_attempt_count INT NOT NULL DEFAULT 0,
  lookup_last_attempt_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ci_reference ON contact_inquiries (inquiry_reference);
CREATE INDEX IF NOT EXISTS idx_ci_property ON contact_inquiries (property_id);
CREATE INDEX IF NOT EXISTS idx_ci_assignee ON contact_inquiries (current_assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_ci_receptionist ON contact_inquiries (assigned_receptionist_id);
CREATE INDEX IF NOT EXISTS idx_ci_status ON contact_inquiries (status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_ci_sla ON contact_inquiries (response_sla_deadline_at, response_sla_met);
CREATE INDEX IF NOT EXISTS idx_ci_guest ON contact_inquiries (matched_guest_id);
CREATE INDEX IF NOT EXISTS idx_ci_reservation ON contact_inquiries (matched_reservation_id);

-- 2. Inquiry Messages — two-way conversation thread
CREATE TABLE IF NOT EXISTS inquiry_messages (
  id SERIAL PRIMARY KEY,
  inquiry_id INT NOT NULL,

  -- Who sent it
  sender_type VARCHAR(10) NOT NULL,
  sender_user_id INT NULL,
  sender_display_name VARCHAR(150) NULL,

  -- Content
  message_body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  is_client_response BOOLEAN NOT NULL DEFAULT FALSE,

  -- Attachments
  attachment_path TEXT NULL,
  attachment_filename VARCHAR(255) NULL,
  attachment_mime VARCHAR(100) NULL,
  attachment_size_bytes INT NULL,

  -- Read tracking
  read_by_staff_at TIMESTAMPTZ NULL,
  read_by_client_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_im_inquiry ON inquiry_messages (inquiry_id, created_at);
CREATE INDEX IF NOT EXISTS idx_im_sender ON inquiry_messages (sender_type, sender_user_id);
CREATE INDEX IF NOT EXISTS idx_im_sla ON inquiry_messages (is_client_response, created_at);

-- 3. Inquiry Assignment History — full audit trail
CREATE TABLE IF NOT EXISTS inquiry_assignments (
  id SERIAL PRIMARY KEY,
  inquiry_id INT NOT NULL,
  previous_assignee_id INT NULL,
  previous_assignee_role VARCHAR(40) NULL,
  new_assignee_id INT NOT NULL,
  new_assignee_role VARCHAR(40) NOT NULL,
  assigned_by_id INT NOT NULL,
  assignment_reason TEXT NULL,
  routing_type VARCHAR(40) NULL,
  sla_inherited BOOLEAN NOT NULL DEFAULT FALSE,
  new_sla_deadline_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ia_inquiry ON inquiry_assignments (inquiry_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ia_assignee ON inquiry_assignments (new_assignee_id);

-- 4. Inquiry SLA Logs — idempotent reminder tracking
CREATE TABLE IF NOT EXISTS inquiry_sla_logs (
  id SERIAL PRIMARY KEY,
  inquiry_id INT NOT NULL,
  assignee_id INT NOT NULL,
  sla_stage VARCHAR(60) NOT NULL,
  sla_deadline_at TIMESTAMPTZ NOT NULL,
  sla_met BOOLEAN NULL,
  breached_at TIMESTAMPTZ NULL,
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  notification_sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (inquiry_id, assignee_id, sla_stage)
);

CREATE INDEX IF NOT EXISTS idx_isl_inquiry ON inquiry_sla_logs (inquiry_id);
CREATE INDEX IF NOT EXISTS idx_isl_deadline ON inquiry_sla_logs (sla_deadline_at, notification_sent);
