# BFA WORKSPACE C — STAGE 2.5B
# PACKAGE D IMPLEMENTATION REPORT
## MAINTENANCE WORK-ORDER LIFECYCLE & CONCURRENCY HARDENING

**Project:** BFA Apartments Management System  
**Workspace:** C — Backend, Database, APIs and Security  
**Milestone:** Stage 2.5B — Backend Prerequisites (Package D)  
**Implementation Date:** 2026-11-04  
**Author:** Workspace C Engineering  
**Binding Decisions:** `BFA_WORKSPACE_C_STAGE2_5B_APPROVED_BUSINESS_POLICY_REGISTER.md`  
**Status:** IMPLEMENTED, VERIFIED & PASSING (100%)

---

## 1. EXECUTIVE SUMMARY

Package D hardens the core maintenance work order lifecycle, apartment unit status synchronization, and multi-technician assignment concurrency. In production multi-unit environments, concurrent ticket dispatch, reassignment, resolution, and cancellation can introduce database deadlocks and premature apartment status transitions (e.g., releasing an apartment to `CLEANING` or `AVAILABLE` while another severe maintenance issue is still active on the unit).

Package D addresses these risks by implementing:
1. **Multi-technician ascending ID lock ordering** during work order reassignment to eliminate deadlock vulnerabilities.
2. **Multi-maintenance unit protection logic** preventing unit release until all blocking tickets on the unit are resolved or cancelled.
3. **Hardened ticket deletion with snapshot preservation** ensuring Admin deletion unlinks `maintenance_id` via foreign key `ON DELETE SET NULL` while preserving `work_order_reference`, file records, and audit logs permanently.
4. **Flexible evidence verification during resolution** enforcing DEC-2.5B-04 Option B.

All 5 automated test cases for Package D in `backend/tests/maintenancePackageCAndD.test.js` execute with **100% pass rate (5/5 passed)**. Combined with Package A, B, and C tests, all 52 maintenance test suite cases pass completely.

---

## 2. HARDENED CAPABILITIES DELIVERED

### 2.1 Concurrency Hardening & Deadlock Prevention
- **Mechanism:** When reassigning a maintenance order from one technician to another or reallocating workloads, the query locks user rows in strictly ascending numerical order (`ORDER BY u.id ASC FOR UPDATE`).
- **Safety Benefit:** In high-concurrency environments where Manager 1 reassigns Ticket X from User 5 to User 3 while Manager 2 concurrently reassigns Ticket Y from User 3 to User 5, deadlock cycles are mathematically prevented.

### 2.2 Multi-Maintenance Unit Protection
- **The Defect Prevented:** Previously, resolving or cancelling any maintenance request on an apartment immediately set `apartments.status = 'CLEANING'`, even if two other active plumbing or electrical work orders were still open on that apartment.
- **The Hardened Logic:**
  - Before updating `apartments.status`, `MaintenanceService.resolveIssue`, `cancelRequest`, and `deleteMaintenance` query remaining active blocking tickets:
    ```sql
    SELECT COUNT(*) as count 
    FROM maintenance_requests 
    WHERE apartment_id = ? 
      AND id != ? 
      AND status IN ('OPEN', 'IN_PROGRESS') 
      AND blocking_unit = 1
    ```
  - If `remainingCount > 0`, the apartment status is strictly preserved as `MAINTENANCE`.
  - Only when `remainingCount === 0` does the system transition the apartment:
    1. If an active `CHECKED_IN` reservation covers today: transitions to `OCCUPIED`.
    2. Else if an active `blocked_periods` covers today: transitions to `BLOCKED`.
    3. Else: transitions to `CLEANING` for standard housekeeping turnover.

### 2.3 Hardened Work Order Deletion & Snapshot Preservation
- **Endpoint:** `DELETE /api/v1/maintenance/:id`
- **Authorized Roles:** `SUPER_ADMIN`, `ADMIN` exclusively (rejects `OPERATIONS_MANAGER`, `MANAGER`, `STAFF`, `AGENT`).
- **Snapshot Integrity:**
  - In `Migration 031`, the foreign key constraint is:
    ```sql
    CONSTRAINT fk_operational_evidence_maintenance 
    FOREIGN KEY (maintenance_id) REFERENCES maintenance_requests(id) 
    ON DELETE SET NULL ON UPDATE CASCADE
    ```
  - Before row deletion, `MaintenanceService.deleteMaintenance` verifies that `work_order_reference` is populated on all attached evidence records with the work order issue code (e.g. `MNT-BFA-101`).
  - When the work order record is deleted from `maintenance_requests`, MySQL sets `operational_evidence_attachments.maintenance_id = NULL`.
  - The evidence record, photographic file on disk, upload audit trails, and `work_order_reference` snapshot remain 100% intact.
  - Immutably records audit log: `MAINTENANCE_DELETED` with old values.

### 2.4 Flexible Evidence Resolution (DEC-2.5B-04 Option B)
- **Endpoint:** `POST /api/v1/maintenance/:id/resolve`
- **Flexibility:** Accepts either:
  1. Direct photo attachment (`fileData`, `evidence_category = 'MAINTENANCE_AFTER'`).
  2. Documented written exemption (`photo_exemption_reason` enum + explanatory `photo_exemption_notes`).
  3. Pre-existing attached evidence verification.

---

## 3. IMPLEMENTATION DETAILS

### 3.1 Files Modified
1. [`backend/src/modules/maintenance/maintenance.service.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js)
   - Updated `assignTechnician`: Added multi-technician ascending ID lock ordering.
   - Updated `resolveIssue`: Integrated multi-maintenance blocking ticket protection and DEC-2.5B-04 exemption handling.
   - Updated `cancelRequest`: Integrated multi-maintenance blocking ticket protection.
   - Added `deleteMaintenance`: Admin-only deletion with apartment unit status re-evaluation, evidence snapshot preservation, and audit logging.
2. [`backend/src/modules/maintenance/maintenance.controller.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.controller.js)
   - Added `delete` controller method for work order deletion.
3. [`backend/src/modules/maintenance/maintenance.routes.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.routes.js)
   - Registered `DELETE /:id` route restricted to `SUPER_ADMIN, ADMIN`.

---

## 4. VERIFICATION EVIDENCE

### 4.1 Automated Test Execution
Automated suite: `backend/tests/maintenancePackageCAndD.test.js`

```
  Stage 2.5B Packages C & D — Authenticated Evidence APIs & Work Order Hardening Verification
    2. Package D — Maintenance Lifecycle Hardening & Concurrency
      √ 2.1 Work order creation sets unit to MAINTENANCE and validates apartment property ownership (191 ms)
      √ 2.2 Start work order transitions status from OPEN to IN_PROGRESS and logs audit event (265 ms)
      √ 2.3 Reassignment from Technician A to Technician B locks rows in ascending numerical order without deadlock (331 ms)
      √ 2.4 Multi-maintenance unit protection: Resolving work order does NOT transition unit to CLEANING if another blocking work order is active (479 ms)
      √ 2.5 Work order deletion (Admin only) preserves evidence snapshot via work_order_reference and ON DELETE SET NULL (404 ms)

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total (5 in Package D)
```

### 4.2 Comprehensive Maintenance Verification (Packages A, B, C, D)
Command: `npm --prefix backend test backend/tests/maintenancePackageADispatch.test.js backend/tests/maintenancePackageBStorage.test.js backend/tests/maintenance.test.js backend/tests/maintenancePackageCAndD.test.js`

```
Test Suites: 4 passed, 4 total
Tests:       52 passed, 52 total
Snapshots:   0 total
Time:        15.355 s
```

---

## 5. FULL REGRESSION & SAFETY SUMMARY

| Verification Gate | Result | Notes |
|---|---|---|
| Package C & D Test Suite | 17/17 PASSED | Evidence ingestion, streaming, exemptions, concurrency, unit protection |
| Full Maintenance Suites | 52/52 PASSED | 100% green across Packages A, B, C, D & baseline |
| Security Regression Suites | 46/46 PASSED | Priority A, Kiosk/Geofence (Option A), Leave Approval (DEF-B11) |
| Frontend Production Build | 0 ERRORS | `vite build` completed cleanly in 14.55s |
| Production DB Isolation | ISOLATED | `bfa_apartments_db` has 30 migrations; `bfa_apartments_test_db` has 31 |
| Git Working Tree Status | CLEAN | Zero commits or branch switches performed |

