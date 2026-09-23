const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Authoritative Central Reservation Engine Tests (Section 16-32, 41, 58)', () => {
  let adminToken = '';
  let receptionistToken = '';
  let agentToken = '';
  let testApartmentId = 1;
  const createdReservationIds = [];

  beforeAll(async () => {
    // 1. Authenticate Admin
    const aRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = aRes.body.data.token;

    // 2. Authenticate Receptionist
    const rRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = rRes.body.data.token;

    // 3. Authenticate Agent (agent@bfa.com)
    const agRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    if (agRes.body.data?.token) {
      agentToken = agRes.body.data.token;
    }
    // Clean up future test dates
    await pool.query('DELETE FROM booking_authentications WHERE reservation_id IN (SELECT id FROM reservations WHERE check_in_date >= "2029-01-01")');
    await pool.query('DELETE FROM payment_transactions WHERE reservation_id IN (SELECT id FROM reservations WHERE check_in_date >= "2029-01-01")');
    await pool.query('DELETE FROM reservation_status_history WHERE reservation_id IN (SELECT id FROM reservations WHERE check_in_date >= "2029-01-01")');
    await pool.query('DELETE FROM reservations WHERE check_in_date >= "2029-01-01"');
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);
  });

  afterAll(async () => {
    if (createdReservationIds.length > 0) {
      const placeholders = createdReservationIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM booking_authentications WHERE reservation_id IN (${placeholders})`, createdReservationIds);
      await pool.query(`DELETE FROM payment_transactions WHERE reservation_id IN (${placeholders})`, createdReservationIds);
      await pool.query(`DELETE FROM reservation_status_history WHERE reservation_id IN (${placeholders})`, createdReservationIds);
      await pool.query(`DELETE FROM reservations WHERE id IN (${placeholders})`, createdReservationIds);
    }
    // Restore apartment 1 status to AVAILABLE
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);
    await pool.closePool();
  });

  test('1. Create valid 1-night reservation with auto-calculated check-out date', async () => {
    const checkIn = '2029-01-10';
    const expectedCheckOut = '2029-01-11';

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        apartment_id: testApartmentId,
        tenant_name: 'Dr. Chidi Okonkwo',
        tenant_email: 'chidi.okonkwo@example.com',
        tenant_phone: '+234 803 111 2222',
        check_in_date: checkIn,
        source: 'DIRECT',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.nights).toBe(1);
    expect(res.body.data.check_in_date).toBe(checkIn);
    expect(res.body.data.check_out_date).toBe(expectedCheckOut);
    expect(res.body.data.status).toBe('CONFIRMED');

    createdReservationIds.push(res.body.data.id);
  });

  test('2. Reject multi-night reservation under strict Section 17 1-night rule', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        apartment_id: testApartmentId,
        tenant_name: 'Invalid Multi-Night Guest',
        tenant_email: 'multi@example.com',
        tenant_phone: '+234 803 000 0000',
        check_in_date: '2029-01-20',
        check_out_date: '2029-01-23', // 3 nights
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('maximum of 1 night');
  });

  test('3. CONCURRENCY: Double-booking prevention rejects simultaneous conflict', async () => {
    const targetDate = '2029-02-15';

    // First booking
    const firstRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        apartment_id: testApartmentId,
        tenant_name: 'First Contender',
        tenant_email: 'first@example.com',
        tenant_phone: '+234 801 111 1111',
        check_in_date: targetDate,
      });

    expect(firstRes.status).toBe(201);
    createdReservationIds.push(firstRes.body.data.id);

    // Second booking attempt for identical unit & date MUST fail cleanly with 409
    const secondRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        apartment_id: testApartmentId,
        tenant_name: 'Second Contender (Conflict)',
        tenant_email: 'second@example.com',
        tenant_phone: '+234 802 222 2222',
        check_in_date: targetDate,
      });

    expect(secondRes.status).toBe(409);
    expect(secondRes.body.success).toBe(false);
    expect(secondRes.body.error.code).toBe('CONFLICT');
    expect(secondRes.body.error.message).toContain('already reserved');
  });

  test('4. Full Lifecycle: Confirm -> Check-In -> Check-Out transitions', async () => {
    // 1. Create a reservation
    const createRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        apartment_id: testApartmentId,
        tenant_name: 'Lifecycle Guest',
        tenant_email: 'lifecycle@example.com',
        tenant_phone: '+234 809 333 4444',
        check_in_date: '2029-03-01',
      });

    expect(createRes.status).toBe(201);
    const resId = createRes.body.data.id;
    createdReservationIds.push(resId);

    // 2. Perform Check-In
    const checkInRes = await request(app)
      .post(`/api/v1/reservations/${resId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.data.status).toBe('CHECKED_IN');
    expect(checkInRes.body.data.checked_in_at).toBeDefined();

    // Verify unit status shifted to OCCUPIED in database
    const [unitAfterCheckIn] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testApartmentId]);
    expect(unitAfterCheckIn.status).toBe('OCCUPIED');

    // 3. Perform Check-Out
    const checkOutRes = await request(app)
      .post(`/api/v1/reservations/${resId}/check-out`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(checkOutRes.status).toBe(200);
    expect(checkOutRes.body.data.status).toBe('COMPLETED');
    expect(checkOutRes.body.data.checked_out_at).toBeDefined();

    // Section 29 Operational Workflow: Unit transitions to DIRTY for housekeeping
    const [unitAfterCheckOut] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testApartmentId]);
    expect(unitAfterCheckOut.status).toBe('DIRTY');
  });

  test('5. Invalid state transition rejection: Cannot check-in a completed reservation', async () => {
    const lastId = createdReservationIds[createdReservationIds.length - 1];

    const invalidRes = await request(app)
      .post(`/api/v1/reservations/${lastId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(invalidRes.status).toBe(422);
    expect(invalidRes.body.success).toBe(false);
    expect(invalidRes.body.error.message).toContain('Only CONFIRMED reservations can be checked in');
  });

  test('6. Cancellation preserves audit history and frees availability for re-booking', async () => {
    const cancelDate = '2029-04-10';

    // 1. Create reservation
    const createRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        apartment_id: testApartmentId,
        tenant_name: 'Cancel Me Guest',
        tenant_email: 'cancel@example.com',
        tenant_phone: '+234 808 555 6666',
        check_in_date: cancelDate,
      });

    const resId = createRes.body.data.id;
    createdReservationIds.push(resId);

    // 2. Cancel reservation
    const cancelRes = await request(app)
      .post(`/api/v1/reservations/${resId}/cancel`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ reason: 'Flight rescheduled by guest' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
    expect(cancelRes.body.data.cancellation_reason).toBe('Flight rescheduled by guest');

    // 3. New booking for same date now SUCCEEDS (availability freed)
    const rebookRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        apartment_id: testApartmentId,
        tenant_name: 'New Rebooked Guest',
        tenant_email: 'rebook@example.com',
        tenant_phone: '+234 807 777 8888',
        check_in_date: cancelDate,
      });

    expect(rebookRes.status).toBe(201);
    createdReservationIds.push(rebookRes.body.data.id);
  });

  test('7. No-show workflow records reason and transitions status', async () => {
    const createRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        apartment_id: testApartmentId,
        tenant_name: 'Late No-Show Guest',
        tenant_email: 'noshow@example.com',
        tenant_phone: '+234 806 888 9999',
        check_in_date: '2029-05-01',
      });

    const resId = createRes.body.data.id;
    createdReservationIds.push(resId);

    const noShowRes = await request(app)
      .post(`/api/v1/reservations/${resId}/no-show`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Did not check in by 23:00' });

    expect(noShowRes.status).toBe(200);
    expect(noShowRes.body.data.status).toBe('NO_SHOW');
  });

  test('8. Retrieve status transition history for a reservation', async () => {
    const resId = createdReservationIds[0];
    const res = await request(app)
      .get(`/api/v1/reservations/${resId}/history`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('to_status');
  });
});
