const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');

describe('Audit Trail & Logging Tests (Section 9, 10, 26)', () => {
  afterAll(async () => {
    await pool.closePool();
  });

  const adminToken = jwt.sign({ id: 2, email: 'admin@bfa.com', role: 'ADMIN' }, config.security.jwtSecret);
  const staffToken = jwt.sign({ id: 5, email: 'staff@bfa.com', role: 'STAFF' }, config.security.jwtSecret);

  it('should query administrative audit logs when role is Admin', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('should reject access to audit logs when role is Staff', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should correlate audit entry with X-Request-Id when action is performed', async () => {
    const customRequestId = `req-trace-audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const futureDays = 5000 + Math.floor(Math.random() * 3000);
    const d = new Date(Date.now() + futureDays * 86400000);
    const checkIn = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 1);
    const checkOut = d.toISOString().split('T')[0];

    // Create a 1-night reservation with custom requestId
    const createRes = await request(app)
      .post('/api/v1/reservations')
      .set('X-Request-Id', customRequestId)
      .send({
        apartment_id: 1,
        tenant_name: 'Audit Trace Test Guest',
        tenant_email: 'trace@example.com',
        tenant_phone: '+234 809 999 8888',
        check_in_date: checkIn,
        check_out_date: checkOut,
        total_amount: 350.00,
      });

    expect(createRes.statusCode).toBe(201);

    // Query audit logs and verify entry has request_id
    const auditRes = await request(app)
      .get('/api/v1/audit?action=RESERVATION_CREATED')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(auditRes.statusCode).toBe(200);
    const traceEntry = auditRes.body.data.find((e) => e.request_id === customRequestId);
    expect(traceEntry).toBeDefined();
    expect(traceEntry.action).toBe('RESERVATION_CREATED');
    expect(traceEntry.entity_type).toBe('reservation');
  });
});
