# BFA Structural Gap Register

**Author:** System Architecture & Quality Engineering  
**Date:** October 22, 2026  
**Status:** Defect, Disconnect & Gap Classification (Read-Only)  
**Objective:** Record every identified structural deficiency, entity disconnect, and workflow gap discovered during the BFA inspection and comparative analysis with Mojoomla.

---

## 1. Classification Categories

Each item in this register is categorized into one of six standardized classifications:
1. **NAV-VIS:** Navigation or Visual Organization
2. **CORR-EXIST:** Correction to Existing Functionality
3. **MISS-REQ:** Missing Originally Required Functionality
4. **DATA-REL:** Data Relationship or Integrity Correction
5. **AUTH-SEC:** Authorization or Security Correction
6. **OPT-ENH:** Optional Enhancement (Requires Explicit Separate Approval)

---

## 2. Comprehensive Gap Inventory

### GAP-STRUC-01: Hidden "Properties / Buildings" Parent Entity in Sidebar
* **Classification:** **NAV-VIS** (Navigation or Visual Organization)
* **Current State in BFA:**
  - BFA's database has an authoritative `properties` table (with `name`, `code`, `address`, `city`, `amenities`, `operational_status`).
  - However, in the sidebar (`Sidebar.jsx`), there is only `/app/apartments` ("Apartments").
  - Users can only create or edit a Property by opening the Apartments page and clicking an "Add Property" button which opens a modal (`isAddPropertyModalOpen`).
* **Mojoomla Comparative Model:**
  - Mojoomla separates Residential Unit list from Building configuration, making buildings easily discoverable.
* **Impact on BFA:** Users cannot easily discover property-level settings, addresses, or global amenities without entering a unit management screen.
* **Proposed Resolution:**
  - Provide a clean dedicated view or sub-route `/app/properties` for property portfolio management, or a prominent tabbed header inside the physical assets section.
* **Blocker Level:** **Medium** (High UX friction, but data model already exists).

---

### GAP-STRUC-02: Overcrowded "Operations" Catch-All Menu
* **Classification:** **NAV-VIS** (Navigation or Visual Organization)
* **Current State in BFA:**
  - `Sidebar.jsx` groups 7 disparate modules under `operations`:
    1. Front Office
    2. Calendar
    3. All Reservations
    4. Tenants & Guests
    5. Apartments
    6. Maintenance
    7. Inspections
* **Impact on BFA:**
  - Excessive vertical scroll on mobile and tablet screens.
  - Front-desk operations (check-ins) are mixed with structural asset management (apartments) and physical maintenance (plumbing/HVAC repairs).
* **Proposed Resolution:**
  - Split into two logical groups:
    - **Group 2: Properties & Units** (`/app/properties`, `/app/apartments`, `/app/calendar`).
    - **Group 3: Front Office & Bookings** (`/app/front-office`, `/app/reservations`, `/app/guests`).
    - **Group 6: Maintenance & Care** (`/app/maintenance`, `/app/inspection`).
* **Blocker Level:** **Low** (Simple sidebar refactoring, zero backend changes required).

---

### GAP-STRUC-03: Orphaned "Reports & Analytics" Single-Item Group
* **Classification:** **NAV-VIS** (Navigation or Visual Organization)
* **Current State in BFA:**
  - `Sidebar.jsx` has a top-level group called `analytics` containing only **one** item: `Analytics & Intelligence` (`/app/analytics`).
  - Meanwhile, `Reports & Exports` sits under `finance`.
  - Meanwhile, `Audit Trail` sits under `admin`.
* **Impact on BFA:**
  - Inefficient use of sidebar real estate. Users looking for reports must remember whether it's an operational report (Finance), an analytics chart (Analytics), or an audit report (Admin).
* **Proposed Resolution:**
  - Unify into **Group 7: Reports & Intelligence**:
    - `Analytics & Trends` (`/app/analytics`)
    - `Exportable Reports` (`/app/reports`)
    - `Audit Trail & Logs` (`/app/audit`)
* **Blocker Level:** **Low**.

---

### GAP-STRUC-04: Disconnected "Guest Profile" to Reservation & Stay History
* **Classification:** **DATA-REL** (Data Relationship or Integrity Correction)
* **Current State in BFA:**
  - `guests` table was created in Migration 010 and linked via `reservations.guest_id`.
  - In `GuestsPage.jsx`, clicking a guest opens `isDetailModalOpen`, but it only renders static contact information (email, phone, address, NIN).
  - It does **not** query or render the guest's past reservations, active check-in status, total spent, or damaged items logged in inspections.
* **Mojoomla Comparative Model:**
  - Member profiles display linked residential units, family members, payment history, and complaints directly.
* **Impact on BFA:** Front desk staff cannot see guest stay history, VIP spending habits, or previous room damages from the guest CRM.
* **Proposed Resolution:**
  - Enhance `guestService.getById` or guest detail modal to fetch and display linked reservations (`/api/v1/reservations?guestId=X`) and past inspections.
* **Blocker Level:** **Medium**.

---

### GAP-STRUC-05: Missing Cross-Module Action Links on Detail Views
* **Classification:** **CORR-EXIST** (Correction to Existing Functionality)
* **Current State in BFA:**
  - On `ApartmentsPage.jsx`, viewing an Apartment does not show active maintenance tickets or the current in-house guest.
  - On `ReservationsPage.jsx`, viewing a Reservation does not have a direct button to "Record Payment" or "Report Maintenance Issue". The user must memorize the reservation code, close the modal, navigate to `FinancialPage` or `MaintenancePage`, and manually re-enter the data.
* **Impact on BFA:** High friction; disjointed multi-page journeys for common operational flows.
* **Proposed Resolution:**
  - Add contextual action buttons in detail modals:
    - On Reservation detail modal: `Record Payment` (opens payment modal), `Log Issue` (navigates to maintenance with unit prefilled).
    - On Apartment detail modal: `View Current Stay`, `Log Maintenance Ticket`.
* **Blocker Level:** **Medium**.

---

### GAP-STRUC-06: Lack of Role-Specific Dashboard Views
* **Classification:** **CORR-EXIST** (Correction to Existing Functionality)
* **Current State in BFA:**
  - `DashboardPage.jsx` renders identical KPI cards (Gross Revenue, Confirmed Reservations, In-House Count, Total Units) for all operational roles (`RECEPTIONIST`, `STAFF`, `OWNER`, `MANAGER`).
  - A maintenance `STAFF` technician sees gross financial revenue in Naira, but has zero visibility into their daily work order queue.
  - A `RECEPTIONIST` sees financial stats, but does not see arrivals due in the next 2 hours.
* **Mojoomla Comparative Model:**
  - Accountants see finance charts; Gatekeepers see visitor check-ins; Staff see maintenance work orders.
* **Impact on BFA:** The dashboard fails to act as an effective operational launchpad for daily workers.
* **Proposed Resolution:**
  - Create modular sub-widgets in `DashboardPage.jsx`:
    - `FrontOfficeQueueWidget` (rendered for Receptionists, Managers, Admins).
    - `MaintenanceQueueWidget` (rendered for Staff, Managers).
    - `FinancialKpiWidget` (rendered for Owners, Managers, Admins).
* **Blocker Level:** **Medium**.

---

### GAP-STRUC-07: Inconsistent Data Export Actions Across Core Tables
* **Classification:** **CORR-EXIST** (Correction to Existing Functionality)
* **Current State in BFA:**
  - `ReportsPage.jsx` and `FinancialPage.jsx` support data exports.
  - `ApartmentsPage.jsx`, `ReservationsPage.jsx`, `GuestsPage.jsx`, and `EmployeesPage.jsx` lack a simple "Export CSV" button on their filtered datatables.
* **Mojoomla Comparative Model:**
  - All DataTables tables provide built-in CSV / Print / Copy buttons.
* **Proposed Resolution:**
  - Add standard CSV export handler utility to `Table.jsx` or page header toolbars for core operational tables.
* **Blocker Level:** **Low**.

---

### GAP-STRUC-08: Inconsistent Placement of "Team & RBAC"
* **Classification:** **AUTH-SEC** (Authorization or Security Correction)
* **Current State in BFA:**
  - `Team & RBAC` (`/app/team`) is placed inside `people` (alongside Employees, ID cards, and Performance).
  - Meanwhile, `Access Control` (`/app/access-control`) is placed inside `admin`.
  - Both deal with user credentials, role assignments, and capability enforcement.
* **Impact on BFA:** Operational managers confuse Human Resource directories (`employees`) with user login credential management (`team`).
* **Proposed Resolution:**
  - Move `Team & RBAC` to Module 8: **Administration & Governance**, keeping Module 4 (People & Human Capital) strictly for HR, employees, performance, and agents.
* **Blocker Level:** **Low**.

---

### GAP-STRUC-09: Optional Enhancement — Visitor Gate Log / Visitor Access Module
* **Classification:** **OPT-ENH** (Optional Enhancement — Requires Separate Approval)
* **Mojoomla Inspiration:**
  - Mojoomla includes a Gatekeeper module (`visitor-manage`) for tracking visitor check-in, contractor arrivals, and vehicle numbers.
* **BFA Assessment:**
  - BFA currently focuses on serviced apartment bookings and short stays. While BFA has properties with 24/7 security (e.g. Grand Horizon Tower), visitor logging is currently handled offline or outside the system.
  - *Recommendation:* Do NOT implement visitor gate logs in the core structural refactoring unless explicitly requested by the business.
* **Blocker Level:** **Non-Blocking / Optional**.

---

### GAP-STRUC-10: Optional Enhancement — Amenity / Facility Reservation System
* **Classification:** **OPT-ENH** (Optional Enhancement — Requires Separate Approval)
* **Mojoomla Inspiration:**
  - Mojoomla includes facility booking for shared amenities (Swimming Pool, Gym, Club House).
* **BFA Assessment:**
  - BFA properties have amenities (`amenities: ["Fiber Internet", "Swimming Pool", "Gym", "24/7 Power"]`), but they are included complimentary with the apartment stay rather than booked as separate fee-generating facilities.
  - *Recommendation:* Keep complimentary. Do NOT add facility reservation fees unless requested.
* **Blocker Level:** **Non-Blocking / Optional**.

---

### GAP-STRUC-11: Deferred Architectural Phase — Internal Chat & Communication System
* **Classification:** **OPT-ENH** (Optional Enhancement — Planned for Future Phase 4)
* **Current State in BFA:**
  - BFA currently provides one-way broadcast notices (`/app/communications` and `/app/announcements`) with approval workflows for management memos.
  - Staff members (front desk receptionists, maintenance technicians, facility managers, estate admins) currently have no interactive, real-time two-way messaging within the application.
  - Operational handovers, maintenance dispatch alerts, and check-in verifications must be coordinated externally (e.g. WhatsApp, phone calls, or verbal notes).
* **Mojoomla Comparative Model:**
  - Mojoomla features an internal messaging inbox (`?apartment-dashboard=user&page=message`) where residents, staff, accountants, and gatekeepers can send contextual direct messages and role-targeted dispatches.
* **Impact on BFA:** Operational communication is fragmented outside the application without audit logging or contextual linkage to units, reservations, and maintenance tickets.
* **Proposed Resolution:**
  - Plan a dedicated future phase: **Phase 4 — Internal Chat & Communication System** for authenticated internal staff communication (1-to-1 direct messaging, property/team groups, unread counters, in-app notifications, and contextual links to properties, units, reservations, guests, and maintenance tickets).
  - External guest/tenant messaging remains out of scope for the initial release.
* **Blocker Level:** **Non-Blocking / Deferred to Phase 4**.

---

## 3. Summary of Gaps and Prioritization

| Gap ID | Title | Category | Severity | Target Phase | Status |
|---|---|---|---|---|---|
| **GAP-STRUC-01** | Surface Properties / Buildings in Navigation | NAV-VIS | Medium | Phase 1 | Completed & Verified |
| **GAP-STRUC-02** | Unbundle Overcrowded "Operations" Menu | NAV-VIS | Low | Phase 1 | Completed & Verified |
| **GAP-STRUC-03** | Consolidate Reports & Analytics into Unified Group | NAV-VIS | Low | Phase 1 | Completed & Verified |
| **GAP-STRUC-08** | Move Team & RBAC to Administration Group | AUTH-SEC | Low | Phase 1 | Completed & Verified |
| **GAP-STRUC-05** | Add Cross-Module Contextual Action Links | CORR-EXIST | Medium | Phase 2 | Completed & Audited |
| **GAP-STRUC-04** | Connect Guest Profiles to Stay History & Billing | DATA-REL | Medium | Phase 2 | Completed & Audited |
| **GAP-STRUC-06** | Role-Targeted Dashboard Widgets | CORR-EXIST | Medium | Phase 3 | Approved Next Priority |
| **GAP-STRUC-07** | Standardized Table CSV Exports | CORR-EXIST | Low | Phase 3 | Approved Next Priority |
| **GAP-STRUC-11** | Internal Chat & Communication System | OPT-ENH | High (Feature) | Phase 4 | Planned / Deferred |
| **GAP-STRUC-09** | Visitor Gate Log Module | OPT-ENH | Low (Optional) | Deferred | Evaluation Only |
| **GAP-STRUC-10** | Facility Reservation Module | OPT-ENH | Low (Optional) | Deferred | Evaluation Only |

