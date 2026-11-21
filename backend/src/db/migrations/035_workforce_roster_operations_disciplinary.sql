-- Migration: 035_workforce_roster_operations_disciplinary.sql
-- Description: Provision integrated operational workforce management, Admin directives,
--              property roster assignments, operational tasks and blockers, disciplinary queries,
--              performance improvement plans, staff reports, reporting ledger, chat priority & acknowledgements.

-- 1. Operational Directives
CREATE TABLE IF NOT EXISTS operational_directives (
  id INT AUTO_INCREMENT PRIMARY KEY,
  directive_code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  target_outcome TEXT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(50) NOT NULL DEFAULT 'ISSUED',
  property_id INT NULL,
  initiated_by_admin_id INT NOT NULL,
  assigned_manager_id INT NULL,
  deadline_date DATE NULL,
  manager_execution_plan TEXT NULL,
  manager_plan_submitted_at TIMESTAMP NULL,
  admin_review_notes TEXT NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_directives_admin (initiated_by_admin_id),
  INDEX idx_directives_mgr (assigned_manager_id),
  INDEX idx_directives_prop (property_id),
  INDEX idx_directives_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Admin Direct Assignment Emergency Overrides Audit Table
CREATE TABLE IF NOT EXISTS admin_assignment_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  override_code VARCHAR(50) NOT NULL UNIQUE,
  admin_user_id INT NOT NULL,
  target_staff_user_id INT NOT NULL,
  property_id INT NOT NULL,
  reason TEXT NOT NULL,
  assignment_reference VARCHAR(50) NULL,
  notified_manager_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aao_admin (admin_user_id),
  INDEX idx_aao_staff (target_staff_user_id),
  INDEX idx_aao_prop (property_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Roster Property Assignments Table
CREATE TABLE IF NOT EXISTS roster_property_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_code VARCHAR(50) NOT NULL UNIQUE,
  staff_user_id INT NOT NULL,
  property_id INT NOT NULL,
  assigned_by_id INT NOT NULL,
  classification VARCHAR(50) NOT NULL DEFAULT 'GENERAL_STAFF',
  duty_category VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  instructions TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'SENT',
  is_admin_override BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT NULL,
  viewed_at TIMESTAMP NULL,
  accepted_at TIMESTAMP NULL,
  rejected_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  clarification_requested_at TIMESTAMP NULL,
  clarification_text TEXT NULL,
  manager_response TEXT NULL,
  manager_responded_at TIMESTAMP NULL,
  acceptance_deadline_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rpa_staff (staff_user_id),
  INDEX idx_rpa_prop_dates (property_id, start_date, end_date),
  INDEX idx_rpa_status (status),
  INDEX idx_rpa_assigned_by (assigned_by_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Operational Tasks Table
CREATE TABLE IF NOT EXISTS operational_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_code VARCHAR(50) NOT NULL UNIQUE,
  property_id INT NOT NULL,
  apartment_id INT NULL,
  assignment_id INT NULL,
  directive_id INT NULL,
  assigned_to_id INT NOT NULL,
  assigned_by_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  expected_outcome TEXT NULL,
  task_category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  start_date DATE NULL,
  due_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  materials_used TEXT NULL,
  completion_notes TEXT NULL,
  completed_at TIMESTAMP NULL,
  reviewed_by_id INT NULL,
  reviewed_at TIMESTAMP NULL,
  review_notes TEXT NULL,
  review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_opt_assigned_to (assigned_to_id),
  INDEX idx_opt_prop_status (property_id, status),
  INDEX idx_opt_due_date (due_date),
  INDEX idx_opt_assignment (assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Task Blockers Table
CREATE TABLE IF NOT EXISTS task_blockers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  reported_by_id INT NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  resolved_by_id INT NULL,
  resolved_at TIMESTAMP NULL,
  resolution_notes TEXT NULL,
  INDEX idx_tb_task (task_id),
  INDEX idx_tb_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Disciplinary Queries Table
CREATE TABLE IF NOT EXISTS disciplinary_queries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  query_code VARCHAR(50) NOT NULL UNIQUE,
  staff_user_id INT NOT NULL,
  issued_by_id INT NOT NULL,
  property_id INT NOT NULL,
  linked_task_id INT NULL,
  subject VARCHAR(200) NOT NULL,
  allegation_details TEXT NOT NULL,
  evidence_summary TEXT NULL,
  response_deadline_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'ISSUED',
  viewed_at TIMESTAMP NULL,
  staff_response TEXT NULL,
  staff_responded_at TIMESTAMP NULL,
  manager_assessment TEXT NULL,
  outcome_decision VARCHAR(50) NULL,
  outcome_notes TEXT NULL,
  sanction_approved_by_id INT NULL,
  sanction_approved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dq_staff (staff_user_id),
  INDEX idx_dq_prop_status (property_id, status),
  INDEX idx_dq_issued_by (issued_by_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Performance Improvement Plans Table
CREATE TABLE IF NOT EXISTS performance_improvement_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pip_code VARCHAR(50) NOT NULL UNIQUE,
  staff_user_id INT NOT NULL,
  manager_id INT NOT NULL,
  property_id INT NOT NULL,
  linked_query_id INT NULL,
  concerns_summary TEXT NOT NULL,
  improvement_objectives TEXT NOT NULL,
  coaching_training_plan TEXT NOT NULL,
  start_date DATE NOT NULL,
  review_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  follow_up_notes TEXT NULL,
  is_positive_recognition BOOLEAN NOT NULL DEFAULT FALSE,
  recognition_title VARCHAR(150) NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pip_staff (staff_user_id),
  INDEX idx_pip_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Staff-Submitted Operational Reports
CREATE TABLE IF NOT EXISTS staff_operational_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_code VARCHAR(50) NOT NULL UNIQUE,
  staff_user_id INT NOT NULL,
  property_id INT NOT NULL,
  assignment_id INT NULL,
  task_id INT NULL,
  report_type VARCHAR(50) NOT NULL DEFAULT 'DAILY_ACTIVITY',
  summary TEXT NOT NULL,
  details TEXT NOT NULL,
  materials_used TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
  manager_id INT NULL,
  manager_feedback TEXT NULL,
  manager_reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sor_staff (staff_user_id),
  INDEX idx_sor_prop_status (property_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Operational Reports Ledger
CREATE TABLE IF NOT EXISTS operational_reports_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_reference VARCHAR(50) NOT NULL UNIQUE,
  reporting_period_type VARCHAR(20) NOT NULL,
  reporting_date DATE NOT NULL,
  end_date DATE NULL,
  role_target VARCHAR(20) NOT NULL,
  target_user_id INT NULL,
  property_id INT NULL,
  title VARCHAR(200) NOT NULL,
  content_snapshot JSON NOT NULL,
  version_number INT NOT NULL DEFAULT 1,
  parent_report_id INT NULL,
  correction_reason TEXT NULL,
  is_finalised BOOLEAN NOT NULL DEFAULT TRUE,
  generated_by_id INT NOT NULL,
  acknowledged_by_id INT NULL,
  acknowledged_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orl_period (reporting_period_type, reporting_date),
  INDEX idx_orl_role_target (role_target, target_user_id),
  INDEX idx_orl_property (property_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Operational Report Requests
CREATE TABLE IF NOT EXISTS operational_report_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_reference VARCHAR(50) NOT NULL UNIQUE,
  requested_by_id INT NOT NULL,
  recipient_id INT NOT NULL,
  property_id INT NULL,
  reporting_period VARCHAR(50) NOT NULL,
  instructions TEXT NULL,
  due_date TIMESTAMP NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  response_report_id INT NULL,
  acknowledged_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orr_recipient (recipient_id, status),
  INDEX idx_orr_requester (requested_by_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Chat Enhancements: Priority, Context Entity Types, Message Acknowledgements
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL';

CREATE TABLE IF NOT EXISTS chat_message_acknowledgements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  viewed_at TIMESTAMP NULL,
  acknowledged_at TIMESTAMP NULL,
  UNIQUE KEY uq_msg_user_ack (message_id, user_id),
  INDEX idx_cma_user_ack (user_id, acknowledged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. Operational Documents Storage
CREATE TABLE IF NOT EXISTS operational_documents_storage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes INT NOT NULL,
  file_data LONGBLOB NOT NULL,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ods_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
