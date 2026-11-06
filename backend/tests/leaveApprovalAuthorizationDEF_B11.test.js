const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const jwt = require('jsonwebtoken');
const config = require('../src/config');

describe('Workspace C: DEF-B11 Leave Approval Authorization & 5-Day Ceiling Remediation', () => {
  let adminToken;
  let managerProp1Token;
  let managerProp2Token;
  let staffProp1Token;
  let staffProp1Id;
  let managerUserId = 3;
  let annualCategoryId;
  let unpaidCategoryId;

  beforeAll(async () => {
    // Generate auth tokens matching standard system roles
    adminToken = jwt.sign(
      { id: 2, name: 'Operations Admin', email: 'admin@bfa.com', role: 'ADMIN', propertyId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    managerProp1Token = jwt.sign(
      { id: 3, name: 'Marcus Vance', email: 'manager@bfa.com', role: 'OPERATIONS_MANAGER', propertyId: 1 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    managerProp2Token = jwt.sign(
      { id: 99, name: 'Other Manager', email: 'othermanager@bfa.com', role: 'OPERATIONS_MANAGER', propertyId: 2 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    staffProp1Token = jwt.sign(
      { id: 5, name: 'David Kalu', email: 'staff@bfa.com', role: 'STAFF', propertyId: 1 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    // Resolve employee IDs
    const staffRows = await pool.query('SELECT id, property_id FROM employees WHERE user_id = 5');
    staffProp1Id = staffRows[0].id;

    // Ensure staff employee property is 1
    await pool.query('UPDATE employees SET property_id = 1 WHERE user_id IN (3, 5)');

    // Ensure categories exist
    const catRows = await pool.query("SELECT id, code FROM leave_categories WHERE code = 'ANNUAL' OR code = 'UNPAID'");
    annualCategoryId = catRows.find((c) => c.code === 'ANNUAL')?.id;
    unpaidCategoryId = catRows.find((c) => c.code === 'UNPAID')?.id;
  });

  beforeEach(async () => {
    // Clean up test leave requests and balances for clean runs
    await pool.query('DELETE FROM leave_requests WHERE employee_id = ?', [staffProp1Id]);
    await pool.query('DELETE FROM leave_balances WHERE employee_id = ?', [staffProp1Id]);
  });

  afterAll(async () => {
    // Teardown test artifacts
    await pool.query('DELETE FROM leave_requests WHERE employee_id = ?', [staffProp1Id]);
    await pool.query('DELETE FROM leave_balances WHERE employee_id = ?', [staffProp1Id]);
  });

  // ─── 1. INITIAL ROUTING & INCLUSIVE DURATION CALCULATION ───────────
  describe('1. Initial Status Routing & Inclusive Date Calculations', () => {
    test('1.1. Single-day request (1 day) is PENDING_MANAGER', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-10',
          reason: 'Single day personal business',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.total_days).toBe(1);
      expect(res.body.data.status).toBe('PENDING_MANAGER');
    });

    test('1.2. Five-day request (1-5 days inclusive) is PENDING_MANAGER', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-14',
          reason: 'Five day personal time-off',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.total_days).toBe(5);
      expect(res.body.data.status).toBe('PENDING_MANAGER');
    });

    test('1.3. Six-day request (> 5 days) is auto-routed to PENDING_ADMIN', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-15',
          reason: 'Six day extended leave',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.total_days).toBe(6);
      expect(res.body.data.status).toBe('PENDING_ADMIN');
    });

    test('1.4. Fourteen-day request (> 5 days) is auto-routed to PENDING_ADMIN', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-23',
          reason: 'Fourteen day annual vacation',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.total_days).toBe(14);
      expect(res.body.data.status).toBe('PENDING_ADMIN');
    });

    test('1.5. Fifteen-day request (> 14 days) is auto-routed to PENDING_ADMIN', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-24',
          reason: 'Fifteen day extended leave',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.total_days).toBe(15);
      expect(res.body.data.status).toBe('PENDING_ADMIN');
    });
  });

  // ─── 2. FIVE-DAY CEILING & DEF-B11 ENFORCEMENT ──────────────────────
  describe('2. DEF-B11: Strict 5-Day Operations Manager Ceiling Enforcement', () => {
    test('2.1. Operations Manager approves 5-day request -> ALLOWED (HTTP 200)', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-14',
          reason: '5 days off within manager authority',
        });
      const leaveId = createRes.body.data.id;
      expect(createRes.body.data.total_days).toBe(5);

      const reviewRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({ action: 'APPROVED', notes: 'Approved within 5-day limit' });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('APPROVED');
    });

    test('2.2. Operations Manager approves 6-day request -> HTTP 403 Forbidden', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-15',
          reason: '6-day leave exceeding 5-day threshold',
        });
      const leaveId = createRes.body.data.id;
      expect(createRes.body.data.total_days).toBe(6);

      const reviewRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({ action: 'APPROVED', notes: 'Manager attempts to sign off on 6 days' });

      expect(reviewRes.status).toBe(403);
      expect(reviewRes.body.error.message).toMatch(/exceeds Operations Manager delegated authority limit of 5 days/i);
    });

    test('2.3. Operations Manager approves 14-day request -> HTTP 403 Forbidden', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-23',
          reason: '14-day leave (previously allowed under obsolete delegation rule)',
        });
      const leaveId = createRes.body.data.id;
      expect(createRes.body.data.total_days).toBe(14);

      const reviewRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({ action: 'APPROVED', notes: 'Manager attempts to sign off on 14 days' });

      expect(reviewRes.status).toBe(403);
      expect(reviewRes.body.error.message).toMatch(/exceeds Operations Manager delegated authority limit of 5 days/i);
    });

    test('2.4. Operations Manager approves 15-day request -> HTTP 403 Forbidden', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-24',
          reason: '15-day extended leave',
        });
      const leaveId = createRes.body.data.id;
      expect(createRes.body.data.total_days).toBe(15);

      const reviewRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({ action: 'APPROVED', notes: 'Manager attempts to sign off on 15 days' });

      expect(reviewRes.status).toBe(403);
      expect(reviewRes.body.error.message).toMatch(/exceeds Operations Manager delegated authority limit of 5 days/i);
    });
  });

  // ─── 3. ADMINISTRATOR AUTHORIZATION FOR > 5 DAYS ────────────────────
  describe('3. Administrator Authority for Requests Exceeding 5 Days', () => {
    test('3.1. Administrator approves 6-day request -> ALLOWED (HTTP 200)', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-15',
          reason: '6-day leave for Admin review',
        });
      const leaveId = createRes.body.data.id;

      const reviewRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'APPROVED', notes: 'Administrator executive approval for 6 days' });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('APPROVED');
    });

    test('3.2. Administrator approves 14-day request -> ALLOWED (HTTP 200)', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-23',
          reason: '14-day vacation for Admin review',
        });
      const leaveId = createRes.body.data.id;

      const reviewRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'APPROVED', notes: 'Administrator executive approval for 14 days' });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('APPROVED');
    });

    test('3.3. Administrator approves 15-day request -> ALLOWED (HTTP 200)', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-24',
          reason: '15-day leave for Admin review',
        });
      const leaveId = createRes.body.data.id;

      const reviewRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'APPROVED', notes: 'Administrator executive approval for 15 days' });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('APPROVED');
    });
  });

  // ─── 4. SECURITY & AUTHORIZATION BOUNDARIES ────────────────────────
  describe('4. Maker-Checker, Property Isolation & Role Boundaries', () => {
    test('4.1. Employee cannot approve their own leave request (Maker-Checker violation)', async () => {
      // Create request by manager
      const mgrEmpRows = await pool.query('SELECT id FROM employees WHERE user_id = ?', [managerUserId]);
      const mgrEmpId = mgrEmpRows[0]?.id;

      if (mgrEmpId) {
        const createRes = await request(app)
          .post('/api/v1/workforce/leave/requests')
          .set('Authorization', `Bearer ${managerProp1Token}`)
          .send({
            leave_category_id: unpaidCategoryId,
            start_date: '2026-11-10',
            end_date: '2026-11-12',
            reason: 'Manager personal leave',
          });

        const leaveId = createRes.body.data.id;

        // Manager attempts self-approval
        const reviewRes = await request(app)
          .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
          .set('Authorization', `Bearer ${managerProp1Token}`)
          .send({ action: 'APPROVED', notes: 'Self-approval attempt' });

        expect(reviewRes.status).toBe(403);
        expect(reviewRes.body.error.message).toMatch(/Maker-checker violation: You cannot approve your own leave/i);

        // Clean up manager request
        await pool.query('DELETE FROM leave_requests WHERE id = ?', [leaveId]);
      }
    });

    test('4.2. Operations Manager cannot review leave for another property', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-12',
          reason: 'Property 1 leave',
        });
      const leaveId = createRes.body.data.id;

      // Manager of Property 2 attempts to approve Property 1 leave
      const reviewRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${managerProp2Token}`)
        .send({ action: 'APPROVED', notes: 'Cross-property approval attempt' });

      expect(reviewRes.status).toBe(403);
      expect(reviewRes.body.error.message).toMatch(/only review leave requests for your assigned Property #2/i);
    });

    test('4.3. Non-management role (STAFF) cannot review leave requests', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-12',
          reason: 'Staff leave review test',
        });
      const leaveId = createRes.body.data.id;

      const reviewRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({ action: 'APPROVED', notes: 'Staff unauthorized review' });

      expect(reviewRes.status).toBe(403);
    });
  });

  // ─── 5. INPUT VALIDATION, REJECTION & ESCALATION ───────────────────
  describe('5. Input Validation, Rejection and Escalation Workflow', () => {
    test('5.1. Rejects inverted date range (start_date > end_date)', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-20',
          end_date: '2026-11-10',
          reason: 'Inverted date test',
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/start_date cannot be later than end_date/i);
    });

    test('5.2. Rejects missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          start_date: '2026-11-10',
          end_date: '2026-11-12',
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.error.message).toMatch(/leave_category_id, start_date, end_date, and reason are required/i);
    });

    test('5.3. Operations Manager can reject a leave request', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-12',
          reason: 'Leave to be rejected',
        });
      const leaveId = createRes.body.data.id;

      const rejectRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({ action: 'REJECTED', notes: 'Denied due to peak shift occupancy' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('REJECTED');
    });

    test('5.4. Operations Manager can escalate leave request to Administrator', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-12',
          reason: 'Short leave escalated for executive review',
        });
      const leaveId = createRes.body.data.id;

      const escalateRes = await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/escalate`)
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({ reason: 'Escalated to Executive Administrator per policy' });

      expect(escalateRes.status).toBe(200);
      expect(escalateRes.body.data.status).toBe('PENDING_ADMIN');
    });

    test('5.5. Audit log records leave lifecycle actions', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/leave/requests')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          leave_category_id: unpaidCategoryId,
          start_date: '2026-11-10',
          end_date: '2026-11-12',
          reason: 'Audit trail verification',
        });
      const leaveId = createRes.body.data.id;

      await request(app)
        .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({ action: 'APPROVED', notes: 'Audit trail approval' });

      const auditRows = await pool.query(
        "SELECT action, entity_type, entity_id FROM audit_logs WHERE entity_type = 'leave_request' AND entity_id = ? ORDER BY id DESC",
        [String(leaveId)]
      );

      expect(auditRows.length).toBeGreaterThanOrEqual(1);
      const actions = auditRows.map((r) => r.action);
      expect(actions).toContain('LEAVE_APPROVED');
    });
  });
});
