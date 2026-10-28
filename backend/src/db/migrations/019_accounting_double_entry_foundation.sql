-- Migration: 019_accounting_double_entry_foundation.sql
-- Description: Provision Chart of Accounts, Accounting Periods, Journal Entries, Journal Lines, and General Ledger for double-entry accrual accounting

-- 1. Chart of Accounts Table
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_code VARCHAR(50) NOT NULL UNIQUE,
  account_name VARCHAR(150) NOT NULL,
  account_type ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
  account_subtype VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  normal_balance ENUM('DEBIT', 'CREDIT') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_posting_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  parent_account_id INT NULL,
  property_id INT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  INDEX idx_coa_code (account_code),
  INDEX idx_coa_type (account_type),
  INDEX idx_coa_active (is_active),
  INDEX idx_coa_parent (parent_account_id),
  INDEX idx_coa_property (property_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Accounting Periods Table
CREATE TABLE IF NOT EXISTS accounting_periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  period_name VARCHAR(50) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  fiscal_year INT NOT NULL,
  status ENUM('OPEN', 'CLOSED', 'LOCKED') NOT NULL DEFAULT 'OPEN',
  closed_by_id INT NULL,
  closed_at TIMESTAMP NULL,
  reopened_by_id INT NULL,
  reopened_at TIMESTAMP NULL,
  reopen_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (closed_by_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reopened_by_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_period_name (period_name),
  INDEX idx_period_dates (start_date, end_date),
  INDEX idx_period_status (status),
  INDEX idx_period_year (fiscal_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Journal Entries Table (Headers)
CREATE TABLE IF NOT EXISTS journal_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  journal_number VARCHAR(50) NOT NULL UNIQUE,
  entry_date DATE NOT NULL,
  accounting_period_id INT NOT NULL,
  description VARCHAR(255) NOT NULL,
  source_type ENUM('MANUAL', 'RESERVATION', 'PAYMENT', 'EXPENSE', 'REFUND', 'PAYOUT', 'ADJUSTMENT', 'OPENING_BALANCE') NOT NULL DEFAULT 'MANUAL',
  source_id VARCHAR(100) NULL,
  idempotency_key VARCHAR(100) NULL UNIQUE,
  status ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'REVERSED') NOT NULL DEFAULT 'DRAFT',
  created_by_id INT NOT NULL,
  approved_by_id INT NULL,
  approved_at TIMESTAMP NULL,
  posted_by_id INT NULL,
  posted_at TIMESTAMP NULL,
  rejected_by_id INT NULL,
  rejected_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  reversal_of_journal_id INT NULL,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_by_journal_id INT NULL,
  total_debit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  total_credit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (accounting_period_id) REFERENCES accounting_periods(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_id) REFERENCES users(id),
  FOREIGN KEY (posted_by_id) REFERENCES users(id),
  FOREIGN KEY (rejected_by_id) REFERENCES users(id),
  FOREIGN KEY (reversal_of_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  FOREIGN KEY (reversed_by_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  INDEX idx_je_number (journal_number),
  INDEX idx_je_status (status),
  INDEX idx_je_date (entry_date),
  INDEX idx_je_period (accounting_period_id),
  INDEX idx_je_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Journal Lines Table (Detail debits and credits)
CREATE TABLE IF NOT EXISTS journal_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  journal_entry_id INT NOT NULL,
  account_id INT NOT NULL,
  line_number INT NOT NULL,
  debit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  credit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  property_id INT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  INDEX idx_jl_journal (journal_entry_id),
  INDEX idx_jl_account (account_id),
  INDEX idx_jl_property (property_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. General Ledger Entries Table (Immutable ledger records for posted journals)
CREATE TABLE IF NOT EXISTS general_ledger_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  journal_entry_id INT NOT NULL,
  journal_line_id INT NOT NULL,
  account_id INT NOT NULL,
  property_id INT NULL,
  posting_date DATE NOT NULL,
  accounting_period_id INT NOT NULL,
  debit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  credit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  net_balance_impact DECIMAL(15, 2) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
  FOREIGN KEY (journal_line_id) REFERENCES journal_lines(id),
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  FOREIGN KEY (accounting_period_id) REFERENCES accounting_periods(id),
  INDEX idx_gle_account (account_id),
  INDEX idx_gle_date (posting_date),
  INDEX idx_gle_period (accounting_period_id),
  INDEX idx_gle_property (property_id),
  INDEX idx_gle_journal (journal_entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Seed Baseline Accounting Capabilities
INSERT IGNORE INTO capabilities (name, description, category, is_enabled, restriction_level) VALUES
('ACCOUNTING_COA_MANAGE', 'Administer and configure the Chart of Accounts', 'ACCOUNTING', TRUE, 'NONE'),
('ACCOUNTING_JOURNAL_CREATE', 'Draft and submit manual journal entries', 'ACCOUNTING', TRUE, 'NONE'),
('ACCOUNTING_JOURNAL_APPROVE', 'Authorize and review pending journal entries', 'ACCOUNTING', TRUE, 'NONE'),
('ACCOUNTING_JOURNAL_POST', 'Post approved journals to General Ledger', 'ACCOUNTING', TRUE, 'NONE'),
('ACCOUNTING_JOURNAL_REVERSE', 'Reverse posted journal entries', 'ACCOUNTING', TRUE, 'NONE'),
('ACCOUNTING_PERIOD_MANAGE', 'Open, close, and manage accounting periods', 'ACCOUNTING', TRUE, 'NONE');

-- 7. Seed Baseline Accounting Periods (Q4 2026)
INSERT IGNORE INTO accounting_periods (period_name, start_date, end_date, fiscal_year, status) VALUES
('2026-09', '2026-09-01', '2026-09-30', 2026, 'CLOSED'),
('2026-10', '2026-10-01', '2026-10-31', 2026, 'OPEN'),
('2026-11', '2026-11-01', '2026-11-30', 2026, 'OPEN'),
('2026-12', '2026-12-01', '2026-12-31', 2026, 'OPEN');

-- 8. Seed Standard Chart of Accounts
-- 1000 Series: Assets
INSERT IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_subtype, normal_balance, is_active, is_posting_allowed, description) VALUES
(1, '1000', 'Total Assets', 'ASSET', 'SUMMARY_HEADER', 'DEBIT', TRUE, FALSE, 'Summary header for all asset accounts'),
(2, '1010', 'Main Operating Bank Account - Zenith', 'ASSET', 'CASH_EQUIVALENTS', 'DEBIT', TRUE, TRUE, 'Primary commercial operating bank account'),
(3, '1020', 'Petty Cash - Front Desk Vault', 'ASSET', 'CASH_EQUIVALENTS', 'DEBIT', TRUE, TRUE, 'Physical cash on hand at property front desks'),
(4, '1030', 'Payment Gateway Clearing Account', 'ASSET', 'CLEARING', 'DEBIT', TRUE, TRUE, 'Undeposited merchant funds from online payment processors'),
(5, '1200', 'Accounts Receivable - Guests', 'ASSET', 'RECEIVABLE', 'DEBIT', TRUE, TRUE, 'Outstanding uncollected guest booking balances');

-- 2000 Series: Liabilities
INSERT IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_subtype, normal_balance, is_active, is_posting_allowed, description) VALUES
(6, '2000', 'Total Liabilities', 'LIABILITY', 'SUMMARY_HEADER', 'CREDIT', TRUE, FALSE, 'Summary header for all liability accounts'),
(7, '2010', 'Accounts Payable - Trade Vendors', 'LIABILITY', 'PAYABLE', 'CREDIT', TRUE, TRUE, 'Short-term obligations owed to maintenance and utility suppliers'),
(8, '2020', 'Deferred Guest Revenue', 'LIABILITY', 'DEFERRED_REVENUE', 'CREDIT', TRUE, TRUE, 'Advance accommodation payments for future stay dates'),
(9, '2030', 'Refundable Guest Security Deposits', 'LIABILITY', 'DEPOSITS', 'CREDIT', TRUE, TRUE, 'Customer cautionary damage deposits held in trust'),
(10, '2050', 'Value Added Tax (VAT) Payable', 'LIABILITY', 'TAX_LIABILITY', 'CREDIT', TRUE, TRUE, 'Federal 7.5% VAT collected on taxable services'),
(11, '2060', 'State Consumption Tax Payable', 'LIABILITY', 'TAX_LIABILITY', 'CREDIT', TRUE, TRUE, 'State hotel and tourism consumption tax liabilities');

-- 3000 Series: Equity
INSERT IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_subtype, normal_balance, is_active, is_posting_allowed, description) VALUES
(12, '3000', 'Total Equity', 'EQUITY', 'SUMMARY_HEADER', 'CREDIT', TRUE, FALSE, 'Summary header for owners equity accounts'),
(13, '3010', 'Owner Capital Contributions', 'EQUITY', 'EQUITY', 'CREDIT', TRUE, TRUE, 'Initial and ongoing owner capital investments'),
(14, '3020', 'Retained Earnings', 'EQUITY', 'EQUITY', 'CREDIT', TRUE, TRUE, 'Cumulative retained operating profit and loss'),
(15, '3030', 'Opening Balance Offset', 'EQUITY', 'EQUITY', 'CREDIT', TRUE, TRUE, 'Contra-equity account used for opening balance conversions');

-- 4000 Series: Revenue
INSERT IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_subtype, normal_balance, is_active, is_posting_allowed, description) VALUES
(16, '4000', 'Total Revenue', 'REVENUE', 'SUMMARY_HEADER', 'CREDIT', TRUE, FALSE, 'Summary header for revenue accounts'),
(17, '4010', 'Accommodation Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE, TRUE, 'Earned accommodation income from completed guest stay nights'),
(18, '4020', 'Ancillary Guest Services Income', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE, TRUE, 'Income from laundry, extra bedding, and guest concierge services'),
(19, '4050', 'Cancellation & Forfeiture Fee Income', 'REVENUE', 'OTHER_INCOME', 'CREDIT', TRUE, TRUE, 'Retained customer deposits from late cancellations and no-shows');

-- 5000 Series: Expenses
INSERT IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_subtype, normal_balance, is_active, is_posting_allowed, description) VALUES
(20, '5000', 'Total Operating Expenses', 'EXPENSE', 'SUMMARY_HEADER', 'DEBIT', TRUE, FALSE, 'Summary header for operational expense accounts'),
(21, '5010', 'Maintenance & Facility Repairs', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', TRUE, TRUE, 'Facility maintenance, HVAC repairs, plumbing, electrical costs'),
(22, '5020', 'Utilities - Power, Generator & Diesel', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', TRUE, TRUE, 'Grid electricity, diesel generator fuel, and municipal water'),
(23, '5030', 'Staff Salaries, Wages & Allowances', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', TRUE, TRUE, 'Operational staff salaries, overtime, and shift allowances'),
(24, '5040', 'Housekeeping & Cleaning Supplies', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', TRUE, TRUE, 'Guest room toiletries, laundry chemicals, and cleaning materials'),
(25, '5050', 'Property Administration & Software', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', TRUE, TRUE, 'Office supplies, licenses, legal, and regulatory fees'),
(26, '5060', 'Marketing & Partner Commissions', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', TRUE, TRUE, 'External agent commissions and marketing campaigns'),
(27, '5080', 'Payment Processing & Gateway Fees', 'EXPENSE', 'FINANCIAL_EXPENSE', 'DEBIT', TRUE, TRUE, 'Merchant service fees deducted by online card payment processors');

-- Set parents
UPDATE chart_of_accounts SET parent_account_id = 1 WHERE account_code IN ('1010', '1020', '1030', '1200');
UPDATE chart_of_accounts SET parent_account_id = 6 WHERE account_code IN ('2010', '2020', '2030', '2050', '2060');
UPDATE chart_of_accounts SET parent_account_id = 12 WHERE account_code IN ('3010', '3020', '3030');
UPDATE chart_of_accounts SET parent_account_id = 16 WHERE account_code IN ('4010', '4020', '4050');
UPDATE chart_of_accounts SET parent_account_id = 20 WHERE account_code IN ('5010', '5020', '5030', '5040', '5050', '5060', '5080');
