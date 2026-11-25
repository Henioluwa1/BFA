-- ============================================================
-- Migration 041: Payment Transaction References (PostgreSQL)
-- Structured fields for future bank reconciliation
-- BFA Apartments Management System
-- Forward-only | PostgreSQL 18.7 compatible
-- ============================================================

-- 1. Structured Payment Transaction References
CREATE TABLE IF NOT EXISTS payment_transaction_refs (
  id SERIAL PRIMARY KEY,
  reservation_id INT NOT NULL,
  property_id INT NOT NULL,

  -- Reference data (the primary reconciliation key)
  transaction_reference VARCHAR(255) NOT NULL,
  reference_type VARCHAR(40) NOT NULL DEFAULT 'CLIENT_SUPPLIED',
  payment_rail VARCHAR(40) NOT NULL DEFAULT 'BANK_TRANSFER',

  -- Financial details
  amount NUMERIC(15,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  payment_date DATE NULL,
  payment_time TIME NULL,
  payment_datetime TIMESTAMPTZ NULL,

  -- Counterparty
  payer_name VARCHAR(150) NULL,
  payer_account_number VARCHAR(60) NULL,
  payer_bank_name VARCHAR(120) NULL,
  receiving_account_last4 VARCHAR(10) NULL,
  receiving_bank VARCHAR(80) NULL,

  -- Evidence
  evidence_path TEXT NULL,
  evidence_filename VARCHAR(255) NULL,
  evidence_mime VARCHAR(100) NULL,
  evidence_uploaded_by_id INT NULL,
  evidence_uploaded_at TIMESTAMPTZ NULL,

  -- Verification (financial control)
  verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  verified_by_id INT NULL,
  verified_at TIMESTAMPTZ NULL,
  verification_notes TEXT NULL,
  rejected_reason TEXT NULL,
  is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_of_ref_id INT NULL,

  -- Booking association
  linked_payment_transaction_id INT NULL,
  linked_payment_receipt_id INT NULL,

  -- Audit
  recorded_by_id INT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ptr_reservation ON payment_transaction_refs (reservation_id);
CREATE INDEX IF NOT EXISTS idx_ptr_property ON payment_transaction_refs (property_id);
CREATE INDEX IF NOT EXISTS idx_ptr_reference ON payment_transaction_refs (transaction_reference);
CREATE INDEX IF NOT EXISTS idx_ptr_status ON payment_transaction_refs (verification_status);
CREATE INDEX IF NOT EXISTS idx_ptr_date ON payment_transaction_refs (payment_datetime);
CREATE INDEX IF NOT EXISTS idx_ptr_ref_property ON payment_transaction_refs (transaction_reference, property_id);

-- 2. Future-ready: Bank Statement Upload tracker (structure only)
CREATE TABLE IF NOT EXISTS bank_statement_uploads (
  id SERIAL PRIMARY KEY,
  property_id INT NOT NULL,
  upload_reference VARCHAR(60) NOT NULL UNIQUE,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_format VARCHAR(20) NOT NULL,
  statement_period_from DATE NULL,
  statement_period_to DATE NULL,
  bank_name VARCHAR(120) NULL,
  account_last4 VARCHAR(10) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  total_transactions_in_file INT NULL,
  matched_transactions INT NULL DEFAULT 0,
  unmatched_transactions INT NULL DEFAULT 0,
  exceptions_count INT NULL DEFAULT 0,
  uploaded_by_id INT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bsu_property ON bank_statement_uploads (property_id, status);

-- 3. Add structured columns to existing reservations
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS primary_transaction_ref VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(40) NULL;
