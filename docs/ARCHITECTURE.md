# BFA Apartments Management System — System Architecture

## 1. Architectural Principles

1. **Strict Multi-Property Scalability**:
   - Company (`BFA`) owns/manages `1..N` physical Properties.
   - Each Property contains `1..N` Apartments/Units.
   - Every apartment belongs to exactly one property.
   - Properties, units, and rooms are never hardcoded.

2. **Server-Authoritative Business Logic & Security**:
   - The frontend is never treated as a security boundary.
   - All state transitions (reservations, unit statuses, payments) are validated on the backend.
   - Granular RBAC permissions with backend enforcement on every API endpoint.
   - Protection against double-booking through atomic transactions and locking.

3. **Domain Entity Independence**:
   - **Apartment/Unit Status** is strictly decoupled from **Reservation Status**:
     - Unit statuses: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `DIRTY`, `CLEANING`, `READY`, `MAINTENANCE`, `BLOCKED`, `OUT_OF_SERVICE`.
     - Reservation statuses: `PENDING`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.
     - *Example*: A reservation can be `COMPLETED` while the apartment is `DIRTY` until housekeeping marks it `READY`.

4. **Financial Integrity & Auditability**:
   - Traceable payment records linked to reservations.
   - Calculated outstanding balances (`Outstanding = Total - Valid Payments`).
   - Immutable audit logging for sensitive actions (`audit_logs` table).

---

## 2. Technical Stack & Layout

```
c:\xamp\htdocs\BFA\
├── package.json               # Root scripts
├── docs/                      # Architectural & schema documentation
├── backend/                   # Node.js + Express + MySQL API
│   ├── src/
│   │   ├── config/            # Env validation & constants
│   │   ├── db/                # Pool & SQL migration engine
│   │   ├── middleware/        # Error handler, security, rate limit, request logger
│   │   ├── modules/           # Domain modules
│   │   └── utils/             # Standard API envelopes & errors
│   └── tests/                 # Automated API & DB tests
└── frontend/                  # React 18 + Vite SPA
    ├── src/
    │   ├── components/        # Layout & UI component library
    │   ├── context/           # PropertyContext, ToastContext
    │   ├── pages/             # 11 Core system module views
    │   ├── services/          # API client with interceptors
    │   └── styles/            # Luxury hospitality design system
```

---

## 3. Standardized API Envelope

Every API response follows a consistent contract:

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "meta": {
    "timestamp": "2026-09-21T14:00:00.000Z",
    "requestId": "req-987abc12"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      { "field": "email", "issue": "Must be a valid email address" }
    ]
  },
  "meta": {
    "timestamp": "2026-09-21T14:00:00.000Z",
    "requestId": "req-987abc12"
  }
}
```
