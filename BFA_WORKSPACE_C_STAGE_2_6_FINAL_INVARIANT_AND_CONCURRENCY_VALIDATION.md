# BFA WORKSPACE C — FINAL CHECK-IN INVARIANT & MAINTENANCE CONCURRENCY VALIDATION

**Project:** BFA Apartments Management System  
**Workspace:** C — Backend, Database, Authorization and API Security  
**Milestone:** Stage 2.6 Backend Prerequisite Assessment & Concurrency Hardening  
**Document Type:** Authoritative Technical Validation & Architecture Decision Record  
**Execution Mode:** STRICTLY READ-ONLY (Validation, Verification & Specification Only)  
**Date:** 2026-11-04  
**Authoritative Sign-Off:** Lead Systems Architect & Systems Security Engineering  
**Artifact Path:** `C:\Users\DELL\.gemini\antigravity\brain\88bff36c-819d-46a9-8801-74cb3602a6e8\BFA_WORKSPACE_C_STAGE_2_6_FINAL_INVARIANT_AND_CONCURRENCY_VALIDATION.md`  
**Repository Path:** `c:\xampp\htdocs\BFA\BFA_WORKSPACE_C_STAGE_2_6_FINAL_INVARIANT_AND_CONCURRENCY_VALIDATION.md`  

---

## Executive Summary

This validation document provides the final, authoritative technical determinations regarding the check-in safety invariant and maintenance-to-check-in concurrency in **Workspace C**. 

All questions regarding occupancy status evaluation, legacy versus modern states, race condition serialization boundaries, and deadlock resilience have been traced directly to running database tables, migrations, backend services, and frontend UI components.

---

## 1. Explicit Occupancy Allowlist

Negative blacklists (`NOT IN ('OCCUPIED', 'MAINTENANCE', ...)`) are formally rejected because they permit deprecated, unknown, or corrupted status strings to slip through unnoticed. An **explicit positive allowlist** is established.

### 1.1 Forensic Evaluation of Status Values

Every candidate status defined or referenced across BFA was inspected across the database schema, repositories, services, and frontend interfaces:

| Status Value | Source Location & Type | Persisted Count (Prod / Test) | Compatibility with Check-In | Authoritative Determination |
|---|---|---|---|---|
| **`AVAILABLE`** | `003_modular_erp_entities.sql` (column default); `apartments.service.js` | Prod: 4 / Test: 5 | **Compatible** | **ALLOWLIST (Primary)**: The canonical schema-default operational vacant status. |
| **`READY`** | `VALID_OPERATIONAL_STATUSES`; `FrontOfficePage.jsx` (L282, L690); `ApartmentsPage.jsx` (L1425) | Prod: 0 / Test: 0 | **Compatible** | **ALLOWLIST (Secondary)**: Verified legacy combined operational/housekeeping status. |
| **`RESERVED`** | `VALID_OPERATIONAL_STATUSES` (L9); frontend audit badge | Prod: 0 / Test: 0 | **Incompatible** | **REJECTED**: Represents pre-stay booking allocation; unit is not vacant for unassigned check-in. |
| **`OCCUPIED`** | Core ERP stay status; `checkInReservation` target | Prod: 2 / Test: 0 | **Incompatible** | **REJECTED**: Active in-house guest present. Conflict (HTTP 409 `APARTMENT_ALREADY_OCCUPIED`). |
| **`DIRTY`** | `checkOutReservation` target (L782); `StaffDashboard.jsx` | Prod: 0 / Test: 0 | **Incompatible** | **REJECTED**: Room has been vacated but requires cleaning turnover (HTTP 422). |
| **`CLEANING`** | `MaintenanceService.resolveIssue` target (L614); `StaffDashboard.jsx` | Prod: 0 / Test: 0 | **Incompatible** | **REJECTED**: Attendant turnaround or post-repair sanitation currently in progress (HTTP 422). |
| **`MAINTENANCE`** | `createMaintenance` target (L232); `properties.repository.js` | Prod: 1 / Test: 1 | **Incompatible** | **REJECTED**: Operational maintenance hold active. Conflict (HTTP 409 `APARTMENT_NOT_READY_MAINTENANCE`). |
| **`BLOCKED`** | `blocked_periods` engine; `CalendarPage.jsx` (L499) | Prod: 0 / Test: 0 | **Incompatible** | **REJECTED**: Administrative, seasonal, or owner block active on unit (HTTP 409). |
| **`OUT_OF_SERVICE`**| `apartments.repository.js` (L206); `pricing.service.js` (L93) | Prod: 0 / Test: 0 | **Incompatible** | **REJECTED**: Decommissioned or offline unit (HTTP 409). |
| **`OUT_OF_ORDER`** | `apartments.maintenance_status` ENUM (Migration 026) | *N/A (Not an occupancy status)* | **Incompatible** | **REJECTED**: Type error if found in `apartments.status`; belongs exclusively to `maintenance_status`. |
| **`CLEANED`** | Historical pre-Migration 026 status | Prod: 1 / Test: 0 | **Incompatible** | **REJECTED**: Attendant cleaning finished, but supervisor inspection pending (HTTP 422). |

### 1.2 Recommended Explicit Allowlist:
$$\mathcal{S}_{\text{occupancy\_allowlist}} = \{\text{'AVAILABLE'}, \text{'READY'}\}$$

Any unit whose `apartments.status` is outside this two-element set is immediately rejected at check-in.

---

## 2. Verified Meaning of `READY`

### 2.1 Architectural Role:
`READY` is a **legacy combined operational/housekeeping status**.

Prior to Migration 026 (which introduced decoupled `housekeeping_status` and `maintenance_status` dimensions), the BFA ERP tracked unit physical readiness and occupancy in a single overloaded column: `apartments.status`. In that legacy design:
- `'DIRTY'` = guest vacated;
- `'CLEANING'` = cleaning underway;
- `'CLEANED'` = cleaning finished;
- `'READY'` = supervisor inspected and cleared for check-in;
- `'OCCUPIED'` = guest checked in.

### 2.2 Modern Alignment (Post-Migration 026):
With Migration 026, physical cleanliness is authoritatively governed by `housekeeping_status ENUM('DIRTY', 'CLEANING_IN_PROGRESS', 'CLEANED', 'INSPECTED_READY')`. 

However, existing frontend workflows still reference `READY`:
1. In [`frontend/src/pages/portal/FrontOfficePage.jsx` line 282](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/FrontOfficePage.jsx#L282):
   ```javascript
   await apartmentService.updateStatus(apartmentId, { status: 'READY' });
   ```
2. In [`frontend/src/pages/portal/FrontOfficePage.jsx` line 690](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/FrontOfficePage.jsx#L690):
   ```javascript
   const isUnitAvailable = ['AVAILABLE', 'READY'].includes(row.unit_status);
   ```
3. In [`frontend/src/pages/portal/ApartmentsPage.jsx` line 1425](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/ApartmentsPage.jsx#L1425):
   ```javascript
   {(selectedUnit.status === 'AVAILABLE' || selectedUnit.status === 'READY') && ( ... )}
   ```

### 2.3 Verdict on `READY`:
`READY` is a **valid occupancy-compatible status**. Because front desk operators can still set a unit to `'READY'` in the UI, excluding `'READY'` from the check-in allowlist would cause unexpected check-in rejections on units that staff explicitly cleared. 

However, `READY` alone is **not sufficient** for check-in; the check-in transaction still strictly and independently verifies that `apartments.housekeeping_status === 'INSPECTED_READY'`.

---

## 3. Complete Check-In Invariant

Guest check-in is legally and operationally permissible **IF AND ONLY IF** all five conditions are independently verified within an atomic, serialized transaction:

$$\boxed{
\begin{aligned}
1. \quad &\text{apartments.status} \in \{\text{'AVAILABLE'}, \text{'READY'}\} \\
2. \quad &\text{apartments.housekeeping\_status} = \text{'INSPECTED\_READY'} \\
3. \quad &\text{apartments.maintenance\_status} = \text{'OPERATIONAL'} \\
4. \quad &\text{COUNT}\Big(\text{maintenance\_requests WHERE blocking\_unit = 1 AND status} \in \mathcal{S}_{\text{blocking\_maint}}\Big) = 0 \\
5. \quad &\text{COUNT}\Big(\text{reservations WHERE status = 'CHECKED\_IN' AND stay covers today}\Big) = 0
\end{aligned}
}$$

Where:
$$\mathcal{S}_{\text{blocking\_maint}} = \{\text{'OPEN'}, \text{'ASSIGNED'}, \text{'IN\_PROGRESS'}, \text{'AWAITING\_INFORMATION'}, \text{'AWAITING\_VERIFICATION'}\}$$

---

## 4. Maintenance-to-Check-In Concurrency & Mandatory Race Analysis

### 4.1 Evaluation of the Exact Race Scenario

Consider the exact execution trace between concurrent check-in and maintenance creation:

```
THREAD 1: checkInReservation(Unit 201)           THREAD 2: createMaintenance(Unit 201, blocking=true)
-------------------------------------           ----------------------------------------------------
1. SELECT * FROM reservations FOR UPDATE
2. SELECT * FROM apartments FOR UPDATE (LOCKED!)
3. SELECT COUNT(*) FROM maintenance_requests ...
   (Result: 0 blocking tickets found)
                                                4. INSERT INTO maintenance_requests (...) [AUTOCOMMIT]
                                                   (New blocking work order #MNT-999 created!)
                                                5. UPDATE apartments SET status = "MAINTENANCE" ...
                                                   --> WAITING ON APARTMENT ROW LOCK!
6. UPDATE reservations SET status = 'CHECKED_IN'
7. UPDATE apartments SET status = 'OCCUPIED'
8. COMMIT TRANSACTION (Releases apartment lock!)
                                                9. Lock acquired! UPDATE apartments SET status = "MAINTENANCE"
                                                   --> OVERWRITES OCCUPIED UNIT TO MAINTENANCE!
```

### 4.2 Forensic Assessment of the Scenario:
1. **Does the second transaction wait for the apartment lock before creating the blocking ticket?**  
   **NO.** In the existing implementation of `createMaintenance` ([`maintenance.service.js#L211`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js#L211)), `MaintenanceRepository.create(...)` executes an autocommit `INSERT` **before** any attempt is made to update the apartment. The second transaction only blocks at line 232 (`UPDATE apartments SET status = "MAINTENANCE"`).
2. **What is the consequence of this race?**  
   Check-in completes and issues room keys to the guest. But right after commit, the blocked maintenance update executes and changes the apartment's operational status to `'MAINTENANCE'`. The guest is now sleeping in a room marked as an active maintenance site.
3. **The Missing Serialization Boundary:**  
   The defect is that `createMaintenance` treats the maintenance ticket creation and the apartment operational hold as two uncoupled, non-transactional actions. 
   **The Required Boundary:** Any operation that creates or activates a blocking maintenance restriction must acquire `SELECT id FROM apartments WHERE id = ? FOR UPDATE` **inside a transaction before inserting or updating the blocking work order**.
   Under this rule:
   - If Thread 2 starts, it locks `apartments` first. Thread 1 must wait. When Thread 1 unblocks, it sees `status = 'MAINTENANCE'` and rejects (HTTP 409).
   - If Thread 1 starts, it locks `apartments` first. Thread 2 must wait before creating the blocking ticket. When Thread 2 unblocks, it observes `status = 'OCCUPIED'`, preventing the blind overwrite of an in-house guest room.

### 4.3 Maintenance Resolution Race Assessment
In `MaintenanceService.resolveIssue` ([`maintenance.service.js#L588-L620`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js#L588-L620)):
- When the last blocking work order is resolved, the turnover handler executes separate autocommit queries without acquiring a row lock on `apartments`:
  ```javascript
  const apartment = await ApartmentsRepository.findById(record.apartment_id);
  if (apartment && apartment.status === 'MAINTENANCE') {
    // ...
    await pool.query('UPDATE apartments SET status = "CLEANING" WHERE id = ?', [record.apartment_id]);
  }
  ```
- If a guest is checking in at the same instant, `resolveIssue` can inspect `apartment.status === 'MAINTENANCE'`, pause, and then execute `UPDATE apartments SET status = "CLEANING"` **after** check-in has committed `status = "OCCUPIED"`.
- This would erroneously demote a checked-in guest's room to `'CLEANING'`.
- **Serialization Requirement:** `resolveIssue` and `cancelIssue` must lock `apartments WHERE id = ? FOR UPDATE` inside `pool.withTransaction` when evaluating and executing turnover state transitions.

---

## 5. Lock-Order Compatibility Matrix

The compatibility matrix below evaluates all relevant backend operations:

| Operation / Method | Transaction Boundary | Tables Locked (`FOR UPDATE`) | Lock Acquisition Order | Unlocked Snapshot Reads | Deadlock Risk |
|---|---|---|---|---|---|
| **Check-In (`checkInReservation`)** | `pool.withTransaction` | `reservations` $\longrightarrow$ `apartments` | Priority 1 $\longrightarrow$ Priority 2 | `maintenance_requests`, in-house stays | **Zero** |
| **Housekeeping Readiness (`updateApartmentReadiness`)** | Single transaction | `apartments` | Priority 2 | None | **Zero** |
| **Maintenance Creation (`createMaintenance`)** | `pool.withTransaction` *(remediated)* | `apartments` | Priority 2 | `properties`, `users`, `employees` | **Zero** |
| **Maintenance Start (`startWork`)** | Single update | `maintenance_requests` | Priority 3 | None (no apartment lock) | **Zero** |
| **Maintenance Resolution (`resolveIssue`)** | `pool.withTransaction` *(remediated)* | `apartments` (if clearing blocking) | Priority 2 | `maintenance_requests`, `reservations` | **Zero** |
| **Maintenance Cancellation (`cancelIssue`)** | `pool.withTransaction` *(remediated)* | `apartments` (if clearing blocking) | Priority 2 | `maintenance_requests`, `reservations` | **Zero** |
| **Reservation Acceptance (`acceptReservation`)** | `pool.withTransaction` | `reservations` $\longrightarrow$ `apartments` | Priority 1 $\longrightarrow$ Priority 2 | `users` | **Zero** |
| **Reservation Approval (`approveReservation`)** | `pool.withTransaction` | `reservations` $\longrightarrow$ `apartments` | Priority 1 $\longrightarrow$ Priority 2 | `reservations` (date overlaps) | **Zero** |

---

## 6. Minimum Required Serialization Rule

To guarantee safety across the entire system without unnecessary locking or cross-table contention:

$$\mathbf{Rule\ 1:\ Strict\ Unidirectional\ Locking}$$
$$\text{Any multi-table transaction involving reservations and apartments must lock } \mathbf{reservations} \text{ first, then } \mathbf{apartments}.$$

$$\mathbf{Rule\ 2:\ Shared\ Physical\ Asset\ Mutex}$$
$$\text{Any transaction that changes or relies upon the physical/operational availability of an apartment}$$
$$\text{must acquire the exclusive row lock on } \mathbf{apartments} \text{ (Priority 2) inside a transaction before writing records.}$$

- Check-in locks `reservations` $\longrightarrow$ `apartments`.
- Maintenance ticket creation (blocking), turnover resolution, and housekeeping readiness lock `apartments` only.
- Because no maintenance or housekeeping transaction ever touches or locks `reservations`, circular wait cycles are mathematically impossible ($1 \to 2$ cannot deadlock with $2$).

---

## 7. Deadlock and Retry Analysis

### 7.1 Source Code Verification of `executeWithDeadlockRetry`
Inspected directly from [`backend/src/modules/maintenance/maintenance.service.js#L28-L40`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js#L28-L40):

```javascript
async function executeWithDeadlockRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if ((err.code === 'ER_LOCK_DEADLOCK' || err.errno === 1213) && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 50) + 25 * attempt;
        await new Promise((resolve) => setTimeout(resolve, jitter));
        continue;
      }
      throw err;
    }
  }
}
```

### 7.2 Mechanics & Backoff Verification:
- **Maximum Retries:** Exactly 3 attempts (`maxRetries = 3`).
- **Retryable Error Codes:** Specifically intercepts `err.code === 'ER_LOCK_DEADLOCK'` and MariaDB/MySQL errno `1213`.
- **Backoff Mechanics:** **Linear backoff with additive uniform jitter**, computed as:
  $$\text{Delay}(\text{attempt}) = 25 \times \text{attempt} + \text{random}(0, 49) \text{ ms}$$
  - Attempt 1: 25–74 ms
  - Attempt 2: 50–99 ms
  - Attempt 3: Exhausted; rethrows deadlock error to caller.
- **[Authoritative Confirmation]** This is linear backoff with uniform jitter, **not** exponential backoff.
- The check-in remediation wraps its transaction in this exact helper.

---

## 8. Test Cases for Both Successful and Rejected Operations

The verification test suite [`backend/tests/checkInReadinessSafety.test.js`](file:///c:/xampp/htdocs/BFA/backend/tests/checkInReadinessSafety.test.js) will execute the following 18 required scenarios against `bfa_apartments_test_db`:

### 8.1 Successful Check-In Tests
| Test ID | Category | Initial Fixture State | Expected Result |
|---|---|---|---|
| `TC-01` | Normal Path (`AVAILABLE`) | Unit `status = 'AVAILABLE'`, `INSPECTED_READY`, `OPERATIONAL`; `CONFIRMED` res | **HTTP 200**: Res `CHECKED_IN`, Apt `OCCUPIED`, Audit & Activity recorded |
| `TC-01b`| Normal Path (`READY`) | Unit `status = 'READY'`, `INSPECTED_READY`, `OPERATIONAL`; `CONFIRMED` res | **HTTP 200**: Res `CHECKED_IN`, Apt `OCCUPIED`, Audit & Activity recorded |

### 8.2 Housekeeping Rejection Tests
| Test ID | Category | Initial Fixture State | Expected Result |
|---|---|---|---|
| `TC-02` | Housekeeping Reject | Unit `housekeeping_status = 'DIRTY'`, `AVAILABLE`, `OPERATIONAL` | **HTTP 422**: `APARTMENT_NOT_READY_HOUSEKEEPING`, DB unchanged |
| `TC-03` | Housekeeping Reject | Unit `housekeeping_status = 'CLEANING_IN_PROGRESS'`, `AVAILABLE`, `OPERATIONAL` | **HTTP 422**: `APARTMENT_NOT_READY_HOUSEKEEPING`, DB unchanged |
| `TC-04` | Housekeeping Reject | Unit `housekeeping_status = 'CLEANED'`, `AVAILABLE`, `OPERATIONAL` | **HTTP 422**: `APARTMENT_NOT_READY_HOUSEKEEPING`, DB unchanged |

### 8.3 Maintenance Rejection Tests
| Test ID | Category | Initial Fixture State | Expected Result |
|---|---|---|---|
| `TC-05` | Maintenance Reject | Unit `maintenance_status = 'INSPECTION_REQUIRED'`, `INSPECTED_READY` | **HTTP 409**: `APARTMENT_NOT_READY_MAINTENANCE`, DB unchanged |
| `TC-06` | Maintenance Reject | Unit `maintenance_status = 'UNDER_REPAIR'`, `INSPECTED_READY` | **HTTP 409**: `APARTMENT_NOT_READY_MAINTENANCE`, DB unchanged |
| `TC-07` | Maintenance Reject | Unit `maintenance_status = 'OUT_OF_ORDER'`, `INSPECTED_READY` | **HTTP 409**: `APARTMENT_NOT_READY_MAINTENANCE`, DB unchanged |
| `TC-08` | Maintenance Reject | Unit `OPERATIONAL`, `INSPECTED_READY`, but open blocking ticket exists | **HTTP 409**: `APARTMENT_NOT_READY_MAINTENANCE`, DB unchanged |

### 8.4 Occupancy Allowlist Rejection Tests
| Test ID | Category | Initial Fixture State | Expected Result |
|---|---|---|---|
| `TC-09` | Occupancy Reject | Unit `status = 'OCCUPIED'`; `INSPECTED_READY`, `OPERATIONAL` | **HTTP 409**: `APARTMENT_ALREADY_OCCUPIED`, DB unchanged |
| `TC-10` | Occupancy Reject | Unit `status = 'MAINTENANCE'` | **HTTP 409**: `APARTMENT_NOT_READY_MAINTENANCE`, DB unchanged |
| `TC-10b`| Occupancy Reject | Unit `status = 'BLOCKED'` | **HTTP 409**: `APARTMENT_NOT_READY_MAINTENANCE`, DB unchanged |
| `TC-10c`| Occupancy Reject | Unit `status = 'OUT_OF_SERVICE'` | **HTTP 409**: `APARTMENT_NOT_READY_MAINTENANCE`, DB unchanged |
| `TC-10d`| Occupancy Reject | Unit `status = 'DIRTY'` or `'CLEANING'` | **HTTP 422**: `APARTMENT_OCCUPANCY_STATUS_INVALID`, DB unchanged |

### 8.5 Status Guard, Concurrency & Security Tests
| Test ID | Category | Initial Fixture State | Expected Result |
|---|---|---|---|
| `TC-11` | Status Guard | Reservation in `PENDING_REVIEW` status | **HTTP 422**: `VALIDATION_ERROR`, DB unchanged |
| `TC-12` | Status Guard | Reservation in `CLAIMED` status | **HTTP 422**: `VALIDATION_ERROR`, DB unchanged |
| `TC-13` | Status Guard | Reservation in `COMPLETED` status | **HTTP 422**: `VALIDATION_ERROR`, DB unchanged |
| `TC-14` | Concurrency Race | 2 concurrent check-ins for the same reservation | Exactly 1 succeeds (HTTP 200); 2nd rejects (HTTP 422) |
| `TC-15` | Concurrency Race | 2 concurrent check-ins for different reservations on same unit | Exactly 1 succeeds (HTTP 200); 2nd rejects (HTTP 409) |
| `TC-16` | Concurrency Race | Check-in concurrent with housekeeping setting `DIRTY` | Serialized: if DIRTY commits first, check-in fails (422) |
| `TC-17` | Concurrency Race | Check-in concurrent with blocking maintenance creation | Serialized: if ticket commits first, check-in fails (409) |
| `TC-18` | Authorization Scope | Receptionist assigned to Property #1 checks in reservation for Property #2 | **HTTP 403**: `FORBIDDEN`, DB unchanged |

---

## 9. Remaining Implementation Dependencies & Risks

1. **Companion Endpoint Dependency (`reassignReservation`):**  
   The front-office route `POST /api/v1/front-office/reservations/:id/reassign` should be deployed alongside check-in remediation to support front desk shift handovers.
2. **Housekeeping Status Filter:**  
   `ApartmentsRepository.findAll` should support the `housekeepingStatus` query parameter so the receptionist queue only displays units with `housekeeping_status = 'INSPECTED_READY'`.
3. **Frontend UI Handling:**  
   Frontend `FrontOfficePage.jsx` must present HTTP 422 (`APARTMENT_NOT_READY_HOUSEKEEPING`) and HTTP 409 (`APARTMENT_NOT_READY_MAINTENANCE`) as distinct, actionable alert banners rather than generic network errors.

---

## 10. Git Preservation Evidence

```
====================================================================================================
                                GIT ENVIRONMENT PRESERVATION AUDIT
====================================================================================================
Parameter                  Initial Discovery Baseline       Current Validated State         Status
----------------------------------------------------------------------------------------------------
Branch                     master                           master                          IDENTICAL
HEAD Commit                3075411a754fcb7801b4b5b0...      3075411a754fcb7801b4b5b0...     IDENTICAL
Staged Files Count         126 files                        126 files                       IDENTICAL
Unstaged Modified Files    56 files                         56 files                        IDENTICAL
Untracked Files Count      99 files                         101 files                       EXPECTED (+2)
====================================================================================================
```

*Note on Untracked Count:* Exactly two untracked files were added: the authorized discovery report and specification validation deliverables. All pre-existing staged files (126), modified files (56), and untracked files remain 100% preserved.

---

## 11. Production & Test Database State

| Database Instance | Port | Engine | Applied Migrations | Latest Applied Migration | Migration 031 Status |
|---|---|---|---|---|---|
| **Production (`bfa_apartments_db`)** | 3306 | MariaDB 10.4.32 | Exactly **30** | `030_kiosk_credential_security_and_geofence_review.sql` | **UNAPPLIED / PENDING** |
| **Test (`bfa_apartments_test_db`)** | 3306 | MariaDB 10.4.32 | Exactly **31** | `031_maintenance_evidence_and_dispatch_verification.sql` | Applied & Verified |

**Schema Independence Guarantee:**  
Both production and test databases already possess `housekeeping_status`, `maintenance_status`, and index `idx_apt_readiness` from Migration 026. **Zero schema migrations are required** for this remediation.

---

## 12. Final Implementation Readiness Verdict

$$\mathbf{READY\ FOR\ SEPARATE\ IMPLEMENTATION\ AUTHORIZATION}$$

### Verdict Rationale:
1. **Explicit Allowlist Established:** Prohibits blacklists; defines `['AVAILABLE', 'READY']` based on verified frontend and schema behavior.
2. **Missing Serialization Boundary Isolated:** Proves that blocking maintenance operations and resolution turnover must serialize on `apartments FOR UPDATE` before writing records.
3. **Global Lock Hierarchy Proven:** The unidirectional `reservations` $\longrightarrow$ `apartments` locking sequence guarantees zero deadlock risk.
4. **Retry Mechanics Verified:** Linear backoff with additive jitter confirmed from source.
5. **Zero Migrations Required:** All tables and columns are already live in production.
6. **Execution Halted:** Work is stopped. Implementation awaits explicit user authorization.
