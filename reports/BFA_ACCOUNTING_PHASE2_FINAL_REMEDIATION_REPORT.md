# BFA Accounting Phase 2 — Final Remediation of Remaining Audit Findings

**Workspace:** `C:\xampp\htdocs\BFA`  
**Date:** October 26, 2026  
**Auditor Target:** Independent Read-Only Follow-Up Verification Audit  
**Verdict:** **READY FOR INDEPENDENT READ-ONLY RE-AUDIT**

---

## 1. Baseline & Repository Integrity Verification

Before making any modifications, the repository working tree and database schema state were inspected and verified.

- **Current Branch:** `master`
- **HEAD Commit Hash:** `b95b63c7bf3da9b4891fb20b7201b71c150e1697`
- **Pre-existing Staged Changes Preserved:** Exactly 10 files previously identified by prior audits were preserved untouched in the staging index:
  1. `backend/package.json`
  2. `backend/src/config/index.js`
  3. `backend/src/modules/chat/chat.service.js`
  4. `backend/src/modules/chat/chat.socket.js`
  5. `backend/tests/chatService.test.js`
  6. `frontend/src/components/dashboard/AdminManagerDashboard.jsx`
  7. `frontend/src/components/dashboard/SuperAdminDashboard.jsx`
  8. `frontend/src/components/ui/Table.jsx`
  9. `reports/BFA_LOGIN_HTTP_500_ROOT_CAUSE_AND_FIX_REPORT.md`
  10. `reports/BFA_PHASE_4_WP_4_2_IMPLEMENTATION_REPORT.md`
- **Database Identity:** MariaDB 10.4.32 on localhost (database: `bfa_apartments_db`).
- **Applied Migration State (`schema_migrations`):**
  - Batch 6: `019_accounting_double_entry_foundation.sql` (2026-10-26 16:48:52)
  - Batch 7: `020_accounting_subledger_posting_bridge.sql` (2026-10-26 17:39:42)
  - Batch 8: `021_accounting_account_mappings_portable.sql` (2026-10-26 18:13:40)
  - Batch 9: `022_support_multinight_stays.sql` (2026-10-26 18:25:01)
  - Batch 10: `023_payment_provider_unique_and_exception_scoping.sql` (2026-10-26 19:25:36) - **Newly Applied Forward-Only Migration**

---

## 2. Summary of Remediated Findings

### Finding 1 (High): Swallowed Subledger Posting Failures & Transaction Integrity
- **Previous Defect:** In `payments.service.js` (`processPayment`, `refundPayment`) and `expenses.service.js` (`approveExpense`, `voidExpense`), subledger posting calls were wrapped in silent `try ... catch (postErr) { logger.warn(...) }` blocks. If posting failed (e.g. missing or disabled account mapping, closed period, connection error), the operational mutation committed while financial records were left unposted without a durable outbox record or exception entry on the transaction.
- **Remediated Architecture (Durable Outbox & Atomic Posting):**
  1. Removed all swallowing `try / catch` blocks in `payments.service.js` and `expenses.service.js`. Posting errors propagate up to the calling transaction scope.
  2. In `PostingBridgeService` (`postPayment`, `postRefund`, `postRevenueRecognition`, `postExpense`), subledger posting execution is wrapped so that if an accounting rule or mapping failure occurs, a durable `accounting_subledger_posting_records` row is created with `status = 'FAILED'`, and an `accounting_posting_exceptions` entry is recorded with `status = 'OPEN'` on the **exact same active database transaction connection (`conn`)**.
  3. Operational mutation and durable exception commit **atomically**. If a database crash or connection loss occurs, the entire transaction rolls back cleanly. If the operational payment succeeds, a durable `FAILED` outbox record and `OPEN` exception are guaranteed to be recorded in the database, allowing reconciliation and safe administrator retry.

### Finding 2 (Medium/High): Concurrent External-Payment Duplication
- **Previous Defect:** In `payment_transactions`, the provider reference had only a standard non-unique index (`idx_pay_provider_ref`), and idempotency was checked solely in application logic. Two concurrent callbacks from a payment gateway (e.g. Paystack, Flutterwave) at the exact same millisecond could both insert payments, creating duplicate rows and duplicate General Ledger postings. In addition, legitimate retries for fully-paid reservations triggered HTTP 409 `ConflictError` before returning the existing canonical record.
- **Remediated Safeguards:**
  1. Forward-only migration `023_payment_provider_unique_and_exception_scoping.sql` dropped the non-unique index and established a composite database-level constraint:
     ```sql
     ALTER TABLE payment_transactions 
       ADD CONSTRAINT uq_pay_provider_ref UNIQUE KEY (provider, provider_reference);
     ```
     *(In MariaDB InnoDB, `NULL` provider references for offline/cash payments remain unconstrained, while real external provider references are strictly unique per provider).*
  2. In `PaymentsService.processPayment`, provider reference idempotency is checked **before** reservation state validation. Legitimate retries return the existing canonical transaction (`isDuplicate: true`) with HTTP 200 without creating secondary journals or throwing conflicts.
  3. Added concurrency collision handling: when parallel webhook callbacks insert simultaneously, MariaDB gap/unique lock collisions (`ER_LOCK_DEADLOCK` or `ER_DUP_ENTRY`) trigger a safe, bounded exponential backoff retry. On retry, the canonical row committed by the parallel thread is detected and returned with HTTP 200 and the identical transaction ID.

### Finding 3 (Medium): Missing Property Scoping on Posting Exceptions
- **Previous Defect:** `GET /api/v1/accounting/posting-exceptions` lacked server-side property scoping. The controller failed to pass `req.user` to `PostingBridgeService.listExceptions`, allowing property managers to view company-wide exception diagnostics and forged query filters to bypass isolation. Furthermore, `accounting_posting_exceptions` lacked a direct `property_id` column for standalone exceptions.
- **Remediated Server-Side Authorization:**
  1. Forward-only migration `023` added `property_id INT NULL` with index `idx_ape_property` and foreign key constraint `fk_ape_property` to `accounting_posting_exceptions`.
  2. `PostingBridgeRepository` records `property_id` on all exception creations and queries `COALESCE(e.property_id, r.property_id) AS property_id`.
  3. `PostingBridgeService.listExceptions(query, user)` enforces fail-closed property scoping:
     - `MANAGER` or `STAFF` with valid property assignment is restricted strictly to `user.propertyId`. Client-supplied `propertyId` query parameters cannot override this scope.
     - `MANAGER` or `STAFF` with `propertyId: null` fails closed immediately, returning `{ data: [], total: 0 }`.
     - Company-wide access is restricted to `SUPER_ADMIN`, `ADMIN`, and `OWNER`.
  4. `PostingBridgeService.resolveException` enforces cross-property authorization, throwing HTTP 403 `ForbiddenError` if a scoped manager attempts to resolve exceptions belonging to another property.
  5. `accounting.routes.js` updated route middlewares to allow `STAFF` users with property assignment to access `posting-records` and `posting-exceptions`.

### Finding 4 (Section E): Prepaid Revenue & AR Invariants in Multi-Night Stays
- **Previous Coverage Gap:** Earlier tests lacked assertions for exact cumulative balance trajectories, multi-night service date distributions, and accounts receivable settlements.
- **Implemented Test Assertions:**
  - Standard 3-night stay scenario (₦50,000/night = ₦150,000 total stay, ₦50,000 advance payment):
    - Night 1: Relieves ₦50,000 Deferred Revenue (2020), credits ₦50,000 Accommodation Revenue (4010). Deferred revenue balance becomes ₦0.
    - Night 2: Accrues ₦50,000 Guest Receivables (1200), credits ₦50,000 Accommodation Revenue (4010).
    - Night 3: Accrues ₦50,000 Guest Receivables (1200), credits ₦50,000 Accommodation Revenue (4010).
    - Cumulative GL Balances Asserted:
      - Total Accommodation Revenue (4010) earned: ₦150,000.
      - Total Deferred Guest Revenue (2020) relieved: ₦50,000.
      - Total Guest Receivables (1200) accrued: ₦100,000.
      - Deferred Revenue balance is never negative.
      - Repeated night-audit execution on same stay dates is idempotent (zero duplicate revenue).
      - Checkout date is excluded from service-night revenue recognition.
    - Post-stay settlement payment of ₦100,000 debits Bank/Clearing and credits Accounts Receivable (1200), clearing outstanding guest receivables to exactly ₦0.00.

---

## 3. Database Changes & Forward-Only Migration

### Migration File: `backend/src/db/migrations/023_payment_provider_unique_and_exception_scoping.sql`
- **Status:** Applied in Batch 10 on 2026-10-26 19:25:36.
- **DDL Executed:**
  ```sql
  -- 1. Drop existing non-unique index and add composite unique constraint on provider reference
  ALTER TABLE payment_transactions 
    DROP INDEX idx_pay_provider_ref;

  ALTER TABLE payment_transactions 
    ADD CONSTRAINT uq_pay_provider_ref UNIQUE KEY (provider, provider_reference);

  -- 2. Add property_id column and foreign key index to posting exceptions
  ALTER TABLE accounting_posting_exceptions
    ADD COLUMN property_id INT NULL AFTER source_entity_id,
    ADD INDEX idx_ape_property (property_id),
    ADD CONSTRAINT fk_ape_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL;
  ```
- **Verified Schema State:**
  - `SHOW KEYS FROM payment_transactions WHERE Key_name = 'uq_pay_provider_ref'` -> `Non_unique: 0`, Columns: `provider`, `provider_reference`.
  - `SHOW COLUMNS FROM accounting_posting_exceptions LIKE 'property_id'` -> `Type: int(11)`, `Null: YES`, `Key: MUL`.

---

## 4. Source Files Modified & Rationales

| File | Change Rationale |
| :--- | :--- |
| `backend/src/db/migrations/023_payment_provider_unique_and_exception_scoping.sql` | Forward-only migration establishing `uq_pay_provider_ref` and `accounting_posting_exceptions.property_id`. |
| `backend/src/modules/accounting/postingBridge.repository.js` | Persist and query `property_id` in `createException`, `findExceptionById`, `listExceptions`. |
| `backend/src/modules/accounting/postingBridge.service.js` | Enforce server-side property scoping (fail-closed for unassigned manager); cross-property boundary checks in `resolveException`; durable atomic outbox exception recording on active transaction connection. |
| `backend/src/modules/accounting/accounting.controller.js` | Pass `req.user` into `listPostingExceptions`; include full pagination metadata in API envelope. |
| `backend/src/modules/accounting/accounting.routes.js` | Include `STAFF` in `postingViewRoles` for property-scoped posting records and exceptions. |
| `backend/src/modules/accounting/accounting.repository.js` | Support `journalEntryId` and `journalId` query filtering in `findAllGeneralLedgerEntries`. |
| `backend/src/modules/payments/payments.service.js` | Check provider reference idempotency before reservation validation; remove swallowed posting exceptions; add concurrency retry on unique/deadlock collisions. |
| `backend/src/modules/expenses/expenses.service.js` | Remove swallowed posting `try / catch` blocks in `approveExpense` and `voidExpense`. |
| `backend/tests/subledgerPostingBridge.test.js` | Added integration tests 16–23 covering outbox durability, provider idempotency, concurrency race-safety, property scoping, 3-night invariants, and AR settlement. |
| `backend/tests/accountingFoundation.test.js` | Query ledger entries using targeted `journalEntryId` filter. |

---

## 5. Comprehensive Test Execution Results

All test suites were executed sequentially using `--runInBand` directly against the live database:

```bash
npx jest tests/subledgerPostingBridge.test.js tests/accountingFoundation.test.js tests/financial.test.js tests/payments.test.js tests/commissions.test.js tests/navigationEngine.test.js tests/assistant.test.js --runInBand --forceExit
```

### Results Summary
- **Test Suites:** 7 passed, 7 total
- **Tests:** 137 passed, 137 total
- **Snapshots:** 0 total
- **Execution Time:** ~11.0 s

### Breakdown by Test Suite
1. `tests/subledgerPostingBridge.test.js`: **23 passed / 23 total**
   - 1. Payment Collection Bridge: Posts Debit to Clearing/Bank and Credit to Deferred Guest Revenue
   - 2. Idempotency: Duplicate payment posting call returns existing record without creating duplicate journals
   - 3. Refund Subledger Bridge: Posts Debit to Deferred Revenue and Credit to Clearing in current OPEN period
   - 4. Service-Date Revenue Recognition: Debits Deferred Revenue and Credits Accommodation Revenue
   - 5. Night Audit: Batch recognizes stay revenue with fault isolation on individual item exceptions
   - 6. Expense Posting Bridge: Approving expense posts Debit to category expense and Credit to Bank / AP
   - 7. Outbox & Reconciliation: Identifies operational events and reconciles against General Ledger
   - 8. Account Mappings: Admin can list and update operational account mappings
   - 9. Capability Protection: Disabling ACCOUNTING_SUBLEDGER_POST blocks night-audit with 403
   - 10. Multi-Night Night Audit: Recognizes in-house stays across all eligible stay dates and excludes checkout date (AUD-01)
   - 11. Post-Stay Payment: Payment after stay credits Accounts Receivable instead of Deferred Revenue (AUD-03)
   - 12. Security Deposit: Payment flagged as security deposit credits 2030 Refundable Deposits (AUD-03)
   - 13. Exception Resolution: Rejects resolution when posting record is absent or retry fails (AUD-05)
   - 14. Gateway Fees: Header total_debit equals sum of lines exactly (AUD-06)
   - 15. Property Scoping: Manager with null property assignment receives empty set (AUD-08)
   - 16. Durable Outbox: Unmapped or invalid accounting posting records durable FAILED outbox record and exception atomically
   - 17. Provider Idempotency: Duplicate callback returns canonical payment without creating duplicate rows or journals
   - 18. Concurrent Provider Callbacks: Database UNIQUE constraint prevents duplicate payment rows under parallel execution
   - 19. Multi-Provider Independence: Same reference across different providers creates distinct transactions
   - 20. Exception Property Scoping: Scoped staff accesses only own property exceptions and forged params cannot override
   - 21. Cross-Property Exception Resolution Forbidden: Property-scoped manager cannot resolve exceptions for other properties
   - 22. Comprehensive 3-Night Invariants: Asserts exact journal lines, cumulative GL balances, no double relief, and AR settlement
   - 23. Full Prepayment vs Zero Prepayment Scenarios: Accurately reflects 100% advance and 100% credit stays
2. `tests/accountingFoundation.test.js`: **20 passed / 20 total**
3. `tests/financial.test.js`: **15 passed / 15 total**
4. `tests/payments.test.js`: **4 passed / 4 total**
5. `tests/commissions.test.js`: **10 passed / 10 total**
6. `tests/navigationEngine.test.js`: **24 passed / 24 total**
7. `tests/assistant.test.js`: **41 passed / 41 total**

---

## 6. Accounting-Policy Decisions (Reserved for Owner / Accountant Approval)

In accordance with strict audit instructions, the following operational and financial policy choices have **not** been arbitrarily hardcoded or invented, and remain documented for management/external accountant sign-off:

1. **Treatment of Excess Guest Payments After Departure:**
   - *Option A (Default Safe Handling):* Reject overpayments at validation time with `ConflictError` ("Reservation has already been fully paid").
   - *Option B (Guest Credit Liability):* Allow excess payments to post as a credit balance in account `2025 Guest Overpayments / Credit Balances`, available for refund or future bookings.
   - *Option C (Immediate Automatic Refund):* Direct payment gateway to automatically issue a reverse refund for the excess amount.
2. **Cancellations, No-Shows, Early Departures & Partial Refunds:**
   - Determination of whether forfeited advance deposits are recognized as `4020 Cancellation Fee Income` or retained in deferred revenue until formal forfeiture review.
   - Specific journal routing for early checkouts when recognized nightly revenue must be reversed or adjusted.
3. **Approved Accounting Cutover Date & Opening Balance Migration:**
   - The formal cutover date (e.g. November 1, 2026) when automated posting goes live company-wide.
   - External CPA sign-off on opening trial balance migration, bank reconciliation balances, and starting deferred revenue liabilities.
4. **Segregation-of-Duties & Financial Authority Thresholds:**
   - Minimum monetary threshold requiring dual-authorization on manual journal approvals.
   - Maximum single-transaction refund threshold for property managers without admin counter-signature.

---

## 7. Mandatory Safeguards & Non-Regression Confirmations

1. **No Historical Backfill:** Zero historical operational records or legacy financial tables were rewritten, deleted, or backfilled.
2. **No Production Activation:** Live accounting posting remains isolated in development/test state; Phase 3 has not been initiated.
3. **No Unrelated Code Alteration:** All pre-existing staged files and existing user work remain completely preserved.

---

## 8. Final Audit Verdict

Based on the complete remediation of findings High (swallowed exceptions & transaction integrity), Medium/High (database-enforced payment idempotency & race safety), Medium (fail-closed property-scoped exception listing & resolution), comprehensive 3-night prepaid revenue/AR invariants, and 137 passing tests across all modules:

# **READY FOR INDEPENDENT READ-ONLY RE-AUDIT**
