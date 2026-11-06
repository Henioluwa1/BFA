# BFA — STAGE 2.6B: SHIFT HANDOVER & SUPERVISOR REASSIGNMENT
# READ-ONLY DISCOVERY AND IMPLEMENTATION READINESS ASSESSMENT

**Project:** BFA Apartments Management System  
**Milestone:** Stage 2.6B — Shift Handover & Supervisor Reassignment Automation  
**Target:** Workspace B (Internal Portal Frontend) & Workspace C (Backend API)  
**Execution Mode:** STRICTLY READ-ONLY DISCOVERY AND READINESS ASSESSMENT  
**Assessment Date:** November 5, 2026  
**Branch:** `master`  
**HEAD Commit:** `3075411a754fcb7801b4b5b023168df2d6d4f4f8`  
**Git Integrity Baseline:** 126 staged files, 63 unstaged modified files, 122 untracked files (100% preserved)  
**Database State:** Production DB: 30 migrations (`030`) | Test DB: 31 migrations (`031`) (0 mutations)  

---

## 1. EXECUTIVE SUMMARY & VERDICT

### Readiness Verdict

```
================================================================================
VERDICT: READY FOR USER AUTHORIZATION
================================================================================
```

Stage 2.6B is **fully architecturally prepared and ready for implementation authorization**. 

The discovery and readiness assessment confirmed that the underlying database schemas, transactional locking infrastructure, role-scoping mechanisms, identity-linkage resolution, and audit-logging services are fully positioned to support Shift Handover and Supervisor Reassignment workflows without requiring any schema migrations or structural table changes.

### Key Discovery Takeaways

1. **Zero Database Migrations Required:**  
   The primary ledger table `reservation_staff_assignments` was provisioned ahead of time in Migration `026_property_governance_and_staff_operations.sql`. It already contains the required ENUM values (`'SHIFT_HANDOVER'`, `'MANAGER_REASSIGNED'`, `'INITIAL_CLAIM'`, `'ESCALATION'`), tracking columns (`handover_notes`, `reassignment_reason`, `is_active`, `claimed_at`, `ended_at`), and foreign keys referencing `users(id)`.
2. **Authoritative Identity Linkage (`DEC-2.5B-01 Option A`):**  
   Front-office claims, supervisor reassignments, and audit trails are keyed to `users.id`. Workforce scheduling, shift rosters, and attendance clock-ins are keyed to `employees.id`. The pre-existing `IdentityResolverService` (`backend/src/modules/workforce/identityResolver.service.js`) cleanly resolves between `users.id` and `employees.id` without ever conflating or assuming equivalence between the two ID spaces.
3. **Established Concurrency & Atomicity Patterns:**  
   The existing `claimReservation` method in `backend/src/modules/reservations/reservations.service.js` establishes the required atomic pattern: `pool.withTransaction()`, `SELECT ... FOR UPDATE` row-level pessimistic locking, property-scope validation, assignment deactivation, ledger history insertion, dual activity recording (`employee_activities`), and structured audit logging (`audit_logs`).
4. **Targeted Implementation Scope:**  
   Implementation requires strictly scoped additions to:
   - **Workspace C (Backend):** Two transactional service methods (`handoverReservation`, `reassignReservation`), route definitions in `frontOffice.routes.js`, controller handlers in `frontOffice.controller.js`, and comprehensive integration tests.
   - **Workspace B (Frontend):** Modal dialogs for Shift Handover and Supervisor Reassignment, action controls on the Front Office Claim Desk (`FrontOfficePage.jsx`), and API client methods (`api.js`).

---

## 2. EXISTING ARCHITECTURE & WORKFLOW

### 2.1 Workforce Roster and Shift Assignments
Workforce scheduling is managed under `backend/src/modules/workforce/`:
- **Tables:** `rosters`, `shifts`, `shift_templates`.
- **Key Columns:** `shifts.id`, `shifts.roster_id`, `shifts.property_id`, `shifts.employee_id` (FK to `employees.id`), `shifts.shift_date`, `shifts.start_time`, `shifts.end_time`, `shifts.status` (`'SCHEDULED'`, `'IN_PROGRESS'`, `'COMPLETED'`, `'CANCELLED'`, `'SWAPPED'`).
- **Identity Context:** Shifts are scheduled against HR `employees.id`, **not** `users.id`.
- **Property Scoping:** `RosterService.validatePropertyScope()` restricts shift scheduling to the manager's assigned property.

### 2.2 Employee Attendance and Clock-In Records
Time and attendance tracking is managed via `backend/src/modules/workforce/attendance.service.js`:
- **Table:** `attendance_records`.
- **Key Columns:** `id`, `employee_id` (FK to `employees.id`), `property_id`, `shift_id` (FK to `shifts.id`), `work_date`, `clock_in_time`, `clock_out_time`, `attendance_status` (`'PRESENT'`, `'LATE'`, `'HALF_DAY'`, `'EARLY_DEPARTURE'`, `'ABSENT'`, `'ON_LEAVE'`), `is_verified`, `verified_by_id` (FK to `users.id`).
- **Operational Reality:** An active front-desk receptionist on duty has an open attendance record (`clock_in_time IS NOT NULL AND clock_out_time IS NULL`) for today's date. When their shift ends, they execute clock-out. Currently, clock-out does not automatically trigger handover of open reservation claims.

### 2.3 Front-Office Claim Desk & Assignment Ledger
Front-desk operations are orchestrated through `frontOffice.service.js`, `frontOffice.repository.js`, and `reservations.service.js`:
- **Tables:** `reservations` and `reservation_staff_assignments`.
- **Reservation Columns:** `reservations.id`, `reservations.reservation_code`, `reservations.property_id`, `reservations.assigned_staff_id` (FK to `users.id`), `reservations.status`.
- **Assignment Ledger:** `reservation_staff_assignments` maintains an immutable audit trail of every claim, transfer, and escalation.
- **Single-Claim Mutex:** In Stage 2.6A, `claimReservation` enforces that only one receptionist can claim an incoming reservation. Concurrent attempts result in an explicit `ConflictError` (HTTP 409).

### 2.4 Maintenance Technician Assignment and Dispatch
Maintenance dispatch is handled in `backend/src/modules/maintenance/maintenance.service.js`:
- **Table:** `maintenance_requests`.
- **Assignment Column:** `assigned_to_id` (FK to `users.id`).
- **Concurrency Pattern:** Uses `SELECT ... FOR UPDATE` on `maintenance_requests` and verifies technician property scoping (`staff.property_id === record.property_id`) and maximum workload capacity.
- **Independence:** Maintenance assignments are distinct from front-office receptionist assignments; maintenance requests stay assigned to the technician until completed, regardless of receptionist shift changes.

### 2.5 Property-Scoped Operations Manager Permissions
- **Tables:** `user_property_assignments` and `users.property_id`.
- **Table Schema:** `user_property_assignments` links `user_id` (`users.id`) to `property_id` (`properties.id`) with `is_primary` flag and `assigned_by_id`.
- **Migration 029:** Formally renamed role `MANAGER` to `OPERATIONS_MANAGER` on the `users` table.
- **Security Guard:** `authContext.js` provides role equivalence: any middleware checking `requireRoles('MANAGER')` automatically accepts `OPERATIONS_MANAGER`.

### 2.6 Existing Audit-Log and Employee Activity Mechanisms
The system maintains dual operational auditing:
1. **System Audit Logs (`audit_logs` table):**
   - Managed by `backend/src/core/audit/audit.service.js`.
   - Records actor (`actor_id` = `users.id`, `actor_role`, `actor_email`), `action`, `entity_type`, `entity_id`, `old_values`, `new_values`, `ip_address`, `request_id`.
2. **Operational Workforce Activities (`employee_activities` table):**
   - Managed directly within transactional business workflows.
   - Records `employee_id` (FK to `employees.id`), `property_id`, `activity_type` (e.g. `'CLIENT_CLAIMED'`, `'CLIENT_ACCEPTED'`), `description`, `metadata` (JSON), `status`.

### 2.7 Existing Notifications Infrastructure
- **Table:** `notifications` (created in Migration `008_communications_and_notifications.sql`).
- **Service:** `NotificationsService` (`backend/src/modules/notifications/notifications.service.js`).
- **Recipient Model:** Dispatches in-app notifications keyed to `recipient_id` (`users.id`) or `recipient_role`.

### 2.8 Authoritative Identity Resolution
The table below documents the strict separation of identity contexts:

| Entity Domain | Table | Primary Key | Foreign Key Target | Authoritative Identifier |
| :--- | :--- | :--- | :--- | :--- |
| **Auth & User Accounts** | `users` | `id` | N/A | `users.id` |
| **HR Workforce** | `employees` | `id` | `user_id` -> `users.id` | `employees.id` |
| **Front-Office Claims** | `reservation_staff_assignments` | `id` | `assigned_receptionist_id` -> `users.id` | `users.id` |
| **Reservation Ownership** | `reservations` | `id` | `assigned_staff_id` -> `users.id` | `users.id` |
| **Workforce Shifts** | `shifts` | `id` | `employee_id` -> `employees.id` | `employees.id` |
| **Attendance Punches** | `attendance_records` | `id` | `employee_id` -> `employees.id` | `employees.id` |
| **Audit Log Actor** | `audit_logs` | `id` | `actor_id` -> `users.id` | `users.id` |
| **Workforce Activity** | `employee_activities` | `id` | `employee_id` -> `employees.id` | `employees.id` |

> [!IMPORTANT]
> **Binding Architecture Policy (`DEC-2.5B-01 Option A`):**  
> `users.id` and `employees.id` are **never** interchangeable. All handover and reassignment routines linking front-office operations (`users.id`) to workforce rosters or activities (`employees.id`) must invoke `IdentityResolverService.resolveEmployeeFromUser(userId)` or `IdentityResolverService.resolveUserFromEmployee(employeeId)`.

---

## 3. EXISTING APIS AND DATABASE STRUCTURES

### 3.1 `reservation_staff_assignments` Table Schema
Inspected via `SHOW CREATE TABLE reservation_staff_assignments`:

```sql
CREATE TABLE `reservation_staff_assignments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reservation_id` int(11) NOT NULL,
  `property_id` int(11) NOT NULL,
  `assigned_receptionist_id` int(11) NOT NULL,
  `assignment_type` enum('INITIAL_CLAIM','MANAGER_REASSIGNED','SHIFT_HANDOVER','ESCALATION') NOT NULL,
  `assigned_by_id` int(11) NOT NULL,
  `service_status` enum('AWAITING_ASSIGNMENT','CLAIMED','GUEST_CONTACTED','FOLLOW_UP_REQUIRED','SERVICE_IN_PROGRESS','CHECKED_IN','COMPLETED','CANCELLED','REASSIGNED','ESCALATED') DEFAULT 'CLAIMED',
  `contact_attempt_count` int(11) NOT NULL DEFAULT 0,
  `last_contact_at` timestamp NULL DEFAULT NULL,
  `handover_notes` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `claimed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `ended_at` timestamp NULL DEFAULT NULL,
  `reassignment_reason` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_rsa_property` (`property_id`),
  KEY `fk_rsa_assigned_by` (`assigned_by_id`),
  KEY `idx_rsa_res_active` (`reservation_id`,`is_active`),
  KEY `idx_rsa_staff_date` (`assigned_receptionist_id`,`claimed_at`),
  CONSTRAINT `fk_rsa_assigned_by` FOREIGN KEY (`assigned_by_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_rsa_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`),
  CONSTRAINT `fk_rsa_receptionist` FOREIGN KEY (`assigned_receptionist_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_rsa_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Schema Assessment:**
- `assignment_type` contains `'SHIFT_HANDOVER'` and `'MANAGER_REASSIGNED'`.
- `handover_notes` (`text`) is provisioned.
- `reassignment_reason` (`varchar(255)`) is provisioned.
- `assigned_by_id` and `assigned_receptionist_id` reference `users(id)`.
- `is_active` and `ended_at` support atomic state transitions and active filtering.
- **Zero migrations are required.**

### 3.2 Existing Front-Office Backend Routes (`frontOffice.routes.js`)
Currently active routes under `/api/v1/front-office`:

| Method | Endpoint | Allowed Roles | Controller Handler |
| :--- | :--- | :--- | :--- |
| `GET` | `/arrivals` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.getArrivals` |
| `GET` | `/departures` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.getDepartures` |
| `GET` | `/current-guests` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.getCurrentGuests` |
| `GET` | `/pending-bookings`| `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.getPendingBookings` |
| `GET` | `/stats` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.getStats` |
| `GET` | `/live-feed` | `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER` | `FrontOfficeController.getLiveOperationalFeed` |
| `POST`| `/claim` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.claimReservation` |
| `POST`| `/reservations/:id/claim` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.claimReservation` |
| `POST`| `/reservations/:id/approve` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.approveReservation` |
| `POST`| `/reservations/:id/decline` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.declineReservation` |
| `GET` | `/reservations/:id/payment-proof` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.getPaymentProof` |
| `POST`| `/reservations/:id/accept` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.acceptReservation` |
| `POST`| `/reservations/:id/check-in` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.checkIn` |
| `POST`| `/reservations/:id/check-out` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.checkOut` |
| `POST`| `/reservations/:id/no-show` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | `FrontOfficeController.noShow` |

**Missing Endpoints Identified:**
- `POST /api/v1/front-office/handover` (or `POST /api/v1/front-office/reservations/:id/handover`)
- `POST /api/v1/front-office/reassign` (or `POST /api/v1/front-office/reservations/:id/reassign`)
- `GET /api/v1/front-office/reservations/:id/assignments` (Historical assignment ledger inspection)

---

## 4. SHIFT HANDOVER FEASIBILITY

### 4.1 Functional Requirements
Shift Handover allows an outgoing front-desk receptionist to transfer their claimed active reservations and pending guest workflows to an incoming receptionist on duty at the same property.

### 4.2 Detailed Workflow & Feasibility
1. **Participant Identification:**
   - **Outgoing Receptionist:** `req.user.id` (authenticated caller).
   - **Incoming Receptionist:** `incomingUserId` passed in request payload. Must be a user with role `RECEPTIONIST`, `OPERATIONS_MANAGER`, `MANAGER`, or `ADMIN`, actively assigned to the same property.
2. **Shift Context & Handover Notes:**
   - Optional `shiftId` linking to incoming receptionist's active shift in `shifts`.
   - `handoverNotes`: String describing guest status, special requests, pending payments, or key handover points.
3. **Target Bookings:**
   - Supports both **individual booking handover** (`reservationId`) and **bulk handover** (`reservationIds: [id1, id2, ...]`).
4. **Attributable Ledger State Transition:**
   - Atomically lock reservation rows (`SELECT * FROM reservations WHERE id IN (?) FOR UPDATE`).
   - Validate that each reservation is currently assigned to the outgoing receptionist (`assigned_staff_id === outgoingUserId`).
   - Deactivate outgoing assignment:
     ```sql
     UPDATE reservation_staff_assignments 
     SET is_active = 0, ended_at = NOW() 
     WHERE reservation_id = ? AND is_active = 1;
     ```
   - Insert new assignment record:
     ```sql
     INSERT INTO reservation_staff_assignments (
       reservation_id, property_id, assigned_receptionist_id, assigned_by_id, 
       assignment_type, service_status, handover_notes, is_active, claimed_at
     ) VALUES (?, ?, ?, ?, 'SHIFT_HANDOVER', 'CLAIMED', ?, 1, NOW());
     ```
   - Update reservation header:
     ```sql
     UPDATE reservations 
     SET assigned_staff_id = ?, updated_by = ? 
     WHERE id = ?;
     ```
   - Dual workforce activities:
     - Outgoing employee: `activity_type = 'CLIENT_HANDED_OVER'`
     - Incoming employee: `activity_type = 'CLIENT_RECEIVED_HANDOVER'`
   - System audit log: `action = 'SHIFT_HANDOVER'`.
   - Dispatch in-app notification to incoming receptionist.
5. **Conflict & Race Condition Guard:**
   - If an outgoing receptionist attempts to hand over a reservation that was concurrently modified, cancelled, or checked out, the row lock and assignment verification cleanly reject the invalid transfer with `ConflictError` (HTTP 409).

---

## 5. SUPERVISOR REASSIGNMENT FEASIBILITY

### 5.1 Functional Requirements
Supervisor Reassignment allows an Operations Manager, Admin, or Super Admin to intervene in front-office claims, reassigning a reservation from one staff member to another (or claiming an abandoned/unresponsive reservation).

### 5.2 Detailed Workflow & Feasibility
1. **Authorized Initiators:**
   - `SUPER_ADMIN`, `ADMIN`: Global scope across all properties.
   - `OPERATIONS_MANAGER`, `MANAGER`: Strictly scoped to their assigned `property_id`.
2. **Preventing Silent Ownership Changes:**
   - `reassignmentReason`: **Mandatory** non-empty string explaining why supervisor intervention occurred (e.g., `"Receptionist called in sick"`, `"Shift ended without handover"`, `"Workload rebalancing"`).
   - Both the previous owner and new owner are permanently recorded in `reservation_staff_assignments`:
     - `assigned_receptionist_id` = `targetUserId` (new assignee)
     - `assigned_by_id` = `supervisorUserId` (supervisor)
     - `reassignment_reason` = `reason`
     - `assignment_type` = `'MANAGER_REASSIGNED'`
3. **Execution Steps within Transaction:**
   - `SELECT * FROM reservations WHERE id = ? FOR UPDATE`.
   - Validate property scoping for the supervisor.
   - Validate target receptionist belongs to the same property and is active.
   - Deactivate current active assignment in `reservation_staff_assignments` (`is_active = 0, ended_at = NOW()`).
   - Insert new assignment record with `assignment_type = 'MANAGER_REASSIGNED'`.
   - Update `reservations.assigned_staff_id = targetUserId`.
   - Record `audit_logs` entry: `action = 'SUPERVISOR_REASSIGNMENT'` capturing supervisor ID, old staff ID, new staff ID, and reason.
   - Dispatch notification to both previous and new assignees.

---

## 6. ROLE AND PROPERTY AUTHORIZATION MATRIX

| Operation | Permitted Roles | Property Scope Check | Identity Mapping | Transaction Guard |
| :--- | :--- | :--- | :--- | :--- |
| **Claim Booking** *(Existing)* | `SUPER_ADMIN`, `ADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `RECEPTIONIST` | Yes (Manager/Receptionist must match `property_id`) | Caller is `users.id`; Activity maps to `employees.id` via `IdentityResolver` | `SELECT ... FOR UPDATE` on `reservations` |
| **Shift Handover** *(Proposed)* | `RECEPTIONIST`, `OPERATIONS_MANAGER`, `MANAGER`, `ADMIN` | Yes (Caller and recipient must be assigned to reservation's `property_id`) | Caller and recipient are `users.id`; Activities map to `employees.id` | `SELECT ... FOR UPDATE` on all target reservations |
| **Supervisor Reassign** *(Proposed)* | `SUPER_ADMIN`, `ADMIN`, `OPERATIONS_MANAGER`, `MANAGER` | Yes (`OPERATIONS_MANAGER` must match reservation's `property_id`) | Supervisor and target are `users.id`; Activity maps to `employees.id` | `SELECT ... FOR UPDATE` on reservation |
| **View Assignment History** *(Proposed)* | `SUPER_ADMIN`, `ADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `RECEPTIONIST` | Yes (Scoped to assigned property for Receptionist/Manager) | Reads `reservation_staff_assignments` joining `users` | Read query with property filter |

> [!NOTE]
> `STAFF` (housekeeping, maintenance, general workers) is strictly excluded from all front-office claim, handover, and reassignment capabilities.

---

## 7. CONCURRENCY, LOCKING & AUDIT REQUIREMENTS

### 7.1 Transaction Isolation & Deadlock Prevention
- All state changes must occur within `pool.withTransaction(async (conn) => { ... })`.
- When performing bulk handovers on multiple reservations, sort reservation IDs in ascending order (`reservationIds.sort((a,b) => a - b)`) before executing `SELECT ... FOR UPDATE`. This guarantees a deterministic lock order across concurrent transactions and prevents database deadlocks.

### 7.2 Idempotency and Conflict Detection
- **Stale Handover Prevention:** The service verifies `reservation.assigned_staff_id === outgoingUserId`. If another handover or reassignment occurred in the interim, the check fails with HTTP 409 (`ConflictError: "Reservation ownership has changed. Please refresh your desk."`).
- **Inactive/Completed Reservation Prevention:** Only reservations in active operational statuses (`'PENDING'`, `'PENDING_APPROVAL'`, `'PENDING_REVIEW'`, `'CLAIMED'`, `'CONFIRMED'`, `'CHECKED_IN'`) can be handed over or reassigned. Completed (`'CHECKED_OUT'`), cancelled (`'CANCELLED'`), or no-show (`'NO_SHOW'`) reservations reject transfers with HTTP 400 (`ValidationError`).

### 7.3 Dual Audit Trail Requirements
Every handover or supervisor reassignment must produce:
1. An entry in `reservation_staff_assignments` with timestamp, `assignment_type`, and context.
2. An entry in `audit_logs` with `oldValues` (`previousStaffId`) and `newValues` (`newStaffId`, `reason`).
3. An entry in `employee_activities` for each affected staff member, resolving `employees.id` through `IdentityResolverService`.

---

## 8. MISSING CAPACITIES & IDENTIFIED RISKS

### 8.1 Missing Backend Capabilities (Workspace C)
1. **No Handover Endpoint:** Route `/api/v1/front-office/handover` does not exist.
2. **No Reassignment Endpoint:** Route `/api/v1/front-office/reassign` does not exist.
3. **No Assignment History Query:** Endpoint `/api/v1/front-office/reservations/:id/assignments` does not exist.
4. **Property Scoping Role Gap in `reservations.service.js`:**  
   In `reservations.service.js` line 48:
   ```javascript
   if (['MANAGER', 'RECEPTIONIST', 'STAFF'].includes(role))
   ```
   Role `'OPERATIONS_MANAGER'` is not explicitly listed in this array, causing it to fall through to `return true;`. While `authContext.js` normalizes roles at the HTTP layer, the service layer check should explicitly include `'OPERATIONS_MANAGER'` to ensure uniform property isolation.

### 8.2 Missing Frontend Capabilities (Workspace B)
1. **Shift Handover UI:** No "Handover Desk" or "Handover Selected" buttons in `FrontOfficePage.jsx`.
2. **Handover Modal:** No modal dialog allowing the receptionist to select an incoming on-duty peer, view their shift context, enter handover notes, and confirm transfer.
3. **Supervisor Reassignment UI:** No reassignment action for Operations Managers/Admins to transfer bookings between staff with a mandatory reason.
4. **Assignment History Modal:** No view allowing receptionists or managers to view the historical ownership chain of a booking.

### 8.3 Architectural & Concurrency Risks
- **Risk 1: Shift Ended with Orphaned Claims.**  
  If a receptionist clocks out without handing over their claimed reservations, bookings remain locked to an off-duty staff member.  
  *Mitigation:* Provide an attendance clock-out check or alert banner warning the receptionist of active claims before clocking out, plus allow Operations Managers to reassign abandoned claims.
- **Risk 2: Handing Over to Off-Duty Staff.**  
  An outgoing receptionist might inadvertently select a colleague who is not on shift or on leave.  
  *Mitigation:* The handover staff selector should query employees who have an active shift or open attendance punch today for that property.

---

## 9. PROPOSED IMPLEMENTATION SEQUENCE

### Package 1: Workspace C — Backend Services & Endpoints
1. **Task C-2.6B-01: Service Layer Role Alignment**  
   Update `validatePropertyScope` in `reservations.service.js` to explicitly validate `OPERATIONS_MANAGER`.
2. **Task C-2.6B-02: Handover Implementation**  
   Implement `handoverReservation` and `bulkHandoverReservations` in `frontOffice.service.js` and `reservations.service.js`:
   - Enforce sorted locking, property scoping, and peer validation.
   - Deactivate old assignment, insert new `'SHIFT_HANDOVER'` record.
   - Record `employee_activities` and `audit_logs`.
3. **Task C-2.6B-03: Supervisor Reassignment Implementation**  
   Implement `reassignReservation` in `frontOffice.service.js` and `reservations.service.js`:
   - Enforce manager/admin role check, property scope, and mandatory reason.
   - Deactivate old assignment, insert new `'MANAGER_REASSIGNED'` record.
   - Record `audit_logs` and dispatch notification.
4. **Task C-2.6B-04: Assignment History Endpoint**  
   Implement `getAssignmentHistory(reservationId)` in `frontOffice.service.js` querying `reservation_staff_assignments` joined with `users`.
5. **Task C-2.6B-05: Controller & Route Wiring**  
   Add endpoints to `frontOffice.controller.js` and `frontOffice.routes.js`.
6. **Task C-2.6B-06: Backend Automated Integration Test Suite**  
   Create `backend/tests/frontOfficeHandoverReassignment.test.js` validating:
   - Successful single and bulk handover.
   - Concurrency conflict detection (409).
   - Cross-property rejection (403).
   - Mandatory reassignment reason enforcement (400).
   - Identity separation between `users.id` and `employees.id`.

### Package 2: Workspace B — Frontend Integration
1. **Task B-2.6B-01: API Client Extensions**  
   Add `handoverReservation`, `bulkHandover`, `reassignReservation`, and `getAssignmentHistory` to `frontend/src/services/api.js`.
2. **Task B-2.6B-02: Shift Handover Modal Component**  
   Create `frontend/src/components/portal/ShiftHandoverModal.jsx` featuring:
   - On-duty peer selection (filtered by property).
   - Multi-reservation selection review.
   - Handover notes input with character count.
   - Loading and error states.
3. **Task B-2.6B-03: Supervisor Reassign Modal Component**  
   Create `frontend/src/components/portal/SupervisorReassignModal.jsx` featuring:
   - Target staff selection.
   - Mandatory reason selector and custom notes input.
   - Audit warning banner.
4. **Task B-2.6B-04: Front Office Page Integration**  
   Update `frontend/src/pages/portal/FrontOfficePage.jsx`:
   - Add "Shift Handover" header action and batch handover toolbar.
   - Add "Reassign" button on booking cards visible only to Managers/Admins.
   - Add "History" button on booking cards opening the assignment audit modal.
5. **Task B-2.6B-05: Viewport Verification**  
   Verify responsive layouts across standard 8 viewports (320px to 1440px).

---

## 10. REQUIRED BUSINESS DECISIONS

Before proceeding to implementation, the following operational decisions are registered for user alignment:

### Decision Register

| ID | Decision Item | Recommended Option | Alternative Option | Impact |
| :--- | :--- | :--- | :--- | :--- |
| **DEC-2.6B-01** | **Handover Granularity** | **Hybrid:** Support both bulk handover of all active claims and granular single-booking handover. | Single-booking only. | Bulk handover allows seamless shift transitions without repetitive modal confirmations. |
| **DEC-2.6B-02** | **Shift-End Claim Policy** | **Claim Retention with Warning Banner:** Keep claims assigned to the receptionist upon clock-out, but display a warning banner on clock-out and allow managers to reassign. | Automatic Claim Release (revert to unassigned). | Automatic release risks unowned guest conversations slipping through unnoticed. |
| **DEC-2.6B-03** | **Handover Acceptance Model** | **Direct Push with Notification:** Outgoing receptionist directly assigns to incoming on-duty peer with instant transfer and notification. | Two-Party Handshake (incoming peer must click "Accept Handover"). | Direct push matches high-paced front-desk operational reality and prevents transfer delays. |

---

## 11. GIT AND DATABASE PRESERVATION EVIDENCE

### 11.1 Git Status Baseline Check
Executed via Node.js Git status verification:

```
Baseline Git Status:
- Branch: master
- HEAD Commit: 3075411a754fcb7801b4b5b023168df2d6d4f4f8
- Staged Files: 126
- Modified Unstaged Files: 63 (25 backend, 38 frontend)
- Untracked Files: 122
- Total Entries: 272
```

**Preservation Confirmation:**  
Zero application files, tests, fixtures, schemas, or migrations were modified, staged, unstaged, or deleted during this discovery assessment. All pre-existing work remains 100% intact.

### 11.2 Database Migration Verification
Queried live from MySQL `schema_migrations`:

```
Production DB (bfa_apartments_db):
- Applied Migrations: 30
- Latest Migration: 030_kiosk_credential_security_and_geofence_review.sql

Test DB (bfa_apartments_test_db):
- Applied Migrations: 31
- Latest Migration: 031_maintenance_evidence_and_dispatch_verification.sql
```

**Preservation Confirmation:**  
Zero database write queries, migrations, or DDL operations were executed against either database.

---

## 12. EXPLICIT LIST OF INSPECTED FILES

1. `backend/src/db/migrations/026_property_governance_and_staff_operations.sql` (Inspected assignment ledger DDL)
2. `backend/src/db/migrations/028_workforce_roster_and_property_media.sql` (Inspected roster/shifts DDL)
3. `backend/src/db/migrations/029_role_migration_operations_manager_and_attendance_policy.sql` (Inspected role migrations)
4. `backend/src/db/migrations/030_kiosk_credential_security_and_geofence_review.sql` (Inspected production migration baseline)
5. `backend/src/db/migrations/031_maintenance_evidence_and_dispatch_verification.sql` (Inspected test migration baseline)
6. `backend/src/modules/frontOffice/frontOffice.routes.js` (Inspected active front-office endpoints and role guards)
7. `backend/src/modules/frontOffice/frontOffice.controller.js` (Inspected controller request/response handling)
8. `backend/src/modules/frontOffice/frontOffice.service.js` (Inspected front-office service delegations)
9. `backend/src/modules/frontOffice/frontOffice.repository.js` (Inspected query structures and joins)
10. `backend/src/modules/reservations/reservations.service.js` (Inspected `claimReservation` concurrency, locking, and activity logging)
11. `backend/src/modules/reservations/reservations.routes.js` (Inspected reservation lifecycle endpoints)
12. `backend/src/modules/workforce/identityResolver.service.js` (Inspected user vs employee identity resolution)
13. `backend/src/modules/workforce/roster.service.js` (Inspected shift scheduling and property scoping)
14. `backend/src/modules/workforce/attendance.service.js` (Inspected clock-in/out records and shift links)
15. `backend/src/modules/maintenance/maintenance.service.js` (Inspected technician dispatch and workload guards)
16. `backend/src/modules/notifications/notifications.service.js` (Inspected notification recipient model)
17. `backend/src/core/middleware/authContext.js` (Inspected role normalization and authentication guards)
18. `backend/src/core/security/security.js` (Inspected role definitions)
19. `frontend/src/pages/portal/FrontOfficePage.jsx` (Inspected Claim Desk UI, filters, and claim actions)
20. `frontend/src/services/api.js` (Inspected frontend API client integration)

---

## 13. FINAL READINESS VERDICT

```
================================================================================
FINAL VERDICT: READY FOR USER AUTHORIZATION
================================================================================
```

Stage 2.6B is structurally, architecturally, and safely prepared for implementation:
- The database schema is 100% in place and requires **zero migrations**.
- The transactional concurrency patterns (`pool.withTransaction`, `SELECT ... FOR UPDATE`, `ConflictError`) are proven and ready for reuse.
- The identity boundary between `users.id` and `employees.id` is fully supported by `IdentityResolverService`.
- The implementation boundaries between Workspace C (Backend API) and Workspace B (Portal Frontend) are clearly isolated and defined.

**Next Action:** Awaiting explicit user authorization to begin Stage 2.6B implementation.

