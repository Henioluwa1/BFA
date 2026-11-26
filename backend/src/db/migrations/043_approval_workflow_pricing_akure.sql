-- Migration 043 (MySQL): Mandatory Two-Stage Approval Workflow & Apartment Pricing Governance
ALTER TABLE properties ADD COLUMN approval_status VARCHAR(40) DEFAULT 'APPROVED';
ALTER TABLE properties ADD COLUMN approved_snapshot JSON NULL;
ALTER TABLE properties ADD COLUMN published_at DATETIME NULL;
ALTER TABLE properties ADD COLUMN published_by_id INT NULL;

ALTER TABLE apartments ADD COLUMN approval_status VARCHAR(40) DEFAULT 'APPROVED';
ALTER TABLE apartments ADD COLUMN entered_rate_per_night DECIMAL(12, 2) NULL;
ALTER TABLE apartments ADD COLUMN approved_rate_per_night DECIMAL(12, 2) NULL;
ALTER TABLE apartments ADD COLUMN rate_type VARCHAR(40) DEFAULT 'PER_NIGHT';
ALTER TABLE apartments ADD COLUMN price_effective_date DATE NULL;
ALTER TABLE apartments ADD COLUMN pricing_status VARCHAR(40) DEFAULT 'APPROVED';
ALTER TABLE apartments ADD COLUMN approved_snapshot JSON NULL;
ALTER TABLE apartments ADD COLUMN published_at DATETIME NULL;
ALTER TABLE apartments ADD COLUMN published_by_id INT NULL;

ALTER TABLE property_submissions ADD COLUMN entity_type VARCHAR(20) DEFAULT 'PROPERTY';
ALTER TABLE property_submissions ADD COLUMN apartment_id INT NULL;
ALTER TABLE property_submissions ADD COLUMN ops_review_status VARCHAR(30) DEFAULT 'PENDING';
ALTER TABLE property_submissions ADD COLUMN ops_reviewed_by_id INT NULL;
ALTER TABLE property_submissions ADD COLUMN ops_reviewed_at DATETIME NULL;
ALTER TABLE property_submissions ADD COLUMN ops_decision_notes TEXT NULL;
ALTER TABLE property_submissions ADD COLUMN document_version INT DEFAULT 1;
