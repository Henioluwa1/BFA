/**
 * Comprehensive Automated Integration Test Suite:
 * Booking Workflow, Payment Proof Verification, Receptionist Dispatch & Concurrency Guards
 * 
 * Target Database: bfa_apartments_test_db (MariaDB 10.4 on port 3306)
 * Strict Constraint: bfa_apartments_db must NEVER be targeted.
 */

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const { assertTestDatabase } = require('../src/db/databaseGuard');

describe('Booking Workflow, Bank Transfer Verification & Receptionist Dispatch Integration Suite', () => {
  let receptionistToken = '';
  let receptionistUser = null;
  let managerToken = '';
  let managerUser = null;

  let testApartmentId = null;
  let testApartmentRate = 160000;
  let quoteToken = null;
  let createdReservationId = null;
  let createdReservationCode = null;
  const guestEmail = 'executive.guest@example.com';
  const guestName = 'Engr. Dapo Williams';
  const guestPhone = '+2348035559876';
  const stayDate = '2028-09-15';

  beforeAll(async () => {
    assertTestDatabase(process.env.DB_NAME || 'bfa_apartments_test_db', 'BookingWorkflowAndDispatch Tests');

    // 1. Authenticate Receptionist
    const recRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = recRes.body.data?.token;
    receptionistUser = recRes.body.data?.user;

    // 2. Authenticate Manager
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data?.token;
    managerUser = mgrRes.body.data?.user;

    // 3. Find an active apartment in Property 1 (Grand Horizon Tower)
    const apts = await pool.query(
      'SELECT id, rate_per_night FROM apartments WHERE property_id = 1 AND is_active = 1 LIMIT 1'
    );
    testApartmentId = apts[0]?.id || 1;
    testApartmentRate = parseFloat(apts[0]?.rate_per_night || 160000);

    // Reset status to AVAILABLE
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);

    // Clean up test reservations
    await pool.query('DELETE FROM reservations WHERE tenant_email = ?', [guestEmail]);
  });

  afterAll(async () => {
    if (createdReservationId) {
      await pool.query('DELETE FROM reservation_staff_assignments WHERE reservation_id = ?', [createdReservationId]);
      await pool.query('DELETE FROM operational_evidence_attachments WHERE reservation_id = ?', [createdReservationId]);
      await pool.query('DELETE FROM payment_receipts WHERE reservation_id = ?', [createdReservationId]);
      await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [createdReservationId]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [createdReservationId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [createdReservationId]);
    }
    await pool.query('DELETE FROM reservations WHERE tenant_email = ?', [guestEmail]);
    await pool.query('DELETE FROM reservations WHERE reservation_code LIKE "BFA-WFTEST-%"');
  });

  test('1. GET /api/v1/public/payment-config: returns authorized Zenith Bank corporate settlement details', async () => {
    const res = await request(app).get('/api/v1/public/payment-config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('bankName');
    expect(res.body.data).toHaveProperty('accountName');
    expect(res.body.data).toHaveProperty('accountNumber');
    expect(res.body.data.isConfigured).toBe(true);
    expect(res.body.data.bankName).toContain('Zenith');
    expect(res.body.data.accountNumber).toBe('1018273645');
    expect(res.body.data.allowedPaymentMethods).toContain('BANK_TRANSFER');
  });

  test('2. POST /api/v1/public/upload-proof: validates file type and size guards', async () => {
    // 2a. Rejects invalid MIME type (e.g., application/javascript or text)
    const invalidRes = await request(app)
      .post('/api/v1/public/upload-proof')
      .send({
        fileData: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
        fileType: 'text/plain',
        fileName: 'malicious.txt',
      });
    expect(invalidRes.status).toBe(422);
    expect(invalidRes.body.success).toBe(false);

    // 2b. Accepts valid base64 PNG data URL
    const valid1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const validRes = await request(app)
      .post('/api/v1/public/upload-proof')
      .send({
        fileData: valid1x1Png,
        fileType: 'image/png',
        fileName: 'transfer_receipt_test.png',
      });
    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.data).toHaveProperty('proofUrl');
    expect(validRes.body.data).toHaveProperty('filePath');
  });

  test('3. POST /api/v1/public/quote: generates authoritative HMAC-signed quote for 1-night stay', async () => {
    const quoteRes = await request(app)
      .post('/api/v1/public/quote')
      .send({
        apartmentId: testApartmentId,
        checkInDate: stayDate,
      });

    expect(quoteRes.status).toBe(200);
    expect(quoteRes.body.success).toBe(true);
    expect(quoteRes.body.data).toHaveProperty('quoteToken');
    expect(quoteRes.body.data.breakdown.totalAmount).toBeGreaterThan(0);
    quoteToken = quoteRes.body.data.quoteToken;
  });

  test('4. POST /api/v1/public/booking: creates reservation in PENDING_REVIEW status with hidden authCode', async () => {
    const valid1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const bookingRes = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: testApartmentId,
        guestName,
        guestEmail,
        guestPhone,
        checkInDate: stayDate,
        paymentOption: 'BANK_TRANSFER',
        paymentMethod: 'BANK_TRANSFER',
        quoteToken,
        proofBase64: valid1x1Png,
        proofFileName: 'bank_transfer_receipt.png',
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.success).toBe(true);

    const b = bookingRes.body.data;
    createdReservationId = b.id;
    createdReservationCode = b.reservationCode;

    expect(b.status).toBe('PENDING_REVIEW');
    expect(b.paymentStatus).toBe('PROOF_UPLOADED');
    expect(b.paymentMethod).toBe('BANK_TRANSFER');
    expect(b.authCode).toBeNull(); // Passcode MUST remain hidden while unverified!
    expect(b.hasProofUploaded).toBe(true);

    // Verify database row
    const [row] = await pool.query('SELECT status, payment_status, payment_proof_path FROM reservations WHERE id = ?', [createdReservationId]);
    expect(row.status).toBe('PENDING_REVIEW');
    expect(row.payment_status).toBe('PROOF_UPLOADED');
    expect(row.payment_proof_path).toBeTruthy();
  });

  test('5. POST /api/v1/public/booking-tracking/lookup: guest tracking reflects PENDING_REVIEW & hides authCode', async () => {
    const trackRes = await request(app)
      .post('/api/v1/public/booking-tracking/lookup')
      .send({
        reservationCode: createdReservationCode,
        guestEmail,
      });

    expect(trackRes.status).toBe(200);
    expect(trackRes.body.success).toBe(true);
    const d = trackRes.body.data;
    expect(d.status).toBe('PENDING_REVIEW');
    expect(d.isApproved).toBe(false);
    expect(d.authCode).toBeNull(); // Passcode is not leaked
    expect(d.timeline.length).toBe(4);
    expect(d.timeline[0].status).toBe('COMPLETED'); // Step 1: Request submitted
    expect(d.timeline[1].status).toBe('IN_PROGRESS'); // Step 2: Awaiting claim
  });

  test('6. Guest Tracking Privacy Guard: Incorrect email is rejected with 404 without data leakage', async () => {
    const fakeRes = await request(app)
      .post('/api/v1/public/booking-tracking/lookup')
      .send({
        reservationCode: createdReservationCode,
        guestEmail: 'unauthorized.person@example.com',
      });

    expect(fakeRes.status).toBe(404);
    expect(fakeRes.body.success).toBe(false);
    expect(fakeRes.body.data).toBeUndefined();
  });

  test('7. Receptionist Claim: Receptionist claims pending reservation into personal service queue', async () => {
    const claimRes = await request(app)
      .post('/api/v1/front-office/claim')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        reservationId: createdReservationId,
      });

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.success).toBe(true);
    expect(claimRes.body.data.assigned_staff_id).toBe(receptionistUser.id);

    // Verify reservation_staff_assignments audit ledger
    const [assignRow] = await pool.query(
      'SELECT * FROM reservation_staff_assignments WHERE reservation_id = ? AND is_active = 1',
      [createdReservationId]
    );
    expect(assignRow.assigned_receptionist_id).toBe(receptionistUser.id);
    expect(assignRow.service_status).toBe('CLAIMED');
  });

  test('8. Front-Desk Concurrency Lock: Second staff member is rejected with 409 Conflict', async () => {
    // Manager tries to claim a booking already assigned to Receptionist
    const conflictRes = await request(app)
      .post('/api/v1/front-office/claim')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        reservationId: createdReservationId,
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.success).toBe(false);
    const errText = conflictRes.body.error?.message || conflictRes.body.message || '';
    expect(errText).toContain('One client cannot be assigned to two front desk staffs');
  });

  test('9. Staff Payment Proof Inspection: GET /api/v1/front-office/reservations/:id/payment-proof returns binary image', async () => {
    const proofRes = await request(app)
      .get(`/api/v1/front-office/reservations/${createdReservationId}/payment-proof`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(proofRes.status).toBe(200);
    expect(proofRes.headers['content-type']).toMatch(/image\/(png|jpeg|webp)/);
    expect(proofRes.body).toBeTruthy();
  });

  test('10. Payment Verification & Approval: Transitions payment to VERIFIED and reservation to CONFIRMED', async () => {
    const approveRes = await request(app)
      .post(`/api/v1/front-office/reservations/${createdReservationId}/approve`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);

    const [dbRow] = await pool.query('SELECT status, payment_status, paid_amount FROM reservations WHERE id = ?', [createdReservationId]);
    expect(dbRow.status).toBe('CONFIRMED');
    expect(dbRow.payment_status).toBe('VERIFIED');
    expect(parseFloat(dbRow.paid_amount)).toBeGreaterThan(0);

    // Verify operational evidence attachments updated
    const [attRow] = await pool.query(
      'SELECT verification_status FROM operational_evidence_attachments WHERE reservation_id = ?',
      [createdReservationId]
    );
    expect(attRow.verification_status).toBe('ACCEPTED');
  });

  test('11. Post-Approval Guest Tracker: Check-in passcode is now officially unlocked and released', async () => {
    const trackRes = await request(app)
      .post('/api/v1/public/booking-tracking/lookup')
      .send({
        reservationCode: createdReservationCode,
        guestEmail,
      });

    expect(trackRes.status).toBe(200);
    expect(trackRes.body.success).toBe(true);
    const d = trackRes.body.data;
    expect(d.status).toBe('CONFIRMED');
    expect(d.isApproved).toBe(true);
    expect(d.isVerified).toBe(true);
    expect(d.authCode).toBeTruthy(); // Passcode is now safely revealed!
    expect(d.authCode).toMatch(/BFA-AUTH-[A-F0-9]{8}/);
    expect(d.timeline[2].status).toBe('COMPLETED'); // Step 3: Bank transfer verified
    expect(d.timeline[3].status).toBe('COMPLETED'); // Step 4: Approved & key card ready
  });

  test('12. Decline Workflow: Declining reservation records reason, transitions to DECLINED without refund corruption', async () => {
    // Create a disposable reservation for decline testing
    const insRes = await pool.query(`
      INSERT INTO reservations (
        reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone,
        check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, payment_method, source
      ) VALUES (
        'BFA-WFTEST-DECLINE', 1, ?, 'Decline Test Guest', 'decline.test@example.com', '+234800000099',
        '2028-10-10', '2028-10-11', 1, 160000.00, 0.00, 'PENDING_REVIEW', 'PROOF_UPLOADED', 'BANK_TRANSFER', 'ONLINE'
      )
    `, [testApartmentId]);
    const declineResId = insRes.insertId;

    const declineRes = await request(app)
      .post(`/api/v1/front-office/reservations/${declineResId}/decline`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        reason: 'TRANSFER_NOT_FOUND',
        notes: 'Deposit not reflected on corporate Zenith Bank statement after 2 hours',
      });

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.success).toBe(true);

    const [dbRow] = await pool.query('SELECT status, payment_status, decline_reason FROM reservations WHERE id = ?', [declineResId]);
    expect(dbRow.status).toBe('DECLINED');
    expect(dbRow.payment_status).toBe('REJECTED');
    expect(dbRow.decline_reason).toContain('TRANSFER_NOT_FOUND');

    // Guest tracking lookup reflects decline reason accurately
    const guestLookup = await request(app)
      .post('/api/v1/public/booking-tracking/lookup')
      .send({
        reservationCode: 'BFA-WFTEST-DECLINE',
        guestEmail: 'decline.test@example.com',
      });

    expect(guestLookup.status).toBe(200);
    expect(guestLookup.body.data.status).toBe('DECLINED');
    expect(guestLookup.body.data.declineReason).toContain('TRANSFER_NOT_FOUND');
    expect(guestLookup.body.data.authCode).toBeNull();

    // Clean up
    await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [declineResId]);
    await pool.query('DELETE FROM reservations WHERE id = ?', [declineResId]);
  });

  test('13. Self-Service Guest Cancellation: Submitting cancellation transitions booking to CANCELLED', async () => {
    const cancelRes = await request(app)
      .post('/api/v1/public/booking-tracking/cancel')
      .send({
        reservationCode: createdReservationCode,
        guestEmail,
        reason: 'CHANGE_OF_PLANS',
        notes: 'Travel schedule altered due to conference postponement',
      });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);

    const [dbRow] = await pool.query('SELECT status, cancellation_reason FROM reservations WHERE id = ?', [createdReservationId]);
    expect(dbRow.status).toBe('CANCELLED');
    expect(dbRow.cancellation_reason).toContain('CHANGE_OF_PLANS');
  });
});

