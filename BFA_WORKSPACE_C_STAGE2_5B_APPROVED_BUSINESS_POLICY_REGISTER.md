# BFA WORKSPACE C — STAGE 2.5B
# APPROVED BUSINESS POLICY REGISTER
## Authoritative Executive Determinations for Advanced Dispatch & Field Execution

**Milestone:** Stage 2.5B Backend Prerequisites  
**Workspace:** C — Backend, Database, APIs and Security Architecture  
**Document Type:** BINDING BUSINESS POLICY REGISTER (Documentation-Only)  
**Approval Authority:** BFA Project Owner / Executive Management  
**Approval Date:** 2026-11-03  
**Status:** **APPROVED BY PROJECT OWNER — IMPLEMENTATION NOT YET AUTHORIZED**  
**Reference Technical Documents:**  
- [`BFA_WORKSPACE_C_STAGE2_5B_BACKEND_TECHNICAL_IMPLEMENTATION_PLAN.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_C_STAGE2_5B_BACKEND_TECHNICAL_IMPLEMENTATION_PLAN.md)  
- [`BFA_WORKSPACE_C_STAGE2_5B_POLICY_AND_ARCHITECTURE_DECISION_REGISTER.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_C_STAGE2_5B_POLICY_AND_ARCHITECTURE_DECISION_REGISTER.md)  
- [`BFA_WORKSPACE_C_STAGE2_5B_FINAL_CORRECTION_VERIFICATION.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_C_STAGE2_5B_FINAL_CORRECTION_VERIFICATION.md)  

---

## 1. Executive Statement & Scope of Approval

On **3 November 2026**, the BFA Project Owner formally reviewed the Stage 2.5B Decision Register and issued binding executive approvals on all five outstanding business policy decisions (**DEC-2.5B-01 through DEC-2.5B-05**).

> [!IMPORTANT]
> **Implementation Boundary Notice:**  
> The approval of these business policies establishes the binding operational rules and constraints for Stage 2.5B backend architecture. **Approval of these policies does NOT constitute authorization to begin code implementation, migration execution, or database modifications.** Implementation of Packages A, B, C, and D remains strictly unauthorized until an explicit implementation commencement order is issued.

---

## 2. Binding Approved Business Decisions Matrix

The following determinations are authoritative and supersede all preliminary or draft policy recommendations across Workspaces B and C:

| Decision ID | Domain | Approved Option | Binding Corporate Policy | Executive Approval Date |
| :---: | :---: | :---: | :--- | :---: |
| **DEC-2.5B-01** | **Identity Resolution** | **Option A** | **Formal Employee Onboarding Required Before Dispatch:**<br>All internal property staff must have an authoritative, verified employee record in `employees` before being eligible for maintenance dispatch. Corporate email matching (`users.email === employees.email`) identifies potential identity candidates but **never automatically links records**. Explicit administrative confirmation is required. Automated batch profile creation and data fabrication are strictly prohibited. Unmapped staff (`users.id = 8` Tunde Bakare and `users.id = 9` Amara Nwosu) must be onboarded through standard HR procedures. | **2026-11-03**<br>*(APPROVED)* |
| **DEC-2.5B-02** | **Geofence Exception Dispatch** | **Option A** | **Permissive Dispatch During Review with Visible Audit Warning:**<br>Dispatch is permitted when an employee has clocked in with an active geofence review exception (`requires_review = TRUE`). The original punch timestamp, coordinates, and Option A attendance policy (DEF-C02) are fully preserved without alteration. The dispatch interface must display a prominent amber attendance exception warning chip (`ATTENDANCE_UNDER_REVIEW`), and dispatch execution must write an immutable audit event: `DISPATCH_WITH_ATTENDANCE_EXCEPTION`. | **2026-11-03**<br>*(APPROVED)* |
| **DEC-2.5B-03** | **Workload Capacity** | **Option B** | **Configurable Workload Warning Threshold (No Hard Cap):**<br>Workload capacity is managed via an advisory, configurable warning threshold per property (e.g. 4 or 5 active tickets). **No hard assignment limit, hard blocking rejection, or manager override mechanism is authorized initially.** Dispatchers are alerted with a visual warning when a technician exceeds the configured threshold, but the system allows assignment without blocking operational emergencies. | **2026-11-03**<br>*(APPROVED)* |
| **DEC-2.5B-04** | **Post-Repair Evidence** | **Option C** | **Flexible Evidence with Documented Written Exemptions:**<br>Post-repair photographic evidence (`MAINTENANCE_AFTER`) is expected by default, but is flexible. The system provides formal **Documented Written Exemptions** for legitimate operational circumstances where photography is inappropriate or impossible (tenant in-suite privacy requested, life-safety emergency containment, mobile camera failure, non-visual circuit/sensor reset). Resolution is never blocked if a valid exemption reason is recorded. | **2026-11-03**<br>*(APPROVED)* |
| **DEC-2.5B-05** | **Contractor Scope** | **Option A** | **External Vendors Deferred to Stage 3:**<br>External contractors, third-party maintenance specialists, and facility vendors are formally deferred to Stage 3 (Contractor Management Module). Stage 2.5B will not introduce contractor flags, vendor dispatch logic, or synthetic contractor accounts into internal employee rosters. | **2026-11-03**<br>*(APPROVED)* |

---

## 3. Explicit Revocation & Supersession Register

To prevent architectural ambiguity during future implementation, the following preliminary proposals are **formally revoked and superseded**:

1. **REVOKED — Hardcoded / Hard Workload Cap (5 Tickets):**  
   *Preliminary Proposal:* Server-side rejection (`422 Conflict`) when active tickets $\ge 5$, requiring a complex manager override parameter (`overrideWorkloadCap: true`).  
   *Authoritative Supersession:* **Superseded by DEC-2.5B-03 (Option B).** Workload management will function strictly as an **advisory warning threshold**. The backend calculation (`SELECT COUNT(*) ...`) will return the active count and a warning flag (`isOverloaded: true`), but `POST /api/v1/maintenance/:id/assign` and ticket creation will **not block** assignment.
2. **REVOKED — Automated Batch Employee Backfills:**  
   *Preliminary Proposal:* Executing SQL scripts generating synthetic employee rows (`EMP-AUTO-...`) with assumed hire dates and titles.  
   *Authoritative Supersession:* **Superseded by DEC-2.5B-01 (Option A).** Real HR documentation and formal onboarding via existing [`EmployeesService.createEmployee`](file:///c:/xampp/htdocs/BFA/backend/src/modules/employees/employees.service.js) are mandatory.
3. **REVOKED — Blanket Mandatory Photo Uploads:**  
   *Preliminary Proposal:* Strict validation blocking ticket resolution unless at least one image file was uploaded.  
   *Authoritative Supersession:* **Superseded by DEC-2.5B-04 (Option C).** Resolution accepts either uploaded evidence OR an authorized written exemption enum (`photo_exemption_reason`).
4. **REVOKED — Contractor Dispatch in Stage 2.5B:**  
   *Preliminary Proposal:* Adding `contractor_type` enums to `users` and bypassing roster requirements for external vendors.  
   *Authoritative Supersession:* **Superseded by DEC-2.5B-05 (Option A).** Fully deferred to Stage 3.

---

## 4. Technical Architecture Alignment Matrix

The approved business decisions align cleanly with the technical safety specifications established in [`BFA_WORKSPACE_C_STAGE2_5B_FINAL_CORRECTION_VERIFICATION.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_C_STAGE2_5B_FINAL_CORRECTION_VERIFICATION.md):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ APPROVED BUSINESS POLICIES                  TECHNICAL IMPLEMENTATION ALIGNMENT         │
├────────────────────────────────────────────┬───────────────────────────────────────────┤
│ DEC-2.5B-01: Formal HR Onboarding Required │ IdentityResolverService validates link    │
│              (Option A)                    │ between users.id and employees.user_id.   │
│                                            │ Rejects unlinked accounts from dispatch.  │
├────────────────────────────────────────────┼───────────────────────────────────────────┤
│ DEC-2.5B-02: Permissive Geofence Dispatch  │ GET /eligible-technicians computes status │
│              with Audit (Option A)         │ ATTENDANCE_UNDER_REVIEW with distance.    │
│                                            │ POST /assign records audit warning event. │
├────────────────────────────────────────────┼───────────────────────────────────────────┤
│ DEC-2.5B-03: Configurable Workload Warning │ Concurrency guard locks user row; returns │
│              (Option B)                    │ activeCount; sets warning chip in UI.     │
│                                            │ Eliminates manager override complexity.   │
├────────────────────────────────────────────┼───────────────────────────────────────────┤
│ DEC-2.5B-04: Flexible Evidence with        │ POST /resolve accepts evidence attachment │
│              Written Exemption (Option C)  │ OR photo_exemption_reason enum.           │
│                                            │ Preserves guest privacy and safety.       │
├────────────────────────────────────────────┼───────────────────────────────────────────┤
│ DEC-2.5B-05: Defer Contractors to Stage 3  │ Zero schema creep in Migration 031;       │
│              (Option A)                    │ Stage 2.5B restricted to internal staff.  │
└────────────────────────────────────────────┴───────────────────────────────────────────┘
```

---

## 5. Technical Specification & Verification Baseline Preservation

The approved policies do not compromise or invalidate the hardened technical architecture established in previous reviews. The following documents remain authoritative for technical execution:

1. **[`BFA_WORKSPACE_C_STAGE2_5B_BACKEND_TECHNICAL_IMPLEMENTATION_PLAN.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_C_STAGE2_5B_BACKEND_TECHNICAL_IMPLEMENTATION_PLAN.md):**  
   Provides the comprehensive technical roadmap, API endpoint schemas, and RBAC authorization matrices.
2. **[`BFA_WORKSPACE_C_STAGE2_5B_FINAL_TECHNICAL_SAFETY_REVIEW.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_C_STAGE2_5B_FINAL_TECHNICAL_SAFETY_REVIEW.md):**  
   Provides the mathematical row-level locking specification on `users`, deadlock prevention hierarchy, and 4-package decomposition.
3. **[`BFA_WORKSPACE_C_STAGE2_5B_FINAL_CORRECTION_VERIFICATION.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_C_STAGE2_5B_FINAL_CORRECTION_VERIFICATION.md):**  
   Provides the filesystem crash-recovery protocol (24h quarantine threshold, same-volume `temp/` staging, canonical realpath checks) and the updated Migration 031 specification containing the immutable `work_order_reference VARCHAR(50)` archival snapshot column with `ON DELETE SET NULL`.

---

## 6. Implementation Readiness & Boundary Gate

```
========================================================================================
STAGE 2.5B READINESS STATUS SUMMARY
========================================================================================
Technical Architecture:     100% COMPLETE & HARDENED (Packages A–D fully specified)
Business Policies:          100% APPROVED (DEC-2.5B-01 through DEC-2.5B-05 resolved)
Implementation Execution:   UNAUTHORIZED (Pending explicit implementation order)
Database Integrity:         PRISTINE (Zero migrations run; zero records altered)
Git Working Tree:           PRISTINE (Zero files staged or committed)
========================================================================================
```

---

# BUSINESS POLICIES APPROVED — IMPLEMENTATION NOT YET AUTHORIZED.
