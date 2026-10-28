# BFA Apartments Management System
# Test Database Isolation, Financial Anomaly Visibility & Remediation Hardening Engineering Report

**Date:** October 28, 2026  
**Auditor / Engineer:** Software Architecture & Accounting Systems Engineering  
**Target Environment:** Local Staging / Pre-Cutover Verification  
**Final Release Verdict:** **`ENGINEERING SAFEGUARDS VERIFIED — FINANCIAL RECONCILIATION STILL BLOCKED`**

---

## 1. Executive Summary

This report documents the implementation and verification of fail-closed test database isolation, teardown sequence hardening, schema synchronization, and financial anomaly reporting in the BFA Apartments Management System.

All technical engineering safeguards have been implemented and verified with 100% pass rates across all test suites running against the isolated `bfa_apartments_test_db` on MariaDB (port 3306). The shared database `bfa_apartments_db` remained 100% untouched throughout all tests, with zero records inserted, updated, deleted, or fabricated.

However, the commercial cutover remains **STRICTLY BLOCKED** pending formal business decisions from the BFA Property Owner and Lead Accountant regarding the ₦726,220.00 reservation-to-payment variance and the authorization of the pre-cutover data sanitization purge.

---

## 2. Mandatory Safety & Git Integrity Audit

### Git State Verification
- **Branch:** `master`
- **HEAD Commit:** `ba1efab4b50d61994fc2e53c0de604d0c326e06d`
- **Destructive Operations:** Exactly 0 (`git reset`, `git clean`, `git checkout`, `git stash`, and `git commit` were strictly avoided).
- **Staged Workstream:** All 35 previously staged files (including double-entry accounting migrations 019–023, subledger posting bridge, and navigation engine) remain staged and intact.
- **Landing Page Workstream:** All landing page files (`LandingPage.jsx`, `landing.css`, `AboutPage.jsx`, `ContactPage.jsx`, etc.) remain completely untouched.

### Shared Database Mutation Audit (`bfa_apartments_db`)
A forensic trace before, during, and after test execution confirmed zero mutations to the shared database:

| Metric | Pre-Hardening State | Post-Verification State | Delta |
| :--- | :---: | :---: | :---: |
| **Negative Transactions (`amount < 0`)** | 67 rows | 67 rows | **0 (Untouched)** |
| **Total Negative Amount** | -₦1,005,000.00 | -₦1,005,000.00 | **₦0.00 (Untouched)** |
| **Positive Parent Transactions** | 0 rows | 0 rows | **0 (Untouched)** |
| **General Ledger Journal Entries** | 163 rows | 163 rows | **0 (Untouched)** |
| **Test Reservation #1285 Status** | `CONFIRMED` | `CONFIRMED` | **0 (Untouched)** |

---

## 3. Test Database Isolation Architecture

### Root Cause of Contamination
Prior to this task, running `npm test` executed backend test suites against `bfa_apartments_db` because `backend/src/config/index.js` defaulted to `bfa_apartments_db` when `DB_NAME_TEST` was absent, and test fixtures lacked teardown isolation. Forensic timestamps proved that test execution on `2026-10-28 14:35:18` added a 67th negative transaction and 2 additional journal entries to the shared database.

### Implementation of Fail-Closed Architecture
1. **Dedicated Database Provisioning:**
   - Created database `bfa_apartments_test_db` on MariaDB (port 3306).
   - Executed migrations 001 through 023 against `bfa_apartments_test_db`, establishing all 49 core relational tables in complete isolation.
2. **Fail-Closed Safety Guard (`backend/src/db/databaseGuard.js`):**
   - Created strict validation module with `assertTestDatabase(dbName, operation)` and `isTestDatabase(dbName)`.
   - Explicitly rejects `bfa_apartments_db`, `bfa_production`, `staging`, `production`, empty strings, and null values with a fatal runtime error:
     `[FAIL-CLOSED DB GUARD]: <Operation> FATALLY REJECTED! Target database '<db>' is a protected shared/production database.`
3. **Database Connection Pool Hardening (`backend/src/db/pool.js`):**
   - Injected `assertTestDatabase(dbName, 'Pool initialization')` directly before pool creation whenever `NODE_ENV === 'test'`.
   - The pool refuses to initialize if targeted at a protected database.
4. **Database Migrator Hardening (`backend/src/db/migrator.js`):**
   - Injected `assertTestDatabase` into migration execution paths under test environments.
5. **Configuration Isolation (`backend/.env.test` & `backend/src/config/index.js`):**
   - Created `backend/.env.test` specifying `DB_NAME=bfa_apartments_test_db` and `DB_NAME_TEST=bfa_apartments_test_db`.
   - Updated `config/index.js` to automatically load `.env.test` when `NODE_ENV === 'test'` and guarantee default resolution to `bfa_apartments_test_db`.

---

## 4. Teardown Ordering & Schema Synchronization

### Teardown Sequence Hardening (`backend/tests/financial.test.js`)
The previous teardown attempted `DELETE FROM payment_transactions WHERE id = ? OR parent_transaction_id = ?`, which evaluated parent rows first, causing MariaDB's `ON DELETE SET NULL` foreign key constraint to decouple child refunds into persistent orphans. Furthermore, deleting `journal_lines` failed due to foreign key constraints from `general_ledger_entries`.

The teardown was re-architected with strict hierarchical ordering:
```
1. DELETE child refund records (WHERE parent_transaction_id = testPaymentId)
2. DELETE linked general_ledger_entries (WHERE journal_entry_id = entryId)
3. DELETE linked journal_lines (WHERE journal_entry_id = entryId)
4. DELETE linked journal_entries (WHERE id = entryId)
5. DELETE linked accounting_subledger_posting_records (WHERE source_entity_id = testPaymentId)
6. DELETE parent payment transaction (WHERE id = testPaymentId)
```
Verification confirmed that `bfa_apartments_test_db` retains **0 residual payment transactions** and **0 orphan rows** following full test suite execution.

### Schema Drift Discovery & Fix (`payment_transactions.status`)
- **Discovery:** In `bfa_apartments_db`, the column `status` on `payment_transactions` had been altered to include `PARTIALLY_REFUNDED`. However, the initial migration `007_payments_and_booking_auth.sql` and subsequent migration `011_maintenance_and_expenses.sql` lacked `PARTIALLY_REFUNDED` in the ENUM definition.
- **Symptom:** When running against a freshly migrated test database, saving a partial refund resulted in MariaDB truncating `status` to `''` (empty string).
- **Remediation:** Executed `ALTER TABLE payment_transactions MODIFY COLUMN status ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'PARTIAL', 'NOT_REQUIRED') NOT NULL DEFAULT 'PENDING'` on `bfa_apartments_test_db`. Documented for inclusion in cutover migration scripts.

---

## 5. Financial Anomaly Reporting & Non-Clamping Visibility

To eliminate deceptive financial reports caused by silent `Math.max(0, ...)` clamping, both backend reporting services and the frontend financial interface were upgraded:

### Backend Services (`financial.service.js` & `reports.service.js`)
1. **Preservation of Raw Values:**
   - Both services now compute and return `rawNetRevenue` and `rawOutstandingReceivables` / `rawTotalOutstanding` without artificial floor constraints.
2. **Structured Anomaly Reporting:**
   - Query specifically checks for orphaned refund transactions (`parent_transaction_id IS NULL AND amount < 0`).
   - If anomalies exist, returns:
     * `reconciliationStatus: 'ANOMALIES_DETECTED'`
     * `hasAnomaly: true`
     * `anomalies: [...]` detailing `code`, `severity`, `message`, `affectedMetric`, and `rawValues`.
   - Identified anomaly types:
     * `ORPHAN_REFUND_TRANSACTIONS` (CRITICAL)
     * `NEGATIVE_NET_REVENUE` (HIGH)
     * `NEGATIVE_RECEIVABLES` (MEDIUM)
     * `RESERVATION_PAYMENT_MISMATCH` (HIGH)

### Frontend Warning Banner (`frontend/src/pages/FinancialPage.jsx`)
- Rendered a high-visibility Reconciliation Alert Banner directly above KPI summary cards when `overview.hasAnomaly === true`.
- Banner clearly discloses the count and aggregate value of unlinked refunds and prompts operators to resolve data discrepancies rather than presenting a false picture of financial health.
- Frontend production build compiled cleanly: **238 modules transformed in 8.20s with 0 errors**.

---

## 6. MariaDB Integration Suite & Test Results

A dedicated integration test suite `backend/tests/databaseGuardAndIntegration.test.js` was created and executed directly against MariaDB:

```
PASS tests/databaseGuardAndIntegration.test.js
  Database Guard, MariaDB Isolation & Financial Anomaly Visibility
    1. Fail-Closed Database Guard Verification
      √ should identify valid test databases correctly (187 ms)
      √ should reject production and shared databases (8 ms)
      √ should throw fatal error when assertTestDatabase is called with shared database (26 ms)
      √ should pass cleanly when assertTestDatabase is called with isolated test database (6 ms)
    2. Active MariaDB Connection Isolation
      √ should be connected to bfa_apartments_test_db, NOT bfa_apartments_db (15 ms)
      √ should verify bfa_apartments_test_db has complete schema migrated (13 ms)
    3. Foreign Key Behavior & Teardown Order Verification
      √ should cleanly create parent and child refund and teardown children before parents (34 ms)
      √ demonstrates the ON DELETE SET NULL orphan vulnerability when parent is deleted first (23 ms)
    4. Financial Anomaly Reporting & Non-Clamping Visibility
      √ FinancialService.getOverview exposes anomalies and raw values when orphaned refund exists (171 ms)
      √ ReportsService.getFinancialReport matches FinancialService anomaly reporting contract (73 ms)
      √ returns RECONCILED with zero anomalies when dataset is clean (86 ms)

PASS tests/financialIntegritySafeguards.test.js
  Financial Integrity Safeguards & Reconciliation Rules (6/6 passed)

PASS tests/financial.test.js
  Financial Management & Operations Ledger Tests (Phase 8) (10/10 passed)
```

**Total Integration Test Count:** 27 tests across 3 suites, **100% passing**, **0 regressions**, **0 shared database queries**.

---

## 7. Foreign Key Assessment: `fk_pay_parent_txn` (`ON DELETE RESTRICT`)

### Current State
`fk_pay_parent_txn` is configured as:
```sql
CONSTRAINT fk_pay_parent_txn FOREIGN KEY (parent_transaction_id) 
REFERENCES payment_transactions(id) ON DELETE SET NULL;
```
### Vulnerability Analysis
When an automated test or operator deletes a parent payment row, MariaDB automatically converts `parent_transaction_id` on all linked refund rows to `NULL`. The child refund records remain in the table, detached from their parent context and masquerading as standalone negative revenue entries.

### Proposal Evaluation
Tightening the constraint to `ON DELETE RESTRICT ON UPDATE CASCADE`:
- **Advantage:** Prevents accidental deletion of parent transactions while child refund records exist. Any attempt to execute `DELETE FROM payment_transactions WHERE id = <parentId>` will immediately abort with `ER_ROW_IS_REFERENCED_2`.
- **Critical Caveat:** Applying `ON DELETE RESTRICT` will **NOT** clean up or re-link the existing 67 orphaned negative transactions in `bfa_apartments_db`. Foreign keys permit `NULL` values unless the column is declared `NOT NULL`. A child row with `parent_transaction_id = NULL` does not violate a foreign key.
- **Migration Prerequisite:** The 67 orphaned rows must be sanitized or purged before tightening schema integrity.

### Rollback Plan
If `ON DELETE RESTRICT` causes unexpected application lockouts during operations:
```sql
ALTER TABLE payment_transactions DROP FOREIGN KEY fk_pay_parent_txn;
ALTER TABLE payment_transactions ADD CONSTRAINT fk_pay_parent_txn 
  FOREIGN KEY (parent_transaction_id) REFERENCES payment_transactions(id) 
  ON DELETE SET NULL ON UPDATE CASCADE;
```

---

## 8. Unresolved Financial Decisions & Cutover Gating

The following items are business and accounting policy decisions that **cannot be resolved by software engineering alone**:

### 1. The ₦726,220.00 Reservation Payment Variance
Four reservations assert `paid_amount > 0` on their booking headers, but have zero corresponding positive transactions in `payment_transactions`:
- `RES-BFA-1001` (₦220.00)
- `RES-BFA-1002` (₦100.00)
- `RES-2026-0003` (₦276,000.00)
- `RES-2026-0006` (₦450,000.00)
**Total Variance:** `₦726,220.00`

### Owner Authorization Ballot
The Owner and Finance Director must formally select one of three accounting treatments:
- **Option A (Historical Bank Receipts):** Backfill authentic parent transactions referencing verified Zenith Bank statement credit slips.
- **Option B (Opening Balance Adjustment):** Record a journal entry crediting Owner's Equity (3010) and debiting Cash (1010).
- **Option C (Synthetic Seed Reset — Recommended for Demo Data):** Reset `paid_amount = 0.00` and `payment_status = 'PAYMENT_PENDING'`.

### 2. Pre-Cutover Sanitization Purge
Authorization is required to:
1. Purge the 67 orphaned test refund rows (`-₦1,005,000.00`).
2. Transition test reservations `#1285`, `#645`, `#685` to `CANCELLED` via `POST /api/v1/reservations/:id/cancel`.
3. Archive and purge 163 test journal entries generated during integration testing.

---

## 9. Final Verdict

```
================================================================================
FINAL AUDIT VERDICT:
ENGINEERING SAFEGUARDS VERIFIED — FINANCIAL RECONCILIATION STILL BLOCKED
================================================================================
Rationale:
1. All technical engineering safeguards, fail-closed test database isolation, 
   schema synchronization, and anomaly reporting mechanisms are fully verified.
2. The shared database bfa_apartments_db was completely preserved (0 mutations).
3. Live commercial cutover remains BLOCKED until the BFA Property Owner and Lead 
   Accountant sign off on the ₦726,220.00 reconciliation treatment and authorize 
   the pre-cutover data sanitization purge.
================================================================================
```

