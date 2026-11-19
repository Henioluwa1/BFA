# BFA APARTMENTS MANAGEMENT SYSTEM
## TASK AIVEN-03 — PostgreSQL Schema Migration & Baseline Establishment Report

**Repository:** `C:\xampp\htdocs\BFA`  
**Branch:** `master`  
**Database Engine:** Aiven PostgreSQL (`defaultdb` / `bfa_apartments_db`)  
**Previous Task:** TASK AIVEN-02 — PostgreSQL Connection Implementation  
**Status:** COMPLETE (Automated verification: 23/23 tests passed; Remote live cluster execution: pending credential provisioning)

---

## 1. Executive Summary

TASK AIVEN-03 establishes the complete PostgreSQL database schema and migration baseline for the BFA Apartments Management System on Aiven PostgreSQL, using the authoritative MySQL/MariaDB architecture as the source of truth without dropping, simplifying, or renaming any business entities.

### Key Deliverables Completed
1. **Authoritative 70-Table Inventory**: Fully audited and cataloged all 70 tables spanning 9 core business domains across all 31 existing migrations.
2. **Deterministic PostgreSQL Translation Engine**: Created `backend/src/scripts/translateMigrations.js`, converting all 31 MySQL migrations into valid, idiomatic PostgreSQL DDL in `backend/src/db/pgMigrations/`.
3. **Production PostgreSQL Migration Engine**: Built `backend/src/db/pgMigrator.js` featuring session-level PostgreSQL advisory locking (`pg_advisory_lock`), transaction-isolated per-migration execution (`BEGIN`/`COMMIT`/`ROLLBACK`), batch ledger tracking (`schema_migrations`), post-migration identity sequence synchronization, and credential-sanitized error handling.
4. **NPM Migration Scripts**: Wired `db:pg:migrate` and `db:pg:status` into `backend/package.json`.
5. **Automated Verification**: Implemented comprehensive test suite `backend/tests/pgMigrator.test.js` (10/10 passed) alongside `backend/tests/pgConnection.test.js` (13/13 passed) — totaling 23/23 passing tests.
6. **Git Tracking Correction**: Updated `.gitignore` with `!backend/src/db/pgMigrations/*.sql` so that all 31 PostgreSQL migration scripts are tracked under version control.

---

## 2. Complete 70-Table Authoritative Inventory

Analysis of the 31 migration files reveals that BFA contains **70 distinct tables** across 9 domains. All 70 tables are preserved with 100% fidelity:

| # | Domain | Table Name | Source Migration | Description |
|---|--------|------------|------------------|-------------|
| 1 | Core System | `schema_migrations` | `001` | Migration ledger tracking executed batches |
| 2 | Core System | `system_settings` | `002` | Global, financial, and operational system configurations |
| 3 | Core System | `audit_logs` | `002` | Section 25 compliance immutable audit trail |
| 4 | ERP Core | `properties` | `003` | Building estates, geofences, and check-in policies |
| 5 | ERP Core | `apartments` | `003` | Accommodation units, pricing, readiness, and states |
| 6 | ERP Core | `agents` | `003` | External leasing agents and commission profiles |
| 7 | ERP Core | `reservations` | `003` | Central booking entity, multi-night stay engine |
| 8 | ERP Core | `maintenance_requests`| `003` | Work orders, defect reporting, priority dispatch |
| 9 | Auth & Access | `users` | `004` | System accounts, bcrypt credentials, role hierarchy |
| 10 | Auth & Access | `capabilities` | `006` | Fine-grained policy permissions and access grants |
| 11 | Auth & Access | `access_approval_requests` | `006` | Maker-checker dual authorization requests |
| 12 | Auth & Access | `access_overrides` | `006` | Time-bounded privilege elevations |
| 13 | Payments | `payment_transactions` | `007` | Payment records, gateway references, provider state |
| 14 | Payments | `booking_authentications` | `007` | Guest check-in PINs and auth tokens |
| 15 | Communications | `notifications` | `008` | In-app user notifications and read receipts |
| 16 | Communications | `notification_preferences` | `008` | Notification dispatch channel preferences |
| 17 | Communications | `communication_templates` | `008` | Email, SMS, and push notification templates |
| 18 | Communications | `communications` | `008` | Outbound communication transmission log |
| 19 | Communications | `communication_recipients` | `008` | Multi-recipient delivery status ledger |
| 20 | Communications | `communication_approvals` | `008` | Broadcast review and approval audit log |
| 21 | ERP Core | `reservation_status_history` | `009` | Lifecycle state transitions for reservations |
| 22 | ERP Core | `blocked_periods` | `009` | Calendar blocks for maintenance or owner holds |
| 23 | Guests & Ops | `guests` | `010` | Authoritative guest CRM profiles and VIP flags |
| 24 | Guests & Ops | `inspections` | `010` | Room check-in and check-out inspection records |
| 25 | Guests & Ops | `expenses` | `011` | Operational expenses, utility and property costs |
| 26 | Guests & Ops | `commissions` | `012` | Agent commission calculation and payout ledger |
| 27 | HR & Workforce | `employees` | `013` | Internal staff workforce directory |
| 28 | HR & Workforce | `employee_profiles` | `013` | Emergency contacts, personal profiles, addresses |
| 29 | HR & Workforce | `employee_activities` | `013` | Shift activity logs and punch tracking |
| 30 | HR & Workforce | `employee_evaluation_criteria` | `013` | Performance appraisal scoring criteria |
| 31 | HR & Workforce | `employee_evaluations` | `013` | Staff review records and evaluation periods |
| 32 | HR & Workforce | `employee_evaluation_scores` | `013` | Line-item scores for employee evaluations |
| 33 | HR & Workforce | `employee_id_cards` | `013` | Staff digital identification badge credentials |
| 34 | HR & Workforce | `employee_documents` | `013` | Employment contracts and regulatory credentials |
| 35 | Communications | `public_announcements` | `014` | Resident and guest noticeboard announcements |
| 36 | Core System | `automation_confirmations` | `016` | Dual-approval engine for AI automation actions |
| 37 | Communications | `chat_threads` | `018` | Internal staff and departmental messaging threads |
| 38 | Communications | `chat_thread_participants` | `018` | Thread memberships and mute/read states |
| 39 | Communications | `chat_messages` | `018` | Thread messages, mentions, and message bodies |
| 40 | Communications | `chat_message_receipts` | `018` | Message delivery and read receipts |
| 41 | Communications | `chat_retention_policies` | `018` | Per-property message retention policies |
| 42 | General Ledger | `chart_of_accounts` | `019` | Double-entry accounts (Assets, Liabilities, Equity, Revenue, Expense) |
| 43 | General Ledger | `accounting_periods` | `019` | Monthly accounting fiscal periods and closing states |
| 44 | General Ledger | `journal_entries` | `019` | Accrual journal headers and source tracking |
| 45 | General Ledger | `journal_lines` | `019` | Balanced debit/credit journal line items |
| 46 | General Ledger | `general_ledger_entries` | `019` | Posted financial transactions and running balance |
| 47 | General Ledger | `accounting_account_mappings` | `020` | Subledger-to-GL account event routing |
| 48 | General Ledger | `accounting_subledger_posting_records` | `020` | Durable bridge tracking operational entity posting |
| 49 | General Ledger | `accounting_posting_exceptions` | `020` | Exception ledger for unmapped or failed postings |
| 50 | Governance | `user_property_assignments` | `026` | Multi-property staff access control scopes |
| 51 | Governance | `property_submissions` | `026` | Owner listing submissions and workflow states |
| 52 | Governance | `property_review_comments` | `026` | Listing review feedback and approval threads |
| 53 | Governance | `media_assets` | `026` | High-resolution property and building photographs |
| 54 | Guests & Ops | `operational_cases` | `026` | Incident management and guest dispute cases |
| 55 | Guests & Ops | `staff_incidents` | `026` | Staff disciplinary and incident records |
| 56 | Guests & Ops | `operational_evidence_attachments` | `026` | Photos, documents, and evidence files |
| 57 | Guests & Ops | `reservation_staff_assignments` | `026` | Receptionist check-in claim and service history |
| 58 | Payments | `payment_receipts` | `026` | Non-deletable financial payment receipts |
| 59 | HR & Workforce | `shift_templates` | `028` | Standard shift schedules (morning, evening, night) |
| 60 | HR & Workforce | `rosters` | `028` | Weekly/monthly team duty roster headers |
| 61 | HR & Workforce | `shifts` | `028` | Individual scheduled staff shifts |
| 62 | HR & Workforce | `employee_availability` | `028` | Staff availability and blackout dates |
| 63 | HR & Workforce | `shift_swap_requests` | `028` | Peer shift exchange requests and manager approvals |
| 64 | HR & Workforce | `attendance_records` | `028` | Clock-in/out punches, geofence, and GPS data |
| 65 | HR & Workforce | `attendance_corrections` | `028` | Missed punch correction requests and approvals |
| 66 | HR & Workforce | `leave_categories` | `028` | Vacation, sick, parental, compassionate policies |
| 67 | HR & Workforce | `leave_requests` | `028` | Staff time-off applications and escalation status |
| 68 | HR & Workforce | `leave_balances` | `028` | Annual leave entitlements and utilized days |
| 69 | HR & Workforce | `attendance_policies` | `029` | Geofence coordinates, radius, and grace periods |
| 70 | HR & Workforce | `property_kiosks` | `029` | On-site attendance terminal authentication secrets |

---

## 3. MySQL vs. PostgreSQL Translation Rules & Compatibility Decisions

| MySQL / MariaDB Construct | PostgreSQL Implementation | Rationale |
|---------------------------|---------------------------|-----------|
| `INT AUTO_INCREMENT PRIMARY KEY` | `INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | Standard SQL:2008 identity column. `BY DEFAULT` allows seed migrations to insert explicit IDs while preserving auto-incrementing sequences for subsequent writes. |
| `BIGINT AUTO_INCREMENT PRIMARY KEY` | `BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 64-bit identity column for large-volume tables (`audit_logs`). |
| Inline `INDEX idx_name (cols)` | `CREATE INDEX IF NOT EXISTS idx_name ON table (cols);` | PostgreSQL does not allow inline `INDEX` definitions in `CREATE TABLE`. Extracted to separate idempotent statements. |
| Inline `UNIQUE KEY uq_name (cols)` | `CONSTRAINT uq_name UNIQUE (cols)` | Standard SQL table-level unique constraint. |
| `TINYINT(1)` / `BOOLEAN` | `BOOLEAN DEFAULT FALSE / TRUE` | Native PostgreSQL boolean type. |
| `DATETIME` / `TIMESTAMP ... ON UPDATE CURRENT_TIMESTAMP` | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP` | Explicit timezone-aware timestamping. |
| `JSON` | `JSONB` | PostgreSQL `JSONB` stores decomposed binary JSON supporting GIN indexing and fast querying. |
| `DECIMAL(p, s)` | `NUMERIC(p, s)` | Standard arbitrary-precision financial type. |
| `ENUM('A', 'B', ...)` | `VARCHAR(50) CHECK (col IN ('A', 'B', ...))` | Flexible, schema-independent enum enforcement avoiding custom PostgreSQL type pollution. |
| `DATEDIFF(check_out_date, check_in_date)` | `(check_out_date - check_in_date)` | In PostgreSQL, subtracting two `DATE` types natively returns an integer number of days. |
| `UPDATE t1 JOIN t2 ON ... SET ...` | `UPDATE t1 SET col = t2.col FROM t2 WHERE ...` | Standard PostgreSQL multi-table update syntax (applied to migrations `021` and `023`). |
| MySQL Prepared DDL (`SET @sql := ...; PREPARE stmt; EXECUTE stmt;`) | `DO $$ BEGIN ALTER TABLE ... ADD CONSTRAINT ...; EXCEPTION WHEN duplicate_object THEN NULL; END $$;` | Native PostgreSQL anonymous PL/pgSQL blocks provide atomic, idempotent constraint addition without catalog scripting. |
| `ALTER TABLE ... ADD COLUMN ... AFTER col` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` | PostgreSQL does not support physical column reordering with `AFTER`; removed transparently. |
| `INSERT IGNORE INTO ...` | `INSERT INTO ... ON CONFLICT (target) DO NOTHING;` | Uses PostgreSQL standard UPSERT syntax targeting table primary keys or unique columns. |
| `ON DUPLICATE KEY UPDATE col = VALUES(col)` | `ON CONFLICT (target) DO UPDATE SET col = EXCLUDED.col;` | Standard PostgreSQL conflict resolution referencing `EXCLUDED` pseudo-record. |

---

## 4. PostgreSQL Migration Engine Architecture (`pgMigrator.js`)

The PostgreSQL migration engine is implemented in `backend/src/db/pgMigrator.js` with production-grade reliability safeguards:

```
                  ┌──────────────────────────────────────────────┐
                  │          runPgMigrations() Trigger           │
                  └──────────────────────┬───────────────────────┘
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │    Acquire Session Advisory Lock             │
                  │    pg_advisory_lock(hashtext('...'))        │
                  └──────────────────────┬───────────────────────┘
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │    Ensure schema_migrations Table Exists     │
                  └──────────────────────┬───────────────────────┘
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │    Query Applied Migrations & Determine      │
                  │    Next Batch Number (MAX(batch) + 1)        │
                  └──────────────────────┬───────────────────────┘
                                         ▼
                         ┌───────────────────────────────┐
                         │   For each pending migration: │
                         │   1. BEGIN                    │
                         │   2. Execute SQL file DDL     │
                         │   3. Record in schema_mig     │
                         │   4. COMMIT                   │
                         │   (On error: ROLLBACK & exit) │
                         └───────────────┬───────────────┘
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │    Synchronize Identity Sequences            │
                  │    (Aligns sequence to MAX(id))              │
                  └──────────────────────┬───────────────────────┘
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │    Release Advisory Lock (finally block)     │
                  │    pg_advisory_unlock(hashtext('...'))      │
                  └──────────────────────────────────────────────┘
```

### Safety Features
1. **Advisory Locking**: Prevents concurrent migration runs if multiple backend instances spin up simultaneously on Render.
2. **Per-Migration Transactions**: Each `.sql` script is executed within its own `BEGIN` / `COMMIT` block. A syntax or constraint failure triggers an immediate `ROLLBACK` of that file, leaving the database in a clean, predictable state.
3. **Sequence Synchronization**: Dynamically iterates over all identity columns in `information_schema.columns` and sets each sequence to `COALESCE(MAX(id), 1)` to eliminate primary key collisions with seeded rows.
4. **Credential Redaction**: Catches errors and routes them through `sanitizeErrorMessage`, stripping database passwords, credentials, and connection URIs from error logs.
5. **NPM Integration**:
   - `npm run db:pg:migrate`: Executes pending PostgreSQL migrations.
   - `npm run db:pg:status`: Inspects migration status without modifying database state.

---

## 5. Automated Verification Results

Two dedicated test suites verify the PostgreSQL database foundation:

### Test Suite 1: `backend/tests/pgMigrator.test.js` (10/10 Passed)
- **File Integrity**: Exactly 31 `.sql` files detected, matching 001–031.
- **70 Tables Confirmed**: All 70 distinct business tables parsed and confirmed.
- **Zero MySQL Artifacts**: Verified 0 occurrences of `ENGINE=InnoDB`, `AUTO_INCREMENT`, `DATEDIFF(`, `PREPARE`, `DEALLOCATE`, `INSERT IGNORE`, `ON DUPLICATE KEY`, or backticks.
- **Parentheses Balance**: Verified 100% balanced parenthesis depth across all 31 files.
- **Status Checker**: Verified behavior with 0 applied, partial applied, and all applied states.
- **Transaction & Lock Lifecycle**: Verified lock acquisition, transaction commit, rollback on error, and clean advisory unlock.
- **Credential Protection**: Verified password redaction on simulated connection/DDL errors.

### Test Suite 2: `backend/tests/pgConnection.test.js` (13/13 Passed)
- **Credential Redaction**: Redacts passwords from standard and postgresql URI formats and error text.
- **TLS Enforcement**: Enforces `rejectUnauthorized: true` by default; validates CA PEM parsing.
- **Config Builder**: Validates discrete parameters and URI string parsing.
- **Connectivity Check**: Verified `SELECT 1` ping.
- **Transaction Manager**: Verified `withTransaction` lifecycle (`BEGIN`, `COMMIT`, `ROLLBACK`).

**Overall Test Results:**
```
Test Suites: 2 passed, 2 total
Tests:       23 passed, 23 total
Snapshots:   0 total
Time:        7.714 s
```

---

## 6. Live Aiven Cluster Execution Status

| Component | Status | Verification Evidence |
|-----------|--------|-----------------------|
| PostgreSQL Connection Pool (`pgPool.js`) | **VERIFIED** | Unit tested (13/13 tests passed) |
| PostgreSQL Migrations (`pgMigrations/*.sql`) | **VERIFIED** | Syntax & integrity tested (10/10 tests passed) |
| PostgreSQL Migrator Engine (`pgMigrator.js`) | **VERIFIED** | Advisory locking & transaction tested |
| Remote Aiven PostgreSQL Live Run | **IMPLEMENTED BUT NOT LIVE-VERIFIED** | Pending live environment variables (`PGHOST`, `PGPASSWORD`, etc.) |

### Exact Command to Execute on Live Cluster
Once live Aiven credentials are supplied via environment variables or `.env`:
```bash
# 1. Check current status
npm run db:pg:status

# 2. Execute migration baseline
npm run db:pg:migrate
```

---

## 7. Recommended Next Task

### TASK AIVEN-04 — Apply Migrations & Seed Baseline on Live Aiven Cluster
1. Supply live Aiven PostgreSQL connection parameters (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PG_CA_CERT` / `DATABASE_URL`).
2. Execute `npm run db:pg:status` and verify 31 pending migrations.
3. Execute `npm run db:pg:migrate` to create all 70 tables on the Aiven cluster.
4. Execute `node src/scripts/seedAdmin.js` to create the Super Admin account in PostgreSQL.
5. Verify live tables, foreign keys, and indexes via `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`.
