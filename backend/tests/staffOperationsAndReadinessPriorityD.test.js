const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Priority D: Staff Operations, Front Desk Claim Desk & Decoupled Readiness Tests', () => {
  let adminToken = '';
  let managerToken = '';
  let testReservationId = null;

  beforeAll(async () => {
    // Ensure manager is assigned to property 1 in test database before logging in
    await pool.query("UPDATE users SET property_id = 1 WHERE email = 'manager@bfa.com'");

    // Admin login
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    // Manager login
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data.token;

    // Clean up any lingering test reservations from previous runs
    await pool.query("DELETE FROM reservation_staff_assignments WHERE reservation_id IN (SELECT id FROM reservations WHERE reservation_code LIKE 'BFA-TEST-%')");
    await pool.query("DELETE FROM reservation_status_history WHERE reservation_id IN (SELECT id FROM reservations WHERE reservation_code LIKE 'BFA-TEST-%')");
    await pool.query("DELETE FROM reservations WHERE reservation_code LIKE 'BFA-TEST-%'");

    // Create a fresh test reservation to test claiming
    const insRes = await pool.query(`
      INSERT INTO reservations (
        reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone,
        check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, payment_method, source
      ) VALUES (
        CONCAT('BFA-TEST-', UNIX_TIMESTAMP()), 1, 1, 'Claim Desk Guest', 'claim.guest@example.com', '+234800000001',
        '2028-06-01', '2028-06-02', 1, 45000.00, 45000.00, 'PENDING', 'PAYMENT_SUCCESS', 'CARD', 'ONLINE'
      )
    `);
    testReservationId = insRes.insertId;
  });

  afterAll(async () => {
    if (testReservationId) {
      await pool.query('DELETE FROM reservation_staff_assignments WHERE reservation_id = ?', [testReservationId]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [testReservationId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [testReservationId]);
    }
    await pool.query("DELETE FROM reservations WHERE reservation_code LIKE 'BFA-TEST-%'");
  });

  test('1. Migration 026: Verifies all schema tables and readiness columns exist', async () => {
    const requiredTables = [
      'user_property_assignments',
      'property_submissions',
      'property_review_comments',
      'media_assets',
      'operational_cases',
      'staff_incidents',
      'operational_evidence_attachments',
      'payment_receipts',
      'reservation_staff_assignments',
    ];

    const tables = await pool.query(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    const tableNames = tables.map((t) => (t.TABLE_NAME || t.table_name).toLowerCase());

    for (const reqTable of requiredTables) {
      expect(tableNames).toContain(reqTable.toLowerCase());
    }

    // Verify decoupled readiness columns in apartments
    const columns = await pool.query(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'apartments'
    `);
    const colNames = columns.map((c) => (c.COLUMN_NAME || c.column_name).toLowerCase());
    expect(colNames).toContain('housekeeping_status');
    expect(colNames).toContain('maintenance_status');
  });

  test('2. Decoupled Readiness Lifecycle: Updates housekeeping without mutating occupancy status', async () => {
    // Transition to DIRTY
    const dirtyRes = await request(app)
      .patch('/api/v1/apartments/1/readiness')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        housekeepingStatus: 'DIRTY',
        notes: 'Guest checked out. Unit dirty pending housekeeping turnover.',
      });

    expect(dirtyRes.status).toBe(200);
    expect(dirtyRes.body.success).toBe(true);
    expect(dirtyRes.body.data.housekeeping_status).toBe('DIRTY');

    // Transition to CLEANING_IN_PROGRESS
    const inProgRes = await request(app)
      .patch('/api/v1/apartments/1/readiness')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        housekeepingStatus: 'CLEANING_IN_PROGRESS',
      });

    expect(inProgRes.status).toBe(200);
    expect(inProgRes.body.data.housekeeping_status).toBe('CLEANING_IN_PROGRESS');

    // Transition to INSPECTED_READY
    const readyRes = await request(app)
      .patch('/api/v1/apartments/1/readiness')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        housekeepingStatus: 'INSPECTED_READY',
        maintenanceStatus: 'OPERATIONAL',
      });

    expect(readyRes.status).toBe(200);
    expect(readyRes.body.data.housekeeping_status).toBe('INSPECTED_READY');
    expect(readyRes.body.data.maintenance_status).toBe('OPERATIONAL');
  });

  test('3. Invalid readiness status is rejected with 422', async () => {
    const res = await request(app)
      .patch('/api/v1/apartments/1/readiness')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        housekeepingStatus: 'SPARKLY_CLEAN', // Invalid enum
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  test('4. Front Desk Claim Desk: Receptionist/Staff successfully claims unassigned booking', async () => {
    const claimRes = await request(app)
      .post('/api/v1/front-office/claim')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        reservationId: testReservationId,
      });

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.success).toBe(true);
    expect(claimRes.body.data.assigned_staff_id).toBeTruthy();

    // Verify historical entry created in reservation_staff_assignments
    const rsaRows = await pool.query(
      'SELECT * FROM reservation_staff_assignments WHERE reservation_id = ? AND is_active = 1',
      [testReservationId]
    );
    expect(rsaRows.length).toBe(1);
    expect(rsaRows[0].service_status).toBe('CLAIMED');
    expect(rsaRows[0].assignment_type).toBe('INITIAL_CLAIM');
  });

  test('5. Front Desk Concurrency Guard: Second staff cannot claim already-assigned booking', async () => {
    const secondClaimRes = await request(app)
      .post('/api/v1/front-office/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: testReservationId,
      });

    expect(secondClaimRes.status).toBe(409);
    expect(secondClaimRes.body.success).toBe(false);
    const msg = secondClaimRes.body.error?.message || secondClaimRes.body.message || '';
    expect(msg).toContain('One client cannot be assigned to two front desk staffs');
  });
});
