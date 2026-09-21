# BFA Apartments Management System — Database Blueprint

## Overview
Database: MySQL 8.0+ / MariaDB 10.4+ (utf8mb4 charset, utf8mb4_unicode_ci collation).
Transactional migrations tracked in `schema_migrations`.

---

## Foundation Schema (Phase 1)

### 1. `schema_migrations`
Tracks executed database migrations.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `migration_name` (VARCHAR(255) UNIQUE NOT NULL)
- `executed_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

### 2. `system_settings`
Key-value store for application, company, and financial settings.
- `id` (INT AUTO_INCREMENT PRIMARY KEY)
- `category` (VARCHAR(50) NOT NULL DEFAULT 'general') -- general, company, reservations, financial, notifications
- `setting_key` (VARCHAR(100) UNIQUE NOT NULL)
- `setting_value` (TEXT NOT NULL)
- `description` (VARCHAR(255) NULL)
- `updated_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)

### 3. `audit_logs`
Immutable audit trail for compliance and tracking sensitive actions.
- `id` (BIGINT AUTO_INCREMENT PRIMARY KEY)
- `actor_id` (INT NULL)
- `actor_email` (VARCHAR(191) NULL)
- `actor_role` (VARCHAR(50) NULL)
- `action` (VARCHAR(100) NOT NULL) -- e.g. USER_LOGIN, RESERVATION_CREATE, STATUS_CHANGE
- `entity_type` (VARCHAR(50) NOT NULL) -- e.g. reservation, apartment, payment
- `entity_id` (VARCHAR(100) NULL)
- `old_values` (JSON NULL)
- `new_values` (JSON NULL)
- `ip_address` (VARCHAR(45) NULL)
- `user_agent` (VARCHAR(255) NULL)
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
- INDEX (`actor_id`), INDEX (`action`), INDEX (`entity_type`), INDEX (`created_at`)

---

## Planned Entities for Future Phases

- **Phase 2 (Auth & RBAC)**: `users`, `roles`, `permissions`, `role_permissions`, `user_sessions`
- **Phase 3 (Properties & Units)**: `properties`, `unit_types`, `apartments`, `apartment_amenities`
- **Phase 4 (Reservations)**: `guests`, `reservations`, `reservation_guests`, `reservation_rates`
- **Phase 6 (Inspections)**: `inspections`, `inspection_items`, `inspection_attachments`
- **Phase 7 (Maintenance)**: `maintenance_requests`, `maintenance_logs`
- **Phase 8 (Financial)**: `payments`, `payment_methods`, `expenses`, `expense_categories`
- **Phase 9 (Agents)**: `agents`, `agent_commissions`, `agent_settlements`
