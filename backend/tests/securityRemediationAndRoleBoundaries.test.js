const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');

describe('Critical Security Remediation & Role Boundary Enforcement Suite', () => {
  let adminToken = '';
  let superAdminToken = '';
  let ownerToken = '';
  let receptionistToken = '';
  let staffWithProp1Token = '';
  let staffWithNullPropToken = '';
  let managerWithProp1Token = '';
  let managerWithNullPropToken = '';
  let agent1Token = '';
  let agent2Token = '';

  let directReservationId = null;
  let agent1ReservationId = null;
  let testExpenseId = null;

  beforeAll(async () => {
    // 1. Authenticate standard roles
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@bfa.com', password: 'Bfa2026!Secure' });
    adminToken = adminRes.body.data.token;

    const saRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@bfa.com', password: 'Bfa2026!Secure' });
    superAdminToken = saRes.body.data.token;

    const ownerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@bfa.com', password: 'Bfa2026!Secure' });
    ownerToken = ownerRes.body.data.token;

    const recRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'receptionist@bfa.com', password: 'Bfa2026!Secure' });
    receptionistToken = recRes.body.data.token;

    // 2. Generate explicit test tokens for property isolation and boundaries
    staffWithProp1Token = jwt.sign(
      { id: 5, email: 'staff@bfa.com', role: 'STAFF', propertyId: 1 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    staffWithNullPropToken = jwt.sign(
      { id: 981, email: 'unassigned.staff@bfa.com', role: 'STAFF', propertyId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    managerWithProp1Token = jwt.sign(
      { id: 3, email: 'manager@bfa.com', role: 'MANAGER', propertyId: 1 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    managerWithNullPropToken = jwt.sign(
      { id: 982, email: 'unassigned.mgr@bfa.com', role: 'MANAGER', propertyId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    agent1Token = jwt.sign(
      { id: 983, email: 'agent1@bfa.com', role: 'AGENT', agentId: 1 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    agent2Token = jwt.sign(
      { id: 984, email: 'agent2@bfa.com', role: 'AGENT', agentId: 2 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    // 3. Ensure test reservations exist in bfa_apartments_test_db
    const existingApts = await pool.query('SELECT id, property_id FROM apartments WHERE property_id = 1 LIMIT 1');
    const aptId = existingApts[0]?.id || 1;

    // Direct booking (no agent)
    const directRes = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, source)
       VALUES (?, 1, ?, 'Direct Guest', 'direct@guest.com', '+2348000000001', '2026-11-10', '2026-11-11', 1, 150000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING', 'DIRECT')`,
      [`TEST-DIR-${Date.now()}`, aptId]
    );
    directReservationId = directRes.insertId;

    // Agent 1 booking
    const agentRes = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, agent_id, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, source)
       VALUES (?, 1, ?, 1, 'Agent1 Guest', 'agent1.guest@guest.com', '+2348000000002', '2026-11-12', '2026-11-13', 1, 150000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING', 'AGENT')`,
      [`TEST-AG1-${Date.now()}`, aptId]
    );
    agent1ReservationId = agentRes.insertId;
  });

  afterAll(async () => {
    // Teardown test reservations & expenses
    if (directReservationId) {
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [directReservationId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [directReservationId]);
    }
    if (agent1ReservationId) {
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [agent1ReservationId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [agent1ReservationId]);
    }
    if (testExpenseId) {
      await pool.query('DELETE FROM expenses WHERE id = ?', [testExpenseId]);
    }
    await pool.closePool();
  });

  /* =========================================================================
   * 1. CRITICAL: Insecure Payment Processing Route Gating
   * ========================================================================= */
  describe('1. Insecure Payment Processing Route Hardening', () => {
    test('1.1 Unauthenticated call to POST /api/v1/payments/process is REJECTED with HTTP 401', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .send({
          reservationId: directReservationId,
          paymentMethod: 'CARD',
          amount: 150000.00,
        });

      expect(res.status).toBe(401);
    });

    test('1.2 Non-admin roles (STAFF, RECEPTIONIST, AGENT) are REJECTED with HTTP 403', async () => {
      // Receptionist attempt
      const recRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reservationId: directReservationId, paymentMethod: 'CARD', amount: 150000.00 });
      expect(recRes.status).toBe(403);

      // Staff attempt
      const staffRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${staffWithProp1Token}`)
        .send({ reservationId: directReservationId, paymentMethod: 'CARD', amount: 150000.00 });
      expect(staffRes.status).toBe(403);

      // Agent attempt
      const agentRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ reservationId: directReservationId, paymentMethod: 'CARD', amount: 150000.00 });
      expect(agentRes.status).toBe(403);
    });

    test('1.3 Direct payment processing cannot mark reservation paid without Admin authorization', async () => {
      // Verify reservation payment status remains PAYMENT_PENDING
      const [resRow] = await pool.query('SELECT payment_status, paid_amount FROM reservations WHERE id = ?', [directReservationId]);
      expect(resRow.payment_status).toBe('PAYMENT_PENDING');
      expect(parseFloat(resRow.paid_amount)).toBe(0.00);
    });
  });

  /* =========================================================================
   * 2. HIGH: Fail-Closed Property Isolation
   * ========================================================================= */
  describe('2. Fail-Closed Property Isolation', () => {
    test('2.1 Manager with valid property assignment can access their property records', async () => {
      const res = await request(app)
        .get('/api/v1/expenses?propertyId=1')
        .set('Authorization', `Bearer ${managerWithProp1Token}`);
      expect(res.status).toBe(200);
    });

    test('2.2 Manager with null property assignment receives HTTP 403 Forbidden', async () => {
      // In financial overview
      const finRes = await request(app)
        .get('/api/v1/financial/overview')
        .set('Authorization', `Bearer ${managerWithNullPropToken}`);
      expect(finRes.status).toBe(403);

      // In expenses creation
      const expRes = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${managerWithNullPropToken}`)
        .send({ property_id: 1, category: 'MAINTENANCE', description: 'Test', amount: 10000 });
      expect(expRes.status).toBe(403);
    });

    test('2.3 Manager attempting to access foreign property records receives HTTP 403', async () => {
      const expRes = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${managerWithProp1Token}`)
        .send({ property_id: 2, category: 'MAINTENANCE', description: 'Cross property attempt', amount: 5000 });
      expect(expRes.status).toBe(403);
    });

    test('2.4 Staff with null property assignment receives HTTP 403 Forbidden', async () => {
      const maintRes = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${staffWithNullPropToken}`)
        .send({ property_id: 1, issue_title: 'Broken Light', priority: 'LOW' });
      expect(maintRes.status).toBe(403);
    });

    test('2.5 Staff attempting to create or access another property receives HTTP 403', async () => {
      const maintRes = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${staffWithProp1Token}`)
        .send({ property_id: 2, issue_title: 'Cross property maintenance', priority: 'LOW' });
      expect(maintRes.status).toBe(403);
    });

    test('2.6 Admin and Super Admin have corporate global authority across properties', async () => {
      const adminRes = await request(app)
        .get('/api/v1/financial/overview?propertyId=all')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);

      const saRes = await request(app)
        .get('/api/v1/financial/overview?propertyId=all')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(saRes.status).toBe(200);
    });
  });

  /* =========================================================================
   * 3. HIGH: STAFF Role Boundaries
   * ========================================================================= */
  describe('3. STAFF Role Boundaries Enforcement', () => {
    test('3.1 STAFF cannot claim front-office reservations (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/front-office/reservations/${directReservationId}/claim`)
        .set('Authorization', `Bearer ${staffWithProp1Token}`);
      expect(res.status).toBe(403);
    });

    test('3.2 STAFF cannot approve front-office reservations (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/front-office/reservations/${directReservationId}/approve`)
        .set('Authorization', `Bearer ${staffWithProp1Token}`);
      expect(res.status).toBe(403);
    });

    test('3.3 STAFF cannot decline front-office reservations (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/front-office/reservations/${directReservationId}/decline`)
        .set('Authorization', `Bearer ${staffWithProp1Token}`)
        .send({ reason: 'AMOUNT_MISMATCH' });
      expect(res.status).toBe(403);
    });

    test('3.4 STAFF cannot execute guest check-in (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/reservations/${directReservationId}/check-in`)
        .set('Authorization', `Bearer ${staffWithProp1Token}`);
      expect(res.status).toBe(403);
    });

    test('3.5 STAFF cannot execute guest check-out (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/reservations/${directReservationId}/check-out`)
        .set('Authorization', `Bearer ${staffWithProp1Token}`);
      expect(res.status).toBe(403);
    });

    test('3.6 STAFF cannot cancel reservations (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/reservations/${directReservationId}/cancel`)
        .set('Authorization', `Bearer ${staffWithProp1Token}`)
        .send({ reason: 'Staff cancel attempt' });
      expect(res.status).toBe(403);
    });

    test('3.7 STAFF cannot execute refunds (HTTP 403)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/1/refund')
        .set('Authorization', `Bearer ${staffWithProp1Token}`)
        .send({ amount: 1000 });
      expect(res.status).toBe(403);
    });
  });

  /* =========================================================================
   * 4. HIGH: Agent Reservation Cancellation Isolation
   * ========================================================================= */
  describe('4. Agent Reservation Cancellation Isolation', () => {
    test('4.1 Agent CANNOT cancel a direct booking (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/reservations/${directReservationId}/cancel`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ reason: 'Agent cancel direct attempt' });
      expect(res.status).toBe(403);
      const errMsg = res.body.message || res.body.error?.message;
      expect(errMsg).toMatch(/strictly isolated/i);
    });

    test('4.2 Agent CANNOT cancel another Agent\'s booking (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/reservations/${agent1ReservationId}/cancel`)
        .set('Authorization', `Bearer ${agent2Token}`)
        .send({ reason: 'Competitor agent cancel attempt' });
      expect(res.status).toBe(403);
      const errMsg = res.body.message || res.body.error?.message;
      expect(errMsg).toMatch(/strictly isolated/i);
    });

    test('4.3 Agent CAN cancel their own attributed booking', async () => {
      const res = await request(app)
        .post(`/api/v1/reservations/${agent1ReservationId}/cancel`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ reason: 'Client requested cancellation' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  /* =========================================================================
   * 5. HIGH: Expense Separation of Duties
   * ========================================================================= */
  describe('5. Expense Separation of Duties', () => {
    test('5.1 Expense creation with autoApprove=true remains RECORDED (not approved)', async () => {
      const res = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: 1,
          category: 'SUPPLIES',
          description: 'Cleaning supplies',
          amount: 25000.00,
          autoApprove: true,
          status: 'APPROVED',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('RECORDED');
      testExpenseId = res.body.data.id;
    });

    test('5.2 Creator CANNOT approve their own expense (HTTP 403 Separation of Duties)', async () => {
      // admin created testExpenseId, so admin self-approval must be rejected
      const res = await request(app)
        .post(`/api/v1/expenses/${testExpenseId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      const errMsg = res.body.message || res.body.error?.message;
      expect(errMsg).toMatch(/Separation of duties violation/i);
    });

    test('5.3 Non-admin role (RECEPTIONIST, STAFF) cannot approve expenses (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/expenses/${testExpenseId}/approve`)
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(403);
    });

    test('5.4 Independent corporate administrator CAN approve the recorded expense', async () => {
      // Super Admin (independent actor) approves the expense created by Admin
      const res = await request(app)
        .post(`/api/v1/expenses/${testExpenseId}/approve`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('APPROVED');
    });
  });

  /* =========================================================================
   * 6. HIGH: Protection of Agent Banking Information
   * ========================================================================= */
  describe('6. Agent Banking Information Protection', () => {
    test('6.1 RECEPTIONIST is forbidden from accessing commissions (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/v1/commissions')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(403);
    });

    test('6.2 RECEPTIONIST is forbidden from accessing agent directory (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(403);
    });

    test('6.3 Authorized Agent CAN access their own commission information', async () => {
      const res = await request(app)
        .get('/api/v1/commissions')
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
