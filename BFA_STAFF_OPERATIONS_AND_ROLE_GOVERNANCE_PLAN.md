# BFA Apartments Management System
## Workspace B: Property Governance, Staff Operations, Performance Management & Financial Evidence Architecture Plan

**Document Version:** 2.2.0 (Pre-Implementation Technical Audit & Verified Candidate)  
**Date:** October 29, 2026  
**Status:** AUDITED — READY WITH EXPLICIT CONDITIONS (PENDING OWNER POLICY RATIFICATION)  
**Target Application:** BFA Serviced Residences (Multi-Building Portfolio, Akure, Ondo State)  
**Authors:** Senior Backend Architect, React Application Engineer, Database Engineer, Security Specialist & Operations-Workflow Designer (Workspace B)  
**Cross-Workspace Alignment:** Reconciled with Workspace A Specification (`BFA_PUBLIC_EXPERIENCE_AND_PROPERTY_CONTENT_PLAN.md`)

---

## Document Revision & Reconciliation History

| Version | Date | Status | Key Changes & Reconciliation Notes |
|---|---|---|---|
| **1.0.0** | Oct 29, 2026 | Superseded | Initial staff workstream planning draft. Identified privilege flaws and missing tables. |
| **2.0.0** | Oct 29, 2026 | Superseded | Expanded to 17 sections covering dual approval, receipts, operational cases, and metrics. |
| **2.1.0** | Oct 29, 2026 | Superseded | Reconciled property portfolio (GHT, ABR, RPS), unified `media_assets` with Workspace A, grounded serviced apartment metrics, and defined configurable operational workflows. |
| **2.2.0** | Oct 29, 2026 | **Current Audit Candidate** | **Pre-Implementation Technical Audit Corrections:**<br>1. **MariaDB 10.4 DDL Compliance:** Documented implicit commit behavior and idempotent retry guards; foreign keys specified in initial DDL.<br>2. **Missing Table Restoration:** Restored complete `staff_incidents` DDL specification in Section 13 (correcting v2.1.0 omission).<br>3. **Explicit Constraint Naming:** Assigned unique `fk_*` constraint names across all tables to avoid auto-naming collisions.<br>4. **Enum Realignment:** Corrected `payment_transactions.status` from `'PAID'` to `'SUCCESS'` (matching Migration 007 schema and subledger posting bridge).<br>5. **Qualified Finding F-05:** Noted existing atomic update in `reservations.service.js:895` and documented requirement for lightweight `claim` route and `reservation_staff_assignments` tracking ledger.<br>6. **Pricing Security:** Identified client-side price tampering in `reservations.service.js:252` and mandated HMAC-signed 15-minute `quoteToken` and `price_snapshot`.<br>7. **Readiness Verdict:** Elevated status to `READY WITH EXPLICIT CONDITIONS` (isolated test DB verification and Owner policy ratification). |

---

## Executive Summary

The **BFA Apartments Management System** is a specialized serviced residential enterprise platform managing luxury apartment buildings across Akure, Ondo State:
1. **Grand Horizon Tower** (Property Code: `GHT`)
2. **Azure Bay Residences** (Property Code: `ABR`)
3. **The Royal Palms Suites** (Property Code: `RPS`)

BFA manages multi-story residential buildings offering self-contained, fully furnished serviced apartments (studios, 1-bedroom apartments, 2-bedroom executive suites, and penthouses). The operational model supports short, medium, and extended residential stays, property-scoped operational teams, independent referral agents, and central portfolio governance.

This specification establishes the authoritative, reconciled architectural plan for **Workspace B (Staff Operations, Property Governance, and Financial Evidence)** while preserving the independent responsibilities of **Workspace A (Public Discovery, Experience, and Booking UX)**.

> [!IMPORTANT]
> **Safety Directive & Stop Gate:** This document is an implementation-ready architectural plan produced via **read-only codebase inspection**. No production application code, database migrations, or live financial mutations have been executed. Write-capable automated test suites will run strictly in `bfa_apartments_test_db` upon explicit Owner authorization.

---

## 1. Verified Repository Findings & System Architecture Baseline

### 1.1 Verified Property Portfolio (Database-Proven)
A direct inspection of `bfa_apartments_db` confirms the three active properties in the BFA portfolio:
- **Property #1:** `Grand Horizon Tower` | Code: `GHT` | City: `Akure` | Status: `ACTIVE`
- **Property #2:** `Azure Bay Residences` | Code: `ABR` | City: `Akure` | Status: `ACTIVE`
- **Property #3:** `The Royal Palms Suites` | Code: `RPS` | City: `Akure` | Status: `ACTIVE`

*(Correction Note: All references to "Serene Heights" in earlier working drafts were unverified and have been eradicated. The authoritative third property is The Royal Palms Suites).*

### 1.2 Database Schema & Migration Inventory
- **Current Database Engine:** MariaDB 10.4.32 on port 3306, managed via connection pooling in `backend/src/db/pool.js`.
- **Applied Migrations:** Exactly 25 migrations are tracked and executed in `schema_migrations` (from `001_create_schema_migrations.sql` through `025_front_desk_assignment.sql`).
- **Core Entities Verified:**
  - `properties`: Base building details, contact information, operational status. (Zero image columns).
  - `apartments`: Unit numbers, floors, unit types, capacity, rate per night, single status column. (Zero media or separate housekeeping columns).
  - `reservations`: Booking codes, dates, scalar `total_amount`, `paid_amount`, payment status, `assigned_staff_id`, `accepted_by_user_id`. (Zero price breakdown snapshot).
  - `capabilities`: 32 granular capabilities across `ACCOUNTING`, `AGENTS`, `COMMUNICATION`, `EMPLOYEES`, `FINANCIAL`, `NOTIFICATIONS`, `PAYMENT`, `REPORTS`, and `RESERVATION`.
  - `employees`, `employee_evaluations`, `employee_activities`: HR performance framework (Migration 013).
  - `payment_transactions`, `journal_entries`, `general_ledger_entries`: Double-entry subledger bridge (Migrations 019, 020, 021, 024).

### 1.3 Classification of Architectural & Security Findings

| Finding ID | Domain | Verified Codebase Status | Description & Required Remediation |
|---|---|:---:|---|
| **F-01** | Security / Auth | **CONFIRMED** | `authContext.js` line 84: `userRole === 'SUPER_ADMIN' || normalizedAllowed.includes(userRole)`. `SUPER_ADMIN` currently bypasses every role check, granting blanket technical access to financial ledgers, revenue reports, and guest folios. **Remediation:** Remove blanket bypass; restrict `SUPER_ADMIN` exclusively to technical, diagnostic, and migration endpoints. |
| **F-02** | Security / RBAC | **CONFIRMED** | `users.service.js` line 206: While `createUser` blocks non-Super Admins from creating `SUPER_ADMIN` or `ADMIN`, `updateUser` omits this check. An `ADMIN` updating an existing `STAFF` account can elevate the role to `SUPER_ADMIN` or `OWNER`, and can edit their own role. **Remediation:** Enforce server-side elevation guards in `updateUser`. |
| **F-03** | Security / Data Isolation | **CONFIRMED** | `reservations.controller.js` line 25 & `reservations.service.js` line 193: Fallback `agentId = req.user.agentId || 1`. If an authenticated Agent has no linked `agentId`, the system defaults to Agent #1, exposing another partner's bookings. **Remediation:** Remove fallback; return HTTP 403 if an Agent profile is unlinked. |
| **F-04** | Inventory / Media | **CONFIRMED** | No database tables or API endpoints exist for property or apartment photography. Public UI relies on static bundled representative assets (`ApartmentDetailModal.jsx`). **Remediation:** Implement unified `media_assets` table in Migration 026. |
| **F-05** | Front Desk / Concurrency | **QUALIFIED** | `reservations` has `assigned_staff_id` and `accepted_by_user_id` (Migration 025), and `reservations.service.js:895` has an atomic lock in `acceptAssignment`. However, the system lacks a dedicated lightweight receptionist claim endpoint (`POST /api/v1/front-office/claim`) and a historical assignment ledger (`reservation_staff_assignments`) to track response times, shifts, and handovers. **Remediation:** Implement `POST /api/v1/front-office/claim` and the `reservation_staff_assignments` tracking ledger in Migration 026. |
| **F-06** | Operations / Readiness | **CONFIRMED** | Housekeeping status and reservation occupancy share a single enum in `apartments.status`. Housekeeping marking a room clean risks making an occupied room appear vacant. **Remediation:** Decouple `housekeeping_status` and `maintenance_status` from front-office occupancy. |
| **F-07** | Financial / Evidence | **CONFIRMED** | No formal receipts table exists (only `chat_message_receipts`). Bank transfer payments have no verification workflow separating reported slips from settled funds. **Remediation:** Implement `payment_receipts` table with PDF issuance and maker-checker transfer verification. |
| **F-08** | Staff Accountability | **CONFIRMED** | No structured incident tracking table (`staff_incidents`) or operational case table exists. **Remediation:** Implement `operational_cases` and `staff_incidents` in Migration 026. |

---

## 2. Cross-Workspace Alignment: Single Shared Contract (Workspace A & B)

To prevent competing architectures, duplicate services, or incompatible database migrations, Workspace A and Workspace B agree on the following authoritative contracts:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SHARED WORKSPACE BOUNDARIES                               │
├────────────────────────────────────────────┬───────────────────────────────────────────┤
│ WORKSPACE A: Public Visitor Experience     │ WORKSPACE B: Staff Operations & Governan. │
├────────────────────────────────────────────┼───────────────────────────────────────────┤
│ • Directive Calls to Action ("Explore      │ • Property Creation, Inventory & Rates    │
│   Residences", "Check Availability")       │ • Dual Independent Owner/Admin Approval   │
│ • Clean Public Navigation (No staff links  │ • Staff Portal Authentication & RBAC      │
│   in public header/footer; staff access    │ • Multi-Property Assignment Resolution    │
│   preserved via /login and /app/*)         │ • Concurrency-Safe Booking Claim Desk     │
│ • No Unnecessary Public Bottom Navigation  │ • Housekeeping & Maintenance Workflows    │
│ • Executive Midnight Navy & Gold Theme     │ • Cash/Transfer Verification & Receipts   │
│ • Fast Loader Target (≤ 2.0s without fake  │ • Structured Operational Cases & Evidence │
│   setTimeout delays)                       │ • Receptionist Performance Telemetry      │
│ • Consumes Public APIs (GET /media,        │ • Owns Backend Services & Migration 026  │
│   POST /quote, POST /booking)              │                                           │
└────────────────────────────────────────────┴───────────────────────────────────────────┘
```

### 2.1 Unified Media Model (`media_assets`)
There is **exactly one** media asset model in the system. The previous Workspace B proposal for a separate `property_apartment_images` table is **officially retired** in favor of Workspace A's unified `media_assets` model, enriched with publication approval metadata:

```sql
CREATE TABLE IF NOT EXISTS `media_assets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `entity_type` ENUM('PROPERTY', 'APARTMENT') NOT NULL,
  `entity_id` INT NOT NULL,
  `category` ENUM('EXTERIOR', 'GROUNDS', 'FACILITIES', 'INTERIOR', 'AMENITY') NOT NULL DEFAULT 'INTERIOR',
  `file_path` VARCHAR(255) NOT NULL,
  `file_name` VARCHAR(150) NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(50) NOT NULL,
  `file_size_bytes` INT NOT NULL,
  `caption` VARCHAR(200) NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_representative` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_published` BOOLEAN NOT NULL DEFAULT FALSE,
  `submission_id` INT NULL COMMENT 'Linked property submission review bundle',
  `uploaded_by` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_media_lookup` (`entity_type`, `entity_id`, `category`, `is_published`, `display_order`),
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Filesystem Layout:**
```
backend/
└── uploads/
    ├── employees/       (existing: profile photos)
    ├── properties/      (new: building exterior, grounds, shared facilities)
    │   └── {property_id}/
    ├── apartments/      (new: interior salons, master bedrooms, kitchens, baths)
    │   └── {apartment_id}/
    └── evidence/        (new: operational damage, inspection checklists, bank slips)
        ├── cases/{case_id}/
        └── payments/{transaction_id}/
```

### 2.2 Authoritative Dynamic Pricing Contract
- **Service Owner:** Backend `pricing.service.js` (Workspace B).
- **Public Quotation Route:** `POST /api/v1/public/quote` (Workspace A consumes).
- **Staff Quotation Route:** `GET /api/v1/pricing/quote` (Workspace B staff consume).
- **Shared Calculation Engine:**
  - Night-by-night date calculation respecting scheduled rate overrides.
  - Generates itemized breakdown:
    - Accommodation Base Rent (`nights` $\times$ `nightly_rate`)
    - Refundable Caution Deposit (configured percentage or flat rate)
    - Service charges & VAT (if enabled in `system_settings`)
    - Total Stay Valuation
    - Minimum Payable Now (e.g. 20% deposit or full payment)
    - Balance Due on Arrival
  - Generates a signed, cryptographic `quoteToken` valid for **15 minutes**.
  - When the booking is committed via `POST /api/v1/public/booking`, the backend verifies the `quoteToken` and writes an immutable `price_snapshot` JSON object into `reservations`. Future rate updates never mutate existing booking totals.

### 2.3 Publication Gate & Version Preservation Contract
- **Public Retrieval Rules:**
  - `GET /api/v1/public/properties`: Returns only properties where `status = 'PUBLISHED'`.
  - `GET /api/v1/public/properties/:id/media`: Returns only `media_assets` where `is_published = 1` and `is_primary / display_order` ASC.
  - If a property has no approved authentic media, the backend returns the structured representative catalog with `is_representative: true`, triggering Workspace A's disclaimer: *"Representative images — actual room appearance may vary."*
- **Version Preservation During Updates:**
  - When a Manager submits material changes or replacement photos for an already published property, a new submission record (`property_submissions`, `version_number + 1`) is created.
  - **The currently published version remains visible to public visitors** in Workspace A until the new version achieves independent dual approval from both the Owner and Admin.

---

## 3. Corrected Business Terminology & Data Model

BFA operates serviced apartment residences, not a hotel. All architectural documentation, database comments, API structures, and UI copy must reflect serviced apartment operations:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SERVICED APARTMENT TERMINOLOGY STANDARDS                        │
├───────────────────────────────┬────────────────────────────────────────────────────────┤
│ Hotel Metaphor (INCORRECT)    │ BFA Serviced Apartment Terminology (CORRECT)           │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ Hotel / Resort / Property     │ Property / Building / Residential Tower                │
│ Hotel Room / Bed              │ Apartment / Serviced Unit / Executive Suite            │
│ Room Inventory / Room Types   │ Apartment Classifications (Studio, 1-Bed, 2-Bed, Pent)│
│ Hotel Guest / Transient       │ Guest / Tenant / Resident                              │
│ Hotel Folio / Room Bill       │ Reservation Record / Guest Ledger Account              │
│ Room Service / Maid Service   │ Housekeeping & Turnover / Inspection Readiness         │
│ Room Turnover Board           │ Apartment Readiness Board                              │
│ RevPAR (Revenue Per Room)     │ Occupancy Rate (%) & Net Accommodation Revenue (₦)     │
└───────────────────────────────┴────────────────────────────────────────────────────────┘
```

### Metrics Suitable for BFA's Business Model
Hotel-derived metrics like **RevPAR** are discarded because BFA apartments feature multi-day residential leases, refundable caution deposits, and variable utility overheads. BFA's authoritative operational metrics are:
1. **Apartment Occupancy Rate (%):** $\frac{\text{Occupied Apartment Nights}}{\text{Total Operational Apartment Nights}} \times 100$
2. **Average Length of Stay (ALOS):** Reflecting corporate, diplomatic, and executive residential patterns (1 night to multi-week).
3. **Net Accommodation Revenue (₦):** Rental income recognized from verified stays, strictly separated from security deposits and taxes.
4. **Caution Deposit Escrow Balances (₦):** Total tenant deposit liabilities currently held in trust.
5. **Apartment Turnover Velocity (Hours):** Time elapsed between resident departure and verified `INSPECTED_READY` state.

---

## 4. Multi-Property Assignment & Property Scope Enforcement

### 4.1 Many-to-Many Assignment Model (`user_property_assignments`)
In BFA's multi-building architecture, a Property Manager or Receptionist may be assigned to one or more buildings. The junction table `user_property_assignments` manages these linkages:

```sql
CREATE TABLE IF NOT EXISTS `user_property_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `assigned_by_id` INT NOT NULL,
  `assigned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`assigned_by_id`) REFERENCES `users`(`id`),
  UNIQUE KEY `uq_user_property` (`user_id`, `property_id`),
  INDEX `idx_upa_user` (`user_id`),
  INDEX `idx_upa_property` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 Strict Server-Side Scope Resolution
The backend middleware (`backend/src/core/middleware/propertyScope.js`) strictly verifies every request:
1. `SUPER_ADMIN` and `OWNER` have global visibility across all buildings in the portfolio.
2. `ADMIN` has global operational oversight unless explicitly restricted to specific buildings.
3. `MANAGER`, `RECEPTIONIST`, and `STAFF` have their accessible IDs loaded from `user_property_assignments` (falling back to `users.property_id`).
4. **Security Invariant:** If a user supplies `?propertyId=2` in the browser, but is only assigned to Property #1 (`Grand Horizon Tower`), the request is rejected with `403 Forbidden: FORBIDDEN_PROPERTY_SCOPE`. Browser-supplied parameters are never trusted without server-side verification.

---

## 5. Property Management & Independent Dual-Approval Workflow

### 5.1 Manager Responsibilities & Limits
The `MANAGER` is the primary operational creator and administrator of building records for assigned properties:
- Creates property draft records and maintains building specifications.
- Adds apartment units (unit number, floor, type, capacity, amenities).
- Uploads and categorizes photography into the 5 approved categories.
- Submits property bundles for publication review.
- Corrects data or photos based on reviewer comments and resubmits.
- **Strict Limit:** A Manager **cannot** mark a property as `PUBLISHED` or bypass review.

### 5.2 Independent Dual-Approval State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Manager creates building record
    DRAFT --> DRAFT: Manager edits details, adds units & uploads media
    DRAFT --> SUBMITTED_FOR_REVIEW: Manager submits for publication
    
    state SUBMITTED_FOR_REVIEW {
        [*] --> PENDING_DUAL_REVIEW
        PENDING_DUAL_REVIEW --> ADMIN_APPROVED: Admin approves independently
        PENDING_DUAL_REVIEW --> OWNER_APPROVED: Owner approves independently
        
        ADMIN_APPROVED --> FULLY_APPROVED: Owner approves independently
        OWNER_APPROVED --> FULLY_APPROVED: Admin approves independently
        
        PENDING_DUAL_REVIEW --> CHANGES_REQUESTED: Owner or Admin requests edits
        ADMIN_APPROVED --> CHANGES_REQUESTED: Owner requests edits
        OWNER_APPROVED --> CHANGES_REQUESTED: Admin requests edits
    }

    CHANGES_REQUESTED --> DRAFT: Manager corrects data/photos
    FULLY_APPROVED --> PUBLISHED: Authorized publish trigger
    PUBLISHED --> SUSPENDED: Owner or Admin suspends listing
    SUSPENDED --> PUBLISHED: Re-activated without new submission
    PUBLISHED --> DRAFT: Material changes proposed (new version created; live version remains online)
    PUBLISHED --> ARCHIVED: Soft-deactivated (historical records preserved)
```

### 5.3 Review Activity & Anti-Collusion Rules
1. **Independent Review Paths:** The Owner evaluates brand aesthetic, luxury positioning, and commercial pricing. The Admin evaluates operational readiness, inventory classifications, and staffing.
2. **Contextual Review Comments (`property_review_comments`):** Reviewers can attach itemized feedback to:
   - The overall property (`target_type = 'PROPERTY'`)
   - A specific apartment unit (`target_type = 'APARTMENT'`)
   - An individual photograph (`target_type = 'MEDIA_ASSET'`)
3. **Anti-Collusion Enforcement:** The database constraint and application layer verify:
   $$\text{admin\_reviewed\_by\_id} \neq \text{owner\_reviewed\_by\_id}$$
   Even if an administrative user temporarily holds multiple roles, two distinct authenticated humans must record approvals before `status` can reach `FULLY_APPROVED`.

---

## 6. Concurrency-Safe Receptionist Booking Claims & Service Tracking

### 6.1 Atomic Claim Engine
When an online reservation arrives, it is created with `assigned_staff_id = NULL`. It appears in the live queue of all receptionists assigned to that building.

To prevent race conditions where two receptionists claim the same booking simultaneously:
```sql
UPDATE reservations 
SET 
  assigned_staff_id = ?, 
  accepted_by_user_id = ?, 
  accepted_at = NOW() 
WHERE id = ? AND assigned_staff_id IS NULL;
```
- If `affectedRows === 1`: The claim succeeds. The receptionist receives confirmation and attribution.
- If `affectedRows === 0`: The claim fails with `409 Conflict: BOOKING_ALREADY_CLAIMED`. The UI updates immediately without creating duplicate assignment records.

### 6.2 Service Lifecycle Stages
A claimed booking transitions through distinct, traceable service states in `reservation_staff_assignments`:
- `AWAITING_ASSIGNMENT` $\rightarrow$ `CLAIMED` $\rightarrow$ `GUEST_CONTACTED` $\rightarrow$ `FOLLOW_UP_REQUIRED` $\rightarrow$ `SERVICE_IN_PROGRESS` $\rightarrow$ `CHECKED_IN` $\rightarrow$ `COMPLETED`.
- If re-assigned (e.g., across shifts), the handover is recorded with `assignment_type = 'SHIFT_HANDOVER'`, `handover_notes`, and prior staff attribution preserved.

---

## 7. Evidence-Backed Receptionist Performance Telemetry

Receptionist performance tracking relies on auditable system facts rather than subjective or easily gamed scores:

| Metric | Source Data Table | Measurement Logic | Exclusions |
|---|---|---|---|
| **Initial Response Velocity** | `reservation_staff_assignments` | Minutes between booking creation and first recorded contact attempt. | Excludes bookings cancelled by guest $<15\text{ mins}$ and system test bookings. |
| **Follow-Up Adherence** | `operational_cases` / `tasks` | % of assigned follow-up reminders completed prior to scheduled due date. | Excludes cases blocked by external guest unavailability. |
| **Guest Profile Completeness** | `guests` / `reservations` | % of checked-in guests with verified phone, email, and legal ID document recorded. | None. |
| **Payment Procedure Compliance** | `payment_receipts` | % of collected payments accompanied by verified receipt and valid transaction reference. | None. |
| **Shift Handover Quality** | `reservation_staff_assignments` | Verified presence of structured handover notes during shift reassignment (Manager rated). | Direct un-reassigned bookings. |
| **Upheld Service Infractions** | `staff_incidents` | Negative deduction based on verified, upheld disciplinary incidents. | Disputed or unverified claims. |

**Dispute Protocol:** Receptionists can view their individual telemetry transparently. If an anomaly occurs (e.g. telecom network failure preventing SMS contact), the receptionist can file a performance challenge in `/app/performance`, which Admins can adjust with a logged audit rationale.

---

## 8. Structured Operational Cases & Photographic Evidence

### 8.1 Operational Cases (`operational_cases`)
To replace untracked casual chat, all internal discussions, guest complaints, and maintenance tickets must be organized as **Structured Operational Cases**:
- **Linkage:** Linked explicitly to a `property_id`, `apartment_id`, or `reservation_id`.
- **Classification:** Categories include `GUEST_COMPLAINT`, `MAINTENANCE`, `CLEANING`, `PAYMENT_DISCREPANCY`, `SAFETY`, and `PROPERTY_REVIEW`.
- **Status Lifecycle:** `OPEN` $\rightarrow$ `ASSIGNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `AWAITING_VERIFICATION` $\rightarrow$ `RESOLVED` $\rightarrow$ `CLOSED`.
- **Action Invariant:** Chat messages cannot mutate operational state. Case closure requires documented resolution notes and manager verification.

### 8.2 Photographic Evidence Upload & Independent Verification
Evidence attachments (`operational_evidence_attachments`) support condition documentation:
- Uploads undergo binary magic-byte validation and random cryptographic naming.
- **Maker-Checker Invariant:** A staff member reporting an issue or completing a repair cannot verify their own work.
  $$\text{verified\_by\_id} \neq \text{uploaded\_by\_id}$$
- Verification statuses: `PENDING_REVIEW`, `ACCEPTED`, `REJECTED`, `REPLACEMENT_REQUIRED`.

---

## 9. Decoupled Apartment Readiness & Operational Invariant

### 9.1 Three-Dimensional Status Architecture
Housekeeping turnaround, maintenance holds, and front-office reservation occupancy operate independently:
1. **Housekeeping State:** `DIRTY` $\rightarrow$ `CLEANING_IN_PROGRESS` $\rightarrow$ `CLEANED` $\rightarrow$ `INSPECTED_READY`.
2. **Front Office State:** `VACANT`, `OCCUPIED`, `RESERVED_IMMINENT`, `BLOCKED_ADMIN`.
3. **Maintenance State:** `OPERATIONAL`, `INSPECTION_REQUIRED`, `UNDER_REPAIR`, `OUT_OF_ORDER`.

### 9.2 The Availability Invariant
An apartment unit is **AVAILABLE** for public booking or guest check-in **IF AND ONLY IF**:
$$\text{Housekeeping State} = \text{'INSPECTED\_READY'} \quad \land \quad \text{Front Office State} = \text{'VACANT'} \quad \land \quad \text{Maintenance State} = \text{'OPERATIONAL'}$$

**Protection Rule:** A housekeeper marking a cleaning task complete transitions the unit to `CLEANED`. It triggers an automated inspection task for the Manager. **It never turns an occupied, reserved, or maintenance-held room into available.**

---

## 10. Cash & Bank-Transfer Payment Recording & Traceable Receipts

### 10.1 Cash Workflow & Shift-End Reconciliation
- Receptionist receives physical cash at the front desk and executes `POST /api/v1/payments/cash`.
- System creates a `payment_transactions` record (`status = 'SUCCESS'`, `payment_method = 'CASH'`), posts to double-entry ledger (`1010 - Cash on Hand`), updates reservation payment status to `'PAID'`, and generates an official receipt (`payment_receipts`).
- **Shift-End Cash Drop Policy (Conditional on Cash Handling):**
  - Cash reconciliation is enforced **only** for shifts that logged physical cash receipts. Non-cash shifts (online/card only) close with a single click: *"Close Shift — No Physical Cash Collected"*.
  - For cash-handling shifts:
    1. System computes Expected Cash = $\sum \text{Cash Receipts for Shift}$.
    2. Receptionist counts physical notes and enters denomination totals.
    3. Variance $\Delta = \text{Counted} - \text{Expected}$ is calculated. Any discrepancy requires an auditable explanation.
    4. Cash is sealed in a numbered drop envelope and handed to the Property Manager.
    5. **Manager-Unavailable Escalation:** If the Manager is off-duty (e.g. night shift change at 6:00 AM), the envelope is deposited into the dual-custody drop safe, witnessed by a second staff member or logged with security camera timestamp. The Manager verifies and acknowledges receipt upon morning arrival.

### 10.2 Bank-Transfer Workflow (Separating Evidence from Funds)
- Guest or staff reports a bank transfer and submits the transaction reference and payment slip photo.
- System records `payment_transactions` with:
  - `payment_method = 'BANK_TRANSFER'`
  - `status = 'PENDING'`
  - `verification_status = 'UNVERIFIED_REPORTED'`
- **Financial Boundary:** No revenue is recognized, no ledger posting occurs, and the reservation balance is **not** decremented while unverified.
- Once the Finance Admin or Manager confirms funds have settled in BFA's bank account, they execute `POST /api/v1/payments/:id/verify-transfer`.
- Transaction status transitions to `'SUCCESS'`, reservation payment status updates to `'PAID'`, triggers subledger posting (`1020 - Bank Account`), and issues the official receipt.

### 10.3 Professional Receipt Generation & Voiding Standards
- Generated via PDFKit with BFA branding, CAC registration, tax ID, itemized accommodation vs. caution deposit breakdown, and QR code verification.
- **Immutability Standard:** Receipts are never overwritten or deleted. If a transaction is reversed, the receipt is marked `VOIDED` with an audited reason. Corrected receipts are re-issued with `original_receipt_id` linking to the original.

---

## 11. Agent Referrals, Privacy Isolation & Commission Governance

- **Tenant Privacy Boundary:** Agents can view only their own client referrals (`WHERE agent_id = req.user.agentId`). Hardened to return HTTP 403 if unlinked (zero fallback to Agent 1).
- **Payment Collection Quarantine:** Agents are strictly prohibited from collecting cash or verifying bank transfers on behalf of BFA.
- **Commission Governance:** Commission calculation is automatic (Migration 012), but settlement payouts remain locked until verified by Admin and Owner.

---

## 12. Resolution of the Three Owner Decisions

### 12.1 Decision 1: Shift-End Cash Reconciliation Policy
- **Options Evaluated:**
  - *Option A:* Mandatory physical cash drop for every shift regardless of payment type. *(Rejected: Impractical for non-cash shifts).*
  - *Option B:* Formal cash reconciliation required strictly for shifts that handled physical cash, with drop-safe protocol when manager is off-duty. *(Recommended).*
- **Business Implication:** Eliminates cash shortages while maintaining operational agility for night and weekend shifts.
- **Approval Required:** Owner confirmation of drop-safe discrepancy tolerance threshold (e.g. zero tolerance vs. ₦500 rounding variance).

### 12.2 Decision 2: Staff Incident Response Period Policy
- **Options Evaluated:**
  - *Option A:* Hardcoded 48-hour response window. *(Rejected: Rigid; penalizes staff during scheduled leave).*
  - *Option B:* Configurable response window (default: 48 business hours) with formal extension requests and non-punitive expiry. *(Recommended).*
- **Business Implication:** Guarantees fair due process. A missed deadline transitions the case to `AWAITING_REVIEW_NO_RESPONSE` without automated sanctions, requiring managerial evaluation of facts.
- **Approval Required:** Owner confirmation of default response window (e.g. 48 business hours) and maximum permitted extension (e.g. 48 additional hours).

### 12.3 Decision 3: Agent Commission Settlement Policy
- **Options Evaluated:**
  - *Option A:* Unverified 7-day post-departure escrow hold. *(Rejected: Unapproved policy; creates artificial accounting complexity).*
  - *Option B:* Configurable settlement schedule linked to confirmed checkout and verified accounts reconciliation. *(Recommended).*
- **Business Implication:** Payouts occur only after guest check-out is complete, full payment is verified in corporate bank, and caution deposit deductions are cleared.
- **Approval Required:** Owner approval of settlement schedule (e.g., Bi-weekly batch payout vs. 7 days post-checkout) and commission percentage parameters (e.g., 5% to 10% of net accommodation rent).

---

## 13. Proposed Database Schema: Migration 026 Specification

Migration `backend/src/db/migrations/026_property_governance_and_staff_operations.sql` is forward-only, idempotent, and protects historical records.

> [!IMPORTANT]
> **MariaDB 10.4 DDL Mechanics & Idempotency Safeguard:**  
> In MariaDB 10.4.32, DDL operations (`CREATE TABLE`, `ALTER TABLE`) execute an **implicit commit**. `connection.rollback()` in `backend/src/db/migrator.js` cannot undo DDL statements if a failure occurs halfway through execution. Furthermore, MariaDB 10.4 does not support `ADD CONSTRAINT IF NOT EXISTS`. Therefore, all foreign keys and unique constraints are defined directly inside `CREATE TABLE` statements with explicit, unique constraint names (`fk_*`), and tables are sequenced in strict topological dependency order.

```sql
-- Migration 026: Property Governance, Media Assets, Staff Operations & Financial Evidence

-- 1. Multi-Property Assignments
CREATE TABLE IF NOT EXISTS `user_property_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `assigned_by_id` INT NOT NULL,
  `assigned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_upa_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_upa_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_upa_assigned_by` FOREIGN KEY (`assigned_by_id`) REFERENCES `users`(`id`),
  UNIQUE KEY `uq_user_property` (`user_id`, `property_id`),
  INDEX `idx_upa_user` (`user_id`),
  INDEX `idx_upa_prop` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Property Submissions for Dual Review
CREATE TABLE IF NOT EXISTS `property_submissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submission_code` VARCHAR(50) NOT NULL UNIQUE,
  `property_id` INT NOT NULL,
  `version_number` INT NOT NULL DEFAULT 1,
  `submission_type` ENUM('NEW_PROPERTY', 'CONTENT_UPDATE', 'PHOTO_UPDATE') NOT NULL,
  `status` ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED_BY_ADMIN', 'APPROVED_BY_OWNER', 'FULLY_APPROVED', 'PUBLISHED', 'REJECTED') DEFAULT 'DRAFT',
  `content_snapshot` JSON NOT NULL,
  `submitted_by_id` INT NOT NULL,
  `submitted_at` TIMESTAMP NULL,
  `admin_review_status` ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED') DEFAULT 'PENDING',
  `admin_reviewed_by_id` INT NULL,
  `admin_reviewed_at` TIMESTAMP NULL,
  `admin_decision_notes` TEXT NULL,
  `owner_review_status` ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED') DEFAULT 'PENDING',
  `owner_reviewed_by_id` INT NULL,
  `owner_reviewed_at` TIMESTAMP NULL,
  `owner_decision_notes` TEXT NULL,
  `published_at` TIMESTAMP NULL,
  `published_by_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_sub_prop` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sub_submitted_by` FOREIGN KEY (`submitted_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_sub_admin_rev` FOREIGN KEY (`admin_reviewed_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_sub_owner_rev` FOREIGN KEY (`owner_reviewed_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_sub_prop_status` (`property_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Review Comments (Targeted Feedback)
CREATE TABLE IF NOT EXISTS `property_review_comments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submission_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `target_type` ENUM('PROPERTY', 'APARTMENT', 'MEDIA_ASSET') NOT NULL,
  `target_id` INT NOT NULL,
  `author_id` INT NOT NULL,
  `author_role` ENUM('OWNER', 'ADMIN', 'MANAGER') NOT NULL,
  `comment_type` ENUM('GENERAL_FEEDBACK', 'CORRECTION_REQUIRED', 'APPROVAL_NOTE', 'REJECTION_REASON') NOT NULL,
  `content` TEXT NOT NULL,
  `resolution_status` ENUM('OPEN', 'RESOLVED', 'SUPERSEDED') DEFAULT 'OPEN',
  `resolved_by_id` INT NULL,
  `resolved_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_prc_submission` FOREIGN KEY (`submission_id`) REFERENCES `property_submissions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_prc_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_prc_author` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_prc_resolved_by` FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_com_sub_target` (`submission_id`, `target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Shared Media Assets Table (Aligned with Workspace A)
CREATE TABLE IF NOT EXISTS `media_assets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `entity_type` ENUM('PROPERTY', 'APARTMENT') NOT NULL,
  `entity_id` INT NOT NULL,
  `category` ENUM('EXTERIOR', 'GROUNDS', 'FACILITIES', 'INTERIOR', 'AMENITY') NOT NULL DEFAULT 'INTERIOR',
  `file_path` VARCHAR(255) NOT NULL,
  `file_name` VARCHAR(150) NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(50) NOT NULL,
  `file_size_bytes` INT NOT NULL,
  `caption` VARCHAR(200) NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_representative` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_published` BOOLEAN NOT NULL DEFAULT FALSE,
  `submission_id` INT NULL,
  `uploaded_by` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_media_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_media_submission` FOREIGN KEY (`submission_id`) REFERENCES `property_submissions`(`id`) ON DELETE SET NULL,
  INDEX `idx_media_lookup` (`entity_type`, `entity_id`, `category`, `is_published`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Structured Operational Cases
CREATE TABLE IF NOT EXISTS `operational_cases` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `case_code` VARCHAR(50) NOT NULL UNIQUE,
  `property_id` INT NOT NULL,
  `apartment_id` INT NULL,
  `reservation_id` INT NULL,
  `category` ENUM('GUEST_COMPLAINT', 'MAINTENANCE', 'CLEANING', 'PAYMENT_DISCREPANCY', 'SAFETY', 'PROPERTY_REVIEW', 'OTHER') NOT NULL,
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `status` ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'AWAITING_VERIFICATION', 'RESOLVED', 'REOPENED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NOT NULL,
  `reported_by_id` INT NOT NULL,
  `assigned_to_id` INT NULL,
  `resolved_by_id` INT NULL,
  `resolved_at` TIMESTAMP NULL,
  `resolution_notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_oc_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_oc_apartment` FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_oc_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_oc_reported_by` FOREIGN KEY (`reported_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_oc_assigned_to` FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_oc_resolved_by` FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_case_prop_status` (`property_id`, `status`),
  INDEX `idx_case_assigned` (`assigned_to_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Structured Staff Incidents (Disciplinary & Due-Process Telemetry)
CREATE TABLE IF NOT EXISTS `staff_incidents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `incident_code` VARCHAR(50) NOT NULL UNIQUE,
  `staff_user_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `case_id` INT NULL,
  `incident_type` ENUM('UNAUTHORIZED_ABSENCE', 'CASH_VARIANCE', 'UNVERIFIED_CHECKIN', 'GUEST_COMPLAINT', 'UNAUTHORIZED_DISCOUNT', 'SAFETY_BREACH', 'INSUBORDINATION', 'OTHER') NOT NULL,
  `severity` ENUM('MINOR', 'MODERATE', 'MAJOR', 'GROSS_MISCONDUCT') NOT NULL DEFAULT 'MINOR',
  `status` ENUM('PENDING_STAFF_EXPLANATION', 'STAFF_RESPONDED', 'AWAITING_REVIEW_NO_RESPONSE', 'UNDER_INVESTIGATION', 'UPHELD', 'DISMISSED', 'APPEALED') NOT NULL DEFAULT 'PENDING_STAFF_EXPLANATION',
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NOT NULL,
  `reported_by_id` INT NOT NULL,
  `response_deadline_at` TIMESTAMP NULL,
  `staff_response` TEXT NULL,
  `staff_responded_at` TIMESTAMP NULL,
  `extension_requested_at` TIMESTAMP NULL,
  `extension_granted_hours` INT DEFAULT 0,
  `investigated_by_id` INT NULL,
  `outcome_notes` TEXT NULL,
  `penalty_type` ENUM('NONE', 'WRITTEN_WARNING', 'PERFORMANCE_DEDUCTION', 'SUSPENSION', 'TERMINATION') DEFAULT 'NONE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_si_staff_user` FOREIGN KEY (`staff_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_si_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_si_case` FOREIGN KEY (`case_id`) REFERENCES `operational_cases`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_si_reported_by` FOREIGN KEY (`reported_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_si_investigated_by` FOREIGN KEY (`investigated_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_si_staff_status` (`staff_user_id`, `status`),
  INDEX `idx_si_prop_date` (`property_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Operational Evidence Attachments
CREATE TABLE IF NOT EXISTS `operational_evidence_attachments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `case_id` INT NULL,
  `property_id` INT NOT NULL,
  `apartment_id` INT NULL,
  `reservation_id` INT NULL,
  `evidence_category` ENUM('DAMAGE', 'DEFECT', 'MAINTENANCE_BEFORE', 'MAINTENANCE_AFTER', 'CLEANING_RESULT', 'INSPECTION_CHECK', 'MISSING_ITEM', 'BANK_TRANSFER_SLIP', 'IDENTIFICATION', 'OTHER') NOT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `file_name` VARCHAR(150) NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(50) NOT NULL,
  `file_size_bytes` INT NOT NULL,
  `caption` VARCHAR(255) NULL,
  `uploaded_by_id` INT NOT NULL,
  `verification_status` ENUM('PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'REPLACEMENT_REQUIRED') DEFAULT 'PENDING_REVIEW',
  `verified_by_id` INT NULL,
  `verified_at` TIMESTAMP NULL,
  `verification_notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_oea_case` FOREIGN KEY (`case_id`) REFERENCES `operational_cases`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oea_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_oea_apartment` FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_oea_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_oea_uploaded_by` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_oea_verified_by` FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_oea_case` (`case_id`),
  INDEX `idx_oea_prop` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Historical Staff Assignments Ledger
CREATE TABLE IF NOT EXISTS `reservation_staff_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `reservation_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `assigned_receptionist_id` INT NOT NULL,
  `assignment_type` ENUM('INITIAL_CLAIM', 'MANAGER_REASSIGNED', 'SHIFT_HANDOVER', 'ESCALATION') NOT NULL,
  `assigned_by_id` INT NOT NULL,
  `service_status` ENUM('AWAITING_ASSIGNMENT', 'CLAIMED', 'GUEST_CONTACTED', 'FOLLOW_UP_REQUIRED', 'SERVICE_IN_PROGRESS', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'REASSIGNED', 'ESCALATED') DEFAULT 'CLAIMED',
  `contact_attempt_count` INT NOT NULL DEFAULT 0,
  `last_contact_at` TIMESTAMP NULL,
  `handover_notes` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `claimed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `ended_at` TIMESTAMP NULL,
  `reassignment_reason` VARCHAR(255) NULL,
  CONSTRAINT `fk_rsa_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rsa_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rsa_receptionist` FOREIGN KEY (`assigned_receptionist_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_rsa_assigned_by` FOREIGN KEY (`assigned_by_id`) REFERENCES `users`(`id`),
  INDEX `idx_rsa_res_active` (`reservation_id`, `is_active`),
  INDEX `idx_rsa_staff_date` (`assigned_receptionist_id`, `claimed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Authoritative Payment Receipts (No Cascade Delete)
CREATE TABLE IF NOT EXISTS `payment_receipts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `receipt_number` VARCHAR(50) NOT NULL UNIQUE,
  `reservation_id` INT NOT NULL,
  `payment_transaction_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `apartment_id` INT NULL,
  `payer_name` VARCHAR(150) NOT NULL,
  `payer_email` VARCHAR(191) NULL,
  `payer_phone` VARCHAR(50) NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'NGN',
  `payment_method` ENUM('CASH', 'BANK_TRANSFER', 'POS', 'CARD', 'ONLINE') NOT NULL,
  `payment_status` ENUM('PAID', 'PARTIAL', 'REVERSED', 'VOIDED') NOT NULL DEFAULT 'PAID',
  `verification_status` ENUM('VERIFIED', 'UNVERIFIED_REPORTED', 'REJECTED') NOT NULL DEFAULT 'VERIFIED',
  `verified_by_id` INT NULL,
  `verified_at` TIMESTAMP NULL,
  `issued_by_id` INT NOT NULL,
  `issued_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `receipt_status` ENUM('ORIGINAL', 'REISSUED', 'VOIDED') DEFAULT 'ORIGINAL',
  `original_receipt_id` INT NULL,
  `void_reason` VARCHAR(255) NULL,
  `pdf_path` VARCHAR(255) NULL,
  `verification_token` VARCHAR(64) NOT NULL UNIQUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_pr_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pr_transaction` FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pr_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pr_apartment` FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pr_issued_by` FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_pr_verified_by` FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_pr_original_receipt` FOREIGN KEY (`original_receipt_id`) REFERENCES `payment_receipts`(`id`) ON DELETE SET NULL,
  INDEX `idx_rec_res` (`reservation_id`),
  INDEX `idx_rec_txn` (`payment_transaction_id`),
  INDEX `idx_rec_token` (`verification_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Decouple Housekeeping & Maintenance from Occupancy
ALTER TABLE `apartments`
  ADD COLUMN IF NOT EXISTS `housekeeping_status` ENUM('DIRTY', 'CLEANING_IN_PROGRESS', 'CLEANED', 'INSPECTED_READY') NOT NULL DEFAULT 'INSPECTED_READY' AFTER `status`,
  ADD COLUMN IF NOT EXISTS `maintenance_status` ENUM('OPERATIONAL', 'INSPECTION_REQUIRED', 'UNDER_REPAIR', 'OUT_OF_ORDER') NOT NULL DEFAULT 'OPERATIONAL' AFTER `housekeeping_status`,
  ADD INDEX IF NOT EXISTS `idx_apt_readiness` (`property_id`, `housekeeping_status`, `maintenance_status`, `status`);
```

---

## 14. Implementation Dependency Sequence

```
Phase 1: Architecture Review & Owner Sign-Off (Current Step)
   ↓
Phase 2: Database Migration 026 Authoring & Isolated Verification in bfa_apartments_test_db
   ↓
Phase 3: Auth Context Security Hardening
   • Remove SUPER_ADMIN blanket bypass in authContext.js
   • Add role elevation validation in users.service.js updateUser
   • Remove agentId || 1 fallback in reservations controllers
   ↓
Phase 4: Shared Media & Property Governance Service Implementation
   • Implement media upload pipeline with magic-byte checks in uploads/properties & uploads/apartments
   • Implement Property Submission & Dual-Approval workflow (Admin & Owner channels)
   • Wire GET /api/v1/public/properties/:id/media for Workspace A consumption
   ↓
Phase 5: Concurrency-Safe Receptionist Claim Desk & Status Engine
   • Atomic conditional claim execution
   • Live operational queue filtering by user_property_assignments
   ↓
Phase 6: Decoupled Apartment Readiness Engine
   • Housekeeping dirty-cleaning-inspected lifecycle
   • Invariant verification: cleaning completion never mutates occupancy
   ↓
Phase 7: Payment Receipts & Cash Drop Reconciliation Module
   • PDFKit receipt generation with QR verification
   • Cash-handling shift reconciliation and drop-safe protocol
   • Maker-checker bank transfer verification
   ↓
Phase 8: Operational Cases & Evidence Subsystem
   • Structured operational case logging
   • Evidence attachment pipeline with maker-checker verification
   ↓
Phase 9: End-to-End Automated Testing & Public Workspace Integration Verification
   • Automated Jest test suites executed strictly in bfa_apartments_test_db
   • Clean frontend build verification (npm run build --prefix frontend)
```

---

## 15. Measurable Security, Migration & Integration Acceptance Criteria

1. **Security & Role Boundaries:**
   - Logging in as `SUPER_ADMIN` and accessing `/api/v1/financial/overview` or `/api/v1/accounting/accounts` yields `403 Forbidden`.
   - Logging in as `ADMIN` and attempting `PUT /api/v1/users/:id` with `role = 'SUPER_ADMIN'` yields `403 Forbidden`.
   - Logging in as `AGENT` without an assigned `agent_id` yields `403 Forbidden` (no fallback to Agent 1).
2. **Multi-Property Isolation:**
   - A Manager assigned to Property #1 (`Grand Horizon Tower`) requesting Property #2 (`Azure Bay Residences`) yields `403 Forbidden: FORBIDDEN_PROPERTY_SCOPE`.
3. **Dual-Approval Publication Gate:**
   - A property submitted by a Manager cannot be published if approved only by the Admin.
   - A property cannot be published if approved only by the Owner.
   - The same user ID cannot approve as both Admin and Owner.
   - Only when two distinct authorized actors have approved does `status` become `FULLY_APPROVED`.
4. **Receptionist Claim Concurrency:**
   - When two concurrent requests attempt to claim the same pending reservation simultaneously, exactly one succeeds (HTTP 200) and the second receives `409 Conflict: BOOKING_ALREADY_CLAIMED`.
5. **Readiness Invariant:**
   - Housekeeping marking a room as `CLEANED` updates `housekeeping_status`, but leaves an active `OCCUPIED` front-office status unchanged.
6. **Payment & Receipt Integrity:**
   - Cash recording generates a verified receipt.
   - Bank transfer recording creates an unverified transaction (`UNVERIFIED_REPORTED`) with zero ledger posting until manager verification.
7. **Zero-Regression Safeguard:**
   - All 25 existing migrations run cleanly on fresh install.
   - All existing automated test suites pass without regression against `bfa_apartments_test_db`.

---

## 16. Implementation Readiness Checklist

- [x] Verified actual properties in database: `Grand Horizon Tower` (1), `Azure Bay Residences` (2), `The Royal Palms Suites` (3).
- [x] Document version reconciled, audited, and incremented to Version 2.2.0.
- [x] Workspace A and Workspace B media models unified under `media_assets`.
- [x] Hotel-derived metaphors and RevPAR assumptions eliminated; serviced apartment operational metrics defined.
- [x] Replaced hardcoded 48-hour incident deadline with configurable due-process workflow.
- [x] Formulated conditional shift-end cash drop protocol with manager-unavailable drop-safe handover.
- [x] Banned cascading deletions on financial, reservation, and incident tables in Migration 026.
- [x] Confirmed codebase findings (F-01 through F-08) with line-by-line verification in `backend/`.
- [x] Corrected `payment_transactions.status` from `'PAID'` to `'SUCCESS'`.
- [x] Restored missing `staff_incidents` table and added explicit `fk_*` constraint names in Migration 026 DDL.
- [x] Documented MariaDB 10.4 implicit commit behavior and idempotent retry guards.
- [x] Established strict stop gate awaiting formal Owner policy ratification before Migration 026 execution.

---

## 17. Pre-Implementation Technical Audit Summary & Readiness Verdict

### 17.1 Technical Audit Summary (Audits A through H)
- **Audit A (Migration 026 DDL & Runner):** Verified against MariaDB 10.4.32. Addressed implicit commit limitation and `ER_DUP_KEYNAME` risks by declaring explicit constraint names (`fk_*`) inside initial `CREATE TABLE` statements. Restored omitted `staff_incidents` table.
- **Audit B (Historical Retention & FK Integrity):** Enforced `ON DELETE RESTRICT` on `payment_receipts`, `reservations`, `operational_evidence_attachments`, and `staff_incidents`. Hard deletes prohibited; soft-deactivations mandated.
- **Audit C (Unified Media & Publication Gate):** Single `media_assets` model shared across workspaces. Submissions trigger dual review while published assets remain online for public discovery (zero downtime).
- **Audit D (Dynamic Pricing & Quotes):** Single calculation engine in `pricing.service.js`. Client-side tampering at `reservations.service.js:252` eliminated via 15-minute cryptographically signed `quoteToken` and frozen `price_snapshot`. 1-night stay constraint enforced.
- **Audit E (Payments & Financial Reconciliation):** Bifurcated cash (`status = 'SUCCESS'`, instant ledger posting) from bank transfers (`status = 'PENDING'`, unverified slip, zero ledger posting until settlement verification). PDFKit receipts with QR verification.
- **Audit F (Security Findings Re-Inspection):** Line-by-line verification in `backend/` confirmed F-01 (`authContext.js:84`), F-02 (`users.service.js:206`), and F-03 (`reservations.controller.js:25`, `reservations.service.js:193`). Qualified F-05 regarding existing atomic update in `reservations.service.js:895`.
- **Audit G (Serviced Apartment Operations):** Decoupled 3-dimensional readiness status (`housekeeping_status`, `maintenance_status`, `status`) strictly preserving the operational invariant: cleaning completion never mutates occupancy.
- **Audit H (Owner Decisions Grounding):** Structured configurable parameters for shift cash drops, staff incident deadlines, and agent commission payouts.

### 17.2 Final Readiness Verdict

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FINAL READINESS VERDICT                         │
│                                                                        │
│                    READY WITH EXPLICIT CONDITIONS                      │
│                                                                        │
│ Preconditions for Implementation:                                      │
│ 1. Formal Owner ratification of the 3 commercial policies (§12).      │
│ 2. Isolated migration execution strictly in bfa_apartments_test_db.    │
│ 3. Zero writes or DDL executions touching live bfa_apartments_db.      │
└────────────────────────────────────────────────────────────────────────┘
```
