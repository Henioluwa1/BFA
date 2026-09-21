# BFA Apartments Management System — System Architecture

## 1. Architectural Principles

1. **Mandatory BFA Business Hierarchy**:
   - The system strictly adheres to the non-negotiable multi-property hierarchy:
     **BFA Company → Multiple Properties/Buildings → Apartments/Units → Reservations → Tenants/Guests**
   - BFA is NOT a single-building system. Each property may contain a different number of apartments/units.
   - Terminology is strictly standardized:
     - Company
     - Property/Building
     - Apartment/Unit
     - Reservation
     - Tenant/Guest

2. **Backend-Authoritative Security & Authentication**:
   - Single unified authentication entry point at `/login` for all roles.
   - Credentials submitted to `POST /api/v1/auth/login`; validated against the `users` table with bcrypt password verification.
   - Cryptographic JWT tokens issued by backend containing authoritative identity, role, and permissions dictionary.
   - **Zero Trust on Client Role Selection**:
     - Users can NEVER manually select or switch roles in the interface.
     - `X-User-Role` headers, `localStorage.role`, or client role dropdowns are strictly ignored and eliminated.
     - Backend authorization guards (`requireAuth`, `requireRoles`) serve as the authoritative security boundary.

3. **Portal Theming & Visual Distinction (White vs Grey)**:
   - **White Primary Background**: Standard for normal authenticated operational roles (`ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER`).
   - **Grey Primary Background**: Exclusively reserved for `SUPER_ADMIN` to visually delineate the system-level administrative console (`data-portal-theme="super_admin"`).
   - This distinction is non-user-controllable and derived solely from the authenticated user's backend identity.
   - The former strict Grey/White/Rust Orange global palette constraint has been removed in favor of a modern, accessible, executive hospitality design system.

4. **Public vs Authenticated Systems**:
   - **Public Area**:
     - Public Landing Page (`/`): Introduces BFA properties, apartments, amenities, and contact information.
     - Online Reservation Engine: Allows public visitors to select property, apartment, and check-in date with live availability verification and instant reservation creation.
     - Single Login Page (`/login`).
   - **Authenticated Area (`/app/*`)**:
     - Operational Dashboard, Calendar, All Reservations, Apartments, Financial, Analytics, Agents, Maintenance, Inspection, Audit Trail, Team, Settings.
     - Protected by cryptographic authentication guard (`ProtectedRoute`).

5. **Operational BFA Dashboard**:
   - Built to answer: *"What is happening across BFA right now?"*
   - Real-time operational indicators:
     - Today's Arrivals & Departures
     - Current In-House Tenants / Guests
     - Available vs Occupied Units
     - Confirmed vs Pending Reservations
     - Revenue & Outstanding Balances
     - Open & Critical Maintenance Issues
     - Multi-Property Filtering (`All Properties` vs individual building selection)
   - The one-night reservation rule remains strictly enforced as an underlying backend constraint, with special dashboard branding and test engine cards completely removed.

6. **Underlying 1-Night Maximum Reservation Rule**:
   - Stays are strictly limited to **1 night only** (`check_out_date = check_in_date + 1 day`).
   - **Database Layer**: `CONSTRAINT chk_one_night CHECK (DATEDIFF(check_out_date, check_in_date) = 1)` in `reservations` table.
   - **Backend Service Layer**: Validates `DATEDIFF === 1` and throws HTTP 422 `VALIDATION_ERROR` for invalid spans.
   - **Public & Internal UI**: Automatically calculates and locks checkout date to check-in + 1 day.

7. **Categorized Global Search & RBAC Data Isolation**:
   - Endpoint: `GET /api/v1/search?q=:query&propertyId=:propertyId`
   - Real-time search across: Properties, Apartments, Reservations, Maintenance, Agents.
   - Strict agent isolation (agents cannot view other agents or unauthorized records).
   - Staff roles prevented from viewing executive financials.

8. **Correlated Audit Trail & Reporting Engine**:
   - `src/core/audit/audit.service.js` records actions correlated with HTTP `X-Request-Id`.
   - Accessible only to authorized roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER`) at `/api/v1/audit`.
   - Reporting module provides RFC 4180 CSV exports and programmatic PDF generation via `pdfkit`.

9. **Strict Responsive Design Across Viewports**:
   - Desktop (1200px+): Full navigation sidebar and comprehensive multi-column dashboard.
   - Tablet (768px - 1024px): Responsive reflow, collapsible drawer navigation, and responsive cards.
   - Mobile (<768px): Vertical stacked layouts, touch-friendly tap targets, horizontal scroll table wrappers, and zero horizontal page overflow.

---

## 2. Directory Layout

```
c:\xamp\htdocs\BFA\
├── docs/                                # Architecture & schema blueprints
├── backend/
│   ├── src/
│   │   ├── config/                      # Environment variables & constants
│   │   ├── core/                        # Shared monolith foundation
│   │   │   ├── audit/                   # Correlated audit logging service
│   │   │   ├── errors/                  # Standard ApiError envelopes
│   │   │   ├── logging/                 # Winston logger with sensitive parameter redaction
│   │   │   ├── middleware/              # Request ID tracing, AuthContext, RequestLogger, ErrorHandler
│   │   │   └── security/                # Helmet, CORS, Rate Limiting
│   │   ├── db/                          # Database pool & migrations (001, 002, 003, 004)
│   │   ├── modules/                     # Autonomous domain modules
│   │   │   ├── auth/                    # Single Login & JWT Auth (/api/v1/auth)
│   │   │   ├── public/                  # Public landing & online booking (/api/v1/public)
│   │   │   ├── apartments/              # Apartments REST API (/api/v1/apartments)
│   │   │   ├── audit/                   # Audit explorer REST API (/api/v1/audit)
│   │   │   ├── properties/              # Properties REST API (/api/v1/properties)
│   │   │   ├── reports/                 # Reporting engine CSV & PDF (/api/v1/reports)
│   │   │   ├── reservations/            # Reservation engine with 1-night rule (/api/v1/reservations)
│   │   │   └── search/                  # Global categorized search engine (/api/v1/search)
│   │   ├── app.js                       # Express app assembling core & modules
│   │   └── server.js                    # Server bootstrap
│   └── tests/                           # 7 Automated Jest test suites (32 tests)
│       ├── health.test.js
│       ├── errors.test.js
│       ├── security.test.js             # Role manipulation, auth & security tests
│       ├── oneNightRule.test.js
│       ├── search.test.js
│       ├── reports.test.js
│       └── audit.test.js
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── auth/                    # ProtectedRoute guard
    │   │   ├── common/                  # Buttons, badges, cards, modals
    │   │   ├── layout/                  # Responsive AppLayout, Sidebar, Topbar
    │   │   └── search/                  # GlobalSearchModal (Ctrl+K)
    │   ├── context/
    │   │   ├── AuthContext.jsx          # Authoritative session, JWT, theme derivation
    │   │   ├── PropertyContext.jsx      # Global property selector
    │   │   └── ToastContext.jsx         # System alert toasts
    │   ├── pages/
    │   │   ├── LandingPage.jsx          # Public landing page & online booking engine
    │   │   ├── LoginPage.jsx            # Single unified login page
    │   │   ├── DashboardPage.jsx        # Restored BFA operational dashboard
    │   │   └── ... (10 core module views)
    │   ├── services/
    │   │   └── api.js                   # Axios client with Bearer token interceptor
    │   └── styles/
    │       ├── variables.css            # White normal portal & Grey Super Admin variables
    │       ├── layout.css               # Responsive drawer, shell, topbar
    │       └── components.css           # Cards, responsive tables, modals
```
