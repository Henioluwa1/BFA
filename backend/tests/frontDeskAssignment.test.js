/**
 * Front Desk Immediate Reflection, Availability Validation, Concurrency Lock,
 * and Employee Performance Evaluation Integration Suite
 * 
 * Target Database: bfa_apartments_test_db (MariaDB on port 3306)
 * Strict Constraint: bfa_apartments_db must NEVER be targeted.
 */

process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const { assertTestDatabase } = require('../src/db/databaseGuard');
const EmployeePerformanceService = require('../src/modules/employees/employeePerformance.service');
const FrontOfficeService = require('../src/modules/frontOffice/frontOffice.service');

describe('Front Desk Operations & Staff Performance Integration Suite', () => {
  let adminToken = '';
  let receptionistToken = '';
  let receptionistUser = null;
  let managerToken = '';
  let managerUser = null;

  let testApartmentId = null;
  let testPropertyId = 1;
  let createdReservationIds = [];

  beforeAll(async () => {
    // Enforce test database assertion
    assertTestDatabase(process.env.DB_NAME || 'bfa_apartments_test_db', 'FrontDeskAssignment Tests');

    // Authenticate Admin
    const aRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = aRes.body.data?.token;

    // Authenticate Receptionist (User 4 / Employee 3 / Elena Ramos or receptionist@bfa.com)
    const rRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = rRes.body.data?.token;
    receptionistUser = rRes.body.data?.user;

    // Authenticate Manager (manager@bfa.com)
    const mRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mRes.body.data?.token;
    managerUser = mRes.body.data?.user;

    // Pick an active apartment in Property 1 for clean testing
    const apts = await pool.query(
      'SELECT id, property_id FROM apartments WHERE property_id = 1 AND is_active = 1 LIMIT 1'
    );
    testApartmentId = apts[0]?.id || 3;
    testPropertyId = apts[0]?.property_id || 1;

    // Reset apartment status to AVAILABLE
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);
  });

  afterEach(async () => {
    // Teardown created reservations
    if (createdReservationIds.length > 0) {
      for (const resId of createdReservationIds) {
        await pool.query('DELETE FROM employee_activities WHERE metadata LIKE ?', [`%"reservationId":${resId}%`]);
        await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [resId]);
        await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [resId]);
        await pool.query('DELETE FROM reservations WHERE id = ?', [resId]);
      }
      createdReservationIds = [];
    }
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);
  });

  afterAll(async () => {
    if (pool.getPool) {
      await pool.getPool().end();
    }
  });

  test('1. Immediate Reflection: Newly created booking appears immediately in pending front desk queue', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const createRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: testPropertyId,
        apartment_id: testApartmentId,
        tenant_name: 'Immediate Reflection Guest',
        tenant_email: 'reflection.guest@example.com',
        tenant_phone: '+234 801 111 2222',
        check_in_date: today,
        check_out_date: tomorrow,
        source: 'DIRECT_ONLINE',
        total_amount: 150000.00,
        paid_amount: 150000.00,
      });

    expect(createRes.status).toBe(201);
    const reservationId = createRes.body.data.id;
    createdReservationIds.push(reservationId);

    // Immediately fetch pending bookings from front office endpoint
    const pendingRes = await request(app)
      .get(`/api/v1/front-office/pending-bookings?propertyId=${testPropertyId}`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.success).toBe(true);

    const found = pendingRes.body.data.find((r) => r.id === reservationId);
    expect(found).toBeDefined();
    expect(found.tenant_name).toBe('Immediate Reflection Guest');
    expect(found.assigned_staff_id).toBeNull();
  });

  test('2. Availability Guard: Booking cannot be approved if the apartment is in MAINTENANCE status', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Create reservation
    const createRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: testPropertyId,
        apartment_id: testApartmentId,
        tenant_name: 'Maintenance Block Guest',
        tenant_email: 'maint.guest@example.com',
        tenant_phone: '+234 802 222 3333',
        check_in_date: today,
        check_out_date: tomorrow,
        source: 'DIRECT_ONLINE',
        total_amount: 150000.00,
        paid_amount: 150000.00,
      });

    const resId = createRes.body.data.id;
    createdReservationIds.push(resId);

    // Force apartment status to MAINTENANCE
    await pool.query('UPDATE apartments SET status = "MAINTENANCE" WHERE id = ?', [testApartmentId]);

    // Attempt to accept booking at front desk
    const acceptRes = await request(app)
      .post(`/api/v1/front-office/reservations/${resId}/accept`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(acceptRes.status).toBe(400);
    expect(acceptRes.body.success).toBe(false);
    expect(acceptRes.body.error.message).toMatch(/Unit is currently in MAINTENANCE status/i);
  });

  test('3. Staff Assignment & Performance Evaluation: Accepting client assigns staff member and logs activity', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Ensure apartment is AVAILABLE
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);

    const createRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: testPropertyId,
        apartment_id: testApartmentId,
        tenant_name: 'Staff Evaluation Guest',
        tenant_email: 'eval.guest@example.com',
        tenant_phone: '+234 803 333 4444',
        check_in_date: today,
        check_out_date: tomorrow,
        source: 'DIRECT_ONLINE',
        total_amount: 175000.00,
        paid_amount: 175000.00,
      });

    const resId = createRes.body.data.id;
    createdReservationIds.push(resId);

    // Receptionist accepts client
    const acceptRes = await request(app)
      .post(`/api/v1/front-office/reservations/${resId}/accept`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);
    expect(acceptRes.body.data.assigned_staff_id).toBe(receptionistUser.id);
    expect(acceptRes.body.data.status).toBe('CONFIRMED');

    // Verify DB record
    const rows = await pool.query('SELECT * FROM reservations WHERE id = ?', [resId]);
    expect(rows[0].assigned_staff_id).toBe(receptionistUser.id);
    expect(rows[0].accepted_by_user_id).toBe(receptionistUser.id);
    expect(rows[0].accepted_at).not.toBeNull();

    // Verify employee_activities has CLIENT_ACCEPTED recorded
    const activities = await pool.query(
      'SELECT * FROM employee_activities WHERE activity_type = "CLIENT_ACCEPTED" AND metadata LIKE ?',
      [`%"reservationId":${resId}%`]
    );
    expect(activities.length).toBeGreaterThan(0);

    // Verify EmployeePerformanceService metric calculation
    const empRows = await pool.query('SELECT id FROM employees WHERE user_id = ?', [receptionistUser.id]);
    if (empRows.length > 0) {
      const metrics = await EmployeePerformanceService.calculateSystemMetrics(empRows[0].id, today, tomorrow);
      expect(metrics.observedMetrics.clientsAccepted).toBeGreaterThanOrEqual(1);
    }
  });

  test('4. Atomic Concurrency Lock: Strictly one client cannot be assigned to two front desk staff members', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);

    const createRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: testPropertyId,
        apartment_id: testApartmentId,
        tenant_name: 'Concurrency Lock Guest',
        tenant_email: 'concurrency.guest@example.com',
        tenant_phone: '+234 804 444 5555',
        check_in_date: today,
        check_out_date: tomorrow,
        source: 'DIRECT_ONLINE',
        total_amount: 180000.00,
        paid_amount: 180000.00,
      });

    const resId = createRes.body.data.id;
    createdReservationIds.push(resId);

    // First acceptance by Receptionist (Staff Member 1)
    const firstAccept = await request(app)
      .post(`/api/v1/front-office/reservations/${resId}/accept`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(firstAccept.status).toBe(200);

    // Second acceptance attempt by Manager (Staff Member 2)
    const secondAccept = await request(app)
      .post(`/api/v1/front-office/reservations/${resId}/accept`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(secondAccept.status).toBe(409);
    expect(secondAccept.body.success).toBe(false);
    expect(secondAccept.body.error.message).toMatch(/One client cannot be assigned to two front desk staffs/i);

    // Confirm that the assigned staff is still Receptionist and was not overwritten
    const finalResRows = await pool.query('SELECT assigned_staff_id FROM reservations WHERE id = ?', [resId]);
    expect(finalResRows[0].assigned_staff_id).toBe(receptionistUser.id);
  });

  test('5. Manager & Admin Live Operational Feed: Live operations stream captures acceptance events', async () => {
    const feedRes = await request(app)
      .get(`/api/v1/front-office/live-feed?propertyId=${testPropertyId}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(feedRes.status).toBe(200);
    expect(feedRes.body.success).toBe(true);
    expect(Array.isArray(feedRes.body.data)).toBe(true);

    if (feedRes.body.data.length > 0) {
      const topEvent = feedRes.body.data[0];
      expect(topEvent).toHaveProperty('activity_type');
      expect(topEvent).toHaveProperty('staff_name');
    }
  });
});
