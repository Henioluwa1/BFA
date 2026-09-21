const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Critical One-Night Maximum Reservation Rule (Section 16)', () => {
  afterAll(async () => {
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
    const uniqueYear = 2030 + Math.floor(Math.random() * 10);
    const checkIn = `${uniqueYear}-05-10`;
    const checkOut = `${uniqueYear}-05-11`;

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
});
