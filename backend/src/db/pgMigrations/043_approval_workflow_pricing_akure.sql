-- Migration 043: Mandatory Two-Stage Approval Workflow, Apartment Pricing Governance, and Akure Demonstration Locations

-- 1. Extend properties with approval workflow & snapshot tracking
ALTER TABLE properties ADD COLUMN IF NOT EXISTS approval_status VARCHAR(40) DEFAULT 'APPROVED';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS approved_snapshot JSONB DEFAULT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS published_by_id INTEGER NULL;

-- 2. Extend apartments with approval workflow, pricing governance, and snapshot tracking
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS approval_status VARCHAR(40) DEFAULT 'APPROVED';
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS entered_rate_per_night NUMERIC(12, 2) NULL;
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS approved_rate_per_night NUMERIC(12, 2) NULL;
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS rate_type VARCHAR(40) DEFAULT 'PER_NIGHT';
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS price_effective_date DATE NULL;
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS pricing_status VARCHAR(40) DEFAULT 'APPROVED';
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS approved_snapshot JSONB DEFAULT NULL;
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS published_by_id INTEGER NULL;

-- Backfill existing apartments pricing & approval status
UPDATE apartments
SET
  entered_rate_per_night = COALESCE(entered_rate_per_night, rate_per_night),
  approved_rate_per_night = COALESCE(approved_rate_per_night, rate_per_night),
  pricing_status = COALESCE(pricing_status, 'APPROVED'),
  approval_status = COALESCE(approval_status, 'APPROVED'),
  rate_type = COALESCE(rate_type, 'PER_NIGHT');

UPDATE properties
SET approval_status = COALESCE(approval_status, 'APPROVED');

-- 3. Extend property_submissions for Property + Apartment two-stage Owner & Operations Manager approval
ALTER TABLE property_submissions ADD COLUMN IF NOT EXISTS entity_type VARCHAR(20) DEFAULT 'PROPERTY';
ALTER TABLE property_submissions ADD COLUMN IF NOT EXISTS apartment_id INTEGER NULL;
ALTER TABLE property_submissions ADD COLUMN IF NOT EXISTS ops_review_status VARCHAR(30) DEFAULT 'PENDING';
ALTER TABLE property_submissions ADD COLUMN IF NOT EXISTS ops_reviewed_by_id INTEGER NULL;
ALTER TABLE property_submissions ADD COLUMN IF NOT EXISTS ops_reviewed_at TIMESTAMPTZ NULL;
ALTER TABLE property_submissions ADD COLUMN IF NOT EXISTS ops_decision_notes TEXT NULL;
ALTER TABLE property_submissions ADD COLUMN IF NOT EXISTS document_version INTEGER DEFAULT 1;

-- 4. Update existing 3 demonstration properties to Akure, Ondo State, Nigeria (replacing Lagos demo values)
UPDATE properties
SET
  address = 'Alagbaka, Akure, Ondo State, Nigeria',
  location = 'Alagbaka',
  district = 'Alagbaka GRA',
  city = 'Akure',
  state = 'Ondo State',
  country = 'Nigeria',
  description = 'High-rise serviced luxury living in Alagbaka, Akure with 24/7 dual-grid solar power, enterprise fiber internet, and guarded subterranean parking (demonstration location).',
  environment_description = 'Located in Alagbaka, Akure, Ondo State, Nigeria — convenient access to commercial hubs and government districts (demonstration location).'
WHERE id = 1 AND (LOWER(city) = 'lagos' OR LOWER(address) LIKE '%lagos%' OR LOWER(address) LIKE '%aboyade%' OR LOWER(address) LIKE '%victoria island%');

UPDATE properties
SET
  address = 'Ijapo Estate, Akure, Ondo State, Nigeria',
  location = 'Ijapo Estate',
  district = 'Ijapo Central',
  city = 'Akure',
  state = 'Ondo State',
  country = 'Nigeria',
  description = 'Serene garden and courtyard serviced residences in Ijapo Estate, Akure with resident swimming pool and 24/7 power autonomy (demonstration location).',
  environment_description = 'Located in Ijapo Estate, Akure, Ondo State, Nigeria — quiet residential avenues with landscaped grounds (demonstration location).'
WHERE id = 2 AND (LOWER(city) = 'lagos' OR LOWER(address) LIKE '%lagos%' OR LOWER(address) LIKE '%ikoyi%' OR LOWER(address) LIKE '%lekki%');

UPDATE properties
SET
  address = 'Oba-Ile, Akure, Ondo State, Nigeria',
  location = 'Oba-Ile',
  district = 'Ondo Road / Oba-Ile',
  city = 'Akure',
  state = 'Ondo State',
  country = 'Nigeria',
  description = 'Neoclassical serviced suites along the Oba-Ile corridor in Akure with fountain courtyard, sunset terraces, and airport access (demonstration location).',
  environment_description = 'Located in Oba-Ile, Akure, Ondo State, Nigeria — strategic corridor connecting Akure Airport and central districts (demonstration location).'
WHERE id = 3 AND (LOWER(city) = 'lagos' OR LOWER(address) LIKE '%lagos%' OR LOWER(address) LIKE '%banana%' OR LOWER(address) LIKE '%lekki%');
