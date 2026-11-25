-- ============================================================
-- Migration 039: Client Check-In Documentation System
-- BFA Apartments Management System
-- Forward-only | MySQL + PostgreSQL compatible
-- ============================================================

-- 1. Configurable Check-In Document Types (management-defined)
CREATE TABLE IF NOT EXISTS checkin_document_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type_code VARCHAR(60) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  requires_expiry TINYINT(1) NOT NULL DEFAULT 0,
  requires_id_number TINYINT(1) NOT NULL DEFAULT 1,
  accepted_formats VARCHAR(255) NOT NULL DEFAULT 'pdf,jpg,jpeg,png',
  max_file_size_mb INT NOT NULL DEFAULT 10,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 100,
  created_by_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cdt_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default document types
INSERT IGNORE INTO checkin_document_types (type_code, display_name, description, is_required, requires_expiry, sort_order) VALUES
  ('NATIONAL_ID', 'National Identification Card', 'NIN slip or national ID card issued by NIMC or equivalent authority', 1, 0, 10),
  ('INTERNATIONAL_PASSPORT', 'International Passport', 'Valid international travel passport', 1, 1, 20),
  ('DRIVERS_LICENSE', 'Driver''s Licence', 'Valid driver''s licence issued by FRSC or equivalent authority', 0, 1, 30),
  ('VOTERS_CARD', 'Permanent Voter''s Card', 'PVC issued by INEC', 0, 0, 40),
  ('GOVERNMENT_ID', 'Other Government-Issued ID', 'Any other legally accepted government-issued identification', 0, 0, 50);

-- 2. Check-In Session — per-reservation additional information
CREATE TABLE IF NOT EXISTS checkin_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  property_id INT NOT NULL,

  -- Identity document
  document_type_code VARCHAR(60) NULL,
  document_id_number VARCHAR(120) NULL,
  document_issuing_country VARCHAR(80) NULL DEFAULT 'Nigeria',
  document_expiry_date DATE NULL,

  -- Occupancy
  actual_occupant_count INT NULL,
  occupant_names JSON NULL COMMENT 'Array of additional occupant names',
  vehicle_registration VARCHAR(60) NULL,

  -- Acknowledgment
  client_acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  acknowledgment_timestamp TIMESTAMP NULL,
  acknowledgment_method VARCHAR(40) NULL COMMENT 'DIGITAL_SIGNATURE, VERBAL, WRITTEN',

  -- Emergency contact (may supplement booking record)
  emergency_contact_name VARCHAR(120) NULL,
  emergency_contact_phone VARCHAR(40) NULL,
  emergency_contact_relationship VARCHAR(60) NULL,

  -- Checkin notes
  checkin_notes TEXT NULL,
  special_requirements TEXT NULL,

  -- Completion
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING, IN_PROGRESS, COMPLETE, OVERRIDDEN',
  completed_by_id INT NULL,
  completed_at TIMESTAMP NULL,
  overridden_by_id INT NULL,
  override_reason TEXT NULL,
  overridden_at TIMESTAMP NULL,

  created_by_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_cs_reservation (reservation_id),
  INDEX idx_cs_property (property_id),
  INDEX idx_cs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Check-In Document Uploads (one per document type per reservation)
CREATE TABLE IF NOT EXISTS checkin_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  property_id INT NOT NULL,
  checkin_session_id INT NULL,
  document_type_code VARCHAR(60) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL COMMENT 'UUID-based filename in private storage',
  file_path TEXT NOT NULL COMMENT 'Relative path in private storage (not public URL)',
  file_size_bytes INT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  upload_status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED' COMMENT 'UPLOADED, VERIFIED, REJECTED, REPLACED',
  verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING, VERIFIED, REJECTED',
  verified_by_id INT NULL,
  verified_at TIMESTAMP NULL,
  verification_notes TEXT NULL,
  rejected_reason TEXT NULL,
  replaced_by_id INT NULL COMMENT 'If this document was replaced',
  replaced_at TIMESTAMP NULL,
  is_latest TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Only latest version shown by default',
  uploaded_by_id INT NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_cd_reservation (reservation_id, is_latest),
  INDEX idx_cd_property (property_id),
  INDEX idx_cd_type (document_type_code),
  INDEX idx_cd_verification (verification_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
