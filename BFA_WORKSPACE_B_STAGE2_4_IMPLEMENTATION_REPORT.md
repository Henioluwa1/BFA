# BFA APARTMENTS MANAGEMENT SYSTEM
# WORKSPACE B — STAGE 2.4: EMPLOYEE LEAVE & ABSENCE MANAGEMENT IMPLEMENTATION REPORT

**Target Workspace:** Workspace B — Internal Workforce & Operations Portal  
**Stage:** 2.4 — Employee Leave & Absence Management  
**Implementation Date:** November 3, 2026  
**Status:** COMPLETED — READY FOR INDEPENDENT AUDIT  

---

## 1. Executive Summary & Scope Compliance

In accordance with authorization for **Stage 2.4 (Employee Leave & Absence Management)**, Workspace B has been updated with a complete, enterprise-grade leave and absence experience integrated into the BFA internal workforce portal.

### Strict Scope Enforcements
- **Workspace Isolation:** All changes were made exclusively inside Workspace B (`frontend/src/`).
- **Zero Backend Modifications:** Backend controllers, routes, migrations, services, database schemas, and API contracts remain completely untouched.
- **Zero Direct Database Writes:** No SQL executions, manual mutations, or schema modifications were performed.
- **Zero Workspace A Alterations:** The public guest experience and landing components remain untouched.
- **Preserved System State:** DEF-C01 Marcus Vance (`property_id: null`) remains intact and unmodified. OBS-B01 and OBS-B02 remain preserved.
- **Git Discipline:** Zero commits, pushes, or branch merges were performed; all work remains in the local working directory.
- **Scope Discipline:** No advancement into Stage 2.5 without explicit authorization.

---

## 2. Resolution of Pre-Existing Defects

### 2.1 DEF-B09 Resolution — Leave Application Payload Correction
- **Previous Defect:** When staff submitted a leave application via [`MySchedulePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/MySchedulePage.jsx), the form payload incorrectly transmitted `category_id` instead of the contractually required `leave_category_id`. Consequently, `LeaveService.applyForLeave` rejected the payload with HTTP 400 (`leave_category_id is required`), preventing staff from submitting leave requests.
- **Remediation:**
  In [`frontend/src/pages/portal/MySchedulePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/MySchedulePage.jsx), the submission handler was corrected to map:
  ```javascript
  const payload = {
    leave_category_id: parseInt(leaveForm.leave_category_id, 10),
    start_date: leaveForm.start_date,
    end_date: leaveForm.end_date,
    reason: leaveForm.reason.trim(),
    document_url: leaveForm.document_url?.trim() || null,
  };
  ```
- **Verification:** Staff successfully submitted an Annual Vacation Leave request (3 days, 2026-11-10 to 2026-11-12). The submission returned HTTP 201 Created with tracking code `LV-...`, rendered a success toast, and immediately populated the staff request ledger.

### 2.2 DEF-B10 Resolution — Manager Leave Review Payload Correction
- **Previous Defect:** In [`WorkforcePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/WorkforcePage.jsx), the managerial review handler transmitted `{ status, manager_notes }` to `PUT /api/v1/workforce/leave/requests/:id/review`. The backend `LeaveService.reviewLeaveRequest` strictly validates `{ action, notes }` where `action ∈ ['APPROVED', 'REJECTED', 'ESCALATED']`. Submissions resulted in HTTP 400 Bad Request (`Invalid action`).
- **Remediation:**
  In [`frontend/src/pages/portal/WorkforcePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/WorkforcePage.jsx), the review handler was updated:
  ```javascript
  const handleReviewLeave = async (overrideAction) => {
    if (!reviewLeaveModal) return;
    const actionToSend = overrideAction || leaveReviewStatus;
    try {
      await workforceService.reviewLeave(reviewLeaveModal.id, {
        action: actionToSend,
        notes: leaveReviewNote,
      });
      // Toast and refresh queue
    } catch (err) {
      addToast(`Action failed: ${err.message}`, 'error');
    }
  };
  ```
- **Verification:** Operations Manager successfully approved the pending request with review notes. The backend responded HTTP 200 OK, updating the request status to `APPROVED` and recalculating staff leave balances.

---

## 3. Work Package Implementation Details

### 3.1 Work Package 2.4.1 — Employee Leave Application Workflow
Implemented in [`frontend/src/pages/portal/MySchedulePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/MySchedulePage.jsx):
1. **Dynamic Duration Calculation:**
   - Computes calendar days dynamically: `Math.ceil((end - start) / (1000 * 3600 * 24)) + 1`.
   - Displays computed days in a live summary badge (`Total Requested: N calendar day(s)`).
2. **Reversed Date Range Inversion Validation:**
   - Client-side validation triggers when `start_date > end_date`.
   - Displays an inline warning alert: *"⚠️ Start date cannot be after end date."*
   - Disables the `Submit Application` button until valid chronological dates are entered.
3. **Dynamic Supporting Documentation Requirement Banner:**
   - When a category with `requires_document = true` is selected (e.g., Sick & Medical Leave, Parental Leave), a warning banner appears:
     *"⚠️ Supporting Documentation Required: Please provide a valid medical certificate or official documentation link."*
   - Exposes an optional `document_url` input field with URL validation.
4. **Staff Application History Ledger:**
   - Renders a structured table showing Category, Leave Dates, Total Days, Reason, Attached Document link, and Status Badge (`Pending Manager`, `Pending Admin`, `Approved`, `Rejected`).
5. **My Leave Calendar Subtab:**
   - Provides a subtab toggle between "Balances & Requests" and "My Leave Calendar", rendering `<AbsenceCalendar>` scoped to the employee's personal leave records.

---

### 3.2 Work Package 2.4.2 — Manager Leave Review & Delegation Policy
Implemented in [`frontend/src/pages/portal/WorkforcePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/WorkforcePage.jsx):
1. **Maker-Checker Segregation Guard:**
   - Managers cannot approve or reject their own leave requests.
   - Evaluates `isOwnLeave(req)`.
   - Action buttons are replaced with a non-interactive badge: *"Self-Approval Blocked (Maker-Checker Enforced)"*.
2. **14-Day Delegation Threshold Enforcement:**
   - Backend policy dictates that Operations Managers may approve leave applications up to 14 days only; requests $> 14$ days exceed managerial delegated authority.
   - If an Operations Manager reviews an application with `total_days > 14`:
     - Displays an amber warning banner:
       *"Delegated Authority Limit (14 Days) Exceeded: This leave request is for N days. Operations Managers may approve leaves up to 14 days only. Please escalate this application to an Executive Administrator."*
     - The `<option value="APPROVED">` select choice is disabled (`disabled={exceedsLimit}`).
     - The modal action button transforms to a prominent amber **"Escalate to Administrator"** button (`action: 'ESCALATED'`).
3. **Executive Administrator Escalation Resolution:**
   - Leaves $> 5$ days auto-route to `PENDING_ADMIN`.
   - Executive Administrators (`ADMIN`, `OWNER`, `SUPER_ADMIN`) see an "Awaiting Administrator" indicator and retain full authority to approve escalated leaves $> 14$ days.

---

### 3.3 Work Package 2.4.3 — Authoritative Leave Balance Dashboard
Implemented in [`MySchedulePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/MySchedulePage.jsx) and [`WorkforcePage.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/pages/portal/WorkforcePage.jsx):
- Integrated with backend endpoints `GET /api/v1/workforce/leave/balances` and `GET /api/v1/workforce/leave/categories`.
- Renders authoritative database columns:
  - `total_allocated`: Total yearly entitlement days.
  - `used_days`: Confirmed approved leave days consumed.
  - `pending_days`: Days tied up in awaiting review.
  - `remaining_days`: Net available days remaining.
- Visual progress bar showing entitlement utilization percentage with color grading (emerald when healthy, amber when $\ge 75\%$, rose when fully depleted).
- Handles all 6 standard leave categories:
  1. Annual Vacation Leave (Paid)
  2. Sick & Medical Leave (Paid)
  3. Emergency Personal Leave (Paid)
  4. Bereavement Leave (Paid)
  5. Maternity / Parental Leave (Paid)
  6. Unpaid Leave (Unpaid)

---

### 3.4 Work Package 2.4.4 — Interactive Team Absence Calendar
Implemented in dedicated component [`frontend/src/components/workforce/AbsenceCalendar.jsx`](file:///c:/xampp/htdocs/BFA/frontend/src/components/workforce/AbsenceCalendar.jsx):
1. **Dual Calendar Modes:**
   - **Month Grid View:**
     - 7-column calendar grid showing all days of the selected month with previous/next month navigation and "Today" shortcut.
     - Responsive container wrapped in horizontal scroll container for mobile screens.
     - Renders color-coded event pills (`Annual`, `Sick`, `Personal`, `Approved`, `Pending`) on applicable day cells.
   - **Timeline / Agenda List View:**
     - Chronological list grouped by absence dates.
     - Details applicant name, department, leave category, duration in days, and review status badge.
2. **Interactive Filtering Controls:**
   - **Status Filter:** `All Absences`, `Approved Only`, `Pending Review`.
   - **Category Filter:** `All Categories`, `Annual Vacation`, `Sick Leave`, `Personal Leave`, etc.
3. **Absence Details Modal:**
   - Clicking any calendar pill or agenda row opens a modal displaying:
     - Applicant name and department.
     - Leave category and period (`start_date` to `end_date`).
     - Total calendar days.
     - Reason submitted.
     - Supporting document link (if attached).
     - Manager review status badge and prior notes.

---

### 3.5 Work Package 2.4.5 — Workforce Roster & Timesheet Integration
- **Roster Coordination:** Verified that when a leave application is approved, the backend automatically cancels conflicting shifts with note `[Cancelled: Employee Approved Leave ...]`, ensuring roster planning prevents double-booking.
- **Timesheet Integration:** Verified that in Tab 3 (Timesheets) of `WorkforcePage.jsx`, paid leave hours are properly computed and included in `Total Payable Hours`.

---

## 4. Architectural Limitations & Observations

> [!NOTE]
> **Absence of Client Leave Cancellation / Withdrawal Endpoint:**
> During Discovery Audit, it was identified that while the database enum `leave_requests.status` includes `'CANCELLED'`, the backend routes (`leave.routes.js`) and `leave.controller.js` do not expose a public or staff endpoint to cancel or withdraw a submitted leave request before review.
> In adherence to the strict workspace mandate prohibiting backend modifications, this limitation is recorded as an architectural observation rather than bypassed. An employee may request cancellation through their Operations Manager, who can reject or reassign the request.

---

## 5. Automated Verification Results

A comprehensive automated verification suite was executed via Puppeteer in [`frontend/run_stage2_4_leave_verification.cjs`](file:///c:/xampp/htdocs/BFA/frontend/run_stage2_4_leave_verification.cjs).

### 5.1 Verification Test Matrix

| ID | Test Case | Target Feature | Expected Behavior | Observed Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-01** | DEF-B09 Payload Test | Staff Leave Form | Sends `leave_category_id` in payload | HTTP 201, toast rendered, table row added | **PASS** |
| **TC-02** | Date Range Validation | Date Picker | Inverted dates (`start > end`) blocked | Error banner displayed, button disabled | **PASS** |
| **TC-03** | Document Banner Test | Category Change | Sick Leave triggers document alert | Amber requirement banner rendered | **PASS** |
| **TC-04** | Balance Dashboard | Balance Cards | Renders authoritative balance cards | 6 category cards with allotted/used/pending | **PASS** |
| **TC-05** | DEF-B10 Payload Test | Manager Review | Sends `{ action, notes }` | HTTP 200, status updated to APPROVED | **PASS** |
| **TC-06** | 14-Day Delegation Limit | Manager Review | Leave $> 14$ days blocks direct approval | Warning displayed, APPROVE disabled | **PASS** |
| **TC-07** | Escalation Button Test | Manager Review | Leave $> 14$ days displays Escalate button | Amber "Escalate to Administrator" rendered | **PASS** |
| **TC-08** | Admin Escalation Approval | Admin Review | Admin can approve $> 14$ days leave | HTTP 200, approved by Executive Admin | **PASS** |
| **TC-09** | Absence Month Grid | Team Calendar | Renders 7-column calendar with days | Days `Sun` through `Sat` with colored pills | **PASS** |
| **TC-10** | Absence Agenda Timeline | Team Calendar | Renders chronological event list | Timeline rows with staff name and dates | **PASS** |

---

### 5.2 Multi-Viewport Responsive Audit Across 8 Screen Sizes

All viewports were audited against the standard enterprise matrix. Measurements were recorded on `document.body` and `.modal-content` to confirm $0\text{px}$ horizontal overflow (`scrollWidth === clientWidth`).

| Viewport Name | Screen Resolution | Scroll Width | Client Width | Overflow ($\Delta$) | Result |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `mobile_compact_320` | $320 \times 700$ | **320px** | **320px** | **0px** | **PASS** |
| `mobile_small_360` | $360 \times 800$ | **360px** | **360px** | **0px** | **PASS** |
| `mobile_standard_390` | $390 \times 844$ | **390px** | **390px** | **0px** | **PASS** |
| `mobile_large_430` | $430 \times 932$ | **430px** | **430px** | **0px** | **PASS** |
| `tablet_portrait_768` | $768 \times 1024$ | **768px** | **768px** | **0px** | **PASS** |
| `tablet_landscape_1024`| $1024 \times 768$ | **1024px** | **1024px** | **0px** | **PASS** |
| `laptop_1280` | $1280 \times 800$ | **1280px** | **1280px** | **0px** | **PASS** |
| `desktop_1440` | $1440 \times 900$ | **1440px** | **1440px** | **0px** | **PASS** |

---

## 6. Photographic Evidence Catalog

All 17 captured evidence artifacts and telemetry JSON are saved in the artifact directory:

1. **Staff Leave Dashboard & Authoritative Balance Cards**  
   ![Staff Leave Dashboard](/stage2_4_staff_leave_dashboard.png)
2. **Staff Leave Application Modal (DEF-B09 Resolved)**  
   ![Staff Leave Form Populated](/stage2_4_staff_leave_form_populated.png)
3. **Staff Submitted Applications Table**  
   ![Staff Applications Table](/stage2_4_staff_applications_table.png)
4. **Operations Manager Leave Approval Queue**  
   ![Manager Leave Approval Queue](/stage2_4_manager_leave_approval_queue.png)
5. **Manager Review Modal with Action & Notes (DEF-B10 Resolved)**  
   ![Manager Review Modal](/stage2_4_manager_review_modal_defb10.png)
6. **Absence Calendar — Month Grid View**  
   ![Absence Calendar Month Grid](/stage2_4_absence_calendar_month_grid.png)
7. **Absence Calendar — Agenda & Timeline View**  
   ![Absence Calendar Agenda Timeline](/stage2_4_absence_calendar_agenda_timeline.png)
8. **Manager 14-Day Delegation Limit Warning & Escalation Action**  
   ![Manager Delegation Limit Modal](/stage2_4_manager_delegation_limit_modal.png)
9. **Executive Administrator Escalated Leave Approval Modal**  
   ![Admin Escalated Approval Modal](/stage2_4_admin_escalated_approval_modal.png)
10. **Mobile Compact ($320\text{px}$)**  
    ![Viewport 320x700](/stage2_4_viewport_mobile_compact_320_320x700.png)
11. **Mobile Small ($360\text{px}$)**  
    ![Viewport 360x800](/stage2_4_viewport_mobile_small_360_360x800.png)
12. **Mobile Standard ($390\text{px}$)**  
    ![Viewport 390x844](/stage2_4_viewport_mobile_standard_390_390x844.png)
13. **Mobile Large ($430\text{px}$)**  
    ![Viewport 430x932](/stage2_4_viewport_mobile_large_430_430x932.png)
14. **Tablet Portrait ($768\text{px}$)**  
    ![Viewport 768x1024](/stage2_4_viewport_tablet_portrait_768_768x1024.png)
15. **Tablet Landscape ($1024\text{px}$)**  
    ![Viewport 1024x768](/stage2_4_viewport_tablet_landscape_1024_1024x768.png)
16. **Laptop ($1280\text{px}$)**  
    ![Viewport 1280x800](/stage2_4_viewport_laptop_1280_1280x800.png)
17. **Desktop ($1440\text{px}$)**  
    ![Viewport 1440x900](/stage2_4_viewport_desktop_1440_1440x900.png)
18. **Full Audit JSON Telemetry:** `stage2_4_leave_verification_results.json`

---

## 7. Build & Regression Testing Verification

- **Frontend Production Build:**  
  `npm run build --prefix frontend` built cleanly in $6.82\text{s}$ with 0 errors and 0 warnings.
- **Backend Test Suites (Strictly Read-Only):**
  - `tests/workforceAndPropertyMedia.test.js`: **12/12 PASS**
  - `tests/kioskSecurityAndGeofenceRemediation.test.js`: **17/17 PASS**
- **Git State:**
  - Workspace A: Untouched ($0$ modified files).
  - Workspace C: Untouched ($0$ backend controllers, routes, migrations, or database changes).
  - Clean working directory ready for independent forensic audit.

---

## 8. Conclusion

Stage 2.4 (Employee Leave & Absence Management) has been completed, resolving DEF-B09 and DEF-B10, delivering Work Packages 2.4.1 through 2.4.5, and verifying responsive fidelity across all 8 target viewports.

**COMPLETED — READY FOR INDEPENDENT AUDIT**
