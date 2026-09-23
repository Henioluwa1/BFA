-- Migration: 007_payments_and_booking_auth.sql
-- Description: Transactional Payments, Booking Authentication Codes, and Reservation Payment Decoupling

-- 1. Extend reservations table with decoupled payment metadata
ALTER TABLE reservations 
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_PENDING' AFTER status,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NOT NULL DEFAULT 'PAY_AT_PROPERTY' AFTER payment_status,
  ADD INDEX IF NOT EXISTS idx_res_payment_status (payment_status);

-- 2. Payment Transactions Table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  transaction_reference VARCHAR(100) NOT NULL UNIQUE,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'CARD',
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  status ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIAL', 'NOT_REQUIRED') NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(50) NULL,
  provider_reference VARCHAR(100) NULL,
  metadata JSON NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  INDEX idx_pay_res (reservation_id),
  INDEX idx_pay_ref (transaction_reference),
  INDEX idx_pay_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Booking Authentication Codes Table
CREATE TABLE IF NOT EXISTS booking_authentications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL UNIQUE,
  auth_code VARCHAR(50) NOT NULL UNIQUE,
  guest_email VARCHAR(191) NOT NULL,
  guest_phone VARCHAR(50) NOT NULL,
  status ENUM('ACTIVE', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  INDEX idx_auth_code (auth_code),
  INDEX idx_auth_email (guest_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed initial transaction records for historical reservations if present
INSERT IGNORE INTO booking_authentications (reservation_id, auth_code, guest_email, guest_phone)
SELECT id, CONCAT('BFA-AUTH-', UPPER(SUBSTRING(MD5(CONCAT(id, reservation_code, NOW())), 1, 8))), tenant_email, tenant_phone
FROM reservations;
