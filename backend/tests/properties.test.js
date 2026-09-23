const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Properties Management & Scoping Tests (Section 5, 6, 7, 8, 13)', () => {
  let superAdminToken = '';
  let adminToken = '';
  let receptionistToken = '';
  let createdPropertyId = null;

  beforeAll(async () => {
    // 1. Authenticate Super Admin
    const saRes = await request(app).post('/api/v1/auth/login').send({
      email: 'superadmin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    superAdminToken = saRes.body.data.token;

    // 2. Authenticate Admin
    const aRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = aRes.body.data.token;

    // 3. Authenticate Receptionist
    const rRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = rRes.body.data.token;
  });

  afterAll(async () => {
    if (createdPropertyId) {
      await pool.query('DELETE FROM apartments WHERE property_id = ?', [createdPropertyId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [createdPropertyId]);
    }
    await pool.closePool();
  });

  test('1. List all properties returns real calculated statistics (total_units, available, occupied)', async () => {
    const res = await request(app)
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const prop = res.body.data[0];
    expect(prop).toHaveProperty('id');
    expect(prop).toHaveProperty('name');
    expect(prop).toHaveProperty('code');
    expect(prop).toHaveProperty('total_units');
    expect(prop).toHaveProperty('available_units');
    expect(prop).toHaveProperty('occupied_units');
    expect(typeof prop.total_units).toBe('number');
  });

  test('2. Get property by ID returns full relational details and address', async () => {
    const res = await request(app)
      .get('/api/v1/properties/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data.name).toBeDefined();
    expect(res.body.data.code).toBeDefined();
  });

  test('3. Admin creates new property with comprehensive metadata', async () => {
    const uniqueCode = `TST${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: uniqueCode,
        name: 'Victoria Island Executive Suites',
        description: 'Luxury high-rise serviced apartment building',
        address: '14 Bishop Oluwole Street',
        city: 'Lagos',
        state: 'Lagos State',
        country: 'Nigeria',
        contact_phone: '+234 802 333 4444',
        contact_email: 'vi.suites@bfa.ng',
        amenities: ['Fiber Internet', 'Swimming Pool', '24/7 Power', 'Valet Parking'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.code).toBe(uniqueCode);
    expect(res.body.data.name).toBe('Victoria Island Executive Suites');

    createdPropertyId = res.body.data.id;
  });

  test('4. Duplicate property code is rejected with 409 Conflict', async () => {
    const existing = await pool.query('SELECT code FROM properties LIMIT 1');
    const existingCode = existing[0].code;

    const res = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: existingCode,
        name: 'Duplicate Test Property',
        address: 'Test Address',
        city: 'Abuja',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  test('5. Admin updates property details and notes', async () => {
    const res = await request(app)
      .put(`/api/v1/properties/${createdPropertyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Victoria Island Executive Suites (Renovated)',
        description: 'Updated premium description',
        notes: 'VIP guest floor added',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Victoria Island Executive Suites (Renovated)');
  });

  test('6. Update property status (e.g. MAINTENANCE)', async () => {
    const res = await request(app)
      .patch(`/api/v1/properties/${createdPropertyId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'MAINTENANCE',
        reason: 'Scheduled building HVAC upgrade',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('MAINTENANCE');
  });

  test('7. Receptionist is rejected from creating property with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        code: 'UNAUTH',
        name: 'Unauthorized Property',
        address: 'Secret',
        city: 'Lagos',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('8. Retrieve units for specific property', async () => {
    const res = await request(app)
      .get('/api/v1/properties/1/apartments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].property_id).toBe(1);
  });

  test('9. Audit log entry is created for property operations', async () => {
    const res = await request(app)
      .get('/api/v1/audit?action=PROPERTY_CREATED')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((a) => a.entity_id === String(createdPropertyId))).toBe(true);
  });
});
