# BFA Apartments Management System — Phase 1 Accounting Foundation Technical Plan

**Document ID:** `BFA-ACC-PLAN-PHASE1-001`  
**Author:** Senior Accounting Systems Architect & Backend Security Engineer  
**Scope:** Phase 1 — Double-Entry Accounting Foundation  
**Status:** **TECHNICAL PLAN APPROVED FOR IMPLEMENTATION**  

---

## 1. Current-State Findings & Architecture Reference

Based on direct inspection of the codebase:
- **Database Engine:** MySQL 8.0+ / MariaDB 10.4+, InnoDB, UTF8mb4.
- **Current Financial Storage:**
  - `payment_transactions` (`backend/src/modules/payments/payments.service.js`): cash-in receipts and partial/full refund records with `FOR UPDATE` locking.
  - `expenses` (`backend/src/modules/expenses/expenses.service.js`): operational expenditure vouchers with `DRAFT`, `RECORDED`, `APPROVED`, `VOIDED`.
  - `commissions` (`backend/src/modules/commissions/commissions.service.js`): agent commission calculations and payouts.
  - `reservations` (`backend/src/modules/reservations/reservations.service.js`): guest booking contracts with 1-night check constraint (`chk_one_night`).
- **Current Financial Reporting:**
  - `FinancialService.getOverview` (`backend/src/modules/financial/financial.service.js`): derived cash-flow and booking calculation.
  - `FinancialService.getLedger`: dynamic SQL `UNION ALL` projection between payments and expenses. No Chart of Accounts, no General Ledger, no balanced debits/credits exist.
- **Audit System:**
  - `audit_logs` table managed by `auditService.record` (`backend/src/core/audit/audit.service.js`).
- **Authentication & Capabilities:**
  - `authContext.js` and `requireRoles` (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER`).
  - Dynamic capability policies in `capabilities` and `access_overrides`.

---

## 2. Proposed Accounting Data Model & Relationships

```
+-------------------------------------------------------------+
|                     accounting_periods                      |
|-------------------------------------------------------------|
| id (PK)                                                     |
| period_name VARCHAR(50) UNIQUE (e.g., '2026-10')            |
| start_date DATE                                             |
| end_date DATE                                               |
| fiscal_year INT                                             |
| status ENUM('OPEN', 'CLOSED', 'LOCKED') DEFAULT 'OPEN'      |
| closed_by_id INT -> users.id                                |
| closed_at TIMESTAMP                                         |
| reopened_by_id INT -> users.id                              |
| reopened_at TIMESTAMP                                       |
| reopen_reason TEXT                                          |
+-------------------------------------------------------------+
                              ^
                              | (1:N)
                              |
+-------------------------------------------------------------+
|                     chart_of_accounts                       |
|-------------------------------------------------------------|
| id (PK)                                                     |
| account_code VARCHAR(50) UNIQUE (e.g., '1010', '2020')      |
| account_name VARCHAR(150)                                   |
| account_type ENUM('ASSET','LIABILITY','EQUITY',            |
|                   'REVENUE','EXPENSE')                      |
| account_subtype VARCHAR(50)                                 |
| normal_balance ENUM('DEBIT', 'CREDIT')                      |
| is_active BOOLEAN DEFAULT TRUE                              |
| is_posting_allowed BOOLEAN DEFAULT TRUE (False for header)  |
| parent_account_id INT -> chart_of_accounts.id               |
| property_id INT -> properties.id (NULL = Consolidated)      |
| description VARCHAR(255)                                    |
+-------------------------------------------------------------+
        ^                                           ^
        | (1:N)                                     | (1:N)
+-----------------------+                   +-----------------------+
|     journal_lines     |                   | general_ledger_entries|
|-----------------------|                   |-----------------------|
| id (PK)               |                   | id (PK)               |
| journal_entry_id (FK) |                   | journal_entry_id (FK) |
| account_id (FK)       |                   | journal_line_id (FK)  |
| line_number INT       |                   | account_id (FK)       |
| debit DECIMAL(15,2)   |                   | property_id (FK)      |
| credit DECIMAL(15,2)  |                   | posting_date DATE     |
| property_id (FK)      |                   | accounting_period_id  |
| description VARCHAR   |                   | debit DECIMAL(15,2)   |
+-----------------------+                   | credit DECIMAL(15,2)  |
        ^                                   | net_balance_impact    |
        | (N:1)                             +-----------------------+
+-------------------------------------------------------------+
|                       journal_entries                       |
|-------------------------------------------------------------|
| id (PK)                                                     |
| journal_number VARCHAR(50) UNIQUE (e.g., 'JRN-2026-0001')   |
| entry_date DATE                                             |
| accounting_period_id INT -> accounting_periods.id           |
| description VARCHAR(255)                                    |
| source_type ENUM('MANUAL','RESERVATION','PAYMENT','EXPENSE',|
|                  'REFUND','PAYOUT','ADJUSTMENT',            |
|                  'OPENING_BALANCE')                         |
| source_id VARCHAR(100)                                      |
| idempotency_key VARCHAR(100) UNIQUE                         |
| status ENUM('DRAFT','PENDING_APPROVAL','APPROVED','POSTED', |
|             'REJECTED','REVERSED')                          |
| created_by_id INT -> users.id                               |
| approved_by_id INT -> users.id                              |
| approved_at TIMESTAMP                                       |
| posted_by_id INT -> users.id                                |
| posted_at TIMESTAMP                                         |
| rejected_by_id INT -> users.id                              |
| rejected_at TIMESTAMP                                       |
| rejection_reason TEXT                                       |
| reversal_of_journal_id INT -> journal_entries.id            |
| is_reversed BOOLEAN DEFAULT FALSE                           |
| reversed_by_journal_id INT -> journal_entries.id            |
| total_debit DECIMAL(15,2)                                   |
| total_credit DECIMAL(15,2)                                  |
+-------------------------------------------------------------+
```

---

## 3. Migration Sequence & Idempotent Seeding

- Migration: `019_accounting_double_entry_foundation.sql`
- Tables created:
  1. `chart_of_accounts`
  2. `accounting_periods`
  3. `journal_entries`
  4. `journal_lines`
  5. `general_ledger_entries`
- Seed data:
  - Standard minimal Chart of Accounts (Cash, Operating Bank, Gateway Clearing, Accounts Receivable, Accounts Payable, Deferred Guest Revenue, VAT Payable, Owner Equity, Accommodation Revenue, Maintenance Expense, Utilities, Staff Wages, Bank Fees).
  - Initial open accounting period for current month and surrounding months (e.g. 2026-10, 2026-11, 2026-12).
  - Seed new accounting capabilities into `capabilities` table (`ACCOUNTING_COA_MANAGE`, `ACCOUNTING_JOURNAL_CREATE`, `ACCOUNTING_JOURNAL_APPROVE`, `ACCOUNTING_JOURNAL_POST`, `ACCOUNTING_JOURNAL_REVERSE`, `ACCOUNTING_PERIOD_MANAGE`).
- Rollback/Recovery:
  - All statements use `CREATE TABLE IF NOT EXISTS` and `INSERT IGNORE` for safe re-runs and idempotency.

---

## 4. Backend Services, Routes & Authorization Controls

- Directory: `backend/src/modules/accounting/`
  - `accounting.repository.js`: Data access for accounts, periods, journals, lines, and GL entries.
  - `accounting.service.js`: Domain business logic and invariant validation.
  - `accounting.controller.js`: Request parsing and HTTP response mapping.
  - `accounting.routes.js`: Express router mounted at `/api/v1/accounting`.

### Endpoints & Authorization:

| Route | Method | Roles | Capability Gated | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/accounting/accounts` | `GET` | SUPER_ADMIN, OWNER, ADMIN, MANAGER | - | List Chart of Accounts with hierarchy and balances |
| `/api/v1/accounting/accounts` | `POST` | SUPER_ADMIN, OWNER, ADMIN | `ACCOUNTING_COA_MANAGE` | Create new account |
| `/api/v1/accounting/accounts/:id` | `GET` | SUPER_ADMIN, OWNER, ADMIN, MANAGER | - | Get account details |
| `/api/v1/accounting/accounts/:id` | `PATCH`| SUPER_ADMIN, OWNER, ADMIN | `ACCOUNTING_COA_MANAGE` | Update account status or name |
| `/api/v1/accounting/periods` | `GET` | SUPER_ADMIN, OWNER, ADMIN, MANAGER | - | List accounting periods |
| `/api/v1/accounting/periods` | `POST` | SUPER_ADMIN, OWNER, ADMIN | `ACCOUNTING_PERIOD_MANAGE` | Create new accounting period |
| `/api/v1/accounting/periods/:id/close` | `POST` | SUPER_ADMIN, OWNER, ADMIN | `ACCOUNTING_PERIOD_MANAGE` | Close an open accounting period |
| `/api/v1/accounting/periods/:id/reopen`| `POST` | SUPER_ADMIN, OWNER | `ACCOUNTING_PERIOD_MANAGE` | Reopen closed period (requires reason) |
| `/api/v1/accounting/journals` | `GET` | SUPER_ADMIN, OWNER, ADMIN, MANAGER | - | List journal entries (supports status, period filters) |
| `/api/v1/accounting/journals` | `POST` | SUPER_ADMIN, OWNER, ADMIN, MANAGER | `ACCOUNTING_JOURNAL_CREATE` | Create draft journal entry with lines |
| `/api/v1/accounting/journals/:id` | `GET` | SUPER_ADMIN, OWNER, ADMIN, MANAGER | - | Get journal entry with lines |
| `/api/v1/accounting/journals/:id/submit` | `POST` | SUPER_ADMIN, OWNER, ADMIN, MANAGER | `ACCOUNTING_JOURNAL_CREATE` | Submit draft journal for approval |
| `/api/v1/accounting/journals/:id/approve` | `POST` | SUPER_ADMIN, OWNER, ADMIN | `ACCOUNTING_JOURNAL_APPROVE` | Approve pending journal (**enforces maker != checker**) |
| `/api/v1/accounting/journals/:id/reject` | `POST` | SUPER_ADMIN, OWNER, ADMIN | `ACCOUNTING_JOURNAL_APPROVE` | Reject pending journal with reason |
| `/api/v1/accounting/journals/:id/post` | `POST` | SUPER_ADMIN, OWNER, ADMIN | `ACCOUNTING_JOURNAL_POST` | Post approved journal to General Ledger |
| `/api/v1/accounting/journals/:id/reverse` | `POST` | SUPER_ADMIN, OWNER, ADMIN | `ACCOUNTING_JOURNAL_REVERSE` | Create reversing journal entry |
| `/api/v1/accounting/ledger` | `GET` | SUPER_ADMIN, OWNER, ADMIN, MANAGER | - | Query posted general ledger entries with running balances |

---

## 5. Journal Lifecycle & Independent Approval Workflow

```
[DRAFT]
   │
   ▼  submitJournal() (Validates min 2 lines, debits == credits, active accounts)
[PENDING_APPROVAL]
   │
   ├──────────────────────────────┐
   ▼ approveJournal()             ▼ rejectJournal()
     (Checks maker != checker)       (Requires rejection reason)
[APPROVED]                     [REJECTED] (Terminal, cannot be posted)
   │
   ▼ postJournal() (Validates open period, acquires lock, generates general_ledger_entries)
[POSTED] (Immutable! Updates/Deletes rejected)
   │
   ▼ reverseJournal() (Creates linked reversing journal entry)
[REVERSED]
```

---

## 6. Concurrency, Locking & Idempotency Strategy

- **Atomic Transactions:** All state transitions and posting operations execute inside `pool.withTransaction(async (conn) => { ... })`.
- **Pessimistic Row Locking:** `SELECT * FROM journal_entries WHERE id = ? FOR UPDATE` and `SELECT * FROM accounting_periods WHERE id = ? FOR UPDATE` prevent race conditions on concurrent approval, posting, or closing requests.
- **Idempotency Keys:** `journal_entries.idempotency_key` guarantees duplicate network requests return the existing journal rather than creating duplicates.
- **Monetary Rounding & Precision:** All debit and credit calculations use standard two-decimal rounding `Math.round(val * 100) / 100` and database `DECIMAL(15, 2)` to eliminate floating-point drift.

---

## 7. Testing & Verification Strategy

Create `backend/tests/accountingFoundation.test.js` validating:
1. Chart of Accounts hierarchy, account code uniqueness, and posting restrictions.
2. Draft journal creation and line validation.
3. Reject unbalanced journals ($\sum \text{Dr} \ne \sum \text{Cr}$).
4. Reject journals with fewer than two lines.
5. Reject posting to inactive or summary accounts.
6. Independent approval enforcement (`created_by_id === approved_by_id` throws ForbiddenError).
7. Reject posting of unapproved or rejected journals.
8. Posting generates balanced `general_ledger_entries` and updates account balances.
9. Immutability: Attempted edits or deletions on posted journals are strictly blocked.
10. Period closing prevents posting to closed periods.
11. Audited period reopening with mandatory reason.
12. Journal reversal creates exact offsetting entries linked to original journal.
13. Role-based access control (Staff/Receptionist/Agent forbidden with HTTP 403).
14. Property isolation: Mismatched property lines rejected for scoped managers.
15. Full regression check of existing test suites (`financial.test.js`, `payments.test.js`, `commissions.test.js`, `assistant.test.js`).

---
*Ready for Phase 1 implementation.*
