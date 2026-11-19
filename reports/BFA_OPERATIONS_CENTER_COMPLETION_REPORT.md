# BFA Operations Control Center — Task 3 Completion Report

**Current access policy:** SUPER_ADMIN-only. The historical Task 4 sections below describe the earlier three-role policy and are superseded by the follow-up access restriction at the end of this report.

**Implementation status:** IMPLEMENTED with explicit probe and backup-provider limitations. The page at `/app/operations` now loads its OCC data in the local authenticated ADMIN session. Some subsystems remain UNKNOWN because no health probe exists; backup generation is unavailable for the active PostgreSQL engine.

## Requirements and preserved work

- **IMPLEMENTED** — continued the existing Operations Center and the prior Tasks 1–2 work; no replacement dashboard or database migration execution was introduced.
- **VERIFIED** — the documented role boundary is SUPER_ADMIN and ADMIN for administration, OWNER for restricted read-only visibility, and denial for OPERATIONS_MANAGER, MANAGER, RECEPTIONIST, STAFF and AGENT.
- **IMPLEMENTED** — overview failures display an error state instead of filling the dashboard with misleading zero counts. Live page errors found during implementation (including an Owner-branch variable error) were corrected.

## Operational System Flow

- **IMPLEMENTED** — the Flow tab displays the BFA company → property → apartment/unit → reservation → guest hierarchy from `docs/ARCHITECTURE.md`.
- **IMPLEMENTED** — interactive module nodes show dependency direction from the actual backend module registry, route, purpose, activation configuration, role list and core protection. Selecting a module opens detail information and explicitly reports missing module-specific health probes as UNKNOWN.
- **IMPLEMENTED** — the tab includes a status legend and the live subsystem probe list with last-check timestamp. It does not infer health from a module's enabled flag.
- **PARTIALLY VERIFIED** — live ADMIN selected a module and the details rendered. The final interactive dependency-flow enhancement received a production build, but has not yet been re-clicked in the browser.
- **BLOCKED** — API/service health and last-success timestamps per business module, plus accounting, reports, JWT runtime and Socket.IO probes are not provided by backend health APIs. Those appear UNKNOWN with explanations instead of invented results.

## User Governance and role experience

- **IMPLEMENTED** — governance uses real overview counts and role distribution; ADMIN and SUPER_ADMIN receive the individual user directory, while OWNER receives no user-level records. Passwords, hashes and tokens are not returned by the OCC directory.
- **IMPLEMENTED** — governance reads available roles/capabilities and access overrides from the existing access-control services, and exposes the existing Access Control management page. Pending requests are requested for SUPER_ADMIN only.
- **VERIFIED** — live ADMIN observed 7 users and 7 active users across the configured roles; capability and override data loaded. No access overrides were reported in that session.
- **PARTIALLY VERIFIED** — ADMIN page rendering and backend denied-role tests passed. SUPER_ADMIN and OWNER browser sessions were not available for end-to-end UI verification; OWNER read-only visibility and user-record suppression are implemented in the page.
- **NOT IMPLEMENTED** — no second role-management system or new approval policy was created. Role and capability changes remain in the existing governance interfaces.

## Module registry and controls

- **VERIFIED** — backend registry returns the 18 documented module definitions; live page displays all 18 and their category, roles, dependencies, activation state and protection.
- **IMPLEMENTED** — the seven documented protected modules remain locked. Non-core module toggles require a reason, respect dependent-module constraints, use the existing audit path and show backend outcomes. ADMIN/SUPER_ADMIN write controls are hidden from OWNER.
- **TESTED** — API authorization tests confirm denied roles cannot read the migration catalog and OWNER cannot call OCC settings, module-toggle or backup write endpoints (403).
- **PARTIALLY VERIFIED** — no successful module toggle was executed against the shared live database. The authorized write success path and audit persistence are not verified in an isolated database.

## Health, telemetry and diagnostics

- **VERIFIED** — fixed the PostgreSQL-incompatible warning query and PostgreSQL aggregate alias handling that caused OCC API failures. Live local page no longer showed the prior generic Operations Error and false degraded banner.
- **VERIFIED** — active API/database checks report healthy where probed; unknown subsystems keep overall page health at “Health Partially Known” rather than false HEALTHY or false DEGRADED.
- **IMPLEMENTED** — overview loading/error handling, telemetry refresh, real subsystem explanations and warning data render from the backend response.
- **BLOCKED** — dedicated active probes do not exist for runtime JWT validation, accounting integrity, report compilation or Socket.IO. These remain UNKNOWN. This is a known monitoring coverage gap.

## Backups and migrations

- **VERIFIED** — live migration catalog matched active PostgreSQL migration files to the database ledger: 31 applied, 0 pending, IN_SYNC. It is read-only and does not run migrations.
- **IMPLEMENTED** — the page reads actual local backup artifacts. The live page showed 5 SQL files; their originating engine, content integrity and restorability could not be confirmed.
- **BLOCKED** — PostgreSQL snapshot generation is not configured (`pg_dump` provider unavailable). The page explains this and does not offer a misleading successful snapshot action. MySQL-specific generation is guarded from use on PostgreSQL.
- **NOT IMPLEMENTED** — migration execution, restore execution, migration history edits and recovery actions remain outside the OCC controls.

## Continuous Development and design

- **IMPLEMENTED** — the existing `dev.get_register`, `dev.get_system_status` and `dev.plan_task` automation actions are wired into the page with loading, error, form validation and result output.
- **VERIFIED** — the live Continuous Development tab loaded actual register content from `docs/development/DEVELOPMENT_REGISTER.md`, displaying four release gates and registered tasks. A bad relative path was corrected.
- **IMPLEMENTED** — the fabricated task/gate output was removed; system status reflects actual action response and its telemetry coverage.
- **IMPLEMENTED** — improved health header, live data counts, diagnostics states, flow hierarchy/dependency presentation, governance tables, migration status and backup limitation messaging within existing BFA styling.
- **PARTIALLY VERIFIED** — desktop local browser was used for functional checks. Mobile/tablet breakpoints and the final visual layout at narrow viewport sizes were not checked.

## Verification results

- **TESTED** — frontend `npm run build`: passed (Vite transformed 2,330 modules).
- **TESTED** — targeted backend Jest run: 3 suites, 8 tests passed (`operationsMigrationCatalog`, `operationsAuthorization`, `continuousDevelopmentRegister`).
- **VERIFIED** — authenticated local ADMIN page displayed 18 modules, 7 users, PostgreSQL migration sync, partially known health and the populated development register.
- **NOT VERIFIED** — successful write-path persistence, audit records after writes, separate SUPER_ADMIN/OWNER browser sessions, and mobile responsiveness.
- **NOT RUN** — broad OCC write-based regression suite, because it can mutate the configured database or create actual backup artifacts. The configured environment is not an isolated disposable test database.

## Relevant implementation files

- `frontend/src/pages/portal/OperationsPage.jsx`
- `frontend/src/services/api.js`
- `backend/src/modules/system/operationsControl.service.js`
- `backend/src/modules/system/system.controller.js`
- `backend/src/modules/system/system.routes.js`
- `backend/src/modules/automation/actions/dev.get_register.js`
- `backend/tests/operationsMigrationCatalog.test.js`
- `backend/tests/operationsAuthorization.test.js`
- `backend/tests/continuousDevelopmentRegister.test.js`

## Task 4 — access restrictions, governance and planner

- **IMPLEMENTED** — removed the Development Register panel and its OCC fetch. The documented register action remains available in the wider development system.
- **IMPLEMENTED / TESTED** — `dev.get_system_status` is SUPER_ADMIN-only through the automation action policy, so direct automation and assistant execution are subject to the same backend role check. The OCC requests system status only for SUPER_ADMIN.
- **IMPLEMENTED / TESTED** — the existing `dev.plan_task` action now accepts category, priority, expected outcome and implementation context with length limits, includes the supplied planning details in its response, and identifies task text as untrusted input. SUPER_ADMIN and ADMIN may use it; OWNER and other roles are denied. No separate task engine was added.
- **IMPLEMENTED / TESTED** — Modules & Toggles, Backups & Migrations, migration catalog, module toggle, and backup creation are SUPER_ADMIN-only. The shared overview omits module registry, backup inventory and migration fields for ADMIN/OWNER; it also skips the corresponding reads. ADMIN/OWNER cannot retrieve these fields through the overview endpoint.
- **IMPLEMENTED / TESTED** — the general `/system/info` endpoint includes its module list only for SUPER_ADMIN. The general health endpoint returns migration counts only to SUPER_ADMIN. ADMIN, OWNER and unauthenticated deployment probes retain connection health without migration counts.
- **IMPLEMENTED** — removed the Audit Trail tab and its tab-specific fetch/table. Governance history still uses a filtered query against the existing global audit service; ordinary login/logout entries are excluded. The global Audit Trail page and audit logging remain intact.
- **IMPLEMENTED** — User Governance now shows live account totals/status, role distribution (including zero-count roles for ADMIN), role capability summaries, capability switches, access overrides, SUPER_ADMIN pending requests, filtered governance history, and an ADMIN/SUPER_ADMIN user-details modal with account status, role permissions and property scope. OWNER receives only role/user summary counts and no individual user records or capability detail.
- **VERIFIED** — local ADMIN browser displayed 7 registered/active users, all seven role groups, 65 capabilities and zero overrides. User details opened successfully. The rendered tabs for ADMIN were Health, Flow, Governance, Settings and Development; Modules, Backups/Migrations and Audit were absent. Governance history loaded from the audit service; the final server filter excluding routine login/logout records is covered by a backend unit test.
- **VERIFIED** — local ADMIN used the redesigned planner form and received the existing ten-step plan with submitted category, priority, expected outcome and context. Development Status was absent for ADMIN.
- **IMPLEMENTED** — updated `docs/operations/OPERATIONS_CONTROL_CENTER.md` to reconcile its previous broad ADMIN/OWNER policy with the Task 4 access matrix.

### Task 4 authorization and verification

- **TESTED** — backend frontend build: passed (Vite transformed 2,330 modules).
- **TESTED** — six targeted backend suites passed, 35 tests total: migration catalog, authorization, overview redaction, development register preservation, governance audit filter, and OCC integration regression.
- **TESTED** — Admin/Owner direct requests to migration, module and backup endpoints are denied; Owner settings and development actions are denied; Admin system-development status is denied while Admin planning is allowed; other non-OCC roles remain denied.
- **TESTED** — Admin/Owner overview projections contain no modules, backups or migration data. Owner overview contains summary counts but no user records or role capability map.
- **TESTED** — Aiven-backed integration suite performed read-only overview/diagnostic checks and confirmed the PostgreSQL backup request fails closed because no `pg_dump` provider is configured. No module setting changed, backup was created, or migration was run by the test suite.
- **PARTIALLY VERIFIED** — the local browser was authenticated as ADMIN; a separate SUPER_ADMIN and OWNER browser UI session was unavailable. SUPER_ADMIN data and boundaries are covered by backend integration tests, while OWNER privacy projections are covered by service tests.
- **NOT VERIFIED** — successful Super Admin module-toggle persistence and audit behavior remain deliberately untested because the configured Aiven database is not an isolated write-test database. The Task 4 browser planner smoke test did invoke the existing automation action from the connected local app; that action records its normal audit event. This created only the expected audit record, not operational test data. Future write-path UI smoke tests should use an isolated database.

## Final role-based access verification

This final verification follows the Task 4 matrix: SUPER_ADMIN receives the full center, ADMIN receives the documented administrative subset, OWNER receives read-only health/flow and aggregate governance summaries, and operational/staff roles remain denied. No full-page SUPER_ADMIN-only change was made.

### Confirmed defects and fixes

- **VERIFIED / FIXED** — OWNER could directly call shared access-control endpoints to read full capability and override records, list pending access requests, review requests, and submit capability changes despite the OCC's read-only summary policy. The capability, override, update, approval-list, and approval-review routes now deny OWNER. Approval reads/reviews are SUPER_ADMIN-only; the service-level approval-review guard now matches.
- **VERIFIED / FIXED** — the operational capability-check endpoint returned the underlying capability and override records. Its response now exposes only the `allowed` result.
- **VERIFIED / FIXED** — ADMIN capability responses also included pending approval counts, reasons, and IDs, and OWNER could see override request notifications. Pending request fields are now projected only for SUPER_ADMIN, and the OWNER notification feed hides capability approvals; new internal request notices route to SUPER_ADMIN.
- **VERIFIED / FIXED** — the OWNER Governance tab fetched and displayed actor-level audit history. It now shows only aggregate governance summaries and skips the audit-history request.
- **VERIFIED / FIXED** — OWNER could reach the detailed Access Control Policies page through the application route/navigation. The frontend route, navigation registry, and sidebar now limit that page to ADMIN and SUPER_ADMIN.
- **VERIFIED** — all discovered access-control defects are fixed and the targeted regression run passes with no remaining failures.

### Role-by-role results

- **SUPER_ADMIN — VERIFIED (backend)** — authenticated overview and system module/migration diagnostics succeed; module, backup and migration data remain available. Development system status executes for this role. Pending-request success and review authorization are verified with isolated controller/service mocks. The authorized backup request fails closed because the PostgreSQL backup provider is unavailable; no backup was created. Successful module-state mutation was intentionally not attempted against Aiven.
- **ADMIN — VERIFIED (backend and browser)** — overview and permitted diagnostics succeed without module, backup or migration data. ADMIN can use task planning, but direct access to migrations, module/backup controls, system development status, and pending approvals is denied. The local authenticated ADMIN page displayed Health, Flow, Governance, Settings, and Development tabs. Detailed governance and planner rendering had also been checked in the earlier Task 4 browser smoke test.
- **OWNER — VERIFIED (backend projections and direct API denial)** — overview returns permitted aggregate counts without users, role capability detail, modules, backups, or migrations. Direct capability/override reads, capability updates, pending request reads/reviews, capability approval notifications, actor-level OCC audit history, module/backup actions, settings writes, and development actions are denied. The public capability check returns only an access boolean.
- **OPERATIONS_MANAGER, MANAGER, RECEPTIONIST, STAFF, AGENT — VERIFIED (backend denial)** — direct OCC overview requests are denied; restricted migration catalog requests are denied. The client route is guarded by the documented three-role allowlist; these roles were not individually browser-tested.
- **Unauthenticated caller — VERIFIED (backend)** — overview and restricted system/governance endpoints return HTTP 401.

### Frontend and browser verification

- **VERIFIED** — current local ADMIN browser session loaded `/app/operations` without an authorization error and showed exactly the five ADMIN-authorized tabs. The page remained functional and telemetry rendered.
- **VERIFIED** — frontend `npm run build` passed; Vite transformed 2,330 modules.
- **NOT VERIFIED** — separate SUPER_ADMIN and OWNER browser sessions were not available. Their UI layouts were not claimed as browser-verified; backend role projections and access boundaries were tested.
- **NOT VERIFIED** — browser direct-navigation denial for each unauthorized role was not exercised. The React `ProtectedRoute` allowlist and backend endpoint enforcement were inspected/tested independently.

### Backend authorization and mutation safety

- **TESTED** — nine targeted Jest suites passed: 46 tests, 0 failed. Suites: `operationsMigrationCatalog`, `operationsAuthorization`, `operationsOverviewAccess`, `continuousDevelopmentRegister`, `auditGovernanceFilter`, `operationsControlCenter`, `accessGovernanceAuthorization`, `accessCapabilityProjection`, and `ownerNotificationProjection`.
- **TESTED** — coverage includes SUPER_ADMIN/ADMIN/OWNER overview access, owner data redaction, ADMIN/OWNER restricted API denials, all named operational roles denied, 401 unauthenticated calls, direct module/backup/migration and development-action access, capability/override reads, approval listing/review, and capability response redaction.
- **VERIFIED** — the Aiven-backed checks in the OCC integration suite were read-only. The authorized backup request failed before file creation because no `pg_dump` provider is configured. Authorization tests mock audit writes. No real backup, migration, module-state change, approval, role change, capability update, or production-data mutation occurred during this verification.
- **VERIFIED** — no browser write action was used for this final verification. The expected audit event from the earlier Task 4 planner smoke remains documented above; this verification added no planner smoke or audit mutation.
- **TESTED** — `git diff --check` completed without whitespace errors (Git emitted only its working-copy line-ending notices).

## Follow-up access policy — SUPER_ADMIN only

The user later clarified that the entire Operations Center page must be available only to SUPER_ADMIN. This policy supersedes the earlier Task 4 role matrix.

- **VERIFIED / IMPLEMENTED** — `/app/operations` is restricted by the React `ProtectedRoute`, and Operations Center navigation/assistant route metadata advertises the page only to SUPER_ADMIN.
- **VERIFIED / IMPLEMENTED** — `/api/v1/system/operations/overview` requires SUPER_ADMIN at the route and service layers. ADMIN, OWNER, OPERATIONS_MANAGER, MANAGER, RECEPTIONIST, STAFF and AGENT receive HTTP 403 before the service performs telemetry or database reads; unauthenticated callers receive 401.
- **TESTED** — nine targeted backend suites passed: 52 tests, 0 failed. The role denial, unauthorized endpoint, sensitive-data projection and Super Admin diagnostics tests passed.
- **TESTED** — frontend production build passed; Vite transformed 2,330 modules.
- **NOT VERIFIED** — no SUPER_ADMIN browser session was available. The new ADMIN/OWNER browser redirect was not exercised; the app route guard was verified in code and backend API denial was exercised by direct requests.
- **VERIFIED** — no backup was created, migration executed, module state changed, approval changed or production data mutated during this follow-up verification. The authorized PostgreSQL backup request continues to fail closed because the provider is unavailable.
