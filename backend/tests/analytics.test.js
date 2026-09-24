const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Executive Analytics & Authoritative Reporting Tests (Phase 10 - Part D)', () => {
  let adminToken = '';
  let managerToken = '';
  let agentToken = '';

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
  });

  afterAll(async () => {
    await pool.closePool();
  });

  // ==========================================
  // D1 & D5: Analytics Overview & Financial KPIs
  // ==========================================
  test('1. Retrieve executive analytics overview with ADR, Occupancy, RevPAR, and NOI', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/overview?propertyId=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('summary');
    expect(res.body.data).toHaveProperty('period');
    expect(res.body.data).toHaveProperty('dailyTrends');

    const summary = res.body.data.summary;
    expect(summary).toHaveProperty('occupancyRate');
    expect(summary).toHaveProperty('adr');
    expect(summary).toHaveProperty('revPar');
    expect(summary).toHaveProperty('totalRevenue');
    expect(summary).toHaveProperty('collectedRevenue');
    expect(summary).toHaveProperty('totalExpenses');
    expect(summary).toHaveProperty('netOperatingIncome');
    expect(summary).toHaveProperty('profitMargin');
    expect(summary).toHaveProperty('totalBookings');
  });

  test('2. Overview analytics responds cleanly to empty date ranges', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/overview?fromDate=2020-01-01&toDate=2020-01-05')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalBookings).toBe(0);
    expect(res.body.data.summary.totalRevenue).toBe(0);
    expect(res.body.data.summary.occupancyRate).toBe(0);
    expect(res.body.data.summary.adr).toBe(0);
    expect(res.body.data.summary.revPar).toBe(0);
  });

  // ==========================================
  // D2: Reservations Analytics
  // ==========================================
  test('3. Retrieve reservation channel distribution and ALOS metrics', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/reservations')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sources');
    expect(res.body.data).toHaveProperty('statuses');
    expect(res.body.data).toHaveProperty('metrics');
    expect(res.body.data.metrics).toHaveProperty('averageLengthOfStay');
    expect(res.body.data.metrics).toHaveProperty('averageLeadTimeDays');
  });

  // ==========================================
  // D3: Apartment / Unit Performance Analytics
  // ==========================================
  test('4. Retrieve apartment unit performance breakdown', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/apartments?propertyId=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      const unit = res.body.data[0];
      expect(unit).toHaveProperty('apartment_id');
      expect(unit).toHaveProperty('unit_number');
      expect(unit).toHaveProperty('occupancy_rate');
      expect(unit).toHaveProperty('rev_par');
      expect(unit).toHaveProperty('maintenance_cost');
    }
  });

  // ==========================================
  // D4: Agent Performance Analytics
  // ==========================================
  test('5. Retrieve agent performance leaderboard and commission breakdown', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/agents')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      const agent = res.body.data[0];
      expect(agent).toHaveProperty('agent_id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('total_bookings');
      expect(agent).toHaveProperty('total_volume_brought');
      expect(agent).toHaveProperty('total_commission_generated');
    }
  });

  // ==========================================
  // D6: Operational Analytics (Maintenance & Inspection)
  // ==========================================
  test('6. Retrieve operational maintenance & inspection turnaround analytics', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/operations?propertyId=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('maintenance');
    expect(res.body.data).toHaveProperty('inspections');

    const mnt = res.body.data.maintenance;
    expect(mnt).toHaveProperty('total_requests');
    expect(mnt).toHaveProperty('open_count');
    expect(mnt).toHaveProperty('resolved_count');
  });

  // ==========================================
  // D7: Authoritative Reports & Exports
  // ==========================================
  test('7. Retrieve payment transactions report with CSV export', async () => {
    const res = await request(app)
      .get('/api/v1/reports/payments?format=csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Transaction Reference');
  });

  test('8. Retrieve operational expenses report with CSV export', async () => {
    const res = await request(app)
      .get('/api/v1/reports/expenses?format=csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Expense Code');
    expect(res.text).toContain('Category');
  });

  test('9. Retrieve commissions ledger report with CSV export and PDF export', async () => {
    // CSV export
    const csvRes = await request(app)
      .get('/api/v1/reports/commissions?format=csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('Commission Code');

    // PDF export
    const pdfRes = await request(app)
      .get('/api/v1/reports/commissions?format=pdf')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, cb) => {
        res.data = '';
        res.on('data', (c) => { res.data += c; });
        res.on('end', () => cb(null, res.data));
      });

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect(pdfRes.body.toString().startsWith('%PDF-')).toBe(true);
  });

  test('10. Security: Agent role is forbidden from viewing operational reports', async () => {
    const res = await request(app)
      .get('/api/v1/reports/expenses')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(403);
  });
});
