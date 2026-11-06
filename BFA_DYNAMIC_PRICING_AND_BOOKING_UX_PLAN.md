# BFA Apartments Management System
## Dynamic Pricing, Admin Controls & Public Booking UX Upgrade — Architectural Inspection & Implementation Plan

**Document Version:** 1.0.0  
**Date:** October 29, 2026  
**Status:** PROPOSED — PENDING ARCHITECTURAL & BUSINESS APPROVAL  
**Target System:** BFA Serviced Residences (Akure, Ondo State)  
**Author:** Antigravity Senior UI/UX & Backend Architecture Team  

---

## Executive Summary

The **BFA Apartments Management System** currently powers luxury serviced residential operations across three premier buildings in Akure: **Grand Horizon Tower**, **Azure Bay Residences**, and **The Royal Palms Suites**. While the public landing page offers an atmospheric Microsoft Edge–inspired visual discovery experience, its pricing model remains statically tied to single database columns (`apartments.rate_per_night`), lacking administrative schedule controls, multi-tiered room-type rules, itemized price transparency, and structured quotation breakdowns.

This document establishes the comprehensive, non-destructive architectural blueprint to:
1. Introduce a secure, role-isolated **Dynamic Pricing & Rate Scheduling Engine** for authorized internal administrators (`SUPER_ADMIN`, `ADMIN`, `MANAGER`).
2. Elevate the **Public Guest Booking Experience** into a transparent, multi-step, mobile-first journey featuring authoritative real-time quotations, itemized fee breakdowns (base rate, refundable caution deposits, service charges), and tamper-evident confirmation folios.
3. Guarantee strict **Financial Integrity, Immutability, and Subledger Compatibility** with existing accounting migrations (019–024), ensuring historical reservations and financial ledgers are preserved without retroactive recalculation.

> [!IMPORTANT]
> **Safety Guarantee & Phase Gate:** In accordance with non-negotiable safety rules, this document completes **Phase One (Inspection)** and **Phase Two (Architecture Plan)**. No application code, production migrations, or destructive database writes are executed until explicit owner approval is received.

---

## 1. Phase One — Architectural and Data Inspection

### 1.1 Existing Pricing and Reservation Logic

#### Database Schema & Inventory Inspection
A direct inspection of the live schema (`bfa_apartments_db`) confirms the following data model:

```sql
-- properties table
CREATE TABLE `properties` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `code` VARCHAR(20) UNIQUE NOT NULL,
  `address` VARCHAR(255) NOT NULL,
  `city` VARCHAR(50) NOT NULL,
  `state` VARCHAR(50) NOT NULL,
  `country` VARCHAR(50) DEFAULT 'Nigeria',
  `contact_phone` VARCHAR(30),
  `contact_email` VARCHAR(100),
  `status` ENUM('ACTIVE','INACTIVE','MAINTENANCE') DEFAULT 'ACTIVE',
  `operational_status` VARCHAR(50) DEFAULT 'OPERATIONAL',
  `check_in_time` TIME DEFAULT '14:00:00',
  `check_out_time` TIME DEFAULT '11:00:00',
  `amenities` JSON,
  `notes` TEXT,
  `is_archived` BOOLEAN DEFAULT FALSE
);

-- apartments table
CREATE TABLE `apartments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NOT NULL,
  `unit_number` VARCHAR(20) NOT NULL,
  `unit_name` VARCHAR(100),
  `unit_type` VARCHAR(50) NOT NULL,
  `floor` INT,
  `capacity` INT NOT NULL DEFAULT 2,
  `bedroom_count` INT NOT NULL DEFAULT 1,
  `bathroom_count` INT NOT NULL DEFAULT 1,
  `status` ENUM('AVAILABLE','OCCUPIED','MAINTENANCE','CLEANING','RESERVED') DEFAULT 'AVAILABLE',
  `rate_per_night` DECIMAL(10,2) NOT NULL,
  `amenities` JSON,
  `notes` TEXT,
  `is_active` BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`)
);

-- reservations table
CREATE TABLE `reservations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `reservation_code` VARCHAR(20) UNIQUE NOT NULL,
  `property_id` INT NOT NULL,
  `apartment_id` INT NOT NULL,
  `tenant_name` VARCHAR(100) NOT NULL,
  `tenant_email` VARCHAR(100) NOT NULL,
  `tenant_phone` VARCHAR(30) NOT NULL,
  `source` ENUM('ONLINE','FRONT_DESK','PHONE','AGENT') DEFAULT 'ONLINE',
  `check_in_date` DATE NOT NULL,
  `check_out_date` DATE NOT NULL,
  `nights` INT NOT NULL,
  `total_amount` DECIMAL(10,2) NOT NULL,
  `paid_amount` DECIMAL(10,2) DEFAULT 0.00,
  `status` ENUM('PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW') DEFAULT 'PENDING',
  `payment_status` ENUM('PAYMENT_PENDING','PARTIAL_PAID','PAYMENT_SUCCESS','REFUNDED') DEFAULT 'PAYMENT_PENDING',
  `payment_method` ENUM('CASH','BANK_TRANSFER','POS','ONLINE','CARD','PAY_AT_PROPERTY') NULL,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`),
  FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`)
);
```

#### Rate Authority & Inventory Snapshot
The system currently hosts **3 active properties** across 8 configured luxury suites:
1. **Grand Horizon Tower (`GHT`, id: 1)**
   - Unit 101: *Executive Penthouse* — ₦350,000 / night
   - Unit 102: *1-Bedroom Deluxe* — ₦220,000 / night
   - Unit 103: *Studio Premier* — ₦160,000 / night (Property Starting Rate)
   - Unit 104: *2-Bedroom Executive* — ₦290,000 / night
2. **Azure Bay Residences (`ABR`, id: 2)**
   - Unit 201: *2-Bedroom Luxury* — ₦280,000 / night
   - Unit 202: *Studio Standard* — ₦140,000 / night (Property Starting Rate)
   - Unit 203: *3-Bedroom Royal* — ₦450,000 / night
3. **The Royal Palms Suites (`RPS`, id: 3)**
   - Unit 301: *1-Bedroom Deluxe* — ₦200,000 / night (Property Starting Rate)

#### Current Pricing Computation & Data Flow
- **Rate Origin:** Rates originate strictly from `apartments.rate_per_night`.
- **Public Room-Type Aggregation:** `backend/src/modules/public/public.controller.js` dynamically groups individual units by `unit_type` in memory and computes `startingRate = MIN(unit.rate_per_night)`.
- **Availability & Pricing Endpoint:** `POST /api/v1/public/check-availability` calls `ReservationsService.checkAvailability`, which returns a flat scalar `ratePerNight: parseFloat(apartment.rate_per_night)`.
- **Public Booking Submission:** `POST /api/v1/public/booking` delegates to `ReservationsService.createReservation`, which commits:
  ```javascript
  const ratePerNight = parseFloat(apartment.rate_per_night);
  const totalAmount = data.total_amount ? parseFloat(data.total_amount) : ratePerNight;
  ```
- **Post-Booking Accounting Bridge:** When online payment succeeds or front-desk settlement is recorded, `PaymentsService.processPayment` invokes `PostingBridgeService.postPayment(insertId)`, posting double-entry debit/credit journals directly to the general ledger.

---

### 1.2 Missing Capabilities

| Functional Area | Current System State | Target Enterprise Requirement |
|---|---|---|
| **Room-Type Level Pricing** | Rates exist solely per individual unit; updating a room type requires editing every unit row individually. | Hierarchical rate inheritance: Property Room-Type Base Rate with optional Unit-Specific Overrides. |
| **Scheduled Rate Changes** | Rate changes are immediate; updating a price overwrites the row immediately without date awareness. | Time-bounded rate rules (`effective_from` to `effective_to`) for holiday seasons, weekends, and peak dates. |
| **Transparent Cost Itemization** | Scalar `total_amount` only; no itemized breakdown of base rent, caution deposits, or service charges. | Itemized authoritative quote engine calculating Subtotal, Refundable Caution Deposit, VAT/Taxes, and Amount Due Now vs. Later. |
| **Authoritative Pre-Booking Quote API** | Visitors only learn the final cost at availability check; no non-binding quotation endpoint exists. | `POST /api/v1/public/quote` endpoint returning authoritative calculation with cryptographic validity token. |
| **Admin Pricing Control Center** | Admins must open `ApartmentsPage.jsx` and edit individual unit modal forms one by one. | Dedicated Pricing Management view supporting bulk room-type adjustments, schedule calendar, and rule management. |
| **Rate Change Auditability** | Rate modifications are recorded as generic `UNIT_UPDATED` entries in `audit_logs`. | Dedicated pricing audit log tracking `old_rate`, `new_rate`, `effective_range`, `admin_user_id`, and mandatory `reason`. |
| **Public Multi-Step Booking UX** | Single-form submission without step-by-step review, itemized deposit transparency, or agreement conditions. | Accordion / Step-by-step checkout: 1. Date & Room Selection → 2. Transparent Quote Breakdown → 3. Guest Profile → 4. Payment Selection → 5. Confirmation Folio. |

---

### 1.3 Integration Risks with Existing Financial Logic

1. **Risk of Retroactive Financial Alteration:**
   - *Impact:* If an apartment rate is adjusted from ₦160,000 to ₦190,000, any system query that joins historical reservations with current apartment rates could recalculate outstanding balances or report distorted revenue.
   - *Safeguard:* **Strict Price Immutability.** An immutable JSON `price_snapshot` must be recorded on the reservation record at insertion time. All invoicing, check-in folios, and payment reconciliations must reference the snapshot, never the live pricing table.
2. **Subledger & Ledger Desynchronization:**
   - *Impact:* Migrations 019–024 established strict double-entry balance rules (`ledger_entries`). Introducing caution deposits or service charges without structured ledger mapping would cause debit/credit unbalance.
   - *Safeguard:* Segregate accommodation rent (credited to `REVENUE_ROOMS`) from refundable caution deposits (credited to `LIABILITY_GUEST_DEPOSITS`). The existing `PostingBridgeService` will be updated to read the itemized breakdown.
3. **One-Night Stay Policy Enforcement:**
   - *Impact:* The BFA business model strictly enforces a **1-night maximum stay per reservation**.
   - *Safeguard:* The pricing calculation and booking validation engines preserve `validateOneNightStay(checkInDate)`, calculating nightly rates deterministically for the single contracted night.
4. **Payment Gateway Provider Idempotency:**
   - *Impact:* Duplicate webhook deliveries or double clicks by guests could lead to double ledger postings.
   - *Safeguard:* Retain existing provider reference deduplication in `PaymentsService.processPayment`, ensuring that re-submission returns the canonical transaction record without double-posting.

---

### 1.4 Backward Compatibility Strategy

- **Legacy Reservation Preservation:**
  Existing reservations created before this upgrade do not contain a `price_snapshot` column.
- **Graceful Fallback Logic:**
  Any service or UI component reading a reservation without a `price_snapshot` will dynamically synthesize a backward-compatible breakdown:
  ```javascript
  const getReservationSnapshot = (reservation) => {
    if (reservation.price_snapshot) {
      return typeof reservation.price_snapshot === 'string'
        ? JSON.parse(reservation.price_snapshot)
        : reservation.price_snapshot;
    }
    // Backward-compatible synthesized fallback
    return {
      version: 'legacy-v1',
      baseRate: parseFloat(reservation.total_amount),
      nights: reservation.nights || 1,
      subtotal: parseFloat(reservation.total_amount),
      cautionDeposit: 0.00,
      serviceCharge: 0.00,
      taxes: 0.00,
      totalAmount: parseFloat(reservation.total_amount),
      isLegacy: true,
    };
  };
  ```
- **Zero Schema Disruption:** The database migration will only perform additive operations (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN NULL`). No columns are renamed or dropped.

---

## 2. Phase Two — Architecture and Implementation Plan

### 2.1 Proposed Database Migration (`025_dynamic_pricing_and_snapshots.sql`)

```sql
-- Migration 025: Dynamic Pricing Rules, Schedules, and Reservation Snapshots
-- Target: MariaDB / MySQL (InnoDB)

-- 1. Create pricing_rules table for base, seasonal, and promotional rates
CREATE TABLE IF NOT EXISTS `pricing_rules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NOT NULL,
  `unit_type` VARCHAR(50) NULL COMMENT 'NULL indicates rule applies across all types in property',
  `apartment_id` INT NULL COMMENT 'NULL indicates rule applies to all units of unit_type',
  `rule_name` VARCHAR(100) NOT NULL COMMENT 'e.g. Standard Base, Weekend Surge, Christmas 2026',
  `rule_type` ENUM('BASE', 'WEEKEND', 'SEASONAL', 'PROMO', 'OVERRIDE') NOT NULL DEFAULT 'BASE',
  `rate_per_night` DECIMAL(10,2) NOT NULL,
  `caution_deposit` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Refundable security deposit',
  `service_charge_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `tax_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL COMMENT 'NULL indicates open-ended / indefinite',
  `priority` INT NOT NULL DEFAULT 0 COMMENT 'Higher integer takes precedence during resolution',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_by` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_pricing_lookup` (`property_id`, `unit_type`, `apartment_id`, `effective_from`, `effective_to`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add price_snapshot column to reservations table
ALTER TABLE `reservations`
ADD COLUMN `price_snapshot` JSON NULL AFTER `total_amount`;

-- 3. Register granular dynamic pricing capabilities
INSERT INTO `capabilities` (`name`, `description`, `is_enabled`, `created_at`, `updated_at`)
VALUES 
  ('PRICING_MANAGE_RATES', 'Ability to alter base apartment and room-type pricing rules', 1, NOW(), NOW()),
  ('PRICING_SCHEDULE_CHANGES', 'Ability to schedule future date-bounded pricing adjustments', 1, NOW(), NOW()),
  ('PRICING_VIEW_AUDIT', 'Ability to view pricing modification audit histories', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
```

---

### 2.2 Proposed Backend Services and API Contracts

```
┌─────────────────────────────────────────────────────────────┐
│                 Client Request (Public / Staff)             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             pricing.service.js (Unified Engine)             │
│                                                             │
│  Resolution Precedence:                                     │
│  1. Specific Apartment Date Override (Priority: 40)         │
│  2. Room-Type Seasonal / Promo Rule (Priority: 30)          │
│  3. Room-Type Property Base Rule    (Priority: 20)          │
│  4. Legacy Fallback: apartments.rate_per_night (Priority: 0) │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│     Authoritative Quote     │ │    Reservation Snapshot     │
│  - Nightly Rate             │ │  Stored as JSON in          │
│  - Caution Deposit          │ │  reservations.price_snapshot│
│  - Total Stay Cost          │ │  at booking commitment      │
└─────────────────────────────┘ └─────────────────────────────┘
```

#### New Service: `backend/src/modules/pricing/pricing.service.js`
- `resolveRate({ propertyId, apartmentId, unitType, date })`: Determines the active rate rule by sorting active candidates by `priority DESC, created_at DESC LIMIT 1`.
- `calculateQuote({ propertyId, apartmentId, checkInDate })`:
  - Enforces mandatory 1-night validation.
  - Resolves base rate, refundable caution deposit, service fee, and tax.
  - Computes `subtotal`, `cautionDeposit`, `serviceCharge`, `taxAmount`, and `totalAmount`.
  - Generates an encrypted/signed quotation token (`quoteToken`) to ensure client price submissions cannot be manipulated.
- `createRule(ruleData, userId)`: Inserts new pricing rule and logs detailed audit trail.
- `updateRule(id, ruleData, userId)`: Updates rule with validation and records audit entry.
- `deleteRule(id, userId)`: Soft-deletes / deactivates rule.

#### API Endpoints Contract

| Endpoint | Method | Role / Access | Purpose |
|---|---|---|---|
| `/api/v1/public/quote` | POST | Public | Authoritative calculation of stay cost, refundable deposit, and payment breakdown. |
| `/api/v1/public/check-availability` | POST | Public | Validates unit availability and returns current authoritative price quote. |
| `/api/v1/public/booking` | POST | Public | Creates reservation and permanently stores immutable `price_snapshot`. |
| `/api/v1/pricing/rules` | GET | `SUPER_ADMIN`, `ADMIN`, `MANAGER` | Retrieves configured pricing rules (scoped to assigned property for managers). |
| `/api/v1/pricing/rules` | POST | `SUPER_ADMIN`, `ADMIN`, `MANAGER` | Creates a new base, weekend, or seasonal pricing rule. |
| `/api/v1/pricing/rules/:id` | PUT | `SUPER_ADMIN`, `ADMIN`, `MANAGER` | Modifies an existing rule with change rationale. |
| `/api/v1/pricing/rules/:id` | DELETE | `SUPER_ADMIN`, `ADMIN` | Deactivates or removes a pricing rule. |
| `/api/v1/pricing/audit` | GET | `SUPER_ADMIN`, `ADMIN`, `OWNER` | Paginated audit trail of all rate modifications. |

---

### 2.3 Proposed Administrative Experience

The internal admin interface will integrate directly into the existing luxury navy-and-gold design system without disrupting existing pages.

#### 1. Pricing Control Center (`ApartmentsPage.jsx` & New Drawer)
- **Rate Rule Configuration Modal:**
  - **Scope Selector:** Choose between *Room Type across Property* or *Individual Unit Override*.
  - **Rule Type:** Base Rate, Weekend Surge, Seasonal / Holiday Surge, or Special Promotional.
  - **Financial Parameters:**
    - Nightly Rate (₦)
    - Refundable Caution Deposit (₦)
    - Service Charge (%)
  - **Date Validity Range:** Effective From (required) and Effective To (optional for open-ended).
  - **Mandatory Rationale Note:** e.g., *"Q4 Peak Holiday Rate Adjustment"*.
- **Visual Rate Calendar & Schedule List:**
  - Color-coded badges for `ACTIVE`, `UPCOMING`, `EXPIRED`, and `OVERRIDE`.
  - Inline preview showing how a scheduled rule will affect the public starting rate.

#### 2. Staff Quotation & Phone Desk Calculator
- Integrated into `FrontOfficePage.jsx` and `ReservationsPage.jsx`.
- Allows receptionists to select any suite, enter check-in date, and immediately generate an authoritative quotation card for prospective telephone callers.
- One-click action: *"Convert to Direct Reservation"*, which locks in the calculated price snapshot.

#### 3. Reservation Price Breakdown & Folio View
- In `ReservationsPage.jsx` and `FrontOfficePage.jsx`, clicking any reservation displays the **Immutable Price Folio**:
  - Base Accommodation Rate
  - Refundable Security / Caution Deposit
  - Taxes / Service Charges (if applicable)
  - Total Stay Valuation
  - Amount Paid & Outstanding Balance
  - Rule Reference & Timestamp of Agreement

---

### 2.4 Proposed Public Booking UX Upgrade

The public landing experience will be refined to give prospective guests maximum transparency, confidence, and ease of reservation on both desktop and mobile devices.

#### 1. Multi-Step Accordion Booking Progression
Instead of an abrupt form jump, the booking section on `LandingPage.jsx` and `PropertyDetailPage.jsx` will progress through structured, intuitive phases:

```
[ Step 1: Dates & Suite Selection ]
       │
       ▼
[ Step 2: Authoritative Live Price Breakdown ]
       ├─ Accommodation (1 Night):  ₦160,000.00
       ├─ Refundable Caution Deposit: ₦25,000.00
       ├─ Service & Maintenance Fee:    ₦5,000.00
       ├─────────────────────────────────────────
       └─ Total Due at Booking:    ₦190,000.00
       │
       ▼
[ Step 3: Guest Profile & Contact Information ]
       │
       ▼
[ Step 4: Transparent Payment Method Selection ]
       ├─ Pay Online (Instant Card / Transfer Confirmation)
       └─ Pay at Front Desk (Hold Suite & Settle on Arrival)
       │
       ▼
[ Step 5: Review & Cryptographic Reservation Commitment ]
```

#### 2. Sticky Mobile Price Summary Drawer
- On mobile viewports, as the user progresses through guest details, a sleek midnight-navy and gold bottom drawer displays the active suite, check-in date, and total payable amount with a toggle to view the itemized breakdown.
- Ensures the guest never loses sight of their total commitment while typing on a mobile keyboard.

#### 3. Post-Booking Cryptographic Confirmation Folio
- Displays the cryptographic confirmation badge (`BFA-RES-...`), suite details, check-in window (From 14:00), itemized folio, and WhatsApp concierge direct-link.
- One-click *"Download Booking Folio (PDF/Receipt)"* for instant guest records.

---

### 2.5 Implementation Sequence & Verification Plan

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Architectural Review & Approval (Current Milestone)│
└──────────────────────────────┬──────────────────────────────┘
                               │ User approval received
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Database Migration (025)                           │
│  - Tested strictly against bfa_apartments_test_db           │
│  - Zero modifications to shared bfa_apartments_db           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Backend Services & API Endpoints                   │
│  - pricing.service.js & pricing.controller.js               │
│  - Update ReservationsService with price_snapshot           │
│  - Update PostingBridgeService for deposit allocation       │
│  - Unit tests for resolution precedence and calculation     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Admin Pricing Control Center UI                    │
│  - Rate Rule Drawer in ApartmentsPage.jsx                   │
│  - Scheduled Rates Overview Table                           │
│  - Quotation Calculator Widget                              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 5: Public Booking UX Upgrade & Verification           │
│  - Accordion Booking Flow & Real-Time Breakdown             │
│  - Sticky Mobile Price Drawer                               │
│  - Multi-viewport verification (Desktop 1440px, Mobile 375px)│
└──────────────────────────────┬──────────────────────────────┘
```

#### Automated Verification Strategy
1. **Migration Verification:** Test applying and rolling back migration `025` on `bfa_apartments_test_db`.
2. **Pricing Precedence Test Suite:**
   - Test 1: Unit with specific date override takes precedence over room-type rule.
   - Test 2: Room-type rule takes precedence over property baseline.
   - Test 3: Unconfigured unit safely falls back to `apartments.rate_per_night`.
   - Test 4: Indefinite rule remains active; expired date rule cleanly falls back.
3. **Financial Snapshot Immutability Test:**
   - Create reservation at ₦160,000.
   - Update unit price rule to ₦200,000.
   - Verify reservation folio and ledger balance remain exactly ₦160,000.
4. **Frontend Production Build:** Execute `npm run build --prefix frontend` to confirm zero lint or compilation defects.

---

## 3. Risk Register & Mitigation Matrix

| Identified Risk | Severity | Mitigation Strategy |
|---|---|---|
| **Client-Side Price Tampering** | High | The client UI never calculates or submits final prices. All calculations are executed by `pricing.service.js` on the server. The booking API verifies the signed quote token before accepting the reservation. |
| **Historical Reservation Corruption** | Critical | Existing reservations without `price_snapshot` are handled via backward-compatible synthesis. The migration is strictly additive. |
| **Ledger Unbalance on Deposits** | High | Caution deposits are tracked under a separate liability account code (`LIABILITY_GUEST_DEPOSITS`). The posting bridge generates balanced double-entry journals for both rent and deposits. |
| **Cross-Property Rate Edits** | Medium | Manager role access is scoped strictly to their assigned `property_id` in `pricing.service.js`. Only `SUPER_ADMIN` and `ADMIN` have multi-property authority. |
| **Mobile Form Abandonment** | Medium | Multi-step accordion flow breaks the form into bite-sized segments with inline validation, preventing overwhelming form length on mobile devices. |

---

## 4. Phase Three — Business Decisions & Questions for Owner Review

Before proceeding with Phase 2 implementation, please confirm the following business preferences:

1. **Refundable Caution Deposit Policy:**
   - *Question:* Should caution deposits be mandatory across all room types (e.g., fixed ₦25,000 / suite), or should they be optional and configured per property/unit type?
   - *Recommendation:* Configured per room type, with default set to ₦0.00 until the property manager explicitly activates it.
2. **VAT / Tax Presentation:**
   - *Question:* In Nigerian serviced apartments, should the headline starting price on the landing page include VAT/consumption tax, or should tax be calculated and itemized separately at checkout?
   - *Recommendation:* Follow Nigerian hospitality standard where the headline price is tax-inclusive, but checkout provides the transparent subtotal + tax breakdown for corporate accounting folios.
3. **Pay at Property vs. Instant Digital Prepayment:**
   - *Question:* Should both payment options remain active for online public bookings, or do you want to require full prepayment during peak scheduled periods?
   - *Recommendation:* Keep both options enabled, utilizing the existing dynamic capability engine (`PAY_AT_PROPERTY` toggle) so admins can toggle this globally or during specific holidays.

---

## Conclusion & Stop Gate

This implementation plan establishes an airtight, scalable, and audit-compliant blueprint for dynamic pricing and modern booking UX across BFA's luxury residences.

**Current Action:** In accordance with instructions, work has stopped at this milestone. Execution will proceed immediately upon your review, feedback, and authorization.

