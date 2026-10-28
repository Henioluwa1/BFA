-- Migration: 024_add_partially_refunded_to_payment_status.sql
-- Description: Expand payment_transactions.status ENUM to include PARTIALLY_REFUNDED
-- Repository Conventions: Forward-only, idempotent-safe, preserving all existing enum values

ALTER TABLE payment_transactions 
  MODIFY COLUMN status ENUM(
    'PENDING', 
    'PROCESSING', 
    'SUCCESS', 
    'FAILED', 
    'CANCELLED', 
    'REFUNDED', 
    'PARTIALLY_REFUNDED', 
    'PARTIAL', 
    'NOT_REQUIRED'
  ) NOT NULL DEFAULT 'PENDING';

