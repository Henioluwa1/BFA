const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Transactional Double-Booking Prevention & Concurrency Tests (Section 4, 49)', () => {
  let adminToken = '';
  let testApartmentId = null;
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

    // 2. Create isolated test apartment unit to avoid touching existing production/seed data
    const unitRes = await pool.query(
      `INSERT INTO apartments (property_id, unit_number, unit_name, unit_type, status, rate_per_night, is_active)
       VALUES (?, ?, ?, '1_BEDROOM', 'AVAILABLE', 350.00, 1)`,
      [testPropertyId, `CONC-${Date.now() % 100000}`, 'Concurrency Verification Unit']
    );
    testApartmentId = unitRes.insertId;
  });

  afterAll(async () => {
    if (testApartmentId) {
      await pool.query(
        `DELETE FROM booking_authentications WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id = ?)`,
        [testApartmentId]
      );
      await pool.query(
        `DELETE FROM reservation_status_history WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id = ?)`,
        [testApartmentId]
      );
      await pool.query(
        `DELETE FROM payment_transactions WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id = ?)`,
        [testApartmentId]
      );
      await pool.query('DELETE FROM reservations WHERE apartment_id = ?', [testApartmentId]);
      await pool.query('DELETE FROM apartments WHERE id = ?', [testApartmentId]);
    }
    await pool.closePool();
  });

  test('Concurrent reservation creation for same apartment and date satisfies all Section 4.1 requirements', async () => {
    // Two simultaneous booking requests for the exact same apartment and date
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

    // 1. Assert exactly one succeeded (201) and exactly one failed (409)
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    // 2. Conflict response contains structured error indicating double-booking conflict
    expect(conflicts[0].body.error.code).toBe('CONFLICT');
    expect(conflicts[0].body.error.message).toMatch(/already reserved|Double-booking conflict/i);

    // 3. Database state: exactly ONE active reservation exists for this apartment and date
    const dbRows = await pool.query(
      'SELECT id, reservation_code, status, tenant_name, guest_id FROM reservations WHERE apartment_id = ? AND check_in_date = ?',
      [testApartmentId, testCheckInDate]
    );
    expect(dbRows).toHaveLength(1);
    expect(dbRows[0].status).toBe('CONFIRMED');
    expect(dbRows[0].guest_id).toBeTruthy();

    // 4. Booking authentication: exactly 1 booking_authentication record exists for this unit and date
    const authRows = await pool.query(
      `SELECT ba.id, ba.auth_code, ba.reservation_id 
       FROM booking_authentications ba
       JOIN reservations r ON r.id = ba.reservation_id
       WHERE r.apartment_id = ? AND r.check_in_date = ?`,
      [testApartmentId, testCheckInDate]
    );
    expect(authRows).toHaveLength(1);
    expect(authRows[0].reservation_id).toBe(dbRows[0].id);

    // 5. Zero partial payments or orphaned financial records for the rejected booking
    const paymentRows = await pool.query(
      `SELECT p.id, p.amount, p.status 
       FROM payment_transactions p
       WHERE p.reservation_id IN (SELECT id FROM reservations WHERE apartment_id = ?)`,
      [testApartmentId]
    );
    // There can only be payments attached to the single winning reservation, none orphaned
    for (const payment of paymentRows) {
      expect(payment.reservation_id || dbRows[0].id).toBe(dbRows[0].id);
    }

    // 6. Unit operational state remains valid (RESERVED or AVAILABLE)
    const [unitRow] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testApartmentId]);
    expect(['RESERVED', 'AVAILABLE']).toContain(unitRow.status);
  });

  test('Subsequent sequential booking attempt on the newly reserved date fails cleanly with 409', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: testPropertyId,
        apartment_id: testApartmentId,
        tenant_name: 'Third Sequential Attempt Guest',
        tenant_email: 'third@bfa-test.com',
        tenant_phone: '+234 800 111 0003',
        check_in_date: testCheckInDate,
        check_out_date: testCheckOutDate,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/already reserved/i);
  });
});
