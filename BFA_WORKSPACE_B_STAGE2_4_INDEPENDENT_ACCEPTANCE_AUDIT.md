# BFA APARTMENTS MANAGEMENT SYSTEM
# WORKSPACE B — STAGE 2.4 INDEPENDENT ACCEPTANCE AUDIT
## Employee Leave & Absence Management

**Audit Type:** Strict Read-Only Forensic Acceptance Audit  
**Target Workspace:** Workspace B — Internal Workforce & Operations Portal  
**Subject:** Stage 2.4 — Employee Leave & Absence Management  
**Implementation Report Audited:** [`BFA_WORKSPACE_B_STAGE2_4_IMPLEMENTATION_REPORT.md`](file:///c:/xampp/htdocs/BFA/BFA_WORKSPACE_B_STAGE2_4_IMPLEMENTATION_REPORT.md)  
**Audit Date:** November 3, 2026  
**Auditor:** Independent Technical Auditor (Read-Only Mode)  
**Final Verdict:** **CONDITIONALLY ACCEPTED**

---

## 1. Executive Audit Summary

An independent, strictly read-only technical audit of Workspace B Stage 2.4 (Employee Leave & Absence Management) was executed across the frontend application code, backend service contracts, database schemas, automated Puppeteer verification suites, telemetry outputs, and visual evidence.

### Summary of Key Findings
1. **DEF-B09 & DEF-B10 Remediated:** The previously identified API payload misalignments have been completely resolved. Staff leave submissions now correctly transmit `leave_category_id` (HTTP 201), and manager reviews transmit `{ action, notes }` (HTTP 200).
2. **Approval Policy & Delegation Limit:**
   - **Strict Enforcement for $\ge 15$ Days:** Requests exceeding 14 calendar days strictly enforce the Operations Manager delegation ceiling in both frontend UI (disabled approval option, forced escalation button) and backend service (`LeaveService.reviewLeaveRequest` throws HTTP 403 Forbidden).
   - **Routing / Delegation Discrepancy for 6–14 Days (DEF-B11):** Requests between 6 and 14 days are initialized to `status: 'PENDING_ADMIN'` upon submission. However, neither the backend review check (`leave.total_days > 14`) nor the frontend modal blocks an Operations Manager from reviewing and directly approving these requests. As a result, an Operations Manager can approve 6–14 day leave requests, bypassing the initial administrator escalation.
3. **Supporting Document Uploads (DEF-B12):** Employees **cannot** physically upload documents (PDF/JPEG). The frontend renders a text URL input field (`document_url`), and the backend provides no multipart upload endpoint or binary storage for workforce documents.
4. **Pending Leave Withdrawal (DEF-B13):** Employees **cannot** withdraw or cancel a submitted pending leave application. Neither the backend routes/controller nor the frontend UI implements an employee cancellation action.
5. **Interactive Absence Calendar:** The [`AbsenceCalendar.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/components/workforce/AbsenceCalendar.jsx) component successfully delivers dual-mode visualization (7-column Month Grid and chronological Timeline/Agenda) with distinct visual styling for approved versus pending leaves.
6. **Roster & Timesheet Integrity:** Approved leaves successfully trigger automatic cancellation of conflicting scheduled shifts with an audit note, and paid leave hours are properly factored into total payable payroll timesheet hours ($8.00\text{h/day}$).
7. **Responsive & Regression Fidelity:** Zero horizontal overflow ($0\text{px}$) across all 8 enterprise viewports ($320\text{px}$ to $1440\text{px}$). Production build passed cleanly in $6.82\text{s}$. Stages 2.1, 2.2, and 2.3 regression test suites passed 100% ($12/12$ and $17/17$).

---

## 2. Strict Read-Only Authorization & Boundaries

In accordance with mandatory audit restrictions:
- Zero application source files were created, edited, renamed, or deleted.
- Zero test suites or verification scripts were altered.
- Zero database records, tables, migrations, or schemas were modified.
- Zero real leave requests were created, approved, rejected, escalated, or withdrawn during this audit.
- Workspace A (Public Guest Experience) and Workspace C (Backend Infrastructure) remained 100% untouched.
- Git working tree was preserved in its existing state.

---

## 3. Git & Repository Workspace State

A forensic inspection of the Git version control repository established:

- **Current Branch:** `master`
- **Current HEAD Commit:** `3075411a754fcb7801b4b5b023168df2d6d4f4f8`
- **Workspace A Integrity:** Untouched. No modifications to public landing pages or guest booking flows.
- **Workspace C Integrity:** Untouched. No changes to backend controllers, routes, migrations, models, or database tables.
- **Workspace B Modified Files for Stage 2.4:**
  - [`frontend/src/pages/portal/MySchedulePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/MySchedulePage.jsx) (DEF-B09 fix, date range validation, document banner, balance dashboard)
  - [`frontend/src/pages/portal/WorkforcePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/WorkforcePage.jsx) (DEF-B10 fix, 14-day delegation limit, tab switching, absence calendar integration)
  - [`frontend/src/components/workforce/AbsenceCalendar.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/components/workforce/AbsenceCalendar.jsx) (New component: Month Grid and Agenda List views)
  - [`frontend/src/components/ui/Icons.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/components/ui/Icons.jsx) (Added `FileText` SVG icon export)
  - [`frontend/src/styles/layout.css`](file:///c:/xampp/htdocs/BFA/frontend/src/styles/layout.css) (Mobile viewport topbar adjustments)

### Forensic Investigation: Global `layout.css` Modifications
The changes introduced in [`frontend/src/styles/layout.css`](file:///c:/xampp/htdocs/BFA/frontend/src/styles/layout.css) were evaluated for cross-module regressions:
1. `@media (max-width: 768px) { .topbar-assistant-btn span { display: none; } }`:
   - Hides text label "Assistant AI" on mobile/tablet viewports while preserving the assistant icon button.
   - **Impact:** Prevents horizontal header overflow on compact devices across all portal pages without loss of functionality.
2. `@media (max-width: 560px) { .topbar-assistant-btn { display: none; } }`:
   - On screens $\le 560\text{px}$, completely hides the topbar assistant button.
   - **Impact:** Prevents the topbar action icons from exceeding $320\text{px}$ width. Mobile users access assistant features via the navigation menu or desktop viewports.
3. `@media (max-width: 360px) { html, body { overflow-x: hidden; max-width: 100vw; } }`:
   - Confined strictly to minimum-spec devices ($\le 360\text{px}$).
   - **Impact:** Eliminates horizontal scrollbar bounce on ultra-compact devices. Does not alter desktop or tablet viewport behavior.
- **Conclusion:** No regressions outside the leave management screens were observed.

---

## 4. CRITICAL — Approval Policy & Escalation Forensics

The backend service [`backend/src/modules/workforce/leave.service.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/workforce/leave.service.js) was audited to establish the exact interaction between automatic admin routing and the Operations Manager 14-day delegation limit.

### 4.1 Backend Implementation Logic
```javascript
// leave.service.js - submitLeaveRequest (lines 72-73)
status: totalDays > 5 ? 'PENDING_ADMIN' : 'PENDING_MANAGER', // Escalate automatically if > 5 days

// leave.service.js - reviewLeaveRequest (lines 124-127)
const limitDays = leave.delegated_limit_days || 14;
if (leave.total_days > limitDays && action === 'APPROVED') {
  throw new ForbiddenError(
    `Leave request of ${leave.total_days} days exceeds Operations Manager delegated authority limit of ${limitDays} days. This request must be ESCALATED to Administrator.`
  );
}
```

### 4.2 Behavior Across Target Duration Boundaries

| Duration | Initial Submitted Status | Operations Manager UI Treatment | Operations Manager Approval Attempt | Executive Admin Approval | Security / Policy Finding |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **5 Days** | `PENDING_MANAGER` | "Review" button enabled | **Permitted** (HTTP 200). $5 \le 14$ days. | **Permitted** | Standard delegated workflow. Compliant. |
| **6 Days** | `PENDING_ADMIN` | Shows "Awaiting Admin" with "View" button | **Permitted** (HTTP 200). Backend check ($6 > 14$) evaluates false. | **Permitted** | **DEF-B11 Discrepancy:** Initial status is `PENDING_ADMIN`, but Manager can still approve. |
| **14 Days** | `PENDING_ADMIN` | Shows "Awaiting Admin" with "View" button | **Permitted** (HTTP 200). Backend check ($14 > 14$) evaluates false. | **Permitted** | **DEF-B11 Discrepancy:** Maximum manager threshold; bypasses admin review if manager approves. |
| **15 Days** | `PENDING_ADMIN` | Amber warning, "APPROVED" option disabled, "Escalate" button active | **Blocked** (HTTP 403 Forbidden). Backend enforces 14-day ceiling. | **Permitted** | **Strictly Enforced.** Escalation cannot be bypassed. |

### 4.3 Escalation Bypass Analysis (DEF-B11)
- For requests with $6 \le \text{total\_days} \le 14$:
  1. The backend automatically marks the record `status = 'PENDING_ADMIN'`.
  2. However, `reviewLeaveRequest` does NOT assert `if (leave.status === 'PENDING_ADMIN' && isOpsManager) throw new ForbiddenError(...)`.
  3. The frontend modal calculates `exceedsLimit = !isAdmin && totalDays > 14`. For a 6-day leave, `exceedsLimit` is false.
  4. Although a blue info banner is displayed stating *"Awaiting Executive Administrator"*, the Review Determination dropdown permits selecting `Approve Leave` and clicking `Confirm Decision`.
  5. The backend accepts `action: 'APPROVED'` because $6 \le 14$.
  - **Verdict:** An Operations Manager possesses the technical capability to approve 6–14 day leave requests directly, bypassing administrator escalation. For requests of 15+ days, escalation cannot be bypassed.

---

## 5. Supporting Document Upload Audit (DEF-B12)

The prompt mandated an independent evaluation of document upload capabilities:
> *"Determine whether employees can actually upload required supporting documents... A requirement banner is not proof of document upload functionality."*

### 5.1 Inspection of Form Controls & Frontend Validation
In [`frontend/src/pages/portal/MySchedulePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/MySchedulePage.jsx) lines 1155–1168:
```jsx
<div>
  <label className="form-label" style={{ fontSize: '0.75rem' }}>
    Document URL / Cloud Reference Link *
  </label>
  <input
    type="text"
    className="input-field"
    required
    placeholder="e.g. https://storage.bfa.com/medical-certs/cert-2026.pdf or file reference"
    value={leaveForm.document_url}
    onChange={(e) => setLeaveForm({ ...leaveForm, document_url: e.target.value })}
    style={{ width: '100%', fontSize: '0.8rem' }}
  />
</div>
```
- **Control Type:** `<input type="text">` only. There is **no** `<input type="file">`, dropzone, or binary file picker.
- **Client Validation:** Enforces non-empty string when `category.requires_document === true`. No file format (MIME), size, or antivirus validation exists.

### 5.2 Inspection of Backend API & Storage Capabilities
- **Routes:** [`backend/src/modules/workforce/workforce.routes.js`](file:///c:/xampp/htdocs/BFA/backend/src/modules/workforce/workforce.routes.js) contains zero multipart upload routes (`multer` is not mounted on workforce leave routes).
- **Database Schema:** Table `leave_requests` defines column `` `document_url` VARCHAR(255) NULL ``.
- **Reviewer Access:** In [`WorkforcePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/WorkforcePage.jsx) and [`AbsenceCalendar.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/components/workforce/AbsenceCalendar.jsx), the document is exposed as an external hyperlink: `<a href={leave.document_url} target="_blank" rel="noopener noreferrer">`.
- **Verdict:** Employees **cannot** physically upload documents. They can only attach external URL references.

---

## 6. Pending Leave Withdrawal Audit (DEF-B13)

The prompt mandated verifying whether employees can withdraw pending applications:
> *"Determine whether employees can withdraw eligible pending applications. Verify the actual API capability, UI action, permitted statuses and authorization. If not implemented, report it explicitly."*

### 6.1 Backend API Capability
- Inspecting `workforce.routes.js`, `workforce.controller.js`, and `leave.service.js`:
  - No `DELETE /workforce/leave/requests/:id` route exists.
  - No `PATCH /workforce/leave/requests/:id/cancel` or `withdraw` route exists.
  - The database enum in migration `028_workforce_roster_and_property_media.sql` includes `'CANCELLED'`, but no controller method or service logic exposes this transition to staff users.

### 6.2 Frontend UI Action
- Inspecting [`MySchedulePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/MySchedulePage.jsx) lines 880–928 (My Leave Applications History):
  - The table contains columns: `Request Code`, `Category`, `Dates`, `Duration`, `Reason`, `Applied On`, `Status`, `Supervisor Notes`.
  - There is **no Actions column** and **no Withdraw / Cancel button**.
- **Verdict:** **NOT IMPLEMENTED.** Neither the backend API nor the frontend UI provides a mechanism for employees to withdraw pending applications.

---

## 7. Audit of Remaining Critical Workflows

| Workflow | Target Module | Contract / Evidence | Audit Finding | Status |
| :--- | :--- | :--- | :--- | :---: |
| **DEF-B09 Payload** | `MySchedulePage.jsx` | Sends `leave_category_id: parseInt(...)` | Replaced legacy `category_id`. Returns HTTP 201 Created. | **PASS** |
| **DEF-B10 Payload** | `WorkforcePage.jsx` | Sends `{ action, notes }` | Replaced `{ status, manager_notes }`. Returns HTTP 200 OK. | **PASS** |
| **Self-Approval Guard** | `WorkforcePage.jsx` | `isOwnLeave(req)` check | Action replaced with *"Self-Approval Blocked"*; backend throws HTTP 403. | **PASS** |
| **Property Scoping** | `leave.service.js` | `user.propertyId !== leave.property_id` | Backend asserts cross-property isolation on review; throws HTTP 403. | **PASS** |
| **Admin Escalation** | `WorkforcePage.jsx` | Role check `isAdmin` | Admins can approve leaves of any duration (tested & verified for 16 days). | **PASS** |
| **Balance Accuracy** | `workforce.repository.js` | Authoritative DB columns | Accurately renders `total_allocated`, `used_days`, `pending_days`, `remaining_days`. | **PASS** |
| **Absence Calendar** | `AbsenceCalendar.jsx` | Real API data integration | Renders month grid and agenda views with active filter controls. | **PASS** |
| **Pending vs Approved** | `AbsenceCalendar.jsx` | Pill status styling | Approved leaves render green (`#10b981`); pending render amber (`#f59e0b`). | **PASS** |
| **Roster Conflict** | `leave.service.js` | SQL shift auto-cancellation | Approving leave automatically cancels overlapping shifts with audit tag. | **PASS** |
| **Timesheet Integration**| `timesheet.service.js` | Paid leave hour computation | Adds `approved_leave_days * 8.00` to payable hours in timesheets. | **PASS** |

---

## 8. Multi-Viewport Responsive & Regression Audit

### 8.1 Viewport Responsiveness Verification (8 Target Viewports)

Telemetry recorded from `stage2_4_leave_verification_results.json` and verified against browser screenshots:

| Viewport Identifier | Resolution | Scroll Width | Client Width | Delta ($\Delta$) | Horizontal Overflow | Audit Result |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `mobile_compact_320` | $320 \times 700$ | **320px** | **320px** | **0px** | **NONE** | **PASS** |
| `mobile_small_360` | $360 \times 800$ | **360px** | **360px** | **0px** | **NONE** | **PASS** |
| `mobile_standard_390` | $390 \times 844$ | **390px** | **390px** | **0px** | **NONE** | **PASS** |
| `mobile_large_430` | $430 \times 932$ | **430px** | **430px** | **0px** | **NONE** | **PASS** |
| `tablet_portrait_768` | $768 \times 1024$ | **768px** | **768px** | **0px** | **NONE** | **PASS** |
| `tablet_landscape_1024`| $1024 \times 768$ | **1024px** | **1024px** | **0px** | **NONE** | **PASS** |
| `laptop_1280` | $1280 \times 800$ | **1280px** | **1280px** | **0px** | **NONE** | **PASS** |
| `desktop_1440` | $1440 \times 900$ | **1440px** | **1440px** | **0px** | **NONE** | **PASS** |

### 8.2 Regression Testing Execution
- **Backend Test Suites (Executed Read-Only):**
  - `tests/workforceAndPropertyMedia.test.js`: **12 passed, 12 total** ($12.57\text{s}$). Verified roster creation, conflict detection, shift swaps, attendance clocking, leave shift cancellation, payroll timesheets, and kiosk operations.
  - `tests/kioskSecurityAndGeofenceRemediation.test.js`: **17 passed, 17 total** ($13.27\text{s}$). Verified kiosk credential hashing, geofence verification, and maker-checker reviews.
- **Frontend Production Build:**
  - `npm run build --prefix frontend`: Built cleanly in $6.82\text{s}$ with 0 errors and 0 warnings.

---

## 9. Verification Script Forensic Review

[`frontend/run_stage2_4_leave_verification.cjs`](file:///c:/xampp/htdocs/BFA/frontend/run_stage2_4_leave_verification.cjs) was inspected for false positives and test validity:
1. **Real Browser Automation:** Uses Puppeteer with Chromium/Edge. Navigates actual routes, logs in with authenticated sessions, and interacts with form inputs via native React event dispatchers.
2. **Date Inversion Test:** Submits an inverted date range (`start_date > end_date`), asserts that the error alert appears, and confirms the submit button remains disabled. (Real behavior test).
3. **DEF-B09 & DEF-B10 Verification:** Directly asserts API response status codes and watches for live toast alerts and updated DOM rows.
4. **Delegation Limit Assertion:** Validates that `option[value="APPROVED"]` has the `disabled` property set to `true` and that the "Escalate to Administrator" button is rendered.
- **Conclusion:** The verification script performs authentic behavioral validation and does not rely on static code string matching.

---

## 10. Defect & Observation Register

### DEF-B11 (Medium) — Approval Policy & Routing Discrepancy for 6–14 Day Leaves
- **Description:** Applications for 6–14 days are auto-routed to `PENDING_ADMIN` at submission. However, neither the backend review check (`leave.total_days > 14`) nor the frontend modal prevents an Operations Manager from directly approving the leave.
- **Impact:** An Operations Manager can bypass administrator escalation for leaves between 6 and 14 days. (Strictly blocked for 15+ days).
- **Recommendation:** If corporate policy requires strict Administrator-only review for $> 5$ days, backend `LeaveService.reviewLeaveRequest` should enforce `if (leave.total_days > 5 && isOpsManager && action === 'APPROVED') throw new ForbiddenError(...)`.

### DEF-B12 (Low) — No Multipart File Upload for Supporting Documents
- **Description:** The system requires a URL text string rather than accepting physical document uploads (PDF/JPEG) for medical certificates.
- **Impact:** Employees must host their medical certificate externally and paste a URL link.
- **Recommendation:** Implement a dedicated multipart file upload endpoint (`POST /api/v1/workforce/leave/upload`) with secure local/S3 storage.

### DEF-B13 (Low) — Pending Leave Withdrawal Not Implemented
- **Description:** Employees cannot cancel or withdraw a submitted leave request while it is pending review.
- **Impact:** Employees must ask an Operations Manager to reject the request to free their allocated balance.
- **Recommendation:** Expose `PATCH /api/v1/workforce/leave/requests/:id/cancel` restricted to the request owner while status is `PENDING_*`.

### DEF-B14 (Cosmetic) — Review Modal Textarea Squashed Width
- **Description:** In [`WorkforcePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/WorkforcePage.jsx) review modal, the Review / Escalation Notes `<textarea>` renders as a small $120\text{px}$ box due to flex alignment.
- **Impact:** Minor visual polish defect; does not impede functional text entry.

---

## 11. Formal Requirements Classification Matrix

| Requirement | Implementation Scope | Implementation Status | Audit Verification Method | Final Status |
| :--- | :--- | :--- | :--- | :---: |
| **DEF-B09 Payload Fix** | Workspace B Frontend | Implemented | Automated Puppeteer + API Verified | **PASS** |
| **DEF-B10 Payload Fix** | Workspace B Frontend | Implemented | Automated Puppeteer + API Verified | **PASS** |
| **WP 2.4.1 Leave Application** | Workspace B Frontend | Implemented | Automated Puppeteer + Browser Verified | **PASS** |
| **WP 2.4.2 Manager Review** | Workspace B Frontend | Implemented | Automated Puppeteer + Browser Verified | **PASS** |
| **WP 2.4.3 Balance Dashboard** | Workspace B Frontend | Implemented | Automated Puppeteer + Browser Verified | **PASS** |
| **WP 2.4.4 Absence Calendar** | Workspace B Frontend | Implemented | Automated Puppeteer + Browser Verified | **PASS** |
| **WP 2.4.5 Roster Integration**| Workspace B Frontend | Implemented | Automated Puppeteer + Backend Verified | **PASS** |
| **14-Day Delegation Ceiling** | Workspace B Frontend | Implemented | Automated Puppeteer + Browser Verified | **PASS** |
| **8-Viewport Responsiveness** | Workspace B Frontend | Implemented | Automated Puppeteer Telemetry ($0\text{px}$) | **PASS** |
| **Document Upload (Binary)** | System Wide | **Not Implemented** | Code & API Inspection (URL text only) | **DEF-B12** |
| **Pending Leave Withdrawal** | System Wide | **Not Implemented** | Code & API Inspection (No route/UI) | **DEF-B13** |
| **Approval Policy Alignment** | Backend / Frontend | **Partially Aligned** | Code Inspection (6–14 day bypass) | **DEF-B11** |

---

## 12. Final Verdict

### **CONDITIONALLY ACCEPTED**

**Justification:**
- All core mandatory frontend requirements for Stage 2.4 (DEF-B09, DEF-B10, Work Packages 2.4.1–2.4.5, multi-viewport responsiveness, maker-checker segregation, and 14-day delegation threshold enforcement) are fully implemented, verified, and functioning without errors.
- The identified defects (DEF-B11, DEF-B12, DEF-B13) stem from pre-existing backend architecture contracts and schema limitations that were explicitly placed outside the authorized scope of Workspace B.
- No critical security boundaries were violated: self-approval is strictly blocked, cross-property access is prevented, and requests $> 14$ days cannot be approved by Operations Managers.
- Workspace A and Workspace C remain 100% untouched.

**Next Steps & Gate Conditions:**
- Do NOT begin Stage 2.5 without explicit user authorization.
- DEF-B11, DEF-B12, and DEF-B13 should be scheduled for backend reconciliation during the next authorized Workspace C hardening pass.
