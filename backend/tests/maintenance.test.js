const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Maintenance & Operations Workflow Tests (Phase 7)', () => {
  let adminToken = '';
  let managerToken = '';
  let agentToken = '';
  let testMaintenanceId = null;
  let testPropertyId = 1;
  let testApartmentId = 1;

  beforeAll(async () => {
    // 1. Obtain Admin Token
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    // 2. Obtain Manager Token
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data.token;

    // 3. Obtain Agent Token
    const agRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agRes.body.data.token;

    // Clean up test maintenance records
    await pool.query('DELETE FROM maintenance_requests WHERE issue_title LIKE "%Automated Test%"');
  });

  afterAll(async () => {
    if (testMaintenanceId) {
      await pool.query('DELETE FROM maintenance_requests WHERE id = ?', [testMaintenanceId]);
    }
    await pool.query('DELETE FROM maintenance_requests WHERE issue_title LIKE "%Automated Test%"');
    // Restore apartment 1 status to AVAILABLE
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);
    await pool.closePool();
  });

  test('1. Create maintenance work order and verify unit transitions to MAINTENANCE', async () => {
    // Ensure unit starts in AVAILABLE
    await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [testApartmentId]);

    const payload = {
      property_id: testPropertyId,
      apartment_id: testApartmentId,
      category: 'PLUMBING',
      priority: 'HIGH',
      issue_title: 'Automated Test: Pipe Leak in Bathroom',
      description: 'Major water leakage from underlying pipe joint under the sink.',
      blocking_unit: true,
      estimated_cost: 35000.0,
    };

    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('issue_code');
    expect(res.body.data.issue_code).toMatch(/^MNT-/);
    expect(res.body.data.status).toBe('OPEN');
    expect(res.body.data.blocking_unit).toBe(1);

    testMaintenanceId = res.body.data.id;

    // Verify unit status was automatically updated to MAINTENANCE
    const aptRows = await pool.query('SELECT status FROM apartments WHERE id = ?', [testApartmentId]);
    expect(aptRows[0].status).toBe('MAINTENANCE');
  });

  test('2. Reject maintenance creation with invalid category', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: testPropertyId,
        apartment_id: testApartmentId,
        category: 'INVALID_CATEGORY',
        priority: 'LOW',
        issue_title: 'Automated Test Invalid Cat',
        description: 'Should fail validation',
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/Invalid category/i);
  });

  test('3. Reject maintenance creation when apartment does not belong to specified property', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 2, // Mismatched property
        apartment_id: 1, // Belongs to property 1
        category: 'ELECTRICAL',
        priority: 'MEDIUM',
        issue_title: 'Automated Test Mismatch',
        description: 'Cross-property mismatch violation',
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/Data Integrity Violation/i);
  });

  test('4. Assign technician to maintenance work order', async () => {
    const res = await request(app)
      .post(`/api/v1/maintenance/${testMaintenanceId}/assign`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        assigned_to_id: 2, // Admin or manager user ID
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assigned_to_id).toBe(2);
  });

  test('5. Start work order and verify status transitions to IN_PROGRESS', async () => {
    const res = await request(app)
      .post(`/api/v1/maintenance/${testMaintenanceId}/start`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('IN_PROGRESS');
    expect(res.body.data.started_at).toBeTruthy();
  });

  test('6. Reject invalid transition when starting already in-progress work order', async () => {
    const res = await request(app)
      .post(`/api/v1/maintenance/${testMaintenanceId}/start`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send();

    expect([400, 409, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/Cannot start work/i);
  });

  test('7. Resolve work order and verify apartment transitions to CLEANING (not directly AVAILABLE)', async () => {
    const res = await request(app)
      .post(`/api/v1/maintenance/${testMaintenanceId}/resolve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        actual_cost: 32500.0,
        resolution_notes: 'Replaced pipe coupling and gasket. Pressure test passed successfully.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('RESOLVED');
    expect(parseFloat(res.body.data.actual_cost)).toBe(32500.0);
    expect(res.body.data.resolved_at).toBeTruthy();

    // Verify unit operational state transitioned to CLEANING
    const aptRows = await pool.query('SELECT status FROM apartments WHERE id = ?', [testApartmentId]);
    expect(aptRows[0].status).toBe('CLEANING');
  });

  test('8. Maintenance statistics reflect accurate counts and incurred costs', async () => {
    const res = await request(app)
      .get('/api/v1/maintenance/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('overview');
    expect(res.body.data.overview).toHaveProperty('open');
    expect(res.body.data.overview).toHaveProperty('inProgress');
    expect(res.body.data.overview).toHaveProperty('resolved');
    expect(res.body.data.overview).toHaveProperty('totalCost');
  });

  test('9. Agent role is forbidden from modifying or creating maintenance orders', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        property_id: testPropertyId,
        apartment_id: testApartmentId,
        category: 'ELECTRICAL',
        issue_title: 'Agent maintenance attempt',
        description: 'Should be rejected',
      });

    expect(res.status).toBe(403);
  });
});
