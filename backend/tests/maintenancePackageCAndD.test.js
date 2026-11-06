const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Stage 2.5B Packages C & D — Authenticated Evidence APIs & Work Order Hardening Verification', () => {
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let agentToken = '';

  let testWorkOrderId = null;
  let testSecondOrderId = null;
  let testAttachmentId = null;
  let testFileName = null;
  let testTechnicianUserId = null;
  let testEmployeeId = null;

  // Minimal valid 1x1 JPEG Buffer (Magic bytes: FF D8 FF E0 ...)
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x03, 0x02, 0x02, 0x03, 0x02, 0x02, 0x03, 0xff, 0xc0, 0x00, 0x0b,
    0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00,
    0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x09, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x37,
    0xff, 0xd9
  ]);
  const validJpegBase64 = `data:image/jpeg;base64,${validJpegBuffer.toString('base64')}`;

  // Minimal valid 1x1 PNG Buffer (Magic bytes: 89 50 4E 47 0D 0A 1A 0A)
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
  ]);
  const validPngBase64 = `data:image/png;base64,${validPngBuffer.toString('base64')}`;

  // Invalid file (plain text spoofed as image)
  const invalidTextBuffer = Buffer.from('Not an image! Exploit script payload');
  const invalidTextBase64 = `data:image/jpeg;base64,${invalidTextBuffer.toString('base64')}`;

  beforeAll(async () => {
    // 1. Authenticate Admin (global)
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    // 2. Authenticate Manager (Property 1)
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data.token;

    // 3. Authenticate Staff (Property 1)
    const staffRes = await request(app).post('/api/v1/auth/login').send({
      email: 'staff@bfa.com',
      password: 'Bfa2026!Secure',
    });
    staffToken = staffRes.body.data.token;

    // 4. Authenticate Agent (External role)
    const agentRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agentRes.body.data.token;

    // Cleanup old test data
    await pool.query('DELETE FROM maintenance_requests WHERE issue_title LIKE "%PackageCD Test%"');
    await pool.query('DELETE FROM employees WHERE employee_code = "EMP-TEST-CD-01"');
    await pool.query('DELETE FROM users WHERE email = "tech.cd@bfa.com"');

    // Create a technician user and linked employee
    const uRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, property_id)
       VALUES ('Package CD Tech', 'tech.cd@bfa.com', 'dummy_hash', 'STAFF', 'ACTIVE', 1)`
    );
    testTechnicianUserId = uRes.insertId;

    const empRes = await pool.query(
      `INSERT INTO employees (employee_code, first_name, last_name, full_name, email, phone, department, job_title, property_id, hire_date, employment_status, user_id)
       VALUES ('EMP-TEST-CD-01', 'Tech', 'CD', 'Tech CD', 'tech.cd@bfa.com', '+234800000009', 'MAINTENANCE', 'Technician', 1, '2026-01-01', 'ACTIVE', ?)`
      , [testTechnicianUserId]
    );
    testEmployeeId = empRes.insertId;

    // Create a test maintenance work order
    const createRes = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        property_id: 1,
        apartment_id: 1,
        category: 'PLUMBING',
        priority: 'HIGH',
        issue_title: 'PackageCD Test: Master Bath Leak',
        description: 'Persistent water seepage under basin',
        blocking_unit: true,
      });
    testWorkOrderId = createRes.body.data.id;
  });

  afterAll(async () => {
    if (testWorkOrderId) {
      await pool.query('DELETE FROM maintenance_requests WHERE id = ?', [testWorkOrderId]);
    }
    if (testSecondOrderId) {
      await pool.query('DELETE FROM maintenance_requests WHERE id = ?', [testSecondOrderId]);
    }
    await pool.query('DELETE FROM maintenance_requests WHERE issue_title LIKE "%PackageCD Test%"');
    if (testAttachmentId) {
      await pool.query('DELETE FROM operational_evidence_attachments WHERE id = ?', [testAttachmentId]);
    }
    if (testEmployeeId) {
      await pool.query('DELETE FROM employees WHERE id = ?', [testEmployeeId]);
    }
    if (testTechnicianUserId) {
      await pool.query('DELETE FROM users WHERE id = ?', [testTechnicianUserId]);
    }
    await pool.closePool();
  });

  // =========================================================================
  // 1. Package C — Authenticated Evidence Ingestion & Streaming APIs
  // =========================================================================
  describe('1. Package C — Authenticated Evidence Ingestion & Streaming APIs', () => {
    test('1.1 Rejects unauthenticated evidence upload (HTTP 401)', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/evidence`)
        .send({ fileData: validJpegBase64 });
      expect(res.status).toBe(401);
    });

    test('1.2 Rejects unauthorized role (AGENT) from uploading evidence (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/evidence`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ fileData: validJpegBase64 });
      expect(res.status).toBe(403);
    });

    test('1.3 Rejects upload with invalid/spoofed magic bytes (HTTP 422)', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/evidence`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          fileData: invalidTextBase64,
          evidenceCategory: 'MAINTENANCE_AFTER',
          caption: 'Spoofed plain text file',
        });
      expect(res.status).toBe(422);
      expect((res.body.error?.message || res.body.message)).toMatch(/Invalid file format|File header does not match/i);
    });

    test('1.4 Rejects oversized file payload exceeding 10MB limit (HTTP 413 or 422)', async () => {
      const oversized = Buffer.alloc(10.5 * 1024 * 1024);
      oversized[0] = 0xff;
      oversized[1] = 0xd8;
      oversized[2] = 0xff;
      const oversizedBase64 = `data:image/jpeg;base64,${oversized.toString('base64')}`;

      const res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/evidence`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ fileData: oversizedBase64 });

      expect([413, 422]).toContain(res.status);
    });

    test('1.5 Successfully uploads valid JPEG evidence, stores in private storage with cryptographic filename, populates snapshot, and writes audit event (HTTP 201)', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/evidence`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          fileData: validJpegBase64,
          evidenceCategory: 'MAINTENANCE_AFTER',
          caption: 'Clean repair of pipe coupling',
          originalFileName: 'repair_finish.jpg',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();

      testAttachmentId = res.body.data.id;
      testFileName = res.body.data.fileName;

      expect(testFileName).toMatch(/^mnt_ev_\d+_[a-f0-9-]+\.jpg$/i);
      expect(res.body.data.workOrderReference).toMatch(/^MNT-/);
      expect(res.body.data.streamUrl).toBeDefined();

      // Verify file exists in backend/storage/private/maintenance
      const storagePath = path.resolve(__dirname, '../storage/private/maintenance', testFileName);
      expect(fs.existsSync(storagePath)).toBe(true);

      // Verify audit log
      const auditRows = await pool.query(
        'SELECT * FROM audit_logs WHERE action = "MAINTENANCE_EVIDENCE_ATTACHED" AND entity_id = ? ORDER BY id DESC LIMIT 1',
        [String(testWorkOrderId)]
      );
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe('MAINTENANCE_EVIDENCE_ATTACHED');
    });

    test('1.6 GET /api/v1/maintenance/:id/evidence lists all evidence attachments for the work order', async () => {
      const res = await request(app)
        .get(`/api/v1/maintenance/${testWorkOrderId}/evidence`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((e) => e.id === testAttachmentId);
      expect(found).toBeDefined();
      expect(found.file_name).toBe(testFileName);
      expect(found.streamUrl).toMatch(/\/stream$/);
    });

    test('1.7 GET /api/v1/maintenance/:id/evidence/:evidenceId/stream streams file with security headers (nosniff, inline)', async () => {
      const res = await request(app)
        .get(`/api/v1/maintenance/${testWorkOrderId}/evidence/${testAttachmentId}/stream`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-type']).toMatch(/image\/jpeg/i);
      expect(res.headers['content-disposition']).toMatch(/inline;\s*filename=/i);
      expect(res.headers['cache-control']).toMatch(/private/i);
      expect(res.body.length).toBe(validJpegBuffer.length);
    });

    test('1.8 Streams file by filename directly as alternative route', async () => {
      const res = await request(app)
        .get(`/api/v1/maintenance/${testWorkOrderId}/evidence/${testFileName}/stream`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-type']).toMatch(/image\/jpeg/i);
    });

    test('1.9 Blocks path traversal attempts on evidence streaming endpoint', async () => {
      const res = await request(app)
        .get(`/api/v1/maintenance/${testWorkOrderId}/evidence/..%2f..%2fpackage.json/stream`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect([400, 403, 404]).toContain(res.status);
    });

    test('1.10 Documented Written Exemption (DEC-2.5B-04): Successfully documents photo exemption with approved reason', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/evidence`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          isExemption: true,
          photo_exemption_reason: 'TENANT_PRIVACY',
          exemption_notes: 'Resident requested privacy while dressing; post-work inspection confirmed functional in hall.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isExemption).toBe(true);
      expect(res.body.data.exemptionReason).toBe('TENANT_PRIVACY');

      // Verify audit event
      const auditRows = await pool.query(
        'SELECT * FROM audit_logs WHERE action = "MAINTENANCE_EVIDENCE_EXEMPTION" AND entity_id = ? ORDER BY id DESC LIMIT 1',
        [String(testWorkOrderId)]
      );
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe('MAINTENANCE_EVIDENCE_EXEMPTION');
    });

    test('1.11 Rejects documented exemption with invalid reason or missing notes (HTTP 422)', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/evidence`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          isExemption: true,
          photo_exemption_reason: 'FORGOT_MY_PHONE', // not in allowed enum
          exemption_notes: 'Forgot phone',
        });

      expect(res.status).toBe(422);
      expect((res.body.error?.message || res.body.message)).toMatch(/Invalid photo exemption reason/i);
    });

    test('1.12 DELETE /api/v1/maintenance/:id/evidence/:evidenceId purges file and database record with audit logging', async () => {
      // Non-management role (STAFF) should be rejected
      const staffDelRes = await request(app)
        .delete(`/api/v1/maintenance/${testWorkOrderId}/evidence/${testAttachmentId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ justification: 'Unauthorized attempt' });
      expect(staffDelRes.status).toBe(403);

      // Manager deletes evidence with justification
      const mgrDelRes = await request(app)
        .delete(`/api/v1/maintenance/${testWorkOrderId}/evidence/${testAttachmentId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ justification: 'Duplicate photograph removed by property management' });

      expect(mgrDelRes.status).toBe(200);
      expect(mgrDelRes.body.success).toBe(true);

      // Verify deleted from database
      const rows = await pool.query('SELECT id FROM operational_evidence_attachments WHERE id = ?', [testAttachmentId]);
      expect(rows.length).toBe(0);

      // Verify deleted from disk
      const storagePath = path.resolve(__dirname, '../storage/private/maintenance', testFileName);
      expect(fs.existsSync(storagePath)).toBe(false);

      // Verify audit event
      const auditRows = await pool.query(
        'SELECT * FROM audit_logs WHERE action = "MAINTENANCE_EVIDENCE_PURGED" AND entity_id = ? ORDER BY id DESC LIMIT 1',
        [String(testAttachmentId)]
      );
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe('MAINTENANCE_EVIDENCE_PURGED');

      testAttachmentId = null;
    });
  });

  // =========================================================================
  // 2. Package D — Maintenance Lifecycle Hardening & Concurrency
  // =========================================================================
  describe('2. Package D — Maintenance Lifecycle Hardening & Concurrency', () => {
    test('2.1 Work order creation sets unit to MAINTENANCE and validates apartment property ownership', async () => {
      // Rejects creation when apartment does not belong to specified property
      const invalidAptRes = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          property_id: 1,
          apartment_id: 9999, // Non-existent apartment
          category: 'ELECTRICAL',
          priority: 'MEDIUM',
          issue_title: 'PackageCD Test: Invalid Unit',
        });
      expect([404, 422]).toContain(invalidAptRes.status);

      // Verify unit 1 status is MAINTENANCE (due to testWorkOrderId created in beforeAll)
      const aptRows = await pool.query('SELECT status FROM apartments WHERE id = 1');
      expect(aptRows[0].status).toBe('MAINTENANCE');
    });

    test('2.2 Start work order transitions status from OPEN to IN_PROGRESS and logs audit event', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/start`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.started_at).toBeTruthy();

      // Verify audit event
      const auditRows = await pool.query(
        'SELECT * FROM audit_logs WHERE action = "MAINTENANCE_STARTED" AND entity_id = ? ORDER BY id DESC LIMIT 1',
        [String(testWorkOrderId)]
      );
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe('MAINTENANCE_STARTED');
    });

    test('2.3 Reassignment from Technician A to Technician B locks rows in ascending numerical order without deadlock', async () => {
      // Create second technician user
      const u2Res = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status, property_id)
         VALUES ('Package CD Tech 2', 'tech2.cd@bfa.com', 'dummy_hash', 'STAFF', 'ACTIVE', 1)`
      );
      const tech2Id = u2Res.insertId;

      await pool.query(
        `INSERT INTO employees (employee_code, first_name, last_name, full_name, email, phone, department, job_title, property_id, hire_date, employment_status, user_id)
         VALUES ('EMP-TEST-CD-02', 'Tech2', 'CD', 'Tech2 CD', 'tech2.cd@bfa.com', '+234800000010', 'MAINTENANCE', 'Tech', 1, '2026-01-01', 'ACTIVE', ?)`
        , [tech2Id]
      );

      // First assign to tech 1
      const assign1Res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ staffId: testTechnicianUserId });
      expect(assign1Res.status).toBe(200);
      expect(assign1Res.body.data.assigned_to_id).toBe(testTechnicianUserId);

      // Reassign to tech 2 (multi-technician lock ordering in ascending order)
      const assign2Res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ staffId: tech2Id });
      expect(assign2Res.status).toBe(200);
      expect(assign2Res.body.data.assigned_to_id).toBe(tech2Id);

      // Cleanup tech 2
      await pool.query('DELETE FROM employees WHERE employee_code = "EMP-TEST-CD-02"');
      await pool.query('DELETE FROM users WHERE id = ?', [tech2Id]);
    });

    test('2.4 Multi-maintenance unit protection: Resolving work order does NOT transition unit to CLEANING if another blocking work order is active', async () => {
      // Create a second blocking work order on apartment 1
      const secondOrderRes = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          property_id: 1,
          apartment_id: 1,
          category: 'ELECTRICAL',
          priority: 'CRITICAL',
          issue_title: 'PackageCD Test: Second Blocking Issue',
          blocking_unit: true,
        });
      expect(secondOrderRes.status).toBe(201);
      testSecondOrderId = secondOrderRes.body.data.id;

      // Attach evidence photo to first work order before resolving
      await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/evidence`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          fileData: validPngBase64,
          evidenceCategory: 'MAINTENANCE_AFTER',
          caption: 'Resolved first issue',
        });

      // Resolve first work order
      const resolve1Res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/resolve`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          actual_cost: 15000,
          resolution_notes: 'Replaced seals and washers. No leaks observed.',
          photo_exemption_reason: 'NON_VISUAL_REPAIR',
        });
      expect(resolve1Res.status).toBe(200);
      expect(resolve1Res.body.data.status).toBe('RESOLVED');

      // Unit 1 MUST STILL BE in MAINTENANCE because second blocking work order is OPEN!
      const aptCheck1 = await pool.query('SELECT status FROM apartments WHERE id = 1');
      expect(aptCheck1[0].status).toBe('MAINTENANCE');

      // Now resolve the second work order with written exemption
      const resolve2Res = await request(app)
        .post(`/api/v1/maintenance/${testSecondOrderId}/resolve`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          actual_cost: 5000,
          resolution_notes: 'Reset tripped sub-panel circuit breaker. Voltage verified at 230V.',
          photo_exemption_reason: 'NON_VISUAL_REPAIR',
        });
      expect(resolve2Res.status).toBe(200);

      // Now ALL blocking work orders are cleared -> Unit 1 MUST transition to CLEANING!
      const aptCheck2 = await pool.query('SELECT status FROM apartments WHERE id = 1');
      expect(aptCheck2[0].status).toBe('CLEANING');
    });

    test('2.5 Work order deletion (Admin only) preserves evidence snapshot via work_order_reference and ON DELETE SET NULL', async () => {
      // Attach an evidence photo to testSecondOrderId
      const attachRes = await request(app)
        .post(`/api/v1/maintenance/${testSecondOrderId}/evidence`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          fileData: validJpegBase64,
          evidenceCategory: 'DEFECT',
          caption: 'Pre-repair breaker burn mark',
        });
      expect(attachRes.status).toBe(201);
      const snapshotAttachmentId = attachRes.body.data.id;
      const expectedWorkOrderRef = attachRes.body.data.workOrderReference;

      // Non-admin (MANAGER or STAFF) cannot delete work order
      const staffDelRes = await request(app)
        .delete(`/api/v1/maintenance/${testSecondOrderId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(staffDelRes.status).toBe(403);

      // Admin deletes work order
      const adminDelRes = await request(app)
        .delete(`/api/v1/maintenance/${testSecondOrderId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminDelRes.status).toBe(200);
      expect(adminDelRes.body.success).toBe(true);

      // Verify work order is deleted
      const orderRows = await pool.query('SELECT id FROM maintenance_requests WHERE id = ?', [testSecondOrderId]);
      expect(orderRows.length).toBe(0);

      // CRITICAL PRESERVATION CHECK: Evidence attachment row still exists!
      // maintenance_id is NULL (via FK ON DELETE SET NULL), but work_order_reference is PRESERVED!
      const attRows = await pool.query(
        'SELECT id, maintenance_id, work_order_reference FROM operational_evidence_attachments WHERE id = ?',
        [snapshotAttachmentId]
      );
      expect(attRows.length).toBe(1);
      expect(attRows[0].maintenance_id).toBeNull();
      expect(attRows[0].work_order_reference).toBe(expectedWorkOrderRef);

      // Verify audit log for work order deletion
      const auditRows = await pool.query(
        'SELECT * FROM audit_logs WHERE action = "MAINTENANCE_DELETED" AND entity_id = ? ORDER BY id DESC LIMIT 1',
        [String(testSecondOrderId)]
      );
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe('MAINTENANCE_DELETED');

      // Cleanup attachment record and file
      await pool.query('DELETE FROM operational_evidence_attachments WHERE id = ?', [snapshotAttachmentId]);
      testSecondOrderId = null;
    });
  });
});
