const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Audit Trail & Logging Tests (Section 9, 10, 26)', () => {
  afterAll(async () => {
    await pool.closePool();
  });

  it('should query administrative audit logs when role is Admin', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('X-User-Role', 'Admin');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('should reject access to audit logs when role is Staff', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('X-User-Role', 'Staff');

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should correlate audit entry with X-Request-Id when action is performed', async () => {
    const customRequestId = `req-trace-audit-${Date.now()}`;
    const dynamicDay = Math.floor(Math.random() * 20) + 10;
    const checkIn = `2035-08-${dynamicDay}`;
    const checkOut = `2035-08-${dynamicDay + 1}`;

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
      .set('X-User-Role', 'Admin');

    expect(auditRes.statusCode).toBe(200);
    const traceEntry = auditRes.body.data.find((e) => e.request_id === customRequestId);
    expect(traceEntry).toBeDefined();
    expect(traceEntry.action).toBe('RESERVATION_CREATED');
    expect(traceEntry.entity_type).toBe('reservation');
  });
});
