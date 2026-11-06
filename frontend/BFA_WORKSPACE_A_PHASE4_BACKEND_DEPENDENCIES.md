# BFA APARTMENTS MANAGEMENT SYSTEM
# WORKSPACE A — PHASE 4: BACKEND DEPENDENCIES & ENHANCEMENT AUDIT
## Recommended Workspace C Endpoints & Integration Services for Full Guest Lifecycle Automation

**Date:** November 2, 2026  
**Workspace Author:** Workspace A — Public Website & Guest Experience Team  
**Target Recipient:** Workspace C — Core Backend & Architecture Team  
**Status:** Non-Blocking Documentation / Enhancement Requests  

---

## 1. CONTEXT & WORKSPACE BOUNDARY DISCIPLINE

During the implementation of **Workspace A — Phase 4 (Guest Experience, Booking Confirmation & Reservation Status Tracking)**, the frontend team adhered strictly to the principle of zero modifications to backend code or database schemas. 

The public website was engineered to operate cleanly against existing endpoints:
- `POST /api/v1/public/check-availability`
- `POST /api/v1/public/upload-proof`
- `POST /api/v1/public/booking`
- `POST /api/v1/public/booking-tracking/lookup`
- `POST /api/v1/public/booking-tracking/request-room-change`
- `POST /api/v1/public/booking-tracking/request-cancellation`

However, several real-world guest lifecycle edge cases currently require manual guest coordination (via WhatsApp Concierge or front desk contact) because supporting backend endpoints or integration gateways do not yet exist in Workspace C.

This document formally records these dependencies so Workspace C can implement them in future architectural cycles without frontend breaking changes.

---

## 2. MISSING CAPABILITY 1: POST-BOOKING PAYMENT PROOF UPLOAD

### 2.1 The Issue
Currently, `POST /api/v1/public/upload-proof` is designed only as a pre-booking stage for bank transfer bookings. The uploaded file is staged, and its file metadata is sent into `POST /api/v1/public/booking`.

If a guest:
1. Selects **Bank Transfer** during initial booking but does not upload proof immediately (or abandons the upload step), or
2. Has their initial payment proof reviewed and marked as unreadable/rejected by the front desk, or
3. Chooses **Pay at Property** but later decides to remit via bank transfer prior to check-in,

there is currently **no public endpoint** that allows an authenticated guest to attach proof to an existing reservation.

### 2.2 Current Workspace A Frontend Mitigation
The frontend stay tracker detects when a reservation has `paymentStatus: "NOT_SUBMITTED"` or `"DECLINED"`. Because no attachment API exists, the UI provides clear financial instructions and directs the guest to share their proof of transfer directly with the concierge team via WhatsApp with one click, pre-filling their `reservationCode`.

### 2.3 Required Workspace C Contract Specification
Workspace C should implement a secure endpoint:
```http
POST /api/v1/public/booking-tracking/attach-proof
Content-Type: application/json
```

#### Request Payload:
```json
{
  "reservationCode": "BFA-BT-MVZKLN0B-701",
  "guestEmail": "guest@example.com",
  "fileData": "data:image/jpeg;base64,...",
  "fileType": "image/jpeg",
  "notes": "Bank transfer receipt sent from Zenith app"
}
```

#### Expected Backend Logic:
1. Validate `reservationCode` matches `guestEmail` in the database.
2. Validate file MIME type (JPEG, PNG, WebP) and size (≤ 5MB).
3. Associate file with the existing `payments` record for this reservation.
4. Transition `payment_status` from `NOT_SUBMITTED` / `DECLINED` to `PROOF_UPLOADED`.
5. Log an audit trail entry (`PUBLIC_GUEST_PAYMENT_PROOF_ATTACHED`).
6. Emit front desk event via WebSocket (`payment:proof_submitted`).

---

## 3. MISSING CAPABILITY 2: AUTOMATED TRANSACTIONAL MESSAGING GATEWAY

### 3.1 The Issue
The backend currently creates reservations and generates digital access codes (`authCode`), but lacks an automated transactional delivery gateway (e.g., SendGrid, Mailgun, Amazon SES for Email; Termii, Twilio for SMS).

Consequently, guests do not receive automatic confirmation emails or SMS delivery of their digital access pin when front desk staff confirm their booking.

### 3.2 Current Workspace A Frontend Mitigation
- The post-submission modal strongly advises guests to:
  1. Copy their booking reference code.
  2. Bookmark their personalized tracking URL (`/track?ref=...&email=...`).
  3. Print or save their official booking receipt.
- A one-click WhatsApp concierge dispatch link allows guests to send a pre-formatted stay confirmation message directly to the front desk.

### 3.3 Required Workspace C Infrastructure
Workspace C should integrate an asynchronous event queue or webhook dispatcher:
1. **On `RESERVATION_CREATED`**:
   - Send Email / SMS: "BFA Apartments: We have received your booking request `BFA-XXXX`. Tracking link: `https://bfa-apartments.com/track?ref=...`"
2. **On Status Transition to `CONFIRMED`**:
   - Send Email / SMS: "BFA Apartments: Your booking `BFA-XXXX` is confirmed! Apartment: 201, Azure Bay. Your digital access door PIN is `123456`. Check-in is at 14:00."
3. **On Status Transition to `CANCELLED`**:
   - Send Email / SMS: "BFA Apartments: Your cancellation request for `BFA-XXXX` has been processed."

---

## 4. MISSING CAPABILITY 3: REAL-TIME WEBSOCKET ROOMS FOR PUBLIC TRACKING

### 4.1 The Issue
While backend socket emitters exist (`src/core/websocket/engine.js`), they are currently configured for authenticated internal staff dashboards (`frontdesk:new_booking`). Public guests visiting `/track` have no direct socket room connection and must manually refresh the page or trigger a lookup to see status transitions.

### 4.2 Required Workspace C Contract Specification
Workspace C should expose a scoped, read-only WebSocket channel:
```
ws://host:port/ws/public-tracking?ref=BFA-XXXX&email=guest@example.com
```
When a receptionist confirms a booking or reassigns an apartment in Workspace B, the socket server broadcasts a lightweight status delta event:
```json
{
  "event": "reservation_updated",
  "reservationCode": "BFA-XXXX",
  "status": "CONFIRMED",
  "paymentStatus": "VERIFIED"
}
```
The frontend `TrackStayPage.jsx` can then subscribe to this room and update the timeline in real time without polling.

---

## 5. SUMMARY OF BACKEND ROADMAP PRIORITIES

| Priority | Dependency | Impact on Guest Experience | Workspace C Estimated Effort |
| :--- | :--- | :--- | :--- |
| **High** | `POST /api/v1/public/booking-tracking/attach-proof` | Eliminates manual WhatsApp receipt routing for secondary proof uploads. | Small (1–2 days) |
| **High** | Transactional Email / SMS Gateway Integration | Ensures guests receive reference numbers and passcodes outside the browser. | Medium (3–4 days) |
| **Medium** | Public Real-Time WebSocket Rooms | Eliminates manual page refresh on the tracking screen. | Small (1 day) |

All frontend structures built in Phase 4 have been designed to plug directly into these endpoints with zero UI regression once Workspace C deploys them.

