# BFA Apartments Management System — Production Deployment Readiness Checklist

## 1. Executive Summary

This document establishes the pre-production operational readiness gate for the BFA Apartments Management System (Release `1.0.0-rc2`). It specifies the infrastructure verification criteria, security configurations, database migration validation, and stakeholder demonstration protocols required before live commercial traffic is admitted.

---

## 2. Infrastructure & Environment Readiness

### Host Environment & Dependencies
- [x] **Node.js Runtime**: Verified on Node.js v20+ with ES Module and CommonJS compatibility.
- [x] **Process Supervision**: Production process managed via PM2 / Windows Service daemon with auto-restart on unhandled exceptions.
- [x] **MariaDB Database Server**: Version 10.4.32+ running on Port 3306 with UTF8MB4 collation.
- [x] **Environment Secrets Isolation**: `.env` configuration verified; database passwords, JWT secrets, and API keys excluded from version control.
- [x] **Frontend Static Assets**: Vite production build verified (`dist/`, 0 errors, 0 warnings).

### Database Schema & Persistence
- [x] **Applied Migrations**: All 23 schema migrations applied and cataloged in `schema_migrations`.
- [x] **Double-Entry GL Ledger**: Tables `accounting_accounts`, `accounting_journal_entries`, `accounting_journal_lines`, `accounting_periods`, `accounting_posting_bridge` active and verified.
- [x] **Point-in-Time Backups**: Verified snapshot backups present in `backups/` directory; automated manual snapshot capability verified.

---

## 3. Security, Authentication & Access Control

### Identity & Sovereignty Verification
- [x] **Super Administrator Sovereign**: User ID 1 (`olawale@gmail.com`) confirmed as the sole global Super Administrator.
- [x] **Owner Executive Sovereign**: User ID 7 (`owner@bfa.ng`) confirmed as the sole executive owner with read-only financial audit visibility.
- [x] **Role Hierarchy Enforcement**: 7 distinct roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `AGENT`, `OWNER`) protected at both API route middleware and client navigation guards.
- [x] **Tenant Scoping & Property Isolation**: Multi-tenant property filters prevent unauthorized cross-property data access for front desk and operations staff.
- [x] **Adversarial Assistant Guards**: In-app Operations Assistant verifies user permissions for every tool call and strictly rejects adversarial prompt injections and dynamic SQL requests (`ADVERSARIAL_REJECTED`).

---

## 4. Pre-Deployment Sign-Off Gates

Before cutting over to live production, the following 4 release gates must be formally recorded:

1. **Gate 1 — Chart of Accounts Approval**:
   - Status: `PENDING_FINANCE_SIGN_OFF`
   - Requirement: Official sign-off by CFO or Sovereign Owner on initial chart of accounts opening balances.
2. **Gate 2 — Test Data Purge Policy**:
   - Status: `PENDING_POLICY_DECISION`
   - Requirement: Decision whether to purge synthetic employee evaluation records (IDs 37–40) or preserve them for executive demonstrations.
3. **Gate 3 — Staged Migrations Git Commit**:
   - Status: `READY_FOR_COMMIT`
   - Requirement: 35 pre-existing staged files in Git index ready for tagged release commit (`v1.0.0`).
4. **Gate 4 — Public Landing Page Merge**:
   - Status: `IN_COORDINATION`
   - Requirement: Synchronization of public landing page marketing assets with core application portal.

---

## 5. Owner Demonstration & Verification Runbook

When demonstrating the system to executive owners and stakeholders:

1. **Operations Telemetry**:
   - Navigate to `/app/operations`.
   - Show live health metrics (subsystem statuses, DB latency < 10ms, 23/23 migrations in sync).
2. **Double-Entry General Ledger & Trial Balance**:
   - Navigate to `/app/financial`.
   - Inspect Trial Balance summary and verify total debits equal total credits.
3. **Employee Competency Matrix**:
   - Navigate to `/app/performance`.
   - Demonstrate the competency radar chart and quarterly evaluation breakdown.
4. **Continuous Development In-App Assistant**:
   - Open the Operations Assistant modal via the bottom-right action trigger.
   - Click `"📋 Development Register"` to inspect the live release status.
   - Click `"🔍 System Diagnostics"` to trigger real-time health telemetry.
   - Click `"📝 Plan Improvement"` to generate an authentic 10-step continuous development implementation plan.

