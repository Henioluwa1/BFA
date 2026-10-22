# BFA PHASE 3 — INDEPENDENT DASHBOARD SECURITY AND INTEGRATION AUDIT REPORT

**Audit Date:** October 22, 2026  
**Auditor:** Independent Security & Quality Auditor (Antigravity Assistant)  
**System:** BFA Apartments Management System  
**Audit Scope:** Phase 3 — Role-Specific Dashboards  
**Executive Verdict:** **PASS WITH ISSUES**

---

## 1. Executive Summary & Verdict

An independent, evidence-based code, integration, security, and regression audit of **Phase 3 (Role-Specific Dashboards)** was conducted in strict read-only mode.

### Verdict: PASS WITH ISSUES
- **Core Architecture & Routing:** Fully verified. All seven (7) roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER`) are explicitly handled and mapped to dedicated dashboard components in `frontend/src/pages/DashboardPage.jsx`.
- **Canvas Visual Rules:** Fully verified. `SUPER_ADMIN` receives the dark/slate canvas (`data-portal-theme="super_admin"`, `#14181f`), while operational roles receive the clean white canvas (`data-portal-theme="default"`, `#f8fafc`).
- **Data Protection & RBAC:** Authoritatively verified. Non-financial roles (`RECEPTIONIST`, `STAFF`, `AGENT`) cannot access sensitive revenue, profit margin, or financial overview data via frontend or direct API invocation (`HTTP 403 Forbidden`). Agents are strictly isolated to their own bookings and commissions on the backend.
- **Verification Suites:** 
  - Frontend production build: **PASS** (Exit code `0`, 152 modules bundled).
  - Dedicated Phase 3 integration suite (`phase3Dashboards.test.js`): **PASS** (Exit code `0`, 10/10 tests passed).
  - Complete backend regression suite (`npm test`): **PASS** (Exit code `0`, 403/403 passed across 36 suites in 54.8s).
- **Identified Defects:** Two non-security frontend defects were identified during deep tracing:
  1. **DEF-01 (Medium Severity):** `StaffDashboard.jsx` attempts to read maintenance counts from root response keys (`statsRes.data.open_count`) instead of the nested `overview` object (`statsRes.data.overview.open`), causing the three top KPI counters on the staff dashboard to display `0`.
  2. **DEF-02 (Low Severity - Workflow Transition):** In `StaffDashboard.jsx`, the quick-action button on `DIRTY` turnover rooms attempts to update unit status directly to `AVAILABLE`, triggering a backend `ConflictError` (`HTTP 409`) because the apartment state machine requires rooms to pass through `CLEANING` before becoming `AVAILABLE`.

---

## 2. Role-by-Role Dashboard and Permission Matrix

| Role | Canvas Theme | Frontend Component | Authoritative Backend Endpoints Queried | RBAC Restrictions Authoritatively Enforced |
| :--- | :--- | :--- | :--- | :--- |
| **`SUPER_ADMIN`** | **Dark / Slate** (`#14181f`) | `SuperAdminDashboard.jsx` | `GET /api/v1/health`<br>`GET /api/v1/financial/overview?propertyId=all`<br>`GET /api/v1/front-office/stats?propertyId=all`<br>`GET /api/v1/maintenance/stats?propertyId=all`<br>`GET /api/v1/properties` | Unrestricted root authority. Full access to global telemetry, database latency, schema migration counts, and all properties. |
| **`ADMIN`** | White Canvas (`#f8fafc`) | `AdminManagerDashboard.jsx` | `GET /api/v1/front-office/stats`<br>`GET /api/v1/front-office/arrivals`<br>`GET /api/v1/front-office/departures`<br>`GET /api/v1/financial/overview`<br>`GET /api/v1/maintenance/stats` | Full administrative velocity. Can query multi-property or scoped property. Access to financial ledger and front office operations. |
| **`MANAGER`** | White Canvas (`#f8fafc`) | `AdminManagerDashboard.jsx` | `GET /api/v1/front-office/stats`<br>`GET /api/v1/front-office/arrivals`<br>`GET /api/v1/front-office/departures`<br>`GET /api/v1/financial/overview`<br>`GET /api/v1/maintenance/stats` | Scoped operational velocity. If `user.propertyId` is present, queries to foreign properties are blocked server-side (`HTTP 403`). |
| **`RECEPTIONIST`** | White Canvas (`#f8fafc`) | `ReceptionistDashboard.jsx` | `GET /api/v1/front-office/stats`<br>`GET /api/v1/front-office/arrivals`<br>`GET /api/v1/front-office/departures` | **Strictly operational.** Front desk movements only. Direct invocation of `GET /api/v1/financial/overview` is blocked (`HTTP 403 Forbidden`). Zero billing or margin exposure. |
| **`STAFF`** | White Canvas (`#f8fafc`) | `StaffDashboard.jsx` | `GET /api/v1/maintenance/stats`<br>`GET /api/v1/maintenance`<br>`GET /api/v1/apartments` | **Strictly facilities/turnover.** Direct invocation of `GET /api/v1/financial/overview` or `GET /api/v1/front-office/stats` is blocked (`HTTP 403 Forbidden`). Zero guest billing or financial data. |
| **`AGENT`** | White Canvas (`#f8fafc`) | `AgentDashboard.jsx` | `GET /api/v1/agents`<br>`GET /api/v1/reservations`<br>`GET /api/v1/commissions/summary` | **Strictly partner broker.** Direct invocation of `/api/v1/financial/overview` or `/api/v1/front-office/stats` returns `HTTP 403`. All queries to `reservations`, `agents`, and `commissions` force `agent_id = user.agentId`. |
| **`OWNER`** | White Canvas (`#f8fafc`) | `OwnerDashboard.jsx` | `GET /api/v1/financial/overview`<br>`GET /api/v1/front-office/stats`<br>`GET /api/v1/maintenance/stats` | **Executive asset yield.** Authoritative access to Net Operating Income (NOI), profit margin %, OPEX category breakdown, and asset occupancy. Scoped by selected `propertyId`. |

---

## 3. Metric Source and Calculation Audit

Every displayed dashboard metric was traced from UI component $\rightarrow$ service API $\rightarrow$ backend controller $\rightarrow$ repository $\rightarrow$ SQL database query:

| Metric | Dashboard | API Endpoint | Repository & Query Source | Calculation Logic | Verification Verdict |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Database Latency** | `SuperAdmin` | `GET /api/v1/health` | `HealthService.getHealthStatus()` calling `pool.testConnection()` | Measures round-trip execution of `SELECT 1` on MariaDB pool in milliseconds. | **VERIFIED ACCURATE** |
| **Applied Migrations** | `SuperAdmin` | `GET /api/v1/health` | `SELECT COUNT(*) FROM schema_migrations;` | Authoritative count of executed database schema migrations. | **VERIFIED ACCURATE** |
| **Server Uptime** | `SuperAdmin` | `GET /api/v1/health` | `process.uptime()` | Number of seconds the Node.js API process has been alive, formatted into `Xh Ym Zs`. | **VERIFIED ACCURATE** |
| **Today's Arrivals** | `Receptionist`, `AdminManager` | `GET /api/v1/front-office/stats` | `FrontOfficeRepository.getOperationalStats` | `COUNT(*)` where `check_in_date = CURRENT_DATE()` and `status IN ('CONFIRMED', 'PENDING')`. | **VERIFIED ACCURATE** |
| **Today's Departures** | `Receptionist`, `AdminManager` | `GET /api/v1/front-office/stats` | `FrontOfficeRepository.getOperationalStats` | `COUNT(*)` where `check_out_date = CURRENT_DATE()` and `status = 'CHECKED_IN'`. | **VERIFIED ACCURATE** |
| **In-House Stays** | `Receptionist`, `AdminManager` | `GET /api/v1/front-office/stats` | `FrontOfficeRepository.getOperationalStats` | `COUNT(*)` where `status = 'CHECKED_IN'`. | **VERIFIED ACCURATE** |
| **Unit Readiness Counts** | `Receptionist`, `AdminManager` | `GET /api/v1/front-office/stats` | `FrontOfficeRepository.getOperationalStats` | `SUM(CASE WHEN status = ... THEN 1 ELSE 0 END)` from `apartments WHERE is_active = 1`. | **VERIFIED ACCURATE** |
| **Gross Cash Collected** | `Owner`, `AdminManager`, `SuperAdmin` | `GET /api/v1/financial/overview` | `FinancialService.getOverview` | `SUM(pt.amount)` from `payment_transactions` where `parent_transaction_id IS NULL AND status IN ('SUCCESS', 'COMPLETED', ...)`. | **VERIFIED ACCURATE** |
| **Net Realized Revenue** | `Owner`, `AdminManager`, `SuperAdmin` | `GET /api/v1/financial/overview` | `FinancialService.getOverview` | `gross_collected - total_refunded` | **VERIFIED ACCURATE** |
| **Approved OPEX (Expenses)** | `Owner` | `GET /api/v1/financial/overview` | `FinancialService.getOverview` | `SUM(amount)` from `expenses WHERE status = 'APPROVED'`. | **VERIFIED ACCURATE** |
| **Net Operating Income (NOI)** | `Owner` | `GET /api/v1/financial/overview` | `FinancialService.getOverview` | `netRevenue - approvedExpenses` | **VERIFIED ACCURATE** |
| **Profit Margin %** | `Owner` | `GET /api/v1/financial/overview` | `FinancialService.getOverview` | `netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0` rounded to 2 decimal places. | **VERIFIED ACCURATE** |
| **Outstanding Receivables** | `Owner`, `AdminManager`, `SuperAdmin` | `GET /api/v1/financial/overview` | `FinancialService.getOverview` | `total_booked_revenue - total_paid_amount` from non-cancelled reservations. | **VERIFIED ACCURATE** |
| **Agent Booked Volume & Commission** | `Agent` | `GET /api/v1/agents` | `AgentsRepository.findAll` | Aggregated from `reservations` and `commissions` grouped by `agent_id = user.agentId`. | **VERIFIED ACCURATE** |
| **Staff Maintenance Counters** | `Staff` | `GET /api/v1/maintenance/stats` | `MaintenanceRepository.getStats` | Returns `{ overview: { open, inProgress, criticalOpen, resolved, total } }`. Frontend reads `statsRes.data.open_count` instead of `statsRes.data.overview.open`. | **DEFECT IDENTIFIED (DEF-01)** |

---

## 4. Property-Isolation Findings

1. **Front Office Isolation:**
   - In `FrontOfficeRepository.getOperationalStats`, `getArrivals`, and `getDepartures`:
     If `user.propertyId` is present on a scoped role (`MANAGER`, `RECEPTIONIST`, `STAFF`), the query strictly injects `AND property_id = user.propertyId`.
   - Tested: Direct query parameter manipulation (e.g. Passing `?propertyId=2` as a Manager assigned to Property 1) is authoritatively overridden by `user.propertyId`.
2. **Financial Overview Isolation:**
   - In `FinancialService.getOverview({ propertyId, user })`:
     Calls `this.validatePropertyScope(user, effectivePropertyId)`.
     If a `MANAGER` attempts to query a foreign property or `propertyId=all`, the backend throws a `ForbiddenError` (`HTTP 403`).
3. **Agent Broker Isolation:**
   - In `AgentsRepository.findAll`:
     Enforces `if (user && user.role === 'AGENT') { sql += ' AND a.id = ?'; params.push(user.agentId); }`.
   - In `CommissionsRepository.getSummary`:
     Enforces `if (user && user.role === 'AGENT') { sql += ' AND c.agent_id = ?'; params.push(user.agentId); }`.
   - In `ReservationsRepository.findAll`:
     Enforces `if (role === 'AGENT') { sql += ' AND r.agent_id = ?'; params.push(user.agentId); }`.
   - Verified: Agents cannot inspect other agents' profiles, commission settlements, or client reservations.

---

## 5. Quick-Action and State-Transition Findings

### 1. Front Desk Check-In (`frontOfficeService.checkIn`)
- **Backend Authorization:** Authorized for `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`. Unauthorized roles receive `HTTP 403`.
- **State Transition:** Only reservations with status `CONFIRMED` can be checked in (`ReservationsService.checkInReservation`). Invalid transitions from `PENDING`, `CHECKED_IN`, or `CANCELLED` throw a `ValidationError` (`HTTP 400`).
- **Atomicity:** Executed inside `pool.withTransaction`. Updates reservation status to `CHECKED_IN`, sets `checked_in_at`, updates apartment to `OCCUPIED`, records status history, logs audit record, and records employee activity.
- **Frontend Behavior:** Sets row button to loading (`actionLoadingId === r.id`), preventing concurrent duplicate submissions. Surfaces error toasts if the transition is rejected.

### 2. Front Desk Check-Out (`frontOfficeService.checkOut`)
- **State Transition:** Only reservations with status `CHECKED_IN` can be checked out.
- **Atomicity:** Executed inside a transaction. Updates reservation status to `COMPLETED`, sets `checked_out_at`, updates apartment status to `DIRTY` (flagged for housekeeping turnover), records status history, and logs audit record.
- **Frontend Behavior:** Cleanly updates worklist upon completion.

### 3. Start Work Order (`maintenanceService.start`)
- **State Transition:** Only maintenance requests with status `OPEN` can be started (`MaintenanceService.startWork`). Transition to `IN_PROGRESS` sets `started_at` and records audit log.

### 4. Room Turnover Action (`apartmentService.updateStatus`) — DEF-02
- **State Transition Violation:** `ApartmentsService.updateStatus` lines 226-228 enforce that units in `DIRTY` or `MAINTENANCE` state cannot skip directly to `AVAILABLE`. They must first transition through `CLEANING`.
- **Finding:** In `StaffDashboard.jsx`, the quick-action button on `DIRTY` rooms calls `apartmentService.updateStatus(unitId, { status: 'AVAILABLE' })`. The backend correctly halts this invalid bypass with `ConflictError` (`HTTP 409`). The frontend catches and toasts the error, but the UI button should target `CLEANING` when a unit is `DIRTY`.

---

## 6. Verification Commands and Actual Results

| Check / Test Target | Command Executed | Exit Code | Result Details |
| :--- | :--- | :---: | :--- |
| **Frontend Production Build** | `npm run build` (in `frontend/`) | `0` | **152 modules transformed.** Built in 2.79s. `DashboardPage-DWn65ChD.js` (76.69 kB / 12.31 kB gzip). Zero compile errors. |
| **Phase 3 Dashboard Test Suite** | `$env:DB_HOST="::1"; npx jest tests/phase3Dashboards.test.js --runInBand --forceExit` | `0` | **10 passed, 0 failed, 10 total** (3.356s). Verified RBAC boundaries, property scoping, and role router mapping. |
| **Complete Backend Regression Suite** | `$env:DB_HOST="::1"; npm test` | `0` | **36 test suites passed, 36 total. 403 tests passed, 0 failed, 403 total** (54.841s). Full regression suite across all system modules. |
| **Git Working Tree Audit** | `git status --short` | `0` | Only tracked changes are `DashboardPage.jsx` and previously verified Phase 1/2 files. Zero uncommitted commits. |

---

## 7. Defect Register

### DEF-01: Maintenance KPI Metric Accessor Mismatch in `StaffDashboard.jsx`
- **Severity:** Medium
- **Component / File:** `frontend/src/components/dashboard/StaffDashboard.jsx` (lines 40–48)
- **Evidence:**
  ```javascript
  // Current StaffDashboard.jsx code:
  if (statsRes.data) {
    setStats({
      total_requests: statsRes.data.total_requests || 0,
      open_count: statsRes.data.open_count || 0,
      in_progress_count: statsRes.data.in_progress_count || 0,
      critical_open_count: statsRes.data.critical_open_count || 0,
      resolved_count: statsRes.data.resolved_count || 0,
    });
  }
  ```
  `MaintenanceRepository.getStats` returns `{ overview: { total, open, inProgress, criticalOpen, resolved } }`. Because `statsRes.data.open_count` is undefined, the KPI cards for *Critical Issues*, *Active Repairs*, and *Open Tickets* default to `0`.
- **Recommended Correction:** Align `StaffDashboard.jsx` with `AdminManagerDashboard.jsx`:
  ```javascript
  const overview = statsRes.data?.overview || statsRes.data || {};
  setStats({
    total_requests: overview.total ?? overview.total_requests ?? 0,
    open_count: overview.open ?? overview.open_count ?? 0,
    in_progress_count: overview.inProgress ?? overview.in_progress_count ?? 0,
    critical_open_count: overview.criticalOpen ?? overview.critical_open_count ?? 0,
    resolved_count: overview.resolved ?? overview.resolved_count ?? 0,
  });
  ```

---

### DEF-02: Room Turnover Quick Action Bypasses State Machine in `StaffDashboard.jsx`
- **Severity:** Low (Operational Workflow)
- **Component / File:** `frontend/src/components/dashboard/StaffDashboard.jsx` (line 88)
- **Evidence:**
  `await apartmentService.updateStatus(unitId, { status: 'AVAILABLE' });`
  When clicked on a room with status `DIRTY`, the backend throws `ConflictError: Unit in 'DIRTY' state cannot bypass cleaning. It must transition through CLEANING and READY before becoming AVAILABLE.` The frontend toasts the error correctly, but the action fails to advance the room.
- **Recommended Correction:** In `StaffDashboard.jsx`, check the current unit status before dispatching:
  ```javascript
  const targetStatus = unit.status === 'DIRTY' ? 'CLEANING' : 'AVAILABLE';
  await apartmentService.updateStatus(unitId, { status: targetStatus });
  ```

---

## 8. Limitations of the Audit

1. **Headless Execution Environment:** The audit environment did not include an active graphical desktop browser session; responsive layouts were audited at the React JSX / CSS grid structure level and Vite production bundle level rather than live browser viewport rendering.
2. **Read-Only Constraint:** Per instructions, no application code was edited during this audit, leaving defects DEF-01 and DEF-02 intact for remediation review.

---

## 9. Final Recommendation

**Recommendation: Conditionally Approve Phase 3 for Acceptance.**

The architectural foundation, security boundaries, theme preservation, and data integrity of Phase 3 are robust:
- 100% of all 403 backend regression tests across 36 suites pass cleanly.
- All seven roles are properly separated and protected against unauthorized data access.
- Defect DEF-01 and DEF-02 are localized strictly to `StaffDashboard.jsx` and do not cause data corruption or security leaks.

Remediation of DEF-01 and DEF-02 should be completed before proceeding to Phase 4.
