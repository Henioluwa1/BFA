# BFA Phase 12B — Secure Text-Based Operations Assistant Report

**Document Reference:** `BFA-REPORT-AUTO-12B`  
**Phase:** 12B — Conversational Natural Language Assistant (Modal-Based Implementation)  
**Date:** October 2026  
**Status:** IMPLEMENTED, TESTED & PRODUCTION BUILD VERIFIED  
**Final Verdict:** **PASS**

---

## 1. Executive Summary & UI Model Correction

In accordance with Phase 12B and the UI Requirement Correction, the **BFA Intelligent Operations Assistant** was designed and implemented strictly as an enterprise **modal overlay** within the existing authenticated application shell, avoiding unnecessary routes or full-page chat screens.

### Acceptance Criterion Verification
> **Acceptance Criterion:** *A user can open the assistant, complete an authorized operation, and close it without ever leaving the page they were using.*
* **Verified:** Authenticated operators on any operational dashboard (e.g. Front Office, Calendar, Reservations, Financials) can trigger the assistant via the Topbar Assistant button, Sidebar Quick Launcher, or keyboard shortcut (`Alt + A` / `Ctrl + J`). The assistant mounts as an accessible modal overlay above the active page. The underlying route, component state, form inputs, and property filters remain intact. Closing the modal (via Close button, `Esc` key, or outside click) immediately restores focus without navigation or reloads.

---

## 2. Architecture & Security Boundary Preservation

```
┌────────────────────────────────────────────────────────────────────────┐
│               FRONTEND MODAL OVERLAY (CLIENT BOUNDARY)                 │
│  - OperationsAssistantModal (`frontend/src/components/assistant/`)     │
│  - Topbar & Sidebar Launchers (`Alt + A`, `Ctrl + J`)                  │
│  - Suggested Prompt Pills Filtered by Server-Authorized Capabilities    │
│  - ConfirmationCard: Two-Phase Commit UI for High-Risk Writes          │
│  - No Tokens, Passwords, or Secrets in localStorage or URLs            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP JSON Payload (`automationService.chat`)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   BFA BACKEND API GATEWAY & SECURITY                   │
│  - Mount: `/api/v1/automation/assistant/chat`                          │
│  - Strict Rate Limiting (`automationLimiter`: 120 req / 15 min)        │
│  - Cryptographic Authentication Guard (`requireAuth` -> `req.user`)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Trusted req.user
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    DETERMINISTIC INTENT RESOLVER                       │
│  - `backend/src/modules/automation/assistant/intentResolver.js`        │
│  - Regex / Semantic Matcher for 6 Authoritative Actions                │
│  - Parameter Extraction (Dates, Apartment IDs, Guest Details, Codes)   │
│  - Prompt-Injection & Adversarial Defenses (Deny-by-Default)           │
│  - Clarification Dialogue Generator for Incomplete Requests            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Validated actionId & parameters
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             AUTHORITATIVE AUTOMATION GATEWAY & EXECUTION               │
│  - Role Permission & Capability Verification (`ActionRegistry`)        │
│  - Native Repository Property Isolation (`frontOffice.repository.js`)  │
│  - Safe Read Actions -> Direct Business Service Execution              │
│  - State-Mutating Writes (`reservations.create`) -> Two-Phase Commit   │
│  - Atomic SQL Claim (`status = 'PENDING' AND expires_at > NOW()`)      │
│  - Immutable Audit Logging (`logger.sanitizeMeta` Scrubbing)           │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Backend as Sole Execution Authority:** The natural-language interface cannot execute arbitrary shell scripts, dynamic code (`eval`), raw SQL queries, or unregistered actions.
2. **Deterministic Intent Resolver:** Operates as a modular, replaceable component that maps natural language requests strictly to the 6 registered actions in `ActionRegistry`.
3. **No External PII Transmission:** Does not transmit guest PII or operational data to external third-party language model providers.
4. **Adversarial & Injection Resistance:** Known injection signatures (`ignore instructions`, `drop table`, `<script>`, `bypass auth`) are proactively detected and blocked.

---

## 3. Supported Natural Language Operations

| Action Identifier | Natural Language Trigger Examples | Execution Behavior |
|---|---|---|
| `operations.get_today_arrivals` | "Show today's arrivals", "Who is arriving today?", "Check-ins today" | Directly returns arrivals formatted for user's scoped property. Booking authentication codes (`auth_code`) are completely omitted. |
| `operations.get_today_departures` | "Who is checking out today?", "Show departures", "Departures today" | Directly returns departures formatted for user's scoped property. |
| `apartments.check_availability` | "Is apartment 1 available tomorrow?", "Check availability for unit 3 on 2026-11-20" | Checks availability, returns nightly rate, property name, and conflict details. Asks clarification if unit or date is missing. |
| `reservations.get_details` | "Show reservation 1", "Lookup booking BFA-2026-00001", "Details for booking #12" | Returns reservation details. Automatically masks financial totals if caller is `STAFF`. Restricts Agents to their own bookings. |
| `financial.summarize_outstanding_payments` | "Summarize outstanding payments", "Who owes money?", "Unpaid balances" | Summarizes outstanding balances. Permitted only for `MANAGER`, `OWNER`, and `ADMIN`. Receptionists and Staff are explicitly denied. |
| `reservations.create` | "Create reservation for Jane Doe in apartment 1 on 2027-04-10 with email jane@example.com and phone 08012345678" | Enforces strict 1-night stay rule. Proposes a single-use confirmation token. Renders interactive `ConfirmationCard` in UI. Execution occurs ONLY upon explicit confirmation click. |

---

## 4. Confirmation Card & Consequential Write Lifecycle

For state-mutating actions (`reservations.create`):
1. **Proposal Generation:** The assistant identifies required parameters, pre-validates apartment availability, and generates a cryptographic confirmation token (`bfa_conf_...`) valid for 5 minutes.
2. **Interactive UI Card:** The assistant modal renders a `ConfirmationCard` displaying:
   * Target action (`reservations.create`).
   * Breakdown of validated parameters: Guest Name, Unit Number, Check-in Date, Check-out Date (1 Night), Email, Phone.
   * Clear impact statement: *"This will commit a new reservation and lock apartment #[X] in the database."*
   * Real-time countdown timer (`Expires in 4:59`).
   * Explicit action buttons: **"Confirm & Execute"** and **"Cancel Proposal"**.
3. **Atomic Consumption:** When the operator clicks "Confirm & Execute", the client calls `POST /api/v1/automation/confirm`. The backend executes an atomic SQL claim (`UPDATE ... SET status = 'EXECUTED' WHERE id = ? AND status = 'PENDING' AND expires_at > NOW()`).
4. **Replay & Concurrency Defense:** Concurrent or replayed confirmation attempts receive `409 Conflict`.
5. **No Auto-Execution on Modal Close:** If the operator closes the assistant modal while a proposal is pending, the operation is NOT executed automatically.

---

## 5. Summary of Files Changed & Created

### Frontend Files
* `frontend/src/services/api.js`: Added `automationService` (`getActions`, `execute`, `confirm`, `cancel`, `chat`).
* `frontend/src/styles/assistant.css`: Created complete styling for Topbar launch button, modal container, message thread, prompt pills, confirmation card, and input bar.
* `frontend/src/main.jsx`: Imported `assistant.css`.
* `frontend/src/components/assistant/ConfirmationCard.jsx`: Interactive confirmation card component with countdown timer, execution spinner, and cancel button.
* `frontend/src/components/assistant/OperationsAssistantModal.jsx`: Enterprise modal overlay hosting conversation history, suggested prompt pills, clarification dialogues, and execution cards.
* `frontend/src/components/layout/Topbar.jsx`: Added Operations Assistant launcher button with AI badge, keyboard shortcut (`Alt + A`, `Ctrl + J`), and rendered `OperationsAssistantModal`.
* `frontend/src/components/layout/Sidebar.jsx`: Added Operations Assistant quick-action button in navigation drawer.

### Backend Files
* `backend/src/modules/automation/assistant/intentResolver.js`: Created modular natural language intent resolver with parameter extraction and injection defenses.
* `backend/src/modules/automation/assistant/assistant.service.js`: Created conversational coordinator validating user permissions and dispatching to `AutomationGateway`.
* `backend/src/modules/automation/automation.controller.js`: Added `chatWithAssistant` handler.
* `backend/src/modules/automation/automation.routes.js`: Mounted `POST /api/v1/automation/assistant/chat` with authentication and rate limiting.
* `backend/src/modules/automation/confirmationService.js`: Updated `cancelConfirmation` to return `cancelled: true`.
* `backend/tests/assistant.test.js`: Created comprehensive test suite for Phase 12B.

---

## 6. Verification & Test Evidence

### 1. Dedicated Phase 12B Assistant Test Suite (`backend/tests/assistant.test.js`)
* **19 tests passed, 0 failed, 0 skipped (100% pass rate):**
  * `[PASS]` Rejection of unauthenticated requests (`HTTP 401`).
  * `[PASS]` Safe execution of arrivals query via natural language.
  * `[PASS]` Safe execution of departures query via natural language.
  * `[PASS]` Safe execution of availability check via natural language.
  * `[PASS]` Safe execution of financial summary for authorized Manager.
  * `[PASS]` Clarification prompt when availability request lacks apartment or date.
  * `[PASS]` Clarification prompt when booking request lacks guest details.
  * `[PASS]` RBAC denial when Receptionist queries financial summaries.
  * `[PASS]` RBAC denial when Staff queries arrivals.
  * `[PASS]` RBAC denial when Staff attempts reservation creation.
  * `[PASS]` Cross-property boundary defense when Receptionist specifies Property 2.
  * `[PASS]` Adversarial prompt injection defense (`Security Notice`).
  * `[PASS]` SQL injection command rejection.
  * `[PASS]` Script tag / XSS syntax rejection.
  * `[PASS]` Consequential action two-phase commit proposal (`replyType: CONFIRMATION_REQUIRED`).
  * `[PASS]` Successful confirmation execution using single-use token.
  * `[PASS]` Prevention of confirmation replay (`HTTP 409 Conflict`).
  * `[PASS]` Proposal cancellation without side effects.
  * `[PASS]` Sensitive data scrubbing (no `auth_code` in responses).

### 2. Phase 12A Automation Engine Regression Suite (`backend/tests/automationEngine.test.js`)
* **38 tests passed, 0 failed, 0 skipped (100% pass rate).**

### 3. Full Backend Regression Suite (`npm test -- --runInBand --forceExit`)
* **Test Suites:** 34 passed, 34 total (100%).
* **Tests:** 353 passed, 0 failed, 0 skipped, 353 total (100%).
* **Duration:** 47.15 seconds.

### 4. Frontend Production Build (`npm run build`)
* **Vite v6.4.3 production build:** Succeeded with 141 modules transformed in 2.18s with 0 errors.

---

## 7. Outstanding Limitations & Future Roadmap

1. **Intent Resolver Expansion:** The current intent resolver is deterministic and rule-based. It supports the 6 registered actions with high accuracy and low latency. If an LLM is integrated in future phases, `intentResolver.js` can be substituted with an LLM function-calling client while preserving the exact same `assistant.service.js` gateway contract.
2. **Multi-Turn Entity Memory:** While the assistant handles clarification requests (e.g. asking for missing fields), complex multi-turn context retention across unrelated topics is intentionally omitted to maintain strict stateless security.
3. **Multi-Property Queries for Admins:** Global multi-property arrivals/departures default to the active property selected in the Topbar unless the caller is an Administrator with "All Properties" selected.
