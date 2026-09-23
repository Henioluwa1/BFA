const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Property & Unit Inspection Workflow Tests (Phase 6 - Section 29-36)', () => {
  let adminToken = '';
  let receptionistToken = '';
  let agentToken = '';
  let testReservationId = 1;
  let createdInspectionId = null;

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

    // Clean up test inspections
    await pool.query('DELETE FROM inspections WHERE inspection_code LIKE "%TEST%"');
  });

  afterAll(async () => {
    if (createdInspectionId) {
      await pool.query('DELETE FROM inspections WHERE id = ?', [createdInspectionId]);
    }
    await pool.query('DELETE FROM inspections WHERE inspection_code LIKE "%TEST%"');
    await pool.closePool();
  });

  test('1. Create new inspection linked to a reservation', async () => {
    const payload = {
      reservation_id: testReservationId,
      inspection_type: 'CHECKOUT',
      condition_rating: 'GOOD',
      notes: 'Initial checkout walkthrough inspection',
      scheduled_date: '2026-09-23',
    };

    const res = await request(app)
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('inspection_code');
    expect(res.body.data.inspection_code).toMatch(/^INSP-/);
    expect(res.body.data.reservation_id).toBe(testReservationId);
    expect(res.body.data.status).toBe('DRAFT');

    createdInspectionId = res.body.data.id;
  });

  test('2. Reject inspection creation if property/unit does not match reservation', async () => {
    const res = await request(app)
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservation_id: testReservationId, // Belongs to Property 1, Unit 2
        property_id: 2, // Mismatched property
        apartment_id: 4, // Mismatched unit
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/Data Integrity Violation/i);
  });

  test('3. Update inspection with structured damage items and evidence references', async () => {
    const damagePayload = {
      condition_rating: 'DAMAGED',
      status: 'IN_PROGRESS',
      damage_items: [
        {
          item: 'Master Bedroom Nightstand Glass',
          description: 'Deep crack across surface requiring replacement',
          severity: 'MODERATE',
          location: 'Master Bedroom',
          estimated_cost: 25000.00,
        },
      ],
      missing_items: ['Remote control for Master TV'],
      notes: 'Damage documented during guest departure inspection.',
    };

    const res = await request(app)
      .put(`/api/v1/inspections/${createdInspectionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(damagePayload);

    expect(res.status).toBe(200);
    expect(res.body.data.condition_rating).toBe('DAMAGED');
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  test('4. Complete inspection transitions status to FOLLOW_UP when damaged', async () => {
    const res = await request(app)
      .post(`/api/v1/inspections/${createdInspectionId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        condition_rating: 'DAMAGED',
        notes: 'Inspection finalized with recorded damage. Flagged for follow-up.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FOLLOW_UP');
    expect(res.body.data.completed_at).toBeTruthy();
  });

  test('5. Agent role is rejected from creating or managing inspections with 403', async () => {
    const res = await request(app)
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        property_id: 1,
        apartment_id: 1,
      });

    expect(res.status).toBe(403);
  });
});
