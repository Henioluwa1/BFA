const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Phase 7+8 Hardening Tests (Financial, Refunds, Expenses, Maintenance Integrity)', () => {
  let adminToken = '';
  let managerToken = '';
  let agentToken = '';
  let property2ManagerToken = '';

  let testReservationId = null;
  let testPaymentId = null;
  let testExpenseId = null;
  let testMntUnitId = 2; // Apartment unit 2
  let blockingMntId1 = null;
  let blockingMntId2 = null;

  beforeAll(async () => {
    // 1. Admin login
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    // 2. Manager login (Property 1)
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data.token;

    // 3. Agent login
    const agRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agRes.body.data.token;

    // Clean up any previous test artifacts
    await pool.query('DELETE FROM payment_transactions WHERE transaction_reference LIKE "BFA-TEST-%"');
    await pool.query('DELETE FROM expenses WHERE description LIKE "Automated Test Hardening%"');
    await pool.query('DELETE FROM maintenance_requests WHERE issue_title LIKE "Hardening Test%"');
  });

  afterAll(async () => {
    // Clean up test records
    if (testPaymentId) {
      await pool.query('DELETE FROM payment_transactions WHERE id = ? OR parent_transaction_id = ?', [testPaymentId, testPaymentId]);
    }
    if (testReservationId) {
      await pool.query('DELETE FROM reservations WHERE id = ?', [testReservationId]);
    }
    if (testExpenseId) {
      await pool.query('DELETE FROM expenses WHERE id = ?', [testExpenseId]);
    }
    await pool.query('DELETE FROM maintenance_requests WHERE issue_title LIKE "Hardening Test%"');
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id IN (1, 2)');
    await pool.closePool();
  });

  // ==========================================
  // B1 & B2: Financial Source-of-Truth & Refund Hardening
  // ==========================================
  describe('B1 & B2: Refund & Financial Transaction Hardening', () => {
    beforeAll(async () => {
      // Create a dedicated reservation and completed payment for refund tests
      const resResult = await pool.query(
        `INSERT INTO reservations 
         (reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, payment_method)
         VALUES ('RES-TEST-REFUND-01', 1, 1, 'Refund Test Guest', 'refund.guest@test.com', '+234800000001', '2026-10-15', '2026-10-16', 1, 100000.00, 100000.00, 'CONFIRMED', 'PAYMENT_SUCCESS', 'CARD')`
      );
      testReservationId = resResult.insertId;

      const txResult = await pool.query(
        `INSERT INTO payment_transactions
         (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, paid_at)
         VALUES (?, 'BFA-TEST-TXN-REFUND', 'CARD', 100000.00, 'NGN', 'SUCCESS', 'PAYSTACK', 'REF-TEST-001', CURRENT_TIMESTAMP)`,
        [testReservationId]
      );
      testPaymentId = txResult.insertId;
    });

    test('1. Reject zero refund amount with 400/422 validation error', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${testPaymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 0, reason: 'Zero refund test' });

      expect([400, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/positive refund amount/i);
    });

    test('2. Reject negative refund amount with 400/422 validation error', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${testPaymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: -5000, reason: 'Negative refund test' });

      expect([400, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/positive refund amount/i);
    });

    test('3. Reject refund exceeding refundable amount with 400/422 validation error', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${testPaymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 150000, reason: 'Excessive refund test' });

      expect([400, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/exceeds remaining refundable amount/i);
    });

    test('4. Reject refund against non-existent transaction with 404', async () => {
      const res = await request(app)
        .post('/api/v1/payments/999999/refund')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 1000, reason: 'Invalid ID' });

      expect(res.status).toBe(404);
    });

    test('5. Process first partial refund and verify remaining refundable amount and parent lineage', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${testPaymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 30000, reason: 'First partial refund' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.refundAmount).toBe(30000);
      expect(res.body.data.remainingRefundable).toBe(70000);

      // Verify original transaction is updated to PARTIALLY_REFUNDED
      const [origTx] = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [testPaymentId]);
      expect(origTx.status).toBe('PARTIALLY_REFUNDED');
      expect(parseFloat(origTx.refund_amount)).toBe(30000);

      // Verify child reversal record preserves lineage
      const [childTx] = await pool.query(
        'SELECT * FROM payment_transactions WHERE parent_transaction_id = ?',
        [testPaymentId]
      );
      expect(childTx).toBeTruthy();
      expect(parseFloat(childTx.amount)).toBe(-30000);
      expect(childTx.status).toBe('REFUNDED');
    });

    test('6. Process second partial refund and verify cumulative tracking', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${testPaymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 30000, reason: 'Second partial refund' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.remainingRefundable).toBe(40000);

      const [origTx] = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [testPaymentId]);
      expect(parseFloat(origTx.refund_amount)).toBe(60000);
      expect(origTx.status).toBe('PARTIALLY_REFUNDED');
    });

    test('7. Complete full refund by refunding remaining balance', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${testPaymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 40000, reason: 'Final refund' });

      expect(res.status).toBe(200);
      expect(res.body.data.remainingRefundable).toBe(0);

      const [origTx] = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [testPaymentId]);
      expect(parseFloat(origTx.refund_amount)).toBe(100000);
      expect(origTx.status).toBe('REFUNDED');
    });

    test('8. Reject refund on already fully refunded transaction with 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${testPaymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 5000, reason: 'Post-full refund attempt' });

      expect([400, 409, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/already been fully refunded/i);
    });

    test('9. Unauthorized user (AGENT) is forbidden from processing refunds', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${testPaymentId}/refund`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ amount: 1000, reason: 'Agent refund attempt' });

      expect(res.status).toBe(403);
    });

    test('10. Financial source-of-truth calculates Net Revenue and Profit Margin accurately', async () => {
      const res = await request(app)
        .get('/api/v1/financial/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const kpis = res.body.data.kpis;
      expect(kpis).toHaveProperty('grossCollected');
      expect(kpis).toHaveProperty('totalRefunded');
      expect(kpis).toHaveProperty('netRevenue');
      expect(kpis).toHaveProperty('approvedExpenses');
      expect(kpis).toHaveProperty('netProfit');
      expect(kpis).toHaveProperty('profitMargin');

      // Net Revenue must equal grossCollected - totalRefunded
      expect(kpis.netRevenue).toBe(Math.max(0, Math.round((kpis.grossCollected - kpis.totalRefunded) * 100) / 100));
      // Net Profit must equal netRevenue - approvedExpenses
      expect(kpis.netProfit).toBe(Math.round((kpis.netRevenue - kpis.approvedExpenses) * 100) / 100);
    });
  });

  // ==========================================
  // B3: Expense Hardening
  // ==========================================
  describe('B3: Operational Expense Hardening', () => {
    test('11. Create operational expense with RECORDED status', async () => {
      const res = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: 1,
          apartment_id: 1,
          category: 'UTILITIES',
          amount: 25000.0,
          description: 'Automated Test Hardening: Generator Fuel Supply',
          vendor_payee: 'Apex Petroleum Ltd',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('RECORDED');
      expect(res.body.data.expense_code).toMatch(/^EXP-/);
      testExpenseId = res.body.data.id;
    });

    test('12. Reject expense creation with non-positive amount', async () => {
      const res = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: 1,
          category: 'UTILITIES',
          amount: -500,
          description: 'Automated Test Hardening: Invalid Amount',
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/positive numeric/i);
    });

    test('13. Reject expense creation with invalid category', async () => {
      const res = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: 1,
          category: 'BOGUS_CATEGORY',
          amount: 5000,
          description: 'Automated Test Hardening: Bogus Category',
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/Invalid category/i);
    });

    test('14. Approve recorded expense transitions status to APPROVED', async () => {
      const res = await request(app)
        .post(`/api/v1/expenses/${testExpenseId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.approved_at).toBeTruthy();
    });

    test('15. Reject duplicate approval of already approved expense with 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/v1/expenses/${testExpenseId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([400, 409, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/already been approved/i);
    });

    test('16. Voiding expense requires reason (min 3 chars)', async () => {
      const res = await request(app)
        .post(`/api/v1/expenses/${testExpenseId}/void`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'no' });

      expect([400, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/void reason is required/i);
    });

    test('17. Void expense sets status to VOIDED without physical deletion', async () => {
      const res = await request(app)
        .post(`/api/v1/expenses/${testExpenseId}/void`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Duplicate invoice submitted by vendor' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('VOIDED');
      expect(res.body.data.void_reason).toBe('Duplicate invoice submitted by vendor');

      // Verify row still exists in database
      const [exp] = await pool.query('SELECT * FROM expenses WHERE id = ?', [testExpenseId]);
      expect(exp).toBeTruthy();
      expect(exp.status).toBe('VOIDED');
    });

    test('18. Reject updating or approving a voided expense', async () => {
      const updateRes = await request(app)
        .put(`/api/v1/expenses/${testExpenseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Attempt edit voided' });

      expect([400, 409, 422]).toContain(updateRes.status);

      const approveRes = await request(app)
        .post(`/api/v1/expenses/${testExpenseId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([400, 409, 422]).toContain(approveRes.status);
    });
  });

  // ==========================================
  // B4: Maintenance & Unit Operational State Hardening
  // ==========================================
  describe('B4: Maintenance & Unit Availability Hardening', () => {
    beforeAll(async () => {
      // Ensure unit starts in AVAILABLE
      await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testMntUnitId]);
    });

    test('19. Non-blocking maintenance creation does not alter AVAILABLE status', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: 1,
          apartment_id: testMntUnitId,
          category: 'GENERAL',
          priority: 'LOW',
          issue_title: 'Hardening Test: Minor Cabinet Hinge',
          description: 'Loose cabinet hinge in kitchen',
          blocking_unit: false,
        });

      expect(res.status).toBe(201);
      const [apt] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testMntUnitId]);
      expect(apt.status).toBe('AVAILABLE');
    });

    test('20. Blocking maintenance creation transitions unit to MAINTENANCE', async () => {
      const res1 = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: 1,
          apartment_id: testMntUnitId,
          category: 'PLUMBING',
          priority: 'HIGH',
          issue_title: 'Hardening Test: Blocking Issue 1 - Water Heater',
          blocking_unit: true,
        });
      blockingMntId1 = res1.body.data.id;

      const [apt] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testMntUnitId]);
      expect(apt.status).toBe('MAINTENANCE');
    });

    test('21. Multiple simultaneous blocking requests: unit stays in MAINTENANCE', async () => {
      const res2 = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: 1,
          apartment_id: testMntUnitId,
          category: 'ELECTRICAL',
          priority: 'HIGH',
          issue_title: 'Hardening Test: Blocking Issue 2 - Main Circuit Breaker',
          blocking_unit: true,
        });
      blockingMntId2 = res2.body.data.id;

      const [apt] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testMntUnitId]);
      expect(apt.status).toBe('MAINTENANCE');
    });

    test('22. Resolving one of multiple blocking requests leaves unit in MAINTENANCE', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/${blockingMntId1}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution_notes: 'Replaced heating element and thermostat.',
          actual_cost: 15000,
        });

      expect(res.status).toBe(200);

      // Issue 2 is still OPEN and blocking, unit MUST NOT become AVAILABLE or CLEANING
      const [apt] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testMntUnitId]);
      expect(apt.status).toBe('MAINTENANCE');
    });

    test('23. Resolving final blocking request transitions unit to CLEANING (not directly AVAILABLE)', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/${blockingMntId2}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution_notes: 'Reset breaker and re-wired sub-panel safely.',
          actual_cost: 8000,
        });

      expect(res.status).toBe(200);

      // Now all blocking requests are resolved, unit transitions to CLEANING
      const [apt] = await pool.query('SELECT status FROM apartments WHERE id = ?', [testMntUnitId]);
      expect(apt.status).toBe('CLEANING');
    });

    test('24. Unit in CLEANING or MAINTENANCE cannot bypass housekeeping directly to AVAILABLE', async () => {
      // Put unit back into MAINTENANCE
      await pool.query('UPDATE apartments SET status = "MAINTENANCE" WHERE id = ?', [testMntUnitId]);

      const res = await request(app)
        .patch(`/api/v1/apartments/${testMntUnitId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'AVAILABLE' });

      expect([400, 409, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/cannot bypass cleaning/i);
    });

    test('25. Existing reservation prevents unit from becoming AVAILABLE', async () => {
      // Create confirmed reservation for unit 2 today
      const todayStr = new Date().toISOString().slice(0, 10);
      const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

      const resRes = await pool.query(
        `INSERT INTO reservations 
         (reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
         VALUES ('RES-TEST-STAY-TODAY', 1, ?, 'Active In-House Guest', 'today.guest@test.com', '+234800000002', ?, ?, 1, 50000, 50000, 'CHECKED_IN', 'PAYMENT_SUCCESS')`,
        [testMntUnitId, todayStr, tomorrowStr]
      );
      const stayId = resRes.insertId;

      await pool.query('UPDATE apartments SET status = "OCCUPIED" WHERE id = ?', [testMntUnitId]);

      const res = await request(app)
        .patch(`/api/v1/apartments/${testMntUnitId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'AVAILABLE' });

      expect([400, 409, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/occupied by active reservation/i);

      // Clean up stay
      await pool.query('DELETE FROM reservations WHERE id = ?', [stayId]);
      await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testMntUnitId]);
    });
  });
});
