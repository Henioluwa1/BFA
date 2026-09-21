-- Migration: 004_create_users_and_seed_auth.sql
-- Description: Provision authoritative users table with roles and seed test credentials

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER') NOT NULL DEFAULT 'STAFF',
  property_id INT NULL,
  agent_id INT NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  INDEX idx_user_email (email),
  INDEX idx_user_role (role),
  INDEX idx_user_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Authoritative Accounts (Password: Bfa2026!Secure)
INSERT IGNORE INTO users (id, name, email, password_hash, role, property_id, agent_id, status) VALUES
(1, 'BFA Super Admin', 'superadmin@bfa.com', '$2b$10$GaII4sIWwHiOi1sCf149TOFCzwYPhwSNv7nAAUeSVs1FBC2A6.t3q', 'SUPER_ADMIN', NULL, NULL, 'ACTIVE'),
(2, 'Sarah Jenkins (Admin)', 'admin@bfa.com', '$2b$10$GaII4sIWwHiOi1sCf149TOFCzwYPhwSNv7nAAUeSVs1FBC2A6.t3q', 'ADMIN', NULL, NULL, 'ACTIVE'),
(3, 'Marcus Vance (Manager)', 'manager@bfa.com', '$2b$10$GaII4sIWwHiOi1sCf149TOFCzwYPhwSNv7nAAUeSVs1FBC2A6.t3q', 'MANAGER', NULL, NULL, 'ACTIVE'),
(4, 'Elena Ramos (Reception)', 'receptionist@bfa.com', '$2b$10$GaII4sIWwHiOi1sCf149TOFCzwYPhwSNv7nAAUeSVs1FBC2A6.t3q', 'RECEPTIONIST', 1, NULL, 'ACTIVE'),
(5, 'David Kalu (Staff)', 'staff@bfa.com', '$2b$10$GaII4sIWwHiOi1sCf149TOFCzwYPhwSNv7nAAUeSVs1FBC2A6.t3q', 'STAFF', 1, NULL, 'ACTIVE'),
(6, 'Alexander Wright (Agent)', 'agent@bfa.com', '$2b$10$GaII4sIWwHiOi1sCf149TOFCzwYPhwSNv7nAAUeSVs1FBC2A6.t3q', 'AGENT', NULL, 1, 'ACTIVE'),
(7, 'Chief Emeka BFA (Owner)', 'owner@bfa.com', '$2b$10$GaII4sIWwHiOi1sCf149TOFCzwYPhwSNv7nAAUeSVs1FBC2A6.t3q', 'OWNER', NULL, NULL, 'ACTIVE');
