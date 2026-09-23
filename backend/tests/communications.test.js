const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

jest.setTimeout(30000);

describe('Internal Communications & Approval Workflow Tests', () => {
  let adminToken = '';
  let ownerToken = '';
  let createdCommId = null;

  beforeAll(async () => {
    // Admin login
    const aRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = aRes.body.data.token;

    // Owner login
    const oRes = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@bfa.com',
      password: 'Bfa2026!Secure',
    });
    ownerToken = oRes.body.data.token;
  });

  afterAll(async () => {
    if (createdCommId) {
      await pool.query('DELETE FROM communication_recipients WHERE communication_id = ?', [createdCommId]);
      await pool.query('DELETE FROM communication_approvals WHERE communication_id = ?', [createdCommId]);
      await pool.query('DELETE FROM communications WHERE id = ?', [createdCommId]);
    }
    await pool.closePool();
  });

  test('1. Get communication templates returns pre-configured templates', async () => {
    const res = await request(app)
      .get('/api/v1/communications/templates')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('2. Create communication draft supports types and saves in DRAFT status', async () => {
    const res = await request(app)
      .post('/api/v1/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'POLICY_UPDATE',
        channel: 'EMAIL',
        subject: 'Updated Check-In Procedures for 2026',
        body: 'Please be advised that all check-in inspections will now include smart card verification.',
        recipientType: 'ALL_STAFF',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.subject).toContain('Updated Check-In Procedures');
    createdCommId = res.body.data.id;
  });

  test('3. Submit draft transitions to PENDING_APPROVAL', async () => {
    const res = await request(app)
      .post(`/api/v1/communications/${createdCommId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING_APPROVAL');
  });

  test('4. Owner approves communication in approval queue', async () => {
    const res = await request(app)
      .post(`/api/v1/communications/${createdCommId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reviewNotes: 'Approved for immediate dispatch to staff.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');
  });

  test('5. Send approved communication transitions to SENT and registers recipients', async () => {
    const res = await request(app)
      .post(`/api/v1/communications/${createdCommId}/send`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('SENT');
  });
});
