const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Critical One-Night Maximum Reservation Rule (Section 16)', () => {
  let adminToken = '';
  let createdReservationId = null;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = res.body.data.token;
  });

  afterAll(async () => {
    if (createdReservationId) {
      await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [createdReservationId]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [createdReservationId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [createdReservationId]);
    }
    await pool.closePool();
  });

  const baseBooking = {
    apartment_id: 1, // Penthouse Horizon 101 in Property 1
    tenant_name: 'Test Tenant John',
    tenant_email: 'john.test@example.com',
    tenant_phone: '+234 809 111 0000',
    total_amount: 350.00,
  };

  it('should ACCEPT reservation when duration is exactly ONE NIGHT', async () => {
    // Use dynamic unique date to avoid conflict with existing test runs
    const futureDays = 2000 + Math.floor(Math.random() * 2000);
    const d = new Date(Date.now() + futureDays * 86400000);
    const checkIn = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 1);
    const checkOut = d.toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/v1/reservations')
      .send({
        ...baseBooking,
        check_in_date: checkIn,
        check_out_date: checkOut,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('reservation_code');
    expect(res.body.data.nights).toBe(1);
    expect(res.body.data.check_in_date).toBe(checkIn);
    expect(res.body.data.check_out_date).toBe(checkOut);
    createdReservationId = res.body.data.id;
  });

  it('should REJECT reservation when duration is TWO NIGHTS (Section 16 violation)', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .send({
        ...baseBooking,
        check_in_date: '2028-12-05',
        check_out_date: '2028-12-07', // 2 nights
      });

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('maximum of 1 night');
  });

  it('should REJECT reservation when duration is FIVE NIGHTS', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .send({
        ...baseBooking,
        check_in_date: '2028-12-10',
        check_out_date: '2028-12-15', // 5 nights
      });

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('maximum of 1 night');
  });

  it('should REJECT reservation when duration is SAME DAY (0 nights)', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .send({
        ...baseBooking,
        check_in_date: '2028-12-20',
        check_out_date: '2028-12-20', // 0 nights
      });

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('same-day and zero-night stays are prohibited');
  });

  it('should REJECT reservation when check-out date is before check-in date', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .send({
        ...baseBooking,
        check_in_date: '2028-12-25',
        check_out_date: '2028-12-24', // Negative duration
      });

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should REJECT updating an existing reservation to TWO NIGHTS via PUT /reservations/:id', async () => {
    expect(createdReservationId).toBeTruthy();
    // Get existing reservation to know its check_in_date
    const getRes = await request(app)
      .get(`/api/v1/reservations/${createdReservationId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const checkIn = getRes.body.data.check_in_date;
    const d = new Date(checkIn + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 2); // 2 nights
    const twoNightsOut = d.toISOString().split('T')[0];

    const res = await request(app)
      .put(`/api/v1/reservations/${createdReservationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        check_out_date: twoNightsOut,
      });

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('maximum of 1 night');
  });

  it('should REJECT public booking when duration exceeds ONE NIGHT via POST /public/booking', async () => {
    const res = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: 1,
        guestName: 'Public Multi-Night Guest',
        guestEmail: 'public.multi@example.com',
        guestPhone: '+234 809 999 8888',
        checkInDate: '2029-07-01',
        checkOutDate: '2029-07-03', // 2 nights
      });

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('maximum of 1 night');
  });
});
