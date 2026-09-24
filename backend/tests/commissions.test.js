const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Commission Lifecycle & Settlement Tests (Phase 9 - Part C)', () => {
  let adminToken = '';
  let managerToken = '';
  let agentToken = '';
  let testAgentId = null;
  let testReservationId = null;
  let testCommissionId = null;

  beforeAll(async () => {
    // 1. Logins
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data.token;

    const agRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agRes.body.data.token;

    // Create a dedicated active test agent
    const agentRes = await pool.query(
      `INSERT INTO agents 
       (name, agency_name, email, phone, commission_rate, commission_type, property_id, status)
       VALUES ('Commission Test Agent', 'Elite Realty Ltd', 'com.test.agent@bfa.com', '+2348055554433', 10.00, 'PERCENTAGE', 1, 'ACTIVE')`
    );
    testAgentId = agentRes.insertId;

    // Create a dedicated reservation
    const resResult = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, agent_id, source, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES ('RES-COM-TEST-001', 1, 1, ?, 'AGENT', 'Commission Guest', 'com.guest@test.com', '+2348077778899', '2026-11-25', '2026-11-26', 1, 120000.00, 120000.00, 'CONFIRMED', 'PAYMENT_SUCCESS')`,
      [testAgentId]
    );
    testReservationId = resResult.insertId;
  });

  afterAll(async () => {
    if (testCommissionId) {
      await pool.query('DELETE FROM commissions WHERE id = ?', [testCommissionId]);
    }
    if (testReservationId) {
      await pool.query('DELETE FROM reservations WHERE id = ?', [testReservationId]);
    }
    if (testAgentId) {
      await pool.query('DELETE FROM commissions WHERE agent_id = ?', [testAgentId]);
      await pool.query('DELETE FROM agents WHERE id = ?', [testAgentId]);
    }
    await pool.closePool();
  });

  test('1. Calculate commission for reservation based on agent rate (10% of ₦120,000 = ₦12,000)', async () => {
    const res = await request(app)
      .post('/api/v1/commissions/calculate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: testReservationId,
        agentId: testAgentId,
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CALCULATED');
    expect(parseFloat(res.body.data.booking_amount)).toBe(120000.0);
    expect(parseFloat(res.body.data.commission_rate)).toBe(10.0);
    expect(parseFloat(res.body.data.commission_amount)).toBe(12000.0);
    expect(res.body.data.commission_code).toMatch(/^COM-/);
    testCommissionId = res.body.data.id;
  });

  test('2. Duplicate calculation call updates existing record idempotently without creating duplicates', async () => {
    const res = await request(app)
      .post('/api/v1/commissions/calculate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: testReservationId,
        agentId: testAgentId,
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.data.id).toBe(testCommissionId);

    // Verify exactly one commission record exists for this reservation
    const comRows = await pool.query('SELECT COUNT(*) as count FROM commissions WHERE reservation_id = ?', [testReservationId]);
    expect(parseInt(comRows[0].count, 10)).toBe(1);
  });

  test('3. Reject payout on unapproved commission with validation error', async () => {
    const res = await request(app)
      .post(`/api/v1/commissions/${testCommissionId}/payout`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        payment_reference: 'BNK-PAYOUT-001',
        payment_method: 'BANK_TRANSFER',
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/Only APPROVED commissions can be paid/i);
  });

  test('4. Authorize / approve commission transitions status to APPROVED', async () => {
    const res = await request(app)
      .patch(`/api/v1/commissions/${testCommissionId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.approved_at).toBeTruthy();
  });

  test('5. Reject duplicate approval with 409 Conflict', async () => {
    const res = await request(app)
      .patch(`/api/v1/commissions/${testCommissionId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect([400, 409, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/already approved/i);
  });

  test('6. Payout requires payment transaction reference', async () => {
    const res = await request(app)
      .post(`/api/v1/commissions/${testCommissionId}/payout`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'BANK_TRANSFER' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/payment transaction reference is required/i);
  });

  test('7. Record commission payout dispatches settlement and transitions status to PAID', async () => {
    const res = await request(app)
      .post(`/api/v1/commissions/${testCommissionId}/payout`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        payment_reference: 'BNK-PAYOUT-VIP-9988',
        payment_method: 'BANK_TRANSFER',
        notes: 'Settled via Zenith Bank transfer',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PAID');
    expect(res.body.data.paid_at).toBeTruthy();
    expect(res.body.data.payment_reference).toBe('BNK-PAYOUT-VIP-9988');
  });

  test('8. Recalculation is rejected on already PAID commission', async () => {
    const res = await request(app)
      .post('/api/v1/commissions/calculate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: testReservationId,
        agentId: testAgentId,
      });

    expect([400, 409, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/already been PAID and cannot be recalculated/i);
  });

  test('9. Summary metrics accurately aggregate commission statistics', async () => {
    const res = await request(app)
      .get('/api/v1/commissions/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data).toHaveProperty('paid_amount');
    expect(parseFloat(res.body.data.paid_amount)).toBeGreaterThanOrEqual(12000);
  });

  test('10. Agent role cannot approve or disburse commission payouts (Capability Enforcement)', async () => {
    const approveRes = await request(app)
      .patch(`/api/v1/commissions/${testCommissionId}/approve`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(approveRes.status).toBe(403);

    const payoutRes = await request(app)
      .post(`/api/v1/commissions/${testCommissionId}/payout`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ payment_reference: 'MALICIOUS_REF' });

    expect(payoutRes.status).toBe(403);
  });
});
