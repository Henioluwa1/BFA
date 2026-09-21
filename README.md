# BFA Apartments Management System

A production-ready, multi-property apartment and property management enterprise platform built with Node.js, Express, MySQL, and React.

## 🏢 Core Business Hierarchy

The system strictly adheres to the non-negotiable multi-property domain model:

```
BFA Company 
 └── Multiple Properties/Buildings (dynamic: 1 to many)
      └── Apartments/Units (dynamic: 1 to many per property)
           └── Reservations (underlying 1-night stay constraint)
                └── Tenants/Guests (staying profiles)
```

Each apartment/unit belongs to **exactly one property/building**. The system never assumes BFA operates from only one building.

---

## 🌐 Public Website vs Authenticated Portal

The application strictly separates public and internal systems:

- **Public Area**:
  - **Landing Page (`/`)**: Brand identity, dynamic properties showcase, apartment listings, amenities, and contact information.
  - **Online Reservation Engine**: Real-time availability check and instant public booking creation adhering to the authoritative availability and 1-night rule engine.
  - **Single Login Page (`/login`)**: The sole authentication entry point for all internal roles.
- **Authenticated Area (`/app/*`)**:
  - Operational Dashboard, Calendar, Reservations, Apartments, Financial, Reports, Analytics, Agents, Maintenance, Inspection, Audit Trail, Team, and Settings.
  - Protected by backend-verified cryptographic JWT tokens.

---

## 🔒 Authoritative Authentication & RBAC

The system enforces strict backend-authoritative security:
- **Zero Frontend Authority**: Users can NEVER manually select or switch roles in the interface.
- Role and permissions are resolved exclusively by the backend during authentication against the `users` table.
- Client headers such as `X-User-Role` are ignored as security boundaries.
- The 7 roles are:
  1. **Super Admin**: System-level administration, database/tenant management (Grey portal background).
  2. **Admin**: Full property management, company settings, team governance, and reports (White portal background).
  3. **Manager**: Operational management, units, staff, maintenance, and reservations.
  4. **Receptionist**: Daily arrivals, departures, check-in/out, reservations, and calendar.
  5. **Staff**: Housekeeping turnover and maintenance work orders.
  6. **Agent**: Isolated client reservations and commission tracking.
  7. **Owner**: Executive portfolio yield, net income, and asset performance.

---

## 🎨 Visual System Standard

- **Normal Authenticated Portal**: **WHITE** primary background (`#ffffff` / `#f8fafc`) providing a clean, accessible, modern workspace.
- **Super Admin Portal**: **GREY** primary background (`#14181f` / `#1a2029`) visually distinguishing the system-level administration environment.
- Fully responsive across **Desktop** (1280px+), **Tablet** (768px), and **Mobile** (390px) with collapsible mobile navigation drawer.

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

### 4. Run Development Servers
```bash
# Run both backend and frontend concurrently:
npm run dev

# Or run individually:
npm run dev:backend   # API on http://localhost:5000
npm run dev:frontend  # UI on http://localhost:5173
```

### 5. Automated Tests
```bash
npm test
```
All 7 test suites and 32 tests pass out of the box (Health, Errors, Security & RBAC, One-Night Rule, Search, Reports, Audit).
