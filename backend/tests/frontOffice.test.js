const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Front Office Operations & In-House Stays Tests (Phase 5 - Section 18-22)', () => {
  let adminToken = '';
  let receptionistToken = '';
  let createdResId = null;

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

    // Create a dedicated reservation scheduled for today
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Clean up any conflicting reservation for today
    await pool.query('DELETE FROM booking_authentications WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id = 3 AND check_in_date = ?)', [today]);
    await pool.query('DELETE FROM reservation_status_history WHERE reservation_id IN (SELECT id FROM reservations WHERE apartment_id = 3 AND check_in_date = ?)', [today]);
    await pool.query('DELETE FROM reservations WHERE apartment_id = 3 AND check_in_date = ?', [today]);
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = 3');

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 1,
        apartment_id: 3,
        tenant_name: 'Front Office Test Guest',
        tenant_email: 'fo.guest@bfa.ng',
        tenant_phone: '+234 809 999 8888',
        check_in_date: today,
        check_out_date: tomorrow,
        source: 'WALK_IN',
        total_amount: 160.00,
        paid_amount: 160.00,
      });

    createdResId = res.body.data?.id;
  });

  afterAll(async () => {
    if (createdResId) {
      await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [createdResId]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [createdResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [createdResId]);
    }
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = 3');
    await pool.closePool();
  });

  test('1. Front office stats endpoint returns real-time metrics', async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await request(app)
      .get(`/api/v1/front-office/stats?date=${today}`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('todaysArrivals');
    expect(res.body.data).toHaveProperty('todaysDepartures');
    expect(res.body.data).toHaveProperty('inHouseGuests');
    expect(res.body.data).toHaveProperty('dirtyUnits');
  });

  test('2. Arrivals view returns today scheduled reservations', async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await request(app)
      .get(`/api/v1/front-office/arrivals?date=${today}`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const target = res.body.data.find((r) => r.id === createdResId);
    expect(target).toBeTruthy();
    expect(target.tenant_name).toBe('Front Office Test Guest');
    expect(target.status).toBe('CONFIRMED');
  });

  test('3. Quick check-in from front office transitions reservation to CHECKED_IN and unit to OCCUPIED', async () => {
    const res = await request(app)
      .post(`/api/v1/front-office/reservations/${createdResId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CHECKED_IN');

    // Verify apartment became OCCUPIED
    const [apt] = await pool.query('SELECT status FROM apartments WHERE id = 3');
    expect(apt.status).toBe('OCCUPIED');
  });

  test('4. Current guests view shows guest after check-in', async () => {
    const res = await request(app)
      .get('/api/v1/front-office/current-guests')
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    const guest = res.body.data.find((g) => g.id === createdResId);
    expect(guest).toBeTruthy();
    expect(guest.status).toBe('CHECKED_IN');
  });

  test('5. Quick check-out transitions reservation to COMPLETED and unit to DIRTY for housekeeping', async () => {
    const res = await request(app)
      .post(`/api/v1/front-office/reservations/${createdResId}/check-out`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');

    // Verify apartment became DIRTY
    const [apt] = await pool.query('SELECT status FROM apartments WHERE id = 3');
    expect(apt.status).toBe('DIRTY');
  });
});
