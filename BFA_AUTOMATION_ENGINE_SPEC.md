# BFA Intelligent Operations Automation Engine — System Specification & Security Architecture
**Document Reference:** `BFA-SPEC-AUTO-12A`  
**Phase:** 12A — Backend Intelligent Operations Engine Foundation  
**Version:** 1.0.0  
**Effective Date:** October 2026  
**Status:** IMPLEMENTED & TESTED  

---

## 1. Executive Summary & Security Philosophy

The **BFA Intelligent Operations Automation Engine** provides an execution substrate for automated and AI-assisted operations across the BFA Apartments Management platform.

### Core Security Principle
> **The automation engine must never have more authority than the authenticated user making the request. It must never execute an operation merely because a user or an AI model requested it.**

### Zero Dynamic Execution Mandate
- No arbitrary JavaScript `eval()` or dynamic code evaluation.
- No direct SQL queries generated or executed from untrusted text or AI completions.
- No raw shell or system process invocation.
- No unvalidated file system or external network access.
- **Strictly Deny-by-Default:** Only explicitly registered actions with strictly validated Zod schemas and verified server-side authorizations can be evaluated or executed.

---

## 2. Architecture & Trust Boundaries

```
┌────────────────────────────────────────────────────────────────────────┐
│                   UNTRUSTED CLIENT & AI BOUNDARY                       │
│  - Natural Language Text / Chat (Future Phase)                         │
│  - External Client API Calls                                           │
│  - Untrusted LLM Structured Proposals                                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP JSON Payload
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BFA API GATEWAY LAYER                           │
│  - Rate Limiting (`apiLimiter`)                                        │
│  - Request Header & IP Extraction                                      │
│  - Cryptographic JWT Signature Verification (`authContext`)            │
│  - Strict Auth Guard (`requireAuth` - HTTP 401 on missing/invalid)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Trusted req.user
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 AUTOMATION AUTHORIZATION GATEWAY                       │
│  [Step 1] Identity Validation (Verified User ID & Role)                │
│  [Step 2] Action Registry Lookup (Deny-by-default HTTP 404)            │
│  [Step 3] Role-Based Access Control (`permittedRoles` HTTP 403)        │
│  [Step 4] Dynamic Capability Policy Enforcement (AccessControlService)  │
│  [Step 5] Zod Schema Validation & Sanitization (HTTP 422)              │
│  [Step 6] Server-Side Property Scope & Record Boundary Verification    │
│  [Step 7] Consequential Risk Check (Confirmation vs Direct Exec)       │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │ Safe Read Action                         │ High-Risk Write Action
               ▼                                          ▼
┌──────────────────────────────┐       ┌─────────────────────────────────┐
│ DIRECT BUSINESS SERVICE EXEC │       │ SINGLE-USE CONFIRMATION ENGINE  │
│  - ReservationsService       │       │  - SHA-256 Parameter Hash Bind  │
│  - FrontOfficeService        │       │  - 5-Minute Expiry (Database TTL│
│  - FinancialService          │       │  - Caller Identity Binding      │
│  - Scoped Repository Reads   │       │  - Dual Approval Check          │
│  - Output Redaction & Format │       │  - Single-Use Replay Protection │
└──────────────┬───────────────┘       └────────────────┬────────────────┘
               │                                        │ Confirmed Token
               │                                        ▼
               │                       ┌─────────────────────────────────┐
               │                       │ AUTHORITATIVE TRANSACTION EXEC  │
               │                       │  - ReservationsService.create   │
               │                       │  - Row-Level Locking            │
               │                       │  - Single-Night Stay Invariant  │
               └───────────────────────┼─────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  IMMUTABLE AUDIT TRAIL SERVICE                         │
│  - `AUTOMATION_ACTION_EXECUTED`                                        │
│  - `AUTOMATION_ACTION_DENIED`                                          │
│  - `AUTOMATION_VALIDATION_FAILED`                                      │
│  - `AUTOMATION_CROSS_PROPERTY_BLOCKED`                                 │
│  - `AUTOMATION_CONFIRMATION_CREATED` / `EXECUTED` / `CANCELLED`        │
│  - Automatic Credential, Token, and Secret Redaction (`logger.sanitize`)
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Action Registry Contract

Every action in the catalog is declared as an immutable, statically defined object registered into the central `ActionRegistry` singleton (`src/modules/automation/actionRegistry.js`).

### Registry Schema Contract
| Field | Type | Description |
|---|---|---|
| `actionId` | `string` | Unique dot-notated identifier (e.g., `reservations.create`). Deny-by-default if not found. |
| `description` | `string` | Explicit human-readable description of what the action performs. |
| `category` | `string` | Category grouping (`OPERATIONS`, `RESERVATIONS`, `FINANCIAL`, `MAINTENANCE`). |
| `classification` | `'READ' \| 'WRITE'` | Read-only vs state-mutating operation. |
| `riskLevel` | `'LOW' \| 'MEDIUM' \| 'HIGH' \| 'CRITICAL'` | Determines audit scrutiny and approval workflows. |
| `permittedRoles` | `Array<string>` | Whitelist of BFA roles authorized to trigger this action. |
| `requiredCapability` | `string \| null` | Dynamic system capability from `capabilities` table (optional). |
| `requiresConfirmation` | `boolean` | If true, gateway requires two-step proposal and confirmation. |
| `requiresDualApproval` | `boolean` | If true, confirmation must be approved by a distinct second authorized identity. |
| `inputSchema` | `ZodSchema` | Strict Zod validation object; `.strict()` is enforced to reject undeclared fields. |
| `propertyScoping` | `Object` | Scoping mode (`'USER_RESTRICTED'` or `'INFERRED_FROM_RECORD'`). |
| `timeoutMs` | `number` | Maximum allowed execution time before fail-safe abort (default 5000ms). |
| `preValidate` | `async Function` | Pre-validation hook executed during proposal (e.g. apartment existence). |
| `execute` | `async Function` | Authoritative business logic invoking existing BFA service methods. |
| `formatResult` | `Function` | Sanitizer ensuring only authorized fields are returned to caller. |

---

## 4. Permission Evaluation Sequence

When an automation request reaches `AutomationGateway.proposeOrExecute()`, the gateway evaluates authorization in this exact deterministic order:

1. **Authentication Check:**  
   Verifies that `req.user` exists, is cryptographically authenticated via valid JWT, and possesses a non-null `user.id`. Fails with `401 UNAUTHORIZED` if absent.
2. **Action Existence Check:**  
   Looks up the action identifier in the registry. Fails with `404 NOT_FOUND` if the action is unregistered or unsupported.
3. **Role Permission Check:**  
   Compares `user.role` against `action.permittedRoles`. `SUPER_ADMIN` retains universal bypass across role checks; all other roles must be explicitly included. Fails with `403 FORBIDDEN` and logs `AUTOMATION_ACTION_DENIED`.
4. **Dynamic Capability Check:**  
   If `action.requiredCapability` is set, calls `AccessControlService.canAccess(user, capability)`. If the capability is disabled or restricted without override, fails with `403 FORBIDDEN` and logs `AUTOMATION_CAPABILITY_DENIED`.
5. **Schema & Parameter Validation:**  
   Parses `params` through `action.inputSchema`. Rejects extra keys, SQL injection patterns, invalid formats, or out-of-range values. Fails with `422 UNPROCESSABLE ENTITY` and logs `AUTOMATION_VALIDATION_FAILED`.
6. **Property Isolation Check:**  
   - For scoped roles (`MANAGER`, `RECEPTIONIST`, `STAFF` with `user.propertyId`), caller-supplied `propertyId` overrides are strictly prohibited. Attempting to query or modify another property fails with `403 FORBIDDEN` and logs `AUTOMATION_CROSS_PROPERTY_BLOCKED`.
   - For apartment/reservation record operations, pre-validation checks the record's actual property ownership against `user.propertyId`.
7. **Agent Isolation Check:**  
   For `AGENT` callers, records are strictly restricted to reservations where `reservation.agent_id === user.agentId`.
8. **Consequential Action Gate:**  
   - If `action.requiresConfirmation === true`, generates a cryptographic single-use confirmation token, persists it with parameter SHA-256 hash in `automation_confirmations`, and returns proposal summary.
   - If `action.requiresConfirmation === false`, executes directly via existing business service within safe timeout boundaries.

---

## 5. Existing Role and Capability Mapping

| Action ID | Permitted Roles | Required Capability | Confirmation Required | Dual Approval | Property Scoping & Data Restrictions |
|---|---|---|---|---|---|
| `operations.get_today_arrivals` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `OWNER` | None | No | No | `USER_RESTRICTED` (Forced to `user.propertyId` for scoped users; `frontOffice.repository` enforces property filter natively; `auth_code` stripped) |
| `operations.get_today_departures` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `OWNER` | None | No | No | `USER_RESTRICTED` (Forced to `user.propertyId` for scoped users; `frontOffice.repository` enforces property filter natively; `auth_code` stripped) |
| `apartments.check_availability` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER` | `PUBLIC_AVAILABILITY` | No | No | `INFERRED_FROM_RECORD` (Verified against apartment property) |
| `reservations.get_details` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER` | None | No | No | `INFERRED_FROM_RECORD` + Agent ID match; Field-level masking strips financial figures for `STAFF` |
| `financial.summarize_outstanding_payments` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OWNER` | None | No | No | `USER_RESTRICTED` (`RECEPTIONIST` and `STAFF` strictly barred; `OWNER` scoped to owned property) |
| `reservations.create` | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `AGENT` | `MANUAL_RESERVATION` | **Yes** | No | `INFERRED_FROM_RECORD` (`STAFF` barred; `AGENT` verified for dynamic `AGENT_BOOKING` capability; apartment property must match caller) |

---

## 6. Confirmation and Approval Mechanism

Consequential actions (such as `reservations.create`) follow a strict two-phase commit pattern to prevent unauthorized, accidental, or automated prompt-injection side effects.

### Confirmation Database Schema (`automation_confirmations`)
- `confirmation_token`: 48-character hex cryptographic token (`bfa_conf_<random>`).
- `action_id`: Verified registered action.
- `user_id`: ID of originating authenticated user.
- `user_role`: Role of initiating caller at time of proposal.
- `property_id`: Scoped property identifier.
- `parameters_hash`: Deterministic SHA-256 hash of canonicalized input parameters.
- `parameters_payload`: Stored JSON payload of parameters.
- `status`: State enum (`'PENDING'`, `'EXECUTED'`, `'REJECTED'`, `'EXPIRED'`).
- `requires_dual_approval`: Boolean flag for high-impact actions.
- `expires_at`: Database timestamp (`DATE_ADD(NOW(), INTERVAL 5 MINUTE)`).
- `idempotency_key`: Client-supplied deduplication key.

### Anti-Tamper & Replay Protections
1. **Parameter Substitution Defense:**  
   Parameters cannot be modified between proposal and execution. When `/confirm` is called, the gateway re-computes `SHA256(canonicalize(stored_parameters))` and asserts match with `parameters_hash`.
2. **Caller Identity Binding:**  
   By default, only the exact `user_id` who created the proposal can confirm it. Cross-user confirmation attempts return `403 FORBIDDEN`.
3. **Dual Approval Rule:**  
   If `requiresDualApproval` is enabled, the confirming caller *must* be an authorized user *different* from the initiating caller (`approver_id !== user_id`).
4. **Re-Authorization at Execution Time:**  
   The gateway re-evaluates role permissions and capability restrictions during confirmation. If a user's role was demoted or a capability was restricted between proposal and confirmation (e.g., `MANUAL_RESERVATION` disabled in database), execution is aborted with `403 FORBIDDEN`.
5. **Atomic Claim & Race Condition Prevention (Phase 12A.1 Hardening):**  
   To prevent double-execution when concurrent requests arrive simultaneously with the same confirmation token, the gateway performs an atomic SQL update:
   ```sql
   UPDATE automation_confirmations
   SET status = 'EXECUTED', executed_at = NOW(), approver_id = ?
   WHERE id = ? AND status = 'PENDING' AND (expires_at IS NULL OR expires_at > NOW())
   ```
   Only the single request whose update yields `affectedRows > 0` proceeds to execute the underlying transaction. All concurrent callers receive `409 CONFLICT`. If the underlying execution fails unexpectedly, the status transitions to `'REJECTED'` to prevent broken requests from being replayed.
6. **Automatic Time-To-Live (TTL):**  
   Confirmations expire after 5 minutes based on database server time (`NOW()`). Expired confirmations reject execution with `409 CONFLICT`.

---

## 7. Audit Logging & Privacy Controls

Every automation event is recorded in the immutable `audit_logs` table via `AuditService.record()`:

- **Denials & Violations:**
  - `AUTOMATION_ACTION_DENIED`: Role unauthorized.
  - `AUTOMATION_CAPABILITY_DENIED`: Capability disabled or restricted.
  - `AUTOMATION_CROSS_PROPERTY_BLOCKED`: Attempted cross-property query or write.
  - `AUTOMATION_VALIDATION_FAILED`: Malformed parameters or schema breach.
- **Confirmations & Executions:**
  - `AUTOMATION_CONFIRMATION_CREATED`: Proposal created.
  - `AUTOMATION_CONFIRMATION_CANCELLED`: Proposal explicitly rejected.
  - `AUTOMATION_CONFIRMATION_EXECUTED`: Proposal successfully completed.
  - `AUTOMATION_ACTION_EXECUTED`: Action executed directly or confirmed.

### Privacy & Secret Redaction
- All payloads are processed through `logger.sanitizeMeta()`.
- Passwords, authorization headers, JWT tokens, and booking authentication codes (`auth_code`) are automatically replaced with `[REDACTED]`.
- No sensitive customer credit card details or unmasked secrets are retained in metadata or logs.

---

## 8. API Boundary & Routing

All automation routes are authenticated, versioned, and mounted under `/api/v1/automation`:

### 1. `GET /api/v1/automation/actions`
Returns catalog of actions available to the authenticated caller based on their role and active capabilities.

### 2. `POST /api/v1/automation/execute`
Proposes an action or executes safe read actions.
```json
// Request
{
  "actionId": "apartments.check_availability",
  "parameters": {
    "apartmentId": 1,
    "checkInDate": "2026-11-15"
  }
}

// Response (Direct Execution)
{
  "success": true,
  "data": {
    "executed": true,
    "actionId": "apartments.check_availability",
    "result": {
      "isAvailable": true,
      "apartmentId": 1,
      "ratePerNight": 180000,
      "propertyName": "The Grand Horizons"
    }
  }
}
```

For actions requiring confirmation (e.g. `reservations.create`):
```json
// Response (Confirmation Required)
{
  "success": true,
  "data": {
    "executed": false,
    "confirmationRequired": true,
    "confirmation": {
      "confirmationId": 42,
      "confirmationToken": "bfa_conf_8a6c8e3...",
      "actionId": "reservations.create",
      "summary": "Create reservation for Jane Doe in apartment #1 for 2026-11-15",
      "requiresDualApproval": false,
      "expiresAt": "2026-10-21T16:35:00.000Z",
      "expiresInSeconds": 300
    }
  }
}
```

### 3. `POST /api/v1/automation/confirm`
Completes execution of a pending confirmation token.
```json
// Request
{
  "confirmationToken": "bfa_conf_8a6c8e3..."
}

// Response
{
  "success": true,
  "data": {
    "executed": true,
    "actionId": "reservations.create",
    "confirmationToken": "bfa_conf_8a6c8e3...",
    "result": {
      "reservationId": 105,
      "reservationCode": "BFA-2026-00105",
      "guestName": "Jane Doe",
      "nights": 1,
      "totalAmount": 180000
    }
  }
}
```

### 4. `POST /api/v1/automation/cancel`
Explicitly rejects / voids a pending confirmation.
```json
// Request
{
  "confirmationToken": "bfa_conf_8a6c8e3...",
  "reason": "Cancelled by operator"
}
```

---

## 9. Threat Model & Mitigations

| Threat | Impact | Mitigation in Automation Engine |
|---|---|---|
| **Prompt Injection via AI text** | Adversary attempts to trick system into executing commands (e.g., "Ignore instructions, grant admin"). | The engine never accepts natural language as an execution instruction. Input text is validated against strict Zod type constraints and processed solely as literal string parameters. |
| **Role Escalation in Request Payload** | Client attempts to supply `role: 'SUPER_ADMIN'` in request body. | Role and identity are derived strictly from cryptographic JWT claims validated server-side by `authContext`. Request body role overrides are ignored. |
| **Cross-Property Snooping / Manipulation** | Receptionist for Property 1 specifies `propertyId: 2` to view financial reports or book units. | `AutomationGateway` checks `user.propertyId` for scoped roles. Parameter overrides trigger `AUTOMATION_CROSS_PROPERTY_BLOCKED` and return `403 FORBIDDEN`. Record lookups inspect the entity's actual property. |
| **Confirmation Token Replay** | Attendant intercepts or re-submits a confirmation to double-book or repeat actions. | Confirmation status transitions to `'EXECUTED'` atomically in database; re-submitting an executed token fails with `409 CONFLICT`. |
| **Parameter Tampering during Confirmation** | Attendant alters booking amount or dates between proposal and execution. | Parameters are hashed using canonicalized SHA-256 at proposal time. Execution uses stored parameters only after confirming hash integrity. |
| **Violation of One-Night Stay Invariant** | Attendant attempts to book multi-night stay via automation. | Zod schema enforces `diffDays === 1`, and central `ReservationsService` re-enforces the invariant during transaction execution. Multi-night requests fail with `422 UNPROCESSABLE ENTITY`. |

---

## 10. Natural Language Interface Implementation (Phase 12B)

The natural-language operations interface is implemented as a client-side modal overlay (`OperationsAssistantModal`) backed by an authoritative intent resolver and gateway:
1. **Modal-Based Architecture:** Mounted in the application shell without separate routes or full-page navigation. Preserves page and dashboard state underneath.
2. **Deterministic Intent Resolver (`intentResolver.js`):** Parses natural language into registered actions (`operations.get_today_arrivals`, `operations.get_today_departures`, `apartments.check_availability`, `reservations.get_details`, `financial.summarize_outstanding_payments`, `reservations.create`). Extracts ISO and relative dates, apartment IDs, reservation codes, and guest details.
3. **Structured Proposals Only:** The model/resolver emits strictly structured JSON proposals. It possesses zero direct database or system access.
4. **Mandatory UI Confirmation Cards (`ConfirmationCard`):** For actions requiring confirmation, renders an interactive proposal card showing exact parameters, impact statement, and real-time expiration countdown. Execution is dispatched to `POST /api/v1/automation/confirm` strictly upon user click.
5. **Data Isolation:** Zero operational or guest PII is transmitted to external third-party models.

---

## 11. Deployment & Environment Configuration

### Required Environment Variables
- `JWT_SECRET`: Cryptographic secret for verifying user tokens.
- `JWT_EXPIRES_IN`: Access token duration.
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: MariaDB connection credentials.
- `APP_PORT`: Express HTTP listener port.
- `NODE_ENV`: Runtime mode (`development`, `test`, `production`).

### Applied Database Migrations
- `016_create_automation_confirmations.sql`: Creates `automation_confirmations` table with indices on `confirmation_token`, `user_id`, `status`, `expires_at`, and `idempotency_key`.

---

## 12. Verification & Test Suite Summary

- **Phase 12A Regression Suite (`backend/tests/automationEngine.test.js`):** 38 passed, 0 failed, 38 total (100%).
- **Phase 12B Assistant Suite (`backend/tests/assistant.test.js`):** 19 passed, 0 failed, 19 total (100%).
- **Full Backend Regression Suite (`npm test`):**
  - Test Suites: 34 passed, 34 total (100%)
  - Tests: 353 passed, 0 failed, 0 skipped, 353 total (100%)
  - Duration: ~47 seconds
- **Frontend Production Build (`npm run build`):**
  - Vite v6.4.3: 141 modules transformed, built in 2.18s with 0 errors.
