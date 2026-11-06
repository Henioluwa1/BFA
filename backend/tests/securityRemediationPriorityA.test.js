const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');

describe('Priority A Security Remediation Tests', () => {
  let adminToken = '';
  let superAdminToken = '';
  let receptionistToken = '';
  let unlinkedAgentToken = '';
  let linkedAgentToken = '';

  beforeAll(async () => {
    // 1. Authenticate Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@bfa.com', password: 'Bfa2026!Secure' });
    adminToken = adminRes.body.data.token;

    // 2. Authenticate Super Admin
    const saRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@bfa.com', password: 'Bfa2026!Secure' });
    superAdminToken = saRes.body.data.token;

    // 3. Authenticate Receptionist
    const recRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'receptionist@bfa.com', password: 'Bfa2026!Secure' });
    receptionistToken = recRes.body.data.token;

    // 4. Generate Unlinked Agent Token (role: AGENT, agentId: null)
    unlinkedAgentToken = jwt.sign(
      { id: 998, email: 'unlinked.agent@test.com', role: 'AGENT', agentId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    // 5. Generate Linked Agent Token (role: AGENT, agentId: 2)
    linkedAgentToken = jwt.sign(
      { id: 999, email: 'linked.agent2@test.com', role: 'AGENT', agentId: 2 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await pool.closePool();
  });

  describe('1. SUPER_ADMIN Least Privilege & Route Access', () => {
    test('SUPER_ADMIN maintains technical maintenance access to audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('SUPER_ADMIN is blocked from business payment refunds (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/1/refund')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ amount: 5000, reason: 'Unauthorized test refund' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. User-Role Elevation Guards in updateUser', () => {
    test('ADMIN attempting to elevate a user to SUPER_ADMIN is rejected with 403 FORBIDDEN', async () => {
      // Find a non-admin user (e.g. receptionist or staff)
      const [users] = await pool.query("SELECT id FROM users WHERE role = 'STAFF' OR role = 'RECEPTIONIST' LIMIT 1");
      const targetUserId = users[0]?.id || 3;

      const res = await request(app)
        .put(`/api/v1/users/${targetUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'SUPER_ADMIN' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Only Super Admin is authorized/i);
    });

    test('ADMIN attempting to elevate a user to OWNER is rejected with 403 FORBIDDEN', async () => {
      const [users] = await pool.query("SELECT id FROM users WHERE role = 'STAFF' OR role = 'RECEPTIONIST' LIMIT 1");
      const targetUserId = users[0]?.id || 3;

      const res = await request(app)
        .put(`/api/v1/users/${targetUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'OWNER' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Only Super Admin is authorized/i);
    });

    test('User attempting to change their own role is rejected with 403 FORBIDDEN', async () => {
      // Admin tries to self-elevate to SUPER_ADMIN
      const adminPayload = jwt.decode(adminToken);
      const res = await request(app)
        .put(`/api/v1/users/${adminPayload.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'SUPER_ADMIN' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Users are not permitted to change their own role/i);
    });
  });

  describe('3. Agent Ownership Isolation & Zero Fallback to Agent 1', () => {
    test('Unlinked Agent accessing GET /reservations is rejected with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reservations')
        .set('Authorization', `Bearer ${unlinkedAgentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Agent user account is not linked/i);
    });

    test('Unlinked Agent creating a reservation is rejected with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${unlinkedAgentToken}`)
        .send({
          apartment_id: 1,
          tenant_name: 'Test Tenant',
          tenant_email: 'tenant@test.com',
          tenant_phone: '+2348011112222',
          check_in_date: '2027-04-10',
          check_out_date: '2027-04-11',
          payment_method: 'CASH',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Agent user account is not linked/i);
    });

    test('Linked Agent (ID 2) attempting to attribute booking to Agent 1 is rejected with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${linkedAgentToken}`)
        .send({
          apartment_id: 1,
          agent_id: 1, // Attacker tries to book on behalf of Agent 1
          tenant_name: 'Impersonation Attempt',
          tenant_email: 'spoofed@test.com',
          tenant_phone: '+2348011112222',
          check_in_date: '2027-04-10',
          check_out_date: '2027-04-11',
          payment_method: 'CASH',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Agents are strictly isolated to their own bookings/i);
    });

    test('Unlinked Agent searching reservations is rejected with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=BFA')
        .set('Authorization', `Bearer ${unlinkedAgentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Agent profile not linked/i);
    });
  });
});

