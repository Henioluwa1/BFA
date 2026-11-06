# BFA WORKSPACE C — STAGE 2.6 FINAL AUDIT CORRECTION: MAINTENANCE BLOCKING SEMANTICS & COMPLETE LIFECYCLE MATRIX

**Project:** BFA Apartments Management System  
**Workspace:** C — Backend, Database, Authorization and API Security  
**Milestone:** Stage 2.6 Backend Prerequisite Assessment & Concurrency Hardening  
**Document Type:** Final Authoritative Audit Correction & Architecture Specification  
**Execution Mode:** STRICTLY READ-ONLY (Forensic Audit & Specification Only)  
**Date:** 2026-11-04  
**Authoritative Sign-Off:** Lead Systems Architect & Systems Security Engineering  
**Artifact Path:** `C:\Users\DELL\.gemini\antigravity\brain\88bff36c-819d-46a9-8801-74cb3602a6e8\BFA_WORKSPACE_C_STAGE_2_6_FINAL_CONCURRENCY_AUDIT_CORRECTION.md`  
**Repository Path:** `c:\xampp\htdocs\BFA\BFA_WORKSPACE_C_STAGE_2_6_FINAL_CONCURRENCY_AUDIT_CORRECTION.md`  

---

## 1. Corrected Maintenance Blocking Predicate & Affected Operations

### 1.1 The Actual Production Implementation
In [`backend/src/modules/maintenance/maintenance.service.js` line 133](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js#L133), the ticket creation handler defines:

```javascript
const isBlocking = data.blocking_unit === true || data.blocking_unit === 1 || priority === 'CRITICAL';
```

At creation time, if `priority === 'CRITICAL'`, `isBlocking` evaluates to `true`, and `blocking_unit` is written as `1` in the database (`MaintenanceRepository.create` line 162).

### 1.2 The Latent Vulnerability in Query Predicates
Existing query checks across the codebase currently check **only** `blocking_unit = 1`:
- `apartments.service.js` line 248: `WHERE apartment_id = ? AND status IN ("OPEN", "IN_PROGRESS") AND blocking_unit = 1`
- `maintenance.service.js` line 582: `WHERE apartment_id = ? AND id != ? AND status IN ("OPEN", "IN_PROGRESS") AND blocking_unit = 1`
- `maintenance.service.js` line 674: `WHERE apartment_id = ? AND id != ? AND status IN ("OPEN", "IN_PROGRESS") AND blocking_unit = 1`
- `maintenance.service.js` line 1140: `WHERE apartment_id = ? AND id != ? AND status IN ("OPEN", "IN_PROGRESS") AND blocking_unit = 1`

**The Vulnerability:**  
If a maintenance record has `priority = 'CRITICAL'` but `blocking_unit = 0` (e.g. from seed data, direct SQL insertion, legacy record, or external query), **the check-in and turnover queries will fail to detect it as blocking!**

### 1.3 The Corrected Authoritative Maintenance Blocking Predicate
All queries that evaluate whether an active maintenance request restricts an apartment MUST use the full, explicit predicate:

$$\boxed{
\mathcal{P}_{\text{blocking\_maintenance}} \iff \Big(\text{status} \in \mathcal{S}_{\text{active\_maint}}\Big) \land \Big(\text{blocking\_unit} = 1 \;\lor\; \text{priority} = \text{'CRITICAL'}\Big)
}$$

Where:
$$\mathcal{S}_{\text{active\_maint}} = \{\text{'OPEN'}, \text{'ASSIGNED'}, \text{'IN\_PROGRESS'}, \text{'AWAITING\_INFORMATION'}, \text{'AWAITING\_VERIFICATION'}\}$$

### 1.4 Detailed Operation-by-Operation Audit of Maintenance Lifecycle

| Operation / Method | Can make ticket blocking? | Can stop ticket from blocking? | Acquires Apt Row Lock? | Lock before modifying blocking state? | Updates Apt status? | Atomic Transaction? | Status & Required Action |
|---|---|---|---|---|---|---|---|
| **`createMaintenance`** | **YES** (`blocking_unit=1` or `CRITICAL`) | No | **NO** in existing code | **NO** (inserts before lock) | Yes (`status = 'MAINTENANCE'`) | **NO** (autocommit insert + separate update) | **DEFECT:** Must wrap in `pool.withTransaction` and acquire `apartments FOR UPDATE` before insert. |
| **`assignStaff`** | No | No | No | N/A | No | Yes (locks ticket + users) | **COMPLIANT:** No apartment mutation. |
| **`startWork`** | No | No | No | N/A | No | No (single update) | **COMPLIANT:** Ticket remains active; no apartment mutation. |
| **`resolveIssue`** | No | **YES** (transitions to `RESOLVED`) | **NO** in existing code | **NO** | Yes (`status = 'CLEANING'`) | **NO** (autocommit update + separate read/update) | **DEFECT:** Must acquire `apartments FOR UPDATE` in transaction before setting `CLEANING`. |
| **`cancelIssue`** | No | **YES** (transitions to `CANCELLED`) | **NO** in existing code | **NO** | Yes (`status = 'CLEANING'`) | **NO** | **DEFECT:** Must acquire `apartments FOR UPDATE` in transaction before setting `CLEANING`. |
| **`deleteMaintenance`** | No | **YES** (deletes ticket) | **NO** in existing code | **NO** | Yes (if last ticket deleted) | **NO** | **DEFECT:** Must acquire `apartments FOR UPDATE` before deleting. |
| **Reopening / Priority Update** | N/A | N/A | N/A | N/A | N/A | N/A | **N/A:** No route or service method exists for updating priority or reopening tickets. |

---

## 2. Complete Reservation Lifecycle Matrix

Every operation in the reservation lifecycle was inspected across route guards, controller actions, service implementations, and SQL statements:

| Operation / Method | Can create/modify active stay? | Transaction Boundary | Reservation Row Lock | Apartment Row Lock | Required Implementation Action |
|---|---|---|---|---|---|
| **`createReservation`** | **YES** (creates future stay) | `pool.withTransaction` | None (new row insert) | **YES** (`apartments FOR UPDATE` at L175) | **NO MODIFICATION NEEDED:** Already enforces apartment lock and availability check. |
| **`approveReservation`** | **YES** (confirms allocation) | `pool.withTransaction` | **YES** (`reservations FOR UPDATE` at L1134) | **YES** (`apartments FOR UPDATE` at L1142) | **NO MODIFICATION NEEDED:** Already locks reservation then apartment. |
| **`acceptReservation`** | **YES** (assigns & holds) | `pool.withTransaction` | **YES** (`reservations FOR UPDATE` at L888) | **YES** (`apartments FOR UPDATE` at L907) | **NO MODIFICATION NEEDED:** Already locks reservation then apartment. |
| **`confirmReservation`** | **YES** (confirms pending) | **NO** (autocommit pool queries) | **NO** | **NO** | **HARDEN:** Wrap in transaction; lock reservation then apartment `FOR UPDATE`; verify availability. |
| **`updateReservation`** | **YES** (unit transfer or date change) | `pool.withTransaction` | **NO** (`findById` unlocked) | **NO** (locks reservations rows, but NOT apartments) | **HARDEN:** Lock reservation `FOR UPDATE` then ascending apartments (`min` then `max`). |
| **`checkInReservation`** | **YES** (activates in-house stay) | `pool.withTransaction` | **NO** (`findById` unlocked) | **NO** (blind update only) | **REMEDIATE:** Enforce `reservations FOR UPDATE` $\to$ `apartments FOR UPDATE` and 5-part invariant. |
| **`checkOutReservation`** | No (terminates stay) | `pool.withTransaction` | **NO** (`findById` unlocked) | **NO** (updates `status = 'DIRTY'`) | **SAFE:** Transitions unit to `DIRTY` and stay to `COMPLETED`; cannot create overlapping stay. |
| **`cancelReservation`** | No (releases allocation) | **NO** (autocommit pool queries) | **NO** | **NO** | **SAFE:** Cannot cancel `CHECKED_IN` stay; only releases future booking. |
| **`noShowReservation`** | No (releases allocation) | **NO** (autocommit pool queries) | **NO** | **NO** | **SAFE:** Releases `CONFIRMED` allocation without check-in. |
| **`declineReservation`** | No (releases allocation) | `pool.withTransaction` | **YES** (`reservations FOR UPDATE`) | None | **SAFE:** Releases `PENDING` booking. |
| **Room Change Request** | No (submits request only) | **NO** (autocommit query) | **NO** | **NO** | **SAFE:** Sets `room_change_status = 'REQUESTED'`; does not mutate stay or unit allocation. |
| **`quickCheckIn`** | **YES** | Delegates | Delegates | Delegates | Inherits `checkInReservation` remediation. |
| **`quickCheckOut`** | No | Delegates | Delegates | Delegates | Inherits `checkOutReservation`. |
| **`quickNoShow`** | No | Delegates | Delegates | Delegates | Inherits `noShowReservation`. |
| **Automation `reservations.create`** | **YES** | Delegates | Delegates | Delegates | Delegates directly to `createReservation` (compliant). |

---

## 3. Multi-Apartment Transfers & Ascending-ID Serialization

### 3.1 Source and Destination Lock Requirements
In [`ReservationsService.updateReservation`](file:///c:/xampp/htdocs/BFA/backend/src/modules/reservations/reservations.service.js#L466), a unit transfer changes `apartment_id` from Source Apartment ($A$) to Destination Apartment ($B$).

To guarantee that the transfer cannot create an overlapping stay, cannot race with check-in, and cannot deadlock:

1. **Reservation Lock:** Lock the reservation row first:
   ```sql
   SELECT * FROM reservations WHERE id = ? FOR UPDATE;
   ```
2. **Dual-Apartment Row Locks in Deterministic Order:**  
   Sort the two apartment IDs numerically:
   $$\text{firstAptId} = \min(A, B), \quad \text{secondAptId} = \max(A, B)$$
   Acquire the locks sequentially:
   ```sql
   SELECT id, status, housekeeping_status, maintenance_status FROM apartments WHERE id = firstAptId FOR UPDATE;
   SELECT id, status, housekeeping_status, maintenance_status FROM apartments WHERE id = secondAptId FOR UPDATE;
   ```
3. **Availability Validation Under Lock:**  
   While holding all three locks, verify that Destination Apartment ($B$):
   - Has operational status in allowlist `['AVAILABLE', 'READY']`.
   - Has `maintenance_status = 'OPERATIONAL'`.
   - Has zero active blocking maintenance requests:
     `SELECT id FROM maintenance_requests WHERE apartment_id = B AND status IN (...) AND (blocking_unit = 1 OR priority = 'CRITICAL') LIMIT 1`.
   - Has zero conflicting active stays:
     `SELECT id FROM reservations WHERE apartment_id = B AND id != ? AND status IN ('CONFIRMED', 'CHECKED_IN') AND check_in_date < ? AND check_out_date > ? LIMIT 1`.
4. **Atomic Assignment:**  
   Update `reservations SET apartment_id = B` and commit.

### 3.2 Bidirectional Transfer Race Analysis ($A \to B$ vs $B \to A$)
- **Scenario:** Transaction 1 transfers Reservation 1 from Unit 101 to Unit 202. Transaction 2 transfers Reservation 2 from Unit 202 to Unit 101.
- **Without Ascending Order:** Tx 1 locks 101 then requests 202; Tx 2 locks 202 then requests 101 $\implies$ **CIRCULAR DEADLOCK**.
- **With Ascending Order:**
  - Both transactions compute $\min(101, 202) = 101$ and $\max(101, 202) = 202$.
  - Whichever transaction executes step 2 first acquires the row lock on Unit 101.
  - The second transaction requests Unit 101 and **blocks cleanly**.
  - The first transaction acquires Unit 202, validates, commits, and releases both locks.
  - The second transaction unblocks, acquires 101, acquires 202, and completes.
  - **Result: Zero deadlock, 100% deterministic serialization.**

---

## 4. Evaluation of All Eight Concurrency Scenarios

### Scenario A: Blocking maintenance creation begins while check-in is waiting for the apartment lock
- **Existing Protection:** Partial. Check-in holds reservation lock, but is waiting for apartment lock.
- **Existing Vulnerability:** `createMaintenance` does not acquire the apartment lock before inserting into `maintenance_requests`. It executes an autocommit `INSERT` first, then queues for the apartment lock.
- **Required Serialization Boundary:** `createMaintenance` must acquire `apartments WHERE id = ? FOR UPDATE` inside `pool.withTransaction` **before** executing `INSERT INTO maintenance_requests`.
- **Expected Outcome:** One transaction wins the apartment lock. If maintenance wins, it commits `status = 'MAINTENANCE'`; check-in then acquires lock, observes `MAINTENANCE`, and rejects with HTTP 409. If check-in wins, check-in commits `OCCUPIED`; maintenance then unblocks and attaches to occupied room.
- **Testing Required:** **YES.** Implementation changes and automated concurrency test required.

### Scenario B: Blocking maintenance creation begins after check-in has acquired the apartment lock but before it commits
- **Existing Protection:** None against the insert.
- **Existing Vulnerability (CRITICAL GAP):** `createMaintenance` executes autocommit `INSERT INTO maintenance_requests`, inserting the ticket while check-in is running. It then blocks on `UPDATE apartments`. Check-in commits `status = 'OCCUPIED'`. `createMaintenance` unblocks and overwrites `apartments.status = 'MAINTENANCE'`, corrupting the checked-in guest's room.
- **Required Serialization Boundary:** `createMaintenance` must acquire `apartments WHERE id = ? FOR UPDATE` inside `pool.withTransaction` **prior to inserting the maintenance request**.
- **Expected Outcome:** `createMaintenance` blocks at step 1 before inserting. Check-in completes safely. `createMaintenance` unblocks and sees `status = 'OCCUPIED'`.
- **Testing Required:** **YES.** Implementation changes and automated concurrency test required.

### Scenario C: Reservation approval begins while check-in is checking for overlapping stays
- **Existing Protection:** **PROTECTED.** `approveReservation` already acquires `apartments WHERE id = ? FOR UPDATE` at line 1142.
- **Existing Vulnerability:** Check-in does not currently acquire the apartment lock.
- **Required Serialization Boundary:** Check-in acquires `apartments WHERE id = ? FOR UPDATE` (part of check-in remediation).
- **Expected Outcome:** `approveReservation` blocks on line 1142 until check-in commits. Once check-in commits, `approveReservation` detects the in-house stay and throws HTTP 409 `ConflictError`.
- **Testing Required:** **YES.** Concurrency test required.

### Scenario D: A reservation is transferred from apartment A to apartment B while check-in is occurring on either apartment
- **Existing Protection:** None on apartment rows.
- **Existing Vulnerability:** `updateReservation` does not lock `apartments` for either A or B (`FOR UPDATE` is absent). Transfer can commit while check-in on B is committing, double-booking Unit B.
- **Required Serialization Boundary:** `updateReservation` locks reservation then ascending apartments (`min(A,B)` then `max(A,B)`).
- **Expected Outcome:** Transfer blocks on Unit B's lock. Check-in commits `OCCUPIED`. Transfer unblocks, observes Unit B is `OCCUPIED`, and rejects with HTTP 409.
- **Testing Required:** **YES.** Implementation changes to `updateReservation` and concurrency test required.

### Scenario E: A maintenance ticket changes from non-blocking to blocking while check-in is running, including a CRITICAL priority transition
- **Existing Protection:** No endpoint exists to mutate `blocking_unit` or `priority` on existing tickets.
- **Existing Vulnerability:** If a ticket was created with `priority = 'CRITICAL'` and `blocking_unit = 0`, existing queries checking only `blocking_unit = 1` would miss it.
- **Required Serialization Boundary:** Check-in query must explicitly check `(blocking_unit = 1 OR priority = 'CRITICAL')`.
- **Expected Outcome:** Check-in reliably detects and rejects on CRITICAL tickets even if `blocking_unit = 0`.
- **Testing Required:** **YES.** Query predicate hardening in check-in and test coverage required.

### Scenario F: Maintenance resolution or cancellation runs while a guest is checking into the same apartment
- **Existing Protection:** None on apartment rows.
- **Existing Vulnerability:** `resolveIssue` and `cancelIssue` execute autocommit updates without wrapping turnover logic in a transaction or locking `apartments`. If check-in commits `status = 'OCCUPIED'`, an in-flight `resolveIssue` can execute `UPDATE apartments SET status = "CLEANING"`, demoting the in-house room.
- **Required Serialization Boundary:** `resolveIssue` and `cancelIssue` must acquire `apartments WHERE id = ? FOR UPDATE` inside `pool.withTransaction` before evaluating turnover.
- **Expected Outcome:** `resolveIssue` blocks on apartment lock. Check-in commits `OCCUPIED`. `resolveIssue` unblocks, reads `status = 'OCCUPIED'`, and safely retains `OCCUPIED`.
- **Testing Required:** **YES.** Implementation changes and automated concurrency test required.

### Scenario G: Two receptionists attempt to check in the same reservation concurrently
- **Existing Protection:** None in current code.
- **Existing Vulnerability:** `ReservationsRepository.findById(id)` runs unlocked outside the transaction; both see `CONFIRMED` and proceed to update.
- **Required Serialization Boundary:** `checkInReservation` acquires `SELECT * FROM reservations WHERE id = ? FOR UPDATE` inside `pool.withTransaction`.
- **Expected Outcome:** Thread 1 acquires reservation lock; Thread 2 blocks. Thread 1 transitions reservation to `CHECKED_IN` and commits. Thread 2 unblocks, reads `reservation.status === 'CHECKED_IN'`, and rejects with HTTP 422 (`Only CONFIRMED reservations can be checked in`).
- **Testing Required:** **YES.** Implementation changes and automated concurrency test required.

### Scenario H: Two different reservations attempt to check into the same apartment concurrently
- **Existing Protection:** None in current code.
- **Existing Vulnerability:** Neither thread locks `apartments`. Both update `status = "OCCUPIED"`. Both guests are checked in to the same unit.
- **Required Serialization Boundary:** Both transactions must acquire `apartments WHERE id = ? FOR UPDATE` (Priority 2).
- **Expected Outcome:** Thread 1 acquires apartment lock; Thread 2 blocks. Thread 1 verifies readiness, updates `apartments.status = 'OCCUPIED'`, and commits. Thread 2 unblocks, reads `apartment.status = 'OCCUPIED'`, and rejects with HTTP 409 (`APARTMENT_ALREADY_OCCUPIED`).
- **Testing Required:** **YES.** Implementation changes and automated concurrency test required.

---

## 5. Check-In Invariant & Status Semantics

### 5.1 The 5-Part Invariant Formulation
$$\boxed{
\begin{aligned}
1. \quad &\text{apartments.status} \in \{\text{'AVAILABLE'}, \text{'READY'}\} \\
2. \quad &\text{apartments.housekeeping\_status} = \text{'INSPECTED\_READY'} \\
3. \quad &\text{apartments.maintenance\_status} = \text{'OPERATIONAL'} \\
4. \quad &\text{COUNT}\Big(\text{active maintenance with } (\text{blocking\_unit} = 1 \lor \text{priority} = \text{'CRITICAL'})\Big) = 0 \\
5. \quad &\text{COUNT}\Big(\text{reservations with status} = \text{'CHECKED\_IN'} \land \text{stay covers today}\Big) = 0
\end{aligned}
}$$

### 5.2 Precise Reservation Status Distinctions:
- **Future `CONFIRMED` Reservations:** Permitted for future dates. If another reservation is `CONFIRMED` for today, check-in of the first reservation mutates `apartments.status = 'OCCUPIED'`; any subsequent check-in attempt will fail on condition 1 (`status` not in allowlist) and condition 5.
- **Current In-House `CHECKED_IN` Stays:** Evaluated via `status = 'CHECKED_IN' AND check_in_date <= today AND check_out_date > today`. Detects in-house occupants even if `apartments.status` was corrupted.
- **Current Reservation Being Checked In:** Excluded via `id != reservationId`.
- **Same-Day Turnover:** Evaluated via half-open interval $[s, e)$. If Guest A checked out today ($e_1 = \text{today}$), $e_1 > \text{today} \iff \text{false}$, correctly excluding departing guests from blocking today's check-in.
- **Terminal Statuses:** `CANCELLED`, `DECLINED`, `NO_SHOW`, `COMPLETED` have status not in `('CONFIRMED', 'CHECKED_IN')` and are automatically excluded.

---

## 6. Deadlock Retry Assessment

### 6.1 Inspection of `pool.js` and `executeWithDeadlockRetry`
- `backend/src/db/pool.js` contains standard `withTransaction(callback)` with `connection.beginTransaction()`, `commit()`, and `rollback()`.
- `executeWithDeadlockRetry` in `backend/src/modules/maintenance/maintenance.service.js` lines 28–40 implements linear backoff with additive jitter (`25 * attempt + random(0..49)ms`, max 3 retries, catching `ER_LOCK_DEADLOCK` and MariaDB errno 1213).

### 6.2 Architectural Evaluation of Refactoring:
1. **Is relocating or exporting `executeWithDeadlockRetry` to `pool.js` strictly necessary?**  
   **NO.** Refactoring `pool.js` risks introducing regressions to unrelated modules (accounting, chat, expenses) that use `withTransaction`.
2. **Safe Transaction Retry Rules:**
   - A retry helper can safely retry a transaction **IF AND ONLY IF** all side effects (audit logging, email/SMS notifications, file writes, employee activity points) are executed **POST-COMMIT, OUTSIDE the transactional retry block**.
   - If an audit log or notification is dispatched inside the retried callback, a transient deadlock on attempt 1 would cause duplicate audit records or duplicate notifications on attempt 2!
3. **Recommendation:**
   - Keep `pool.js` untouched.
   - Define a clean, local or dedicated helper in `backend/src/core/utils/transactionRetry.js` (or inline in `reservations.service.js`).
   - Strictly structure `checkInReservation` so that `AuditService.record` and `EmployeeActivitiesService.recordUserActivity` execute **after** `withTransaction` has successfully committed.

---

## 7. Exact Bounded Implementation Scope

The remediation scope is strictly bounded to the following six functional units:

### Group A: Check-In Invariant Enforcement
- **File:** `backend/src/modules/reservations/reservations.service.js`
- **Function:** `checkInReservation(id, req)`
- **Safety Property:** Enforces `reservations (id) FOR UPDATE` $\to$ `apartments (id) FOR UPDATE`; validates 5-part invariant; executes audit/activity logging post-commit.

### Group B: Reservation Confirmation & Allocation Serialization
- **File:** `backend/src/modules/reservations/reservations.service.js`
- **Function:** `confirmReservation(id, req)`
- **Safety Property:** Enforces `pool.withTransaction`; acquires `reservations (id) FOR UPDATE` $\to$ `apartments (id) FOR UPDATE`; validates unit operational status and availability before confirming.

### Group C: Apartment Transfer & Date Modification
- **File:** `backend/src/modules/reservations/reservations.service.js`
- **Function:** `updateReservation(id, data, req)`
- **Safety Property:** During unit transfer or date change, acquires `reservations (id) FOR UPDATE` $\to$ `apartments (min(A,B)) FOR UPDATE` $\to$ `apartments (max(A,B)) FOR UPDATE`; validates destination unit availability under lock.

### Group D: Maintenance Blocking-State Serialization
- **File:** `backend/src/modules/maintenance/maintenance.service.js`
- **Function:** `createMaintenance(data, user, req)`
- **Safety Property:** When `isBlocking = true` and `apartment_id` is supplied, wraps creation in `pool.withTransaction` and acquires `apartments (id) FOR UPDATE` **before** executing `INSERT INTO maintenance_requests`.

### Group E: Maintenance Turnover Serialization
- **File:** `backend/src/modules/maintenance/maintenance.service.js`
- **Functions:** `resolveIssue(id, data, user, req)`, `cancelIssue(id, data, user, req)`, `deleteMaintenance(id, user, req)`
- **Safety Property:** Wraps turnover logic in `pool.withTransaction`; acquires `apartments (id) FOR UPDATE` before updating status to `CLEANING`.

### Group F: Shared Retry Pattern (Zero Impact on `pool.js`)
- Reuses the linear-backoff retry pattern for `checkInReservation` without modifying `pool.js`.

---

## 8. Required Automated Concurrency Tests

Upon implementation authorization, the test suite `backend/tests/checkInReadinessSafety.test.js` will verify:
1. `TC-01`: Normal check-in with `AVAILABLE` and `READY`.
2. `TC-02`–`TC-04`: Housekeeping rejections (`DIRTY`, `CLEANING_IN_PROGRESS`, `CLEANED`).
3. `TC-05`–`TC-08`: Maintenance rejections (`UNDER_REPAIR`, `INSPECTION_REQUIRED`, `OUT_OF_ORDER`, and active ticket with `priority = 'CRITICAL'` even if `blocking_unit = 0`).
4. `TC-09`–`TC-10`: Occupancy rejections (`OCCUPIED`, `MAINTENANCE`, `BLOCKED`, `OUT_OF_SERVICE`).
5. `TC-11`–`TC-13`: Status guard rejections (`PENDING_REVIEW`, `CLAIMED`, `COMPLETED`).
6. `TC-14`–`TC-18`: Concurrency race tests corresponding to Scenarios A, B, C, D, F, G, H.

---

## 9. Preservation Evidence

```
====================================================================================================
                                GIT ENVIRONMENT PRESERVATION AUDIT
====================================================================================================
Parameter                  Initial Discovery Baseline       Current Audit State             Status
----------------------------------------------------------------------------------------------------
Branch                     master                           master                          IDENTICAL
HEAD Commit                3075411a754fcb7801b4b5b0...      3075411a754fcb7801b4b5b0...     IDENTICAL
Staged Files Count         126 files                        126 files                       IDENTICAL
Unstaged Modified Files    56 files                         56 files                        IDENTICAL
Untracked Files Count      99 files                         104 files                       EXPECTED (+5)
====================================================================================================
```

*Note on Untracked Files:* Exactly five untracked documentation files exist, representing authorized discovery and audit deliverables. Zero application source files, configuration files, test files, or migrations were modified or staged.

### Database States:
- **Production (`bfa_apartments_db`):** Exactly **30** migrations applied. Migration 031 is **unapplied / pending**.
- **Test (`bfa_apartments_test_db`):** Exactly **31** migrations applied.
- All required columns and composite indexes exist live via Migration 026. Zero schema changes required.

---

## 10. Unresolved Issues & Final Verdict

$$\mathbf{READY\ FOR\ IMPLEMENTATION\ AUTHORIZATION}$$

### Confirmation of Resolution:
1. **Maintenance Blocking Predicate:** Fully resolved to `(blocking_unit = 1 OR priority = 'CRITICAL')`.
2. **Lifecycle Gaps:** Fully bounded to Groups A, B, C, D, E.
3. **Deadlock Immunity:** Ascending dual-apartment locking mathematically eliminates transfer deadlocks.
4. **Execution Halted:** Work is stopped. Implementation awaits explicit user authorization.
