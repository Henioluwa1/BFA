# Reference Page and Component Catalog

**System:** WPAMS (Apartment Management System for WordPress)  
**Inspection Date:** October 22, 2026  
**Reference Source:** Live Demo & HTTP Crawl (`pushnifty.com/mojoomla/extend/wordpress/apartment/`)  
**Design Tokens Recovered:**
- **Primary Color:** `#104b73` (Deep Ocean Blue)
- **Primary Hover/Accent:** `#0b334f` / `#166296`
- **Secondary / Dark Neutral:** `#313131` / `#000000`
- **Light Neutral / Card Background:** `#ffffff`
- **Page Background:** `#f5efe0` / `#f2f5fa` (Subtle off-white warm canvas)
- **Border / Rule Color:** `#dcd7ca` / `#e5e7eb`
- **Success Badge / Status:** `#28a745` (Paid, Approved, Completed)
- **Warning / Pending Badge:** `#ffc107` (Pending, In Progress)
- **Danger / Unpaid Badge:** `#dc3545` (Unpaid, Overdue, Cancelled)
- **Typography:** Primary font family: `'Poppins', sans-serif`, weight 400 (regular), 500 (medium), 700 (bold).
- **Icons:** Font Awesome 4.7 (`fa fa-*`), SVG icons for search/navigation modals.
- **Form Framework:** Bootstrap 5 with Material floating labels (`.md-form`, `.custom-top-label`) and jQuery Validation Engine.

---

## 1. Public Pages Catalog

### PAGE-PUB-01: Apartment Management Login Page
* **URL:** `https://pushnifty.com/mojoomla/extend/wordpress/apartment/apartment-management-login-page/`
* **Access:** Public / Unauthenticated
* **Layout Structure:**
  - **Banner Header:** Gradient banner with white text: *"Most Trusted Apartment Plugin"*, subtitle *"#1 Selling Plugin on Codecanyon"*.
  - **Brand Sidebar (Desktop col-md-5):**
    - Logo: 80x80px circular logo (`finel-logo6.png`).
    - Site Title: *"MJ AMS"* (h4/p in `#104b73`), Subtitle *"Apartment Management System"*.
    - Public Navigation Menu (Unordered list):
      - Apartment Management Login (Active)
      - Member Registration Page
      - Apartment Society Rules
  - **Login Card (Desktop col-md-7):**
    - Email ID input field (`name="log"`, `id="user_login"`) with floating label animation.
    - Password input field (`name="pwd"`, `id="user_pass"`, type `password`).
    - Remember Me checkbox (`name="rememberme"`, value `forever`).
    - Submit Button: *"Log In"* (`.button-primary`, background `#104b73`, color `#fff`).
    - Forgot Password Link: *"Forgot your password?"* (`href="wp-login.php?action=lostpassword"`).
  - **Role Quick-Login Selector:**
    - Divider: *"Or Login As"* with horizontal separator.
    - 4 Interactive Avatar Tiles with pre-fill JavaScript handlers:
      1. **Member** (`.first-content-student`): Sets `young` / `young`.
      2. **Accountant** (`.second-content-teacher`): Sets `kenneth` / `kenneth`.
      3. **Staff** (`.third-img-set-access`): Sets `jennifer` / `jennifer`.
      4. **Gatekeeper** (`.four-img-set-access`): Sets `carol` / `carol`.
      5. **Super Admin** (`.super_admin_popup`): Triggers Google Form request popup.
    - Documentation Link: *"Help Document"* button linking to `/document/`.
* **Responsive Behavior:**
  - On mobile (<768px): Header collapses into mobile hamburger menu (`.navbar-toggle`). Login card shifts below branding. Role tiles wrap to 2-column or 1-column grid.

---

### PAGE-PUB-02: Member Self-Registration Page
* **URL:** `https://pushnifty.com/mojoomla/extend/wordpress/apartment/apartment-management-member-registration-page/`
* **Access:** Public
* **Layout Structure:**
  - Multi-section registration form with section headers (`.first_hed`):
  - **Section 1: Building Information**
    - Building Select (`building_id[]`, Required): Dropdown with live buildings (e.g., *Almubarak Building, Apna Ghar Phase II, GP, Money Plant, Qunci, Residencial Maria Bueno, Sapatha Hexa*).
    - Unit Category Select (`unit_cat_id[]`, Required): Options include *Residential, Commercial, Office, Villa, Townhouse, Restaurant Space*.
    - Unit Select (`unit_name[]`, Required): AJAX cascade populated based on Building + Category.
    - Member Type (`member_type`): Select between `Owner` and `Tenant`.
    - Occupied Date (`occupied_date`): jQuery UI datepicker, format `YYYY-MM-DD`, default to current date.
  - **Section 2: Member Personal Information**
    - First Name (`first_name`, text, required, validation regex `onlyLetter_specialcharacter`, max 50).
    - Middle Name (`middle_name`, text, optional).
    - Last Name (`last_name`, text, required, max 50).
    - Date of Birth (`birth_date`, datepicker, format `yy-mm-dd`, maxDate 0, yearRange -120 to +25).
    - Gender (`gender`, radio options: Male / Female).
    - Email ID (`email`, email, required, strictEmail validation, live AJAX duplicate check).
    - Password (`password`, password, required, length 8-12).
    - Phone Code (`phonecode`, readonly text, e.g., `+1`).
    - Mobile Number (`mobile`, number input, required, max 15 digits).
    - Address (`address`, text, max 150 chars).
    - Avatar / Profile Photo (`amgt_user_avatar`, file upload, allowed: `.jpg`, `.jpeg`, `.png`).
  - **Section 3: Family Information (Repeatable Sub-Form)**
    - Add New Family Member button (`#add_new_family_member`, plus icon).
    - Dynamic rows:
      - First Name (`family_first_name[]`)
      - Last Name (`family_last_name[]`)
      - Date of Birth (`family_birth_date[]`)
      - Gender (`family_gender_*`, radio)
      - Mobile (`family_mobile[]`)
      - Family Type (`family_type[]`, select: *Owner Family*, *Tenant Family*, *Care Taker*).
      - Delete row action (`deleteformBodyElement()`).
  - **Action Button:**
    - Submit Button: *"Submit"* (`.save_btn`, full width, uppercase, `#104b73`).

---

### PAGE-PUB-03: Apartment Society Rules Page
* **URL:** `https://pushnifty.com/mojoomla/extend/wordpress/apartment/apartment-society-rules/`
* **Access:** Public / Member
* **Layout Structure:**
  - Responsive container with Bootstrap 5 Accordion (`#accordionExample`).
  - Accordion Items:
    - Card headers styled with background `#104b73`, white text, collapsible toggle caret.
    - Left border highlight: `border-left: 5px solid #104b73 !important`.
  - Content Items Observed:
    - Rule 5: Parking regulations (allotted spaces, visitor limits, penalties).
    - Rule 4: Rental agreements (tenant KYC, prior society approvals).
    - Additional society bylaws and fine schedules.

---

### PAGE-PUB-04: Apartment FAQ Page
* **URL:** `https://pushnifty.com/mojoomla/extend/wordpress/apartment/apartment-faq-page/`
* **Access:** Public
* **Layout Structure:**
  - Standard Twenty-Twenty Child layout.
  - Header with site branding and search modal.
  - Content area with container `.FAQ_main_div`.
  - Empty state observed in live demo (`<div class="tab-content padding_0"></div>`).

---

## 2. Authenticated Portal Framework & Shell

When an authorized user logs in, they are redirected to:
`https://pushnifty.com/mojoomla/extend/wordpress/apartment/?apartment-dashboard=user`

### Common Shell Components:
1. **Top Navbar Header:**
   - Society Brand / Logo.
   - Quick Action Icons:
     - Notice Board Shortcut (badge counter).
     - Event Calendar Shortcut.
     - Internal Messages / Inbox (unread counter).
     - User Profile Dropdown (`My Profile`, `Log Out` with nonce).
2. **Left Navigation Sidebar (Collapsible Accordion Menu):**
   The navigation is organized into 9 logical sections:
   - **Dashboard** (`?apartment-dashboard=user`)
   - **User Management:**
     - Residential Unit (`page=resident_unit`)
     - Members (`page=member`)
     - Staff Members (`page=staff-members`)
     - Accountant (`page=accountant`)
     - Gatekeeper (`page=gatekeeper`)
     - Committee Members (`page=committee-member`)
     - Documents (`page=documents`)
     - Complaints (`page=complaint`)
   - **Parking Management:**
     - Slot (`page=parking-manager&tab=sloat-list`)
     - Assign Slot (`page=parking-manager&tab=assigned-sloat-list`)
   - **Visitors Management:**
     - Manage Gates (`page=visitor-manage&tab=manage-gates`)
     - Visitor Request (`page=visitor-manage&tab=visitor-checkinlist`)
     - Staff Check-In (`page=visitor-manage&tab=staff-checkinlist`)
   - **Notification:**
     - Notice (`page=notice-event&tab=notice_list`)
     - Event (`page=notice-event&tab=event_list`)
     - Message (`page=message`)
   - **Services & Facility:**
     - Services (`page=services`)
     - Facility (`page=facility&tab=facility-list`)
     - Booking Facility (`page=facility&tab=facility-booking-list`)
   - **Accounts:**
     - Invoice (`page=accounts&tab=invoice-list`)
     - Charges (`page=accounts&tab=charges-list`)
     - Expense (`page=accounts&tab=expense-list`)
   - **Assets & Inventory:**
     - Assets (`page=assets-inventory-tracker&tab=assets_list`)
     - Inventory (`page=assets-inventory-tracker&tab=inventory_list`)
   - **Reports:**
     - Unit By Building (`page=report&tab=unit_by_building`)
     - Members By Building (`page=report&tab=member_by_building&tab_1=graph`)
     - Finance/Payment (`page=report&tab=income&tab_1=graph`)
     - Complaint (`page=report&tab=complaint&tab_1=complaint_status`)
   - **Other:**
     - Society Rules (`page=society_rules`)
     - FAQ (`page=faq`)
     - Gallery (`page=gallery`)
     - Profile (`page=profile`)

---

## 3. Module-by-Module Component Specifications

### MOD-01: Dashboard Overview
* **URL:** `?apartment-dashboard=user`
* **Roles:** All (Widgets filtered by role permissions)
* **Key Components:**
  - **Top KPI Metric Cards:**
    - Visitors Count
    - Building Units Count
    - Parking Slots (Total vs Available)
    - Open Complaints Count
    - Facility Bookings (Pending / Approved)
    - Active Notices
    - Invoices (Total / Unpaid)
  - **FullCalendar Interactive Widget:**
    - Displays scheduled Events, Facility Bookings, and Notice deadlines in Month, Week, and Day views.
  - **Income-Expense Chart:**
    - Google Charts / Morris area chart showing monthly cash flows (Income vs Expense).
  - **Quick Activity Tables:**
    - Recent Complaints table.
    - Recent Visitor check-in activity.
    - Recent Notices carousel.

---

### MOD-02: Residential Units
* **URL:** `?apartment-dashboard=user&page=resident_unit`
* **Roles:** Staff, Accountant, Gatekeeper, Committee
* **Table Columns:**
  `Image` | `Unit Name` | `Building Name` | `Unit Category` | `Member Name` | `Status` | `Action`
* **Status Badges:** `Occupied` (Blue/Green), `Vacant` (Grey/Yellow).
* **Action Buttons:** `Add Unit`, `View`, `Edit`, `Delete`, `Export CSV`.
* **Modals:**
  - `#myModal_add_building`: Add Building Name, Number of Floors, Description.
  - `#myModal_add_unit`: Select Building, Unit Category, Unit Name/Number, Measurement Area (sq ft/m²), Description.

---

### MOD-03: Members Directory
* **URL:** `?apartment-dashboard=user&page=member`
* **Roles:** Staff, Accountant, Gatekeeper, Committee
* **Table Columns:**
  `Photo` | `Name & Email ID` | `Member Type` | `Building & Unit Name` | `Mobile No.` | `Action`
* **Member Types:** `Owner`, `Tenant`.
* **Row Actions:** `View Profile`, `Edit`, `Delete`.
* **Header Buttons:** `Add Member`, `Delete Selected`.

---

### MOD-04: Staff Members
* **URL:** `?apartment-dashboard=user&page=staff-members`
* **Roles:** Staff, Accountant, Committee
* **Table Columns:**
  `Photo` | `Name & Email ID` | `Staff Category` | `Mobile No.` | `Badge ID` | `Action`
* **Staff Categories:** Security, Cleaning, Maintenance, Electrician, Plumber, Gardener.
* **Row Actions:** `View`, `Edit`, `Delete`.

---

### MOD-05: Accountant & Gatekeeper Personnel Modules
* **Accountant URL:** `?apartment-dashboard=user&page=accountant`
  - Columns: `Photo` | `Name & Email ID` | `Mobile No.` | `Badge ID` | `Action`
* **Gatekeeper URL:** `?apartment-dashboard=user&page=gatekeeper`
  - Columns: `Photo` | `Name & Email ID` | `Mobile No.` | `Assigned Gate` | `Action`

---

### MOD-06: Committee Members
* **URL:** `?apartment-dashboard=user&page=committee-member`
* **Table Columns:**
  `Photo` | `Name & Email ID` | `Designation` | `Building & Unit Name` | `Mobile No.` | `Action`
* **Designations:** President, Secretary, Treasurer, Vice President, Executive Member.

---

### MOD-07: Documents Management
* **URL:** `?apartment-dashboard=user&page=documents`
* **Table Columns:**
  `Image` | `Document Title` | `Unit Name` | `Member Name` | `Submitted Date` | `Category` | `Description` | `Action`
* **Categories:** Identity Proof, Rental Agreement, Unit Blueprint, NOC, Maintenance Contract.
* **Row Actions:** `Download / View`, `Edit`, `Delete`.

---

### MOD-08: Complaints & Maintenance Requests
* **URL:** `?apartment-dashboard=user&page=complaint`
* **Table Columns:**
  `Image` | `Complaint Nature` | `Complaint Title` | `Complaint By` | `Date` | `Time` | `Complaint Status` | `Description` | `Resolution` | `Action`
* **Complaint Nature:** Maintenance, Noise, Parking, Security, Cleanliness, Plumbing, Electrical.
* **Statuses:** `Open` (Red), `In Progress` (Yellow), `Closed` (Green).
* **Row Actions:** `View Details`, `Update Status / Resolve`, `Delete`.

---

### MOD-09: Parking Manager
* **Slots URL:** `page=parking-manager&tab=sloat-list`
  - Columns: `Image` | `Slot Name` | `Slot Type` | `Status` | `Allotted Start to End Date` | `Action`
  - Slot Types: `Two Wheeler`, `Four Wheeler`, `Visitor Slot`.
  - Statuses: `Allocated`, `Unallocated`.
* **Assigned Slots URL:** `page=parking-manager&tab=assigned-sloat-list`
  - Columns: `Image` | `Slot Name` | `Slot Type` | `Building Block` | `Member Name` | `Vehicle Number` | `Start Date` | `End Date` | `Status` | `Action`
  - Row Actions: `View`, `Edit`, `Delete`.

---

### MOD-10: Visitor Management
* **Gate Management URL:** `page=visitor-manage&tab=manage-gates`
  - Manage Society Gates (Gate 1 - Main, Gate 2 - Rear, Service Gate).
* **Visitor Request URL:** `page=visitor-manage&tab=visitor-checkinlist`
  - Columns: `Image` | `Visitor Name - ID Number - Vehicle Number` | `Gate Name` | `Building & Unit Name` | `Check-In Date` | `Check-In Time` | `Check-Out Time` | `Status` | `Action`
  - Status: `Entered / Checked In`, `Checked Out`.
  - Actions: `Check-Out Now`, `Edit`, `Delete`.
* **Staff Check-In URL:** `page=visitor-manage&tab=staff-checkinlist`
  - Columns: `Image` | `Staff Member Name` | `Gate Name` | `Check-In Date` | `Check-In Time` | `Check-Out Time` | `Action`

---

### MOD-11: Notices & Events
* **Notice List URL:** `page=notice-event&tab=notice_list`
  - Columns: `Image` | `Title` | `Notice To` (All, Owners, Tenants, Staff) | `Start Date` | `End Date` | `Type` | `Status` | `Description` | `Action`
* **Event List URL:** `page=notice-event&tab=event_list`
  - Columns: `Image` | `Title` | `Event To` | `Start Date` | `End Date` | `Start Time` | `End Time` | `Status` | `Action`

---

### MOD-12: Messaging
* **URL:** `?apartment-dashboard=user&page=message`
* **Table Columns:** `Image` | `Message For` | `Subject` | `Description` | `Date`
* **Actions:** `Compose Message` (Select recipient role, unit, subject, attachments).

---

### MOD-13: Services
* **URL:** `?apartment-dashboard=user&page=services`
* **Table Columns:** `Image` | `Service Name` | `Service Provider Name` | `Mobile Number` | `Address` | `Action`
* **Service Types:** Housekeeping, Pest Control, Elevator Maintenance, Generator Servicing, Security Agency.

---

### MOD-14: Facility Management & Booking
* **Facility List URL:** `page=facility&tab=facility-list`
  - Columns: `Image` | `Facility Name` | `Amount Charge` | `Charge Per` (Hour, Day, Event) | `Status` | `Action`
  - Facilities observed: *Club House, Swimming Pool, GYM, Tennis Court, Banquet Hall*.
* **Facility Booking URL:** `page=facility&tab=facility-booking-list`
  - Columns: `Image` | `Member Name` | `Facility Name` | `Book For` | `Start Date` | `End Date` | `Start Time` | `End Time` | `Booking Date` | `Booking Charge` | `Booking Status` | `Action`
  - Statuses: `Approved`, `Pending`, `Canceled`.
  - Row Actions: `View`, `Edit`, `Delete`.

---

### MOD-15: Invoices, Charges & Expenses (Accounts Module)
* **Invoice List URL:** `page=accounts&tab=invoice-list`
  - Columns: `Image` | `Invoice Number` | `Member Name` | `Building & Unit Name` | `Charge Type` | `Total Amount` | `Due Amount` | `Paid Amount` | `Payment Status` | `Start Date to End Date` | `Action`
  - Payment Statuses: `Paid` (Green), `Partially Paid` (Yellow), `Unpaid` (Red).
  - Row Actions:
    1. **Pay** (Opens payment gateway dialog: PayPal, Stripe, Cash, Cheque, Bank Transfer).
    2. **Payment Reminder** (Sends instant email/SMS alert to resident).
    3. **View Invoice** (Opens printable formatted tax invoice with breakdown and PDF export).
* **Charges List URL:** `page=accounts&tab=charges-list`
  - Columns: `Image` | `Charges Type` | `Charge Period` | `Charge Calculate By` (Fix Charge, Measurement Area) | `Discount Amount` | `Amount After Discount` | `Tax Amount` | `Total Amount` | `Created Date` | `Action`
* **Expense List URL:** `page=accounts&tab=expense-list`
  - Columns: `Image` | `Expense Type` | `Vendor Name` | `Amount` | `Payment Date` | `Action` (View Invoice, Edit, Delete).

---

### MOD-16: Assets & Inventory Tracker
* **Assets URL:** `page=assets-inventory-tracker&tab=assets_list`
  - Columns: `Image` | `Asset No` | `Facility Name` | `Asset Name` | `Asset Category` | `Purchase Date` | `Asset Cost ($)` | `Action`
* **Inventory URL:** `page=assets-inventory-tracker&tab=inventory_list`
  - Columns: `Image` | `Inventory Name` | `Inventory Category` | `Quantity` | `Action`

---

### MOD-17: Reports Engine
* **Unit By Building:** Tabular and card summary of occupied vs vacant units per building block.
* **Members By Building:** Graphical bar chart and datatable showing resident distribution.
* **Finance / Payment Income:** Graphical revenue chart (monthly income, total collected, outstanding dues).
* **Complaint Status Report:** Pie chart breakdown of Open vs In Progress vs Resolved complaints.
