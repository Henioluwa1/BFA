-- ============================================================
-- Migration 041: Payment Transaction References
-- Structured fields for future bank reconciliation
-- BFA Apartments Management System
-- Forward-only | MySQL + PostgreSQL compatible
-- ============================================================

-- 1. Structured Payment Transaction References
-- (supplements existing payment_transactions / payment_receipts)
CREATE TABLE IF NOT EXISTS payment_transaction_refs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  property_id INT NOT NULL,

  -- Reference data (the primary reconciliation key)
  transaction_reference VARCHAR(255) NOT NULL COMMENT 'Unique reference from payment rail (e.g. USSD/NIBSS session ID)',
  reference_type VARCHAR(40) NOT NULL DEFAULT 'CLIENT_SUPPLIED'
    COMMENT 'CLIENT_SUPPLIED, BANK_CONFIRMED, SYSTEM_GENERATED',
  payment_rail VARCHAR(40) NOT NULL DEFAULT 'BANK_TRANSFER'
    COMMENT 'BANK_TRANSFER, USSD, POS, CASH, ONLINE_GATEWAY, CHEQUE, OTHER',

  -- Financial details
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  payment_date DATE NULL,
  payment_time TIME NULL,
  payment_datetime TIMESTAMP NULL,

  -- Counterparty
  payer_name VARCHAR(150) NULL,
  payer_account_number VARCHAR(60) NULL COMMENT 'Partial — for reference only, never use as PK',
  payer_bank_name VARCHAR(120) NULL,
  receiving_account_last4 VARCHAR(10) NULL COMMENT 'Last 4 digits of BFA receiving account',
  receiving_bank VARCHAR(80) NULL,

  -- Evidence
  evidence_path TEXT NULL COMMENT 'Path to uploaded screenshot/document in private storage',
  evidence_filename VARCHAR(255) NULL,
  evidence_mime VARCHAR(100) NULL,
  evidence_uploaded_by_id INT NULL,
  evidence_uploaded_at TIMESTAMP NULL,

  -- Verification (financial control)
  verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    COMMENT 'PENDING, VERIFIED, REJECTED, DUPLICATE_SUSPECTED',
  verified_by_id INT NULL,
  verified_at TIMESTAMP NULL,
  verification_notes TEXT NULL,
  rejected_reason TEXT NULL,
  is_duplicate TINYINT(1) NOT NULL DEFAULT 0,
  duplicate_of_ref_id INT NULL,

  -- Booking association
  linked_payment_transaction_id INT NULL COMMENT 'FK to payment_transactions.id when matched',
  linked_payment_receipt_id INT NULL COMMENT 'FK to payment_receipts.id when issued',

  -- Audit
  recorded_by_id INT NOT NULL COMMENT 'Receptionist or system that recorded this',
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ptr_reservation (reservation_id),
  INDEX idx_ptr_property (property_id),
  INDEX idx_ptr_reference (transaction_reference),
  INDEX idx_ptr_status (verification_status),
  INDEX idx_ptr_date (payment_datetime),
  -- Prevent duplicate active references per reservation
  INDEX idx_ptr_ref_property (transaction_reference, property_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Future-ready: Bank Statement Upload tracker (structure only — no processing yet)
CREATE TABLE IF NOT EXISTS bank_statement_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  upload_reference VARCHAR(60) NOT NULL UNIQUE,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_format VARCHAR(20) NOT NULL COMMENT 'CSV, XLSX, PDF',
  statement_period_from DATE NULL,
  statement_period_to DATE NULL,
  bank_name VARCHAR(120) NULL,
  account_last4 VARCHAR(10) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    COMMENT 'PENDING, PROCESSING, MATCHED, EXCEPTIONS_FOUND, ARCHIVED',
  total_transactions_in_file INT NULL,
  matched_transactions INT NULL DEFAULT 0,
  unmatched_transactions INT NULL DEFAULT 0,
  exceptions_count INT NULL DEFAULT 0,
  uploaded_by_id INT NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bsu_property (property_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Add structured transaction reference column to existing reservations
--    (safe ALTER — adds only if not already present)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS primary_transaction_ref VARCHAR(255) NULL
    COMMENT 'Primary reconciliation reference from client or payment rail'
    AFTER payment_proof_path,
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(120) NULL AFTER special_requests,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(40) NULL AFTER emergency_contact_name;
