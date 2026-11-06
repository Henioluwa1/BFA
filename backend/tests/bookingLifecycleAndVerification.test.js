/**
 * BFA Serviced Luxury Apartments - Booking Lifecycle, Payment Proof Verification,
 * Receptionist Dispatch & Claiming, Tracking, and Guest Self-Service Integration Suite
 *
 * Target DB: bfa_apartments_test_db
 */

process.env.NODE_ENV = 'test';
jest.setTimeout(30000);

const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const { assertTestDatabase } = require('../src/db/databaseGuard');
const seedBankSettings = require('../src/scripts/seedBankSettings');

describe('Booking Lifecycle, Payment Proof Verification & Tracking Suite', () => {
  let adminToken = '';
  let receptionistToken = '';
  let receptionistUser = null;
  let managerToken = '';
  let managerUser = null;

  let testApartmentId = null;
  let testSecondApartmentId = null;
  let testPropertyId = 1;
  let createdReservationIds = [];

  beforeAll(async () => {
    assertTestDatabase(process.env.DB_NAME || 'bfa_apartments_test_db', 'BookingLifecycle Tests');

    // Ensure official bank settings exist in test DB
    await seedBankSettings();

    // Authenticate Admin
    const aRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = aRes.body.data?.token;

    // Authenticate Receptionist (Elena Ramos)
    const rRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = rRes.body.data?.token;
    receptionistUser = rRes.body.data?.user;

    // Authenticate Manager
    const mRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mRes.body.data?.token;
    managerUser = mRes.body.data?.user;

    // Pick two active apartments in Property 1
    const apts = await pool.query(
      'SELECT id, property_id, rate_per_night FROM apartments WHERE property_id = 1 AND is_active = 1 LIMIT 2'
    );
    testApartmentId = apts[0].id;
    testSecondApartmentId = apts[1].id;
    testPropertyId = apts[0].property_id;

    // Reset status to AVAILABLE
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id IN (?, ?)', [testApartmentId, testSecondApartmentId]);

    // Clean up any lingering reservations from previous runs
    const lingering = await pool.query('SELECT id FROM reservations WHERE apartment_id IN (?, ?)', [testApartmentId, testSecondApartmentId]);
    for (const r of lingering) {
      await pool.query('DELETE FROM reservation_staff_assignments WHERE reservation_id = ?', [r.id]);
      await pool.query('DELETE FROM operational_evidence_attachments WHERE reservation_id = ?', [r.id]);
      await pool.query('DELETE FROM payment_receipts WHERE reservation_id = ?', [r.id]);
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [r.id]);
      await pool.query('DELETE FROM employee_activities WHERE metadata LIKE ?', [`%"reservationId":${r.id}%`]);
      await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [r.id]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [r.id]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [r.id]);
    }
  });

  afterEach(async () => {
    if (createdReservationIds.length > 0) {
      for (const resId of createdReservationIds) {
        await pool.query('DELETE FROM reservation_staff_assignments WHERE reservation_id = ?', [resId]);
        await pool.query('DELETE FROM operational_evidence_attachments WHERE reservation_id = ?', [resId]);
        await pool.query('DELETE FROM payment_receipts WHERE reservation_id = ?', [resId]);
        await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [resId]);
        await pool.query('DELETE FROM employee_activities WHERE metadata LIKE ?', [`%"reservationId":${resId}%`]);
        await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [resId]);
        await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [resId]);
        await pool.query('DELETE FROM reservations WHERE id = ?', [resId]);
      }
      createdReservationIds = [];
    }
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id IN (?, ?)', [testApartmentId, testSecondApartmentId]);
  });

  afterAll(async () => {
    if (pool.getPool) {
      await pool.getPool().end();
    }
  });

  test('1. Payment Configuration: Returns official BFA bank details without exposing sensitive internals', async () => {
    const res = await request(app).get('/api/v1/public/payment-config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isConfigured).toBe(true);
    expect(res.body.data.bankName).toBe('Zenith Bank PLC');
    expect(res.body.data.accountName).toBe('BFA Serviced Luxury Apartments Ltd');
    expect(res.body.data.accountNumber).toBe('1018273645');
    expect(res.body.data.allowedPaymentMethods).toContain('BANK_TRANSFER');
  });

  test('2. Proof Upload Validation: Accepts valid image and rejects oversized files or invalid mime types', async () => {
    // Valid 1x1 PNG image as base64
    const validPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const validUpload = await request(app)
      .post('/api/v1/public/upload-proof')
      .send({
        fileData: validPngBase64,
        fileName: 'my_transfer_slip.png',
        fileType: 'image/png',
      });

    expect(validUpload.status).toBe(200);
    expect(validUpload.body.success).toBe(true);
    expect(validUpload.body.data.proofUrl).toMatch(/\/uploads\/payment_proofs\/proof_/);
    expect(validUpload.body.data.mimeType).toBe('image/png');

    // Invalid file type rejection
    const invalidUpload = await request(app)
      .post('/api/v1/public/upload-proof')
      .send({
        fileData: 'data:application/pdf;base64,JVBERi0xLjQK',
        fileName: 'hack.exe',
        fileType: 'application/pdf',
      });

    expect(invalidUpload.status).toBe(422);
    expect(invalidUpload.body.success).toBe(false);
    expect(invalidUpload.body.error.message).toMatch(/Only JPEG, PNG, and WebP payment receipts are supported/i);
  });

  test('3. Public Booking Flow: Uploading receipt does NOT mark payment received or booking approved', async () => {
    const today = new Date().toISOString().split('T')[0];

    const bookingRes = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: testApartmentId,
        guestName: 'Chinedu Eze',
        guestEmail: 'chinedu.eze@example.com',
        guestPhone: '+234 803 777 8888',
        checkInDate: today,
        paymentMethod: 'BANK_TRANSFER',
        proofUrl: '/uploads/payment_proofs/proof_test_sample.png',
        proofFileName: 'chinedu_zenith_transfer.png',
        proofFileSizeBytes: 45210,
        proofMimeType: 'image/png',
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.success).toBe(true);

    const booking = bookingRes.body.data;
    createdReservationIds.push(booking.id);

    // INVARIANT VERIFICATION: Status is strictly PENDING_REVIEW, payment is PROOF_UPLOADED, paidAmount is 0
    expect(booking.status).toBe('PENDING_REVIEW');
    expect(booking.paymentStatus).toBe('PROOF_UPLOADED');
    expect(booking.paidAmount).toBe(0.00);
    expect(booking.outstandingBalance).toBeGreaterThan(0);
    // authCode must be null/hidden to guest until approved!
    expect(booking.authCode).toBeNull();
    expect(booking.reviewNotice).toMatch(/2–5 minutes/i);

    // Verify DB record
    const [dbRes] = await pool.query('SELECT * FROM reservations WHERE id = ?', [booking.id]);
    expect(dbRes.status).toBe('PENDING_REVIEW');
    expect(dbRes.payment_status).toBe('PROOF_UPLOADED');
    expect(parseFloat(dbRes.paid_amount)).toBe(0.00);
    expect(dbRes.payment_proof_path).toBe('/uploads/payment_proofs/proof_test_sample.png');
  });

  test('4. Receptionist Concurrency-Safe Claim & Verification: Claims booking and verifies payment', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Create pending booking
    const bookingRes = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: testApartmentId,
        guestName: 'Fatima Bello',
        guestEmail: 'fatima.bello@example.com',
        guestPhone: '+234 802 333 4444',
        checkInDate: today,
        paymentMethod: 'BANK_TRANSFER',
        proofUrl: '/uploads/payment_proofs/fatima_proof.png',
      });

    const resId = bookingRes.body.data.id;
    const refCode = bookingRes.body.data.reservationCode;
    createdReservationIds.push(resId);

    // 4a. Receptionist claims the booking
    const claimRes = await request(app)
      .post(`/api/v1/front-office/reservations/${resId}/claim`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.assigned_staff_id).toBe(receptionistUser.id);
    expect(claimRes.body.data.status).toBe('CLAIMED');

    // 4b. Concurrency guard: Second staff member cannot claim same booking
    const concurrentClaim = await request(app)
      .post(`/api/v1/front-office/reservations/${resId}/claim`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(concurrentClaim.status).toBe(409);
    expect(concurrentClaim.body.error.message).toMatch(/One client cannot be assigned to two front desk staffs/i);

    // 4c. Receptionist independently verifies transfer against bank records and approves
    const approveRes = await request(app)
      .post(`/api/v1/front-office/reservations/${resId}/approve`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('CONFIRMED');
    expect(approveRes.body.data.payment_status).toBe('VERIFIED');
    expect(parseFloat(approveRes.body.data.paid_amount)).toBe(parseFloat(approveRes.body.data.total_amount));

    // 4d. Guest tracking lookup now reveals approved status and reveals authCode!
    const trackRes = await request(app)
      .post('/api/v1/public/booking-tracking/lookup')
      .send({
        reservationCode: refCode,
        guestEmail: 'fatima.bello@example.com',
      });

    expect(trackRes.status).toBe(200);
    expect(trackRes.body.data.isApproved).toBe(true);
    expect(trackRes.body.data.isVerified).toBe(true);
    expect(trackRes.body.data.authCode).toMatch(/^BFA-AUTH-/);
    expect(trackRes.body.data.assignedStaffName).toBe(receptionistUser.name);
    expect(trackRes.body.data.timeline.length).toBe(4);
  });

  test('5. Receptionist Decline Flow: Mandatory structured reason recorded and shown to guest', async () => {
    const today = new Date().toISOString().split('T')[0];

    const bookingRes = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: testApartmentId,
        guestName: 'Decline Candidate',
        guestEmail: 'decline.candidate@example.com',
        guestPhone: '+234 809 111 0000',
        checkInDate: today,
        paymentMethod: 'BANK_TRANSFER',
      });

    const resId = bookingRes.body.data.id;
    const refCode = bookingRes.body.data.reservationCode;
    createdReservationIds.push(resId);

    // Receptionist declines due to payment not reflecting
    const declineRes = await request(app)
      .post(`/api/v1/front-office/reservations/${resId}/decline`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        reason: 'TRANSFER_NOT_FOUND',
        notes: 'Transfer was not found on corporate bank statement after 15 minutes.',
      });

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.data.status).toBe('DECLINED');
    expect(declineRes.body.data.payment_status).toBe('REJECTED');
    expect(declineRes.body.data.decline_reason).toMatch(/TRANSFER_NOT_FOUND: Transfer was not found/);

    // Guest checks tracking: sees decline reason and no authCode
    const trackRes = await request(app)
      .post('/api/v1/public/booking-tracking/lookup')
      .send({
        reservationCode: refCode,
        guestEmail: 'decline.candidate@example.com',
      });

    expect(trackRes.status).toBe(200);
    expect(trackRes.body.data.status).toBe('DECLINED');
    expect(trackRes.body.data.authCode).toBeNull();
    expect(trackRes.body.data.declineReason).toMatch(/TRANSFER_NOT_FOUND/);
  });

  test('6. Guest Cancellation & Room Change Requests', async () => {
    const today = new Date().toISOString().split('T')[0];

    const bookingRes = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: testApartmentId,
        guestName: 'Self Service Guest',
        guestEmail: 'self.service@example.com',
        guestPhone: '+234 805 222 3333',
        checkInDate: today,
        paymentMethod: 'BANK_TRANSFER',
      });

    const resId = bookingRes.body.data.id;
    const refCode = bookingRes.body.data.reservationCode;
    createdReservationIds.push(resId);

    // 6a. Option A: Room Change Request
    const changeRes = await request(app)
      .post('/api/v1/public/booking-tracking/change-room')
      .send({
        reservationCode: refCode,
        guestEmail: 'self.service@example.com',
        targetApartmentId: testSecondApartmentId,
        notes: 'Prefer higher floor suite with view.',
      });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.data.status).toBe('CHANGE_REQUESTED');
    expect(changeRes.body.data.targetUnitName).toBeDefined();

    // 6b. Option B: Cancellation Request
    const cancelRes = await request(app)
      .post('/api/v1/public/booking-tracking/cancel')
      .send({
        reservationCode: refCode,
        guestEmail: 'self.service@example.com',
        reason: 'FLIGHT_DELAY_CANCELLATION',
        notes: 'Airline cancelled incoming flight to Akure.',
      });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
    expect(cancelRes.body.data.cancellationReason).toMatch(/FLIGHT_DELAY_CANCELLATION/);

    // Verify DB status
    const [dbCheck] = await pool.query('SELECT status FROM reservations WHERE id = ?', [resId]);
    expect(dbCheck.status).toBe('CANCELLED');
  });
});
