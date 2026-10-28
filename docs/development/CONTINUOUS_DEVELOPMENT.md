# BFA Continuous Development Architecture & 10-Step Operational Cycle

## 1. Architectural Philosophy

Continuous Development within the BFA Apartments Management System is engineered as a persistent, sovereign capability integrated directly into the core application and in-app assistant. It guarantees that new business requirements, financial controls, and regulatory remediations can be planned, verified, and audited with zero mock data, zero simulated statuses, and strict protection of production invariants.

### Non-Negotiable Invariants
1. **Production-First Ground Truth**: Every capability must bind to real database tables, authentic REST controllers, and live frontend views. Mocking or decorative UI stubs are strictly prohibited.
2. **Strict Git Index & Workstream Isolation**: Independent workstreams (such as the public landing page and website assets) and pre-existing staged files must remain strictly isolated and protected from accidental mutation.
3. **Role-Based Security Boundary**: Capabilities are protected by multi-tier RBAC (`SUPER_ADMIN`, `ADMIN`, `OWNER`, `MANAGER`) at both HTTP gateway and domain service layers.
4. **Immutable Audit Trail**: All mutations must record the actor identity, client IP, action code, and before/after metadata snapshots.

---

## 2. The Authoritative 10-Step Development Cycle

When an operational improvement, feature enhancement, or defect remediation is initiated, it must traverse the canonical 10-step BFA cycle:

```
 [1. Baseline Discovery] ──► [2. Safety & Isolation] ──► [3. Domain Logic] ──► [4. RBAC Authorization]
                                                                                        │
                                                                                        ▼
 [8. Automated Tests] ◄── [7. Layout Inspection] ◄── [6. View & Binding] ◄── [5. Audit Logging]
          │
          ▼
 [9. Visual QA Screenshots] ──► [10. Development Register & Release Gate Sign-Off]
```

### Step 1: Baseline Discovery & Schema Inspection
- Inspect the live MariaDB database tables, foreign keys, active records, and schema migrations (`schema_migrations`).
- Verify existing service contracts, routes, and client APIs to prevent duplicate or conflicting architectural implementations.

### Step 2: Safety & Isolation Constraints
- Audit Git working tree and index status (`git status --short`).
- Confirm pre-existing staged files and separate workstreams (e.g. `LandingPage.jsx`, landing assets, `about.css`, `contact.css`) are preserved and excluded from edits.

### Step 3: Domain Logic & Service Architecture
- Author or update backend service methods with strict input validation (Zod schemas), transaction boundaries (`conn.beginTransaction()`, `conn.commit()`, `conn.rollback()`), and foreign key integrity.
- Zero fake data, zero hardcoded mock constants.

### Step 4: RBAC & Authorization Matrix
- Protect all newly created API routes with standard JWT authentication and explicit role verification (`authenticateToken`, `requireRoles(...)`).

### Step 5: Immutable Audit Logging
- Integrate `AuditService.record()` for every state mutation, capturing actor ID, actor email, actor role, IP address, user agent, action code, and sanitized diff snapshots.

### Step 6: Frontend View & Reactive State Binding
- Connect UI views to authentic API endpoints via `frontend/src/services/api.js`.
- Provide loading skeletons, empty states, and toast notifications.

### Step 7: Responsive Layout & Mobile Parity
- Ensure layout fluidity across Desktop (1280x800) and Mobile (390x844).
- Verify 0 horizontal scrolling, clean flex wrapping, and accessible touch targets.

### Step 8: Automated Regression Testing
- Write comprehensive integration tests in Jest covering happy paths, boundary constraints, unauthorized role rejections (`403 Forbidden`), and transaction rollbacks.

### Step 9: Visual QA Inspection
- Execute headless browser audits via Playwright to generate full-viewport desktop and mobile screenshot artifacts.
- Verify typography, color contrast, table wrapping, and chart rendering.

### Step 10: Development Register & Release Gate Review
- Catalog completed features in `docs/development/DEVELOPMENT_REGISTER.md`.
- Update release gates, automated test counts, and migration verification tallies.

---

## 3. In-App Assistant Continuous Development Protocol

The in-app Operations Assistant is equipped with Continuous Development capabilities available exclusively to authorized leadership roles (`SUPER_ADMIN`, `ADMIN`, `OWNER`, `MANAGER`):

### Supported Actions
- `dev.get_register`: Retrieves the live BFA Development Register, release baseline version (`1.0.0-rc2`), automated test metrics, and the status of all 4 release gates.
- `dev.get_system_status`: Inspects live database latency, applied migrations count (`23/23`), Node runtime memory, and active subsystem telemetry.
- `dev.plan_task`: Generates a custom 10-step implementation plan for any proposed feature or improvement, tailored to its domain category and priority.

### Security Guarantees
- **Adversarial Input Rejection**: Rejects SQL injection, prompt override patterns (`ignore all instructions`), and unauthorized privilege escalation attempts (`ADVERSARIAL_REJECTED`).
- **Zero Dynamic Execution**: The assistant only executes registered, schema-validated actions. It cannot execute arbitrary code or bypass database safety constraints.

