# BFA Apartments Management System — Database Blueprint

## Overview
Database: MySQL 8.0+ / MariaDB 10.4+ (utf8mb4 charset, utf8mb4_unicode_ci collation).
Transactional migrations tracked in `schema_migrations`.

---

## Migration History

### 1. `001_create_schema_migrations.sql` (Phase 1)
- `schema_migrations`
- `system_settings`
- `audit_logs`

### 2. `002_create_core_system_tables.sql` (Phase 1)
- Initial system settings seed

### 3. `003_modular_erp_entities.sql` (Architecture Upgrade)
- Upgraded `audit_logs` with `request_id` column and index.
- Created `properties`, `apartments`, `reservations`, `maintenance_requests`, and `agents` tables with seed records.
- Added `CONSTRAINT chk_one_night CHECK (DATEDIFF(check_out_date, check_in_date) = 1)`.

### 4. `004_create_users_and_seed_auth.sql` (Authentication & RBAC Alignment)
- Created `users` table with bcrypt password hashing and 7 authoritative roles.
- Seeded accounts for `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER`.

---

## Active Database Schema

### 1. `users` (Authoritative Authentication & Role Mapping)
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `name` (VARCHAR(150) NOT NULL)
- `email` (VARCHAR(191) NOT NULL UNIQUE)
- `password_hash` (VARCHAR(255) NOT NULL)
- `role` ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER') NOT NULL DEFAULT 'STAFF'
- `property_id` (INT NULL, FK -> `properties(id)` ON DELETE SET NULL)
- `agent_id` (INT NULL, FK -> `agents(id)` ON DELETE SET NULL)
- `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE'
- `last_login_at` (TIMESTAMP NULL)
- `created_at`, `updated_at` (TIMESTAMP)
- INDEX: (`email`), (`role`), (`status`)

### 2. `properties`
Physical multi-building portfolio managed by BFA.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `name` (VARCHAR(150) NOT NULL)
- `code` (VARCHAR(20) NOT NULL UNIQUE)
- `address` (VARCHAR(255) NOT NULL)
- `city` (VARCHAR(100) NOT NULL DEFAULT 'Lagos')
- `status` ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE') NOT NULL DEFAULT 'ACTIVE'
- `created_at`, `updated_at` (TIMESTAMP)

### 3. `apartments`
Individual rental units strictly belonging to one property.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `property_id` (INT NOT NULL, FK -> `properties(id)` ON DELETE CASCADE)
- `unit_number` (VARCHAR(50) NOT NULL)
- `unit_name` (VARCHAR(100) NOT NULL)
- `unit_type` (VARCHAR(50) NOT NULL DEFAULT 'Deluxe Studio')
- `status` VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE'
- `rate_per_night` (DECIMAL(10, 2) NOT NULL DEFAULT 150.00)
- `created_at`, `updated_at` (TIMESTAMP)
- UNIQUE (`property_id`, `unit_number`)

### 4. `reservations`
Guest booking stays. Strictly enforces the **1-Night Rule**.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `reservation_code` (VARCHAR(50) NOT NULL UNIQUE)
- `property_id` (INT NOT NULL, FK -> `properties(id)`)
- `apartment_id` (INT NOT NULL, FK -> `apartments(id)`)
- `tenant_name` (VARCHAR(150) NOT NULL)
- `tenant_email` (VARCHAR(191) NOT NULL)
- `tenant_phone` (VARCHAR(50) NOT NULL)
- `agent_id` (INT NULL, FK -> `agents(id)`)
- `check_in_date` (DATE NOT NULL)
- `check_out_date` (DATE NOT NULL)
- `nights` (INT NOT NULL DEFAULT 1)
- `total_amount` (DECIMAL(10, 2) NOT NULL)
- `paid_amount` (DECIMAL(10, 2) NOT NULL DEFAULT 0.00)
- `status` (VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED')
- `created_at`, `updated_at` (TIMESTAMP)
- **Constraint**: `CONSTRAINT chk_one_night CHECK (DATEDIFF(check_out_date, check_in_date) = 1)`

### 5. `audit_logs`
Immutable audit trail correlated with HTTP request IDs.
- `id` (BIGINT AUTO_INCREMENT PRIMARY KEY)
- `actor_id` (INT NULL)
- `actor_email` (VARCHAR(191) NULL)
- `actor_role` (VARCHAR(50) NULL)
- `action` (VARCHAR(100) NOT NULL)
- `entity_type` (VARCHAR(50) NOT NULL)
- `entity_id` (VARCHAR(100) NULL)
- `old_values` (JSON NULL)
- `new_values` (JSON NULL)
- `request_id` (VARCHAR(100) NULL)
- `ip_address` (VARCHAR(45) NULL)
- `user_agent` (VARCHAR(255) NULL)
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

### 6. `maintenance_requests`
Operational issue tracking per property/unit.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `issue_code` (VARCHAR(50) NOT NULL UNIQUE)
- `property_id` (INT NOT NULL, FK -> `properties(id)`)
- `apartment_id` (INT NOT NULL, FK -> `apartments(id)`)
- `issue_title` (VARCHAR(200) NOT NULL)
- `description` (TEXT NULL)
- `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM'
- `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED') NOT NULL DEFAULT 'OPEN'
- `assigned_to` (VARCHAR(100) NULL)
- `cost` (DECIMAL(10, 2) NOT NULL DEFAULT 0.00)
- `created_at`, `updated_at` (TIMESTAMP)

### 7. `agents`
Third-party booking agents and commission records.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `name` (VARCHAR(150) NOT NULL)
- `email` (VARCHAR(191) NOT NULL UNIQUE)
- `phone` (VARCHAR(50) NOT NULL)
- `commission_rate` (DECIMAL(5, 2) NOT NULL DEFAULT 10.00)
- `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE'
- `created_at`, `updated_at` (TIMESTAMP)
