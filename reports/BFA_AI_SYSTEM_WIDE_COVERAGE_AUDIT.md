# BFA Apartments Management System
# System-Wide AI Operations Assistant — Comprehensive Coverage Audit & Architecture Specification

**Document ID:** `BFA_AI_SYSTEM_WIDE_COVERAGE_AUDIT.md`  
**Deliverable:** Work Package WP-A (Pre-Implementation System Inventory & Assistant Architecture Audit)  
**Date:** October 26, 2026  
**Author:** Principal AI Systems & Software Architect  
**Status:** COMPLETE — READY FOR REVIEW  

---

## 1. Executive Summary

This audit establishes the pre-implementation baseline for upgrading the existing BFA AI Operations Assistant from a bounded 7-action conversational tool into a **system-wide, context-aware AI Operations Assistant**. 

### 1.1 Core Audit Findings
1. **Existing Assistant Strengths:**
   - The current backend architecture (`backend/src/modules/automation/`) possesses an authoritative, deny-by-default execution pipeline (`AutomationGateway`, `ActionRegistry`, `ConfirmationService`).
   - It enforces dual-level role and property scoping, parameter validation via schemas, typed response components (`responseComponents`), and adversarial pattern rejection.
   - It integrates dual intent resolution: Google Gemini AI (`aiIntentProvider.js`) with an offline deterministic rule-based fallback (`intentResolver.js`).
2. **Critical Capability Gaps:**
   - **Zero Client Navigation:** The assistant currently operates purely as a conversational card renderer. When a user asks "Take me to today's arrivals" or "Open the calendar", the system cannot execute client-side router navigation.
   - **Restricted Tool Catalog:** Only 7 operational actions exist across the entire backend, covering only basic apartment availability, today's arrivals/departures, reservation creation/lookup, and general financial overview.
   - **Missing Page & Record Context:** The frontend assistant modal (`OperationsAssistantModal.jsx`) only transmits `message`, `propertyId`, and `conversationHistory`. It has no awareness of the user's current URL, active view, selected entity record, or search filters.
   - **Unused Core APIs:** The system has rich backend services (multi-entity `SearchService`, employee evaluation/ID card lifecycle, maintenance work order dispatch, unit inspection workflows, audit logging, access capability overrides, announcements, communications), none of which are accessible through the assistant.

---

## 2. Current Assistant Architecture Baseline

### 2.1 Backend Automation Architecture
```
User Message -> /api/v1/automation/assistant/chat
                     │
         [AssistantService.processMessage]
                     ├── 1. ActionRegistry.listForUser(user)
                     ├── 2. aiIntentProvider.resolveWithAI() [Gemini 1.5 Flash]
                     │         └── (On failure/none) -> intentResolver.resolveIntent()
                     ├── 3. Adversarial / Multi-Action / Clarification Guard
                     ├── 4. Action Authorization Check (Role & Property)
                     └── 5. AutomationGateway.proposeOrExecute()
                               ├── Read-Only -> Direct Service Execution
                               └── Consequential -> ConfirmationService (bfa_conf_* token)
```

### 2.2 Currently Registered Actions (7 Actions Total)
| Action ID | Category | Classification | Permitted Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `operations.get_today_arrivals` | OPERATIONS | READ | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `OWNER` | Queries today's scheduled check-ins |
| `operations.get_today_departures` | OPERATIONS | READ | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `OWNER` | Queries today's scheduled check-outs |
| `apartments.list_available` | APARTMENTS | READ | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER` | Lists available apartments for a date |
| `apartments.check_availability` | APARTMENTS | READ | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER` | Checks availability for a specific unit |
| `reservations.get_details` | RESERVATIONS | READ | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `AGENT`, `OWNER` | Fetches details for a booking code / ID |
| `financial.summarize_outstanding_payments` | FINANCIAL | READ | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | Summarizes receivables and pending payments |
| `reservations.create` | RESERVATIONS | MUTATION (Consequential) | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | Creates 1-night reservation (requires confirmation) |

### 2.3 Current Frontend Assistant Limitations (`OperationsAssistantModal.jsx`)
- **No Router Hook:** Does not import `useNavigate` or `useLocation`.
- **Static Suggested Pills:** Suggests only the 7 hardcoded actions.
- **Disconnected Context:** The modal opens as a detached overlay; closing or navigating does not carry record context.
- **Voice Support:** No Web Speech API (`SpeechRecognition`) or audio feedback integration currently exists.

---

## 3. Comprehensive System Module Inventory

Below is the verified inventory of all application modules across the 7 required domains, plus Dashboards and Communications.

### Domain A: Properties & Units
| Client Route | Page Component | Backend API | Authorized Roles | Current Assistant Support | Required Upgrade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/app/properties` | `PropertiesPage.jsx` | `GET /api/v1/properties`<br>`GET /api/v1/properties/:id` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Navigation action; Property search; Property details tool |
| `/app/apartments` | `ApartmentsPage.jsx` | `GET /api/v1/apartments`<br>`GET /api/v1/apartments/:id` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `OWNER` | **Partial** (`check_availability`, `list_available`) | Navigation action; Unit search by number; Occupancy status lookup |
| `/app/calendar` | `CalendarPage.jsx` | `GET /api/v1/calendar/matrix`<br>`GET /api/v1/calendar/summary` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `OWNER` | **None** | Navigation action; Date-range occupancy summary |

### Domain B: Front Office & Bookings
| Client Route | Page Component | Backend API | Authorized Roles | Current Assistant Support | Required Upgrade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/app/front-office` | `FrontOfficePage.jsx` | `GET /api/v1/front-office/arrivals`<br>`GET /api/v1/front-office/departures`<br>`GET /api/v1/front-office/stats` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST` | **Partial** (Arrivals/Departures queries) | Navigation action; Front desk operational stats tool |
| `/app/reservations` | `ReservationsPage.jsx` | `GET /api/v1/reservations`<br>`GET /api/v1/reservations/:id` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `AGENT`, `OWNER` | **Partial** (`get_details`, `create`) | Navigation action; Guest reservation search; Status filter navigation |
| `/app/guests` | `GuestsPage.jsx` | `GET /api/v1/guests`<br>`GET /api/v1/guests/:id` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER` | **None** | Navigation action; Guest profile search; History lookup |

### Domain C: Staff & Partners
| Client Route | Page Component | Backend API | Authorized Roles | Current Assistant Support | Required Upgrade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/app/employees` | `EmployeesPage.jsx` | `GET /api/v1/employees`<br>`GET /api/v1/employees/stats` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Navigation action; Employee directory search |
| `/app/employees/:id` | `EmployeeProfilePage.jsx` | `GET /api/v1/employees/:id` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Contextual employee profile navigation |
| `/app/performance` | `EmployeePerformancePage.jsx` | `GET /api/v1/employees/activities/summary`<br>`GET /api/v1/employees/evaluation-criteria` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Navigation action; Performance summary tool |
| `/app/id-cards` | `EmployeeIdCardPage.jsx` | `GET /api/v1/employees/id-cards`<br>`GET /api/v1/employees/id-cards/:id/pdf` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Navigation action; ID card status lookup |
| `/app/my-profile` | `EmployeeProfilePage.jsx` | `GET /api/v1/employees/me/profile`<br>`GET /api/v1/auth/me` | All authenticated roles | **None** | Navigation action; Self-profile navigation |
| `/app/agents` | `AgentsPage.jsx` | `GET /api/v1/agents`<br>`GET /api/v1/commissions` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Navigation action; Agent search; Commission summary |

### Domain D: Finance & Accounts
| Client Route | Page Component | Backend API | Authorized Roles | Current Assistant Support | Required Upgrade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/app/financial` | `FinancialPage.jsx` | `GET /api/v1/financial/overview`<br>`GET /api/v1/financial/ledger`<br>`GET /api/v1/expenses` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **Partial** (`summarize_outstanding_payments`) | Navigation action; Ledger query; Revenue vs expense explanation |

### Domain E: Maintenance & Care
| Client Route | Page Component | Backend API | Authorized Roles | Current Assistant Support | Required Upgrade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/app/maintenance` | `MaintenancePage.jsx` | `GET /api/v1/maintenance`<br>`GET /api/v1/maintenance/stats`<br>`POST /api/v1/maintenance/:id/start` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `OWNER` | **None** | Navigation action; Work order search; Maintenance status summary |
| `/app/inspection` | `InspectionPage.jsx` | `GET /api/v1/inspections`<br>`GET /api/v1/inspections/:id` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `STAFF`, `OWNER` | **None** | Navigation action; Inspection search & summary |

### Domain F: Reports & Intelligence
| Client Route | Page Component | Backend API | Authorized Roles | Current Assistant Support | Required Upgrade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/app/analytics` | `AnalyticsPage.jsx` | `GET /api/v1/analytics/overview`<br>`GET /api/v1/analytics/reservations` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Navigation action; Key metrics explanation |
| `/app/reports` | `ReportsPage.jsx` | `GET /api/v1/reports/reservations`<br>`GET /api/v1/reports/financial` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Navigation action; Report type directory |
| `/app/audit` | `AuditPage.jsx` | `GET /api/v1/audit` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Navigation action; Recent audit trail queries |

### Domain G: System Administration
| Client Route | Page Component | Backend API | Authorized Roles | Current Assistant Support | Required Upgrade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/app/access-control` | `AccessControlPage.jsx` | `GET /api/v1/access/capabilities`<br>`GET /api/v1/access/overrides` | `SUPER_ADMIN`, `OWNER`, `MANAGER`, `ADMIN` | **None** | Navigation action; Policy explanation |
| `/app/announcements` | `AnnouncementsPage.jsx` | `GET /api/v1/announcements`<br>`POST /api/v1/announcements` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | **None** | Navigation action; Active announcements query |
| `/app/communications`| `CommunicationsPage.jsx` | `GET /api/v1/communications`<br>`GET /api/v1/communications/templates`| `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `OWNER` | **None** | Navigation action; Outbox summary |
| `/app/notifications` | `NotificationsPage.jsx` | `GET /api/v1/notifications`<br>`POST /api/v1/notifications/read-all` | All authenticated roles | **None** | Navigation action; Unread notifications count |
| `/app/team` | `TeamPage.jsx` | `GET /api/v1/users` | `SUPER_ADMIN`, `ADMIN` | **None** | Navigation action; Staff account query |
| `/app/settings` | `SettingsPage.jsx` | `GET /api/v1/system/settings` | `SUPER_ADMIN`, `ADMIN` | **None** | Navigation action |

### Domain H: Dashboards & Chat
| Client Route | Page Component | Backend API | Authorized Roles | Current Assistant Support | Required Upgrade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/app/dashboard` | `DashboardPage.jsx` | Role-tailored telemetry endpoints | All authenticated roles | **None** | Navigation action ("Take me home", "Dashboard") |
| `/app/chat` | Chat Route (WP-4.5) | `GET /api/v1/chat/threads` | Operational Staff | **None** | Navigation action; Thread navigation |

---

## 4. Technical Architecture: System-Wide Upgrades

### 4.1 Natural-Language Navigation Engine (`navigation.navigate`)
To satisfy Section 4 of the specification, navigation cannot be textual advice ("Click Properties"). It must execute real React Router navigation.

#### Architecture:
1. **Centralized Navigation Registry (`navigationRegistry.js`):**
   Defines all verified system routes, searchable aliases, required roles, query params, and parameter extractors.
2. **Standard Action Integration:**
   Register `navigation.navigate` as a Level 1 (READ/NAVIGATE) action in `ActionRegistry`.
   - **Permitted Roles:** Universal (All 7 roles).
   - **Execution Result:**
     ```json
     {
       "type": "navigation",
       "routeId": "properties_list",
       "path": "/app/properties",
       "displayName": "Properties & Buildings",
       "params": {},
       "query": {}
     }
     ```
3. **Frontend Action Dispatcher:**
   `OperationsAssistantModal.jsx` listens for `navigation` typed response components.
   - When received, it calls `navigate(component.path)` via `useNavigate()`.
   - Dismisses or auto-docks the modal.
   - Emits a clean confirmation message: *"Navigated to Properties & Buildings."*

### 4.2 Page and Entity Context Engine
The frontend modal will capture the active operational context and send it in the request body:
```typescript
interface AssistantContext {
  currentRoute: string;          // e.g., "/app/reservations"
  propertyScope: number | null;  // e.g., 1 (Grand Horizon Tower)
  selectedEntity?: {
    type: 'reservation' | 'apartment' | 'guest' | 'employee' | 'maintenance' | 'property';
    id: number | string;
    identifier?: string;         // e.g., "RES-101", "Unit 201"
  };
  activeFilters?: Record<string, any>;
}
```
This enables contextual commands:
- While on `/app/reservations?search=RES-101`: *"Show this guest's profile"* -> extracts `selectedEntity.guestId` and navigates to `/app/guests?search=...`.
- While viewing Apartment 202: *"Check availability for next week"* -> automatically infers `apartmentId: 202`.

### 4.3 General Search & Entity Resolver Tool (`search.query`)
Leverages the existing `SearchService.search()` to empower the assistant with multi-entity lookup:
- Queries properties, apartments, reservations, maintenance, agents, guests, inspections, and expenses.
- Strictly adheres to the caller's role (e.g., AGENT isolation, STAFF property restrictions).
- Resolves entity names ("Marcus Vance", "Azure Bay") to exact database IDs for targeted navigation.

---

## 5. Phased Implementation & Verification Plan

### Phase 1: Work Package WP-A — System Inventory & Architecture Audit (THIS STEP)
- **Status:** COMPLETE
- **Deliverable:** `BFA_AI_SYSTEM_WIDE_COVERAGE_AUDIT.md`
- **Output:** Comprehensive route, API, role, and gap matrix.

### Phase 2: Work Package WP-B — Natural-Language Navigation Engine
- **Objectives:**
  1. Build the shared `navigationRegistry.js` containing verified route aliases across all 7 module groups.
  2. Implement backend action `navigation.navigate` with strict role checking.
  3. Update `intentResolver.js` and `aiIntentProvider.js` with navigation patterns.
  4. Update `OperationsAssistantModal.jsx` to consume navigation events via `useNavigate()`.
  5. Test navigation across all routes and roles.

### Phase 3: Work Package WP-C — Context Engine & System-Wide Read-Only Tools
- **Objectives:**
  1. Frontend context collector (active route, selected record, property scope).
  2. Register read-only lookup tools:
     - `search.query` (multi-entity search across properties, units, guests, work orders)
     - `maintenance.get_summary` (pending repairs and priorities)
     - `inspections.get_summary` (recent inspection statuses)
     - `employees.search_directory` (staff directory lookup)
     - `analytics.get_summary` (authorized KPI highlights)
     - `announcements.get_active` (system announcements)
  3. Contextual pronoun/deictic reference resolution ("this guest", "that unit", "the work order").

### Phase 4: Work Package WP-D — Controlled Operational Actions
- **Objectives:**
  1. Maintenance status progression (`maintenance.update_status`) with dual-approval checks.
  2. Announcement publishing (`announcements.create`) with role authorization.
  3. Safe parameter validation, confirmation cards, and idempotency guarantees.

### Phase 5: Work Package WP-E — Security Hardening, Regression & Acceptance Testing
- **Objectives:**
  1. Cross-role unauthorized navigation rejection tests.
  2. Prompt-injection defense tests.
  3. Full backend regression test (459/459 tests).
  4. Frontend build verification (`npm run build`).
  5. Final acceptance report: `BFA_AI_SYSTEM_WIDE_VERIFICATION_REPORT.md`.

---

## 6. Review & Authorization Gate

**Work Package WP-A is complete and submitted for review.**  
No application code has been modified.

**Awaiting user authorization to proceed to Work Package WP-B (Natural-Language Navigation Engine).**
