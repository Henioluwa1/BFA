-- Migration: 008_communications_and_notifications.sql
-- Description: Dedicated Communications Module, Central Notification Center, and Public Announcements Platform

-- 1. Communications Table
CREATE TABLE IF NOT EXISTS communications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type ENUM(
    'INTERNAL_MEMO', 
    'OFFICIAL_LETTER', 
    'ANNOUNCEMENT', 
    'OPERATIONAL_NOTICE', 
    'GUEST_COMMUNICATION', 
    'BOOKING_NOTICE', 
    'MAINTENANCE_NOTICE', 
    'EMERGENCY_NOTICE', 
    'FESTIVE_WELCOME'
  ) NOT NULL DEFAULT 'INTERNAL_MEMO',
  status ENUM(
    'DRAFT', 
    'SUBMITTED', 
    'PENDING_APPROVAL', 
    'APPROVED', 
    'SCHEDULED', 
    'SENT', 
    'REJECTED', 
    'CANCELLED', 
    'ARCHIVED', 
    'FAILED'
  ) NOT NULL DEFAULT 'DRAFT',
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  author_id INT NULL,
  author_role VARCHAR(50) NOT NULL DEFAULT 'ADMIN',
  property_id INT NULL,
  scheduled_at TIMESTAMP NULL,
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_comm_status (status),
  INDEX idx_comm_type (type),
  INDEX idx_comm_author (author_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Communication Recipients Table
CREATE TABLE IF NOT EXISTS communication_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  communication_id INT NOT NULL,
  recipient_type ENUM('INDIVIDUAL', 'ROLE', 'ALL_STAFF', 'PROPERTY_STAFF', 'GUESTS', 'ALL') NOT NULL DEFAULT 'ALL',
  recipient_id INT NULL,
  recipient_role VARCHAR(50) NULL,
  FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE CASCADE,
  INDEX idx_rcpt_comm (communication_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Communication Templates Table
CREATE TABLE IF NOT EXISTS communication_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL,
  subject_template VARCHAR(255) NOT NULL,
  body_template TEXT NOT NULL,
  created_by_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Communication Approvals Audit Table
CREATE TABLE IF NOT EXISTS communication_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  communication_id INT NOT NULL,
  reviewer_id INT NOT NULL,
  reviewer_role VARCHAR(50) NOT NULL,
  action ENUM('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL') NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE CASCADE,
  INDEX idx_comm_appr (communication_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. System Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_id INT NULL,
  recipient_role VARCHAR(50) NULL,
  property_id INT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  category ENUM(
    'RESERVATION', 
    'PAYMENT', 
    'MAINTENANCE', 
    'COMMUNICATION', 
    'SECURITY', 
    'SYSTEM', 
    'APPROVAL', 
    'ANNOUNCEMENT'
  ) NOT NULL DEFAULT 'SYSTEM',
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  source_entity_type VARCHAR(50) NULL,
  source_entity_id VARCHAR(100) NULL,
  link_url VARCHAR(255) NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  status ENUM('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED') NOT NULL DEFAULT 'SENT',
  channel ENUM('IN_APP', 'BROWSER', 'EMAIL', 'SMS', 'WHATSAPP') NOT NULL DEFAULT 'IN_APP',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_recipient (recipient_id, recipient_role),
  INDEX idx_notif_read (is_read),
  INDEX idx_notif_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Notification Preferences Table
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INT NOT NULL,
  category VARCHAR(50) NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  browser_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Public Announcements Table
CREATE TABLE IF NOT EXISTS public_announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  property_id INT NULL,
  display_location ENUM('PUBLIC_LANDING', 'ONLINE_BOOKING', 'LOGIN', 'AUTHENTICATED_PORTAL', 'ALL') NOT NULL DEFAULT 'PUBLIC_LANDING',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ann_active (is_active, start_date, end_date),
  INDEX idx_ann_loc (display_location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Seed Baseline Templates & Public Announcements
INSERT IGNORE INTO communication_templates (name, type, subject_template, body_template) VALUES
('Default Booking Confirmation', 'BOOKING_NOTICE', 'Your BFA Reservation Confirmation - {{code}}', 'Dear {{guest_name}},\n\nThank you for choosing BFA Apartments. Your 1-night reservation at {{property_name}} (Unit {{unit_number}}) has been confirmed.\n\nBooking Auth Code: {{auth_code}}\nCheck-In Date: {{check_in_date}}\nTotal: {{total_amount}}\nPayment Status: {{payment_status}}.\n\nBest regards,\nBFA Management Team'),
('Festive Holiday Greetings', 'FESTIVE_WELCOME', 'Warm Holiday Greetings from BFA Apartments', 'Dear Valued Guests and Team,\n\nWishing you a joyful and peaceful holiday season! We are honored to host you across our properties.'),
('Maintenance Advisory Notice', 'MAINTENANCE_NOTICE', 'Notice of Scheduled Routine Inspection', 'Please be advised that routine maintenance and preventative safety checks are scheduled for {{property_name}} on {{date}}.');

INSERT IGNORE INTO public_announcements (title, message, priority, display_location, start_date, end_date, is_active) VALUES
('Welcome to BFA Luxury Apartments', 'Experience premier serviced apartments across Lagos. Enjoy 24/7 security, high-speed fiber internet, and seamless online booking with authentic verification.', 'MEDIUM', 'PUBLIC_LANDING', '2026-01-01', '2028-12-31', TRUE),
('Payment Policy Update', 'Online payments are processed securely in Nigerian Naira (₦). Pay When You Arrive option is subject to property availability and management access policy.', 'HIGH', 'ONLINE_BOOKING', '2026-01-01', '2028-12-31', TRUE);
