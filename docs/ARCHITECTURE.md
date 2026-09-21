# BFA Apartments Management System — System Architecture

## 1. Architectural Principles

1. **Modular Monolith Architecture**:
   - Organized into a shared foundational `src/core/` and autonomous domain `src/modules/`.
   - Direct module coupling is prohibited; modules communicate via typed services or standard database queries.
   - Unified routing mounts versioned RESTful endpoints under `/api/v1/`.
   - Backward-compatible aliases retained under legacy roots (`/health`, `/api/health`, etc.).

2. **Strict Multi-Property Scalability**:
   - Company (`BFA`) owns/manages `1..N` physical Properties.
   - Each Property contains `1..N` Apartments/Units.
   - Every apartment belongs to exactly one property.
   - Properties, units, and rooms are never hardcoded.

3. **Mandatory 1-Night Maximum Reservation Rule**:
   - In accordance with business rules, reservations are strictly limited to **1 night only**.
   - `check_out_date` MUST equal `check_in_date + 1 day`.
   - Multi-layered defense:
     - **Database Layer**: `CONSTRAINT chk_one_night CHECK (DATEDIFF(check_out_date, check_in_date) = 1)`
     - **Service/Backend Layer**: Validates `DATEDIFF === 1` and throws HTTP 422 `VALIDATION_ERROR`.
     - **Frontend UI Layer**: Auto-calculates and disables/locks the check-out date field when check-in is selected.

4. **Categorized Global Search Engine**:
   - Endpoint: `GET /api/v1/search?q=:query&property_id=:propertyId`
   - Real-time categorized results across: Properties, Apartments, Reservations, Maintenance, and Agents.
   - **Role-Based Access Control (RBAC) Isolation**:
     - Agents only receive agent-scoped data (e.g. own profile, restricted queries).
     - Staff/Receptionist cannot access sensitive owner-level financial data.
     - Admin/Manager have full multi-entity search scope.
   - Multi-property scoping: when a property is active in the context, search results prioritize or filter by property.

5. **Security, Sensitive Data Redaction & Correlation**:
   - Structured JSON logging via Winston with automatic redaction of sensitive keys (`password`, `token`, `jwt`, `secret`, `authorization`, `creditcard`, `api_key`).
   - Every request is tagged with a unique `X-Request-Id` (UUID v4), correlated across logger metadata and audit logs.
   - Client-provided roles in `X-User-Role` validated by `authContext` middleware against authorized role definitions: `admin`, `manager`, `receptionist`, `staff`, `agent`, `owner`.

6. **Immutable Correlated Audit Trail**:
   - Dedicated `src/core/audit/audit.service.js` records actions synchronously or asynchronously into `audit_logs`.
   - Stored fields: `actor_id`, `actor_email`, `actor_role`, `action`, `entity_type`, `entity_id`, `old_values`, `new_values`, `request_id`, `ip_address`, `user_agent`.
   - Query endpoint: `GET /api/v1/audit` with RBAC restriction (Admin, Manager, Owner only).

7. **Financial & Operational Reporting Engine**:
   - Endpoint: `GET /api/v1/reports/reservations?format=csv&property_id=...`
     - Strictly formatted RFC 4180 CSV export with proper escaping and quotes.
   - Endpoint: `GET /api/v1/reports/financial?format=pdf&property_id=...`
     - Clean, programmatic, executive PDF generation powered by `pdfkit` (revenue, ADR, occupancy, property breakdown).

8. **Strict Visual System Standard (Grey, White, Rust Orange ONLY)**:
   - Zero tolerance for blues, greens, yellows, or champagne gold.
   - Base Palette: High-contrast Dark Grey / Slate Charcoal (`#1a1f26`, `#14181d`, `#262d38`).
   - Surface Palette: Clean Crisp White (`#ffffff`) and Soft Off-White (`#f8fafc`).
   - Accent / Brand Palette: **Rust Orange** (`#c25e2e` primary, `#d36531` hover, `#a8481d` active).
   - Centralized Role Styling (`frontend/src/styles/roleThemes.css`) using `[data-role="..."]` for tailored dashboard arrangements:
     - `admin`: Full system oversight, audit trails, and user management.
     - `manager`: Operational KPIs, financial digests, and maintenance queues.
     - `receptionist`: Daily front-desk arrivals, departures, and 1-night check-ins.
     - `staff`: Housekeeping and operational maintenance task lists.
     - `agent`: Commission balances, assigned bookings, and client reservations.
     - `owner`: Portfolio ROI, net income yields, and property asset overviews.

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
│   │   │   ├── logging/                 # Winston logger with sensitive redaction
│   │   │   ├── middleware/              # Request ID, AuthContext, RequestLogger, ErrorHandler
│   │   │   └── security/                # Helmet, CORS, Rate Limiting
│   │   ├── db/                          # Database pool & migrations (001, 002, 003)
│   │   ├── modules/                     # Autonomous domain modules
│   │   │   ├── apartments/              # Apartments REST API (/api/v1/apartments)
│   │   │   ├── audit/                   # Audit explorer REST API (/api/v1/audit)
│   │   │   ├── properties/              # Properties REST API (/api/v1/properties)
│   │   │   ├── reports/                 # Reporting engine CSV & PDF (/api/v1/reports)
│   │   │   ├── reservations/            # Reservation engine with 1-night rule (/api/v1/reservations)
│   │   │   └── search/                  # Global categorized search engine (/api/v1/search)
│   │   ├── app.js                       # Express app assembling core & modules
│   │   └── server.js                    # Server bootstrap
│   └── tests/                           # Automated Jest test suites (20 tests)
│       ├── health.test.js
│       ├── errors.test.js
│       ├── oneNightRule.test.js
│       ├── search.test.js
│       ├── reports.test.js
│       └── audit.test.js
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── common/                  # Modals, toasts, buttons
    │   │   ├── layout/                  # Sidebar, Topbar with Property & Role Switchers
    │   │   └── search/                  # GlobalSearchModal with Ctrl+K shortcut
    │   ├── context/
    │   │   ├── PropertyContext.jsx      # Global property selector
    │   │   ├── RoleContext.jsx          # Role switcher & X-User-Role injection
    │   │   └── ToastContext.jsx         # System alert toasts
    │   ├── pages/                       # 11 Core system views + Reports & Audit
    │   ├── services/
    │   │   └── api.js                   # Axios client with request/response interceptors
    │   └── styles/
    │       ├── variables.css            # Strict Grey, White, Rust Orange design tokens
    │       ├── roleThemes.css           # Centralized role arrangements
    │       ├── layout.css               # Grid, shell, sidebar, topbar
    │       └── components.css           # Cards, tables, badges, modals
```

---

## 3. Standardized API Envelope

Every API response follows the established contract:

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "meta": {
    "timestamp": "2026-09-21T15:00:00.000Z",
    "requestId": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Reservations are strictly limited to exactly 1 night. Check-out must be 2026-10-16 for check-in 2026-10-15.",
    "details": null
  },
  "meta": {
    "timestamp": "2026-09-21T15:00:00.000Z",
    "requestId": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6"
  }
}
```
