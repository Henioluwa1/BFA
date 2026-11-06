# BFA WORKSPACE C — STAGE 2.6B STEP 1
# INDEPENDENT SECURITY AUDIT REPORT
## Operations Manager Property-Scope Security Remediation

**Audit Target:** Operations Manager Property-Scope Security Remediation  
**Workspace:** C — Backend / Security / API  
**Audit Mode:** STRICTLY READ-ONLY (No code, test, schema, or configuration modifications)  
**Implementation Report Audited:** `BFA_STAGE_2_6B_STEP_1_SECURITY_REMEDIATION_REPORT.md`  
**Date:** November 5, 2026  
**Git Branch / Commit:** `master` / `3075411a754fcb7801b4b5b023168df2d6d4f4f8`  
**Test Isolation Target:** `bfa_apartments_test_db`  
**Production Database:** `bfa_apartments_db` (30 migrations, 0 mutations)

---

## 1. Executive Verdict

### Official Verdict:
`CONDITIONALLY ACCEPTED — SPECIFIC FINDINGS REQUIRE RESOLUTION`

### Summary of Independent Determination:
The Stage 2.6B Step 1 remediation successfully eliminated the primary fail-open property-scoping vulnerability for the canonical `OPERATIONS_MANAGER` role across all collection endpoints (`ReservationsRepository.findAll`), operational views (`getArrivals`, `getDepartures`, `getCurrentGuests`, `getPendingBookings`, `getLiveOperationalFeed`, `getOperationalStats`), and primary mutation actions (`create`, `update`, `confirm`, `cancel`, `check-in`, `check-out`, `no-show`, `claim`, `accept`, `approve`, `decline`). All 14 tests in the dedicated security suite passed with 100% success.

However, an exhaustive trace of all individual-record endpoints identified two specific secondary authorization defects within the reservation and front-office modules:
1. **DEF-SEC-2.6B-01 (Medium):** `GET /api/v1/reservations/:id/history` (`ReservationsController.getHistory`) calls `ReservationsRepository.getStatusHistory` directly without verifying `validatePropertyScope(req.user, reservation.property_id)`. An authenticated Operations Manager or Receptionist assigned to Property 1 can read lifecycle audit transitions, notes, and staff actor details for reservations belonging to Property 2.
2. **DEF-SEC-2.6B-02 (High):** `GET /api/v1/front-office/reservations/:id/payment-proof` (`FrontOfficeController.getPaymentProof`) queries the database for `payment_proof_path` and streams the file directly without validating property scope. An authenticated front-office user assigned to Property 1 can view or download bank transfer proof slips belonging to Property 2.

Additionally, the failure of legacy suite `securityRemediationAndRoleBoundaries.test.js` was reconciled: it is an existing, unrelated issue originating from Migration 029 in the financial and expense modules, which were outside the authorized Step 1 boundary.

---

## 2. Root-Cause Verification

The independent code inspection confirmed the exact root cause reported in the implementation documentation:

1. **Migration 029 Taxonomy Update:**
   Migration `029_role_migration_operations_manager_and_attendance_policy.sql` introduced `OPERATIONS_MANAGER` as the canonical managerial role for property operations.
2. **Token Normalization in Middleware:**
   In `backend/src/core/middleware/authContext.js` (line 22):
   ```javascript
   role: (decoded.role && decoded.role.toUpperCase() === 'MANAGER') 
     ? 'OPERATIONS_MANAGER' 
     : (decoded.role ? decoded.role.toUpperCase() : 'STAFF'),
   ```
   Every authenticated session bearing a token with `role: 'MANAGER'` was mapped to `req.user.role = 'OPERATIONS_MANAGER'`.
3. **Un-migrated Service Guard Fall-Through:**
   In `backend/src/modules/reservations/reservations.service.js`, the previous `validatePropertyScope` checked:
   ```javascript
   if (['MANAGER', 'RECEPTIONIST', 'STAFF'].includes(role)) { ... }
   return true; // <-- OPERATIONS_MANAGER did not match and fell through here
   ```
   Because `OPERATIONS_MANAGER` was omitted from the array, the guard evaluated to `false`, causing property isolation to fail open. Operations Managers were effectively granted portfolio-wide administrative authority.

---

## 3. Service Authorization Findings

### Code Inspection of `ReservationsService.validatePropertyScope`:
The remediated method in `backend/src/modules/reservations/reservations.service.js` (lines 91–123) was audited against all required authorization scenarios:

```javascript
static validatePropertyScope(user, propertyId) {
  if (!user) return true; // Unauthenticated public requests (e.g., online guest bookings)
  const role = (user.role || '').toUpperCase();
  if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
    return true; // Portfolio-wide authorized roles
  }
  if (['OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(role)) {
    if (!user.propertyId) {
      throw new ForbiddenError('Access denied: User is not assigned to any property.');
    }
    const userPropId = parseInt(user.propertyId, 10);
    if (isNaN(userPropId)) {
      throw new ForbiddenError('Access denied: Invalid property assignment.');
    }
    if (!propertyId) {
      throw new ForbiddenError('Access denied: Target reservation has no valid property assignment.');
    }
    if (propertyId !== 'all' && userPropId !== parseInt(propertyId, 10)) {
      throw new ForbiddenError('Access denied: You do not have authorization for this property.');
    }
    return true;
  }
  if (role === 'AGENT') {
    return true; // Agents are isolated by agentId in dedicated service checks
  }
  throw new ForbiddenError(`Access denied: Role '${role}' is not authorized for this reservation operation.`);
}
```

### Scenario Trace Results:
| Scenario | Expected Behavior | Actual Evaluated Code Behavior | Audit Assessment |
|---|---|---|---|
| **Assigned property** | Access allowed | `userPropId === parseInt(propertyId, 10)` -> `return true` | **VERIFIED** |
| **Different property** | HTTP 403 Forbidden | `userPropId !== parseInt(propertyId, 10)` -> throws `ForbiddenError` | **VERIFIED** |
| **Missing user property** | HTTP 403 Forbidden | `!user.propertyId` -> throws `ForbiddenError` | **VERIFIED** |
| **Null user property** | HTTP 403 Forbidden | `!user.propertyId` -> throws `ForbiddenError` | **VERIFIED** |
| **Non-numeric user property** | HTTP 403 Forbidden | `isNaN(userPropId)` -> throws `ForbiddenError` | **VERIFIED** |
| **Invalid target property** | HTTP 403 Forbidden | `!propertyId` -> throws `ForbiddenError` | **VERIFIED** |
| **Missing user role** | HTTP 403 Forbidden | Role defaults to `STAFF` via `authContext.js` and fails closed if unassigned | **VERIFIED** |
| **Unsupported role** | HTTP 403 Forbidden | Unhandled roles fall through to `throw new ForbiddenError(...)` | **VERIFIED** |
| **Tampered query param** | Ignored / Blocked | Ignored by service check; blocked at repository level (`AND 1 = 0`) | **VERIFIED** |
| **ADMIN & OWNER access** | Portfolio-wide | Allowed via `['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)` | **VERIFIED** |
| **SUPER_ADMIN boundary** | Technical admin | Retained global technical access | **VERIFIED** |

---

## 4. Six-Query SQL Scope Audit

The helper `FrontOfficeRepository.resolvePropertyScopeConstraint(user, requestedPropertyId, fieldName)` and all six front-office query methods were independently inspected:

### Helper Logic (`frontOffice.repository.js` lines 11–59):
- For `['OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF']`:
  - If `!user?.propertyId` or `isNaN(userPropId)`: Returns `{ clause: 'AND 1 = 0', params: [] }`.
  - If `requestedPropertyId && requestedPropertyId !== 'all' && parseInt(requestedPropertyId, 10) !== userPropId`: Returns `{ clause: 'AND 1 = 0', params: [] }`.
  - Authorized state: Returns `{ clause: 'AND ' + fieldName + ' = ?', params: [userPropId] }`.
- For `OWNER`: Scoped to `ownerPropId` if assigned; otherwise permits portfolio queries.
- For `SUPER_ADMIN` and `ADMIN`: Portfolio-wide, applies filter only if requested.
- Any other authenticated identity fails closed with `AND 1 = 0`.

### Detailed Method Verification:
1. **`getArrivals`:**
   - Parameter binding: `params = [date]`, then `params.push(...scope.params)`.
   - SQL clause: Appends `AND r.property_id = ?` or `AND 1 = 0`.
   - Table joins (`properties`, `apartments`, `agents`, `guests`, `users`) are driven by `FROM reservations r`. Constraining `r.property_id` guarantees zero foreign property leaks.
2. **`getDepartures`:**
   - Parameter binding: `params = [date, ...scope.params]`.
   - SQL clause: Appends `AND r.property_id = ?` or `AND 1 = 0`. Verified.
3. **`getCurrentGuests`:**
   - Parameter binding: `params = [...scope.params]`.
   - SQL clause: Appends `AND r.property_id = ?` or `AND 1 = 0`. Verified.
4. **`getPendingBookings`:**
   - Parameter binding: `params = [...scope.params]`.
   - SQL clause: Appends `AND r.property_id = ?` or `AND 1 = 0`. Verified.
5. **`getLiveOperationalFeed`:**
   - Field target: `ea.property_id` (from `employee_activities ea`).
   - Parameter binding: `params = [...scope.params, limit]`.
   - SQL clause: Appends `AND ea.property_id = ?` or `AND 1 = 0`. Verified.
6. **`getOperationalStats`:**
   - Field target: `'property_id'`.
   - Parameter binding: `propParams = scope.params`.
   - Interpolation: Correctly interpolated into all 5 subqueries (`arr`, `dep`, `inHouse`, `unassigned`, `units`). If `scope.clause` is `AND 1 = 0`, counts return `0`. If scoped, counts reflect only the assigned property.

---

## 5. Reservation Endpoint Security Matrix

Every reservation and front-office route, controller, service method, and repository query was traced end-to-end:

| # | Route & HTTP Method | Route Guard (`requireRoles`) | Service / Controller Guard | Repository Query Method | Property Scope Enforcement | Audit Status |
|---|---------------------|------------------------------|----------------------------|-------------------------|----------------------------|--------------|
| 1 | `GET /api/v1/reservations` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `AGENT` | Delegated to Repository | `ReservationsRepository.findAll` | `AND r.property_id = ?` / `AND 1 = 0` | **SECURE** |
| 2 | `GET /api/v1/reservations/:id` | Same as above | `validatePropertyScope` | `ReservationsRepository.findById` | Rejects foreign ID with HTTP 403 | **SECURE** |
| 3 | `GET /api/v1/reservations/:id/history` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | **NONE** (Bypasses service) | `ReservationsRepository.getStatusHistory` | **NONE** (`WHERE reservation_id = ?`) | **VULNERABLE (DEF-SEC-2.6B-01)** |
| 4 | `POST /api/v1/reservations` | Same as above | `validatePropertyScope` | Unit lock + `ReservationsRepository.create` | Validates unit's `property_id` | **SECURE** |
| 5 | `PUT /api/v1/reservations/:id` | `ADMIN`, `MANAGER`, `OWNER`, `SUPER_ADMIN`, `RECEPTIONIST` | `validatePropertyScope` | Reservation lock + `ReservationsRepository.update` | Rejects foreign ID with HTTP 403 | **SECURE** |
| 6 | `POST /api/v1/reservations/:id/confirm` | Same as above | `validatePropertyScope` | Locks + `ReservationsRepository.update` | Rejects foreign ID with HTTP 403 | **SECURE** |
| 7 | `POST /api/v1/reservations/:id/cancel` | Same as above + `AGENT` | `validatePropertyScope` | `ReservationsRepository.update` | Rejects foreign ID with HTTP 403; Agent isolated | **SECURE** |
| 8 | `POST /api/v1/reservations/:id/check-in` | `ADMIN`, `MANAGER`, `OWNER`, `SUPER_ADMIN`, `RECEPTIONIST` | `validatePropertyScope` | Reservation + Unit lock | Rejects foreign ID with HTTP 403 | **SECURE** |
| 9 | `POST /api/v1/reservations/:id/check-out` | Same as above | `validatePropertyScope` | Reservation + Unit lock | Rejects foreign ID with HTTP 403 | **SECURE** |
| 10 | `POST /api/v1/reservations/:id/no-show` | Same as above | `validatePropertyScope` | `ReservationsRepository.update` | Rejects foreign ID with HTTP 403 | **SECURE** |
| 11 | `GET /api/v1/front-office/arrivals` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `RECEPTIONIST` | Delegated to Repository | `FrontOfficeRepository.getArrivals` | `AND r.property_id = ?` / `AND 1 = 0` | **SECURE** |
| 12 | `GET /api/v1/front-office/departures` | Same as above | Delegated to Repository | `FrontOfficeRepository.getDepartures` | `AND r.property_id = ?` / `AND 1 = 0` | **SECURE** |
| 13 | `GET /api/v1/front-office/current-guests` | Same as above | Delegated to Repository | `FrontOfficeRepository.getCurrentGuests` | `AND r.property_id = ?` / `AND 1 = 0` | **SECURE** |
| 14 | `GET /api/v1/front-office/pending-bookings` | Same as above | Delegated to Repository | `FrontOfficeRepository.getPendingBookings` | `AND r.property_id = ?` / `AND 1 = 0` | **SECURE** |
| 15 | `GET /api/v1/front-office/live-feed` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `OPERATIONS_MANAGER`, `MANAGER` | Delegated to Repository | `FrontOfficeRepository.getLiveOperationalFeed` | `AND ea.property_id = ?` / `AND 1 = 0` | **SECURE** |
| 16 | `GET /api/v1/front-office/stats` | View roles | Delegated to Repository | `FrontOfficeRepository.getOperationalStats` | Injected into all 5 subqueries | **SECURE** |
| 17 | `POST /api/v1/front-office/claim` | `SUPER_ADMIN`, `ADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `RECEPTIONIST` | `validatePropertyScope` | Reservation row lock | Rejects foreign ID with HTTP 403 | **SECURE** |
| 18 | `POST /api/v1/front-office/reservations/:id/accept` | Same as above | `validatePropertyScope` | Reservation + Unit row lock | Rejects foreign ID with HTTP 403 | **SECURE** |
| 19 | `POST /api/v1/front-office/reservations/:id/approve` | Same as above | `validatePropertyScope` | Reservation + Unit row lock | Rejects foreign ID with HTTP 403 | **SECURE** |
| 20 | `POST /api/v1/front-office/reservations/:id/decline` | Same as above | `validatePropertyScope` | Reservation row lock | Rejects foreign ID with HTTP 403 | **SECURE** |
| 21 | `POST /api/v1/front-office/reservations/:id/check-in` | Same as above | `validatePropertyScope` | Reservation + Unit row lock | Rejects foreign ID with HTTP 403 | **SECURE** |
| 22 | `POST /api/v1/front-office/reservations/:id/check-out` | Same as above | `validatePropertyScope` | Reservation + Unit row lock | Rejects foreign ID with HTTP 403 | **SECURE** |
| 23 | `POST /api/v1/front-office/reservations/:id/no-show` | Same as above | `validatePropertyScope` | Reservation row lock | Rejects foreign ID with HTTP 403 | **SECURE** |
| 24 | `GET /api/v1/front-office/reservations/:id/payment-proof` | Same as above | **NONE** (Direct inline query in controller) | Direct query to `reservations` & `operational_evidence_attachments` | **NONE** (Streams file without scope check) | **VULNERABLE (DEF-SEC-2.6B-02)** |

---

## 6. Role Compatibility Assessment

- **`OPERATIONS_MANAGER`:** Properly recognized in route middleware, service checks, and SQL query constraints. Strictly restricted to their assigned property.
- **Legacy `MANAGER`:** Symmetrically supported. Normalizes to `OPERATIONS_MANAGER` in `authContext.js` and matches `MANAGER` in `requireRoles`. Correctly property-scoped.
- **`RECEPTIONIST`:** Property restrictions fail closed. Cannot access foreign properties.
- **`STAFF`:** Excluded from front-office operational routes. Service and repository scoping fail closed.
- **`ADMIN`:** Retains corporate global authority across all properties without regression.
- **`OWNER`:** Retains portfolio-wide read access to reservations and operational views. If assigned to a specific property, repository enforces that scope.
- **`SUPER_ADMIN`:** Retains unrestricted technical governance across all operations.

---

## 7. Failed Security-Suite Investigation

### Fresh Execution of `securityRemediationAndRoleBoundaries.test.js`:
- **Result:** FAIL (2 tests failed, 24 tests passed, 26 total)
- **Time:** 8.312 s
- **Target Database:** `bfa_apartments_test_db`

### Specific Failing Assertions:
1. **Test 2.2 (`line 184`):**
   ```javascript
   const finRes = await request(app)
     .get('/api/v1/financial/overview')
     .set('Authorization', `Bearer ${managerWithNullPropToken}`);
   expect(finRes.status).toBe(403); // Received: 200
   ```
2. **Test 2.3 (`line 199`):**
   ```javascript
   const expRes = await request(app)
     .post('/api/v1/expenses')
     .set('Authorization', `Bearer ${managerWithProp1Token}`)
     .send({ property_id: 2, category: 'MAINTENANCE', description: 'Cross property attempt', amount: 5000 });
   expect(expRes.status).toBe(403); // Received: 201
   ```

### Classification:
**Existing Unrelated Failure**

### Explanation:
- `securityRemediationAndRoleBoundaries.test.js` was authored prior to Migration 029. It tests property isolation in the **Financial** (`financial.service.js`) and **Expense** (`expenses.service.js`) modules.
- Both `financial.service.js` (line 14 & line 32) and `expenses.service.js` (line 33) currently contain legacy role checks:
  ```javascript
  if (['MANAGER', 'STAFF', 'RECEPTIONIST'].includes(role)) { ... }
  ```
- Because tokens with `role: 'MANAGER'` are normalized by `authContext.js` to `'OPERATIONS_MANAGER'`, they bypass this legacy check in financial and expense services.
- This failure is NOT a regression caused by Step 1 remediation. The Step 1 mandate strictly prohibited modifying unrelated modules. These findings remain deferred for future financial module hardening.

### Reconciling the Previous `checkInReadinessSafety.test.js` Failure:
- During prior automated testing, test case `TC-20B` initially failed due to database connection contention when two test suites ran simultaneously and competed for row locks in `bfa_apartments_test_db`.
- When executed in single-thread isolated sequence during this audit, all 26 test cases passed cleanly in 9.256 s.

---

## 8. Fresh Independent Regression Results

All 8 test suites were executed independently in sequence against `bfa_apartments_test_db`:

| Suite | File | Tests Run | Passed | Failed | Skipped | Time | Database |
|---|---|:---:|:---:|:---:|:---:|:---:|---|
| **Dedicated Security** | `tests/operationsManagerPropertyScopeRemediation.test.js` | 14 | 14 | 0 | 0 | 10.086s | `bfa_apartments_test_db` |
| **Front Office Operations** | `tests/frontOffice.test.js` | 5 | 5 | 0 | 0 | 5.838s | `bfa_apartments_test_db` |
| **Reservation Engine** | `tests/reservationEngine.test.js` | 8 | 8 | 0 | 0 | 6.998s | `bfa_apartments_test_db` |
| **Front Desk Assignment** | `tests/frontDeskAssignment.test.js` | 5 | 5 | 0 | 0 | 6.535s | `bfa_apartments_test_db` |
| **Check-In Readiness Safety** | `tests/checkInReadinessSafety.test.js` | 26 | 26 | 0 | 0 | 9.256s | `bfa_apartments_test_db` |
| **Maintenance Dispatch (Pkg A)** | `tests/maintenancePackageADispatch.test.js` | 12 | 12 | 0 | 0 | 8.191s | `bfa_apartments_test_db` |
| **Maintenance Evidence (Pkg C & D)**| `tests/maintenancePackageCAndD.test.js` | 17 | 17 | 0 | 0 | 9.164s | `bfa_apartments_test_db` |
| **Legacy Role Boundaries** | `tests/securityRemediationAndRoleBoundaries.test.js` | 26 | 24 | 2 | 0 | 8.312s | `bfa_apartments_test_db` |
| **TOTAL** | **8 Suites** | **113** | **111** | **2** | **0** | **64.38s** | — |

*(Note: Distinction between Jest test cases and assertions: The 113 Jest test cases contain approximately 320 granular assertions. 111 test cases passed cleanly; only the 2 legacy financial/expense test cases failed as explained above).*

---

## 9. Database Preservation Evidence

Direct read-only schema queries confirmed complete database isolation:

### Production Database (`bfa_apartments_db`):
- Total Migrations Applied: **30 migrations**
- Latest Migration: `030_kiosk_credential_security_and_geofence_review.sql` (executed `2026-11-02 18:36:56`)
- Mutations during remediation & audit: **EXACTLY ZERO (0)**. No records modified, no schemas altered.

### Test Database (`bfa_apartments_test_db`):
- Total Migrations Applied: **31 migrations**
- Latest Migration: `031_maintenance_evidence_and_dispatch_verification.sql`
- Used exclusively for automated test execution.

---

## 10. Exact Git Filename Reconciliation

The working tree was reconciled against `scratch/pre_remediation_git_snapshot.json` (baseline immediately prior to Step 1 remediation):

1. **Staged Tracked Files (126 files):**
   - Pre-remediation count: **126**
   - Current count: **126**
   - Difference: **0 files changed**. Exactly identical set preserved.
2. **Modified Tracked Files (66 files vs 63 baseline):**
   - Exactly **3 newly modified files**, strictly authorized Workspace C remediation targets:
     - `backend/src/modules/frontOffice/frontOffice.repository.js`
     - `backend/src/modules/frontOffice/frontOffice.routes.js`
     - `backend/src/modules/reservations/reservations.repository.js`
   - (`backend/src/modules/reservations/reservations.service.js` was already in the 63 modified baseline files).
   - Reverted / deleted tracked files: **0**.
3. **Untracked Entries:**
   - Pre-remediation: 118 entries.
   - Current additions: Exactly 8 authorized audit, evidence, and test artifacts:
     - `BFA_STAGE_2_6B_PRE_IMPLEMENTATION_VALIDATION.md`
     - `BFA_STAGE_2_6B_READINESS_ASSESSMENT.md`
     - `BFA_STAGE_2_6B_STEP_1_SECURITY_REMEDIATION_REPORT.md`
     - `BFA_WORKSPACE_B_STAGE_2_6_FINAL_BROWSER_EVIDENCE.md`
     - `BFA_WORKSPACE_B_STAGE_2_6_REMEDIATION_INDEPENDENT_AUDIT.md`
     - `BFA_WORKSPACE_B_STAGE_2_6_REMEDIATION_REPORT.md`
     - `backend/tests/operationsManagerPropertyScopeRemediation.test.js`
     - `frontend/stage2_6_remediation_audit/`
4. **Workspace Boundary Preservation:**
   - Workspace A: **0 files touched**.
   - Workspace B: **0 application files touched**.
   - Staged index: **100% untouched**.

---

## 11. Remaining Defects and Limitations

### Findings Requiring Resolution Prior to Final Stage 2.6B Authorization:

1. **Finding DEF-SEC-2.6B-01 (Medium Severity):**
   - **Vulnerable Path:** `GET /api/v1/reservations/:id/history`
   - **File:** `backend/src/modules/reservations/reservations.controller.js` (lines 163–173)
   - **Defect:** `ReservationsController.getHistory` calls `ReservationsRepository.getStatusHistory(req.params.id)` without loading the reservation or validating `ReservationsService.validatePropertyScope(req.user, reservation.property_id)`.
   - **Impact:** Any Operations Manager or Receptionist from Property 1 can view the audit history of Property 2 reservations.
   - **Resolution Required:** Retrieve reservation record by ID and call `ReservationsService.validatePropertyScope(req.user, reservation.property_id)` prior to returning history.

2. **Finding DEF-SEC-2.6B-02 (High Severity):**
   - **Vulnerable Path:** `GET /api/v1/front-office/reservations/:id/payment-proof`
   - **File:** `backend/src/modules/frontOffice/frontOffice.controller.js` (lines 133–164)
   - **Defect:** `FrontOfficeController.getPaymentProof` queries `reservations` and `operational_evidence_attachments` directly by `reservationId` and streams the file using `res.sendFile()` without performing any property scope validation.
   - **Impact:** Any authenticated front-office user from Property 1 can view/download guest bank transfer proof slips belonging to Property 2.
   - **Resolution Required:** Load reservation `property_id` and call `ReservationsService.validatePropertyScope(req.user, reservation.property_id)` prior to serving payment proof files.

3. **Deferred Limitation (Low Severity / Separate Milestone):**
   - Financial overview (`/api/v1/financial/overview`) and expense creation (`/api/v1/expenses`) fail open for `OPERATIONS_MANAGER` due to un-migrated role arrays in `financial.service.js` and `expenses.service.js`. Must be scheduled for a dedicated financial governance milestone.

---

## 12. Explicit Files Inspected

- `backend/src/core/middleware/authContext.js`
- `backend/src/modules/reservations/reservations.service.js`
- `backend/src/modules/reservations/reservations.repository.js`
- `backend/src/modules/reservations/reservations.controller.js`
- `backend/src/modules/reservations/reservations.routes.js`
- `backend/src/modules/frontOffice/frontOffice.repository.js`
- `backend/src/modules/frontOffice/frontOffice.service.js`
- `backend/src/modules/frontOffice/frontOffice.controller.js`
- `backend/src/modules/frontOffice/frontOffice.routes.js`
- `backend/src/modules/financial/financial.service.js`
- `backend/src/modules/financial/financial.routes.js`
- `backend/src/modules/expenses/expenses.service.js`
- `backend/tests/operationsManagerPropertyScopeRemediation.test.js`
- `backend/tests/frontOffice.test.js`
- `backend/tests/reservationEngine.test.js`
- `backend/tests/frontDeskAssignment.test.js`
- `backend/tests/checkInReadinessSafety.test.js`
- `backend/tests/maintenancePackageADispatch.test.js`
- `backend/tests/maintenancePackageCAndD.test.js`
- `backend/tests/securityRemediationAndRoleBoundaries.test.js`
- `scratch/pre_remediation_git_snapshot.json`

---

## 13. Recommended Next Action

1. **Authorize Narrow Remediation for Findings DEF-SEC-2.6B-01 and DEF-SEC-2.6B-02:**
   - Add `ReservationsService.validatePropertyScope` check to `ReservationsController.getHistory`.
   - Add `ReservationsService.validatePropertyScope` check to `FrontOfficeController.getPaymentProof`.
   - Add automated assertions to `tests/operationsManagerPropertyScopeRemediation.test.js` verifying that cross-property access to `/:id/history` and `/:id/payment-proof` returns HTTP 403 Forbidden.
2. **Hold Stage 2.6B Step 2:**
   - Do NOT proceed to Shift Handover or Supervisor Reassignment implementation until findings DEF-SEC-2.6B-01 and DEF-SEC-2.6B-02 are remediated and verified.

