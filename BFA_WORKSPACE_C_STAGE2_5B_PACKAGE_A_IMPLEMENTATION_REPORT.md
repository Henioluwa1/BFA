# BFA WORKSPACE C — STAGE 2.5B
# PACKAGE A IMPLEMENTATION REPORT
## Identity Resolution & Verified Technician Dispatch Engine

**Project:** BFA Apartments Management System  
**Workspace:** C — Backend, Database, APIs & Security Architecture  
**Milestone:** Stage 2.5B — Backend Prerequisites (Package A)  
**Implementation Date:** 2026-11-03  
**Status:** **IMPLEMENTED & VERIFIED — READY FOR INDEPENDENT AUDIT**  
**Authorized Scope:** Package A ONLY (Identity Resolution & Technician Dispatch)  

---

## 1. Executive Summary

In accordance with explicit authorization from the BFA Project Owner, **Package A** of Stage 2.5B has been implemented and verified.

Package A establishes authoritative identity resolution between application user accounts (`users`) and human resources records (`employees`), deploys a verified technician dispatch calculation engine, enforces row-level concurrency serialization across work order assignments, and reconciles the binding executive policy determinations (**DEC-2.5B-01**, **DEC-2.5B-02**, and **DEC-2.5B-03**).

### Key Implementation Metrics:
- **Endpoints Delivered:** 2 (`POST /api/v1/employees/:id/link-user`, `GET /api/v1/maintenance/eligible-technicians`)
- **Services Implemented / Hardened:** 3 (`IdentityResolverService`, `EmployeesService.linkUserToEmployee`, `MaintenanceService.assignStaff` / `getEligibleTechnicians`)
- **Automated Tests Executed:** 12/12 passed (`backend/tests/maintenancePackageADispatch.test.js`)
- **Regression Tests Executed:** 9/9 passed (`backend/tests/maintenance.test.js`)
- **Total Test Suite Execution:** 21/21 passed with 100% green status
- **Production Database Touch:** ZERO (Isolated test database `bfa_apartments_test_db` used exclusively)
- **Scope Boundary Compliance:** STRICT (Workspace A, Workspace B, and Packages C & D remain untouched)

---

## 2. Binding Policy Reconciliation

| Policy Decision | Approved Option | Implemented Technical Architecture |
| :---: | :---: | :--- |
| **DEC-2.5B-01** | **Option A**<br>*(Formal HR Onboarding Required)* | - Disallowed automatic batch backfills or synthetic records.<br>- Users without an existing, active employee record (such as `users.id = 8` Tunde Bakare and `users.id = 9` Amara Nwosu) are classified as `dispatchEligibility: 'NOT_ELIGIBLE'` with reason `NO_EMPLOYEE_RECORD`.<br>- Attempting to dispatch an unmapped staff member via `assignStaff` or `createMaintenance` is rejected with `422 Unprocessable Entity`.<br>- Created `POST /api/v1/employees/:id/link-user` for explicit administrative linking with email mismatch verification. |
| **DEC-2.5B-02** | **Option A**<br>*(Permissive Dispatch During Review with Warning & Audit)* | - Technicians with active geofence review exceptions (`requires_review = 1`) evaluate to `dispatchEligibility: 'ATTENDANCE_UNDER_REVIEW'` with `canDispatch: true` and `attendanceWarning: 'GEOFENCE_REVIEW_PENDING'`.<br>- Preserves original punch timestamp, coordinates, and DEF-C02 Option A attendance policy.<br>- Dispatch execution automatically writes an immutable audit record: `DISPATCH_WITH_ATTENDANCE_EXCEPTION`. |
| **DEC-2.5B-03** | **Option B**<br>*(Configurable Workload Warning Threshold — No Hard Cap)* | - Dynamically retrieves `maintenance_workload_warning_threshold` from `system_settings` (default: 5 active tickets).<br>- Calculates active tickets (`status IN ('OPEN', 'IN_PROGRESS')`).<br>- If active tickets $\ge$ threshold, returns `isOverloaded: true` and advisory `workloadWarning` string without blocking assignment or requiring manager overrides. |

---

## 3. Technical Deliverables & Architecture

### 3.1 Identity Resolution Service
- **File:** [`backend/src/modules/workforce/identityResolver.service.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/workforce/identityResolver.service.js)
- **Capabilities:**
  - `resolveEmployeeFromUser(userOrId)`: Performs clean lookup joining `employees` on `user_id = users.id`. Never assumes `users.id === employees.id`.
  - `resolveUserFromEmployee(employeeOrId)`: Resolves `users` account linked to an employee.
  - `findEmailCandidates(email)`: Identifies unlinked candidates matching by corporate email for discovery only; explicitly does not link or mutate state.

### 3.2 Explicit Administrative Identity Linking API
- **Route:** `POST /api/v1/employees/:id/link-user`
- **Controller:** [`EmployeesController.linkUser`](file:///c:/xampp/htdocs/BFA/backend/src/modules/employees/employees.controller.js)
- **Service:** [`EmployeesService.linkUserToEmployee`](file:///c:/xampp/htdocs/BFA/backend/src/modules/employees/employees.service.js)
- **Access Control:** Restricted strictly to `SUPER_ADMIN` and `ADMIN`.
- **Concurrency & Validation:**
  - Acquires exclusive row lock `SELECT ... FOR UPDATE` on both `employees` and `users` within `pool.withTransaction`.
  - Rejects if employee is already linked to another user account (`409 Conflict`).
  - Rejects if user account is already linked to another employee (`409 Conflict`).
  - Verifies email similarity: if `employee.email !== user.email`, requires explicit confirmation parameter `confirmEmailMismatch: true`; otherwise fails closed with `422 ValidationError`.
  - Writes audit trail event `EMPLOYEE_USER_LINKED` and records employee activity `USER_ACCOUNT_LINKED`.

### 3.3 Verified Eligible Technicians Calculation API
- **Route:** `GET /api/v1/maintenance/eligible-technicians?propertyId=:id`
- **Controller:** [`MaintenanceController.getEligibleTechnicians`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.controller.js)
- **Service:** [`MaintenanceService.getEligibleTechnicians`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js)
- **Scoping & Authorization:** Property-level RBAC (`SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`). Managers restricted to their assigned property.
- **State Computation Matrix:**
  1. **Unmapped Staff:** `dispatchEligibility: 'NOT_ELIGIBLE'`, `canDispatch: false`, `reason: 'NO_EMPLOYEE_RECORD'`.
  2. **Inactive Staff:** `dispatchEligibility: 'NOT_ELIGIBLE'`, `canDispatch: false`, `reason: 'EMPLOYEE_STATUS_<STATUS>'`.
  3. **Approved Leave Today:** `dispatchEligibility: 'NOT_ELIGIBLE'`, `canDispatch: false`, `reason: 'ON_APPROVED_LEAVE'`.
  4. **Active Clock-In with Geofence Review:** `dispatchEligibility: 'ATTENDANCE_UNDER_REVIEW'`, `canDispatch: true`, `attendanceWarning: 'GEOFENCE_REVIEW_PENDING'`.
  5. **Verified Clock-In:** `dispatchEligibility: 'VERIFIED_ON_DUTY'`, `canDispatch: true`.
  6. **Unverified Regular Clock-In:** `dispatchEligibility: 'CLOCKED_IN_UNVERIFIED'`, `canDispatch: true`.
  7. **Published Roster Shift Today:** `dispatchEligibility: 'SCHEDULED'`, `canDispatch: true`.
  8. **Not Scheduled / Not on Duty:** `dispatchEligibility: 'NOT_ELIGIBLE'`, `canDispatch: false`, `reason: 'NOT_ON_DUTY_OR_SCHEDULED'`.

### 3.4 Concurrency Serialization & Deadlock Prevention
- **Files Modified:** [`backend/src/modules/maintenance/maintenance.service.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js)
- **Locking Hierarchy:**
  1. Lock maintenance work order row: `SELECT ... FROM maintenance_requests WHERE id = ? FOR UPDATE`.
  2. Deadlock-free ascending ID serialization for user locks:
     ```javascript
     const oldStaffId = record.assigned_to_id ? parseInt(record.assigned_to_id, 10) : null;
     const idsToLock = Array.from(new Set([staffId, oldStaffId].filter(Boolean))).sort((a, b) => a - b);
     for (const uId of idsToLock) {
       await conn.query('SELECT ... FROM users WHERE id = ? FOR UPDATE', [uId]);
     }
     ```
  3. Deadlock retry helper `executeWithDeadlockRetry`: Retries up to 3 times with exponential randomized jitter upon `ER_LOCK_DEADLOCK` (MySQL error 1213).
  4. Applied symmetrically during work order creation (`createMaintenance`) when `assigned_to_id` is supplied and during reassignment (`assignStaff`).

---

## 4. Verification & Automated Test Evidence

Automated test suite [`backend/tests/maintenancePackageADispatch.test.js`](file:///c:/xampp/htdocs/BFA/backend/tests/maintenancePackageADispatch.test.js) was constructed and executed against the isolated test database `bfa_apartments_test_db`.

```
PASS tests/maintenancePackageADispatch.test.js (7.876 s)
  Stage 2.5B Package A — Identity Resolution & Technician Dispatch Verification
    1. Administrative Explicit Identity Linking (DEC-2.5B-01 Option A)
      √ 1.1 Non-admin roles are forbidden from linking user to employee (68 ms)
      √ 1.2 Rejects linking if emails differ and confirmEmailMismatch is false (127 ms)
      √ 1.3 Successfully links user to employee when confirmEmailMismatch is true and records audit log (163 ms)
      √ 1.4 Rejects duplicate linking of user already linked to another employee (78 ms)
    2. Verified Eligible Technicians Query & States
      √ 2.1 Unmapped staff without linked employee are marked NOT_ELIGIBLE (DEC-2.5B-01) (192 ms)
      √ 2.2 Technician on approved leave today is marked NOT_ELIGIBLE with reason ON_APPROVED_LEAVE (179 ms)
      √ 2.3 Technician with published shift today is marked SCHEDULED with canDispatch: true (141 ms)
      √ 2.4 Clock-in with active geofence review exception evaluates to ATTENDANCE_UNDER_REVIEW with canDispatch: true (DEC-2.5B-02 Option A) (120 ms)
      √ 2.5 Verified clock-in evaluates to VERIFIED_ON_DUTY with canDispatch: true (82 ms)
    3. Dispatch Concurrency, Audit & Workload Capacity (DEC-2.5B-02 & DEC-2.5B-03)
      √ 3.1 Dispatching technician with geofence exception writes DISPATCH_WITH_ATTENDANCE_EXCEPTION immutable audit event (160 ms)
      √ 3.2 Assigning technician with active tickets >= threshold returns advisory workload warning without blocking (DEC-2.5B-03 Option B) (178 ms)
      √ 3.3 Rejects assignment of unmapped user account (DEC-2.5B-01 Option A) (75 ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        8.141 s
```

---

## 5. Non-Regression Verification

Regression testing against baseline maintenance operations:
```
PASS tests/maintenance.test.js (6.529 s)
  Maintenance & Operations Workflow Tests (Phase 7)
    √ 1. Create maintenance work order and verify unit transitions to MAINTENANCE (197 ms)
    √ 2. Reject maintenance creation with invalid category (137 ms)
    √ 3. Reject maintenance creation when apartment does not belong to specified property (49 ms)
    √ 4. Assign technician to maintenance work order (111 ms)
    √ 5. Start work order and verify status transitions to IN_PROGRESS (44 ms)
    √ 6. Reject invalid transition when starting already in-progress work order (25 ms)
    √ 7. Resolve work order and verify apartment transitions to CLEANING (not directly AVAILABLE) (59 ms)
    √ 8. Maintenance statistics reflect accurate counts and incurred costs (35 ms)
    √ 9. Agent role is forbidden from modifying or creating maintenance orders (54 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

---

## 6. Scope Boundary Certification

- **Workspace A (External Portal):** Untouched.
- **Workspace B (Frontend):** Untouched (No frontend integration executed; awaiting separate authorization).
- **Stage 2.5B Packages C & D:** Untouched (No resolution flow modifications or mobile technician UI changes).
- **Production Database (`bfa_apartments_db`):** Untouched.
- **Git Repository:** Working tree preserved without unstaged commits, pushes, or resets.

