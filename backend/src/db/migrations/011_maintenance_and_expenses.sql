-- Migration: 011_maintenance_and_expenses.sql
-- Description: Expand maintenance requests, provision authoritative expenses table, and add payment refunds/reversals

-- 1. Expand maintenance_requests table
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'GENERAL' AFTER description,
  ADD COLUMN IF NOT EXISTS reported_by_id INT NULL AFTER cost,
  ADD COLUMN IF NOT EXISTS assigned_to_id INT NULL AFTER reported_by_id,
  ADD COLUMN IF NOT EXISTS reservation_id INT NULL AFTER assigned_to_id,
  ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER reservation_id,
  ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER estimated_cost,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP NULL AFTER actual_cost,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP NULL AFTER started_at,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT NULL AFTER resolved_at,
  ADD COLUMN IF NOT EXISTS blocking_unit BOOLEAN NOT NULL DEFAULT FALSE AFTER resolution_notes,
  MODIFY COLUMN status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
  ADD INDEX IF NOT EXISTS idx_maint_cat (category),
  ADD INDEX IF NOT EXISTS idx_maint_assigned (assigned_to_id),
  ADD INDEX IF NOT EXISTS idx_maint_res (reservation_id),
  ADD CONSTRAINT fk_maint_reported_by FOREIGN KEY (reported_by_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_maint_assigned_to FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_maint_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;

-- 2. Create authoritative expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_code VARCHAR(50) NOT NULL UNIQUE,
  property_id INT NOT NULL,
  apartment_id INT NULL,
  maintenance_id INT NULL,
  category ENUM('MAINTENANCE', 'UTILITIES', 'STAFF', 'SUPPLIES', 'CLEANING', 'PROPERTY', 'ADMINISTRATION', 'MARKETING', 'OTHER') NOT NULL DEFAULT 'MAINTENANCE',
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  expense_date DATE NOT NULL,
  vendor_payee VARCHAR(150) NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'BANK_TRANSFER',
  status ENUM('DRAFT', 'RECORDED', 'APPROVED', 'VOIDED') NOT NULL DEFAULT 'RECORDED',
  created_by_id INT NULL,
  approved_by_id INT NULL,
  approved_at TIMESTAMP NULL,
  voided_by_id INT NULL,
  voided_at TIMESTAMP NULL,
  void_reason VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL,
  FOREIGN KEY (maintenance_id) REFERENCES maintenance_requests(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (voided_by_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_exp_property (property_id),
  INDEX idx_exp_category (category),
  INDEX idx_exp_status (status),
  INDEX idx_exp_date (expense_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Enhance payment_transactions table with refund / reversal metadata
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER amount,
  ADD COLUMN IF NOT EXISTS refund_reason VARCHAR(255) NULL AFTER refund_amount,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP NULL AFTER refund_reason,
  ADD COLUMN IF NOT EXISTS refunded_by_id INT NULL AFTER refunded_at,
  ADD COLUMN IF NOT EXISTS parent_transaction_id INT NULL AFTER refunded_by_id,
  ADD CONSTRAINT fk_pay_refunded_by FOREIGN KEY (refunded_by_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_pay_parent_txn FOREIGN KEY (parent_transaction_id) REFERENCES payment_transactions(id) ON DELETE SET NULL,
  ADD INDEX IF NOT EXISTS idx_pay_parent (parent_transaction_id);

-- 4. Seed baseline realistic expense entries for live reporting
INSERT IGNORE INTO expenses (id, expense_code, property_id, category, description, amount, currency, expense_date, vendor_payee, payment_method, status, created_by_id, approved_by_id, approved_at) VALUES
(1, 'EXP-2026-001', 1, 'UTILITIES', 'Monthly Commercial Fiber Internet Backbone', 125000.00, 'NGN', '2026-09-01', 'MainOne Cable Nigeria', 'BANK_TRANSFER', 'APPROVED', 2, 1, '2026-09-02 10:00:00'),
(2, 'EXP-2026-002', 1, 'STAFF', 'Front Desk & Concierge Staff Shift Allowances', 280000.00, 'NGN', '2026-09-05', 'BFA Operations Payroll', 'DIRECT_DEBIT', 'APPROVED', 2, 1, '2026-09-05 14:30:00'),
(3, 'EXP-2026-003', 2, 'UTILITIES', 'Alternative Power Generator Fueling (2000 Liters)', 450000.00, 'NGN', '2026-09-10', 'TotalEnergies Ikoyi', 'BANK_TRANSFER', 'APPROVED', 3, 2, '2026-09-10 16:00:00'),
(4, 'EXP-2026-004', 3, 'CLEANING', 'Eco-Friendly Laundry Chemicals & Guest Toiletries', 95000.00, 'NGN', '2026-09-12', 'CleanPro Hospitality Supplies', 'CARD', 'APPROVED', 3, 2, '2026-09-12 11:20:00'),
(5, 'EXP-2026-005', 2, 'MAINTENANCE', 'Compressor Valve & Freon Refill for Penthouse AC', 85000.00, 'NGN', '2026-09-15', 'Danfoss HVAC Services', 'BANK_TRANSFER', 'APPROVED', 2, 1, '2026-09-15 15:45:00');
