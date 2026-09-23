-- Migration: 006_access_control_and_capabilities.sql
-- Description: Authoritative Capability Policy Engine, Access Restrictions, Approval Requests, and Overrides

-- 1. Capabilities Table
CREATE TABLE IF NOT EXISTS capabilities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  restriction_level ENUM('NONE', 'MANAGER_RESTRICTED', 'OWNER_RESTRICTED') NOT NULL DEFAULT 'NONE',
  restricted_by_id INT NULL,
  restricted_by_role VARCHAR(50) NULL,
  restricted_at TIMESTAMP NULL,
  restriction_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cap_name (name),
  INDEX idx_cap_enabled (is_enabled),
  INDEX idx_cap_restriction (restriction_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Access Approval Requests Table (Super Admin request to Owner)
CREATE TABLE IF NOT EXISTS access_approval_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  capability_id INT NOT NULL,
  requested_by_id INT NOT NULL,
  target_role VARCHAR(50) NOT NULL DEFAULT 'OWNER',
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'BYPASSED_FORCE') NOT NULL DEFAULT 'PENDING',
  request_reason TEXT NOT NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_id INT NULL,
  reviewed_at TIMESTAMP NULL,
  review_notes TEXT NULL,
  FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE,
  INDEX idx_req_status (status),
  INDEX idx_req_capability (capability_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Access Overrides Table
CREATE TABLE IF NOT EXISTS access_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  capability_id INT NOT NULL,
  override_type ENUM('OWNER_APPROVED', 'SUPER_ADMIN_FORCED') NOT NULL,
  applied_by_id INT NOT NULL,
  applied_by_role VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE,
  INDEX idx_ovr_cap_active (capability_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed Baseline Reusable System Capabilities
INSERT IGNORE INTO capabilities (name, description, category, is_enabled, restriction_level) VALUES
('PAY_AT_PROPERTY', 'Allow guests to reserve and pay physically upon arrival', 'PAYMENT', TRUE, 'NONE'),
('ONLINE_PAYMENT', 'Allow guests to complete payment online during booking', 'PAYMENT', TRUE, 'NONE'),
('ONLINE_BOOKING', 'Allow public visitors to initiate reservations online', 'RESERVATION', TRUE, 'NONE'),
('PUBLIC_AVAILABILITY', 'Allow public visibility into real-time apartment availability', 'RESERVATION', TRUE, 'NONE'),
('PUBLIC_BOOKING', 'Allow creation of public bookings without operational staff login', 'RESERVATION', TRUE, 'NONE'),
('BOOKING_CANCELLATION', 'Allow guest or staff cancellation of active reservations', 'RESERVATION', TRUE, 'NONE'),
('MANUAL_RESERVATION', 'Allow internal staff to create phone/walk-in reservations', 'RESERVATION', TRUE, 'NONE'),
('AGENT_BOOKING', 'Allow third-party agent partner reservation bookings', 'AGENTS', TRUE, 'NONE'),
('DISCOUNTS', 'Allow manual promotional price overrides on unit rates', 'FINANCIAL', FALSE, 'NONE'),
('REFUNDS', 'Allow processing and recording of payment refunds', 'FINANCIAL', TRUE, 'NONE'),
('EXPENSE_APPROVAL', 'Require managerial approval for operational expenses', 'FINANCIAL', TRUE, 'NONE'),
('REPORT_EXPORT', 'Allow exporting confidential operational and financial records', 'REPORTS', TRUE, 'NONE'),
('COMMUNICATION_SEND', 'Allow broadcasting company communications and memos', 'COMMUNICATION', TRUE, 'NONE'),
('COMMUNICATION_APPROVE', 'Authorize approval of pending draft communications', 'COMMUNICATION', TRUE, 'NONE'),
('SYSTEM_ANNOUNCEMENTS', 'Publish system and property-level public announcements', 'COMMUNICATION', TRUE, 'NONE'),
('BROADCAST_NOTIFICATIONS', 'Send urgent notifications to all operational user roles', 'NOTIFICATIONS', TRUE, 'NONE');
