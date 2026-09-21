# BFA Apartments Management System

A production-ready, multi-property apartment and property management enterprise platform built with Node.js, Express, MySQL, and React.

## 🏢 Core Business Hierarchy

The system strictly adheres to the non-negotiable multi-property domain model:

```
BFA Company 
 └── Properties/Buildings (dynamic: 1 to many)
      └── Apartments/Units (dynamic: 1 to many per property)
           └── Reservations (booking & stay records)
                ├── Tenants/Guests (staying profiles)
                ├── Payments (traceable financial records)
                ├── Inspections (pre/post-stay assessments)
                └── Agents (third-party client bookings & commissions)
```

Each apartment/unit belongs to **exactly one property/building**. The system never hardcodes properties, unit counts, or room structures.

---

## 🛠️ Technology Stack

- **Backend**: Node.js (v24+), Express 4, MySQL 8 / MariaDB (via `mysql2/promise`), Helmet, CORS, Rate Limiting, Winston/Morgan, Zod
- **Frontend**: React 18, Vite, React Router v6, Axios, Vanilla CSS Custom Design System (obsidian & warm gold executive hospitality aesthetic)
- **Database**: MySQL (`bfa_apartments_db`) with transactional migration runner
- **Security & RBAC**: 6 Roles (Admin, Manager, Receptionist, Staff, Agent, Owner), authoritative backend authorization, granular permissions

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js v18+ and npm
- MySQL running on port 3306 (e.g. XAMPP MySQL)

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

---

## 📋 12-Phase Development Roadmap

| Phase | Title | Status | Description |
|---|---|---|---|
| **Phase 1** | **Foundation & Architecture** | **COMPLETED** | Project layout, environment, API & DB foundation, migration runner, UI architecture & multi-property context |
| Phase 2 | Authentication, RBAC & User Access | Pending | 6 Roles, single-owner rule, granular permissions, audit logging |
| Phase 3 | Properties, Apartments & Units | Pending | Dynamic properties, units, unit types, statuses, availability |
| Phase 4 | Reservation Engine | Pending | Availability calculation, double-booking prevention, pricing, lifecycle |
| Phase 5 | Calendar & Front Office | Pending | Month/week/day/timeline calendar, check-in, check-out |
| Phase 6 | Tenants, Guests & Inspection | Pending | Guest profiles, directories, inspection workflows, damage evidence |
| Phase 7 | Maintenance & Operations | Pending | Issue tracker, assignments, unit operational statuses |
| Phase 8 | Financial Management | Pending | Payments, collections, expenses, net profit calculation |
| Phase 9 | Agents & Commission Management | Pending | Agent profiles, client tracking, commission settlements |
| Phase 10 | Analytics & Reporting | Pending | Revenue trends, occupancy metrics, apartment performance |
| Phase 11 | Team, Settings & Integrations | Pending | User governance, settings, notification and external channels |
| Phase 12 | Final Integration & Production Readiness | Pending | Security audit, end-to-end tests, performance tuning, hardening |
