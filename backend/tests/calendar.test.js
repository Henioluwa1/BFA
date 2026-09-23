const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Calendar Engine & Unit Availability Tests (Phase 5 - Section 11-17, 42)', () => {
  let adminToken = '';
  let agentToken = '';
  let receptionistToken = '';

  beforeAll(async () => {
    const aRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = aRes.body.data.token;

    const agRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agRes.body.data.token;

    const rRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = rRes.body.data.token;

    // Seed a blocked period for testing
    await pool.query('DELETE FROM blocked_periods WHERE reason LIKE "%Test Calendar Block%"');
    await pool.query(
      `INSERT INTO blocked_periods (property_id, apartment_id, start_date, end_date, reason)
       VALUES (1, 1, '2026-10-01', '2026-10-05', 'Test Calendar Block - HVAC Overhaul')`
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM blocked_periods WHERE reason LIKE "%Test Calendar Block%"');
    await pool.closePool();
  });

  test('1. Get calendar events returns both reservations and authoritative blocked periods', async () => {
    const res = await request(app)
      .get('/api/v1/calendar?fromDate=2026-09-01&toDate=2026-10-31')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const reservationEvents = res.body.data.filter((e) => e.type === 'RESERVATION');
    const blockedEvents = res.body.data.filter((e) => e.type === 'BLOCKED');

    expect(reservationEvents.length).toBeGreaterThan(0);
    expect(blockedEvents.length).toBeGreaterThan(0);

    const firstBlocked = blockedEvents[0];
    expect(firstBlocked.reason).toMatch(/Test Calendar Block/i);
    expect(firstBlocked.status).toBe('BLOCKED');
  });

  test('2. Calendar events filter by propertyId correctly', async () => {
    const res = await request(app)
      .get('/api/v1/calendar?propertyId=1&fromDate=2026-09-01&toDate=2026-10-31')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const events = res.body.data;
    expect(events.length).toBeGreaterThan(0);
    events.forEach((e) => {
      expect(Number(e.propertyId)).toBe(1);
    });
  });

  test('3. Agent role receives strictly isolated calendar bookings', async () => {
    const res = await request(app)
      .get('/api/v1/calendar?fromDate=2026-01-01&toDate=2026-12-31')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    const events = res.body.data;
    // Agent only sees their own reservations and does not see internal maintenance blocks
    const blockedEvents = events.filter((e) => e.type === 'BLOCKED');
    expect(blockedEvents).toHaveLength(0);
  });

  test('4. Unit availability timeline endpoint returns structured unit grid', async () => {
    const res = await request(app)
      .get('/api/v1/calendar/availability?propertyId=1&startDate=2026-09-20&endDate=2026-09-25')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('apartments');
    expect(res.body.data).toHaveProperty('reservations');
    expect(res.body.data).toHaveProperty('blockedPeriods');
    expect(Array.isArray(res.body.data.apartments)).toBe(true);
  });

  test('5. Unauthorized user without token is rejected with 401', async () => {
    const res = await request(app).get('/api/v1/calendar');
    expect(res.status).toBe(401);
  });
});
