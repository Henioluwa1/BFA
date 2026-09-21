const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Security, Authentication & Role Authorization Tests (Section 6, 7, 8, 9, 26)', () => {
  afterAll(async () => {
    await pool.closePool();
  });

  let adminToken = '';
  let receptionistToken = '';
  let superAdminToken = '';

  test('1. Valid Admin Login - Backend returns authoritative identity and JWT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@bfa.com',
        password: 'Bfa2026!Secure',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('ADMIN');
    expect(res.body.data.user.email).toBe('admin@bfa.com');
    expect(typeof res.body.data.token).toBe('string');
    adminToken = res.body.data.token;
  });

  test('2. Valid Receptionist Login - Backend returns RECEPTIONIST role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'receptionist@bfa.com',
        password: 'Bfa2026!Secure',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('RECEPTIONIST');
    receptionistToken = res.body.data.token;
  });

  test('3. Valid Super Admin Login - Backend returns SUPER_ADMIN role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'superadmin@bfa.com',
        password: 'Bfa2026!Secure',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('SUPER_ADMIN');
    superAdminToken = res.body.data.token;
  });

  test('4. Invalid Credentials Rejected with 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@bfa.com',
        password: 'WrongPassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('5. Accessing Protected Admin Audit Trail without Token fails with 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/audit');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('6. Spoofed X-User-Role header without Token is IGNORED and fails with 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('X-User-Role', 'ADMIN') // Attacker tries to pretend to be ADMIN via header
      .set('X-User-Role', 'SUPER_ADMIN');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('7. Receptionist Token attempting to access Admin Audit Trail is rejected with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('8. Receptionist Token sending spoofed X-User-Role: ADMIN is STILL REJECTED with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .set('X-User-Role', 'ADMIN'); // Attacker tries header spoofing with lower-privileged token

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('9. Tampered / Malformed Token is rejected with 401 UNAUTHORIZED', async () => {
    const tamperedToken = adminToken.substring(0, adminToken.length - 8) + 'ABCDEFGH';
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${tamperedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('10. Authorized Admin Token successfully accesses Admin Audit Trail', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('11. Authorized Super Admin Token successfully accesses Admin Audit Trail', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('12. Public Booking Endpoint creates valid 1-night reservation without requiring auth token', async () => {
    const testEmail = `public.guest.${Date.now()}@example.com`;
    // Use random future date to guarantee zero conflict with other test runs
    const futureDays = 1000 + Math.floor(Math.random() * 500);
    const d = new Date(Date.now() + futureDays * 86400000);
    const checkInDate = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 1);
    const expectedCheckOut = d.toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: 1,
        guestName: 'Jane Public',
        guestEmail: testEmail,
        guestPhone: '+234 800 123 4567',
        checkInDate,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nights).toBe(1);
    expect(res.body.data.checkOutDate).toBe(expectedCheckOut);
  });
});
