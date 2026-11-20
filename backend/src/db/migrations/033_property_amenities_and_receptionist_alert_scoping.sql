-- Migration: 033_property_amenities_and_receptionist_alert_scoping.sql
-- Description: Dynamic property amenities (max 7), dynamic apartment amenities,
-- manually entered apartment codes, district/location columns, and media asset support (MySQL baseline).

-- 1. Extend properties table with location and district columns
SET @exist_location := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'properties' AND COLUMN_NAME = 'location'
);
SET @sql_location := IF(@exist_location = 0, 'ALTER TABLE properties ADD COLUMN location VARCHAR(200) NULL AFTER address', 'SELECT 1');
PREPARE stmt_location FROM @sql_location;
EXECUTE stmt_location;
DEALLOCATE PREPARE stmt_location;

SET @exist_district := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'properties' AND COLUMN_NAME = 'district'
);
SET @sql_district := IF(@exist_district = 0, 'ALTER TABLE properties ADD COLUMN district VARCHAR(150) NULL AFTER city', 'SELECT 1');
PREPARE stmt_district FROM @sql_district;
EXECUTE stmt_district;
DEALLOCATE PREPARE stmt_district;

-- 2. Extend apartments table with apartment_code and description
SET @exist_apt_code := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'apartments' AND COLUMN_NAME = 'apartment_code'
);
SET @sql_apt_code := IF(@exist_apt_code = 0, 'ALTER TABLE apartments ADD COLUMN apartment_code VARCHAR(100) NULL AFTER unit_number', 'SELECT 1');
PREPARE stmt_apt_code FROM @sql_apt_code;
EXECUTE stmt_apt_code;
DEALLOCATE PREPARE stmt_apt_code;

SET @exist_apt_desc := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'apartments' AND COLUMN_NAME = 'description'
);
SET @sql_apt_desc := IF(@exist_apt_desc = 0, 'ALTER TABLE apartments ADD COLUMN description TEXT NULL AFTER unit_name', 'SELECT 1');
PREPARE stmt_apt_desc FROM @sql_apt_desc;
EXECUTE stmt_apt_desc;
DEALLOCATE PREPARE stmt_apt_desc;

UPDATE apartments SET apartment_code = unit_number WHERE apartment_code IS NULL AND unit_number IS NOT NULL;

-- 3. Create property_amenities table
CREATE TABLE IF NOT EXISTS property_amenities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  photo_url VARCHAR(500) NULL,
  media_asset_id INT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prop_amenities_prop (property_id, display_order),
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create apartment_amenities table
CREATE TABLE IF NOT EXISTS apartment_amenities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  apartment_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  photo_url VARCHAR(500) NULL,
  media_asset_id INT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_apt_amenities_apt (apartment_id, display_order),
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
