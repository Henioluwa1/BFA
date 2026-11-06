# BFA Apartments Management System
## Staff Workstream — Internal Pricing Management & Booking Operations Implementation Plan

**Document Version:** 1.0.0  
**Date:** October 29, 2026  
**Status:** PROPOSED — PENDING REVIEW & APPROVAL  
**Author:** Antigravity Engineering (Staff Workstream)

---

## Executive Summary

The BFA Apartments Management System serves luxury serviced residential apartments across multiple properties (Grand Horizon Tower, Azure Bay Residences, and Serene Heights). While a parallel workstream enhances the public landing page, apartment discovery, and visitor booking journey, this plan defines the authoritative architecture, data structures, backend services, role-based controls, UI workflows, and financial safeguards required on the **internal staff side**.

The goal is to ensure end-to-end coherence between customer-facing pricing/availability and staff-side administration, guaranteeing price transparency, immutability of contracted reservations, robust role-based property isolation, and continuous financial integrity.

---

## 1. Existing Staff-Side Architecture

### 1.1 Frontend Technology Stack & Structure
- **Framework:** React 18, Vite, React Router DOM v6, Tailwind CSS.
- **Design System:** Luxury Hospitality Theme (Outfit font, deep navy/slate palettes `#0b132b`, `#1c2541`, rich gold accents `#c5a880`, `#d4af37`, and crisp semantic indicators).
- **Directory Layout:**
  - `frontend/src/pages/portal/`: Dedicated staff portal pages:
    - `DashboardPage.jsx`: High-level operational & financial KPIs, occupancy, quick actions.
    - `ApartmentsPage.jsx`: Apartment grid/table, unit status cards, inline unit rate editing, blocked dates modal.
    - `ReservationsPage.jsx`: Master reservation lifecycle management (Pending, Confirmed, Checked In, Checked Out, Cancelled).
    - `FrontOfficePage.jsx`: Real-time operational desk: today's arrivals/departures, pending web booking queue, staff assignment, employee performance evaluations.
    - `FinancePage.jsx`: Revenue reports, payment ledger, accounts receivable, security deposits, journal entries.
    - `SettingsPage.jsx`: Property definitions, user accounts, system configuration, dynamic capability engine.
    - `OperationsControlPage.jsx`: Continuous live event stream, background health monitors, audit activity.
  - `frontend/src/components/layout/AppLayout.jsx`: Responsive drawer navigation, active property context switcher, notification tray, and authenticated user role badges.

### 1.2 Authentication & Authorization Foundation
- **JWT Authentication:** Strict server-side verification in `backend/src/middleware/authContext.js`.
- **Role Hierarchy:**
  - `SUPER_ADMIN`: Unrestricted global system authority.
  - `ADMIN`: Global administration, system parameters, company-wide pricing, user roles.
  - `OWNER`: Global executive visibility, financial reports, employee performance oversight (read-only operations; never assigned front-desk clients).
  - `MANAGER`: Property-scoped operations, unit status, local reservation handling, expense submissions.
  - `RECEPTIONIST`: Property-scoped front desk, arrivals/departures, client check-in/out, accepting pending web bookings (read-only rates; cannot alter unit prices).
  - `STAFF`: Housekeeping and maintenance tasks; no pricing or financial management.
  - `AGENT`: Partner portal; read-only assigned bookings.
- **Capabilities System:** Backed by database table `capabilities` (seeded in migration `006_create_capabilities_table.sql`).

---

## 2. Existing Reservation and Pricing Data Structures

### 2.1 Apartment Data Structure (`apartments` table)
```sql
CREATE TABLE `apartments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NOT NULL,
  `unit_number` VARCHAR(20) NOT NULL,
  `unit_name` VARCHAR(100),
  `unit_type` VARCHAR(50) NOT NULL, -- e.g., '1-Bedroom', '2-Bedroom', 'Studio', 'Penthouse'
  `floor` INT,
  `capacity` INT NOT NULL DEFAULT 2,
  `bedroom_count` INT NOT NULL DEFAULT 1,
  `bathroom_count` INT NOT NULL DEFAULT 1,
  `status` ENUM('AVAILABLE','OCCUPIED','MAINTENANCE','CLEANING','RESERVED') DEFAULT 'AVAILABLE',
  `rate_per_night` DECIMAL(10,2) NOT NULL, -- Current static base price
  `amenities` JSON,
  `notes` TEXT,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`)
);
```
**Current State & Limitations:**
- `rate_per_night` is a single static column.
- Rates can only be set per individual apartment unit, with no room-type baseline pricing.
- No support for scheduled future rate changes (e.g. peak season rate starting on December 1st).
- Updating `rate_per_night` immediately overwrites the column without an effective date range or dedicated pricing audit record.

### 2.2 Reservation Data Structure (`reservations` table)
```sql
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
  `payment_status` ENUM('PENDING','PARTIAL','PAID','REFUNDED','PARTIALLY_REFUNDED') DEFAULT 'PENDING',
  `payment_method` ENUM('CASH','BANK_TRANSFER','POS','ONLINE','CARD') NULL,
  `special_requests` TEXT,
  `notes` TEXT,
  `cancellation_reason` TEXT,
  `assigned_staff_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`),
  FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`),
  FOREIGN KEY (`assigned_staff_id`) REFERENCES `users`(`id`)
);
```
**Current State & Limitations:**
- `total_amount` is stored as a flat scalar (`nights * rate_per_night`).
- There is no price breakdown snapshot column. If pricing includes caution/security deposits, cleaning fees, taxes, or multi-rate date ranges, the itemized components cannot be reconstructed from the reservation record.
- If an apartment's base rate changes in the future, past historical reservations rely only on `total_amount`, lacking transparency regarding the exact nightly quote accepted by the customer.

---

## 3. Existing API Endpoints and Relevant Permissions

| Endpoint | Method | Allowed Roles | Description & Current Behavior |
|---|---|---|---|
| `/api/v1/apartments` | GET | Authenticated (scoped by property for Manager/Receptionist) | Lists apartment units with their current `rate_per_night`. |
| `/api/v1/apartments/:id` | GET | Authenticated | Retrieves single apartment unit details. |
| `/api/v1/apartments` | POST | `SUPER_ADMIN`, `ADMIN` | Creates new unit with initial `rate_per_night`. |
| `/api/v1/apartments/:id` | PUT | `SUPER_ADMIN`, `ADMIN`, `MANAGER` (assigned property) | Updates unit details including `rate_per_night`. |
| `/api/v1/reservations` | GET | Authenticated (scoped by property) | Lists reservations with filters (`status`, `date_range`, `search`). |
| `/api/v1/reservations/:id` | GET | Authenticated (scoped by property) | Fetches single reservation record and payments. |
| `/api/v1/reservations` | POST | Authenticated (Staff / Agent) | Creates reservation; locks apartment row via `SELECT ... FOR UPDATE` and sets `total_amount = rate_per_night * nights`. |
| `/api/v1/reservations/:id/status` | PUT | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | Handles status transitions: `CONFIRMED`, `CHECKED_IN`, `CHECKED_OUT`, `CANCELLED`. |
| `/api/v1/reservations/:id/payments` | POST | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | Records payment transaction, updates `paid_amount` and `payment_status`, posts to financial ledger. |
| `/api/v1/front-office/pending` | GET | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | Lists pending web bookings awaiting front-desk acceptance. |
| `/api/v1/front-office/accept` | POST | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | Assigns pending reservation to the accepting receptionist and links to employee evaluation. |

---

## 4. Missing Capabilities & Functional Gaps

1. **Dynamic Pricing & Rate Scheduling:**
   - Staff cannot configure a scheduled price change with a future effective date (e.g. holiday surge starting in 3 weeks).
   - Staff cannot set default pricing at the room-type level across an entire property.
   - No distinction between base weekday rates and weekend/seasonal rates.
2. **Authoritative Non-Binding Quotation Service:**
   - Staff have no instant quotation calculator to preview costs, breakdown, and required deposit for prospective guests over the phone or at the desk without creating a dummy reservation.
3. **Reservation Price Snapshot & Transparency:**
   - No structured breakdown (`price_snapshot`) stored with reservations.
   - Front desk staff cannot inspect the itemized elements of what the guest agreed to (base rate, security deposit, taxes, number of nights).
4. **Audit Trail for Rate Modifications:**
   - Current rate edits are recorded only as generic `UNIT_UPDATED` in `audit_logs`. There is no dedicated pricing audit record capturing `old_rate`, `new_rate`, `effective_from`, `effective_to`, `changed_by_user_id`, and `reason`.
5. **Granular Pricing Permissions:**
   - In the capabilities registry (`capabilities` table), there are no specific flags for `PRICING_MANAGE_RATES` and `PRICING_SCHEDULE_CHANGES`.

---

## 5. Proposed UI Screens and Workflows

### 5.1 Enhanced Apartments & Dynamic Pricing Management (`ApartmentsPage.jsx`)
- **Rate Management Drawer / Modal:**
  - Accessible to `SUPER_ADMIN`, `ADMIN`, and property `MANAGER`.
  - Rate Scope Selector:
    - *Single Apartment Unit* (e.g., Unit 104 - Azure Bay).
    - *All Units of Room Type* in selected property (e.g., all "2-Bedroom" in Grand Horizon).
  - Effective Date Configuration:
    - **Immediate Effect:** Applies immediately to the current base rate.
    - **Scheduled Future Effect:** Date picker for `effective_from` (and optional `effective_to`).
  - Required Field: `Change Rationale / Business Reason` (e.g., "High-season rate adjustment Q4 2026").
- **Scheduled Price Changes Table:**
  - Tabular list showing: Target (Unit/Room Type), Property, Current Rate, Scheduled Rate, Effective Date, Scheduled By, and Actions (`Cancel Schedule`).
  - Status badges: `SCHEDULED` (upcoming), `ACTIVE` (in effect), `EXPIRED`, `CANCELLED`.

### 5.2 Staff Quotation & Rate Calculator Widget
- **Accessible from:** Front Office, Reservations Page, and Dashboard.
- **Workflow:**
  1. Staff selects Property, Room Type (or specific Unit), Check-In Date, and Check-Out Date.
  2. System queries the authoritative pricing calculation engine.
  3. Displays instant itemized quotation card:
     - Nightly rate breakdown across the selected dates.
     - Subtotal base rent.
     - Mandatory Refundable Caution Deposit (if configured).
     - Minimum required deposit to confirm booking (e.g. 20% or 1 night).
     - Total stay cost.
  4. One-click button: *"Convert to Direct Reservation"* pre-populates the reservation modal with the exact locked price snapshot.

### 5.3 Transparent Price Snapshot in Reservation Details (`ReservationsPage.jsx` & `FrontOfficePage.jsx`)
- **Price Transparency Card:**
  - Displays immutable contract snapshot:
    - Base Rate per Night at booking time (e.g. ₦65,000 / night).
    - Duration: 4 Nights (Nov 10 – Nov 14, 2026).
    - Accommodation Subtotal: ₦260,000.
    - Security / Caution Deposit: ₦50,000 (Refundable).
    - Agreed Total: ₦310,000.
    - Payment Progress: ₦62,000 Paid (20% Deposit) | ₦248,000 Balance Due on Check-In.
- **Audit History Tab:**
  - Full chronological timeline of reservation actions: Created, Assigned Staff, Payment Recorded, Status Changed, Check-In, Check-Out.

---

## 6. Required Backend Services and API Contracts

### 6.1 Unified Pricing Service (`backend/src/services/pricing.service.js`)
Centralizes all rate resolution and quotation logic:
- `getEffectiveRate(apartmentId, date)`:
  - Checks `apartment_pricing_schedules` for an active schedule matching `apartment_id` (or unit's `unit_type` and `property_id`) where `effective_from <= date` and (`effective_to IS NULL` or `effective_to >= date`).
  - If found, returns scheduled `rate_per_night`.
  - Otherwise, falls back to `apartments.rate_per_night`.
- `calculateQuote({ propertyId, apartmentId, unitType, checkInDate, checkOutDate })`:
  - Iterates night-by-night from `checkInDate` to `checkOutDate`.
  - Determines daily rate for each night.
  - Computes `baseAmount`, `nights`, `averageNightlyRate`, `depositPercentage`, `requiredDepositAmount`, and `totalAmount`.
  - Returns complete quotation payload.
- `scheduleRateChange({ propertyId, apartmentId, unitType, ratePerNight, effectiveFrom, effectiveTo, reason, userId })`:
  - Inserts record into `apartment_pricing_schedules`.
  - Logs structured entry in `audit_logs`.
- `cancelScheduledRateChange(scheduleId, userId)`:
  - Sets schedule status to `CANCELLED`.
  - Logs cancellation in `audit_logs`.

### 6.2 New & Updated API Endpoints

#### 1. Price Quotation (Shared between Public & Staff)
- **`GET /api/v1/pricing/quote`**
  - **Query Params:** `property_id`, `apartment_id` (or `unit_type`), `check_in_date`, `check_out_date`.
  - **Response (200 OK):**
    ```json
    {
      "success": true,
      "data": {
        "property_id": 1,
        "apartment_id": 4,
        "unit_type": "2-Bedroom Luxury",
        "check_in_date": "2026-11-10",
        "check_out_date": "2026-11-14",
        "nights": 4,
        "currency": "NGN",
        "currency_symbol": "₦",
        "nightly_rates": [
          { "date": "2026-11-10", "rate": 65000.00 },
          { "date": "2026-11-11", "rate": 65000.00 },
          { "date": "2026-11-12", "rate": 65000.00 },
          { "date": "2026-11-13", "rate": 65000.00 }
        ],
        "accommodation_total": 260000.00,
        "caution_deposit": 50000.00,
        "total_amount": 310000.00,
        "required_deposit_percentage": 20,
        "minimum_payable_now": 62000.00
      }
    }
    ```

#### 2. Scheduled Pricing Management
- **`GET /api/v1/pricing/schedules`**
  - **Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER` (scoped to assigned property).
  - Lists existing and upcoming rate schedules.
- **`POST /api/v1/pricing/schedules`**
  - **Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER` (scoped to assigned property).
  - **Body:** `{ property_id, apartment_id, unit_type, rate_per_night, effective_from, effective_to, reason }`.
- **`DELETE /api/v1/pricing/schedules/:id`**
  - **Roles:** `SUPER_ADMIN`, `ADMIN`.
  - Cancels scheduled rate change before it becomes active.

#### 3. Pricing Audit Log
- **`GET /api/v1/pricing/audit`**
  - **Roles:** `SUPER_ADMIN`, `ADMIN`, `OWNER`.
  - Returns paginated audit trail of all rate modifications, scheduler events, and price overrides.

---

## 7. Required Database Migrations

### Migration `025_add_pricing_schedules_and_snapshots.sql`

```sql
-- Migration 025: Add pricing schedules table, reservation price snapshots, and pricing capabilities
-- Forward-only migration adhering to BFA migration standards.

-- 1. Table for scheduled rate adjustments
CREATE TABLE IF NOT EXISTS `apartment_pricing_schedules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NOT NULL,
  `apartment_id` INT NULL COMMENT 'NULL indicates rule applies to all units of unit_type in property',
  `unit_type` VARCHAR(50) NULL COMMENT 'NULL indicates rule applies to specific apartment_id',
  `rate_per_night` DECIMAL(10,2) NOT NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL COMMENT 'NULL indicates indefinite until next rate change',
  `status` ENUM('SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED') DEFAULT 'SCHEDULED',
  `reason` VARCHAR(255) NOT NULL,
  `created_by` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`),
  FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
  INDEX `idx_pricing_schedule_lookup` (`property_id`, `apartment_id`, `unit_type`, `effective_from`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add price_snapshot column to reservations table if not exists
ALTER TABLE `reservations`
ADD COLUMN `price_snapshot` JSON NULL AFTER `total_amount`;

-- 3. Seed new capabilities into capabilities table
INSERT INTO `capabilities` (`name`, `description`, `is_enabled`, `created_at`, `updated_at`)
VALUES 
  ('PRICING_MANAGE_RATES', 'Ability to alter base apartment and room-type rates', 1, NOW(), NOW()),
  ('PRICING_SCHEDULE_CHANGES', 'Ability to configure future scheduled rate changes', 1, NOW(), NOW()),
  ('PRICING_VIEW_AUDIT', 'Ability to view comprehensive pricing alteration audit logs', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
```

---

## 8. Financial-Integrity Risks & Mitigation Safeguards

| Integrity Risk | Impact | Strict Mitigation Safeguard |
|---|---|---|
| **Retroactive Price Recalculation** | A rate increase on an apartment changes the expected balance on past bookings. | **Immutability Contract:** Existing reservations never query current apartment rates. All financial calculations, payments, and invoices draw strictly from the stored `price_snapshot` created at the time of reservation. |
| **Phantom Confirmation of Unpaid Bookings** | Staff confirms a web reservation without payment proof, causing revenue leakage. | **Enforced Payment Validation:** A reservation cannot transition from `PENDING` to `CONFIRMED` or `CHECKED_IN` without either: (a) a verified payment transaction of at least the required deposit, or (b) an explicit, manager-authorized deposit waiver with logged staff ID and reason. |
| **Front Desk Double Assignment** | Two receptionists attempt to accept and claim the same guest booking simultaneously. | **Atomic Assignment Check:** When a staff member accepts a booking via `POST /api/v1/front-office/accept`, the database updates using `WHERE id = ? AND assigned_staff_id IS NULL`. If 0 rows are affected, the operation fails with `409 Conflict: Already accepted by another staff member`. |
| **Cross-Property Rate Tampering** | A manager assigned to Property A alters the prices of Property B. | **Property Scope Enforcement:** In `pricing.service.js`, managers have their token `property_id` matched against the target `property_id`. Access is rejected with `403 Forbidden` if mismatch occurs. Only `SUPER_ADMIN` and `ADMIN` have global scope. |
| **Ledger / Journal Desynchronization** | Cash or POS payments received at front desk do not match general ledger balances. | **Double-Entry Safeguard:** Every payment entry in `POST /api/v1/reservations/:id/payments` automatically invokes `ledger.service.js` to create balanced debit/credit journal entries (`CASH/BANK` vs `REVENUE/ACCOUNTS_RECEIVABLE`) within a single database transaction. |

---

## 9. Integration Requirements with Public Booking Workstream

To guarantee that the public landing page and staff portal operate in complete harmony:
1. **Single Pricing Engine:** The public quotation endpoint and the staff quotation calculator must call the exact same backend service (`pricing.service.js`). No client-side price math is permitted.
2. **Standardized Snapshot Format:** The JSON structure of `price_snapshot` saved by the public booking API (`/api/v1/public/bookings`) must match the structure saved by staff direct reservations (`/api/v1/reservations`).
3. **Real-Time Notification:** When a visitor submits a booking online, it appears immediately on the front-desk operational queue (`FrontOfficePage.jsx`) via server polling/events.
4. **Transparent Acceptance:** When the front-desk receptionist accepts the guest, the agreed online quotation is displayed verbatim, preventing discrepancy between the customer's booking confirmation and the staff check-in folio.

---

## 10. Implementation Sequence & Acceptance Criteria

### Implementation Sequence
```
Phase 1: Planning & Architecture (Current Step — Complete)
   ↓
Phase 2: Database Migration (025_add_pricing_schedules_and_snapshots.sql)
   • Verified in disposable test DB first
   ↓
Phase 3: Backend Pricing Engine & Controllers
   • pricing.service.js
   • pricing.controller.js & route registration
   • reservations.service.js snapshot integration
   • Unit & integration tests in bfa_apartments_test_db
   ↓
Phase 4: Staff Portal UI Enhancements
   • Dynamic Rate Drawer in ApartmentsPage.jsx
   • Quotation Calculator Modal
   • Price Snapshot Card in ReservationsPage.jsx & FrontOfficePage.jsx
   ↓
Phase 5: Public Workstream Handshake Verification
   • End-to-end integration test: Public quote → Web booking → Front desk queue → Check-in
```

### Acceptance Criteria
1. **Migration Safety:** Migration `025` applies cleanly and idempotently forward in test environments without affecting existing financial or reservation records.
2. **Pricing Accuracy:** Quoting an apartment across multiple dates with scheduled future changes calculates the exact date-dependent nightly rates.
3. **Contract Immutability:** Changing an apartment's rate today does not alter the `total_amount` or itemized breakdown of any existing reservation.
4. **Role Isolation:** Front desk receptionists and staff cannot alter base rates or schedule price changes; managers can only edit rates for their assigned property; only Super Admin and Admin can alter company-wide rates.
5. **No Phantom Confirmations:** Reservations without recorded payments or approved waivers cannot be marked as paid or checked in.
6. **Frontend Build:** `npm run build --prefix frontend` succeeds with 0 errors.
7. **Test Suite:** All test suites in `tests/` pass with 100% success against `bfa_apartments_test_db`.

---

## Conclusion & Recommendation

This implementation plan provides an airtight, scalable, and audit-compliant blueprint for BFA's internal pricing management and booking operations. Upon review and authorization from the project owner, execution will proceed starting with Phase 2 in strict adherence to the project's safety constraints.

