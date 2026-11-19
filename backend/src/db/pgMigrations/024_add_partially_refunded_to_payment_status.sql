-- Migration: 024_add_partially_refunded_to_payment_status.sql
-- Description: Expand payment_transactions.status ENUM to include PARTIALLY_REFUNDED
-- Repository Conventions: Forward-only, idempotent-safe, preserving all existing enum values

ALTER TABLE payment_transactions ALTER COLUMN status TYPE VARCHAR(50);
ALTER TABLE payment_transactions ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE payment_transactions ALTER COLUMN status SET NOT NULL;
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS chk_payment_transactions_status;
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE payment_transactions ADD CONSTRAINT chk_payment_transactions_status CHECK (status IN (
    'PENDING', 
    'PROCESSING', 
    'SUCCESS', 
    'FAILED', 
    'CANCELLED', 
    'REFUNDED', 
    'PARTIALLY_REFUNDED', 
    'PARTIAL', 
    'NOT_REQUIRED'
  ));

