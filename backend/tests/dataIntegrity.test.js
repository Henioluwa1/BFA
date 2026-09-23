const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Data Integrity & Business Rules Test Suite (Section 4, 16, 29, 30)', () => {
  let adminToken = '';
  let testPropertyId1 = 1;
  let testPropertyId2 = 2;
  let testUnit1 = null;
  let testUnit2 = null;

  beforeAll(async () => {
    // 1. Authenticate Admin
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = res.body.data.token;

    // 2. Create isolated test units
    const unit1Res = await pool.query(
      `INSERT INTO apartments (property_id, unit_number, unit_name, unit_type, status, rate_per_night, is_active)
       VALUES (?, ?, ?, '1_BEDROOM', 'AVAILABLE', 200.00, 1)`,
      [testPropertyId1, `INT1-${Date.now() % 100000}`, 'Integrity Test Unit Prop 1']
    );
    testUnit1 = unit1Res.insertId;

    const unit2Res = await pool.query(
      `INSERT INTO apartments (property_id, unit_number, unit_name, unit_type, status, rate_per_night, is_active)
       VALUES (?, ?, ?, '2_BEDROOM', 'AVAILABLE', 300.00, 1)`,
      [testPropertyId2, `INT2-${Date.now() % 100000}`, 'Integrity Test Unit Prop 2']
    );
    testUnit2 = unit2Res.insertId;
  });

  afterAll(async () => {
    const unitIds = [testUnit1, testUnit2].filter(Boolean);
    if (unitIds.length > 0) {
      const placeholders = unitIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM inspections WHERE apartment_id IN (${placeholders})`, unitIds);
      await pool.query(`DELETE FROM blocked_periods WHERE apartment_id IN (${placeholders})`, unitIds);
      await pool.query(
        `DELETE FROM booking_authentications WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id IN (${placeholders}))`,
        unitIds
      );
      await pool.query(
        `DELETE FROM reservation_status_history WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id IN (${placeholders}))`,
        unitIds
      );
      await pool.query(
        `DELETE FROM payment_transactions WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id IN (${placeholders}))`,
        unitIds
      );
      await pool.query(`DELETE FROM reservations WHERE apartment_id IN (${placeholders})`, unitIds);
      await pool.query(`DELETE FROM apartments WHERE id IN (${placeholders})`, unitIds);
    }
    await pool.closePool();
  });

  describe('1. Operational Lifecycle Coupling (CHECKED_IN -> OCCUPIED, CHECKED_OUT -> DIRTY, Housekeeping Progression)', () => {
    let resId = null;

    it('creates and confirms a reservation, then verifies check-in sets unit to OCCUPIED', async () => {
      const createRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: testPropertyId1,
          apartment_id: testUnit1,
          tenant_name: 'Lifecycle Guest',
          tenant_email: 'lifecycle@bfa-test.com',
          tenant_phone: '+234 800 222 0001',
          check_in_date: '2031-02-01',
          check_out_date: '2031-02-02',
          source: 'DIRECT',
          total_amount: 200.00,
        });

      expect(createRes.status).toBe(201);
      resId = createRes.body.data.id;

      // Check In
      const checkInRes = await request(app)
        .post(`/api/v1/reservations/${resId}/check-in`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(checkInRes.status).toBe(200);
      expect(checkInRes.body.data.status).toBe('CHECKED_IN');

      // Assert unit operational status changed to OCCUPIED
      const [unitRow] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testUnit1]);
      expect(unitRow.status).toBe('OCCUPIED');
    });

    it('check-out sets reservation to COMPLETED and unit to DIRTY', async () => {
      const checkOutRes = await request(app)
        .post(`/api/v1/reservations/${resId}/check-out`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(checkOutRes.status).toBe(200);
      expect(checkOutRes.body.data.status).toBe('COMPLETED');

      // Assert unit operational status changed to DIRTY
      const [unitRow] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testUnit1]);
      expect(unitRow.status).toBe('DIRTY');
    });

    it('supports housekeeping progression: DIRTY -> CLEANING -> READY -> AVAILABLE', async () => {
      // Step 1: Staff marks CLEANING
      let res = await request(app)
        .patch(`/api/v1/apartments/${testUnit1}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CLEANING' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CLEANING');

      // Step 2: Housekeeping supervisor marks READY
      res = await request(app)
        .patch(`/api/v1/apartments/${testUnit1}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'READY' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('READY');

      // Step 3: Receptionist / Manager marks AVAILABLE
      res = await request(app)
        .patch(`/api/v1/apartments/${testUnit1}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'AVAILABLE' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('AVAILABLE');
    });
  });

  describe('2. Blocked Periods Lifecycle & Availability Integration', () => {
    let blockId = null;

    it('creates a blocked period and verifies unit becomes unavailable for dates within the block', async () => {
      const blockRes = await request(app)
        .post(`/api/v1/apartments/${testUnit1}/blocked-periods`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startDate: '2031-05-10',
          endDate: '2031-05-15',
          reason: 'Scheduled AC Duct Replacement',
        });

      expect(blockRes.status).toBe(201);
      expect(blockRes.body.data.reason).toBe('Scheduled AC Duct Replacement');
      blockId = blockRes.body.data.id;

      // Verify availability endpoint reports unavailable
      const availRes = await request(app)
        .get(`/api/v1/apartments/${testUnit1}/availability?checkInDate=2031-05-12`);

      expect(availRes.status).toBe(200);
      expect(availRes.body.data.isAvailable).toBe(false);
      expect(availRes.body.data.reason).toMatch(/blocked/i);

      // Attempting to book during blocked period returns 409 Conflict
      const bookRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: testPropertyId1,
          apartment_id: testUnit1,
          tenant_name: 'Blocked Dates Attempt',
          tenant_email: 'blocked@bfa-test.com',
          tenant_phone: '+234 800 222 0002',
          check_in_date: '2031-05-12',
          check_out_date: '2031-05-13',
          source: 'DIRECT',
          total_amount: 200.00,
        });

      expect(bookRes.status).toBe(409);
      expect(bookRes.body.error.message).toMatch(/blocked for maintenance/i);
    });

    it('deleting blocked period restores availability for the dates', async () => {
      const delRes = await request(app)
        .delete(`/api/v1/apartments/${testUnit1}/blocked-periods/${blockId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.success).toBe(true);

      // Verify availability endpoint reports available again
      const availRes = await request(app)
        .get(`/api/v1/apartments/${testUnit1}/availability?checkInDate=2031-05-12`);

      expect(availRes.status).toBe(200);
      expect(availRes.body.data.isAvailable).toBe(true);
    });
  });

  describe('3. Cancellation & No-Show Availability Restoration', () => {
    it('cancelling a reservation releases unit availability for that date', async () => {
      const createRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: testPropertyId1,
          apartment_id: testUnit1,
          tenant_name: 'Cancellation Guest',
          tenant_email: 'cancel@bfa-test.com',
          tenant_phone: '+234 800 222 0003',
          check_in_date: '2031-08-20',
          check_out_date: '2031-08-21',
          source: 'DIRECT',
          total_amount: 200.00,
        });
      expect(createRes.status).toBe(201);
      const resId = createRes.body.data.id;

      // Prior to cancellation, date is unavailable
      let availRes = await request(app).get(`/api/v1/apartments/${testUnit1}/availability?checkInDate=2031-08-20`);
      expect(availRes.body.data.isAvailable).toBe(false);

      // Cancel reservation
      const cancelRes = await request(app)
        .post(`/api/v1/reservations/${resId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Trip rescheduled by guest' });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      // Date is now available
      availRes = await request(app).get(`/api/v1/apartments/${testUnit1}/availability?checkInDate=2031-08-20`);
      expect(availRes.body.data.isAvailable).toBe(true);
    });

    it('marking reservation as NO_SHOW releases unit availability for that date', async () => {
      const createRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: testPropertyId1,
          apartment_id: testUnit1,
          tenant_name: 'NoShow Guest',
          tenant_email: 'noshow@bfa-test.com',
          tenant_phone: '+234 800 222 0004',
          check_in_date: '2031-08-25',
          check_out_date: '2031-08-26',
          source: 'DIRECT',
          total_amount: 200.00,
        });
      expect(createRes.status).toBe(201);
      const resId = createRes.body.data.id;

      // Mark No-Show
      const noShowRes = await request(app)
        .post(`/api/v1/reservations/${resId}/no-show`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(noShowRes.status).toBe(200);
      expect(noShowRes.body.data.status).toBe('NO_SHOW');

      // Date is available again
      const availRes = await request(app).get(`/api/v1/apartments/${testUnit1}/availability?checkInDate=2031-08-25`);
      expect(availRes.body.data.isAvailable).toBe(true);
    });
  });

  describe('4. Property & Unit Cross-Entity Mismatch Protection', () => {
    it('rejects reservation creation when property_id does not match apartment.property_id', async () => {
      // testUnit2 belongs to Property 2, but request specifies Property 1
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: testPropertyId1,
          apartment_id: testUnit2,
          tenant_name: 'Mismatch Guest',
          tenant_email: 'mismatch@bfa-test.com',
          tenant_phone: '+234 800 222 0005',
          check_in_date: '2031-09-01',
          check_out_date: '2031-09-02',
          source: 'DIRECT',
          total_amount: 300.00,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/Data Integrity Violation/i);
    });

    it('rejects inspection creation when property_id does not match apartment.property_id', async () => {
      // testUnit1 belongs to Property 1, but inspection specifies Property 2
      const res = await request(app)
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: testPropertyId2,
          apartment_id: testUnit1,
          inspection_type: 'ROUTINE',
          condition_rating: 'GOOD',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/Selected unit does not belong to specified property/i);
    });
  });

  describe('5. Authoritative Financial Source-of-Truth Integrity', () => {
    it('guarantees outstanding_balance is derived from GREATEST(0, total - paid)', async () => {
      const createRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: testPropertyId1,
          apartment_id: testUnit1,
          tenant_name: 'Financial Audit Guest',
          tenant_email: 'financial@bfa-test.com',
          tenant_phone: '+234 800 222 0006',
          check_in_date: '2031-10-10',
          check_out_date: '2031-10-11',
          source: 'DIRECT',
          total_amount: 500.00,
          paid_amount: 200.00,
        });
      expect(createRes.status).toBe(201);
      const resId = createRes.body.data.id;

      // 1. Partial payment: total 500, paid 200 => outstanding 300
      let getRes = await request(app)
        .get(`/api/v1/reservations/${resId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(parseFloat(getRes.body.data.outstanding_balance)).toBe(300.00);

      // 2. Full payment update: paid 500 => outstanding 0
      await request(app)
        .put(`/api/v1/reservations/${resId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paid_amount: 500.00 });

      getRes = await request(app)
        .get(`/api/v1/reservations/${resId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(parseFloat(getRes.body.data.outstanding_balance)).toBe(0.00);

      // 3. Overpayment protection: paid 600 => outstanding remains 0, never negative
      await request(app)
        .put(`/api/v1/reservations/${resId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paid_amount: 600.00 });

      getRes = await request(app)
        .get(`/api/v1/reservations/${resId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(parseFloat(getRes.body.data.outstanding_balance)).toBe(0.00);
    });
  });
});
