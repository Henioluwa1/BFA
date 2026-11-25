-- ============================================================
-- Migration 040: Contact Inquiry / Client Service Ticket System
-- BFA Apartments Management System
-- Forward-only | MySQL + PostgreSQL compatible
-- ============================================================

-- 1. Contact Inquiries — the primary service ticket table
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- References
  inquiry_reference VARCHAR(30) NOT NULL UNIQUE COMMENT 'Internal reference e.g. BFA-INQ-202611-0001',
  client_access_code_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt hash of secure client-facing code',
  client_access_code_salt VARCHAR(255) NOT NULL COMMENT 'bcrypt salt',
  client_access_token VARCHAR(60) NULL COMMENT 'Short-lived session token after code verification',
  access_token_expires_at TIMESTAMP NULL,

  -- Client identity
  client_name VARCHAR(150) NOT NULL,
  client_email VARCHAR(255) NULL,
  client_phone VARCHAR(40) NULL,
  matched_guest_id INT NULL COMMENT 'FK to guests.id when matched',
  matched_user_id INT NULL COMMENT 'FK to users.id when matched',
  booking_reference VARCHAR(50) NULL COMMENT 'Booking number supplied by client',
  matched_reservation_id INT NULL COMMENT 'Resolved reservation FK',
  is_new_client TINYINT(1) NOT NULL DEFAULT 0,
  match_confidence VARCHAR(20) NOT NULL DEFAULT 'NONE' COMMENT 'NONE, LOW, MEDIUM, HIGH, EXACT',

  -- Inquiry classification
  property_id INT NULL,
  inquiry_department VARCHAR(80) NOT NULL COMMENT 'Preserves client-selected department',
  inquiry_category VARCHAR(80) NULL,
  inquiry_subject VARCHAR(255) NULL,
  inquiry_message TEXT NOT NULL,
  attachment_path TEXT NULL COMMENT 'Optional uploaded file path',
  attachment_filename VARCHAR(255) NULL,
  attachment_mime VARCHAR(100) NULL,

  -- Assignment
  assigned_receptionist_id INT NULL,
  assigned_manager_id INT NULL,
  current_assignee_id INT NOT NULL COMMENT 'Active responsible staff member',
  current_assignee_role VARCHAR(40) NOT NULL DEFAULT 'MANAGER',
  routing_reason VARCHAR(100) NULL COMMENT 'Why routing decision was made',

  -- SLA
  response_sla_minutes INT NOT NULL DEFAULT 90 COMMENT 'Minutes from submission to first meaningful response',
  response_sla_deadline_at TIMESTAMP NOT NULL,
  response_sla_met TINYINT(1) NULL,
  sla_breached_at TIMESTAMP NULL,
  first_response_at TIMESTAMP NULL,
  first_response_by_id INT NULL,

  -- Status lifecycle
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
    COMMENT 'OPEN, ASSIGNED, IN_PROGRESS, RESPONDED, PENDING_CLIENT, ESCALATED, RESOLVED, CLOSED',
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' COMMENT 'LOW, NORMAL, HIGH, URGENT, CRITICAL',
  escalated_to_id INT NULL,
  escalated_at TIMESTAMP NULL,
  escalation_reason TEXT NULL,
  resolution_note TEXT NULL,
  resolved_by_id INT NULL,
  resolved_at TIMESTAMP NULL,
  closed_by_id INT NULL,
  closed_at TIMESTAMP NULL,

  -- Client feedback
  client_feedback_rating INT NULL COMMENT '1-5 stars',
  client_feedback_text TEXT NULL,
  client_marked_resolved TINYINT(1) NULL,
  feedback_submitted_at TIMESTAMP NULL,

  -- Audit
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_ip VARCHAR(60) NULL,
  lookup_attempt_count INT NOT NULL DEFAULT 0 COMMENT 'Rate limit counter',
  lookup_last_attempt_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ci_reference (inquiry_reference),
  INDEX idx_ci_property (property_id),
  INDEX idx_ci_assignee (current_assignee_id, status),
  INDEX idx_ci_receptionist (assigned_receptionist_id),
  INDEX idx_ci_status (status, submitted_at),
  INDEX idx_ci_sla (response_sla_deadline_at, response_sla_met),
  INDEX idx_ci_guest (matched_guest_id),
  INDEX idx_ci_reservation (matched_reservation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Inquiry Messages — two-way conversation thread
CREATE TABLE IF NOT EXISTS inquiry_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT NOT NULL,

  -- Who sent it
  sender_type VARCHAR(10) NOT NULL COMMENT 'CLIENT or STAFF',
  sender_user_id INT NULL COMMENT 'NULL for client messages',
  sender_display_name VARCHAR(150) NULL COMMENT 'Displayed name in UI',

  -- Content
  message_body TEXT NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Internal staff notes — never shown to client',
  is_client_response TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Counts as SLA-qualifying staff response when sender_type=STAFF',

  -- Attachments
  attachment_path TEXT NULL,
  attachment_filename VARCHAR(255) NULL,
  attachment_mime VARCHAR(100) NULL,
  attachment_size_bytes INT NULL,

  -- Read tracking
  read_by_staff_at TIMESTAMP NULL,
  read_by_client_at TIMESTAMP NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_im_inquiry (inquiry_id, created_at),
  INDEX idx_im_sender (sender_type, sender_user_id),
  INDEX idx_im_sla (is_client_response, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Inquiry Assignment History — full audit trail
CREATE TABLE IF NOT EXISTS inquiry_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT NOT NULL,
  previous_assignee_id INT NULL,
  previous_assignee_role VARCHAR(40) NULL,
  new_assignee_id INT NOT NULL,
  new_assignee_role VARCHAR(40) NOT NULL,
  assigned_by_id INT NOT NULL COMMENT 'Manager or system making the assignment',
  assignment_reason TEXT NULL,
  routing_type VARCHAR(40) NULL COMMENT 'INITIAL, ESCALATION, REASSIGNMENT, SLA_BREACH, RECEPTIONIST_UNAVAILABLE',
  sla_inherited TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Does new assignee inherit previous SLA?',
  new_sla_deadline_at TIMESTAMP NULL COMMENT 'Fresh SLA start for new assignee',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_ia_inquiry (inquiry_id, created_at),
  INDEX idx_ia_assignee (new_assignee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Inquiry SLA Logs — idempotent reminder tracking
CREATE TABLE IF NOT EXISTS inquiry_sla_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT NOT NULL,
  assignee_id INT NOT NULL,
  sla_stage VARCHAR(60) NOT NULL COMMENT 'ASSIGNED, REMINDER_30MIN, REMINDER_15MIN, BREACHED, ESCALATED',
  sla_deadline_at TIMESTAMP NOT NULL,
  sla_met TINYINT(1) NULL,
  breached_at TIMESTAMP NULL,
  notification_sent TINYINT(1) NOT NULL DEFAULT 0,
  notification_sent_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_isl_inquiry_stage (inquiry_id, assignee_id, sla_stage),
  INDEX idx_isl_inquiry (inquiry_id),
  INDEX idx_isl_deadline (sla_deadline_at, notification_sent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
