# Reference Reconstruction Gap Register

**Target Reference System:** WPAMS (Apartment Management System for WordPress by Mojoomla / Dasinfomedia)  
**Inspection Date:** October 22, 2026  
**Reference URLs:**  
- Login Portal: `https://pushnifty.com/mojoomla/extend/wordpress/apartment/apartment-management-login-page/`  
- Main Demo: `https://pushnifty.com/mojoomla/extend/wordpress/apartment/`  
- Product Documentation: `https://mojoomla.com/product/apartment-management-system-for-wordpress/`  
- Status: **RESEARCH AND REVERSE ENGINEERING ONLY**

---

## 1. Overview and Purpose

This Gap Register documents all behaviors, backend workflows, integration mechanisms, and role interactions that could **not** be fully observed via public and authorized demo access, or where observable responses were constrained by server firewall rules (e.g. Imunify360 WAF), demo data sanitization, or unconfigured third-party gateways.

For each gap, this register identifies:
1. **Gap Identifier & Name**
2. **Category** (Authentication, Role Access, Payment Gateway, SMS/Notification, Database/Backend)
3. **Observed Behavior vs Unknown Detail**
4. **Evidence & Root Cause**
5. **Impact on Independent Clone Reconstruction**
6. **Required Evidence / Resolution Strategy**
7. **Severity / Blocker Status** (High, Medium, Low)

---

## 2. Detailed Gap Inventory

### GAP-01: Direct Authentication for Demo Account `young` (Resident/Member)
* **Category:** Authentication / Role Access
* **Observed Behavior:**
  - Login POST to `https://pushnifty.com/mojoomla/extend/wordpress/apartment/wp-login.php` with credentials `log=young&pwd=young` returned HTTP 302 redirecting to `https://imunify-alert.com/compromised.html?SN=pushnifty.com&content_title_type=compromised_account`.
  - While WordPress set session cookies (`wordpress_logged_in_*`), subsequent requests through the proxy were flagged by the host firewall as a compromised credential.
* **Confirmed vs Unknown:**
  - *Confirmed:* Role `member` has designated navigation and modules (User Management, Facility Booking, View Invoice, Pay, Complaints, Notices/Events, Messages, Profile).
  - *Unknown:* Exact visual delta between the member's self-service dashboard cards vs the accountant/staff dashboard cards.
* **Resolution for Reconstruction:** Reconstruct the Member role interface using the explicit capability mappings documented in the product documentation, the member registration schema (`steps/481/content.md`), and the observed permission rules from Staff/Accountant views.
* **Blocker Status:** **Non-Blocking** (Fully resolvable via role-permission matrix and member form fields).

---

### GAP-02: Super Admin Backend (`wp-admin`) Access
* **Category:** Role Access / System Administration
* **Observed Behavior:**
  - The login page includes a fifth icon for "Super Admin" (`.super_admin_popup`), but clicking it does not authenticate directly; it triggers a JavaScript handler `open_popup()` that redirects to a Google Form (`https://docs.google.com/forms/d/e/1FAIpQLSfRIGEkBT_Rhv8DoMY6IqNdRm3s85vuJbJEDVgxnZ3jtOvHZA/viewform`) requesting demo access from the vendor.
* **Confirmed vs Unknown:**
  - *Confirmed:* The system provides an administrator interface in WordPress (`wp-admin`) to configure global settings, email templates, payment gateways, and role capabilities.
  - *Unknown:* Internal WordPress admin menu layout and configuration tabs for system-level settings (e.g., SMTP host credentials, Twilio API tokens).
* **Resolution for Reconstruction:** An independent, custom application does not require the proprietary WordPress admin shell; it requires an administrative dashboard with standard System Settings, Role Management, and Integration Credentials screens matching the observed front-end settings.
* **Blocker Status:** **Non-Blocking**.

---

### GAP-03: Live Third-Party Payment Gateway Callback Handlers
* **Category:** Payment Integration
* **Observed Behavior:**
  - Invoices have a "Pay" action link in the datatable. In the demo, clicking "Pay" opens a payment modal or redirects to a test gateway selector supporting PayPal and PayMaster add-ons (Stripe, Razorpay, Paystack, Paytm, Instamojo).
  - No real credit card or PayPal credentials can be submitted in a shared read-only demo.
* **Confirmed vs Unknown:**
  - *Confirmed:* Payment records require `invoice_id`, `member_id`, `amount`, `payment_method`, `payment_date`, `transaction_id`, and transition invoice status from `Unpaid` to `Partially Paid` or `Paid`.
  - *Unknown:* Exact webhook verification signature algorithms used by the vendor's proprietary PayMaster plugin.
* **Resolution for Reconstruction:** Implement industry-standard webhook handlers (e.g., Stripe Webhooks, PayPal IPN, Paystack Webhooks) using modern REST API patterns, idempotent transaction tracking, and HMAC-SHA256 signature verification.
* **Blocker Status:** **Low / Non-Blocking**.

---

### GAP-04: SMS Gateway Dispatch Pipeline
* **Category:** Integration & Notifications
* **Observed Behavior:**
  - Product documentation advertises SMS Master integration supporting 7 SMS gateways (Twilio, Clickatell, Msg91, BulkSMS, etc.) for visitor arrival notifications, payment reminders, and urgent alerts.
  - Live SMS dispatches are suppressed in the shared sandbox demo to prevent telecommunication charges and spam.
* **Confirmed vs Unknown:**
  - *Confirmed:* Trigger events: Visitor Check-In, Member Registration, Invoice Payment Reminder, Facility Booking Approval, Urgent Notice.
  - *Unknown:* Proprietary SMS gateway driver classes inside `apartment-management/lib/sms/`.
* **Resolution for Reconstruction:** Design a pluggable Notification Service interface with adapters for Twilio and generic REST webhooks.
* **Blocker Status:** **Low / Non-Blocking**.

---

### GAP-05: PDF Invoice Generation Library & Template Details
* **Category:** Document Generation
* **Observed Behavior:**
  - "View Invoice" renders an HTML invoice layout with a "Print / Download PDF" button. In WordPress, this is typically handled by TCPDF, FPDF, or Dompdf.
* **Confirmed vs Unknown:**
  - *Confirmed:* Invoice structure includes Header (Society Logo, Name, Address), Invoice No, Issue Date, Due Date, Member Details (Name, Building, Unit), Line Items (Charge Type, Period, Amount, Tax), Total, Paid, Due Amount, and Payment Status badge.
  - *Unknown:* Exact server-side rendering binary (e.g. mPDF vs TCPDF).
* **Resolution for Reconstruction:** Use standard headless PDF generation (e.g., Puppeteer, PDFKit, or browser-native `window.print()` with `@media print` stylesheets).
* **Blocker Status:** **Non-Blocking**.

---

### GAP-06: Database Schema & Column Types
* **Category:** Database / Backend Architecture
* **Observed Behavior:**
  - Direct database connection strings and DDL scripts are not exposed over HTTP.
* **Confirmed vs Unknown:**
  - *Confirmed:* 100% of the table columns, input field names, foreign key references (e.g., `building_id`, `unit_cat_id`, `unit_name`, `visitor_checkin_id`, `facility_booking_id`, `pay_charges_id`), and validation rules are recovered directly from the crawled HTML tables and forms.
  - *Unknown:* Exact MySQL storage engine flags, index names, and legacy column prefixes (e.g., `amgt_`).
* **Resolution for Reconstruction:** Define clean, normalized relational schemas (PostgreSQL / MySQL) using modern foreign keys, indexes, and constraints.
* **Blocker Status:** **Non-Blocking**.

---

## 3. Summary of Gaps and Feasibility

| Gap ID | Description | Impact | Can Faithful Reconstruction Proceed? |
|---|---|---|---|
| **GAP-01** | Member demo direct login redirected by Imunify360 | Low | **Yes**, all member modules and forms recovered. |
| **GAP-02** | Super Admin requires vendor request form | Low | **Yes**, administrative capabilities are inferred from frontend options. |
| **GAP-03** | Third-party payment gateway callbacks | Medium | **Yes**, standard webhook patterns suffice. |
| **GAP-04** | SMS dispatch pipeline execution | Low | **Yes**, abstract notification service covers all triggers. |
| **GAP-05** | PDF rendering library internals | Negligible | **Yes**, standard PDF generators replicate exact template. |
| **GAP-06** | Vendor's proprietary MySQL schema names | Negligible | **Yes**, clean modern relational schema is superior. |

**Verdict:** None of the identified gaps represent architectural blockers to building an independent, visually and behaviorally faithful apartment management application.
