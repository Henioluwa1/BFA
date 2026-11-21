-- Migration: 036_operations_memo_central_system.sql
-- Description: Provision Central Operations and Directives Management System,
--              Operations Memos (formal documents), Operational Recipients & Acknowledgements,
--              Audit Event Ledger, and Chat Context Integration.

-- 1. Central Operations Table
CREATE TABLE IF NOT EXISTS central_operations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(60) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(50) NOT NULL DEFAULT 'ISSUED',
  initiated_by_user_id INT NOT NULL,
  property_id INT NULL,
  target_audience_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  purpose TEXT NOT NULL,
  operational_instructions TEXT NOT NULL,
  expected_outcome TEXT NULL,
  responsibility_definition TEXT NULL,
  reporting_requirements TEXT NULL,
  deadline_at TIMESTAMP NULL,
  effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  chat_thread_id INT NULL,
  chat_message_id INT NULL,
  latest_memo_id INT NULL,
  supervisor_user_id INT NULL,
  completed_at TIMESTAMP NULL,
  closed_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  cancellation_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_co_initiator (initiated_by_user_id),
  INDEX idx_co_property (property_id),
  INDEX idx_co_status (status),
  INDEX idx_co_priority (priority),
  INDEX idx_co_category (category),
  INDEX idx_co_deadline (deadline_at),
  INDEX idx_co_thread (chat_thread_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Operations Memos Table (Formal Versioned Memoranda)
CREATE TABLE IF NOT EXISTS operations_memos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  memo_reference VARCHAR(50) NOT NULL UNIQUE,
  version_number INT NOT NULL DEFAULT 1,
  issuer_user_id INT NOT NULL,
  issuer_designation VARCHAR(100) NOT NULL,
  recipient_summary VARCHAR(255) NOT NULL,
  property_scope_summary VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(60) NOT NULL,
  priority VARCHAR(20) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  purpose TEXT NOT NULL,
  operational_instructions TEXT NOT NULL,
  expected_outcome TEXT NULL,
  responsibility_definition TEXT NULL,
  reporting_requirements TEXT NULL,
  deadline_text VARCHAR(100) NULL,
  effective_date_text VARCHAR(100) NULL,
  document_storage_id INT NULL,
  amendment_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_memo_op_ver (operation_id, version_number),
  INDEX idx_om_operation (operation_id),
  INDEX idx_om_reference (memo_reference),
  INDEX idx_om_storage (document_storage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Central Operation Recipients Table
CREATE TABLE IF NOT EXISTS central_operation_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  user_id INT NOT NULL,
  role_at_time VARCHAR(50) NULL,
  delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  viewed_at TIMESTAMP NULL,
  acknowledged_at TIMESTAMP NULL,
  acknowledgement_note TEXT NULL,
  acceptance_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cor_op_user (operation_id, user_id),
  INDEX idx_cor_user_ack (user_id, acknowledged_at),
  INDEX idx_cor_operation (operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Central Operation Events Table (Audit Trail)
CREATE TABLE IF NOT EXISTS central_operation_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_summary VARCHAR(255) NOT NULL,
  event_details JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coe_operation (operation_id, created_at),
  INDEX idx_coe_actor (actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
