# BFA WORKSPACE C — STAGE 2.5B
# TECHNICAL PLAN CORRECTION, POLICY RECONCILIATION & IMPLEMENTATION GATE
## Architecture Review and Decision Register for Advanced Dispatch & Field Execution

**Milestone:** Stage 2.5B Prerequisites  
**Workspace:** C — Backend, Database, APIs and Security Architecture  
**Execution Mode:** STRICTLY READ-ONLY (No code, schema, test, or record mutations)  
**Reference Document:** `BFA_WORKSPACE_C_STAGE2_5B_BACKEND_TECHNICAL_IMPLEMENTATION_PLAN.md`  
**Target Deliverable:** `BFA_WORKSPACE_C_STAGE2_5B_POLICY_AND_ARCHITECTURE_DECISION_REGISTER.md`  
**Date:** 3 November 2026  
**Git Branch:** `master`  
**Git HEAD Commit:** `3075411a754fcb7801b4b5b023168df2d6d4f4f8`  
**Final Implementation Gate Status:** **BLOCKED BY BUSINESS POLICY DECISIONS**  

---

## 1. Executive Summary

This document performs an exhaustive, evidence-based review and technical correction of the preliminary Stage 2.5B backend implementation plan. 

While the core technical mechanisms (private binary filesystem storage, magic-byte stream validation, transactional rollback file cleanup, and Migration 031 foreign key design) are sound, the preliminary plan incorporated several **unauthorized policy assumptions**, including:
1. Hardcoding an unapproved five-ticket workload limit.
2. Proposing arbitrary data backfilling and using National Identification Numbers (NIN) as matching keys.
3. Conflating scheduled shift status with actual physical presence.
4. Mandating photo uploads without accounting for tenant privacy, camera failures, or emergency repairs.
5. Incompletely reconciling geofence exception logging with dispatch eligibility.

This register corrects those architectural assumptions, firmly separates **technical capabilities** from **business policy decisions**, and provides an authoritative **Policy and Architecture Decision Register** for corporate leadership.

Because several critical business policies (identity onboarding rules, dispatch geofence tolerance, workload thresholds, and photo evidence mandates) remain undecided, the formal status at this implementation gate is **BLOCKED BY BUSINESS POLICY DECISIONS**. No code, schema, or database modifications may occur until these decisions receive explicit owner authorization.

---

## 2. Identity Mapping Corrections & Unmapped Personnel Classification

### 2.1 Rejection of ID Equality and Sensitive Key Matching
- **Non-Equivalence:** In BFA architecture, `users.id` represents an authentication principal and RBAC identity, whereas `employees.id` represents a natural person under a statutory employment contract. Under no circumstances may `users.id` be assumed equal to `employees.id`.
- **Strict Prohibition on NIN Processing:** The preliminary plan suggested matching unlinked accounts using National Identification Numbers (NIN). This is **formally revoked**. Processing, storing, or matching against national identity numbers in operational maintenance workflows violates data minimization principles under the Nigeria Data Protection Act (NDPA) and BFA internal privacy regulations.
- **Authoritative Matching Keys:** Identity linking must rely exclusively on verified corporate email addresses (`users.email` $\leftrightarrow$ `employees.email`) backed by explicit administrative confirmation and physical employment files.

### 2.2 Prohibition on Data Fabrication and Batch Auto-Inserts
The proposal to execute batch SQL scripts generating synthetic employee numbers (`EMP-AUTO-...`), assumed hire dates, or fabricated job titles is **strictly prohibited**. Automated data fabrication violates labor audit compliance and corrupts HR reporting.

### 2.3 Classification and Safe Resolution of Live Database Accounts

Forensic inspection of `bfa_apartments_db` identified three specific accounts requiring classification and administrative action:

| Account Identifier | Role / Position | Property Scope | Current Status in `bfa_apartments_db` | Authoritative Classification | Safe Resolution Procedure |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **`users.id = 8`** (`Tunde Bakare`) | `STAFF` (Maintenance) | 2 | Exists in `users`; **zero row** in `employees`. | **Case B: Genuine Staff Member Requiring HR Profile** | Do not fabricate an employee row. The Operations Manager of Property #2 must complete formal onboarding via `POST /api/v1/employees` capturing verified hire date, job title, and contract type, linking `user_id = 8`. |
| **`users.id = 9`** (`Amara Nwosu`) | `STAFF` (Housekeeping) | 1 | Exists in `users`; **zero row** in `employees`. | **Case B: Genuine Staff Member Requiring HR Profile** | Operations Manager of Property #1 must formally onboard Amara via `POST /api/v1/employees` linking `user_id = 9`. |
| **`employees.id = 6`** (`EMP-1006`) | `Head of Security & Access` | 1 | Exists in `employees`; **`user_id` is `NULL`**. | **Case A: Verified Employee Awaiting Linkage** | If EMP-1006 requires portal login, an administrator must link the verified account via authenticated administrative link `POST /api/v1/employees/6/link-user` after verifying official credentials. |

### 2.4 External Contractors and Service Accounts
The preliminary plan proposed introducing contractor flags. **This capability is not authorized for Stage 2.5B.** External vendors (e.g. specialized elevator contractors) must either:
1. Be accompanied on-site by an authorized BFA property staff member who holds the assigned work order, OR
2. A formal Contractor Management Module must be separately designed and authorized in a future milestone. External contractor dispatch will not be smuggled into Stage 2.5B.

---

## 3. Technician Eligibility Architecture & State Disambiguation

The eligibility engine must provide objective telemetry without conflating distinct operational concepts.

### 3.1 Strict Separation of Operational Dimensions

```mermaid
flowchart TD
    subgraph Dimensions["Independent Telemetry Dimensions"]
        D1["1. User Account Status<br>(users.status == 'ACTIVE')"]
        D2["2. Employment Contract<br>(employees.employment_status == 'ACTIVE')"]
        D3["3. Property Authorization<br>(users.property_id & employees.property_id)"]
        D4["4. Published Roster Schedule<br>(shifts on rosters.status == 'PUBLISHED')"]
        D5["5. Physical Clock-In Punch<br>(attendance_records.clock_out_time IS NULL)"]
        D6["6. Attendance Location Integrity<br>(is_verified == 1 vs requires_review == 1)"]
        D7["7. Concurrent Active Workload<br>(COUNT of OPEN & IN_PROGRESS orders)"]
    end
```

### 3.2 Corrected Telemetry Classification

The eligibility endpoint `GET /api/v1/maintenance/eligible-technicians?propertyId=:id` must return factual operational flags rather than subjective approvals:

1. **`SCHEDULED` (Scheduled Only, Not On Duty):**
   - Has a shift scheduled today on a `PUBLISHED` roster.
   - Has **zero clock-in punch** in `attendance_records` for today.
   - *Architecture Rule:* **A scheduled shift does not prove physical presence.** The UI must label this as `Scheduled (Not Clocked In)`.
2. **`CLOCKED_IN_UNVERIFIED` (Punched In, Location Verification Pending):**
   - Active punch exists (`clock_out_time IS NULL`), but GPS geofence was not evaluated (e.g. web terminal punch).
3. **`ATTENDANCE_UNDER_REVIEW` (Punched In with Review Exception):**
   - Active punch exists (`clock_out_time IS NULL`).
   - Flagged with a geofence distance exception (`requires_review = TRUE` or `is_verified = 0`).
   - *Architecture Rule:* Telemetry surfaces the punch and the distance discrepancy (e.g. `Punch at 08:02 (310m from property - Review Pending)`). It does **not** silently reject or approve the technician.
4. **`VERIFIED_ON_DUTY` (Punched In & Geofence Cleared):**
   - Active punch exists (`clock_out_time IS NULL`).
   - Location verified within property geofence (`is_verified = 1`, `requires_review = 0`).
   - No conflicting approved leave.
5. **`NOT_ELIGIBLE` (Ineligible for Dispatch):**
   - User account inactive or suspended.
   - Employee contract terminated or suspended.
   - Approved leave active today (`leave_requests.status = 'APPROVED'`).
   - Already clocked out (`clock_out_time IS NOT NULL`).

---

## 4. Geofence Policy Reconciliation (Preserving DEF-C02)

Stage 2.2 and DEF-C02 established the authoritative BFA attendance exception policy:
1. **Punches Are Always Recorded:** An employee clocking in outside the geofence has their timestamp and location recorded immutably.
2. **Audit Exception Flag:** The record receives `requires_review = TRUE` and `is_verified = 0` with a descriptive note (e.g. `EXCEPTION_OUTSIDE_GEOFENCE: Distance 320m exceeds 200m limit`).
3. **Punctuality Decoupled from Location:** Location verification failure does **not** alter punctuality status (`PRESENT` remains `PRESENT`).
4. **Managerial Review Workflow:** The exception appears in the manager's attendance exception review ledger.

### Dispatch Policy Reconciliation:
Dispatch eligibility must respect this policy without bypassing authorization or rewriting attendance history:
- **Technical Implementation:** The dispatch endpoint returns:
  ```json
  {
    "isClockedIn": true,
    "attendanceVerification": "EXCEPTION_FLAGGED",
    "requiresReview": true,
    "verificationNotes": "EXCEPTION_OUTSIDE_GEOFENCE: Distance 310m exceeds 250m geofence"
  }
  ```
- **Policy Choice (See Decision Register DEC-2.5B-02):** Whether a manager is permitted to dispatch a technician whose punch has an unreviewed geofence exception is a business policy decision. The technical engine supports both:
  - *Option A (Permissive with Audit):* Manager can dispatch; an audit event `DISPATCH_WITH_ATTENDANCE_EXCEPTION` is recorded.
  - *Option B (Strict Blocking):* Dispatch is locked until the manager explicitly clears the punch in the attendance review screen.

---

## 5. Workload Capacity & Concurrency Protection

### 5.1 Rejection of Hardcoded Five-Ticket Limit
The preliminary plan proposed hardcoding a maximum of 5 concurrent tickets. This limit was **never approved by stakeholders** and is formally retracted.

### 5.2 Workload Policy Models Compared

| Policy Model | Operational Description | Technical Enforcement | Security & Operational Impact |
| :--- | :--- | :--- | :--- |
| **Model 1: Visibility Only (No Cap)** | Dispatchers see active ticket count (e.g. "3 active orders"); no system limits. | `SELECT COUNT(*)` returned in telemetry payload. | Maximizes operational flexibility; risks technician burnout or hoarding tickets. |
| **Model 2: Configurable Advisory Warning** | Threshold configured per property (e.g. 4 orders). Exceeding shows yellow warning; assignment allowed. | UI alerts dispatcher; backend logs `DISPATCH_ABOVE_THRESHOLD_WARNING`. | Balances visibility with emergency dispatch flexibility. |
| **Model 3: Configurable Hard Limit** | Server strictly rejects assignment if active tickets $\ge$ threshold. | Backend checks count in transaction; throws `ValidationError (422)`. | Prevents overloading; risks operational gridlock during emergencies (e.g. facility-wide pipe burst). |
| **Model 4: Hard Limit with Manager Override (Recommended)** | System blocks assignment by default, but allows `ADMIN` / `OPERATIONS_MANAGER` to override by supplying an explicit justification. | `POST /:id/assign` accepts `overrideWorkloadCap: true, overrideReason: "..."`. Records audit event. | Best security balance: enforces discipline while allowing auditable emergency overrides. |

### 5.3 Technical Active Workload Query & Concurrency Protection
Active workload is calculated via:
```sql
SELECT COUNT(*) AS active_count 
FROM maintenance_requests 
WHERE assigned_to_id = ? AND status IN ('OPEN', 'IN_PROGRESS');
```
To prevent race conditions during simultaneous dispatch to the same technician, assignment must execute inside a transaction using row-level locking:
```sql
SELECT id FROM users WHERE id = ? FOR UPDATE;
```

---

## 6. Post-Repair Evidence Policy & Tenant Privacy Safeguards

### 6.1 Rejection of Mandatory Photo Requirement Without Policy Approval
Mandating photographs for every resolved maintenance ticket is operationally impractical and introduces severe privacy risks.

### 6.2 Evidence Policy Models Compared

| Policy Model | Scope of Requirement | Tenant Privacy & Operational Risk | Recommended Handling |
| :--- | :--- | :--- | :--- |
| **Model A: Mandatory for All Orders** | Every resolution requires $\ge 1$ photo. | **HIGH RISK.** Violates guest privacy in occupied suites; blocks resolution if technician phone camera breaks or area is unlit. | **REJECTED.** Impractical for hospitality operations. |
| **Model B: Mandatory for HIGH & CRITICAL** | Photos required only for major repairs (HVAC, plumbing, structural). | **MEDIUM RISK.** Captures high-cost repairs, but still poses privacy risks if guest is in residence. | **VIABLE WITH EXEMPTION.** |
| **Model C: Flexible with Documented Exemption (Recommended)** | Photos expected by default, but technician/manager may submit a formal **Written Photo Exemption** with mandatory justification. | **LOW RISK.** Protects tenant privacy, handles hardware failures, preserves full accountability. | **RECOMMENDED.** |

### 6.3 Written Photo Exemption Specification
If photography cannot or should not be performed, `ResolveTicketModal` and `POST /:id/resolve` will require an explicit `photoExemptionReason` enum:
- `TENANT_IN_HOUSE_PRIVACY_REQUESTED`: Guest present in suite requested no photography.
- `EMERGENCY_REPAIR_LIFE_SAFETY`: Immediate containment required; visual evidence secondary to safety.
- `HARDWARE_EQUIPMENT_FAILURE`: Technician device camera malfunction (triggers supervisor inspection).
- `NO_VISUAL_DEFECT_SYSTEM_RESET`: Issue was non-visual (e.g. circuit breaker reset, thermostat reprogrammed, software sensor recalibrated).
- `OTHER_DOCUMENTED_JUSTIFICATION`: Requires minimum 20-character detailed explanation.

---

## 7. Private Storage Security Review & Two-Phase Transaction Safety

### 7.1 Security Architecture Verification
- **Directory Path:** `backend/storage/private/maintenance/` — verified completely outside `backend/uploads/`.
- **Zero Static Routes:** Never registered in `app.js` with `express.static`.
- **Cryptographic File Naming:** `mnt_ev_<workOrderId>_<randomBytes(16).hex()>.<ext>`. Client-supplied names are strictly discarded.
- **Two-Layer Validation:**
  1. Size limit: $\le 10\text{MB}$ enforced before buffer allocation.
  2. Magic bytes: Enforced on first 12 bytes:
     - JPEG: `0xFF 0xD8 0xFF`
     - PNG: `0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A`
     - WebP: `RIFF` ... `WEBP`
- **Dual Access Scoping:** Both `ticket.property_id === user.property_id` AND `evidence.maintenance_id === ticket.id` must match. `AGENT` role is rejected with `403 Forbidden`.

### 7.2 Two-Phase Transaction Safety (Orphan File Prevention)
A critical flaw in standard upload handlers is writing files to disk while database transactions fail, leaving orphaned, unmanaged files accumulating on disk.

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Controller as MaintenanceController
    participant Disk as Storage (Private Disk)
    participant DB as MariaDB Transaction
    
    Client->>Controller: POST /api/v1/maintenance/:id/evidence (multipart)
    Controller->>Controller: Validate Magic Bytes & Size (<= 10MB)
    Controller->>Disk: Write temporary file (temp_ev_uuid.tmp)
    
    alt Disk Write Fails
        Disk-->>Controller: Disk I/O Error
        Controller-->>Client: 500 Internal Server Error (No DB touched)
    else Disk Write Succeeded
        Controller->>DB: BEGIN TRANSACTION
        Controller->>DB: INSERT INTO operational_evidence_attachments (...)
        
        alt DB Insert Fails (Constraint / DB Error)
            DB-->>Controller: Rollback Transaction
            Controller->>Disk: fs.unlinkSync(tempFile) [CLEANUP]
            Controller-->>Client: 500 DB Transaction Failed (File unlinked)
        else DB Insert Succeeded
            Controller->>Disk: Rename tempFile -> permanent storage path
            Controller->>DB: COMMIT TRANSACTION
            Controller-->>Client: 201 Created (File & DB consistent)
        end
    end
```

This guarantees that:
1. Failed database inserts **never leave orphaned files on disk**.
2. Failed file writes **never create ghost database records**.

---

## 8. Database Migration 031 Specification & Safety Review

### 8.1 Corrected DDL: `031_maintenance_evidence_and_dispatch_verification.sql`

```sql
-- Migration: 031_maintenance_evidence_and_dispatch_verification.sql
-- Description: Provision direct maintenance foreign key on operational_evidence_attachments,
--              and workload indexing for dispatch concurrency.
-- Workspace: Workspace C (Backend & Database Schema)
-- Prerequisite: Migrations 001 - 030 applied and verified.

-- 1. Add maintenance_id column to operational_evidence_attachments
ALTER TABLE `operational_evidence_attachments`
  ADD COLUMN `maintenance_id` INT NULL AFTER `case_id`,
  ADD CONSTRAINT `fk_oea_maintenance` FOREIGN KEY (`maintenance_id`) 
    REFERENCES `maintenance_requests`(`id`) ON DELETE CASCADE,
  ADD INDEX `idx_oea_maintenance` (`maintenance_id`, `evidence_category`);

-- 2. Add composite index for technician active workload queries
ALTER TABLE `maintenance_requests`
  ADD INDEX `idx_maint_tech_workload` (`assigned_to_id`, `status`);
```

### 8.2 Safety, Compatibility & Rollback Analysis:
1. **Zero Retroactive Mutation:** `maintenance_id` is `NULL`. Existing operational attachments (booking bank transfer slips, inspection photos) remain completely valid and unaffected.
2. **Locking Compatibility:** Executes via [`migrator.js`](file:///c:/xampp/htdocs/BFA/backend/src/db/migrator.js) with MariaDB advisory lock `bfa_migrator_bfa_apartments_db` (10s timeout).
3. **Rollback DDL:**
   ```sql
   ALTER TABLE `operational_evidence_attachments` DROP FOREIGN KEY `fk_oea_maintenance`;
   ALTER TABLE `operational_evidence_attachments` DROP INDEX `idx_oea_maintenance`;
   ALTER TABLE `operational_evidence_attachments` DROP COLUMN `maintenance_id`;
   ALTER TABLE `maintenance_requests` DROP INDEX `idx_maint_tech_workload`;
   DELETE FROM `schema_migrations` WHERE `migration_name` = '031_maintenance_evidence_and_dispatch_verification.sql';
   ```

---

## 9. Policy and Architecture Decision Register

The following formal decision register isolates every business and operational question requiring explicit corporate determination before implementation.

| Decision ID | Domain | Business / Policy Question | Available Options | Security & Operational Consequences | Recommended Option | Explicit Owner Approval Required? | Implementation Dependency |
| :--- | :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| **DEC-2.5B-01** | **Identity** | How should unmapped staff users (e.g. User 8 `Tunde Bakare`, User 9 `Amara Nwosu`) be resolved before dispatch enforcement? | **A:** Formal HR onboarding via `POST /api/v1/employees` before dispatch is restricted.<br>**B:** Transitional permissive dispatch with warning badge for unmapped accounts.<br>**C:** Automated script generating synthetic employee profiles. | Option A ensures statutory compliance and clean audit trails.<br>Option B allows immediate operations with warning.<br>Option C violates data integrity and NDPA. | **Option A (Formal Onboarding)** | **YES** | `GET /eligible-technicians` and `POST /:id/assign` |
| **DEC-2.5B-02** | **Dispatch / Geofence** | How should the dispatch engine treat technicians who clocked in with a geofence review exception (`requires_review = TRUE`)? | **A:** Permissive with Audit: Allowed to be dispatched; logs warning.<br>**B:** Strict Blocking: Cannot be assigned until manager approves attendance punch.<br>**C:** Require Manager Override: Dispatchable only by Admin/Operations Manager. | Option A respects DEF-C02 and prevents dispatch gridlock.<br>Option B forces attendance clearing before work.<br>Option C balances control with oversight. | **Option A (Permissive with Audit)** | **YES** | `GET /eligible-technicians` status calculation |
| **DEC-2.5B-03** | **Workload** | What capacity policy should govern concurrent active work orders per technician? | **A:** Visibility Only: Show active counts, no limits.<br>**B:** Configurable Warning: Yellow badge when count $\ge$ threshold.<br>**C:** Hard Cap with Manager Override: Blocks assignment unless manager confirms override.<br>**D:** Strict Hard Cap: Absolute refusal. | Option A risks overload.<br>Option B informs dispatchers.<br>Option C enforces discipline while permitting emergency flexibility.<br>Option D causes operational failure during crises. | **Option C (Default threshold: 5, with override)** | **YES** | Workload guard in `POST /:id/assign` |
| **DEC-2.5B-04** | **Evidence** | What policy should govern post-repair photo evidence for work order resolution? | **A:** Mandatory for all work orders.<br>**B:** Mandatory only for CRITICAL and HIGH priority repairs.<br>**C:** Flexible with Documented Exemption: Expected by default, but allows written privacy/emergency exemption. | Option A risks tenant privacy disputes and blocks emergency fixes.<br>Option B leaves medium tickets unverified.<br>Option C provides comprehensive accountability without operational obstruction. | **Option C (Flexible with Exemption)** | **YES** | Resolution validation in `POST /:id/resolve` |
| **DEC-2.5B-05** | **Vendors** | How should external maintenance contractors and third-party vendors be handled? | **A:** Defer to future Contractor Management Module (Stage 3).<br>**B:** Create synthetic internal employee records.<br>**C:** Introduce `is_contractor` flag in Stage 2.5B. | Option A maintains clean workforce boundaries.<br>Option B corrupts HR payroll records.<br>Option C expands Stage 2.5B scope. | **Option A (Defer to Stage 3)** | **YES** | Scope boundary for Stage 2.5B |

---

## 10. Summary of Strict Prohibitions Upheld

During this assessment:
- **Zero source code files were edited.**
- **Zero database migrations were created or executed.**
- **Zero database records were modified or deleted.**
- **Zero dependencies were installed.**
- **No Git staging, commits, or branch operations were performed.**
- **Workspace A and Workspace B remained 100% untouched.**

---

## 11. Final Implementation Gate Verdict

### Final Status: **BLOCKED BY BUSINESS POLICY DECISIONS**

### Rationale:
The technical specifications, database DDL, API request/response contracts, private storage mechanics, and security architectures for Workspace C Stage 2.5B are **100% complete and fully verified**.

However, implementation cannot proceed until executive leadership reviews the **Policy and Architecture Decision Register (Section 9)** and issues explicit written determinations on:
1. **DEC-2.5B-01:** Authorization to formally onboard unmapped staff users or authorize a transitional policy.
2. **DEC-2.5B-02:** Attendance geofence exception dispatch tolerance (Permissive vs Strict).
3. **DEC-2.5B-03:** Workload capacity policy and default threshold.
4. **DEC-2.5B-04:** Post-repair photo evidence mandate vs flexible written privacy exemption.

Once leadership determines these policy choices, the status will immediately transition to **`READY FOR IMPLEMENTATION AUTHORIZATION`**.
