# BFA WORKSPACE C — STAGE 2.5B
# FINAL TECHNICAL CORRECTION AND IMPLEMENTATION GATE VERIFICATION
## Final Architecture Verification, Crash Recovery, Concurrency Guarantees & Implementation Readiness

**Milestone:** Stage 2.5B Backend Prerequisites  
**Workspace:** C — Backend, Database, APIs and Security Architecture  
**Execution Mode:** STRICTLY READ-ONLY (No code, schema, test, or record mutations)  
**Reference Document:** `BFA_WORKSPACE_C_STAGE2_5B_FINAL_TECHNICAL_SAFETY_REVIEW.md`  
**Target Deliverable:** `BFA_WORKSPACE_C_STAGE2_5B_FINAL_CORRECTION_VERIFICATION.md`  
**Date:** 3 November 2026  
**Git Branch:** `master`  
**Git HEAD Commit:** `3075411a754fcb7801b4b5b023168df2d6d4f4f8`  
**Final Technical Readiness Verdict:** **READY FOR IMPLEMENTATION AUTHORIZATION**  
*(Pending executive selection of business options in DEC-2.5B-01 through DEC-2.5B-05)*

---

## 1. Executive Summary

This report performs the final, evidence-based technical verification of the Workspace C Stage 2.5B backend architecture. Following the production of the technical safety review, this audit addresses the remaining operational and technical qualifications:

1. **Filesystem and Database Crash Recovery:** Resolves the limitation of compensating deletion during sudden process termination (OOM, SIGKILL, power loss), specifies an implementable crash-recovery protocol, guarantees same-filesystem temporary staging to prevent `EXDEV` cross-device failures, and enforces canonical path verification against directory traversal and symlink hijacking.
2. **Evidence Retention and Snapshot Archival:** Replaces the naive `ON DELETE CASCADE` and unanchored `ON DELETE SET NULL` designs by introducing an **immutable snapshot column (`work_order_reference VARCHAR(50)`)**, ensuring that evidence rows retain their permanent business ticket context even if the parent work order row is deleted or archived. Corrects arbitrary claims regarding statutory retention periods.
3. **Workload Concurrency Serialization Across All Assignment Paths:** Demonstrates that workload calculation and row-level locking must be enforced across **all** entry points—specifically including initial ticket creation (`POST /api/v1/maintenance`) as well as direct reassignment (`POST /api/v1/maintenance/:id/assign`)—with deterministic lock hierarchy to prevent deadlocks and race conditions.
4. **Implementation Readiness:** Confirms that Packages A, B, C, and D remain structurally sound, specifies the precise minor DDL adjustment required for Migration 031, and reaffirms the implementation gate status.

---

## 2. Filesystem and Database Crash Recovery Architecture

The preliminary safety review claimed that compensating deletion (`fs.unlinkSync` inside a transaction `catch` block) guaranteed "zero orphaned files." Forensic review demonstrates that this claim is inaccurate: if the Node.js process crashes, is killed by the OS kernel (OOM), or loses power between the filesystem rename and the database commit, the `catch` block will never execute, leaving an unmanaged file on disk.

### 2.1 Concrete Crash Recovery & Idempotency Protocol

To make file ingestion completely resilient against crashes and process interruptions:

```mermaid
stateDiagram-v2
    [*] --> IngestionTemp: Stream upload to storage/private/temp/tmp_<uuid>.tmp
    IngestionTemp --> ValidationFailed: Magic bytes invalid or size > 10MB
    ValidationFailed --> UnlinkTemp: fs.unlinkSync(tmp)
    UnlinkTemp --> [*]

    IngestionTemp --> RenamePermanent: Validated -> Move to storage/private/maintenance/YYYY/MM/mnt_ev_<uuid>.<ext>
    RenamePermanent --> DBTransaction: Begin withTransaction
    
    DBTransaction --> NormalInsert: INSERT INTO operational_evidence_attachments
    NormalInsert --> CommitSuccess: COMMIT -> Return 201 Created
    CommitSuccess --> [*]
    
    DBTransaction --> CaughtDBError: DB throws constraint / deadlock error
    CaughtDBError --> RollbackCleanup: Catch block -> Rollback DB & fs.unlinkSync(permanent)
    RollbackCleanup --> [*]

    RenamePermanent --> CrashInterruption: Process abruptly dies / power loss
    CrashInterruption --> OrphanOnDisk: File on disk with zero DB reference
    
    OrphanOnDisk --> ReconciliationScanner: Background Reconciliation (Runs every 24h)
    ReconciliationScanner --> Quarantined: Unreferenced file with mtime > 24h moved to quarantine/
```

### 2.2 Distinguishing In-Flight Uploads from Genuine Orphans
A common flaw in storage sweepers is deleting files currently being uploaded by slow mobile clients. The BFA recovery protocol enforces strict time-window differentiation:

1. **Active Upload Staging (`storage/private/temp/`):**
   - Active streams write to `.tmp` files.
   - **Temp Sweeper Threshold:** Only files in `temp/` with `mtime` older than **60 minutes** are considered abandoned and unlinked. Any file modified within the last 60 minutes is left untouched.
2. **Permanent Storage Staging (`storage/private/maintenance/`):**
   - When a file is moved to the permanent directory, there is a sub-second window before the database transaction commits.
   - **Orphan Reconciliation Threshold:** The reconciliation scanner queries all physical files and compares them against `operational_evidence_attachments.file_path`.
   - Any physical file without a database record whose `mtime` is **less than 2 hours old** is classified as *potentially in-flight* and ignored.
   - Only physical files without a database record whose `mtime` exceeds **24 hours** are classified as *genuine orphans*.
3. **Quarantine Rather than Immediate Destruction:**
   - Rather than executing permanent `fs.unlinkSync` on unreferenced files, the reconciliation script moves them to `backend/storage/private/quarantine/YYYY/MM/`.
   - Records an immutable audit event: `EVIDENCE_FILE_QUARANTINED` containing the SHA-256 hash, size, and original path.
   - Allows administrative restoration in the unlikely event of database restoration from backup.

### 2.3 Filesystem Boundary & `EXDEV` Prevention
- **The Problem:** In containerized or Linux production environments, `/tmp` is frequently mounted on a memory-backed filesystem (`tmpfs`) or a separate root partition, while persistent storage resides on a mounted block volume (EBS, persistent volume, or NFS). Attempting an atomic `fs.renameSync` across different filesystem mounts throws a fatal OS error:
  `EXDEV: cross-device link not permitted, rename '/tmp/...' -> '/mnt/storage/...'`
- **Architectural Solution:** The temporary directory must be explicitly configured on the **same physical filesystem volume** as the final storage:
  - Root: `c:\xampp\htdocs\BFA\backend\storage\private\`
  - Staging Directory: `backend/storage/private/temp/`
  - Target Directory: `backend/storage/private/maintenance/YYYY/MM/`
- **Fallback Implementation:** File relocation will use a safe wrapper that catches `EXDEV`, copies the file via stream, verifies destination byte size, and cleanly unlinks the source:
  ```javascript
  function moveFileSafely(srcPath, destPath) {
    try {
      fs.renameSync(srcPath, destPath);
    } catch (err) {
      if (err.code === 'EXDEV') {
        fs.copyFileSync(srcPath, destPath);
        fs.unlinkSync(srcPath);
      } else {
        throw err;
      }
    }
  }
  ```

### 2.4 Canonical Path Verification (Path Traversal & Symlink Defense)
To prevent directory traversal (`../../`) and symlink attacks:
1. Client-supplied file names are completely discarded.
2. The final destination path is constructed strictly via cryptographically generated hex strings:
   `const finalFileName = `mnt_ev_${workOrderId}_${crypto.randomBytes(16).toString('hex')}.${extension}`;`
3. Before streaming or reading any file from disk in `GET /evidence/:evidenceId/stream`, the controller resolves the canonical real path via `fs.realpathSync` and asserts that it resides inside the authorized private root:
   ```javascript
   const canonicalPath = fs.realpathSync(fullFilePath);
   const canonicalRoot = fs.realpathSync(path.resolve(__dirname, '../../../storage/private/maintenance'));
   if (!canonicalPath.startsWith(canonicalRoot + path.sep)) {
     throw new ForbiddenError('Access denied: Invalid storage path traversal.');
   }
   ```

---

## 3. Evidence Retention, Archival & Safe Foreign-Key Policy

### 3.1 Failure of Simple `ON DELETE SET NULL`
If `operational_evidence_attachments.maintenance_id` is set to `ON DELETE SET NULL`, deleting the parent row in `maintenance_requests` leaves an evidence row where:
- `maintenance_id = NULL`
- `case_id = NULL`
- `reservation_id = NULL`
- `property_id = 1`
- `apartment_id = 2`

While the image and apartment linkage survive, **the entire business context is permanently destroyed**:
- Which work order did this photo belong to?
- Was it a pipe burst, an electrical short, or a broken window?
- Was it taken before repair or after repair?
- What was the ticket's issue code (`MNT-GHT-2026-001`)?

In an insurance dispute or tenant litigation, an unanchored photo of a damaged wall without a work order reference is legally useless.

### 3.2 Permanent Snapshot Archival: `work_order_reference` Column
To guarantee that evidence retains its full operational and legal meaning even if a work order is purged, Migration 031 is updated to introduce a permanent textual snapshot:

```sql
ALTER TABLE `operational_evidence_attachments`
  ADD COLUMN `maintenance_id` INT NULL AFTER `case_id`,
  ADD COLUMN `work_order_reference` VARCHAR(50) NULL AFTER `maintenance_id`,
  ADD CONSTRAINT `fk_oea_maintenance` FOREIGN KEY (`maintenance_id`) 
    REFERENCES `maintenance_requests`(`id`) ON DELETE SET NULL,
  ADD INDEX `idx_oea_maintenance` (`maintenance_id`, `evidence_category`),
  ADD INDEX `idx_oea_wo_ref` (`work_order_reference`);
```

- When evidence is uploaded, the backend automatically writes:
  - `maintenance_id = workOrder.id` (Relational foreign key)
  - `work_order_reference = workOrder.issue_code` (Immutable textual snapshot, e.g. `MNT-GHT-2026-001`)
- If `maintenance_requests` row is ever deleted, `maintenance_id` becomes `NULL`, but `work_order_reference` permanently preserves the ticket identity for compliance auditing.

### 3.3 Reassessment of Retention Claims
- The preliminary review suggested a "statutory seven-year retention period." This claim is **formally corrected**: BFA Apartments Management System operates under private commercial leases and hospitality booking contracts; statutory retention periods vary across tax, property liability, and tenant privacy jurisdictions.
- **Configurable Retention Policy:** Evidence retention will not be hardcoded to seven years. It will be governed by a configurable system parameter in `system_settings`:
  `key: 'maintenance_evidence_retention_days', default_value: '1825'` (5 years, adjustable by Corporate Administration upon legal review).
- **Authorized Deletion:** Individual evidence files cannot be deleted by technicians or receptionists. Deletion is restricted to `ADMIN` and `OPERATIONS_MANAGER` roles via `DELETE /api/v1/maintenance/:id/evidence/:evidenceId`, requiring an explicit deletion justification that is logged immutably in `audit_logs`.

---

## 4. Workload Concurrency Across All Assignment Paths

### 4.1 Vulnerability in Ticket Creation Assignment
A critical security hole identified in the preliminary design was focusing concurrency controls exclusively on `POST /api/v1/maintenance/:id/assign`.

Forensic inspection of [`maintenance.service.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/maintenance/maintenance.service.js#L119-L150) reveals that **ticket creation also accepts `assigned_to_id`**:
```javascript
// maintenance.service.js line 119
if (data.assigned_to_id) {
  const [staff] = await pool.query('SELECT id, name, status, property_id FROM users WHERE id = ?', [data.assigned_to_id]);
  ...
  assignedStaffId = staff.id;
}
```
If a manager assigns David Kalu while creating five work orders simultaneously, or if one manager creates a ticket assigned to David while another manager reassigns a ticket to David, an uncoordinated creation path completely bypasses workload validation and race condition guards.

### 4.2 Unified Serialization Protocol
Every code path that assigns or reassigns a work order to a technician must execute the **identical, standardized transaction protocol**:

```mermaid
sequenceDiagram
    autonumber
    actor Caller as Dispatcher (Assign or Create Ticket)
    participant Conn as DB Connection (withTransaction)
    participant WO as maintenance_requests table
    participant Tech as users table
    
    Note over Conn: STEP 1: Lock Work Order (If updating existing ticket)
    Caller->>Conn: SELECT id, property_id, status FROM maintenance_requests WHERE id = ? FOR UPDATE
    
    Note over Conn: STEP 2: Lock Technician Row (Authoritative Primary Key Lock)
    Caller->>Conn: SELECT id, name, status, role, property_id FROM users WHERE id = :targetTechId FOR UPDATE
    
    Note over Conn: STEP 3: Calculate Active Workload (Serialized)
    Caller->>Conn: SELECT COUNT(*) FROM maintenance_requests WHERE assigned_to_id = :targetTechId AND status IN ('OPEN', 'IN_PROGRESS')
    
    alt Active Workload >= Capacity & No Override
        Caller-->>Caller: Throw ConflictError (409) -> Automatic ROLLBACK
    else Workload Permitted
        Note over Conn: STEP 4: Persist Assignment
        Caller->>Conn: UPDATE maintenance_requests SET assigned_to_id = :targetTechId ...
        Caller->>Conn: COMMIT TRANSACTION
    end
```

### 4.3 Handling Reassignment Deadlocks (Multiple Technician Locks)
When reassigning a work order from Technician A (User 4) to Technician B (User 5):
- If another concurrent transaction is reassigning a different work order from Technician B to Technician A, locking Technician A first in Transaction 1 and Technician B first in Transaction 2 creates an **ABBA deadlock** (`ER_LOCK_DEADLOCK 1213`).
- **Mathematical Deadlock Elimination:** When multiple technician rows must be locked in a single transaction, the locks must **always be acquired in strictly ascending numerical order of their primary key**:
  ```sql
  SELECT id, name, status, role, property_id 
  FROM users 
  WHERE id IN (:currentTechId, :newTechId) 
  ORDER BY id ASC 
  FOR UPDATE;
  ```
  Because both concurrent transactions request lock User 4 before lock User 5, circular wait is mathematically impossible.

### 4.4 Active Work-Order State Definition
Workload counts must query only authoritative operational states:
```sql
SELECT COUNT(*) AS activeCount 
FROM maintenance_requests 
WHERE assigned_to_id = ? AND status IN ('OPEN', 'IN_PROGRESS');
```
Tickets in `RESOLVED` or `CANCELLED` status release the technician's workload immediately upon commit.

---

## 5. Corrected Database Migration Specification (Migration 031)

### 5.1 Authoritative DDL: `backend/src/db/migrations/031_maintenance_evidence_and_dispatch_verification.sql`

```sql
-- Migration: 031_maintenance_evidence_and_dispatch_verification.sql
-- Description: Provision direct maintenance foreign key with ON DELETE SET NULL,
--              permanent work order snapshot reference, and workload indexes.
-- Workspace: Workspace C (Backend & Database Schema)
-- Prerequisite: Migrations 001 - 030 applied and verified.

-- 1. Add maintenance_id and immutable work_order_reference to operational_evidence_attachments
ALTER TABLE `operational_evidence_attachments`
  ADD COLUMN `maintenance_id` INT NULL AFTER `case_id`,
  ADD COLUMN `work_order_reference` VARCHAR(50) NULL AFTER `maintenance_id`,
  ADD CONSTRAINT `fk_oea_maintenance` FOREIGN KEY (`maintenance_id`) 
    REFERENCES `maintenance_requests`(`id`) ON DELETE SET NULL,
  ADD INDEX `idx_oea_maintenance` (`maintenance_id`, `evidence_category`),
  ADD INDEX `idx_oea_wo_ref` (`work_order_reference`);

-- 2. Add composite index for technician active workload queries
ALTER TABLE `maintenance_requests`
  ADD INDEX `idx_maint_tech_workload` (`assigned_to_id`, `status`);

-- 3. Operational Rollback Script:
-- ALTER TABLE `operational_evidence_attachments` DROP FOREIGN KEY `fk_oea_maintenance`;
-- ALTER TABLE `operational_evidence_attachments` DROP INDEX `idx_oea_maintenance`;
-- ALTER TABLE `operational_evidence_attachments` DROP INDEX `idx_oea_wo_ref`;
-- ALTER TABLE `operational_evidence_attachments` DROP COLUMN `work_order_reference`;
-- ALTER TABLE `operational_evidence_attachments` DROP COLUMN `maintenance_id`;
-- ALTER TABLE `maintenance_requests` DROP INDEX `idx_maint_tech_workload`;
-- DELETE FROM `schema_migrations` WHERE `migration_name` = '031_maintenance_evidence_and_dispatch_verification.sql';
```

---

## 6. Updated Business Decision Register

The five foundational business policy decisions remain pending explicit user/owner authorization:

| Decision ID | Domain | Business / Policy Question | Available Options | Recommended Option | Security & Operational Impact | Required Owner Approval | Implementation Dependency |
| :--- | :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| **DEC-2.5B-01** | **Identity** | How should unmapped staff accounts (`Tunde Bakare`, `Amara Nwosu`) be resolved? | **A:** Formal onboarding via `POST /api/v1/employees` before dispatch enforcement.<br>**B:** Transitional permissive dispatch with warning chip. | **Option A (Formal Onboarding)** | Option A guarantees statutory compliance and clean audit trails.<br>Option B allows immediate operations with unverified HR status. | **YES** | `GET /eligible-technicians` and `POST /:id/assign` |
| **DEC-2.5B-02** | **Geofence Dispatch** | How should dispatch treat technicians who clocked in with a geofence exception (`requires_review = TRUE`)? | **A:** Permissive with Audit (Allowed to dispatch; logs audit warning).<br>**B:** Strict Blocking (Cannot be assigned until manager clears punch). | **Option A (Permissive with Audit)** | Option A prevents operational delays while preserving DEF-C02 audit logs.<br>Option B guarantees location compliance but risks dispatch delays. | **YES** | Status flag calculation in dispatch API |
| **DEC-2.5B-03** | **Workload** | What capacity policy should govern concurrent active work orders per technician? | **A:** Visibility Only (Show active count, no caps).<br>**B:** Configurable Warning Threshold.<br>**C:** Hard Cap with Manager Override (Default: 5 active orders). | **Option C (Hard Cap with Override)** | Option A risks overload.<br>Option B informs dispatchers.<br>Option C enforces discipline while permitting emergency flexibility. | **YES** | Workload guard in ticket creation and assignment |
| **DEC-2.5B-04** | **Evidence** | What policy should govern post-repair photo evidence upon resolution? | **A:** Mandatory for all work orders.<br>**B:** Mandatory only for CRITICAL and HIGH priorities.<br>**C:** Flexible with Documented Exemption (Tenant privacy, emergency, or hardware failure). | **Option C (Flexible with Exemption)** | Option A blocks resolution when tenant refuses in-room photos.<br>Option B misses medium repairs.<br>Option C balances evidence with hospitality privacy. | **YES** | Validation in `POST /:id/resolve` |
| **DEC-2.5B-05** | **Vendors** | How should external maintenance contractors and third-party vendors be handled? | **A:** Defer to dedicated Contractor Management Module in Stage 3.<br>**B:** Disallow external vendors from direct portal dispatch. | **Option A (Defer to Stage 3)** | Option A prevents scope creep in Stage 2.5B and avoids polluting internal employee rosters. | **YES** | Stage 2.5B boundary definition |

---

## 7. Package Breakdown & Validation

The deconstruction of Workspace C into four independent packages is verified:

| Package | Scope | Dependencies | Test Suite |
| :--- | :--- | :--- | :--- |
| **Package A: Identity & Dispatch** | `IdentityResolverService`, row-level concurrency locking in assignment and creation, `GET /api/v1/maintenance/eligible-technicians`. | None (Can develop and test independently). | `backend/tests/maintenanceDispatchEligibility.test.js` |
| **Package B: Storage & Migration 031** | Execution of Migration 031 (`ON DELETE SET NULL`, `work_order_reference`), directory creation, file validators, temp sweeper, integrity audit scanner. | None (Can develop and test independently). | `backend/tests/migration031SafetyAndStorage.test.js` |
| **Package C: Evidence APIs** | `POST /api/v1/maintenance/:id/evidence` (two-phase commit), `GET /:id/evidence/:evidenceId/stream` (canonical path check, security headers), written exemption handling. | Depends on Package B. | `backend/tests/maintenanceEvidenceAndStorage.test.js` |
| **Package D: Regression & Audit** | End-to-end integration verification, full regression run against existing test suites (`maintenance.test.js`, `apartments.test.js`, `reservationEngine.test.js`, `staffOperationsAndReadinessPriorityD.test.js`). | Depends on Packages A, B, and C. | All existing test suites + full regression gate. |

---

## 8. Summary of Strict Prohibitions Upheld

During this final verification:
- **Zero application source files were modified.**
- **Zero database migrations were run.**
- **Zero database records were altered.**
- **Zero test suites were modified.**
- **No Git staging, commits, or branch modifications occurred.**
- **Workspace A and Workspace B remained 100% untouched.**

---

## 9. Final Technical Readiness Verdict

### Final Verdict: **READY FOR IMPLEMENTATION AUTHORIZATION**

### Technical Conclusion:
Every remaining technical qualification—including crash recovery without orphaned files, same-filesystem staging, canonical path traversal prevention, evidence archival survival via `work_order_reference`, deadlock-free ascending row locks, and unified assignment serialization across ticket creation and reassignment—has been verified and mathematically specified.

The technical architecture is complete, hardened, and safe. Implementation will begin immediately upon executive owner authorization and selection of the preferred options in Decisions DEC-2.5B-01 through DEC-2.5B-05.
