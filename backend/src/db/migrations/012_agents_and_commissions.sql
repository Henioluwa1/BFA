-- Migration: 012_agents_and_commissions.sql
-- Description: Expand agents profile and commission parameters, and provision authoritative commissions ledger

-- 1. Expand agents table
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS agency_name VARCHAR(150) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS commission_type ENUM('PERCENTAGE', 'FIXED') NOT NULL DEFAULT 'PERCENTAGE' AFTER commission_rate,
  ADD COLUMN IF NOT EXISTS property_id INT NULL AFTER commission_type,
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100) NULL AFTER property_id,
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(50) NULL AFTER bank_name,
  ADD COLUMN IF NOT EXISTS account_name VARCHAR(150) NULL AFTER account_number,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER account_name,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD CONSTRAINT fk_agent_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  ADD INDEX IF NOT EXISTS idx_agent_property (property_id),
  ADD INDEX IF NOT EXISTS idx_agent_status (status);

-- 2. Create authoritative commissions table
CREATE TABLE IF NOT EXISTS commissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  commission_code VARCHAR(50) NOT NULL UNIQUE,
  agent_id INT NOT NULL,
  reservation_id INT NOT NULL,
  property_id INT NOT NULL,
  booking_amount DECIMAL(10, 2) NOT NULL,
  commission_rate DECIMAL(10, 2) NOT NULL,
  commission_type ENUM('PERCENTAGE', 'FIXED') NOT NULL DEFAULT 'PERCENTAGE',
  commission_amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  status ENUM('PENDING', 'CALCULATED', 'APPROVED', 'PAID', 'CANCELLED', 'VOIDED') NOT NULL DEFAULT 'PENDING',
  calculated_at TIMESTAMP NULL,
  approved_by_id INT NULL,
  approved_at TIMESTAMP NULL,
  paid_by_id INT NULL,
  paid_at TIMESTAMP NULL,
  payment_reference VARCHAR(100) NULL,
  payment_method VARCHAR(50) NULL,
  voided_by_id INT NULL,
  voided_at TIMESTAMP NULL,
  void_reason VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_by_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (voided_by_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_agent_reservation (agent_id, reservation_id),
  INDEX idx_com_agent (agent_id),
  INDEX idx_com_res (reservation_id),
  INDEX idx_com_prop (property_id),
  INDEX idx_com_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Seed capabilities for agent commission approvals and payments
INSERT IGNORE INTO capabilities (name, description, category, is_enabled, restriction_level) VALUES
('COMMISSION_APPROVAL', 'Authorize and approve calculated agent commissions', 'AGENTS', TRUE, 'NONE'),
('COMMISSION_PAYOUT', 'Disburse and record commission payout settlements', 'AGENTS', TRUE, 'NONE');

-- 4. Seed baseline commission records for existing agent reservation
INSERT IGNORE INTO commissions (
  id, commission_code, agent_id, reservation_id, property_id, booking_amount, commission_rate, commission_type, commission_amount, currency, status, calculated_at, approved_by_id, approved_at, paid_by_id, paid_at, payment_reference, payment_method
) VALUES (
  1, 'COM-AG1-RES1', 1, 1, 1, 220.00, 10.00, 'PERCENTAGE', 22.00, 'NGN', 'APPROVED', '2026-09-22 12:00:00', 2, '2026-09-22 14:00:00', NULL, NULL, NULL, NULL
);
