const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Phase 11: Employee Management, Performance, Profiles, and ID Cards', () => {
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let agentToken = '';

  let createdEmployeeId = null;
  let testUserId = null;
  let testCardId = null;
  let testVerificationToken = null;
  let testEvaluationId = null;

  beforeAll(async () => {
    // 1. Admin login
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data?.token;

    // 2. Manager login
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data?.token;

    // 3. Staff login
    const staffRes = await request(app).post('/api/v1/auth/login').send({
      email: 'staff@bfa.com',
      password: 'Bfa2026!Secure',
    });
    staffToken = staffRes.body.data?.token;

    // 4. Agent login
    const agRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agRes.body.data?.token;

    // Cleanup previous autotest employees
    const testEmps = await pool.query('SELECT id FROM employees WHERE employee_code LIKE "TEST_EMP_%"');
    for (const emp of testEmps) {
      await pool.query('DELETE FROM employee_id_cards WHERE employee_id = ?', [emp.id]);
      await pool.query('DELETE FROM employee_evaluation_scores WHERE evaluation_id IN (SELECT id FROM employee_evaluations WHERE employee_id = ?)', [emp.id]);
      await pool.query('DELETE FROM employee_evaluations WHERE employee_id = ?', [emp.id]);
      await pool.query('DELETE FROM employee_activities WHERE employee_id = ?', [emp.id]);
      await pool.query('DELETE FROM employee_profiles WHERE employee_id = ?', [emp.id]);
      await pool.query('DELETE FROM employees WHERE id = ?', [emp.id]);
    }
  }, 30000);

  afterAll(async () => {
    // Cleanup created test records
    if (createdEmployeeId) {
      await pool.query('DELETE FROM employee_id_cards WHERE employee_id = ?', [createdEmployeeId]);
      await pool.query('DELETE FROM employee_evaluation_scores WHERE evaluation_id IN (SELECT id FROM employee_evaluations WHERE employee_id = ?)', [createdEmployeeId]);
      await pool.query('DELETE FROM employee_evaluations WHERE employee_id = ?', [createdEmployeeId]);
      await pool.query('DELETE FROM employee_activities WHERE employee_id = ?', [createdEmployeeId]);
      await pool.query('DELETE FROM employee_profiles WHERE employee_id = ?', [createdEmployeeId]);
      await pool.query('DELETE FROM employees WHERE id = ?', [createdEmployeeId]);
    }
    await pool.closePool();
  });

  // ==========================================
  // SECTION 1: EMPLOYEE CRUD & VALIDATION
  // ==========================================
  describe('Gate 11.1 & 11.2: Employee CRUD & RBAC', () => {
    test('1. Unauthorized user cannot create employee records', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          first_name: 'Unauthorized',
          last_name: 'Employee',
          email: 'unauthorized.emp@bfa.com',
          phone: '+2348000000000',
          job_title: 'Junior Porter',
          property_id: 1,
        });

      expect(res.status).toBe(403);
    });

    test('2. Super Admin / Manager creates a new employee record', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          staff_code: 'TEST_EMP_001',
          first_name: 'Chioma',
          last_name: 'Adeyemi',
          email: 'chioma.adeyemi.test@bfa.com',
          phone: '+2348011223344',
          property_id: 1,
          job_title: 'Senior Operations Lead',
          department: 'OPERATIONS',
          employment_type: 'FULL_TIME',
          hire_date: '2026-01-15',
          salary_amount: 350000,
          notes: 'Test employee onboarding record',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.staff_code).toBe('TEST_EMP_001');
      expect(res.body.data.employment_status).toBe('ACTIVE');

      createdEmployeeId = res.body.data.id;
    });

    test('3. Enforces unique staff_code constraint on duplicate creation', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          staff_code: 'TEST_EMP_001', // Duplicate
          first_name: 'Duplicate',
          last_name: 'Staff',
          email: 'dup.staff@bfa.com',
          phone: '+2348000000001',
          job_title: 'Assistant',
          property_id: 1,
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.message).toContain('already');
    });

    test('4. Fetch employee directory with property scoping and search', async () => {
      const res = await request(app)
        .get('/api/v1/employees?search=Chioma&property_id=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.employees.length).toBeGreaterThanOrEqual(1);
      const found = res.body.data.employees.find((e) => e.id === createdEmployeeId);
      expect(found).toBeDefined();
      expect(found.first_name).toBe('Chioma');
    });

    test('5. Update employee profile and personal information', async () => {
      const res = await request(app)
        .put(`/api/v1/employees/${createdEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          phone: '+2348099887766',
          address_line1: '14 Admiralty Way, Lekki Phase 1',
          city: 'Lagos',
          state: 'Lagos',
          emergency_contact_name: 'Oluwaseun Adeyemi',
          emergency_contact_phone: '+2348022334455',
          emergency_contact_relationship: 'Spouse',
          skills: 'Hospitality Management, Concierge, Dispute Resolution',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe('+2348099887766');
      expect(res.body.data.profile?.address_line1).toBe('14 Admiralty Way, Lekki Phase 1');
      expect(res.body.data.profile?.emergency_contact_name).toBe('Oluwaseun Adeyemi');
    });

    test('6. Fetch detailed employee profile view', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${createdEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.staff_code).toBe('TEST_EMP_001');
      expect(res.body.data.profile).toBeDefined();
    });
  });

  // ==========================================
  // SECTION 2: PROFILE PHOTO UPLOADS
  // ==========================================
  describe('Gate 11.4: Profile Photo Upload & Validation', () => {
    test('1. Rejects invalid base64 image data format', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${createdEmployeeId}/photo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          photo_base64: 'invalid-non-base64-string',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain('Invalid image payload');
    });

    test('2. Rejects unsupported MIME type (e.g. text/html pretending to be image)', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${createdEmployeeId}/photo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          photo_base64: 'data:text/html;base64,PGgxPkhlbGxvPC9oMT4=',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain('Unsupported image type');
    });

    test('3. Uploads valid PNG profile photograph', async () => {
      // Small 1x1 transparent PNG data URI
      const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

      const res = await request(app)
        .post(`/api/v1/employees/${createdEmployeeId}/photo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          photo_base64: tinyPng,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.photo_url).toContain(`/api/v1/employees/${createdEmployeeId}/photo`);
    });

    test('4. Serves uploaded photo stream with image content-type', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${createdEmployeeId}/photo`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/png/);
    });
  });

  // ==========================================
  // SECTION 3: EMPLOYEE ACTIVITY TRACKING
  // ==========================================
  describe('Gate 11.5: Activity Tracking & Operations Ledger', () => {
    test('1. Logs operational activities directly to employee ledger', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${createdEmployeeId}/activities`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          activity_type: 'GUEST_CHECKED_IN',
          activity_category: 'FRONT_DESK',
          related_entity_type: 'reservation',
          related_entity_id: 101,
          description: 'Checked in VIP Guest in Apt 204',
          metadata: { apartment_unit: '204', guest_name: 'Alhaji Musa' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activity_type).toBe('GUEST_CHECKED_IN');
      expect(res.body.data.employee_id).toBe(createdEmployeeId);
    });

    test('2. Retrieves employee activity history with category breakdown', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${createdEmployeeId}/activities`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activities.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.activities[0].activity_type).toBe('GUEST_CHECKED_IN');
      expect(res.body.data.breakdown.FRONT_DESK).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================
  // SECTION 4: PERFORMANCE METRICS & EVALUATIONS
  // ==========================================
  describe('Gate 11.6, 11.7 & 11.8: Performance Calculation & Manager Evaluations', () => {
    test('1. Calculates objective system metrics (Rule 2: System observed vs manager scores)', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${createdEmployeeId}/performance`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.system_metrics).toBeDefined();
      expect(res.body.data.system_metrics.total_activities).toBeGreaterThanOrEqual(1);
      expect(res.body.data.system_metrics.active_days).toBeGreaterThanOrEqual(1);
      expect(res.body.data.manager_evaluation).toBeDefined();
      expect(res.body.data.manager_evaluation.has_evaluation).toBe(false); // Not evaluated yet
    });

    test('2. Fetches evaluation criteria templates', async () => {
      const res = await request(app)
        .get('/api/v1/employees/evaluation-criteria')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(9);
    });

    test('3. Manager creates evaluation draft for employee', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${createdEmployeeId}/evaluations`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          period_start: '2026-01-01',
          period_end: '2026-03-31',
          scores: [
            { criteria_id: 1, score: 95, comments: 'Consistent and timely attendance' },
            { criteria_id: 2, score: 90, comments: 'Always starts shift promptly' },
            { criteria_id: 3, score: 88, comments: 'Exceeds daily guest turnaround quotas' },
            { criteria_id: 4, score: 92, comments: 'Exceptional attention to detail' },
            { criteria_id: 5, score: 95, comments: 'Warm and proactive communication' },
            { criteria_id: 6, score: 85, comments: 'Supportive team collaborator' },
            { criteria_id: 7, score: 88, comments: 'Clear reports to property management' },
            { criteria_id: 8, score: 96, comments: 'Strict adherence to BFA security protocol' },
            { criteria_id: 9, score: 90, comments: 'Takes initiative during rush periods' },
          ],
          general_comments: 'Exemplary performance during Q1 operations.',
          strengths: 'Operational discipline, client satisfaction, adherence to SOP.',
          areas_for_improvement: 'Continue mentoring junior housekeeping supervisors.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.average_score).toBeGreaterThan(80);

      testEvaluationId = res.body.data.id;
    });

    test('4. Submits evaluation for management finalization', async () => {
      const res = await request(app)
        .put(`/api/v1/employees/${createdEmployeeId}/evaluations/${testEvaluationId}/submit`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SUBMITTED');
    });

    test('5. Non-super admin cannot finalize evaluation without capability', async () => {
      const res = await request(app)
        .put(`/api/v1/employees/${createdEmployeeId}/evaluations/${testEvaluationId}/finalize`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    test('6. Super Admin / Authorized Manager finalizes evaluation', async () => {
      const res = await request(app)
        .put(`/api/v1/employees/${createdEmployeeId}/evaluations/${testEvaluationId}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('FINALIZED');
      expect(res.body.data.finalized_at).toBeDefined();
    });

    test('7. Performance calculation now incorporates finalized evaluation rating', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${createdEmployeeId}/performance`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.manager_evaluation.has_evaluation).toBe(true);
      expect(res.body.data.manager_evaluation.average_score).toBeGreaterThan(80);
      expect(res.body.data.manager_evaluation.dimension_scores.length).toBe(9);
    });
  });

  // ==========================================
  // SECTION 5: ID CARDS & QR VERIFICATION
  // ==========================================
  describe('Gate 11.11, 11.12 & 11.13: ID Card Lifecycle & QR Verification', () => {
    test('1. Generates new official staff ID card with secure token', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${createdEmployeeId}/id-card`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          expires_at: '2027-12-31',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.card_number).toContain('BFA-ID');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.verification_token).toBeDefined();

      testCardId = res.body.data.id;
      testVerificationToken = res.body.data.verification_token;
    });

    test('2. Public QR verification verifies valid badge without leaking sensitive PII', async () => {
      const res = await request(app).get(`/api/v1/employees/verify-id-card/${testVerificationToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.badge_valid).toBe(true);
      expect(res.body.data.badge.employee_name).toBe('Chioma Adeyemi');
      expect(res.body.data.badge.staff_code).toBe('TEST_EMP_001');
      expect(res.body.data.badge.job_title).toBe('Senior Operations Lead');
      expect(res.body.data.badge.card_status).toBe('ACTIVE');

      // Crucial Security check: zero sensitive PII in public endpoint
      expect(res.body.data.badge.home_address).toBeUndefined();
      expect(res.body.data.badge.phone).toBeUndefined();
      expect(res.body.data.badge.salary_amount).toBeUndefined();
      expect(res.body.data.badge.emergency_contact).toBeUndefined();
    });

    test('3. Downloads printable PDF badge stream', async () => {
      const res = await request(app)
        .get(`/api/v1/employees/${createdEmployeeId}/id-card/pdf`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toContain('attachment; filename=');
    });

    test('4. Revokes active card with mandatory revocation reason', async () => {
      const res = await request(app)
        .put(`/api/v1/employees/${createdEmployeeId}/id-card/${testCardId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          revocation_reason: 'Reissuance of upgraded security badge',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REVOKED');
      expect(res.body.data.revocation_reason).toBe('Reissuance of upgraded security badge');
    });

    test('5. QR verification immediately reflects REVOKED status', async () => {
      const res = await request(app).get(`/api/v1/employees/verify-id-card/${testVerificationToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.badge_valid).toBe(false);
      expect(res.body.data.badge.card_status).toBe('REVOKED');
      expect(res.body.data.message).toContain('revoked');
    });

    test('6. Reissues a fresh ID badge', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${createdEmployeeId}/id-card/reissue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          expires_at: '2028-12-31',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.id).not.toBe(testCardId); // New card generated
    });
  });

  // ==========================================
  // SECTION 6: SECURITY & PROPERTY ISOLATION
  // ==========================================
  describe('Gate 11.18: Property Isolation & Self-Service Guardrails', () => {
    test('1. Property isolation prevents manager from accessing employees outside scoped property', async () => {
      // Try accessing an employee for property 2 with property 1 manager scope (if property 2 exists)
      const res = await request(app)
        .get(`/api/v1/employees?property_id=2`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Manager of property 1 cannot view property 2 employees
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        // If 200, none of the returned employees should belong to other unassigned properties
        const records = res.body.data.employees || [];
        for (const r of records) {
          expect([1, null]).toContain(r.property_id);
        }
      }
    });

    test('2. Self-service endpoint returns logged-in user profile or 404 if unlinked', async () => {
      const res = await request(app)
        .get('/api/v1/employees/me/profile')
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin has an employee record seeded in migration 013
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data.first_name).toBeDefined();
      }
    });

    test('3. Employee status update to TERMINATED revokes active badge automatically', async () => {
      const res = await request(app)
        .put(`/api/v1/employees/${createdEmployeeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employment_status: 'TERMINATED',
          status_reason: 'Voluntary resignation and transition',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.employment_status).toBe('TERMINATED');

      // Check current card is REVOKED
      const cardRes = await request(app)
        .get(`/api/v1/employees/${createdEmployeeId}/id-card`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(cardRes.status).toBe(200);
      if (cardRes.body.data.current_card) {
        expect(cardRes.body.data.current_card.status).toBe('REVOKED');
      }
    });
  });
});
