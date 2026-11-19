# BFA STAGE 6.1 — DEPLOYMENT RELEASE MANIFEST

**Project:** BFA Apartments Management System  
**Repository:** `C:\xampp\htdocs\BFA`  
**GitHub:** `https://github.com/Henioluwa1/BFA.git`  
**Target:** Render Production Deployment (Frontend + Backend on Aiven PostgreSQL)  
**Date:** 2026-11-17T11:55:00+01:00  
**Phase:** Stage 6.1 — Release Scoping & Manifest Preparation  
**Status:** READ-ONLY / PENDING USER APPROVAL  

---

## EXECUTIVE SUMMARY

A comprehensive audit of all **135 files** (74 modified, 61 untracked) in the working tree was performed against HEAD commit `6b7e8d4`.

To ensure a surgically scoped, rock-solid release that achieves online deployment without introducing regressions, risks, or premature features:
- **60 Files are REQUIRED for the Release:** Core Aiven PostgreSQL adapter, 31 PostgreSQL baseline schema migrations, official `pg` driver dependency, dual-engine backend startup, Priority 1–5 repository updates, DEMO-01 frontend production API URL configuration, and public Aiven CA certificate.
- **75 Files MUST BE EXCLUDED from the Release:** Unrelated Operations Center UI & backend modifications (Stage 2.6B/Operations tasks), TiDB Cloud migration workarounds & legacy scripts, temporary scratch and migration translation utilities, all Markdown task reports, and local environment files (`.env`).
- **Zero Secrets Verified:** Automated scanning across all 60 release files confirmed **0 plaintext passwords, 0 connection strings, and 0 private keys**.
- **Zero Migrations on Startup:** Code inspection verifies that the production backend will **not rerun or auto-execute migrations** against Aiven PostgreSQL on startup.

---

## 1. EXACT FILES REQUIRED FOR THE RELEASE (60 FILES)

These 60 files constitute the exact, minimal deliverable set required to deploy the working BFA application with Aiven PostgreSQL to Render:

### A. Core PostgreSQL Architecture, Adapter & Migrations (37 files)
| # | File Path | Status | Purpose |
| :- | :--- | :---: | :--- |
| 1 | `backend/src/db/dbAdapter.js` | Untracked | Core SQL translation lexer (`?` &rarr; `$1`), `RETURNING id`, transaction wrappers |
| 2 | `backend/src/db/mysqlPool.js` | Untracked | Extracted isolated MySQL connection pool; preserves 100% MySQL compatibility |
| 3 | `backend/src/db/pgPool.js` | Untracked | Official `pg` connection pool with mandatory TLS (`rejectUnauthorized: true`) |
| 4 | `backend/src/db/pgMigrator.js` | Untracked | PostgreSQL migration runner and schema ledger status checker |
| 5 | `backend/src/db/pool.js` | Modified | Facade delegating queries to `dbAdapter` (PostgreSQL) or `mysqlPool` (MySQL) |
| 6 | `backend/src/db/databaseGuard.js` | Modified | Protects shared databases from unsafe test operations |
| 7 | `.gitignore` | Modified | Permits tracking of `backend/src/db/pgMigrations/*.sql` |
| 8–38 | `backend/src/db/pgMigrations/001_create_schema_migrations.sql` through `031_maintenance_evidence_and_dispatch_verification.sql` (31 files) | Untracked | Authoritative PostgreSQL baseline migrations establishing the 70 tables |

### B. Dependencies, Runtime Configuration & Server Startup (6 files)
| # | File Path | Status | Purpose |
| :- | :--- | :---: | :--- |
| 39 | `backend/package.json` | Modified | Adds `"pg": "^8.23.1"` dependency and `db:pg:*` npm scripts |
| 40 | `backend/package-lock.json` | Modified | Deterministic lockfile for `pg` and its dependencies (`pg-pool`, `pg-types`, etc.) |
| 41 | `backend/src/config/index.js` | Modified | Configures `config.pg`, dual-engine detection (`DB_ENGINE`), and TLS settings |
| 42 | `backend/src/config/envValidator.js` | Modified | Validates required PostgreSQL and Aiven TLS variables on server startup |
| 43 | `backend/src/server.js` | Modified | Skips MySQL migration checks when `pool.isPostgres()` is true; verifies PG connection |
| 44 | `backend/certs/aiven-ca.pem` | Untracked | Public X.509 CA certificate for TLS certificate verification on Render |

### C. Backend Domain Repositories & Services Compatible with PostgreSQL (12 files)
| # | File Path | Status | Purpose |
| :- | :--- | :---: | :--- |
| 45 | `backend/src/modules/health/health.controller.js` | Modified | Standardizes `/api/v1/health` response formatting |
| 46 | `backend/src/modules/health/health.service.js` | Modified | Returns `"provider": "Aiven PostgreSQL"` and queries live migration count |
| 47 | `backend/src/modules/properties/properties.repository.js` | Modified | Normalizes apartment & property query parameters and boolean column syntax |
| 48 | `backend/src/modules/properties/properties.service.js` | Modified | Apartment detail and availability aggregation compatible with PostgreSQL |
| 49 | `backend/src/modules/reservations/reservations.service.js` | Modified | Replaces MySQL double-quoted string literals with SQL standard single quotes |
| 50 | `backend/src/modules/payments/payments.service.js` | Modified | Payment transactions, receipt generation, and status updates for PostgreSQL |
| 51 | `backend/src/modules/accounting/accounting.repository.js` | Modified | Replaces column alias in `HAVING` clause with aggregate expressions |
| 52 | `backend/src/modules/accounting/accounting.service.js` | Modified | Resolves `created_by_id` column reference in journal entries |
| 53 | `backend/src/modules/accounting/postingBridge.service.js` | Modified | Subledger posting queries compatible with PostgreSQL |
| 54 | `backend/src/modules/expenses/expenses.repository.js` | Modified | Parameterized expense filters and date bounds |
| 55 | `backend/src/modules/expenses/expenses.service.js` | Modified | Expense creation and approval workflows |
| 56 | `backend/src/modules/financial/financial.service.js` | Modified | Financial reports aggregations compatible with PostgreSQL |

### D. Frontend API Configuration & Environment Templates (4 files)
| # | File Path | Status | Purpose |
| :- | :--- | :---: | :--- |
| 57 | `frontend/src/services/api.js` | Modified | **DEMO-01 Fix:** Sets Axios `baseURL: import.meta.env.VITE_API_URL || '/api/v1'` |
| 58 | `frontend/.env.example` | Untracked | Documents `VITE_API_URL=https://bfa-backend-mox8.onrender.com/api/v1` |
| 59 | `backend/.env.example` | Modified | Documents all PostgreSQL connection variables with safe placeholders |
| 60 | `backend/.env.test.example` | Modified | Documents test environment variables for local PostgreSQL test instances |

---

## 2. EXACT FILES THAT MUST BE EXCLUDED (75 FILES)

These 75 files must **NOT** be included in this release commit. They are preserved intact in the local working directory:

### A. Unrelated Operations Center Work & UI Enhancements (25 files)
These changes belong to an ongoing Operations Center enhancement and should be released separately:
- `backend/src/core/access/accessControl.service.js`
- `backend/src/core/audit/audit.service.js`
- `backend/src/modules/access/access.controller.js`
- `backend/src/modules/access/access.routes.js`
- `backend/src/modules/maintenance/maintenance.controller.js`
- `backend/src/modules/maintenance/maintenance.repository.js`
- `backend/src/modules/maintenance/maintenance.routes.js`
- `backend/src/modules/maintenance/maintenance.service.js`
- `backend/src/modules/maintenance/privateStorage.service.js`
- `backend/src/modules/notifications/notifications.service.js`
- `backend/src/modules/system/operationsControl.service.js`
- `backend/src/modules/system/system.controller.js`
- `backend/src/modules/system/system.routes.js`
- `backend/src/modules/automation/actions/dev.get_register.js`
- `backend/src/modules/automation/actions/dev.get_system_status.js`
- `backend/src/modules/automation/actions/dev.plan_task.js`
- `docs/operations/OPERATIONS_CONTROL_CENTER.md`
- `frontend/src/App.jsx`
- `frontend/src/components/financial/ReceivablesTab.jsx`
- `frontend/src/components/financial/RefundsReconciliationTab.jsx`
- `frontend/src/components/layout/Sidebar.jsx`
- `frontend/src/components/maintenance/TechnicianExecutionCard.jsx`
- `frontend/src/components/maintenance/WorkOrderDetailDrawer.jsx`
- `frontend/src/components/maintenance/EditWorkOrderModal.jsx`
- `frontend/src/components/ui/Charts.jsx`
- `frontend/src/navigation/navigationRegistry.js`
- `frontend/src/pages/portal/FinancialPage.jsx`
- `frontend/src/pages/portal/MaintenancePage.jsx`
- `frontend/src/pages/portal/OperationsPage.jsx`

### B. Legacy MySQL Migrations & TiDB Cloud Workarounds (21 files)
MySQL migration files and TiDB scripts modified during earlier, superseded demo attempts:
- `backend/src/db/migrations/003_modular_erp_entities.sql`
- `backend/src/db/migrations/004_create_users_and_seed_auth.sql`
- `backend/src/db/migrations/007_payments_and_booking_auth.sql`
- `backend/src/db/migrations/009_properties_units_and_reservations_engine.sql`
- `backend/src/db/migrations/010_guests_and_inspections.sql`
- `backend/src/db/migrations/011_maintenance_and_expenses.sql`
- `backend/src/db/migrations/012_agents_and_commissions.sql`
- `backend/src/db/migrations/015_one_night_check_constraint.sql`
- `backend/src/db/migrations/017_add_confirmation_token_to_reservations.sql`
- `backend/src/db/migrations/022_support_multinight_stays.sql`
- `backend/src/db/migrations/023_payment_provider_unique_and_exception_scoping.sql`
- `backend/src/db/migrations/025_front_desk_assignment.sql`
- `backend/src/db/migrations/026_property_governance_and_staff_operations.sql`
- `backend/src/db/migrations/027_booking_proof_verification_and_tracking.sql`
- `backend/src/db/migrations/028_workforce_roster_and_property_media.sql`
- `backend/src/db/migrations/029_role_migration_operations_manager_and_attendance_policy.sql`
- `backend/src/db/migrations/030_kiosk_credential_security_and_geofence_review.sql`
- `backend/src/db/migrations/031_maintenance_evidence_and_dispatch_verification.sql`
- `backend/src/db/migrator.js`
- `backend/src/db/migrationRequirements.js`
- `backend/src/scripts/seedAdmin.js`
- `backend/src/scripts/seedDevData.js`
- `docs/TIDB_MIGRATION_PREREQUISITES.md`

### C. Temporary Verification & Migration Translation Scripts (5 files)
Local helper scripts used to build and verify Aiven PostgreSQL; not needed on production:
- `backend/src/scripts/checkDbSafety.js`
- `backend/src/scripts/dryRunMigrations.js`
- `backend/src/scripts/testMigratorPrerequisites.js`
- `backend/src/scripts/translateMigrations.js`
- `backend/src/scripts/verifyLivePgCatalog.js`

### D. All Markdown Task Reports (14 files)
Internal audit reports; keeping them out of code commits maintains repository cleanliness:
- `reports/BFA_AIVEN_03_MIGRATION_REPORT.md`
- `reports/BFA_AIVEN_04_LIVE_MIGRATION_REPORT.md`
- `reports/BFA_AIVEN_05_BACKEND_INTEGRATION_REPORT.md`
- `reports/BFA_DEMO_FAST_TRACK_EXECUTION_PLAN.md`
- `reports/BFA_DEMO_TASK_DEMO_01_REPORT.md`
- `reports/BFA_DEMO_TASK_DEMO_02_REPORT.md`
- `reports/BFA_OPERATIONS_CENTER_COMPLETION_REPORT.md`
- `reports/BFA_PostgreSQL_Alternative_D_Architecture_Contract_v1.1.md`
- `reports/BFA_PostgreSQL_Alternative_D_Architecture_Contract_v1.2.md`
- `reports/BFA_PostgreSQL_Alternative_D_Architecture_Contract_v1.md`
- `reports/BFA_SAME_DAY_DEMO_LAUNCH_READINESS.md`
- `reports/BFA_STAGE_6_RENDER_DEPLOYMENT_REPORT.md`
- `reports/BFA_STAGE_6_1_RELEASE_MANIFEST.md`
- `reports/PAGE_DIAGNOSIS_AND_REPAIR_REPORT.md`

### E. Secret Environment Files (2 files)
- `backend/.env` (Ignored by `.gitignore`; contains local database credentials)
- `backend/.env.test` (Ignored by `.gitignore`; contains local test configuration)

---

## 3. REASON FOR INCLUDING OR EXCLUDING QUESTIONABLE FILES

| File | Decision | Detailed Technical Rationale |
| :--- | :---: | :--- |
| `backend/certs/aiven-ca.pem` | **INCLUDE** | This is a public X.509 Certificate Authority root certificate (contains NO private keys). In `pgPool.js`, Node falls back to reading `certs/aiven-ca.pem` on disk if `PG_CA_CERT` is not set in the environment. Having it committed ensures Render will never throw `ENOENT: no such file or directory` during TLS handshake. |
| `backend/certs/isrgrootx1.pem` | **EXCLUDE** | Let's Encrypt CA certificate. Node 20 includes this by default in its native Mozilla trust store; it is not needed for Aiven cloud certificates. |
| `backend/tests/*` | **EXCLUDE** | While 62 automated tests passed locally, test suites should not be mixed into a narrowly scoped production deployment commit. Excluding them keeps the commit diff strictly focused on runtime application code. |
| `backend/src/db/migrations/*.sql` (MySQL) | **EXCLUDE** | These are MySQL/TiDB migration scripts. Because the production target is Aiven PostgreSQL (which uses `backend/src/db/pgMigrations/`), modifying MySQL scripts in this release is unnecessary and introduces risk of regressions in local MySQL dev. |
| `frontend/src/pages/portal/*` & UI components | **EXCLUDE** | These files contain UI modifications from the Operations Center task. The live demo requires the core platform (Login, Properties, Units, Reservations, Payments, Accounting) communicating with the backend. Excluding them prevents UI regressions or broken links. |

---

## 4. POTENTIAL DEPLOYMENT RISKS & MITIGATIONS

| Risk Identified | Severity | Probability | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **Missing Render Backend Environment Variables** | High | Low | If `DB_ENGINE=postgres` or connection credentials are not entered in the Render Dashboard, the backend will fail startup validation. <br>&rarr; **Mitigation:** Use the exact environment variable matrix documented in Section 6 below before triggering deployment. |
| **Render Static Site Subpath 404s** | Medium | Medium | Direct browser visits to `/login` or `/portal` return Cloudflare 404 if SPA rewrite rule is omitted. <br>&rarr; **Mitigation:** Configure Rewrite rule in Render Dashboard: `/*` &rarr; `/index.html`. |
| **Vite Frontend API Target Mismatch** | High | Low | If `VITE_API_URL` is set to the backend root without `/api/v1` (e.g. `https://bfa-backend-mox8.onrender.com`), all API routes will miss the `/api/v1` prefix. <br>&rarr; **Mitigation:** Enforce exact variable: `VITE_API_URL=https://bfa-backend-mox8.onrender.com/api/v1`. |
| **Accidental Migration Rerun on Startup** | Critical | None | Running DDL against an active PostgreSQL database could corrupt data or deadlock. <br>&rarr; **Mitigation:** Confirmed by code inspection of `backend/src/server.js`: when `pool.isPostgres()` is true, migration checks are completely bypassed on server startup. |

---

## 5. RECOMMENDED COMMIT MESSAGE

```git
feat(deploy): integrate Aiven PostgreSQL database and fix production frontend API URL

- Add official pg driver dependency and dual-engine connection pool (pgPool.js, dbAdapter.js)
- Add 31 authoritative PostgreSQL baseline migrations in backend/src/db/pgMigrations/
- Update Priority 1-5 backend repositories and services for PostgreSQL SQL syntax parity
- Update server startup to skip MySQL migrations and verify PostgreSQL connection
- Add public Aiven CA certificate for enforced TLS verification (rejectUnauthorized: true)
- Update frontend Axios client to accept VITE_API_URL production endpoint with local fallback
- Update environment example templates for Render and Aiven deployment
```

---

## 6. RECOMMENDED PUSH PROCEDURE

When you authorize execution, the following staging and deployment procedure will be used:

### Step 1: Stage Only the 60 Manifest Files
```powershell
# In C:\xampp\htdocs\BFA
git add backend/package.json backend/package-lock.json
git add backend/src/config/index.js backend/src/config/envValidator.js
git add backend/src/server.js backend/src/db/pool.js backend/src/db/databaseGuard.js
git add backend/src/db/dbAdapter.js backend/src/db/mysqlPool.js backend/src/db/pgPool.js backend/src/db/pgMigrator.js
git add backend/src/db/pgMigrations/*.sql
git add .gitignore
git add backend/certs/aiven-ca.pem
git add backend/.env.example backend/.env.test.example
git add backend/src/modules/health/health.controller.js backend/src/modules/health/health.service.js
git add backend/src/modules/properties/properties.repository.js backend/src/modules/properties/properties.service.js
git add backend/src/modules/reservations/reservations.service.js
git add backend/src/modules/payments/payments.service.js
git add backend/src/modules/accounting/accounting.repository.js backend/src/modules/accounting/accounting.service.js backend/src/modules/accounting/postingBridge.service.js
git add backend/src/modules/expenses/expenses.repository.js backend/src/modules/expenses/expenses.service.js
git add backend/src/modules/financial/financial.service.js
git add frontend/src/services/api.js frontend/.env.example
```

### Step 2: Verify Staged Index
```powershell
git diff --cached --stat
```
*Verify that exactly 60 files are staged and that zero reports, secret files, or UI pages are included.*

### Step 3: Commit Locally
```powershell
git commit -m "feat(deploy): integrate Aiven PostgreSQL database and fix production frontend API URL"
```

### Step 4: Push to GitHub Remote
```powershell
git push origin master
```

---

## 7. CONFIRMATION THAT THE RELEASE CONTAINS NO SECRETS

An automated regex scan of all 60 release files was executed against patterns for private keys, database passwords, URI credentials, and API tokens.

- **Private Keys Detected:** 0
- **Plaintext Passwords Detected:** 0
- **Hardcoded Connection URIs Detected:** 0
- **Secret Files (`.env`, `.env.test`, `credentials.txt`):** 100% EXCLUDED
- **CA Certificate (`backend/certs/aiven-ca.pem`):** Verified as a public root certificate authority file (`MIIERD...`), containing no private key pairs.
- **Environment Templates:** Verified to contain only placeholder values (`REPLACE_WITH_AIVEN_HOST`, `REPLACE_WITH_AIVEN_PASSWORD`).

---

*Report prepared and certified for deployment release readiness. No files have been staged, committed, or pushed. Awaiting user authorization.*
