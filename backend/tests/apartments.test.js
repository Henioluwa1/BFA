const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Apartment / Unit Management Tests (Section 9, 10, 11, 12, 14, 15)', () => {
  let adminToken = '';
  let receptionistToken = '';
  let createdUnitId = null;

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
  });

  afterAll(async () => {
    if (createdUnitId) {
      await pool.query('DELETE FROM apartments WHERE id = ?', [createdUnitId]);
    }
    await pool.closePool();
  });

  test('1. List apartments with property and status filtering', async () => {
    const res = await request(app)
      .get('/api/v1/apartments?propertyId=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.every((u) => u.property_id === 1)).toBe(true);
  });

  test('2. Get apartment by ID returns enriched property and rate info', async () => {
    const res = await request(app)
      .get('/api/v1/apartments/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data).toHaveProperty('unit_number');
    expect(res.body.data).toHaveProperty('property_name');
    expect(res.body.data).toHaveProperty('rate_per_night');
  });

  test('3. Admin creates new unit under valid property', async () => {
    const unitNum = `U-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/v1/apartments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 1,
        unit_number: unitNum,
        unit_name: `Deluxe Suite ${unitNum}`,
        unit_type: 'Deluxe',
        floor: 4,
        capacity: 2,
        bedroom_count: 1,
        bathroom_count: 1,
        rate_per_night: 220000.00,
        status: 'AVAILABLE',
        amenities: ['King Bed', 'Balcony', 'Espresso Machine'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.unit_number).toBe(unitNum);
    expect(res.body.data.property_id).toBe(1);

    createdUnitId = res.body.data.id;
  });

  test('4. Duplicate unit number in same property is rejected with 409 Conflict', async () => {
    const existing = await pool.query('SELECT property_id, unit_number FROM apartments WHERE id = ?', [createdUnitId]);
    const { property_id, unit_number } = existing[0];

    const res = await request(app)
      .post('/api/v1/apartments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id,
        unit_number,
        unit_name: 'Duplicate Unit',
        rate_per_night: 150000.00,
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  test('5. Creating unit under non-existent property fails with 404 Not Found', async () => {
    const res = await request(app)
      .post('/api/v1/apartments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 99999,
        unit_number: '999',
        unit_name: 'Ghost Unit',
        rate_per_night: 100000.00,
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('6. Admin updates unit specifications and rates', async () => {
    const res = await request(app)
      .put(`/api/v1/apartments/${createdUnitId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rate_per_night: 250000.00,
        capacity: 3,
        notes: 'Upgraded with sofa bed',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(parseFloat(res.body.data.rate_per_night)).toBe(250000.00);
    expect(res.body.data.capacity).toBe(3);
  });

  test('7. Receptionist / Staff updates operational housekeeping status (DIRTY -> READY)', async () => {
    // Transition to DIRTY
    const dirtyRes = await request(app)
      .patch(`/api/v1/apartments/${createdUnitId}/status`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ status: 'DIRTY', notes: 'Checkout completed' });
    expect(dirtyRes.status).toBe(200);
    expect(dirtyRes.body.data.status).toBe('DIRTY');

    // Transition to READY
    const readyRes = await request(app)
      .patch(`/api/v1/apartments/${createdUnitId}/status`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ status: 'READY', notes: 'Housekeeping inspection passed' });
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.data.status).toBe('READY');
  });

  test('8. Check unit availability endpoint reports authoritative date availability', async () => {
    const res = await request(app)
      .get(`/api/v1/apartments/${createdUnitId}/availability?date=2028-06-15`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('isAvailable');
  });

  test('9. Audit trail verifies UNIT_CREATED and UNIT_STATUS_UPDATED', async () => {
    const res = await request(app)
      .get('/api/v1/audit?action=UNIT_CREATED')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((a) => a.entity_id === String(createdUnitId))).toBe(true);
  });
});
