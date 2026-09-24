const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Agent Management & Attribution Tests (Phase 9 - Part C)', () => {
  let adminToken = '';
  let managerToken = '';
  let agentToken = '';
  let createdAgentId = null;
  let testReservationId = null;

  beforeAll(async () => {
    // 1. Admin login
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    // 2. Manager login
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

    // Clean up test agents
    await pool.query('DELETE FROM agents WHERE email LIKE "%autotest.agent%"');
  });

  afterAll(async () => {
    if (testReservationId) {
      await pool.query('DELETE FROM reservations WHERE id = ?', [testReservationId]);
    }
    await pool.query('DELETE FROM agents WHERE email LIKE "%autotest.agent%"');
    await pool.closePool();
  });

  test('1. Create new agent partner with percentage commission model', async () => {
    const res = await request(app)
      .post('/api/v1/agents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Autotest Agent Sarah',
        agency_name: 'Prime Realty Ventures',
        email: 'sarah.autotest.agent@bfa.com',
        phone: '+2348031112233',
        commission_rate: 12.5,
        commission_type: 'PERCENTAGE',
        property_id: 1,
        bank_name: 'Zenith Bank',
        account_number: '1002003004',
        account_name: 'Prime Realty Ventures Ltd',
        status: 'ACTIVE',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('Autotest Agent Sarah');
    expect(res.body.data.commission_type).toBe('PERCENTAGE');
    expect(parseFloat(res.body.data.commission_rate)).toBe(12.5);
    expect(res.body.data.status).toBe('ACTIVE');
    createdAgentId = res.body.data.id;
  });

  test('2. Reject agent creation with duplicate email', async () => {
    const res = await request(app)
      .post('/api/v1/agents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicate Sarah',
        email: 'sarah.autotest.agent@bfa.com',
        phone: '+2348039999999',
      });

    expect([400, 409, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/already exists/i);
  });

  test('3. Retrieve agent list with search and property filtering', async () => {
    const res = await request(app)
      .get('/api/v1/agents?search=Sarah&propertyId=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].email).toBe('sarah.autotest.agent@bfa.com');
  });

  test('4. Update agent commission terms and agency details', async () => {
    const res = await request(app)
      .put(`/api/v1/agents/${createdAgentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        commission_rate: 15.0,
        agency_name: 'Prime Luxury Properties',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(parseFloat(res.body.data.commission_rate)).toBe(15.0);
    expect(res.body.data.agency_name).toBe('Prime Luxury Properties');
  });

  test('5. Deactivate agent partner and verify status transitions to INACTIVE', async () => {
    const res = await request(app)
      .patch(`/api/v1/agents/${createdAgentId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INACTIVE');
  });

  test('6. Reject reservation attribution to inactive agent with 400 validation error', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 1,
        apartment_id: 1,
        agent_id: createdAgentId,
        check_in_date: '2026-11-20',
        tenant_name: 'Agent Referral Guest',
        tenant_email: 'ref.guest@test.com',
        tenant_phone: '+2348099887766',
        total_amount: 50000,
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/cannot be assigned new bookings/i);
  });

  test('7. Re-activate agent and successfully attribute reservation (DIRECT vs AGENT)', async () => {
    // Re-activate agent
    await request(app)
      .patch(`/api/v1/agents/${createdAgentId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 1,
        apartment_id: 1,
        agent_id: createdAgentId,
        check_in_date: '2026-11-20',
        tenant_name: 'Referred Client VIP',
        tenant_email: 'vip.client@test.com',
        tenant_phone: '+2348099887766',
        total_amount: 80000,
        paid_amount: 80000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.agent_id).toBe(createdAgentId);
    expect(res.body.data.source).toBe('AGENT');
    testReservationId = res.body.data.id;
  });

  test('8. Retrieve agent referred clients list', async () => {
    const res = await request(app)
      .get(`/api/v1/agents/${createdAgentId}/clients`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].email).toBe('vip.client@test.com');
  });

  test('9. Retrieve agent performance metrics', async () => {
    const res = await request(app)
      .get(`/api/v1/agents/${createdAgentId}/performance`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('summary');
    expect(res.body.data.summary.total_bookings).toBeGreaterThanOrEqual(1);
    expect(parseFloat(res.body.data.summary.total_booking_volume)).toBeGreaterThanOrEqual(80000);
  });

  test('10. Agent role cannot view other agents (Security Isolation)', async () => {
    const res = await request(app)
      .get(`/api/v1/agents/${createdAgentId}`)
      .set('Authorization', `Bearer ${agentToken}`);

    // Agent user ID 1 cannot view newly created agent
    expect([403, 404]).toContain(res.status);
  });
});
