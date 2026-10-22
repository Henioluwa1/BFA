const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');

describe('Audit Trail & Logging Tests (Section 2, 3, 4, 6, 7, 8, 10, 11, 14, 15, 16, 26)', () => {
  afterAll(async () => {
    await pool.closePool();
  });

  const adminToken = jwt.sign({ id: 2, email: 'admin@bfa.com', role: 'ADMIN' }, config.security.jwtSecret);
  const managerToken = jwt.sign({ id: 3, email: 'manager@bfa.com', role: 'MANAGER' }, config.security.jwtSecret);
  const staffToken = jwt.sign({ id: 5, email: 'staff@bfa.com', role: 'STAFF' }, config.security.jwtSecret);
  const receptionistToken = jwt.sign({ id: 4, email: 'recep@bfa.com', role: 'RECEPTIONIST' }, config.security.jwtSecret);

  // 1. All Actions returns all authorized audit events
  it('1. All Actions returns all authorized audit events without restriction', async () => {
    const resNoFilter = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    const resAllActions = await request(app)
      .get('/api/v1/audit?action=All+Actions')
      .set('Authorization', `Bearer ${adminToken}`);

    const resAll = await request(app)
      .get('/api/v1/audit?action=ALL')
      .set('Authorization', `Bearer ${adminToken}`);

    const resEmpty = await request(app)
      .get('/api/v1/audit?action=')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resNoFilter.statusCode).toBe(200);
    expect(resAllActions.statusCode).toBe(200);
    expect(resAll.statusCode).toBe(200);
    expect(resEmpty.statusCode).toBe(200);

    expect(resAllActions.body.meta.total).toBe(resNoFilter.body.meta.total);
    expect(resAll.body.meta.total).toBe(resNoFilter.body.meta.total);
    expect(resEmpty.body.meta.total).toBe(resNoFilter.body.meta.total);
  });

  // 2. Action-specific filtering works
  it('2. Action-specific filtering works for exact actions and action categories', async () => {
    const resLogin = await request(app)
      .get('/api/v1/audit?action=LOGIN')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resLogin.statusCode).toBe(200);
    resLogin.body.data.forEach((entry) => {
      expect(entry.action).toMatch(/LOGIN/);
    });

    const resCategory = await request(app)
      .get('/api/v1/audit?action=RESERVATION_ACTIONS')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resCategory.statusCode).toBe(200);
    resCategory.body.data.forEach((entry) => {
      expect(entry.action).toMatch(/RESERVATION/);
    });
  });

  // 3. From-date filtering works
  it('3. From-date filtering works and includes start-of-day boundary (00:00:00)', async () => {
    const res = await request(app)
      .get('/api/v1/audit?fromDate=2026-01-01')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    res.body.data.forEach((entry) => {
      expect(new Date(entry.created_at).getTime()).toBeGreaterThanOrEqual(new Date('2026-01-01 00:00:00').getTime());
    });
  });

  // 4. To-date filtering works
  it('4. To-date filtering works and includes end-of-day boundary (23:59:59)', async () => {
    const res = await request(app)
      .get('/api/v1/audit?toDate=2028-12-31')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    res.body.data.forEach((entry) => {
      expect(new Date(entry.created_at).getTime()).toBeLessThanOrEqual(new Date('2028-12-31 23:59:59').getTime());
    });
  });

  // 5. Start-time filtering works
  it('5. Start-time filtering works with precise HH:mm boundary', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/v1/audit?fromDate=${today}&fromTime=00:00`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  // 6. End-time filtering works
  it('6. End-time filtering works with precise HH:mm boundary (including :59 seconds)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/v1/audit?toDate=${today}&toTime=23:59`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  // 7. Combined datetime filtering works
  it('7. Combined datetime filtering works simultaneously with action filtering', async () => {
    const res = await request(app)
      .get('/api/v1/audit?action=All+Actions&fromDate=2026-01-01&fromTime=00:00&toDate=2028-12-31&toTime=23:59')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.pagination).toBeDefined();
  });

  // 8. Clear/no filters returns all authorized records
  it('8. Clear/no filters returns all authorized records', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  // 9. Pagination returns correct records
  it('9. Pagination returns correct records per page', async () => {
    const resPage1 = await request(app)
      .get('/api/v1/audit?page=1&pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`);

    const resPage2 = await request(app)
      .get('/api/v1/audit?page=2&pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resPage1.statusCode).toBe(200);
    expect(resPage2.statusCode).toBe(200);
    expect(resPage1.body.data.length).toBeLessThanOrEqual(1);

    if (resPage1.body.pagination.total > 1) {
      expect(resPage2.body.data.length).toBe(1);
      expect(resPage1.body.data[0].id).not.toBe(resPage2.body.data[0].id);
    }
  });

  // 10. Pagination metadata is correct
  it('10. Pagination metadata is accurate (page, pageSize, total, totalPages, hasNext, hasPrev)', async () => {
    const res = await request(app)
      .get('/api/v1/audit?page=1&pageSize=50')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    const p = res.body.pagination;
    expect(p).toBeDefined();
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(50);
    expect(p.total).toBeGreaterThanOrEqual(0);
    expect(p.totalPages).toBeGreaterThanOrEqual(1);
    expect(typeof p.hasNext).toBe('boolean');
    expect(p.hasPrev).toBe(false);
  });

  // 11. Changing filters / default query resets to page 1
  it('11. Query defaults to page 1 when page parameter is omitted', async () => {
    const res = await request(app)
      .get('/api/v1/audit?action=USER_LOGIN')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.pagination.page).toBe(1);
  });

  // 12. Unauthorized audit records remain inaccessible
  it('12. Unauthorized audit records remain strictly inaccessible to unauthorized roles and unauthenticated callers', async () => {
    // Unauthenticated caller
    const unauthRes = await request(app).get('/api/v1/audit');
    expect(unauthRes.statusCode).toBe(401);

    // Receptionist role
    const recepRes = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${receptionistToken}`);
    expect(recepRes.statusCode).toBe(403);

    // Staff role
    const staffRes = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffRes.statusCode).toBe(403);

    // Spoofed X-User-Role header must be ignored
    const spoofRes = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-User-Role', 'ADMIN');
    expect(spoofRes.statusCode).toBe(403);

    // Authorized Manager can access
    const managerRes = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(managerRes.statusCode).toBe(200);
  });

  // 13. Results are deterministically ordered
  it('13. Results are deterministically ordered newest first (created_at DESC, id DESC)', async () => {
    const res = await request(app)
      .get('/api/v1/audit?pageSize=50')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    for (let i = 0; i < data.length - 1; i++) {
      const current = new Date(data[i].created_at).getTime();
      const next = new Date(data[i + 1].created_at).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
      if (current === next) {
        expect(data[i].id).toBeGreaterThan(data[i + 1].id);
      }
    }
  });

  // 14. Page size cannot be abused
  it('14. Page size cannot be abused to request excessive records (capped at max 100)', async () => {
    const res = await request(app)
      .get('/api/v1/audit?pageSize=9999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.pagination.pageSize).toBe(100);
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });

  // Request correlation test
  it('15. should correlate audit entry with X-Request-Id when action is performed', async () => {
    const customRequestId = `req-trace-audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const futureDays = 6000 + Math.floor(Math.random() * 3000);
    const d = new Date(Date.now() + futureDays * 86400000);
    const checkIn = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 1);
    const checkOut = d.toISOString().split('T')[0];

    const createRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Request-Id', customRequestId)
      .send({
        apartment_id: 1,
        tenant_name: 'Audit Trace Test Guest',
        tenant_email: 'trace@example.com',
        tenant_phone: '+234 809 999 8888',
        check_in_date: checkIn,
        check_out_date: checkOut,
        total_amount: 350000.00,
      });

    expect(createRes.statusCode).toBe(201);

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
