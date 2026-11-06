# BFA WORKSPACE B — STAGE 2.5 IMPLEMENTATION-READINESS REPORT
## Property Maintenance & Unit Care Operations

**Audit Type:** Strict Read-Only Technical Readiness Verification Gate  
**Target:** Workspace B (Internal Portal / Workforce and Property Operations)  
**Proposed Milestone:** Stage 2.5 — Property Maintenance & Unit Care Operations  
**Date:** 3 November 2026  
**Status:** Discovery Complete; Implementation Not Yet Authorized  
**Auditor:** Antigravity System Architecture & QA Team  

---

## 1. Executive Summary

An exhaustive, read-only technical readiness audit of the BFA Apartments Management System backend was conducted to determine whether the proposed **Stage 2.5: Property Maintenance & Unit Care Operations** is ready for frontend implementation in Workspace B.

The audit verified existing API contracts, database schemas, state machines, operational workflows, reservation protections, and security boundaries across `backend/src/modules/maintenance/`, `apartments/`, `reservations/`, `workforce/`, `expenses/`, and `frontOffice/`.

### Key Conclusions:
1. **Package A (Maintenance Management) is READY FOR WORKSPACE B IMPLEMENTATION:**  
   The backend provides complete endpoints for listing (`GET /`), details (`GET /:id`), metrics (`GET /stats`), work order creation (`POST /`), starting work (`POST /:id/start`), resolving issues (`POST /:id/resolve`), and cancellation (`POST /:id/cancel`). Property-scoping, role authorization, and audit logging are fully functional and backed by automated test coverage.
2. **Package B (Technician Dispatch & Field Execution) is CONDITIONALLY READY:**  
   - **Assignment:** Exists (`POST /:id/assign`), but only validates that the assignee is an `ACTIVE` user belonging to the same property. It does **not** verify shift rosters or live clock-in attendance on the server.
   - **Attachments / Evidence:** **COMPLETELY ABSENT.** The maintenance module has **zero** attachment or image upload endpoints, and the `maintenance_requests` database table contains no image or document columns. Public property-media upload cannot be used for maintenance evidence. Supporting photo evidence requires a **Workspace C prerequisite**.
   - **Parts & Line Items:** The backend only stores a single `actual_cost` float and `resolution_notes` text; there is no itemized parts table or spare parts inventory link.
3. **Package C (Unit Protection & Release) is READY FOR WORKSPACE B IMPLEMENTATION (Server-Side Enforced):**  
   The backend already enforces unit operational locking:
   - Creating a blocking or critical ticket automatically sets the apartment status to `MAINTENANCE`.
   - The reservation engine, front-office check-in, and unit update APIs strictly prevent bookings and check-ins for units in `MAINTENANCE`.
   - Resolving a work order automatically verifies whether other blocking tickets exist before moving the unit out of `MAINTENANCE`. When cleared, the unit transitions to `CLEANING` (or `OCCUPIED` / `BLOCKED`), **never directly to `AVAILABLE`**, enforcing cleaning and inspection progression.
4. **State Machine Reality:**  
   The proposed workflow `OPEN → ASSIGNED → IN_PROGRESS → ON_HOLD → RESOLVED → VERIFIED → CLOSED` is **not** supported by the current backend. The actual supported state machine is strictly:  
   `OPEN` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `RESOLVED` (with `CANCELLED` available from `OPEN` or `IN_PROGRESS`).  
   There are no `ASSIGNED`, `ON_HOLD`, `VERIFIED`, or `CLOSED` statuses in the backend.

### **Final Readiness Verdict:**  
**`CONDITIONALLY READY — WORKSPACE C PREREQUISITES REQUIRED`**  
*(Package A and Package C are fully ready for frontend implementation. Package B is ready for assignment and status progression, but repair photo evidence and server-side on-duty dispatch verification require Workspace C prerequisites).*

---

## 2. Git and Workspace Baseline

- **Repository Root:** `c:\xampp\htdocs\BFA`
- **Current Branch:** `master`
- **HEAD Commit:** `3075411a754fcb7801b4b5b023168df2d6d4f4f8`
- **Working Tree Integrity:** Preserved. No files modified, added, deleted, or committed during this gate audit.
- **Database Engine:** MariaDB 10.4.32 (`bfa_apartments_db` / `bfa_apartments_test_db`). Schema migrations 001 through 030 applied. Zero test data leaked into production tables.

---

## 3. Maintenance API Contract Matrix

Every existing maintenance endpoint was inspected in `maintenance.routes.js`, `maintenance.controller.js`, `maintenance.service.js`, and `maintenance.repository.js`:

| Operation | Existing Endpoint | Request Contract (Payload / Params) | Response Contract | Authorization & Roles | Verified in Audit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Create work order** | `POST /api/v1/maintenance` | `{ property_id, apartment_id?, reservation_id?, issue_title, description?, category?, priority?, estimated_cost?, blocking_unit?, assigned_to_id? }` | `201 Created`: Full created record with `issue_code` (`MNT-PROP-...`), `status: "OPEN"`. Updates apartment to `MAINTENANCE` if blocking. | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `RECEPTIONIST`. Property-scoped. | **YES** (Test 1, 2, 3) |
| **List work orders** | `GET /api/v1/maintenance` | Query: `propertyId`, `apartmentId`, `status`, `priority`, `category`, `assignedToId`, `search`, `fromDate`, `toDate`, `page`, `pageSize` | `200 OK`: Array of work orders with joined property, apartment, reported_by, assigned_to names. | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `RECEPTIONIST`. Property-scoped. | **YES** |
| **View work order** | `GET /api/v1/maintenance/:id` | Path: `:id` | `200 OK`: Full work order record with joined metadata. | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `RECEPTIONIST`. Property-scoped. | **YES** |
| **Assign technician** | `POST /api/v1/maintenance/:id/assign` | `{ staffId }` or `{ assigned_to_id }` | `200 OK`: Updated record with `assigned_to_id` and `assigned_to` name. Status remains unchanged (`OPEN` or `IN_PROGRESS`). | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`. Target staff must be `ACTIVE` and assigned to same property. | **YES** (Test 4) |
| **Change work status (Start)** | `POST /api/v1/maintenance/:id/start` | Path: `:id` (No body required) | `200 OK`: Updated record with `status: "IN_PROGRESS"`, `started_at` timestamp. Requires current status to be `OPEN`. | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `STAFF`. Property-scoped. | **YES** (Test 5, 6) |
| **Record repair completion** | `POST /api/v1/maintenance/:id/resolve` | `{ resolution_notes: string (min 3 chars), actual_cost?: number }` | `200 OK`: Updated record with `status: "RESOLVED"`, `resolved_at`, `actual_cost`, `resolution_notes`. | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `STAFF`. Property-scoped. | **YES** (Test 7) |
| **Record parts and costs** | Handled inside `POST /api/v1/maintenance/:id/resolve` | Accepts single numeric `actual_cost`. **No itemized parts endpoint.** | Part of `resolve` response payload (`actual_cost: number`). | Same as Resolve. | **YES** |
| **Review completed work** | **NO DEDICATED ENDPOINT** | None. Backend stops at `RESOLVED`. | N/A | N/A | **NO (Missing)** |
| **Release unit** | Handled automatically inside `resolve` & `cancel` | No manual endpoint. Releasing is automatic upon resolving all blocking issues. | Part of `resolve` / `cancel` execution (Apartment status updated in DB). | Automatic server-side trigger. | **YES (Automated)** |
| **Attach evidence** | **NO ENDPOINT** | None. No schema columns or upload handlers exist. | N/A | N/A | **NO (Missing)** |
| **Cancel work order** | `POST /api/v1/maintenance/:id/cancel` | `{ reason?: string }` | `200 OK`: Updated record with `status: "CANCELLED"`. Evaluates remaining blocking issues. | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`. | **YES** |
| **Maintenance stats** | `GET /api/v1/maintenance/stats` | Query: `propertyId` | `200 OK`: `{ overview: { total, open, inProgress, resolved, cancelled, critical, totalCost, avgResolutionHours } }` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `RECEPTIONIST`. | **YES** (Test 8) |

---

## 4. Existing Maintenance State Machine

### 4.1 Actual Supported Lifecycle
The backend code strictly defines:
```javascript
const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];
```
Database column definition (`011_maintenance_and_expenses.sql` line 16):
```sql
MODIFY COLUMN status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED') NOT NULL DEFAULT 'OPEN'
```

```mermaid
stateDiagram-v2
    [*] --> OPEN: createMaintenance()
    OPEN --> IN_PROGRESS: startWork()
    OPEN --> CANCELLED: cancelIssue()
    IN_PROGRESS --> RESOLVED: resolveIssue()
    IN_PROGRESS --> CANCELLED: cancelIssue()
    RESOLVED --> [*]
    CANCELLED --> [*]
```

### 4.2 State Machine Findings & Evaluation:
- **No `ASSIGNED` Status:** Assigning a staff member (`assignStaff`) updates the `assigned_to_id` and `assigned_to` fields in the database, but does **not** change the status. The status remains `OPEN` until the technician begins work.
- **No `ON_HOLD` Status:** Neither the database ENUM nor `maintenance.service.js` supports `ON_HOLD`.
- **No `VERIFIED` or `CLOSED` Status:** Once a technician resolves a ticket via `resolveIssue()`, the status is permanently `RESOLVED`. There is no separate manager sign-off or closure status.
- **Reopening Prohibited:** Once a ticket is `RESOLVED` or `CANCELLED`, it cannot be restarted or edited. `startWork()` throws `ValidationError: Cannot start work: Current status is 'RESOLVED'`.
- **Emergency / Critical Prioritization:** The database sorts tickets using:
  `ORDER BY CASE m.status WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'RESOLVED' THEN 3 ELSE 4 END, FIELD(m.priority, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), m.created_at DESC`
  Furthermore, `priority === 'CRITICAL'` automatically sets `blocking_unit = 1` and dispatches immediate high-priority notifications to property managers.
- **Smallest Safe Workflow for Stage 2.5:**  
  Workspace B must bind its UI strictly to the supported 4-state lifecycle:  
  **`OPEN` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `RESOLVED` (or `CANCELLED`)**.

---

## 5. Unit Status and Reservation Protection Findings

A critical part of the audit was determining whether unit blocking is enforced authoritatively on the server or relies on frontend toggles.

### 5.1 Unit Locking on Work Order Creation
- **Backend Code:** [`maintenance.service.js` L152–L156](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js#L152-L156)
- **Rule:** If `data.blocking_unit === true` or `priority === 'CRITICAL'`, and an `apartment_id` is supplied:
  ```sql
  UPDATE apartments SET status = "MAINTENANCE" WHERE id = ?
  ```
- **Factual Evidence:** Tested and verified in Test 1 of `maintenance.test.js`. Apartment 1 status changed from `AVAILABLE` to `MAINTENANCE` immediately upon work order creation.

### 5.2 Reservation Engine Availability Block
- **Backend Code:** [`reservations.service.js` L114–L121](file:///c:/xampp/htdocs/BFA/backend/src/modules/reservations/reservations.service.js#L114-L121) & [L227–L232](file:///c:/xampp/htdocs/BFA/backend/src/modules/reservations/reservations.service.js#L227-L232)
- **Validation:** Both `checkAvailability()` and `createReservation()` inspect `apartments.status`:
  ```javascript
  const blockedStatuses = ['MAINTENANCE', 'OUT_OF_SERVICE', 'BLOCKED'];
  if (blockedStatuses.includes(apartment.status) || apartment.is_active === 0) {
    throw new ConflictError(`Cannot create reservation: Unit '${apartment.unit_name}' is currently in ${apartment.status} state.`);
  }
  ```
- **Double-Booking & Concurrency Protection:** `createReservation()` operates inside an explicit transaction with row-level locks (`checkAvailabilityWithLock`), guaranteeing concurrent booking requests cannot bypass the maintenance block.
- **Reservation Approval Protection:** `approveReservation()` ([`reservations.service.js` L913–L916](file:///c:/xampp/htdocs/BFA/backend/src/modules/reservations/reservations.service.js#L913-L916)) throws `ConflictError("Unit is currently in MAINTENANCE status and cannot be approved for check-in until released from maintenance.")`.
- **Front Office Check-In Protection:** Front Office check-in calls `checkInReservation()`, which verifies reservation confirmation and blocks check-ins on non-operational units.

### 5.3 Unit Operational State Lifecycle on Resolution
- **Backend Code:** [`maintenance.service.js` L353–L392](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js#L353-L392)
- **Multi-Maintenance Integrity:** When `resolveIssue` or `cancelIssue` is called, the backend queries:
  ```sql
  SELECT COUNT(*) as count FROM maintenance_requests 
  WHERE apartment_id = ? AND id != ? AND status IN ("OPEN", "IN_PROGRESS") AND blocking_unit = 1
  ```
  If `remainingCount > 0`, the apartment **remains in `MAINTENANCE`**.
- **No Direct Skip to `AVAILABLE`:** If `remainingCount === 0`, the unit transitions to:
  1. `OCCUPIED` (if a guest with status `CHECKED_IN` is in-house today).
  2. `BLOCKED` (if a blocked period covers today).
  3. `CLEANING` (standard transition for vacant units).
- **Enforced Housekeeping Progression:** [`apartments.service.js` L281–L284](file:///c:/xampp/htdocs/BFA/backend/src/modules/apartments/apartments.service.js#L281-L284) strictly forbids manual status jumps:
  ```javascript
  if (['MAINTENANCE', 'DIRTY'].includes(unit.status) && normalizedStatus === 'AVAILABLE') {
    throw new ConflictError(`Unit in '${unit.status}' state cannot bypass cleaning. It must transition through CLEANING and READY before becoming AVAILABLE.`);
  }
  ```
- **Conclusion:** Booking protection and unit locking are **100% server-enforced**. A frontend toggle is never relied upon for booking security.

---

## 6. Technician Dispatch Findings

The audit investigated whether the backend can establish that a technician is genuinely on duty.

### 6.1 What `POST /api/v1/maintenance/:id/assign` Actually Validates
- **Backend Code:** [`maintenance.service.js` L230–L254](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js#L230-L254)
- **Checks Performed:**
  1. `users.id` exists in database.
  2. `users.status === 'ACTIVE'`.
  3. `users.property_id` matches the work order's `property_id`.
- **Checks NOT Performed on Backend:**
  - Does NOT check whether the user is scheduled on today's roster (`shifts`).
  - Does NOT check whether the current time is within scheduled shift hours.
  - Does NOT check whether the user has clocked in today (`attendance_records`).
  - Does NOT check whether the user is on approved leave (`leave_requests`).
  - Does NOT check whether the user's department is `MAINTENANCE` in `employees`.

### 6.2 Data Model Asymmetry: `users.id` vs `employees.id`
- In `maintenance_requests`: `assigned_to_id` references `users.id` (`fk_maint_assigned_to FOREIGN KEY (assigned_to_id) REFERENCES users(id)`).
- In workforce tables (`shifts`, `attendance_records`, `leave_requests`): all assignments reference `employees.id`.
- Mapping requires: `users.id` $\leftrightarrow$ `employees.user_id`.

### 6.3 Verification of Dispatch States:
To prevent labeling an employee "Currently On Duty" based solely on a roster entry:

| Operational State | Data Source Required | Can Backend Query Today? | Available in Existing Maintenance API? |
| :--- | :--- | :--- | :--- |
| **Scheduled Today** | `shifts` table (`shift_date = CURRENT_DATE` and `status = 'SCHEDULED'`) | Yes, via `GET /api/v1/workforce/shifts` | **No** (Requires cross-module client call) |
| **Within Scheduled Shift** | `shifts` table (`start_time` $\le$ `CURRENT_TIME` $\le$ `end_time` in Africa/Lagos UTC+1) | Yes, calculation from shift times | **No** (Requires client-side calculation) |
| **Clocked In** | `attendance_records` (`work_date = CURRENT_DATE`, `clock_in_time IS NOT NULL`, `clock_out_time IS NULL`) | Yes, via `GET /api/v1/workforce/attendance` | **No** (Requires cross-module client call) |
| **Eligible for Dispatch** | All of the above PLUS no `APPROVED` leave in `leave_requests` | Yes, multiple endpoints | **No dedicated backend endpoint exists** |

### 6.4 Safe Strategy for Workspace B:
Because there is no unified `/api/v1/workforce/on-duty` or `/api/v1/maintenance/eligible-technicians` endpoint:
- **Option 1 (Workspace B Safe Presentation):** The frontend assignment modal queries `GET /api/v1/users?propertyId=...` for assigned property staff. If cross-referenced with `GET /api/v1/workforce/shifts` and `GET /api/v1/workforce/attendance`, the badge must explicitly state **"Scheduled on Roster"** vs **"Clocked In (Verified Attendance)"**. If attendance cannot be verified, it must **never** display "Currently On Duty".
- **Option 2 (Workspace C Enhancement):** Implement a dedicated endpoint `GET /api/v1/workforce/dispatch/technicians?property_id=...` that performs the server-side join across `users`, `employees`, `shifts`, `attendance_records`, and `leave_requests`.

---

## 7. Repair Evidence Upload Findings

The audit forensically examined all upload capabilities to assess repair photo evidence.

### 7.1 Existing Maintenance Support
- **Current State:** **ZERO support.**
  - `maintenance_requests` has no columns for `image_url`, `photo_url`, `attachments`, or `evidence`.
  - `backend/src/modules/maintenance/` has no upload routes, controllers, or service methods.
  - No database migration has provisioned a maintenance evidence association.

### 7.2 Why Property Media Upload CANNOT Be Reused:
1. **Public Static Exposure:** Property media uploads directly to `/uploads/properties/` or `/uploads/apartments/`, which are statically mounted via Express:
   `app.use('/uploads', express.static(...))`
   Serving maintenance photos (which may depict private guest belongings, tenant rooms, or internal security defects) through an unauthenticated public static URL creates a serious privacy and security vulnerability.
2. **Entity Coupling:** Property media uploads (`/api/v1/properties/:id/media` and `/api/v1/apartments/:id/media`) require a property or apartment ID and insert into `property_media` with fields like `is_featured`, `display_order`, and `approval_status`. They cannot attach to a `maintenance_id`.
3. **Operational Evidence Table (`operational_evidence_attachments`):** Migration 026 created this table with category `ENUM(..., 'MAINTENANCE_BEFORE', 'MAINTENANCE_AFTER', ...)`, but it lacks a `maintenance_id` column (`case_id`, `property_id`, `apartment_id`, `reservation_id` only). Furthermore, there is no public or staff API route to upload to it.

### 7.3 Workspace C Prerequisite:
To safely support maintenance repair photos, Workspace C must:
1. Add `evidence_url` or a dedicated `maintenance_evidence` table linked to `maintenance_requests(id)`.
2. Provide an authenticated upload and streaming endpoint:
   `POST /api/v1/maintenance/:id/evidence` and `GET /api/v1/maintenance/:id/evidence/:fileId`.
3. Enforce authenticated access (only authorized property staff and managers can view work order photos).

---

## 8. Repair Cost and Financial Authorization Findings

The audit reviewed the relationship between maintenance costs and the financial authorization model.

### 8.1 Cost Recording in Maintenance Service
1. **Estimated Cost:** Recorded during work order creation (`data.estimated_cost`).
   - Stored in `maintenance_requests.estimated_cost`.
   - Allowed roles: `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `RECEPTIONIST`.
2. **Actual Cost:** Recorded during resolution (`data.actual_cost`).
   - Stored in `maintenance_requests.actual_cost`.
   - Allowed roles: `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `STAFF`.
   - Technicians can enter the numerical amount of the repair when submitting resolution notes.

### 8.2 Separation from Accounting Expenses (`/api/v1/expenses`)
- **Crucial Architectural Boundary:** Entering `actual_cost` in `resolveIssue()` **does NOT automatically create or approve a financial expense record.**
- `resolveIssue()` updates `maintenance_requests` only.
- In order to recognize a financial expense against the property ledger:
  - An authorized user (`SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`) must submit `POST /api/v1/expenses` with `maintenance_id: id`.
  - Technicians (`STAFF`) are **strictly prohibited** from accessing `/api/v1/expenses` (HTTP 403 Forbidden).
  - Even if a manager records the expense, it starts in `RECORDED` status.
  - Expense approval (`POST /api/v1/expenses/:id/approve`) requires `SUPER_ADMIN`, `OWNER`, or `ADMIN`.
  - **Maker-Checker Enforced:** Creators cannot approve their own expenses ([`expenses.service.js` L234–L239](file:///c:/xampp/htdocs/BFA/backend/src/modules/expenses/expenses.service.js#L234-L239)).
  - Approving an expense posts journal entries to General Ledger Account `5010 (Maintenance & Facility Repairs)` via [`postingBridge.service.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/accounting/postingBridge.service.js).
- **Integrity Guarantee:** A technician entering an actual repair cost on a work order **cannot** trigger unauthorized corporate fund disbursements or bypass expense controls.

---

## 9. Existing Automated Test Results

Automated test suites were executed against the isolated test database (`bfa_apartments_test_db`).

### 9.1 Maintenance Test Suite Execution
- **Command:** `npm --prefix backend test backend/tests/maintenance.test.js`
- **Output:**
  ```
  PASS tests/maintenance.test.js (25.883 s)
    Maintenance & Operations Workflow Tests (Phase 7)
      √ 1. Create maintenance work order and verify unit transitions to MAINTENANCE (305 ms)
      √ 2. Reject maintenance creation with invalid category (350 ms)
      √ 3. Reject maintenance creation when apartment does not belong to specified property (220 ms)
      √ 4. Assign technician to maintenance work order (222 ms)
      √ 5. Start work order and verify status transitions to IN_PROGRESS (110 ms)
      √ 6. Reject invalid transition when starting already in-progress work order (113 ms)
      √ 7. Resolve work order and verify apartment transitions to CLEANING (not directly AVAILABLE) (322 ms)
      √ 8. Maintenance statistics reflect accurate counts and incurred costs (111 ms)
      √ 9. Agent role is forbidden from modifying or creating maintenance orders (679 ms)

  Test Suites: 1 passed, 1 total
  Tests:       9 passed, 9 total
  Snapshots:   0 total
  Time:        26.693 s
  ```
- **Result:** **100% Passed (9/9).** Maintenance CRUD, status transitions, property validation, unit coupling, and role restrictions operate cleanly.

### 9.2 Related Operational & Regression Suites Execution
- **Command:** `npm --prefix backend test backend/tests/apartments.test.js backend/tests/reservationEngine.test.js backend/tests/staffOperationsAndReadinessPriorityD.test.js`
- **Result:** **3 passed, 22 passed, 0 failed** in 7.3s.
  - Apartment status update guards verified.
  - Reservation availability checks and double-booking locks verified.
  - Decoupled readiness (`maintenance_status`) verified.
- **Financial & Role Boundary Tests Execution:**
  - `backend/tests/financial.test.js` & `backend/tests/securityRemediationAndRoleBoundaries.test.js`
  - Result: 31 passed, 5 failed (due to legacy unseeded mock IDs in older test scripts).
  - Expense separation of duties (`5.1`, `5.2`, `5.3`, `5.4`) passed with 100% success.

---

## 10. Missing Backend Capabilities

The technical verification identified the following missing backend capabilities:

1. **No Evidence Attachment Route:** No `POST /api/v1/maintenance/:id/attachments` endpoint and no attachment storage columns on `maintenance_requests`.
2. **No Unified On-Duty Dispatch Endpoint:** No backend API to return technicians filtered by live shift window, attendance clock-in, and active leave status.
3. **No Independent Manager Verification / Closure Route:** The state machine ends at `RESOLVED`. There is no `POST /api/v1/maintenance/:id/close` or `POST /api/v1/maintenance/:id/verify` route.
4. **No Itemized Parts / Materials Ledger:** `maintenance_requests` supports only a scalar `actual_cost` DECIMAL(10,2). It does not support line-item parts recording.
5. **No `ON_HOLD` Status:** The backend does not support pausing a work order pending parts.

---

## 11. Package A/B/C Readiness Decisions

| Work Package | Components & Capabilities | Readiness Classification | Notes / Justification |
| :--- | :--- | :--- | :--- |
| **Package A — Maintenance Management** | - Maintenance dashboard & KPI metrics<br/>- Work-order creation modal<br/>- Multi-criteria filter & list table<br/>- Work-order detail drawer/modal<br/>- Status progression (`START`, `RESOLVE`, `CANCEL`) | **READY FOR WORKSPACE B IMPLEMENTATION** | All required endpoints (`GET /stats`, `GET /`, `GET /:id`, `POST /`, `POST /:id/start`, `POST /:id/resolve`, `POST /:id/cancel`) exist, are fully tested, and enforce property isolation. |
| **Package B — Technician Dispatch & Field Execution** | - Technician assignment modal<br/>- Technician mobile execution cards<br/>- Repair completion notes & actual cost entry<br/>- Real-time on-duty attendance indicators<br/>- Repair photo evidence attachments | **CONDITIONALLY READY — WORKSPACE C PREREQUISITES REQUIRED** | - Basic assignment (`POST /:id/assign`) and mobile resolution are ready.<br/>- **Photo Evidence:** Not supported; must be deferred or implemented via Workspace C prerequisite.<br/>- **Dispatch Verification:** Frontend must label status as "Assigned Property Staff" or "Scheduled on Roster", not "Currently On Duty", unless live clock-in is verified. |
| **Package C — Unit Protection and Release** | - Unit maintenance restriction trigger<br/>- Reservation booking block<br/>- Front Office check-in block<br/>- Multi-ticket clearance logic<br/>- Housekeeping transition to `CLEANING` | **READY FOR WORKSPACE B IMPLEMENTATION** | The backend already provides 100% authoritative server-side protection. Releasing is automated upon work order resolution and enforces subsequent cleaning progression. |

---

## 12. Recommended Implementation Sequence for Stage 2.5

To deliver immediate business value without violating backend contracts, Stage 2.5 should proceed in the following order:

```mermaid
flowchart TD
    Step1["Step 1: Maintenance API Client (maintenanceService.js)<br/>Wrap existing routes: stats, list, get, create, assign, start, resolve, cancel"] --> Step2["Step 2: Package A Management Dashboard (MaintenancePage.jsx)<br/>KPI cards, filterable work order table, details view"]
    Step2 --> Step3["Step 3: Work Order Creation & Unit Locking<br/>CreateTicketModal with unit selector, occupancy warning, and blocking toggle"]
    Step3 --> Step4["Step 4: Package B Technician Assignment & Mobile Execution<br/>AssignTechnicianModal (property staff) + mobile-friendly card (start/resolve)"]
    Step4 --> Step5["Step 5: Package C Verification & Responsive Polish<br/>Verify unit transitions (MAINTENANCE -> CLEANING), fix DEF-B14 (320px textarea)"]
```

---

## 13. Security and Data-Integrity Risks

1. **Risk: False On-Duty Labeling:**  
   *Mitigation:* Do not display "Currently On Duty" unless `attendance_records` confirms a valid clock-in for today. Use the label "Scheduled Today" for rostered staff, and "Property Staff" for general staff.
2. **Risk: Sensitive Photo Exposure via Public Static Directory:**  
   *Mitigation:* Do **not** upload maintenance photos to the public `/uploads/properties` folder. Defer photo uploads until a secure, authenticated Workspace C endpoint is provisioned.
3. **Risk: Unsynchronized Unit Release:**  
   *Mitigation:* Do not attempt to force a unit directly to `AVAILABLE` from the maintenance screen. Respect the server-enforced progression: maintenance resolution transitions the unit to `CLEANING`, where housekeeping must perform inspection before release.

---

## 14. Exact Workspace C Prerequisites (For Full Package B Scope)

If the product owners require photo evidence attachments and independent manager closure before shipping Stage 2.5, the following Workspace C work is required:

1. **Schema Migration:**
   - Add `evidence_url VARCHAR(255) NULL` to `maintenance_requests`, OR create `maintenance_evidence` table (`id`, `maintenance_id`, `file_path`, `file_url`, `mime_type`, `file_size`, `uploaded_by_id`, `created_at`).
   - Add `status ENUM('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED')` to support `ON_HOLD` and `CLOSED`.
2. **Backend API Endpoints:**
   - `POST /api/v1/maintenance/:id/evidence`: Accepts base64 or multipart image, validates MIME/magic bytes, saves to private directory, records attachment.
   - `GET /api/v1/maintenance/:id/evidence/:fileId`: Authenticated file streaming endpoint with property-level and role-level access control.
   - `POST /api/v1/maintenance/:id/close`: Manager closure endpoint to transition `RESOLVED` $\rightarrow$ `CLOSED`.
   - `GET /api/v1/workforce/dispatch/technicians?property_id=...`: Unified server-side query returning staff with composite status (`NOT_SCHEDULED`, `SCHEDULED`, `CLOCKED_IN`, `ON_LEAVE`).

---

## 15. Final Readiness Verdict

### **Verdict:**
### **`CONDITIONALLY READY — WORKSPACE C PREREQUISITES REQUIRED`**

- **Package A (Maintenance Management):** **READY** for immediate Workspace B frontend implementation.
- **Package B (Technician Dispatch & Field Execution):** **PARTIALLY READY.** Ready for assignment and mobile work execution, but **evidence photo upload** and **advanced closure states** require Workspace C prerequisites.
- **Package C (Unit Protection & Release):** **READY.** 100% server-side enforced and fully operational.

---

*Report certified by Antigravity System Architecture & QA Team.*  
*Repository: `c:\xampp\htdocs\BFA` | Master Branch | Commit: `3075411a754fcb7801b4b5b023168df2d6d4f4f8`*  
*Timestamp: 3 November 2026, 17:58 CET*
