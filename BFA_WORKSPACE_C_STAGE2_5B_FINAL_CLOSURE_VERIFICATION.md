# BFA WORKSPACE C — STAGE 2.5B
# FINAL POLICY CONSISTENCY & HISTORICAL EVIDENCE ACCESS VERIFICATION

**Verification Milestone:** Stage 2.5B Backend Prerequisites Final Closure  
**Workspace:** C — Backend, Database, APIs and Security  
**Execution Mode:** STRICTLY READ-ONLY  
**Date:** 2026-11-04  
**Authoritative References:**  
- `BFA_WORKSPACE_C_STAGE2_5B_APPROVED_BUSINESS_POLICY_REGISTER.md`  
- `BFA_WORKSPACE_C_STAGE2_5B_POLICY_AND_ARCHITECTURE_DECISION_REGISTER.md`  
- `BFA_WORKSPACE_C_STAGE2_5B_PACKAGE_C_IMPLEMENTATION_REPORT.md`  
- `BFA_WORKSPACE_C_STAGE2_5B_PACKAGE_D_IMPLEMENTATION_REPORT.md`  
- `BFA_WORKSPACE_C_STAGE2_5B_PACKAGES_A_D_INDEPENDENT_AUDIT.md`  
**Closure Verdict:** **ACCEPTED WITH DOCUMENTED FOLLOW-UP**

---

## 1. OBJECTIVE & SCOPE OF VERIFICATION

Following the formal independent audit of Stage 2.5B Packages A, B, C, and D, this verification conducts a narrowly scoped, evidence-based review of two specific architectural and operational matters prior to formal stage closure:

1. **Check 1 — DEC-2.5B-04 Policy Consistency:**  
   Reconciliation of policy naming (Option B vs. Option C) and code-level verification of the documented written photo exemption engine against business requirements.
2. **Check 2 — Historical Evidence Retrieval After Work-Order Deletion:**  
   Complete lifecycle tracing of evidence metadata and physical files following work order deletion, evaluation of existing API retrieval paths, security analysis against unauthorized ID guessing, and definition of recommended follow-up architecture.

This review was conducted in strictly read-only mode. Zero source files, tests, migrations, or database records were modified.

---

## 2. CHECK 1: DEC-2.5B-04 POLICY CONSISTENCY & EXEMPTION ENGINE

### 2.1 The Authoritative Business Policy
In [`BFA_WORKSPACE_C_STAGE2_5B_APPROVED_BUSINESS_POLICY_REGISTER.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_C_STAGE2_5B_APPROVED_BUSINESS_POLICY_REGISTER.md#L37), executive management approved:

> **DEC-2.5B-04 (Option C) — Flexible Evidence with Documented Written Exemptions:**  
> *Post-repair photographic evidence (`MAINTENANCE_AFTER`) is expected by default, but is flexible. The system provides formal Documented Written Exemptions for legitimate operational circumstances where photography is inappropriate or impossible (tenant in-suite privacy requested, life-safety emergency containment, mobile camera failure, non-visual circuit/sensor reset). Resolution is never blocked if a valid exemption reason is recorded.*

### 2.2 Root Cause of the "Option B" vs. "Option C" Discrepancy
The audit traced the origin of the label discrepancy across project documents:
1. In the initial decision register [`BFA_WORKSPACE_C_STAGE2_5B_POLICY_AND_ARCHITECTURE_DECISION_REGISTER.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_C_STAGE2_5B_POLICY_AND_ARCHITECTURE_DECISION_REGISTER.md#L166-L171), three models were evaluated:
   - *Model A:* Mandatory for All Orders (Rejected).
   - *Model B:* Mandatory for High & Critical (Viable with Exemption).
   - *Model C:* Flexible with Documented Exemption (Recommended).
2. The Project Owner formally approved **Model C**, which was recorded in `BFA_WORKSPACE_C_STAGE2_5B_APPROVED_BUSINESS_POLICY_REGISTER.md` as **Option C**.
3. In subsequent user authorization prompts, a typographical label error occurred in the prompt markdown table, which referenced DEC-2.5B-04 as "Option B" while describing the exact text of Option C (*"Flexible repair-photo evidence with documented written exemptions"*).
4. The Package C implementation report and subsequent audit reports mirrored this label typo ("Option B") while referencing and implementing the exact requirements of Option C.

**Documentation Correction Recommended:** Update documentation references in implementation report headers from "Option B" to **"Option C"** for precise alignment with the approved policy register.

### 2.3 Code-Level Verification of Exemption Implementation
The implementation was inspected in [`backend/src/modules/maintenance/maintenance.service.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js):

- **Approved Reason Codes Enforced (Lines 1015-1021):**
  ```javascript
  const ALLOWED_EXEMPTIONS = [
    'TENANT_PRIVACY',
    'PRIVACY_RESTRICTION',
    'EMERGENCY_CONTAINMENT',
    'DEVICE_FAILURE',
    'NON_VISUAL_REPAIR',
    'OTHER'
  ];
  ```
  Any reason code outside this set is rejected with `ValidationError (422)`.
- **Mandatory Justification Notes (Lines 1022-1024):**
  ```javascript
  if (!exemptionNotes || exemptionNotes.trim().length < 3) {
    throw new ValidationError('A documented explanation (minimum 3 characters) is required for written evidence exemption.');
  }
  ```
  Exemptions with empty, missing, or trivial notes are rejected with `ValidationError (422)`.
- **Zero Evidence Fabrication (Lines 1025-1050):**
  Documenting an exemption **does NOT** insert dummy records into `operational_evidence_attachments` or write fake placeholder image files to disk.
- **Immutable Audit Logging (Lines 1026-1039):**
  Every recorded exemption writes an immutable audit record:
  ```json
  {
    "action": "MAINTENANCE_EVIDENCE_EXEMPTION",
    "entityType": "maintenance",
    "entityId": "<workOrderId>",
    "newValues": {
      "workOrderReference": "<issueCode>",
      "exemptionReason": "<reason>",
      "exemptionNotes": "<notes>"
    }
  }
  ```
- **Automated Test Coverage:**
  - `Test 1.10`: Successfully documents photo exemption with approved reason (`TENANT_PRIVACY`) and notes; confirms HTTP 201 and audit record.
  - `Test 1.11`: Rejects unapproved reason (`FORGOT_MY_PHONE`) with HTTP 422.
  - `Test 2.4`: Resolves work order with `photo_exemption_reason: 'NON_VISUAL_REPAIR'`.

**Check 1 Verdict:** **CONFIRMED COMPLIANT WITH OPTION C.**  
The implementation fully matches the approved business policy. The discrepancy was strictly typographical in documentation.

---

## 3. CHECK 2: HISTORICAL EVIDENCE RETRIEVAL AFTER WORK-ORDER DELETION

### 3.1 Complete Lifecycle Trace
The audit traced the full lifecycle from creation through deletion to retrieval:

```
[1. Work Order Created] ────────► maintenance_requests (id: 50, issue_code: 'MNT-BFA-050')
                                       │
[2. Evidence Uploaded]  ────────► operational_evidence_attachments
                                    ├── id: 123
                                    ├── maintenance_id: 50
                                    ├── work_order_reference: 'MNT-BFA-050'
                                    └── file_path: 'storage/private/maintenance/mnt_ev_50_uuid.jpg'
                                  filesystem: storage/private/maintenance/mnt_ev_50_uuid.jpg
                                       │
[3. Admin Ticket Delete] ───────► DELETE /api/v1/maintenance/50 (Admin Only)
                                       │
                                       ├── 1. Snapshot Guard: UPDATE attachments SET work_order_reference = 'MNT-BFA-050'
                                       ├── 2. Row Deleted: DELETE FROM maintenance_requests WHERE id = 50
                                       └── 3. Foreign Key Action: ON DELETE SET NULL
                                                │
[4. Post-Deletion State] ────────► operational_evidence_attachments:
                                    ├── id: 123 (SURVIVED)
                                    ├── maintenance_id: NULL (DISASSOCIATED)
                                    ├── work_order_reference: 'MNT-BFA-050' (PRESERVED)
                                    └── file_path: 'storage/private/maintenance/...' (SURVIVED)
                                  filesystem: file on disk remains intact (SURVIVED)
```

### 3.2 Evaluation of Existing API Retrieval Paths
The existing evidence retrieval routes were inspected in [`backend/src/modules/maintenance/privateStorage.service.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/privateStorage.service.js):

1. **`GET /api/v1/maintenance/:id/evidence/:evidenceId/stream`:**
   Lines 487-494:
   ```javascript
   const maintRows = await pool.query(
     'SELECT id, issue_code, property_id FROM maintenance_requests WHERE id = ?',
     [maintId]
   );
   if (!maintRows || maintRows.length === 0) {
     throw new NotFoundError(`Maintenance request #${workOrderId} not found.`);
   }
   ```
2. **`GET /api/v1/maintenance/:id/evidence` (Listing):**
   Lines 568-575:
   ```javascript
   const maintRows = await pool.query(
     'SELECT id, issue_code, property_id FROM maintenance_requests WHERE id = ?',
     [maintId]
   );
   if (!maintRows || maintRows.length === 0) {
     throw new NotFoundError(`Maintenance request #${workOrderId} not found.`);
   }
   ```

**The Retrieval Gap Identified:**  
Because all evidence endpoints are currently nested sub-resources of the active maintenance order (`/api/v1/maintenance/:id/evidence/...`), querying an attachment whose parent work order has been deleted (`id = 50`) will fail at step 1 with `HTTP 404 Not Found` (`Maintenance request #50 not found`).

Therefore, while the database metadata, `work_order_reference` snapshot, audit logs, and physical disk file **survive permanently**, an authorized user **cannot retrieve or stream the orphaned file via the current REST API endpoints**.

### 3.3 Security & ID-Guessing Analysis
The audit verified whether this limitation creates any vulnerability to unauthorized access, guessing of attachment IDs, or cross-tenant leakage:

1. **Can an attacker retrieve orphaned evidence by guessing `evidenceId`?**  
   **NO.** If an attacker calls `GET /api/v1/maintenance/50/evidence/123/stream`, it fails with `404 Not Found` because ticket 50 does not exist.
2. **Can an attacker bypass this by passing a different active work order ID (e.g. ticket 999)?**  
   **NO.** In `getEvidenceStream`:
   ```javascript
   attachmentRows = await pool.query(
     `SELECT * FROM operational_evidence_attachments 
      WHERE id = ? AND (maintenance_id = ? OR work_order_reference = ?)`,
     [evidenceId, maint.id, maint.issue_code]
   );
   ```
   If ticket 999 is used, the query requires `maintenance_id = 999` OR `work_order_reference = 'MNT-BFA-999'`. Since attachment 123 has `maintenance_id = NULL` and `work_order_reference = 'MNT-BFA-050'`, the query returns zero rows and fails with `404 Not Found`.
3. **Can unauthenticated or non-worker roles access it?**  
   **NO.** Route guards enforce `requireAuth` (401) and `requireRoles` (403 for AGENT or public).

**Security Floor Finding:** The evidence remains strictly secure against cross-ticket leakage, property hopping, and ID enumeration.

### 3.4 Classification & Recommended Follow-up Architecture
- **Stage 2.5B Requirement:** Package B and Package D required ensuring that deleting a work order preserves the evidence metadata and physical file, unlinking `maintenance_id` via `ON DELETE SET NULL` and populating `work_order_reference`. This schema and transactional requirement is **100% fulfilled and verified**.
- **Nature of the Limitation:** Active maintenance work order streaming was the explicit deliverable of Stage 2.5B Package C. General-purpose retrieval of historical evidence for deleted entities belongs to the broader operational evidence and audit archives capability.
- **Recommended Minimal Follow-Up (Workspace C Stage 2.5C / Stage 3):**  
  Add a dedicated, standalone, property-scoped operational evidence retrieval endpoint:
  ```
  GET /api/v1/operational-evidence/:id/stream
  ```
  - Authorized Roles: `SUPER_ADMIN, ADMIN, OPERATIONS_MANAGER, MANAGER`.
  - Scoping: Resolves `operational_evidence_attachments.property_id` directly, verifies caller's property scope, and streams via the existing `assertSafePath` / `fs.realpathSync` pipeline.
  - Allows compliance officers and property managers to inspect historical evidence via audit logs even after a ticket has been expunged.

**Check 2 Verdict:** **ACCEPTED WITH DOCUMENTED FOLLOW-UP.**  
Data preservation is complete and secure. Standalone historical retrieval does not block Stage 2.5B closure and is documented as an authorized follow-up task.

---

## 4. FINAL OBSERVATIONS & BOUNDARY CONFIRMATION

1. **Production Database (`bfa_apartments_db`):** Completely isolated at 30 migrations. Migration 031 is absent.
2. **Test Database (`bfa_apartments_test_db`):** 31 migrations applied. All 52 maintenance tests and 61 regression tests pass (113/113 passed).
3. **Frontend Workspaces (A and B):** Completely untouched.
4. **Git Working Tree:** Clean baseline preserved on `master` at commit `3075411a754fcb7801b4b5b023168df2d6d4f4f8`.

---

## 5. FINAL STAGE 2.5B CLOSURE VERDICT

```
========================================================================================
                          STAGE 2.5B FINAL CLOSURE VERDICT:
                       ACCEPTED WITH DOCUMENTED FOLLOW-UP
========================================================================================
```

### Summary of Closure Determinations:
1. **DEC-2.5B-04 Alignment:** Confirmed matching Option C. Implementation enforces approved reason enums, mandatory notes, zero file fabrication, and immutable audit logs.
2. **Historical Evidence Survival:** Confirmed. Metadata, snapshots, and disk files survive ticket deletion via `ON DELETE SET NULL` and `work_order_reference`.
3. **Historical Retrieval Architecture:** Current nesting under active tickets prevents direct API retrieval of deleted tickets; access controls prevent ID guessing or leakage; dedicated standalone retrieval endpoint documented for follow-up milestone.
4. **Implementation Readiness:** Workspace C Stage 2.5B prerequisites are officially complete, verified, and approved for downstream Workspace B frontend integration.

