const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Tenants & Guests Domain Tests (Phase 6 - Section 23-28)', () => {
  let adminToken = '';
  let receptionistToken = '';
  let agentToken = '';
  let createdGuestId = null;

  beforeAll(async () => {
    const aRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = aRes.body.data.token;

    const rRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = rRes.body.data.token;

    const agRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agRes.body.data.token;

    // Clean up test guests
    await pool.query('DELETE FROM guests WHERE email LIKE "%test-guest%" OR email LIKE "%duplicate%"');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM guests WHERE email LIKE "%test-guest%" OR email LIKE "%duplicate%"');
    await pool.closePool();
  });

  test('1. List all guests returns profiles with reservation statistics', async () => {
    const res = await request(app)
      .get('/api/v1/guests')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(first).toHaveProperty('display_name');
    expect(first).toHaveProperty('email');
    expect(first).toHaveProperty('phone');
    expect(first).toHaveProperty('total_reservations');
  });

  test('2. Create new guest profile with full metadata', async () => {
    const payload = {
      first_name: 'Olufemi',
      last_name: 'Adeyemi',
      display_name: 'Barrister Olufemi Adeyemi',
      email: 'olufemi.adeyemi@test-guest.com',
      phone: '+234 802 999 1111',
      city: 'Lagos',
      country: 'Nigeria',
      nationality: 'Nigerian',
      identification_type: 'NIN',
      identification_number: 'NIN-99281729102',
      status: 'VIP',
      notes: 'Corporate account senior partner',
    };

    const res = await request(app)
      .post('/api/v1/guests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('olufemi.adeyemi@test-guest.com');
    expect(res.body.data.status).toBe('VIP');
    expect(res.body.data.identification_type).toBe('NIN');
    createdGuestId = res.body.data.id;
  });

  test('3. Duplicate guest email is rejected with 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/v1/guests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'Duplicate',
        last_name: 'User',
        email: 'olufemi.adeyemi@test-guest.com',
        phone: '+234 800 000 0000',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already exists/i);
  });

  test('4. Get guest by ID returns full profile and reservation history', async () => {
    const res = await request(app)
      .get(`/api/v1/guests/${createdGuestId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdGuestId);
    expect(Array.isArray(res.body.data.reservations)).toBe(true);
  });

  test('5. Update guest profile details', async () => {
    const res = await request(app)
      .put(`/api/v1/guests/${createdGuestId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'Updated preferred contact method to WhatsApp',
        status: 'ACTIVE',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.notes).toMatch(/WhatsApp/i);
  });

  test('6. Duplicate detection identifies matching emails or phones', async () => {
    // Insert another record with same phone but different email
    const duplicateRes = await request(app)
      .post('/api/v1/guests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'Olufemi',
        last_name: 'A.',
        email: 'olufemi.alt@duplicate-test.com',
        phone: '+234 802 999 1111', // Same phone
      });

    expect(duplicateRes.status).toBe(201);
    const duplicateId = duplicateRes.body.data.id;

    const dupListRes = await request(app)
      .get('/api/v1/guests/duplicates')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(dupListRes.status).toBe(200);
    expect(Array.isArray(dupListRes.body.data)).toBe(true);
    const phoneMatch = dupListRes.body.data.find(
      (d) => (d.primary_id === createdGuestId && d.duplicate_id === duplicateId) ||
             (d.primary_id === duplicateId && d.duplicate_id === createdGuestId)
    );
    expect(phoneMatch).toBeTruthy();

    // Test merging duplicate profile
    const mergeRes = await request(app)
      .post('/api/v1/guests/merge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        primaryId: createdGuestId,
        duplicateId: duplicateId,
      });

    expect(mergeRes.status).toBe(200);
  });

  test('7. Backward compatibility: /api/v1/tenants routes return guest profiles', async () => {
    const res = await request(app)
      .get('/api/v1/tenants')
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
