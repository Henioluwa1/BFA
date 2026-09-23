const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Cryptographic Booking Authentication Tests', () => {
  let reservationId = null;
  let authCode = '';

  beforeAll(async () => {
    // Create reservation
    const res = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, payment_method)
       VALUES ('BFA-AUTH-TEST-01', 1, 2, 'Authentic Guest', 'auth.guest@example.com', '+234 809 999 1111', '2028-09-01', '2028-09-02', 1, 120000.00, 120000.00, 'CONFIRMED', 'PAYMENT_SUCCESS', 'CARD')`
    );
    reservationId = res.insertId;

    // Issue auth code via BookingAuthService
    const BookingAuthService = require('../src/modules/bookingAuth/bookingAuth.service');
    authCode = await BookingAuthService.registerBookingAuth({
      reservationId,
      guestEmail: 'auth.guest@example.com',
      guestPhone: '+234 809 999 1111',
    });
  });

  afterAll(async () => {
    if (reservationId) {
      await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [reservationId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [reservationId]);
    }
    await pool.closePool();
  });

  test('1. Auth code follows cryptographically secure BFA-AUTH-XXXXXXXX format', () => {
    expect(authCode).toMatch(/^BFA-AUTH-[A-F0-9]{8}$/);
  });

  test('2. Verify booking with valid auth code and matching email succeeds', async () => {
    const res = await request(app)
      .post('/api/v1/booking-authentication/verify')
      .send({
        authCode,
        guestEmail: 'auth.guest@example.com',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reservationCode).toBe('BFA-AUTH-TEST-01');
    expect(res.body.data.nights).toBe(1);
    expect(res.body.data.authCode).toBe(authCode);
  });

  test('3. Verify booking with invalid auth code fails with 404', async () => {
    const res = await request(app)
      .post('/api/v1/booking-authentication/verify')
      .send({
        authCode: 'BFA-AUTH-INVALID0',
        guestEmail: 'auth.guest@example.com',
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('4. Verify booking with mismatched email/phone fails validation with 404', async () => {
    const res = await request(app)
      .post('/api/v1/booking-authentication/verify')
      .send({
        authCode,
        guestEmail: 'wrong.person@example.com',
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('No valid active reservation found');
  });

  test('5. Public lookup endpoint (/api/v1/public/booking-lookup) works for guests', async () => {
    const res = await request(app)
      .post('/api/v1/public/booking-lookup')
      .send({
        authCode,
        guestPhone: '+234 809 999 1111',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.guestName).toBe('Authentic Guest');
  });
});
