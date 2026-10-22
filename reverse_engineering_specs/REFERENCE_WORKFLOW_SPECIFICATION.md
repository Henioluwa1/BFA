# Reference Workflow Specification

**Target System:** WPAMS (Apartment Management System for WordPress)  
**Inspection Date:** October 22, 2026  
**Status:** Empirically Verified & Specified for Clean Independent Reconstruction

---

## 1. Authentication and Role-Based Redirection Workflow

### Overview
Handles credential verification, session initialization, role extraction, and automatic routing to role-specific dashboard views.

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Resident / Staff / Accountant / Gatekeeper)
    participant UI as Login Page UI
    participant Auth as Authentication Service
    participant Session as Session & Cookie Manager
    participant Router as Navigation Router
    participant Dash as Role Dashboard

    User->>UI: Enters Email / Username & Password (or clicks role prefill)
    User->>UI: Clicks "Log In" Button
    UI->>Auth: POST /wp-login.php (log, pwd, rememberme, redirect_to)
    alt Invalid Credentials
        Auth-->>UI: 302 Redirect to /wp-login.php?login=failed
        UI-->>User: Displays error alert ("Invalid username or password")
    else Host / WAF Blocked Account (e.g. young)
        Auth-->>UI: 302 Redirect to WAF alert page
        UI-->>User: WAF / Compromised credential barrier
    else Valid Credentials (kenneth / jennifer / carol)
        Auth->>Session: Generate session tokens & auth cookies (wordpress_logged_in_*)
        Auth-->>Router: 302 Redirect to ?apartment-dashboard=user
        Router->>Auth: Verify role & capabilities (Staff / Accountant / Gatekeeper)
        Router->>Dash: Render filtered Dashboard widgets & Sidebar accordion
        Dash-->>User: Display role-authorized portal
    end
```

### Specification Details
1. **Actor:** Any registered user (Member, Accountant, Staff Member, Gatekeeper, Committee Admin).
2. **Preconditions:** Active user account exists with designated role in system.
3. **Trigger:** Form submit on `/apartment-management-login-page/`.
4. **Validation:** Non-empty username, password validation; sanitization of input characters.
5. **State Transition:** `Unauthenticated` -> `Authenticated (Role: Member | Staff | Accountant | Gatekeeper)`.
6. **Acceptance Criteria:**
   - Valid credentials route user to `?apartment-dashboard=user`.
   - Sidebar displays only authorized module categories.
   - Session logout clears auth tokens and redirects to homepage.

---

## 2. Member Self-Registration & Approval Workflow

### Overview
Allows a prospective or current resident (Owner or Tenant) to submit their building, unit, personal, contact, and family information for onboarding.

```mermaid
flowchart TD
    A[Prospective Resident Opens Registration Page] --> B[Selects Building from Dropdown]
    B --> C[Selects Unit Category]
    C --> D[AJAX Loads Available Units for Building + Category]
    D --> E[Selects Unit Name & Member Type: Owner / Tenant]
    E --> F[Enters Personal Info: Name, DOB, Gender, Mobile, Avatar]
    F --> G[Enters Account Credentials: Email & Password]
    G --> H{Adds Family Members?}
    H -- Yes --> I[Clicks + Add Family Member: Sub-form Row Added]
    I --> J[Enters Family Name, DOB, Gender, Mobile, Relation Type]
    J --> H
    H -- No --> K[Submits Registration Form]
    K --> L{Server Validation}
    L -- Email Exists / Invalid Fields --> M[Displays Inline Validation Errors]
    L -- Valid --> N[Record Saved in Database with Status: Pending Approval]
    N --> O[Email Notification Sent to Society Management]
    O --> P[Confirmation Message Displayed to Resident]
    P --> Q[Staff / Admin Reviews & Approves Member in Member Module]
    Q --> R[Status Updated to Active / Occupied]
    R --> S[Welcome Email with Login Credentials Dispatched to Member]
```

### Specification Details
1. **Actor:** Resident (Owner or Tenant).
2. **Preconditions:** Building and Unit must already exist in system database.
3. **Trigger:** Click *"Submit"* on `/apartment-management-member-registration-page/`.
4. **Processing & Business Rules:**
   - Unit selection must cascade dynamically: `building_id` -> `unit_cat_id` -> available `unit_name`.
   - Email uniqueness checked asynchronously via AJAX (`admin-ajax.php`).
   - Occupied date defaults to current date if occupied immediately.
   - Member status initialized to `Pending Approval` until verified by management.
5. **Acceptance Criteria:**
   - Registration creates primary Member record and multiple child Family records.
   - Password stored as secure Argon2/bcrypt hash.
   - Successful submission returns success notification banner.

---

## 3. Invoice Generation and Payment Recording Workflow

### Overview
Allows accountants to generate recurring or ad-hoc maintenance bills for units, track payment statuses, issue reminders, and accept online or manual payments.

```mermaid
sequenceDiagram
    autonumber
    actor Acc as Accountant / Staff
    participant Accounts as Accounts Module
    participant DB as System Database
    actor Res as Resident / Member
    participant Gateway as Payment Gateway / Cashier

    Acc->>Accounts: Selects "Charges" & defines billing rates (Fix or Area-based)
    Acc->>Accounts: Clicks "Add Invoice" (Selects Building, Unit, Member, Date Range)
    Accounts->>DB: Calculates (Base Charge + Taxes - Discounts)
    DB-->>Accounts: Invoice Generated (Status: Unpaid, Invoice No: INV-XXXXX)
    Accounts->>Res: Dispatches Email Notification & Payment Link
    alt Resident Pays via Portal
        Res->>Accounts: Opens Invoice list, clicks "Pay"
        Accounts->>Gateway: Initiates Payment Session (Card / PayPal / Bank)
        Gateway-->>Accounts: Payment Confirmed (Transaction ID, Amount)
        Accounts->>DB: Record Payment, Update Status: Paid (or Partially Paid)
        Accounts->>Res: Deliver Printable PDF Receipt
    else Offline Cash / Bank Transfer
        Res->>Acc: Submits Cheque / Cash
        Acc->>Accounts: Records Manual Payment (Amount, Method, Date, Reference)
        Accounts->>DB: Update Paid Amount & Status: Paid
        Accounts->>Res: Issue Signed Receipt
    else Payment Overdue
        Acc->>Accounts: Clicks "Payment Reminder"
        Accounts->>Res: Automated SMS / Email Overdue Warning sent
    end
```

### Specification Details
1. **Actor:** Accountant (Kenneth) or Resident (Young).
2. **Preconditions:** Active residential unit, assigned member, and configured charge type.
3. **Calculation Formula:**
   $$\text{Subtotal} = \begin{cases} \text{Fixed Rate} & \text{if Fixed Charge} \\ \text{Unit Area} \times \text{Rate per sq ft} & \text{if Area Based} \end{cases}$$
   $$\text{Total Amount} = (\text{Subtotal} - \text{Discount}) + \text{Tax Amount}$$
   $$\text{Due Amount} = \text{Total Amount} - \text{Paid Amount}$$
4. **Status Transitions:**
   - If $\text{Paid Amount} = 0$: `Unpaid`
   - If $0 < \text{Paid Amount} < \text{Total Amount}$: `Partially Paid`
   - If $\text{Paid Amount} \ge \text{Total Amount}$: `Paid`
5. **Acceptance Criteria:**
   - Payment reminders can be triggered with one click per row.
   - Printable invoice layout reproduces society header, invoice number, itemization, and stamp.

---

## 4. Visitor Request, Gate Check-In, and Departure Workflow

### Overview
Tracks visitors, contractors, and delivery personnel entering society premises via gatekeeper authorization.

```mermaid
flowchart TD
    A[Visitor Arrives at Society Gate] --> B[Gatekeeper Opens Visitor Module]
    B --> C[Gatekeeper Clicks 'Add Visitor Request']
    C --> D[Selects Gate, Building, Unit Number]
    D --> E[Enters Visitor Name, Mobile, ID Proof, Vehicle No]
    E --> F[Selects Visit Purpose: Guest, Delivery, Service, Cab]
    F --> G[Submits Check-In: Record created with Check-In Date & Time]
    G --> H[Automated Notification Sent to Resident App / SMS]
    H --> I[Visitor Enters Premises (Status: Entered)]
    I --> J[Visitor Finishes Visit & Returns to Gate]
    J --> K[Gatekeeper Locates Record in Datatable]
    K --> L[Clicks 'Check-Out Now']
    L --> M[System Records Check-Out Time]
    M --> N[Status Updated to 'Checked Out']
    N --> O[Record Locked in Historical Audit Log]
```

### Specification Details
1. **Actor:** Gatekeeper (Carol) or Resident (pre-announcing visitor).
2. **Preconditions:** Registered gate (e.g. Gate 1 - Main Gate) and destination unit.
3. **Table Columns:** `Visitor Name - ID Number - Vehicle Number` | `Gate Name` | `Building & Unit Name` | `Check-In Date` | `Check-In Time` | `Check-Out Time` | `Status`.
4. **State Transition:** `Pre-Approved (Optional)` -> `Entered / Checked In` -> `Checked Out`.
5. **Acceptance Criteria:**
   - System automatically timestamps Check-In and Check-Out.
   - Gatekeepers can filter by active visitors currently on premises (`Check-Out Time IS NULL`).

---

## 5. Complaint Submission and Maintenance Resolution Workflow

### Overview
Allows residents to report facility or unit issues, and enables staff to assign, investigate, resolve, and close tickets.

```mermaid
sequenceDiagram
    autonumber
    actor Res as Resident / Member
    participant Comp as Complaint Module
    participant DB as System Database
    actor Staff as Maintenance Staff (Jennifer)

    Res->>Comp: Opens Complaints, Clicks "Add Complaint"
    Res->>Comp: Selects Nature (Plumbing / Electrical / Noise / Cleanliness)
    Res->>Comp: Enters Title, Description, Date & Time of Occurrence
    Comp->>DB: Save Complaint (Status: Open, Date: Today)
    Comp->>Staff: Alert Dispatched to Maintenance Dashboard
    Staff->>Comp: Views Complaint Details
    Staff->>Comp: Updates Status to "In Progress", Assigns Staff Member
    Comp->>Res: Status Update Notification ("Technician Assigned")
    Staff->>Comp: Fixes issue, Enters "Resolution" notes
    Staff->>Comp: Updates Status to "Closed"
    Comp->>DB: Save Resolution Timestamp & Status: Closed
    Comp->>Res: Resolution Alert Dispatched
```

### Specification Details
1. **Actor:** Resident (Reporter) and Staff (Resolver).
2. **Statuses:** `Open` (Red) -> `In Progress` (Yellow) -> `Closed` (Green).
3. **Fields:** Complaint Nature, Title, Unit, Date, Time, Description, Resolution Notes, Assigned Technician.
4. **Acceptance Criteria:**
   - Closed complaints cannot be re-opened by non-staff without admin privilege.
   - Status transitions reflect immediately in Dashboard metrics and Complaint reports.

---

## 6. Facility Reservation and Approval Workflow

### Overview
Manages shared society amenities (Club House, Swimming Pool, Tennis Court, Banquet Hall) with hourly/daily pricing and conflict prevention.

```mermaid
flowchart TD
    A[Member Opens Facility Booking Tab] --> B[Views Available Amenities & Hourly Rates]
    B --> C[Selects Facility & Desired Start/End Date & Time]
    C --> D{System Conflict Check}
    D -- Overlapping Booking Exists --> E[Displays Alert: Slot Already Booked]
    D -- Slot Available --> F[Calculates Total Booking Charge]
    F --> G[Submits Booking Request]
    G --> H[Saved with Status: Pending Approval]
    H --> I[Staff / Admin Receives Approval Request]
    I --> J{Staff Decision}
    J -- Rejects --> K[Status: Canceled / Rejected with Reason]
    J -- Approves --> L[Status: Approved]
    L --> M[Booking Synced to FullCalendar Widget]
    M --> N[Confirmation Alert & Invoice Issued to Member]
```

### Specification Details
1. **Actor:** Member (Requester) and Staff / Accountant (Approver).
2. **Pricing Model:** Charge Per Hour, Charge Per Day, or Fixed Flat Fee.
3. **Validation:** No two approved bookings may overlap for the same facility on identical time slots.
4. **Status Transitions:** `Pending Approval` -> `Approved` or `Canceled`.
5. **Acceptance Criteria:**
   - Approved facility reservations appear on the public/authenticated FullCalendar dashboard.

---

## 7. Role-Permission Enforcement Workflow

### Overview
Guarantees strict separation of concerns across Member, Staff, Accountant, and Gatekeeper roles.

```mermaid
flowchart TD
    A[Incoming HTTP Request to Module URL] --> B[Extract Session Cookie & Role]
    B --> C{Is Session Authenticated?}
    C -- No --> D[Redirect to Login Page]
    C -- Yes --> E{Check Role Capability Matrix}
    E -- Module Allowed for Role --> F[Render Requested Page / Execute Action]
    E -- Module Forbidden for Role --> G[HTTP 403 Forbidden / Redirect to Dashboard]
```

### Role-Capability Matrix
| Module / Capability | Super Admin | Accountant (Kenneth) | Staff (Jennifer) | Gatekeeper (Carol) | Member (Young) |
|---|:---:|:---:|:---:|:---:|:---:|
| **Dashboard KPI Metrics** | Full | Accounts/Complaints | Operations/Visitors | Security/Visitors | Personal Only |
| **Manage Buildings & Units** | Full | View / Edit | View / Edit | View Only | View Assigned |
| **Member Management** | Full | View / Edit | View / Edit | View Only | View Profile |
| **Invoices & Charges** | Full | Full Access | View Only | Forbidden | View / Pay Self |
| **Expenses Recording** | Full | Full Access | Forbidden | Forbidden | Forbidden |
| **Visitor Check-In/Out** | Full | View Only | Full Access | Full Access | Request Only |
| **Parking Slot Assignment** | Full | View Only | Full Access | View Only | View Assigned |
| **Facility Approvals** | Full | Approve / Invoice | Approve / Manage | Forbidden | Book / Pay |
| **Complaints Handling** | Full | View Only | Resolve / Close | View Only | Submit / Track |
| **Notice Board Management** | Full | Create / View | Create / View | View Only | View Only |
| **Financial Reports** | Full | Full Access | Forbidden | Forbidden | Forbidden |
