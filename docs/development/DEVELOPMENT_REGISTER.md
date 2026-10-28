# BFA Continuous Development Register

## 1. System Baseline & Environment State

- **System Name**: BFA Apartments Management System
- **Current Release Baseline**: `1.0.0-rc2 (Phase 12 Complete)`
- **Active Branch**: `master`
- **HEAD Commit**: `ba1efab4b50d61994fc2e53c0de604d0c326e06d`
- **Database Engine**: MariaDB 10.4.32 (Port 3306, `bfa_apartments_db`)
- **Database Schema Migrations**: `23 Applied / 23 Cataloged (100% In Sync)`
- **Automated Regression Suite**: `47 Passed / 47 Total (4 Suites)`
- **Frontend Production Build**: `Vite Production Build PASS (0 Errors, 0 Warnings)`
- **Visual QA Multi-Device Score**: `14 / 14 Viewport Runs PASS (Desktop 1280x800 & Mobile 390x844)`

---

## 2. Pre-Production Release Gates

The following 4 formal release gates govern cutover from release candidate to production:

| Gate ID | Gate Description | Target Milestone | Responsible Owner | Status | Gate Criteria & Requirements |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GATE-01** | Accounting Chart of Accounts Approval | Phase 12 Sign-Off | Chief Financial Officer / Sovereign Owner | **PENDING_FINANCE_SIGN_OFF** | Formal review and approval of standard Chart of Accounts mappings, opening ledger balances, and official accounting period lock policies. |
| **GATE-02** | Synthetic Evaluation Data Purge Policy | Pre-Deployment Sign-Off | Super Administrator | **PENDING_POLICY_DECISION** | Executive decision determining whether synthetic employee evaluation test records (IDs 37–40) are retained for owner demonstration or purged prior to live cutover. |
| **GATE-03** | Staged Migrations Git Commit | Release 1.0.0 Tagging | Lead Software Architect | **READY_FOR_COMMIT** | 35 pre-existing staged files in Git index preserved intact on `master`, fully verified and ready for atomic release commit. |
| **GATE-04** | Landing Page Workstream Merge | Public Release | Frontend Team Lead | **IN_COORDINATION** | Coordinated merge of dedicated landing page assets and public routes (`LandingPage.jsx`, `about.css`, `contact.css`) with core management portal. |

---

## 3. Verified Feature & Remediation Inventory

| Task ID | Domain / Module | Feature Description | Security & RBAC | Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-12-01** | Accounting & Finance | Double-Entry General Ledger Foundation | `SUPER_ADMIN`, `ADMIN`, `OWNER` | **VERIFIED** | Migration `019`, `accounting.service.js`, 11/11 automated tests passing. Invariant debit = credit enforced. |
| **TASK-12-02** | Accounting & Finance | Operational Subledger Posting Bridge | `SUPER_ADMIN`, `ADMIN` | **VERIFIED** | Migration `020`, `postingBridge.service.js`, 10/10 automated tests passing. Zero duplicate subledger postings. |
| **TASK-12-03** | Reporting & Finance | Financial Overview & Report Reconciliation | `SUPER_ADMIN`, `ADMIN`, `OWNER` | **VERIFIED** | Migration `021`, `financial.service.js`, `reports.service.js`, 12/12 automated security tests passing. |
| **TASK-12-04** | Workforce Management | Employee Performance Radar & Competency Matrix | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **VERIFIED** | `Charts.jsx`, `EmployeePerformancePage.jsx`, visual QA desktop & mobile runs with 0 horizontal overflow. |
| **TASK-12-05** | System Administration | Operations Control Center (OCC) | `SUPER_ADMIN`, `ADMIN`, `OWNER` | **VERIFIED** | `operationsControl.service.js`, `OperationsPage.jsx`, 6 tabs, live diagnostic telemetry, real SQL snapshot backups. |
| **TASK-12-06** | System Administration | Continuous Development In-App Assistant | `SUPER_ADMIN`, `ADMIN`, `OWNER`, `MANAGER` | **VERIFIED** | Actions `dev.get_register`, `dev.get_system_status`, `dev.plan_task`, typed response cards, adversarial rejection. |

---

## 4. Subsystem Inventory & Health Registry

| Subsystem Name | Technical Identifier | Category | Verification Method | Status |
| :--- | :--- | :--- | :--- | :--- |
| API Gateway | `api_gateway` | Networking | HTTP Route Dispatcher & Middleware Chain | **OPERATIONAL** |
| MariaDB Engine | `mariadb_database` | Persistence | Connection Pool Ping & Schema Inspection | **OPERATIONAL** |
| JWT Authentication | `jwt_auth` | Security | Token Signing, Verification & Expiration | **OPERATIONAL** |
| Double-Entry GL | `double_entry_gl` | Financial | Journal Invariant Verification & Math Audit | **OPERATIONAL** |
| Reports Engine | `reports_engine` | Intelligence | CSV/PDF Streaming & Aggregation Pipeline | **OPERATIONAL** |
| Socket.IO Gateway | `socket_io` | Real-Time | WebSocket Server Loopback & Broadcast | **OPERATIONAL** |

---

## 5. User Sovereignty & Governance Baseline

- **Total Registered Identities**: 9
- **Super Administrator Identity**: User ID 1 (`olawale@gmail.com`) — Single Sovereign Global Administrator
- **Owner Identity**: User ID 7 (`owner@bfa.ng`) — Single Sovereign Executive Stakeholder
- **Administrator Identity**: User ID 2 (`admin@bfaapartments.ng`) — System Administrator
- **Manager Identity**: User ID 3 (`manager@bfaapartments.ng`) — General Operations Manager
- **Front Desk Identity**: User ID 4 (`receptionist@bfaapartments.ng`) — Property 1 Front Desk
- **Staff Identities**:
  - User ID 5 (`staff@bfaapartments.ng`) — Property 1 Operations Staff
  - User ID 8 (`staff.prop2@bfa.ng`) — Property 2 Operations Staff
  - User ID 9 (`staff.prop1@bfa.ng`) — Property 1 Maintenance Staff
- **Agent Identity**: User ID 6 (`agent@bfaapartments.ng`) — External Booking Agent

