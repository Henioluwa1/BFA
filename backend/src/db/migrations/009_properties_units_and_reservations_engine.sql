-- Migration: 009_properties_units_and_reservations_engine.sql
-- Description: Expand properties, apartments, reservations for Phase 3 + Phase 4 combined engine

-- 1. Expand properties table
ALTER TABLE properties
  MODIFY COLUMN status ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER city,
  ADD COLUMN IF NOT EXISTS state VARCHAR(100) NOT NULL DEFAULT 'Lagos' AFTER description,
  ADD COLUMN IF NOT EXISTS country VARCHAR(100) NOT NULL DEFAULT 'Nigeria' AFTER state,
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) NULL AFTER country,
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(191) NULL AFTER contact_phone,
  ADD COLUMN IF NOT EXISTS operational_status VARCHAR(50) NOT NULL DEFAULT 'OPERATIONAL' AFTER status,
  ADD COLUMN IF NOT EXISTS check_in_time VARCHAR(20) NOT NULL DEFAULT '14:00' AFTER operational_status,
  ADD COLUMN IF NOT EXISTS check_out_time VARCHAR(20) NOT NULL DEFAULT '11:00' AFTER check_in_time,
  ADD COLUMN IF NOT EXISTS amenities JSON NULL AFTER check_out_time,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER amenities,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE AFTER notes,
  ADD COLUMN IF NOT EXISTS created_by INT NULL AFTER is_archived,
  ADD COLUMN IF NOT EXISTS updated_by INT NULL AFTER created_by,
  ADD INDEX IF NOT EXISTS idx_prop_archived (is_archived);

-- 2. Expand apartments / units table
ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS floor VARCHAR(20) NULL AFTER unit_type,
  ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 2 AFTER floor,
  ADD COLUMN IF NOT EXISTS bedroom_count INT NOT NULL DEFAULT 1 AFTER capacity,
  ADD COLUMN IF NOT EXISTS bathroom_count INT NOT NULL DEFAULT 1 AFTER bedroom_count,
  ADD COLUMN IF NOT EXISTS amenities JSON NULL AFTER rate_per_night,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER amenities,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER notes,
  ADD COLUMN IF NOT EXISTS created_by INT NULL AFTER is_active,
  ADD COLUMN IF NOT EXISTS updated_by INT NULL AFTER created_by,
  ADD INDEX IF NOT EXISTS idx_unit_active (is_active),
  ADD INDEX IF NOT EXISTS idx_unit_type (unit_type);

-- 3. Expand reservations table
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS source ENUM('DIRECT', 'ONLINE', 'AGENT', 'WALK_IN', 'PHONE', 'OTHER') NOT NULL DEFAULT 'DIRECT' AFTER agent_id,
  ADD COLUMN IF NOT EXISTS special_requests TEXT NULL AFTER payment_method,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER special_requests,
  ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255) NULL AFTER notes,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL AFTER cancellation_reason,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP NULL AFTER cancelled_at,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMP NULL AFTER checked_in_at,
  ADD COLUMN IF NOT EXISTS created_by INT NULL AFTER checked_out_at,
  ADD COLUMN IF NOT EXISTS updated_by INT NULL AFTER created_by,
  ADD INDEX IF NOT EXISTS idx_res_source (source);

-- 4. Reservation Status History Table
CREATE TABLE IF NOT EXISTS reservation_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  from_status VARCHAR(50) NULL,
  to_status VARCHAR(50) NOT NULL,
  actor_id INT NULL,
  actor_role VARCHAR(50) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  INDEX idx_rsh_res (reservation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Operational Blocked Periods Table (Maintenance / Owner Blocking)
CREATE TABLE IF NOT EXISTS blocked_periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  apartment_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255) NOT NULL,
  blocked_by_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
  INDEX idx_block_dates (start_date, end_date),
  INDEX idx_block_apt (apartment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Seed/enrich baseline properties with realistic descriptions and amenities
UPDATE properties SET
  description = 'High-rise waterfront luxury living in Victoria Island with 24/7 security and concierge service.',
  contact_phone = '+234 800 232 4001',
  contact_email = 'horizon@bfa-apartments.com',
  amenities = '["Fiber Internet", "Swimming Pool", "Gym", "24/7 Power", "Concierge", "Secure Parking"]',
  operational_status = 'OPERATIONAL'
WHERE id = 1;

UPDATE properties SET
  description = 'Serene waterfront executive residences in Ikoyi featuring scenic lagoon views and private docks.',
  contact_phone = '+234 800 232 4002',
  contact_email = 'azure@bfa-apartments.com',
  amenities = '["Lagoon View", "Fiber Internet", "Private Jetty", "24/7 Power", "Executive Lounge"]',
  operational_status = 'OPERATIONAL'
WHERE id = 2;

UPDATE properties SET
  description = 'Boutique premium serviced suites in the heart of Lekki Phase 1 dining and shopping district.',
  contact_phone = '+234 800 232 4003',
  contact_email = 'palms@bfa-apartments.com',
  amenities = '["Fiber Internet", "Rooftop Terrace", "Smart TV", "24/7 Power", "Room Service"]',
  operational_status = 'OPERATIONAL'
WHERE id = 3;
