-- Migration: 003_modular_erp_entities.sql
-- Description: Provision properties, units, agents, reservations (with 1-night check constraint), and maintenance for ERP modular monolith

-- 1. Upgrade audit_logs to include request_id
ALTER TABLE audit_logs 
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(100) NULL AFTER user_agent,
  ADD INDEX IF NOT EXISTS idx_audit_request_id (request_id);

-- 2. Properties Table
CREATE TABLE IF NOT EXISTS properties (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Lagos',
  status ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prop_code (code),
  INDEX idx_prop_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Apartments / Units Table
CREATE TABLE IF NOT EXISTS apartments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  unit_number VARCHAR(50) NOT NULL,
  unit_name VARCHAR(100) NOT NULL,
  unit_type VARCHAR(50) NOT NULL DEFAULT 'Deluxe Studio',
  status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
  rate_per_night DECIMAL(10, 2) NOT NULL DEFAULT 150.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  UNIQUE KEY uq_property_unit (property_id, unit_number),
  INDEX idx_unit_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Agents Table
CREATE TABLE IF NOT EXISTS agents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  phone VARCHAR(50) NOT NULL,
  commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Reservations Table (Mandatory Section 16 One-Night Stay Constraint)
CREATE TABLE IF NOT EXISTS reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_code VARCHAR(50) NOT NULL UNIQUE,
  property_id INT NOT NULL,
  apartment_id INT NOT NULL,
  tenant_name VARCHAR(150) NOT NULL,
  tenant_email VARCHAR(191) NOT NULL,
  tenant_phone VARCHAR(50) NOT NULL,
  agent_id INT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INT NOT NULL DEFAULT 1,
  total_amount DECIMAL(10, 2) NOT NULL,
  paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (apartment_id) REFERENCES apartments(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  CONSTRAINT chk_one_night CHECK (DATEDIFF(check_out_date, check_in_date) = 1),
  INDEX idx_res_dates (check_in_date, check_out_date),
  INDEX idx_res_status (status),
  INDEX idx_res_tenant (tenant_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Maintenance Requests Table
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  issue_code VARCHAR(50) NOT NULL UNIQUE,
  property_id INT NOT NULL,
  apartment_id INT NOT NULL,
  issue_title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  assigned_to VARCHAR(100) NULL,
  cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (apartment_id) REFERENCES apartments(id),
  INDEX idx_maint_status (status),
  INDEX idx_maint_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Seed Initial Entities for Live Testing, Global Search & Reporting
INSERT IGNORE INTO properties (id, name, code, address, city, status) VALUES
(1, 'Grand Horizon Tower', 'GHT', '12 Bishop Aboyade Cole, Victoria Island', 'Lagos', 'ACTIVE'),
(2, 'Azure Bay Residences', 'ABR', '8 Gerard Road, Ikoyi Waterfront', 'Lagos', 'ACTIVE'),
(3, 'The Royal Palms Suites', 'RPS', '24 Admiralty Way, Lekki Phase 1', 'Lagos', 'ACTIVE');

INSERT IGNORE INTO apartments (id, property_id, unit_number, unit_name, unit_type, status, rate_per_night) VALUES
(1, 1, '101', 'Penthouse Horizon 101', 'Executive Penthouse', 'AVAILABLE', 350.00),
(2, 1, '102', 'Deluxe Suite 102', '1-Bedroom Deluxe', 'OCCUPIED', 220.00),
(3, 1, '103', 'Studio Prime 103', 'Studio Premier', 'DIRTY', 160.00),
(4, 2, '201', 'Azure Waterfront Suite 201', '2-Bedroom Luxury', 'AVAILABLE', 280.00),
(5, 2, '202', 'Bayside Studio 202', 'Studio Standard', 'MAINTENANCE', 140.00),
(6, 3, '301', 'Royal Palm Premier 301', '1-Bedroom Deluxe', 'AVAILABLE', 200.00);

INSERT IGNORE INTO agents (id, name, email, phone, commission_rate, status) VALUES
(1, 'Alexander Wright', 'alex.wright@luxuryagents.com', '+234 801 111 2222', 10.00, 'ACTIVE'),
(2, 'Victoria Adeleke', 'victoria@globalrealtors.ng', '+234 802 333 4444', 12.50, 'ACTIVE');

INSERT IGNORE INTO reservations (id, reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone, agent_id, check_in_date, check_out_date, nights, total_amount, paid_amount, status) VALUES
(1, 'RES-BFA-1001', 1, 2, 'Chief Emmanuel Okon', 'emmanuel.okon@oilgas.ng', '+234 803 555 0101', 1, '2026-09-22', '2026-09-23', 1, 220.00, 220.00, 'CONFIRMED'),
(2, 'RES-BFA-1002', 2, 4, 'Sarah Jenkins', 'sarah.jenkins@diplomatic.org', '+234 803 555 0102', NULL, '2026-09-23', '2026-09-24', 1, 280.00, 100.00, 'CONFIRMED');

INSERT IGNORE INTO maintenance_requests (id, issue_code, property_id, apartment_id, issue_title, description, priority, status, assigned_to, cost) VALUES
(1, 'MNT-2026-001', 2, 5, 'HVAC Cooling Compressor Failure', 'AC in Bayside Studio 202 not cooling below 26C. Replacement valve needed.', 'HIGH', 'IN_PROGRESS', 'Engr. Daniel B.', 150.00),
(2, 'MNT-2026-002', 1, 3, 'Deep Steam Clean & Sanitization', 'Post-stay cleaning and sanitization required after late checkout.', 'MEDIUM', 'OPEN', 'Housekeeping Team Alpha', 45.00);
