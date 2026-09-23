const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Transactional Double-Booking Prevention & Concurrency Tests (Section 4, 49)', () => {
  let adminToken = '';
  const testApartmentId = 1;
  const testPropertyId = 1;
  const testCheckInDate = '2030-05-15';
  const testCheckOutDate = '2030-05-16';
  const createdReservationIds = [];

  beforeAll(async () => {
    // 1. Authenticate Admin
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = res.body.data.token;

    // 2. Clean up any leftover test records for this future test date
    await pool.query(
      `DELETE FROM booking_authentications 
       WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id = ? AND check_in_date = ?)`,
      [testApartmentId, testCheckInDate]
    );
    await pool.query(
      `DELETE FROM reservation_status_history 
       WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id = ? AND check_in_date = ?)`,
      [testApartmentId, testCheckInDate]
    );
    await pool.query(
      'DELETE FROM reservations WHERE apartment_id = ? AND check_in_date = ?',
      [testApartmentId, testCheckInDate]
    );

    // Ensure apartment is in AVAILABLE state
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);
  });

  afterAll(async () => {
    if (createdReservationIds.length > 0) {
      const placeholders = createdReservationIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM booking_authentications WHERE reservation_id IN (${placeholders})`, createdReservationIds);
      await pool.query(`DELETE FROM reservation_status_history WHERE reservation_id IN (${placeholders})`, createdReservationIds);
      await pool.query(`DELETE FROM reservations WHERE id IN (${placeholders})`, createdReservationIds);
    }
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);
    await pool.closePool();
  });

  test('Concurrent reservation creation for same apartment and date results in exactly one success and one conflict error', async () => {
    // Prepare two simultaneous booking requests for the exact same apartment and date
    const bookingPayloadA = {
      property_id: testPropertyId,
      apartment_id: testApartmentId,
      tenant_name: 'Concurrent Guest Alpha',
      tenant_email: 'alpha.concurrent@bfa-test.com',
      tenant_phone: '+234 800 111 0001',
      check_in_date: testCheckInDate,
      check_out_date: testCheckOutDate,
      source: 'DIRECT',
      total_amount: 350.00,
    };

    const bookingPayloadB = {
      property_id: testPropertyId,
      apartment_id: testApartmentId,
      tenant_name: 'Concurrent Guest Beta',
      tenant_email: 'beta.concurrent@bfa-test.com',
      tenant_phone: '+234 800 111 0002',
      check_in_date: testCheckInDate,
      check_out_date: testCheckOutDate,
      source: 'ONLINE',
      total_amount: 350.00,
    };

    // Execute concurrently using Promise.all
    const [resultA, resultB] = await Promise.all([
      request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(bookingPayloadA),
      request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(bookingPayloadB),
    ]);

    const results = [resultA, resultB];
    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);

    // Track created reservation ID for cleanup
    if (successes.length > 0 && successes[0].body.data?.id) {
      createdReservationIds.push(successes[0].body.data.id);
    }

    // 1. Assert exactly one succeeded and exactly one failed with 409 Conflict
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    // 2. Conflict response contains structured error indicating double-booking conflict
    expect(conflicts[0].body.error.code).toBe('CONFLICT');
    expect(conflicts[0].body.error.message).toMatch(/already reserved|Double-booking conflict/i);

    // 3. Verify database state: exactly ONE active reservation exists for this apartment and date
    const dbRows = await pool.query(
      'SELECT id, reservation_code, status, tenant_name, guest_id FROM reservations WHERE apartment_id = ? AND check_in_date = ?',
      [testApartmentId, testCheckInDate]
    );

    expect(dbRows).toHaveLength(1);
    expect(dbRows[0].status).toBe('CONFIRMED');
    expect(dbRows[0].guest_id).toBeTruthy(); // Guest profile was automatically resolved/linked
  });

  test('Subsequent booking attempt on the newly reserved date fails cleanly with 409', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: testPropertyId,
        apartment_id: testApartmentId,
        tenant_name: 'Third Attempt Guest',
        tenant_email: 'third@bfa-test.com',
        tenant_phone: '+234 800 111 0003',
        check_in_date: testCheckInDate,
        check_out_date: testCheckOutDate,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already reserved/i);
  });
});
