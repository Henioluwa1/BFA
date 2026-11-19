/**
 * End-to-End Express API Tests on PostgreSQL
 * TASK AIVEN-05: Live Aiven PostgreSQL
 *
 * Verifies public and authenticated API routes through Supertest and Express app
 * connected live to Aiven PostgreSQL (bfa_apartments_db).
 */

const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('End-to-End Express API on Live PostgreSQL (TASK AIVEN-05)', () => {
  let adminToken = '';

  beforeAll(async () => {
    pool.setEngineOverride('postgres');

    // Authenticate Admin
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@bfa.com',
        password: 'Bfa2026!Secure',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    adminToken = loginRes.body.data.token;
  });

  afterAll(async () => {
    pool.clearEngineOverride();
    await pool.closePool();
  });

  test('1. GET /api/v1/health returns healthy Aiven PostgreSQL status with 31 migrations', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.database.provider).toBe('Aiven PostgreSQL');
    expect(res.body.data.database.status).toBe('connected');
    expect(res.body.data.database).not.toHaveProperty('appliedMigrations');
  });

  test('2. GET /api/v1/properties returns all 3 properties with calculated stats', async () => {
    const res = await request(app)
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(3);

    const codes = res.body.data.map((p) => p.code);
    expect(codes).toContain('GHT');
    expect(codes).toContain('ABR');
    expect(codes).toContain('RPS');
  });

  test('3. GET /api/v1/apartments returns all 6 seeded units', async () => {
    const res = await request(app)
      .get('/api/v1/apartments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(6);
  });

  test('4. GET /api/v1/reservations returns seeded reservations', async () => {
    const res = await request(app)
      .get('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  test('5. GET /api/v1/users returns user roster with property-level joins', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(7);
  });
});
