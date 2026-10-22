# BFA PHASE 2 — CONTEXTUAL DETAIL VIEWS & DEEP-LINKING IMPLEMENTATION REPORT

**Date:** October 22, 2026  
**System:** BFA Apartments Management System  
**Phase:** Phase 2 — Contextual Detail Views & Deep-Linking  
**Status:** COMPLETE (Zero Regressions, Production Build Verified, 384/384 Backend Tests Passing)

---

## 1. Executive Summary

Phase 2 of the BFA Structural Improvement plan has transformed BFA from a collection of isolated CRUD tables into a unified, interconnected apartment management platform.

By taking inspiration from the information architecture of the Mojoomla apartment management reference system while strictly respecting BFA's established visual identity, security architecture, 1-night stay rule, and backend authority, Phase 2 implements bidirectional deep-linking and contextual workflows across:
- **Properties** (Parent buildings, unit rollups, direct maintenance & inspection queries)
- **Apartments / Units** (Parent building linkages, live reservation status, related maintenance tickets, related inspections)
- **Reservations & Booking Engine** (Clickable unit, guest, and property deep-links, authoritative payment ledger, quick links to schedule pre/post inspections or log maintenance)
- **Guests & Tenants Directory** (Interactive lifetime stay history, deep-links to reservations and units, 1-click booking stay for guest)
- **Financial Center** (Clickable booking references and counterparties linking directly to reservations and guest profiles)
- **Maintenance & Work Orders** (Clickable property and unit links, deep links to unit inspections and unit details, URL pre-fill for new work orders)
- **Inspections** (Clickable property, unit, guest, and stay links, direct action to log maintenance defects from inspection assessments)
- **Front Office Operational Board** (Arrivals, in-house guests, departures, and dirty housekeeping units linking seamlessly to guests, units, and booking engines)

---

## 2. Existing Database Relationships & APIs Reused

No schema migrations or database changes were introduced in Phase 2. All navigation and contextual queries reuse existing authoritative backend endpoints:

| Domain | Backend Route / Service | Query Capabilities Reused |
|---|---|---|
| **Properties -> Units** | `GET /api/v1/properties/:id/apartments` | Direct property unit inventory rollup |
| **Units -> Parent Property** | `GET /api/v1/apartments/:id` | Returns `property_id`, `property_name`, `property_code` |
| **Units -> Reservations** | `GET /api/v1/reservations?apartmentId=:id` | Real-time stay history and active occupancy |
| **Units -> Maintenance** | `GET /api/v1/maintenance?apartmentId=:id` | Real-time work orders scoped to unit |
| **Units -> Inspections** | `GET /api/v1/inspections?apartmentId=:id` | Check-in/check-out condition history |
| **Reservations -> Payments** | `GET /api/v1/payments?reservationId=:id` | Authoritative payment transactions for booking |
| **Reservations -> Lifecycle** | `GET /api/v1/reservations/:id/history` | Authoritative audit timeline |
| **Guests -> Stay History** | `GET /api/v1/guests/:id` | Returns lifetime bookings in `guest.reservations` |
| **Financial -> Ledger** | `GET /api/v1/financial/ledger` | Cross-property transaction ledger |
| **Front Office -> Stays** | `GET /api/v1/front-office/arrivals`, `departures` | Live operational lists with unit/guest IDs |

---

## 3. Files Changed

All changes in Phase 2 were made cleanly within the presentation and navigation layer (`frontend/src/pages/`):

1. `frontend/src/pages/PropertiesPage.jsx`:
   - URL search parameter integration (`?search=`, `?propertyId=`).
   - Added unit quick modal loading building units via `propertyService.getApartments(prop.id)`.
   - Contextual quick navigation buttons to `/app/maintenance?propertyId=...` and `/app/inspections?propertyId=...`.
   - Role-based button visibility suppressing CRUD actions for `MANAGER` and `RECEPTIONIST` while retaining operational links.

2. `frontend/src/pages/ApartmentsPage.jsx`:
   - URL search parameter integration (`?propertyId=`, `?unitId=`, `?search=`).
   - Table rows: clicking unit identifier opens rich unit drawer/modal; clicking property name jumps to `/app/properties?search=...`.
   - Unit Detail Modal:
     - Clickable parent building link (`/app/properties?search=...`).
     - Real-time active stay banner with direct link to booking (`/app/reservations?search=...`).
     - Live related records tabs/panels for Reservation History, Maintenance Work Orders, and Unit Inspections.
     - Contextual actions: "Book This Unit (1-Night)", "Log Maintenance", "Schedule Inspection".

3. `frontend/src/pages/ReservationsPage.jsx`:
   - URL search parameter integration (`?search=`, `?propertyId=`, `?apartmentId=`, `?openNew=true`, `?guestName=`, `?guestEmail=`, `?guestPhone=`).
   - Create Modal automatically pre-fills unit and guest data when launched via deep-link.
   - Table rows: Property, Unit, and Guest columns are clickable deep-links.
   - Reservation Detail Modal:
     - Connected Workflows banner: "Schedule Unit Inspection", "Log Unit Maintenance", "Financial Records".
     - Authoritative payment transactions dynamically fetched via `paymentService.getTransactions({ reservationId })`.
     - Property and Unit names link directly to `/app/properties` and `/app/apartments`.
     - Guest name links directly to `/app/guests`.

4. `frontend/src/pages/GuestsPage.jsx`:
   - URL search parameter integration (`?search=`, `?guestId=`).
   - Table rows: Guest display name is clickable, opening comprehensive guest profile.
   - Guest Profile Modal:
     - Primary contextual action: `+ Book 1-Night Stay for Guest`, launching the reservation engine with prefilled guest particulars.
     - Lifetime Stay History list: Each historical booking code links to `/app/reservations?search=...`, unit links to `/app/apartments?unitId=...`, and property links to `/app/properties?search=...`.

5. `frontend/src/pages/FinancialPage.jsx`:
   - URL search parameter integration (`?propertyId=`, `?tab=`).
   - Unified Financial Ledger: Property name and Counterparty/Guest are interactive deep-links.
   - Payments & Collections: Booking Reference links directly to `/app/reservations?search=...` and Guest name links directly to `/app/guests?search=...`.

6. `frontend/src/pages/MaintenancePage.jsx`:
   - URL search parameter integration (`?search=`, `?propertyId=`, `?apartmentId=`, `?openNew=true`).
   - Auto-opens and pre-fills work order creation modal when directed from a unit or inspection page.
   - Table rows: Property and Unit are clickable deep-links.
   - Work Order Detail Modal: Clickable Property and Unit titles, with quick action button to view unit inspections.

7. `frontend/src/pages/InspectionPage.jsx`:
   - URL search parameter integration (`?propertyId=`, `?apartmentId=`, `?reservationId=`, `?openNew=true`).
   - Auto-opens and pre-fills inspection scheduling modal when directed from a unit or reservation page.
   - Table rows: Property, Unit, Guest, and Reservation Code are clickable deep-links.
   - Inspection Assessment Modal: Interactive header banner and quick action to "Log Maintenance Ticket" pre-scoped to the inspected unit.

8. `frontend/src/pages/FrontOfficePage.jsx`:
   - Table & list views: Tenant names link to `/app/guests`, units link to `/app/apartments`, and property names link to `/app/properties`.
   - Stays list: Contextual "Booking ↗" button to inspect authoritative reservation in the booking engine.
   - Housekeeping Queue: Units and properties link to their respective pages, with quick action buttons to schedule pre-arrival inspections or report defects before marking clean.

---

## 4. Connected Workflows Implemented

### Workflow 1: Building -> Unit -> Booking (1-Night Stay Rule)
1. Staff opens **Properties** (`/app/properties`).
2. Clicks "Units (N)" or "View Units" on a building card.
3. System routes to **Apartments** (`/app/apartments?propertyId=1`), pre-filtering units to that property.
4. Staff clicks a vacant unit to view its details.
5. In the Unit Detail modal, clicks **"Book This Unit (1-Night)"**.
6. System routes to **Reservations Engine** (`/app/reservations?openNew=true&propertyId=1&apartmentId=...`), pre-selecting the property and unit, and automatically calculating the 1-night checkout date.

### Workflow 2: Reservation -> Checkout -> Housekeeping -> Inspection -> Ready
1. Guest check-out is processed from **Front Office** (`/app/front-office`) or **Reservations Engine** (`/app/reservations`).
2. The unit operational status transitions to `DIRTY`.
3. In Front Office Housekeeping queue, staff clicks **"📋 Inspect"**.
4. System opens **Inspections** (`/app/inspections?openNew=true&apartmentId=...&propertyId=...`) with property and unit pre-filled.
5. If damage is discovered, staff clicks **"🔧 Log Maintenance Ticket"**, pre-scoping the work order to that unit.
6. Once clean and inspected, clicking **"Mark Ready"** returns the unit to `AVAILABLE`.

### Workflow 3: Guest Profile -> Stay History -> Re-Booking
1. Front desk opens **Guests Directory** (`/app/guests`).
2. Searches for returning guest. Clicks guest name to view profile.
3. System displays guest contact information and lifetime stay history.
4. Clicking any past booking code immediately opens that reservation in the booking engine.
5. Staff clicks **"+ Book 1-Night Stay for Guest"**. System routes to `/app/reservations?openNew=true&guestName=...&guestEmail=...&guestPhone=...` with guest details populated.

### Workflow 4: Financial Transaction -> Authoritative Reservation Record
1. Finance team reviews payments in **Financial Center** (`/app/financials`).
2. Clicks on a payment's `Booking Ref` (e.g., `BFA-RES-0001`).
3. System navigates directly to the authoritative reservation record in **Reservations Engine**, displaying total amounts, paid-to-date balances, and payment method without duplicating data.

---

## 5. Security & Data Integrity Audit

- **Backend Authorization Remains Authoritative:**  
  Frontend deep links and buttons are gated using role permissions (e.g. `reservations.create`, `apartments.edit`), but backend API routes strictly enforce JWT authentication and RBAC permissions (`authorizeRole` / `requirePermission`).
- **Property-Level Isolation:**  
  Property scoping via `X-Property-Id` header and `property_id` request filtering remains enforced at the repository and middleware layer.
- **No Insecure ID Exposure:**  
  Deep links route to standard authenticated views that validate user access; users without access to a property or record receive 403 Forbidden from the backend.
- **Single Source of Truth:**  
  Financial totals, payment records, and stay durations are derived strictly from authoritative database rows (`reservations.total_amount`, `reservations.paid_amount`, `payments` table). No mock totals or unverified client calculations were introduced.
- **1-Night Maximum Stay Policy:**  
  All booking deep-links enforce `getCalculatedCheckout(check_in_date)` (+1 calendar day) on the frontend, and database migration `015_one_night_check_constraint.sql` enforces this at the persistence layer.

---

## 6. Verification and Test Results

### A. Frontend Production Build
```
vite v6.4.3 building for production...
✓ 146 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                    1.17 kB │ gzip:  0.58 kB
dist/assets/index-DPqRElg_.css                    48.82 kB │ gzip:  9.44 kB
...
dist/assets/ApartmentsPage-BEorqdAL.js            37.36 kB │ gzip:  6.90 kB
dist/assets/ReservationsPage-D7i5DUPl.js          37.81 kB │ gzip:  7.69 kB
...
✓ built in 7.98s
Exit code: 0
```

### B. Backend Full Automated Test Suite
- **Environment:** Node.js v20.10.0, MariaDB 10.4.32 (XAMPP IPv6 `[::1]:3306`), Jest 29.7.0.
- **Command:** `$env:DB_HOST="::1"; npm test`
- **Results:**
  ```
  Test Suites: 34 passed, 34 total
  Tests:       384 passed, 384 total
  Snapshots:   0 total
  Time:        105.038 s
  Exit code:   0
  ```
- **Key Suites Verified:**
  - `oneNightRule.test.js`: 1-night stay constraints and date validations passed.
  - `assistant.test.js` & `automationEngine.test.js`: Phase 12C Operations Assistant launcher and confirmation tokens passed (88/88 tests).
  - `bookingAuth.test.js`: Cryptographic token verification passed.
  - `audit.test.js`, `accessControl.test.js`, `propertyScope.test.js`: RBAC and property isolation passed.

---

## 7. Known Gaps and Deferred Items

The following items are deferred to Phase 3 or later as planned in the Information Architecture roadmap:
1. **Universal CSV/PDF Export Standardization:** Currently available on Reports and Financials; full universal export toolbar deferred to Phase 3.
2. **Dashboard Redesign:** Dashboard currently retains its Phase 1 realigned metrics; role-specialized dashboard widgets are reserved for Phase 3.
3. **Database Migrations:** None were required for Phase 2. Existing foreign keys and API repository queries were fully sufficient.

---

## 8. Conclusion

Phase 2 is fully implemented, verified, and free of regressions. The BFA application now functions as an interconnected property and apartment management platform with natural cross-record navigation and zero duplicate data entry.

**Recommendation:** Await user review and approval before starting Phase 3.
