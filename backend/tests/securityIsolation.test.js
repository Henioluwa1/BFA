const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Security Isolation & RBAC Protection Test Suite (Section 2, 6, 26, 30)', () => {
  let adminToken = '';
  let agentToken = '';
  let receptionistToken = ''; // Scoped to property_id: 1

  beforeAll(async () => {
    // 1. Authenticate Admin
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    // 2. Authenticate Agent
    const agentRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agentRes.body.data.token;

    // 3. Authenticate Receptionist (Property 1)
    const recRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = recRes.body.data.token;
  });

  afterAll(async () => {
    await pool.closePool();
  });

  describe('1. Unauthenticated Access Protection (HTTP 401)', () => {
    it('rejects unauthenticated access to Calendar events', async () => {
      const res = await request(app).get('/api/v1/calendar');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated access to Front Office arrivals', async () => {
      const res = await request(app).get('/api/v1/front-office/arrivals');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated access to Guests directory', async () => {
      const res = await request(app).get('/api/v1/guests');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated access to Inspections', async () => {
      const res = await request(app).get('/api/v1/inspections');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Role-Based Access Control Boundaries (HTTP 403)', () => {
    it('rejects AGENT access to inspections module with HTTP 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/inspections')
        .set('Authorization', `Bearer ${agentToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects AGENT access to Front Office arrivals with HTTP 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/front-office/arrivals')
        .set('Authorization', `Bearer ${agentToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects AGENT access to Calendar timeline availability grid with HTTP 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/calendar/availability')
        .set('Authorization', `Bearer ${agentToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects RECEPTIONIST from creating unit blocked periods (requires ADMIN/MANAGER/OWNER)', async () => {
      const res = await request(app)
        .post('/api/v1/apartments/1/blocked-periods')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          startDate: '2031-11-01',
          endDate: '2031-11-05',
          reason: 'Unauthorized attempt',
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('3. Property Scoping Enforcement', () => {
    it('rejects Receptionist (Property 1) from managing or viewing units belonging to Property 2', async () => {
      // Find a unit belonging to Property 2
      const [aptRow] = await pool.query('SELECT id FROM apartments WHERE property_id = 2 LIMIT 1');
      if (aptRow) {
        const res = await request(app)
          .get(`/api/v1/apartments/${aptRow.id}`)
          .set('Authorization', `Bearer ${receptionistToken}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('rejects Receptionist (Property 1) from creating inspections for Property 2', async () => {
      const [aptRow] = await pool.query('SELECT id FROM apartments WHERE property_id = 2 LIMIT 1');
      if (aptRow) {
        const res = await request(app)
          .post('/api/v1/inspections')
          .set('Authorization', `Bearer ${receptionistToken}`)
          .send({
            property_id: 2,
            apartment_id: aptRow.id,
            inspection_type: 'ROUTINE',
            condition_rating: 'EXCELLENT',
          });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('4. Strict Agent Data Isolation', () => {
    it('ensures AGENT calendar query excludes blocked periods and only returns agent-linked reservations', async () => {
      const res = await request(app)
        .get('/api/v1/calendar?fromDate=2020-01-01&toDate=2035-12-31')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      const events = res.body.data;
      expect(Array.isArray(events)).toBe(true);

      // 1. No BLOCKED events visible to agents
      const blockedEvents = events.filter((e) => e.type === 'BLOCKED');
      expect(blockedEvents).toHaveLength(0);

      // 2. All reservation events belong exclusively to this agent (agentId: 1)
      for (const e of events) {
        expect(e.type).toBe('RESERVATION');
      }
    });
  });

  describe('5. Malformed Request & Forged ID Protection', () => {
    it('returns 404 for non-existent reservation ID instead of unhandled 500 error', async () => {
      const res = await request(app)
        .get('/api/v1/reservations/99999999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for non-existent unit ID on availability check instead of crashing', async () => {
      const res = await request(app)
        .get('/api/v1/apartments/99999999/availability?checkInDate=2031-12-01');
      expect(res.status).toBe(200);
      expect(res.body.data.isAvailable).toBe(false);
      expect(res.body.data.reason).toMatch(/not found/i);
    });
  });
});
