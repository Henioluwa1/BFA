-- ============================================================
-- Migration 039: Client Check-In Documentation System (PostgreSQL)
-- BFA Apartments Management System
-- Forward-only | PostgreSQL 18.7 compatible
-- ============================================================

-- 1. Configurable Check-In Document Types (management-defined)
CREATE TABLE IF NOT EXISTS checkin_document_types (
  id SERIAL PRIMARY KEY,
  type_code VARCHAR(60) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  requires_expiry BOOLEAN NOT NULL DEFAULT FALSE,
  requires_id_number BOOLEAN NOT NULL DEFAULT TRUE,
  accepted_formats VARCHAR(255) NOT NULL DEFAULT 'pdf,jpg,jpeg,png',
  max_file_size_mb INT NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100,
  created_by_id INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cdt_active ON checkin_document_types (is_active, sort_order);

-- Seed default document types
INSERT INTO checkin_document_types (type_code, display_name, description, is_required, requires_expiry, sort_order) VALUES
  ('NATIONAL_ID', 'National Identification Card', 'NIN slip or national ID card issued by NIMC or equivalent authority', TRUE, FALSE, 10),
  ('INTERNATIONAL_PASSPORT', 'International Passport', 'Valid international travel passport', TRUE, TRUE, 20),
  ('DRIVERS_LICENSE', 'Driver''s Licence', 'Valid driver''s licence issued by FRSC or equivalent authority', FALSE, TRUE, 30),
  ('VOTERS_CARD', 'Permanent Voter''s Card', 'PVC issued by INEC', FALSE, FALSE, 40),
  ('GOVERNMENT_ID', 'Other Government-Issued ID', 'Any other legally accepted government-issued identification', FALSE, FALSE, 50)
ON CONFLICT (type_code) DO NOTHING;

-- 2. Check-In Session — per-reservation additional information
CREATE TABLE IF NOT EXISTS checkin_sessions (
  id SERIAL PRIMARY KEY,
  reservation_id INT NOT NULL UNIQUE,
  property_id INT NOT NULL,

  -- Identity document
  document_type_code VARCHAR(60) NULL,
  document_id_number VARCHAR(120) NULL,
  document_issuing_country VARCHAR(80) NULL DEFAULT 'Nigeria',
  document_expiry_date DATE NULL,

  -- Occupancy
  actual_occupant_count INT NULL,
  occupant_names JSONB NULL,
  vehicle_registration VARCHAR(60) NULL,

  -- Acknowledgment
  client_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledgment_timestamp TIMESTAMPTZ NULL,
  acknowledgment_method VARCHAR(40) NULL,

  -- Emergency contact (may supplement booking record)
  emergency_contact_name VARCHAR(120) NULL,
  emergency_contact_phone VARCHAR(40) NULL,
  emergency_contact_relationship VARCHAR(60) NULL,

  -- Checkin notes
  checkin_notes TEXT NULL,
  special_requirements TEXT NULL,

  -- Completion
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  completed_by_id INT NULL,
  completed_at TIMESTAMPTZ NULL,
  overridden_by_id INT NULL,
  override_reason TEXT NULL,
  overridden_at TIMESTAMPTZ NULL,

  created_by_id INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cs_property ON checkin_sessions (property_id);
CREATE INDEX IF NOT EXISTS idx_cs_status ON checkin_sessions (status);

-- 3. Check-In Document Uploads (one or more per document type per reservation)
CREATE TABLE IF NOT EXISTS checkin_documents (
  id SERIAL PRIMARY KEY,
  reservation_id INT NOT NULL,
  property_id INT NOT NULL,
  checkin_session_id INT NULL,
  document_type_code VARCHAR(60) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  upload_status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED',
  verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  verified_by_id INT NULL,
  verified_at TIMESTAMPTZ NULL,
  verification_notes TEXT NULL,
  rejected_reason TEXT NULL,
  replaced_by_id INT NULL,
  replaced_at TIMESTAMPTZ NULL,
  is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by_id INT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cd_reservation ON checkin_documents (reservation_id, is_latest);
CREATE INDEX IF NOT EXISTS idx_cd_property ON checkin_documents (property_id);
CREATE INDEX IF NOT EXISTS idx_cd_type ON checkin_documents (document_type_code);
CREATE INDEX IF NOT EXISTS idx_cd_verification ON checkin_documents (verification_status);
