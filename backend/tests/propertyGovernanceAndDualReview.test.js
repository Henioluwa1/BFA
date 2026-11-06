const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Property Governance, Dual-Review Workflow & Role Boundaries', () => {
  let superAdminToken = '';
  let adminToken = '';
  let managerToken = '';
  let ownerToken = '';
  let receptionistToken = '';
  let testSubmissionId = null;

  beforeAll(async () => {
    // 1. Super Admin login
    const saRes = await request(app).post('/api/v1/auth/login').send({
      email: 'superadmin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    superAdminToken = saRes.body.data.token;

    // 2. Admin login
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    // 3. Manager login
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data.token;

    // 4. Owner login
    const ownerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@bfa.com',
      password: 'Bfa2026!Secure',
    });
    ownerToken = ownerRes.body.data.token;

    // 5. Receptionist login
    const recRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = recRes.body.data.token;
  });

  afterAll(async () => {
    if (testSubmissionId) {
      await pool.query('DELETE FROM property_review_comments WHERE submission_id = ?', [testSubmissionId]);
      await pool.query('DELETE FROM property_submissions WHERE id = ?', [testSubmissionId]);
    }
  });

  test('1. Manager submits property update: Created with SUBMITTED status and PENDING reviews', async () => {
    const res = await request(app)
      .post('/api/v1/properties/submissions')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        propertyId: 1,
        submissionType: 'CONTENT_UPDATE',
        contentSnapshot: {
          description: 'Grand Horizon Tower updated with enhanced executive lounges and high-speed Wi-Fi 6 in Akure, Ondo State.',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('SUBMITTED');
    expect(res.body.data.admin_review_status).toBe('PENDING');
    expect(res.body.data.owner_review_status).toBe('PENDING');
    testSubmissionId = res.body.data.id;
  });

  test('2. Self-Approval Guard: Submitter attempting to approve own submission is rejected with 403', async () => {
    const res = await request(app)
      .post(`/api/v1/properties/submissions/${testSubmissionId}/review`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        action: 'APPROVED',
        decisionNotes: 'Self approving my own submission',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('3. Premature Publication Guard: Cannot publish while pending dual approval (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/v1/properties/submissions/${testSubmissionId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Dual-Approval Gate Violation/i);
  });

  test('4. First Independent Review: Admin approves submission, but status remains APPROVED_BY_ADMIN (not published)', async () => {
    const res = await request(app)
      .post(`/api/v1/properties/submissions/${testSubmissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'APPROVED',
        decisionNotes: 'Admin review completed: content complies with portfolio standards.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.admin_review_status).toBe('APPROVED');
    expect(res.body.data.owner_review_status).toBe('PENDING');
    expect(res.body.data.status).toBe('APPROVED_BY_ADMIN');
  });

  test('5. Single-Approval Publication Rejection: Attempting to publish with only Admin approval is blocked (403)', async () => {
    const res = await request(app)
      .post(`/api/v1/properties/submissions/${testSubmissionId}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/strictly require independent approval from BOTH the Admin and the Owner/i);
  });

  test('6. Second Independent Review: Owner approves submission, status advances to FULLY_APPROVED', async () => {
    const res = await request(app)
      .post(`/api/v1/properties/submissions/${testSubmissionId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        action: 'APPROVED',
        decisionNotes: 'Owner sovereign review: description and presentation approved for publication.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.owner_review_status).toBe('APPROVED');
    expect(res.body.data.admin_review_status).toBe('APPROVED');
    expect(res.body.data.status).toBe('FULLY_APPROVED');
  });

  test('7. Publication Execution: Once FULLY_APPROVED, publication succeeds and records audit trail', async () => {
    const res = await request(app)
      .post(`/api/v1/properties/submissions/${testSubmissionId}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.published_at).not.toBeNull();
  });

  test('8. Rejection with Targeted Feedback: Reviewer requests changes with targeted comment', async () => {
    // Create a new draft submission to test rejection
    const subRes = await request(app)
      .post('/api/v1/properties/submissions')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        propertyId: 2,
        submissionType: 'PHOTO_UPDATE',
        contentSnapshot: { note: 'Proposed photo update' },
      });
    const sub2Id = subRes.body.data.id;

    // Owner reviews and requests changes with targeted feedback
    const revRes = await request(app)
      .post(`/api/v1/properties/submissions/${sub2Id}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        action: 'CHANGES_REQUESTED',
        decisionNotes: 'Room interior photo requires higher lighting resolution.',
        commentTargetType: 'PROPERTY',
        commentTargetId: 2,
        commentType: 'CORRECTION_REQUIRED',
        commentContent: 'Please retake bedroom photo with daylight illumination.',
      });

    expect(revRes.status).toBe(200);
    expect(revRes.body.data.status).toBe('CHANGES_REQUESTED');
    expect(revRes.body.data.review_comments.length).toBeGreaterThanOrEqual(1);
    expect(revRes.body.data.review_comments[0].content).toMatch(/retake bedroom photo/i);

    // Clean up
    await pool.query('DELETE FROM property_review_comments WHERE submission_id = ?', [sub2Id]);
    await pool.query('DELETE FROM property_submissions WHERE id = ?', [sub2Id]);
  });

  test('9. Role Boundary: Receptionist cannot review or publish property submissions (403 Forbidden)', async () => {
    const revRes = await request(app)
      .post(`/api/v1/properties/submissions/${testSubmissionId}/review`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ action: 'APPROVED' });

    expect(revRes.status).toBe(403);

    const pubRes = await request(app)
      .post(`/api/v1/properties/submissions/${testSubmissionId}/publish`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send();

    expect(pubRes.status).toBe(403);
  });
});

