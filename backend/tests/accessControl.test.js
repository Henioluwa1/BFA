const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Authoritative Access Control & Capability Hierarchy Tests', () => {
  let superAdminToken = '';
  let ownerToken = '';
  let managerToken = '';
  let receptionistToken = '';

  beforeAll(async () => {
    // 1. Authenticate Super Admin (superadmin@bfa.com)
    const saRes = await request(app).post('/api/v1/auth/login').send({
      email: 'superadmin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    superAdminToken = saRes.body.data.token;

    // 2. Owner user (owner@bfa.com)
    const oRes = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@bfa.com',
      password: 'Bfa2026!Secure',
    });
    ownerToken = oRes.body.data.token;

    // 3. Manager user (manager@bfa.com)
    const mRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mRes.body.data.token;

    // 4. Receptionist user (receptionist@bfa.com)
    const rRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = rRes.body.data.token;
  });

  afterAll(async () => {
    // Reset PAY_AT_PROPERTY capability to clean enabled state
    await pool.query(
      "UPDATE capabilities SET is_enabled = 1, restriction_level = 'NONE', restricted_by_id = NULL, restricted_by_role = NULL, restriction_reason = NULL WHERE name = 'PAY_AT_PROPERTY'"
    );
    await pool.query('UPDATE access_overrides SET is_active = 0');
    await pool.closePool();
  });

  test('1. Get all capabilities returns list of registered capabilities', async () => {
    const res = await request(app)
      .get('/api/v1/access/capabilities')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((c) => c.name === 'PAY_AT_PROPERTY')).toBe(true);
  });

  test('2. Receptionist is rejected from updating capabilities with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/access/capabilities/update')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ capabilityName: 'PAY_AT_PROPERTY', isEnabled: false });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('3. Owner can disable PAY_AT_PROPERTY, marking it OWNER_RESTRICTED', async () => {
    const res = await request(app)
      .post('/api/v1/access/capabilities/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        capabilityName: 'PAY_AT_PROPERTY',
        isEnabled: false,
        reason: 'Restricted for audit policy review',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.capability.is_enabled).toBeFalsy();
    expect(res.body.data.capability.restriction_level).toBe('OWNER_RESTRICTED');
  });

  test('4. Manager cannot re-enable OWNER_RESTRICTED capability (hierarchy enforcement)', async () => {
    const res = await request(app)
      .post('/api/v1/access/capabilities/update')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ capabilityName: 'PAY_AT_PROPERTY', isEnabled: true });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('OWNER_RESTRICTED');
  });

  test('5. Super Admin enabling OWNER_RESTRICTED directly creates an Approval Request', async () => {
    const res = await request(app)
      .post('/api/v1/access/capabilities/update')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        capabilityName: 'PAY_AT_PROPERTY',
        isEnabled: true,
        reason: 'Need pay at property enabled for weekend VIP guests',
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.actionRequired).toBe('APPROVAL_REQUEST_SUBMITTED');
    expect(res.body.data.approvalRequest.status).toBe('PENDING');
  });

  test('6. Owner can respond and approve the Access Approval Request', async () => {
    // Get pending requests
    const listRes = await request(app)
      .get('/api/v1/access/approvals?status=PENDING')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(listRes.status).toBe(200);
    const requests = listRes.body.data;
    expect(requests.length).toBeGreaterThan(0);
    const target = requests[0];

    // Respond approve
    const respondRes = await request(app)
      .post(`/api/v1/access/approvals/${target.id}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        action: 'APPROVE',
        reviewNotes: 'Approved for weekend VIP guests.',
      });

    expect(respondRes.status).toBe(200);
    expect(respondRes.body.success).toBe(true);
    expect(respondRes.body.data.status).toBe('APPROVED');

    // Verify capability is now enabled
    const capRes = await pool.query("SELECT * FROM capabilities WHERE name = 'PAY_AT_PROPERTY'");
    expect(capRes[0].is_enabled).toBeTruthy();
  });

  test('7. Super Admin Forced Emergency Override with confirmation phrase', async () => {
    // First, Owner restricts capability again
    await request(app)
      .post('/api/v1/access/capabilities/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ capabilityName: 'PAY_AT_PROPERTY', isEnabled: false, reason: 'Owner maintenance lock' });

    // Reject forced override if confirmation phrase is missing
    const failRes = await request(app)
      .post('/api/v1/access/overrides/force')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        capabilityName: 'PAY_AT_PROPERTY',
        isEnabled: true,
        justification: 'Emergency counter booking requirement',
        confirmation: 'INCORRECT_STRING',
      });

    expect(failRes.status).toBe(422);

    // Execute with exact CONFIRM_FORCE_OVERRIDE
    const successRes = await request(app)
      .post('/api/v1/access/overrides/force')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        capabilityName: 'PAY_AT_PROPERTY',
        isEnabled: true,
        justification: 'Emergency counter booking requirement confirmed by Board',
        confirmation: 'CONFIRM_FORCE_OVERRIDE',
      });

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(successRes.body.data.override.justification).toContain('Emergency counter booking');
  });
});
