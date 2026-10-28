# BFA Operations Control Center (OCC) — Operating Guide

## 1. System Overview

The **Operations Control Center** is the unified administrative, observability, and governance surface for the BFA Apartments Management System. Designed for system administrators, sovereign executive owners, and senior operational management, it replaces disparate diagnostic scripts with a secure, real-time, server-backed management console.

### Key Capabilities
- **Subsystem Observability**: Live diagnostic telemetry for API Gateway, MariaDB, JWT Auth, Double-Entry GL, Reports Engine, and Socket.IO.
- **Dynamic Feature Governance**: Non-destructive operational toggling for modular components without application restarts or redeployments.
- **Core Protection Engine**: Hardened protection preventing administrative lockout or accidental disabling of fundamental platform services.
- **Sovereignty & User Governance**: Strict enforcement of single Super Administrator sovereignty and single Owner stakeholder oversight.
- **Audit Logging**: Immutable, tamper-evident recording of every administrative state change and threshold update.
- **Backup & Migration Assurance**: On-demand point-in-time SQL snapshot generation and real-time schema migration synchronization status.

---

## 2. Role-Based Access Control (RBAC) Matrix

Access to the Operations Control Center is strictly restricted at both the API gateway and client routing layers.

| Role | Access Level | Permissions & Capabilities |
| :--- | :--- | :--- |
| `SUPER_ADMIN` | **Full Administrative Control** | Read telemetry, toggle non-core modules, create manual backups, modify system thresholds, view all audit events. |
| `ADMIN` | **System Administrator** | Read telemetry, toggle non-core modules, create manual backups, modify system thresholds, view audit events. |
| `OWNER` | **Executive Sovereign Audit** | Read-only executive visibility across all telemetry, diagnostics, user distribution, backups, and audit trails. |
| `MANAGER` | *Restricted* | Cannot access OCC UI or endpoints (403 Forbidden). |
| `STAFF` / `RECEPTIONIST` | *Denied* | Cannot access OCC UI or endpoints (403 Forbidden). |
| `AGENT` | *Denied* | Cannot access OCC UI or endpoints (403 Forbidden). |

---

## 3. Console Navigation & Tab Architecture

The Operations Control Center is organized into 6 dedicated operational tabs:

### Tab 1: Health & Diagnostics
- **Real-Time KPIs**: Database query latency in milliseconds, Node.js heap memory usage, total active subsystems, and server uptime.
- **Subsystem Probe Matrix**: Live operational health status of all 6 platform subsystems:
  - *API Gateway & Router*: Live HTTP request routing and middleware pipeline.
  - *MariaDB Database Pool*: Connection pool latency, schema synchronization, and query execution.
  - *JWT Authentication Service*: Token signing, validation, and session expiration checks.
  - *Double-Entry Accounting GL*: Journal entry validation, subledger bridges, and posting invariants.
  - *Financial & Operational Reports Engine*: CSV and PDF compilation pipelines.
  - *Socket.IO Real-Time Gateway*: Live event propagation and client broadcast channels.
- **Security & Warning Feed**: Aggregates recent security notices and 24-hour warning events.

### Tab 2: Modules & Governance Toggles
- **18 Registered Modules**: Searchable and filterable by functional domain (`CORE`, `OPERATIONS`, `FINANCE`, `STAFF`, `GOVERNANCE`).
- **Protected Core Modules (Locked)**:
  - `dashboard` (Command Center)
  - `properties` (Real Estate Registry)
  - `apartments` (Inventory & Units)
  - `reservations` (Booking Engine)
  - `financial` (General Ledger & Settlements)
  - `access_control` (RBAC & Capabilities)
  - `audit_trail` (Compliance Logging)
  *Protected core modules cannot be disabled via API or UI. Attempts return `403 Forbidden`.*
- **Toggleable Operational Modules**: Non-critical modules (e.g., `maintenance`, `inspections`, `agents`, `commissions`, `announcements`, `communications`) can be safely enabled or disabled with a mandatory audit reason.

### Tab 3: User Governance & Sovereignty
- **Sovereign Invariants**:
  - *Single Super Admin Rule*: Exactly 1 global Super Administrator account (`olawale@gmail.com`).
  - *Single Owner Stakeholder Rule*: Exactly 1 registered Sovereign Owner account (`owner@bfa.ng`).
  - *Property Scoping Rule*: Front desk and staff accounts are bound strictly to Property 1 or Property 2.
- **User Directory**: Tabular view of all registered platform identities, roles, property bindings, and creation timestamps.

### Tab 4: Settings & Policy Thresholds
- **Operational Rules**: Enforces default 1-night maximum stay booking policy, standard check-in time (`14:00`), and check-out time (`11:00`).
- **Financial Rules**: Base VAT rate (`7.5%`), default agent commission rate (`10%`), base currency (`NGN ₦`).
- **Persistence**: Persisted directly to `system_settings` table and broadcast to the application.

### Tab 5: Real-Time Audit Trail
- Live inspection of administrative actions and state mutations.
- Records timestamp, actor email, assigned role, action code (e.g., `MODULE_TOGGLED`, `BACKUP_CREATED`, `SETTINGS_UPDATED`), target entity, and client IP address.

### Tab 6: Backups & Disaster Recovery
- **Snapshot Inventory**: Displays all verified SQL backup files stored in `backups/`.
- **Manual Snapshot Generator**: Generates timestamped SQL snapshots on demand with table manifests and foreign-key check wrappers.
- **Migration Synchronization**: Full catalog of applied schema migrations (`001` through `023`) confirming 100% database schema synchronization.
- **Recovery Runbook**: Standard operational restoration procedures for disaster recovery.

---

## 4. Disaster Recovery & Emergency Runbook

### Creating an Immediate Backup
1. Navigate to **Backups & Migrations** tab in OCC.
2. Click **Create Manual Snapshot**.
3. Confirm the snapshot appears in the table with its formatted file size and timestamp.

### Restoring From a Backup Snapshot
In the event of hardware failure, catastrophic data corruption, or emergency rollback:

```bash
# 1. Stop the application server to prevent incoming mutations
# 2. Execute database restoration via MariaDB CLI
mysql -u bfa_user -p bfa_apartments_db < backups/bfa_apartments_db_backup_YYYYMMDD_HHMMSS.sql

# 3. Restart the application server
npm start
```
*Note: Snapshot scripts automatically disable `FOREIGN_KEY_CHECKS` at initialization and restore them at completion.*

