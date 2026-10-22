-- ==============================================================================
-- BFA Apartments Management System
-- Migration: 016_create_automation_confirmations.sql
-- Description: Server-side confirmation and approval store for Phase 12A
--              Intelligent Operations Automation Engine.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS automation_confirmations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  confirmation_token VARCHAR(64) NOT NULL UNIQUE,
  action_id VARCHAR(100) NOT NULL,
  user_id INT NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  property_id INT NULL,
  record_id VARCHAR(100) NULL,
  parameters_hash VARCHAR(64) NOT NULL,
  parameters_payload JSON NOT NULL,
  summary VARCHAR(255) NOT NULL,
  status ENUM('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'EXECUTED') NOT NULL DEFAULT 'PENDING',
  requires_dual_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approver_id INT NULL,
  approver_role VARCHAR(50) NULL,
  approved_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  executed_at DATETIME NULL,
  idempotency_key VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auto_conf_token (confirmation_token),
  INDEX idx_auto_conf_user_status (user_id, status),
  INDEX idx_auto_conf_expires (expires_at),
  INDEX idx_auto_conf_idempotency (idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
