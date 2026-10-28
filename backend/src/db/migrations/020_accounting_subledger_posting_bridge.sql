-- Migration: 020_accounting_subledger_posting_bridge.sql
-- Description: Provision tables for subledger-to-general-ledger posting bridges, account mappings, outbox records, and exception tracking

-- 1. Account Mappings Table
CREATE TABLE IF NOT EXISTS accounting_account_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mapping_key VARCHAR(100) NOT NULL UNIQUE,
  event_type VARCHAR(50) NOT NULL,
  category VARCHAR(50) NULL,
  account_id INT NOT NULL,
  description VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  INDEX idx_aam_key (mapping_key),
  INDEX idx_aam_event (event_type),
  INDEX idx_aam_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Subledger Posting Records (Durable Outbox & Integration Linkage)
CREATE TABLE IF NOT EXISTS accounting_subledger_posting_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_module VARCHAR(50) NOT NULL,
  source_entity_type VARCHAR(50) NOT NULL,
  source_entity_id VARCHAR(100) NOT NULL,
  source_event_type VARCHAR(50) NOT NULL,
  posting_purpose VARCHAR(50) NOT NULL DEFAULT 'PRIMARY',
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  journal_entry_id INT NULL,
  accounting_period_id INT NULL,
  property_id INT NULL,
  status ENUM('PENDING', 'POSTED', 'FAILED', 'REVERSED', 'IGNORED') NOT NULL DEFAULT 'PENDING',
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  service_date DATE NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  error_type ENUM('TRANSIENT', 'PERMANENT', 'UNRESOLVED_POLICY') NULL,
  reconciled_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  FOREIGN KEY (accounting_period_id) REFERENCES accounting_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  INDEX idx_aspr_source (source_module, source_entity_type, source_entity_id),
  INDEX idx_aspr_idempotency (idempotency_key),
  INDEX idx_aspr_status (status),
  INDEX idx_aspr_journal (journal_entry_id),
  INDEX idx_aspr_service_date (service_date),
  INDEX idx_aspr_property (property_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Posting Exceptions Register
CREATE TABLE IF NOT EXISTS accounting_posting_exceptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  posting_record_id INT NULL,
  source_module VARCHAR(50) NOT NULL,
  source_entity_id VARCHAR(100) NOT NULL,
  exception_code VARCHAR(100) NOT NULL,
  exception_message TEXT NOT NULL,
  status ENUM('OPEN', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
  resolution_notes TEXT NULL,
  resolved_by_id INT NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (posting_record_id) REFERENCES accounting_subledger_posting_records(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ape_record (posting_record_id),
  INDEX idx_ape_status (status),
  INDEX idx_ape_code (exception_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed New Capabilities for Subledger Posting and Exception Resolution
INSERT IGNORE INTO capabilities (name, description, category, is_enabled, restriction_level) VALUES
('ACCOUNTING_SUBLEDGER_POST', 'Trigger automated or manual subledger posting bridges and night audit', 'ACCOUNTING', TRUE, 'NONE'),
('ACCOUNTING_EXCEPTION_RESOLVE', 'Review, resolve, and retry accounting posting exceptions', 'ACCOUNTING', TRUE, 'NONE');

-- 5. Seed Standard Operational Account Mappings
-- Accounts referenced:
-- 1010: Main Operating Bank Account - Zenith (ASSET)
-- 1020: Petty Cash - Front Desk Vault (ASSET)
-- 1030: Payment Gateway Clearing Account (ASSET)
-- 1200: Accounts Receivable - Guests (ASSET)
-- 2010: Accounts Payable - Trade Vendors (LIABILITY)
-- 2020: Deferred Guest Revenue (LIABILITY)
-- 2030: Refundable Guest Security Deposits (LIABILITY)
-- 4010: Accommodation Revenue (REVENUE)
-- 4050: Cancellation & Forfeiture Fee Income (REVENUE)
-- 5010: Maintenance & Facility Repairs (EXPENSE)
-- 5020: Utilities - Power, Generator & Diesel (EXPENSE)
-- 5030: Staff Salaries, Wages & Allowances (EXPENSE)
-- 5040: Housekeeping & Cleaning Supplies (EXPENSE)
-- 5050: Property Administration & Software (EXPENSE)
-- 5060: Marketing & Partner Commissions (EXPENSE)
-- 5080: Payment Processing & Gateway Fees (EXPENSE)

INSERT IGNORE INTO accounting_account_mappings (mapping_key, event_type, category, account_id, description) VALUES
('PAYMENT_CARD_CLEARING', 'PAYMENT', 'CARD', 4, 'Payment Gateway Clearing Account for card collections'),
('PAYMENT_BANK_TRANSFER', 'PAYMENT', 'BANK_TRANSFER', 2, 'Main Operating Bank Account for direct bank transfers'),
('PAYMENT_CASH_VAULT', 'PAYMENT', 'CASH', 3, 'Front Desk Vault Petty Cash for cash receipts'),
('PAYMENT_DEFAULT_ASSET', 'PAYMENT', 'DEFAULT', 2, 'Default liquid asset account for payments'),
('GUEST_DEFERRED_REVENUE', 'REVENUE', 'LIABILITY', 8, 'Deferred Guest Revenue liability for advance stay collections'),
('ACCOUNTS_RECEIVABLE_GUEST', 'RECEIVABLE', 'GUEST', 5, 'Guest Accounts Receivable for unpaid delivered stays'),
('ACCOMMODATION_REVENUE', 'REVENUE', 'ACCOMMODATION', 17, 'Earned accommodation income for delivered room nights'),
('CANCELLATION_FEE_INCOME', 'REVENUE', 'CANCELLATION', 19, 'Forfeiture and cancellation fee income'),
('REFUNDABLE_SECURITY_DEPOSIT', 'DEPOSIT', 'SECURITY', 9, 'Cautionary damage deposits held in trust for guests'),
('ACCOUNTS_PAYABLE_TRADE', 'PAYABLE', 'TRADE', 7, 'Trade Accounts Payable for approved unpaid vendor expenses'),
('EXPENSE_MAINTENANCE', 'EXPENSE', 'MAINTENANCE', 21, 'Maintenance and facility repair operational expenses'),
('EXPENSE_UTILITIES', 'EXPENSE', 'UTILITIES', 22, 'Power, diesel generator, and water utility expenses'),
('EXPENSE_STAFF', 'EXPENSE', 'STAFF', 23, 'Staff salaries, wages, and operational allowances'),
('EXPENSE_SUPPLIES', 'EXPENSE', 'SUPPLIES', 24, 'Housekeeping and operational supplies expenses'),
('EXPENSE_CLEANING', 'EXPENSE', 'CLEANING', 24, 'Cleaning chemicals and laundry expenses'),
('EXPENSE_PROPERTY', 'EXPENSE', 'PROPERTY', 25, 'Property administration and software expenses'),
('EXPENSE_ADMINISTRATION', 'EXPENSE', 'ADMINISTRATION', 25, 'Office administration, licensing, and corporate fees'),
('EXPENSE_MARKETING', 'EXPENSE', 'MARKETING', 26, 'Marketing campaigns and external partner commissions'),
('EXPENSE_OTHER', 'EXPENSE', 'OTHER', 21, 'Uncategorized operational expenses'),
('PAYMENT_GATEWAY_FEE', 'EXPENSE', 'FEE', 27, 'Merchant fees deducted by payment processors');
