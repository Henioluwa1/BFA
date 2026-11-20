-- Migration: 032_property_spaces_and_receptionist_monitor.sql
-- Description: Provision Apartment Internal Spaces (Level C hierarchy), expand media assets,
--              expand property approval lifecycle, and create live receptionist performance monitoring.

-- 1. Create Apartment Internal Spaces Table (Level C in Property Hierarchy)
CREATE TABLE IF NOT EXISTS apartment_internal_spaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  apartment_id INT NOT NULL,
  property_id INT NOT NULL,
  space_type ENUM(
    'BEDROOM', 'LIVING_ROOM', 'KITCHEN', 'BATHROOM', 'TOILET',
    'DINING_AREA', 'BALCONY', 'STUDY_AREA', 'CORRIDOR', 'TERRACE', 'CUSTOM'
  ) NOT NULL DEFAULT 'CUSTOM',
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  display_order INT NOT NULL DEFAULT 0,
  amenities JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ais_apartment FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
  CONSTRAINT fk_ais_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  INDEX idx_ais_apartment_order (apartment_id, display_order),
  INDEX idx_ais_property (property_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Expand Media Assets to support INTERNAL_SPACE and link to internal_space_id
SET @dbname = DATABASE();
SET @tablename = 'media_assets';
SET @columnname = 'internal_space_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE media_assets ADD COLUMN internal_space_id INT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

ALTER TABLE media_assets MODIFY COLUMN entity_type ENUM('PROPERTY', 'APARTMENT', 'INTERNAL_SPACE') NOT NULL;

-- 3. Expand Property Status and Publication Lifecycle
ALTER TABLE properties MODIFY COLUMN status ENUM(
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED',
  'PUBLISHED', 'UNPUBLISHED', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ARCHIVED'
) NOT NULL DEFAULT 'ACTIVE';

SET @columnname = 'category';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'properties' AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE properties ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT "APARTMENT_BUILDING"'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'environment_description';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'properties' AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE properties ADD COLUMN environment_description TEXT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'admin_approved_at';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'properties' AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE properties ADD COLUMN admin_approved_at DATETIME NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'admin_approved_by_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'properties' AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE properties ADD COLUMN admin_approved_by_id INT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'owner_approved_at';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'properties' AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE properties ADD COLUMN owner_approved_at DATETIME NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'owner_approved_by_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'properties' AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE properties ADD COLUMN owner_approved_by_id INT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'published_at';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'properties' AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE properties ADD COLUMN published_at DATETIME NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'published_by_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'properties' AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE properties ADD COLUMN published_by_id INT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'rejection_reason';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'properties' AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE properties ADD COLUMN rejection_reason TEXT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 4. Create Receptionist Daily Metrics Table
CREATE TABLE IF NOT EXISTS receptionist_daily_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receptionist_id INT NOT NULL,
  property_id INT NOT NULL,
  work_date DATE NOT NULL,
  shift_status ENUM('ON_SHIFT', 'OFF_SHIFT', 'ON_BREAK') NOT NULL DEFAULT 'OFF_SHIFT',
  availability_status ENUM('AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE') NOT NULL DEFAULT 'AVAILABLE',
  current_activity VARCHAR(255) NULL,
  shift_start_time DATETIME NULL,
  shift_end_time DATETIME NULL,
  total_shift_minutes INT NOT NULL DEFAULT 0,
  bookings_alerted_count INT NOT NULL DEFAULT 0,
  bookings_claimed_count INT NOT NULL DEFAULT 0,
  bookings_completed_count INT NOT NULL DEFAULT 0,
  pending_assigned_count INT NOT NULL DEFAULT 0,
  total_claim_response_seconds INT NOT NULL DEFAULT 0,
  average_claim_response_seconds INT NOT NULL DEFAULT 0,
  check_ins_count INT NOT NULL DEFAULT 0,
  check_outs_count INT NOT NULL DEFAULT 0,
  tasks_completed_count INT NOT NULL DEFAULT 0,
  last_activity_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rdm_receptionist FOREIGN KEY (receptionist_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rdm_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  UNIQUE KEY uq_rdm_receptionist_date (receptionist_id, property_id, work_date),
  INDEX idx_rdm_date_prop (work_date, property_id),
  INDEX idx_rdm_receptionist (receptionist_id, work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Create Receptionist Activity Logs Table
CREATE TABLE IF NOT EXISTS receptionist_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receptionist_id INT NOT NULL,
  property_id INT NOT NULL,
  event_type ENUM(
    'SHIFT_START', 'SHIFT_END', 'AVAILABILITY_CHANGE',
    'BOOKING_ALERTED', 'BOOKING_CLAIMED',
    'CHECK_IN_COMPLETED', 'CHECK_OUT_COMPLETED', 'TASK_COMPLETED'
  ) NOT NULL,
  work_date DATE NOT NULL,
  reservation_id INT NULL,
  response_time_seconds INT NULL,
  description VARCHAR(255) NOT NULL,
  details JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ral_receptionist FOREIGN KEY (receptionist_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ral_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_ral_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
  INDEX idx_ral_receptionist_date (receptionist_id, work_date, created_at),
  INDEX idx_ral_property_date (property_id, work_date),
  INDEX idx_ral_event (event_type, work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
