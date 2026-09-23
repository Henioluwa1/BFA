-- Migration: 002_create_core_system_tables.sql
-- Description: Core settings and audit trail foundation for BFA Apartments Management System

-- 1. System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_setting_category (category),
  INDEX idx_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed baseline initial settings if not present
INSERT IGNORE INTO system_settings (category, setting_key, setting_value, description) VALUES
('company', 'company_name', 'BFA Apartments', 'Company Legal and Trading Name'),
('company', 'company_email', 'info@bfa-apartments.com', 'Primary operational email'),
('company', 'company_phone', '+234 800 BFA APARTS', 'Primary contact phone'),
('company', 'default_currency', 'NGN', 'Base operational currency'),
('general', 'system_timezone', 'UTC', 'System default timezone standard'),
('general', 'app_version', '1.0.0', 'Platform core version'),
('reservations', 'require_deposit_percentage', '20', 'Default deposit required upon reservation (%)'),
('reservations', 'allow_overbooking', 'false', 'Strict non-negotiable double booking prevention flag');

-- 2. Audit Logs Table (Section 25 Compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NULL,
  actor_email VARCHAR(191) NULL,
  actor_role VARCHAR(50) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_actor (actor_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
