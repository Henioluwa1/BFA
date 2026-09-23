-- Migration: 010_guests_and_inspections.sql
-- Description: Provision tenants/guests profile management and inspection lifecycle for Phase 5 + 6

-- 1. Create Guests / Tenants Table
CREATE TABLE IF NOT EXISTS guests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  phone VARCHAR(50) NOT NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(100) NULL DEFAULT 'Lagos',
  country VARCHAR(100) NULL DEFAULT 'Nigeria',
  nationality VARCHAR(100) NULL DEFAULT 'Nigerian',
  identification_type VARCHAR(50) NULL,
  identification_number VARCHAR(100) NULL,
  emergency_contact_name VARCHAR(150) NULL,
  emergency_contact_phone VARCHAR(50) NULL,
  notes TEXT NULL,
  status ENUM('ACTIVE', 'VIP', 'FLAGGED', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_guest_email (email),
  INDEX idx_guest_phone (phone),
  INDEX idx_guest_status (status),
  INDEX idx_guest_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Link Reservations to Authoritative Guests Table
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS guest_id INT NULL AFTER tenant_phone,
  ADD CONSTRAINT fk_reservations_guest FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL,
  ADD INDEX IF NOT EXISTS idx_res_guest (guest_id);

-- 3. Create Inspections Table
CREATE TABLE IF NOT EXISTS inspections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspection_code VARCHAR(50) NOT NULL UNIQUE,
  reservation_id INT NULL,
  guest_id INT NULL,
  property_id INT NOT NULL,
  apartment_id INT NOT NULL,
  inspector_id INT NOT NULL,
  inspection_type ENUM('PRE_CHECKIN', 'CHECKOUT', 'ROUTINE', 'DAMAGE', 'MAINTENANCE_REVIEW') NOT NULL DEFAULT 'CHECKOUT',
  condition_rating ENUM('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED') NOT NULL DEFAULT 'GOOD',
  damage_items JSON NULL,
  missing_items JSON NULL,
  notes TEXT NULL,
  evidence JSON NULL,
  status ENUM('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'FOLLOW_UP') NOT NULL DEFAULT 'DRAFT',
  scheduled_date DATE NOT NULL,
  completed_at TIMESTAMP NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
  FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
  FOREIGN KEY (inspector_id) REFERENCES users(id),
  INDEX idx_insp_status (status),
  INDEX idx_insp_type (inspection_type),
  INDEX idx_insp_date (scheduled_date),
  INDEX idx_insp_res (reservation_id),
  INDEX idx_insp_apt (apartment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed Initial Guests from Existing Reservation Baseline
INSERT IGNORE INTO guests (id, first_name, last_name, display_name, email, phone, city, nationality, status) VALUES
(1, 'Emmanuel', 'Okon', 'Chief Emmanuel Okon', 'emmanuel.okon@oilgas.ng', '+234 803 555 0101', 'Port Harcourt', 'Nigerian', 'VIP'),
(2, 'Sarah', 'Jenkins', 'Sarah Jenkins', 'sarah.jenkins@diplomatic.org', '+234 803 555 0102', 'Abuja', 'British', 'ACTIVE'),
(3, 'Babatunde', 'Fashola', 'Engr. Babatunde Fashola', 'babatunde.f@logistics.ng', '+234 803 555 0103', 'Lagos', 'Nigerian', 'ACTIVE');

-- 5. Link Existing Baseline Reservations to Authoritative Guests
UPDATE reservations SET guest_id = 1 WHERE id = 1;
UPDATE reservations SET guest_id = 2 WHERE id = 2;
