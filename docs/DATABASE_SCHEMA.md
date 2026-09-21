# BFA Apartments Management System — Database Blueprint

## Overview
Database: MySQL 8.0+ / MariaDB 10.4+ (utf8mb4 charset, utf8mb4_unicode_ci collation).
Transactional migrations tracked in `schema_migrations`.

---

## Migration History

### 1. `001_initial_schema.sql` (Phase 1)
- `schema_migrations`
- `system_settings`
- `audit_logs`

### 2. `002_seed_initial_data.sql` (Phase 1)
- Initial system settings seed

### 3. `003_modular_erp_entities.sql` (Architecture Upgrade)
- Upgraded `audit_logs` with `request_id` column and index.
- Created `properties`, `apartments`, `reservations`, `maintenance_requests`, and `agents` tables with seed records.

---

## Active Database Schema

### 1. `schema_migrations`
Tracks executed database migrations.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `migration_name` (VARCHAR(255) UNIQUE NOT NULL)
- `executed_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

### 2. `system_settings`
Key-value store for application, company, and financial settings.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `category` (VARCHAR(50) NOT NULL DEFAULT 'general')
- `setting_key` (VARCHAR(100) UNIQUE NOT NULL)
- `setting_value` (TEXT NOT NULL)
- `description` (VARCHAR(255) NULL)
- `updated_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)

### 3. `audit_logs`
Immutable audit trail for compliance, correlated with HTTP request IDs.
- `id` (BIGINT AUTO_INCREMENT PRIMARY KEY)
- `actor_id` (INT NULL)
- `actor_email` (VARCHAR(191) NULL)
- `actor_role` (VARCHAR(50) NULL)
- `action` (VARCHAR(100) NOT NULL)
- `entity_type` (VARCHAR(50) NOT NULL)
- `entity_id` (VARCHAR(100) NULL)
- `old_values` (JSON NULL)
- `new_values` (JSON NULL)
- `request_id` (VARCHAR(64) NULL)
- `ip_address` (VARCHAR(45) NULL)
- `user_agent` (VARCHAR(255) NULL)
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
- INDEX: (`actor_id`), (`action`), (`entity_type`), (`request_id`), (`created_at`)

### 4. `properties`
Physical multi-building portfolio managed by BFA.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `name` (VARCHAR(191) NOT NULL)
- `code` (VARCHAR(50) UNIQUE NOT NULL)
- `address` (TEXT NULL)
- `city` (VARCHAR(100) NULL)
- `country` (VARCHAR(100) DEFAULT 'Nigeria')
- `total_units` (INT DEFAULT 0)
- `status` (ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE') DEFAULT 'ACTIVE')
- `created_at`, `updated_at` (TIMESTAMP)

### 5. `apartments`
Individual rental units strictly belonging to one property.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `property_id` (INT NOT NULL, FK -> `properties(id)` ON DELETE CASCADE)
- `unit_number` (VARCHAR(50) NOT NULL)
- `floor` (INT DEFAULT 1)
- `unit_type` (VARCHAR(50) DEFAULT 'STANDARD') -- STUDIO, 1BDR, 2BDR, PENTHOUSE
- `status` (ENUM('AVAILABLE', 'RESERVED', 'OCCUPIED', 'DIRTY', 'CLEANING', 'READY', 'MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE') DEFAULT 'AVAILABLE')
- `daily_rate` (DECIMAL(12,2) NOT NULL DEFAULT 0.00)
- `created_at`, `updated_at` (TIMESTAMP)
- UNIQUE (`property_id`, `unit_number`)

### 6. `reservations`
Guest booking stays. Strictly enforces the **1-Night Rule**.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `reference` (VARCHAR(50) UNIQUE NOT NULL)
- `property_id` (INT NOT NULL, FK -> `properties(id)`)
- `apartment_id` (INT NOT NULL, FK -> `apartments(id)`)
- `guest_name` (VARCHAR(191) NOT NULL)
- `guest_email` (VARCHAR(191) NOT NULL)
- `guest_phone` (VARCHAR(50) NULL)
- `check_in_date` (DATE NOT NULL)
- `check_out_date` (DATE NOT NULL)
- `status` (ENUM('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW') DEFAULT 'CONFIRMED')
- `total_amount` (DECIMAL(12,2) NOT NULL DEFAULT 0.00)
- `agent_id` (INT NULL)
- `created_at`, `updated_at` (TIMESTAMP)
- **Constraint**: `CONSTRAINT chk_one_night CHECK (DATEDIFF(check_out_date, check_in_date) = 1)`

### 7. `maintenance_requests`
Operational issue tracking per property/unit.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `property_id` (INT NOT NULL, FK -> `properties(id)`)
- `apartment_id` (INT NULL, FK -> `apartments(id)`)
- `title` (VARCHAR(255) NOT NULL)
- `description` (TEXT NULL)
- `priority` (ENUM('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY') DEFAULT 'MEDIUM')
- `status` (ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') DEFAULT 'OPEN')
- `created_at`, `updated_at` (TIMESTAMP)

### 8. `agents`
Third-party booking agents and commission records.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `name` (VARCHAR(191) NOT NULL)
- `email` (VARCHAR(191) UNIQUE NOT NULL)
- `phone` (VARCHAR(50) NULL)
- `commission_rate` (DECIMAL(5,2) DEFAULT 10.00)
- `status` (ENUM('ACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE')
- `created_at`, `updated_at` (TIMESTAMP)
