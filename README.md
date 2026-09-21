# BFA Apartments Management System

A production-ready, multi-property apartment and property management enterprise platform built with Node.js, Express, MySQL, and React.

## 🏢 Core Business Hierarchy

The system strictly adheres to the non-negotiable multi-property domain model:

```
BFA Company 
 └── Properties/Buildings (dynamic: 1 to many)
      └── Apartments/Units (dynamic: 1 to many per property)
           └── Reservations (booking & stay records — strictly 1 night maximum)
                ├── Tenants/Guests (staying profiles)
                ├── Payments (traceable financial records)
                ├── Inspections (pre/post-stay assessments)
                └── Agents (third-party client bookings & commissions)
```

Each apartment/unit belongs to **exactly one property/building**. The system never hardcodes properties, unit counts, or room structures.

---

## 🎨 Visual System Standard

The user interface strictly adheres to a three-color luxury minimalist corporate palette:
- **Base**: Crisp Dark Slate Grey / Charcoal (`#1a1f26`, `#14181d`, `#262d38`)
- **Neutral**: Crisp Pure White (`#ffffff`) and Soft Slate Off-White (`#f8fafc`)
- **Accent**: **Rust Orange** (`#c25e2e` primary, `#d36531` hover, `#a8481d` active)

*No blues, greens, yellows, or champagne gold are permitted.*

---

## 🛠️ Technology Stack & Modular Monolith

- **Backend**:
  - Node.js (v24+), Express 4, MySQL 8 / MariaDB (via `mysql2/promise`)
  - **Modular Monolith Layout**: Foundational `core/` (errors, logging, audit, security, middleware) and autonomous `modules/` (properties, apartments, reservations, search, reports, audit)
  - Standardized RESTful versioned endpoints (`/api/v1/`) with backward-compatible aliases
  - Structured Winston logging with sensitive parameter scrubbing (`[REDACTED]`)
  - Immutable audit trail with `X-Request-Id` correlation
  - Reporting: RFC 4180 CSV export and programmatic executive PDF generation via `pdfkit`
- **Frontend**:
  - React 18, Vite, React Router v6, Axios
  - Strict Grey/White/Rust design system with centralized role-specific arrangements (`roleThemes.css`)
  - Global Categorized Search modal with `Ctrl+K` shortcut and RBAC isolation
  - Interactive Property Switcher and Role Switcher (`X-User-Role` client injection)
- **1-Night Maximum Reservation Rule**:
  - Database level: `CONSTRAINT chk_one_night CHECK (DATEDIFF(check_out_date, check_in_date) = 1)`
  - Backend API: Validates duration = 1 night, rejects invalid spans with HTTP 422 `VALIDATION_ERROR`
  - Frontend UI: Automatic calculation and locking of check-out date to check-in + 1 day

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js v18+ and npm
- MySQL / MariaDB running on port 3306 (e.g. XAMPP MySQL)

### 2. Environment Setup
The database `bfa_apartments_db` is configured in `backend/.env`.
```bash
cp backend/.env.example backend/.env
```

### 3. Run Migrations
```bash
npm run db:migrate
```

### 4. Development
```bash
# Run both backend and frontend concurrently:
npm run dev

# Or run individually:
npm run dev:backend   # Starts API on http://localhost:5000
npm run dev:frontend  # Starts UI on http://localhost:5173
```

### 5. Automated Tests
```bash
npm test
```
All 6 test suites and 20 tests pass out of the box (Health, Errors, One-Night Rule, Search, Reports, Audit).

---

## 📋 Role-Based Access Control (RBAC)

The system is configured with 6 primary roles:
1. **Admin**: System governance, security audit trails, and configuration.
2. **Manager**: Operational oversight, financial metrics, and maintenance scheduling.
3. **Receptionist**: Daily front-desk operations, 1-night check-ins, and guest arrivals.
4. **Staff**: Housekeeping, unit turnover, and maintenance work orders.
5. **Agent**: Third-party bookings, commission balances, and restricted queries.
6. **Owner**: High-level portfolio ROI, net income yields, and asset performance.
