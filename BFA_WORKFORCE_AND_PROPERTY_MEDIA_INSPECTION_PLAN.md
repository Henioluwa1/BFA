# BFA APARTMENTS MANAGEMENT SYSTEM
## Workforce Roster Management & Property Media Upload Upgrade
### Phase 1: Pre-Implementation Inspection & Change Ownership Report

**Target Scope:** Workforce Scheduling, Employee Availability, Attendance & Time Tracking, Leave Management, Payroll-Ready Timesheet Reporting, Add Property Multiple-Image Upload, and Role Governance.

---

### 1. Existing System Discovery & Component Inventory

| Component / Subsystem | Existing Files & Architecture | Status & Reusability |
| :--- | :--- | :--- |
| **RBAC & Authorization** | `backend/src/core/middleware/authContext.js`<br>`backend/src/core/access/accessControl.service.js`<br>`capabilities` & `access_overrides` tables | **Fully reusable.** The dynamic capability model supports `ROSTER_VIEW`, `SHIFT_ASSIGN`, `ATTENDANCE_CLOCK`, `LEAVE_REQUEST`, etc. Backend middleware `requireRoles` and `requireAuth` enforce server-side least privilege. |
| **Employees & Profiles** | `backend/src/modules/employees/`<br>`employees`, `employee_profiles`, `employee_activities` tables<br>`frontend/src/pages/portal/EmployeesPage.jsx` | **Fully reusable.** `employees` has `employee_code`, `user_id`, `property_id`, `department`, `employment_status`. Employees can be linked to shifts and attendance without creating redundant tables. |
| **Properties & Submissions** | `backend/src/modules/properties/`<br>`propertySubmissions.controller.js`<br>`properties`, `property_submissions`, `media_assets` tables<br>`frontend/src/pages/portal/PropertiesPage.jsx` | **High reuse potential.** `media_assets` was provisioned in Migration 026 with `file_url`, `is_primary`, `caption`, `display_order`, `is_published`, `submission_id`. We need to provide the REST endpoints, secure upload validation, and frontend gallery upload interface. |
| **File Storage & Uploads** | `backend/uploads/` directory (`employees`, `payment_proofs`)<br>`public.controller.js` (`uploadPaymentProof`)<br>`employees.controller.js` (`uploadPhoto`, `getPhoto`) | **Established pattern.** Base64 / multipart payload parsing, magic byte verification, MIME restrictions (JPEG, PNG, WebP), 5MB size limits, and safe randomized filenames (`prop_${propId}_${timestamp}_${random}.${ext}`). |
| **Audit Trail Architecture** | `backend/src/core/audit/audit.service.js`<br>`audit_logs` table | **Fully reusable.** `AuditService.record({ req, action, entityType, entityId, oldValues, newValues })` guarantees tamper-evident logging of shift assignments, swaps, attendance corrections, and image publications. |
| **Notifications Hub** | `backend/src/modules/notifications/`<br>`notifications` table | **Fully reusable.** In-app notification creation with event triggers for roster publications, shift swap requests/decisions, and leave reviews. |
| **Manager & Operations Dashboards** | `frontend/src/components/dashboard/ManagerDashboard.jsx`<br>`frontend/src/components/dashboard/AdminDashboard.jsx`<br>`frontend/src/components/layout/Sidebar.jsx` | **Ready for enhancement.** Add Workforce Management quick links, today's shifts widget, late arrival alerts, and leave request badges. |

---

### 2. Proposed Database Schema: Migration 028

We will create a forward-only migration: `backend/src/db/migrations/028_workforce_roster_and_property_media.sql`.

#### A. Roster & Shifts
1. **`shift_templates`**: Reusable shift configurations (`property_id`, `name`, `start_time`, `end_time`, `break_minutes`, `color_code`, `required_staff_count`).
2. **`rosters`**: Weekly/monthly planning headers (`property_id`, `title`, `start_date`, `end_date`, `status` ['DRAFT', 'PUBLISHED', 'ARCHIVED'], `published_by_id`).
3. **`shifts`**: Individual scheduled shifts (`roster_id`, `property_id`, `department`, `employee_id`, `shift_date`, `start_time`, `end_time`, `break_minutes`, `status` ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SWAPPED'], `notes`).

#### B. Availability & Swaps
4. **`employee_availability`**: Self-service preferences (`employee_id`, `date`, `availability_status` ['AVAILABLE', 'UNAVAILABLE', 'PREFERRED'], `notes`).
5. **`shift_swap_requests`**: Peer swaps (`shift_id`, `requesting_employee_id`, `target_employee_id`, `status` ['PENDING', 'APPROVED', 'REJECTED'], `reviewed_by_id`, `review_notes`).

#### C. Attendance & Time Tracking
6. **`attendance_records`**: Clock-in/out telemetry (`employee_id`, `property_id`, `shift_id`, `work_date`, `clock_in_time`, `clock_out_time`, `break_start_time`, `break_end_time`, `scheduled_hours`, `actual_hours`, `overtime_hours`, `attendance_status` ['PRESENT', 'LATE', 'HALF_DAY', 'EARLY_DEPARTURE', 'ABSENT', 'ON_LEAVE'], `clock_in_method` ['WEB', 'MOBILE_LOCATION', 'KIOSK', 'MANUAL'], `location_lat`, `location_lng`, `is_verified`).
7. **`attendance_corrections`**: Audit trail for timesheet adjustments (`attendance_record_id`, `employee_id`, `requested_clock_in`, `requested_clock_out`, `reason`, `status` ['PENDING', 'APPROVED', 'REJECTED'], `reviewed_by_id`).

#### D. Leave Management
8. **`leave_categories`**: Policy definitions (`code`, `name`, `default_days_per_year`, `is_paid`, `requires_document`).
9. **`leave_requests`**: Requests workflow (`employee_id`, `property_id`, `leave_category_id`, `start_date`, `end_date`, `total_days`, `status` ['PENDING_MANAGER', 'PENDING_ADMIN', 'APPROVED', 'REJECTED'], `manager_reviewed_by_id`, `admin_reviewed_by_id`).
10. **`leave_balances`**: Available allocations (`employee_id`, `leave_category_id`, `year`, `total_allocated`, `used_days`, `remaining_days`).

#### E. Media Assets Expansion
11. **Modify `media_assets.category`**: Alter column to `VARCHAR(50)` to comfortably support `BUILDING_EXTERIOR`, `BUILDING_ENTRANCE`, `RECEPTION`, `LOBBY`, `SWIMMING_POOL`, `GARDEN`, `PARKING`, `FACILITIES`, `OTHER`.

---

### 3. File Modification & Creation Inventory

#### Backend:
- `backend/src/db/migrations/028_workforce_roster_and_property_media.sql` *(New)*
- `backend/src/modules/workforce/` *(New domain module)*:
  - `workforce.routes.js`
  - `workforce.controller.js`
  - `roster.service.js`
  - `attendance.service.js`
  - `leave.service.js`
  - `timesheet.service.js`
  - `workforce.repository.js`
- `backend/src/modules/properties/properties.routes.js` *(Updated: add image upload & gallery management endpoints)*
- `backend/src/modules/properties/properties.controller.js` *(Updated: handle image upload, cover toggle, reorder)*
- `backend/src/modules/properties/properties.service.js` *(Updated: media upload, publication flow, and property image listing)*
- `backend/src/app.js` *(Mount `/api/v1/workforce`)*

#### Frontend:
- `frontend/src/services/api.js` *(Add `workforceService` & property media methods)*
- `frontend/src/pages/portal/WorkforcePage.jsx` *(New: Roster planning, attendance monitor, leave management, timesheets)*
- `frontend/src/pages/portal/MySchedulePage.jsx` *(New: Staff self-service for roster, clock-in/out, availability, swaps, leave)*
- `frontend/src/pages/portal/PropertiesPage.jsx` *(Updated: Multiple image upload, previews, reordering, cover selection, category tagging)*
- `frontend/src/components/layout/Sidebar.jsx` *(Add Workforce Management navigation for ADMIN/MANAGER, and My Schedule for STAFF)*
- `frontend/src/App.jsx` *(Add routes for `/app/workforce` and `/app/my-schedule`)*
- `frontend/src/components/dashboard/ManagerDashboard.jsx` *(Add Workforce quick stats)*
- `frontend/src/components/dashboard/AdminDashboard.jsx` *(Add Workforce quick stats)*

---

### 4. Security & Isolation Boundaries

1. **Manager Property Scoping**:
   - `MANAGER` accounts cannot query, create, or alter rosters, attendance, leave, or media for properties other than `user.propertyId`.
   - Backend queries enforce `WHERE property_id = req.user.propertyId` for MANAGERs.
2. **Maker-Checker & Self-Approval Prevention**:
   - Managers cannot approve their own leave or attendance corrections.
   - Staff cannot approve their own shift swaps.
3. **Public Image Visibility**:
   - Public apartment/property endpoints only serve records with `is_published = 1`.
4. **File Safety**:
   - Uploaded files are verified via magic byte buffers for JPEG (`ffd8ffe0/e1/e2`), PNG (`89504e47`), and WebP (`52494646`). Executables and SVGs are rejected with HTTP 422.

