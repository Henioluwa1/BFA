const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Stage 2.5B Package A — Identity Resolution & Technician Dispatch Verification', () => {
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let testWorkOrderId = null;
  let testUnmappedUserId = null;
  let testEmployeeId = null;
  let testLeaveRequestId = null;
  let testShiftId = null;
  let testRosterId = null;
  let testAttendanceId = null;

  beforeAll(async () => {
    // 1. Authenticate Admin
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    // 2. Authenticate Manager
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data.token;

    // 3. Authenticate Staff
    const staffRes = await request(app).post('/api/v1/auth/login').send({
      email: 'staff@bfa.com',
      password: 'Bfa2026!Secure',
    });
    staffToken = staffRes.body.data.token;

    // Clean up any old test data
    await pool.query('DELETE FROM maintenance_requests WHERE issue_title LIKE "%PackageA Test%"');
    await pool.query('DELETE FROM employees WHERE employee_code IN ("EMP-TEST-999", "EMP-TEST-998")');
    await pool.query('DELETE FROM users WHERE email IN ("tunde.test@bfa.com")');

    // Create an unmapped user (simulating Tunde Bakare / DEC-2.5B-01 case)
    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, property_id)
       VALUES ('Tunde Bakare Test', 'tunde.test@bfa.com', 'dummy_hash', 'STAFF', 'ACTIVE', 1)`
    );
    testUnmappedUserId = userRes.insertId;

    // Create a standalone unlinked employee record
    const empRes = await pool.query(
      `INSERT INTO employees (employee_code, first_name, last_name, full_name, email, phone, department, job_title, property_id, hire_date, employment_status)
       VALUES ('EMP-TEST-999', 'Tunde', 'Bakare', 'Tunde Bakare', 'tunde.hr@bfa.com', '+234800000000', 'MAINTENANCE', 'Lead Technician', 1, '2026-01-01', 'ACTIVE')`
    );
    testEmployeeId = empRes.insertId;
  });

  afterAll(async () => {
    if (testWorkOrderId) {
      await pool.query('DELETE FROM maintenance_requests WHERE id = ?', [testWorkOrderId]);
    }
    await pool.query('DELETE FROM maintenance_requests WHERE issue_title LIKE "%PackageA Test%"');
    if (testAttendanceId) {
      await pool.query('DELETE FROM attendance_records WHERE id = ?', [testAttendanceId]);
    }
    if (testShiftId) {
      await pool.query('DELETE FROM shifts WHERE id = ?', [testShiftId]);
    }
    if (testRosterId) {
      await pool.query('DELETE FROM rosters WHERE id = ?', [testRosterId]);
    }
    if (testLeaveRequestId) {
      await pool.query('DELETE FROM leave_requests WHERE id = ?', [testLeaveRequestId]);
    }
    if (testEmployeeId) {
      await pool.query('DELETE FROM employees WHERE id = ?', [testEmployeeId]);
    }
    if (testUnmappedUserId) {
      await pool.query('DELETE FROM users WHERE id = ?', [testUnmappedUserId]);
    }
    await pool.closePool();
  });

  // =========================================================================
  // 1. Administrative Explicit Identity Linking (DEC-2.5B-01 Option A)
  // =========================================================================
  describe('1. Administrative Explicit Identity Linking (DEC-2.5B-01 Option A)', () => {
    test('1.1 Non-admin roles are forbidden from linking user to employee', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${testEmployeeId}/link-user`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ userId: testUnmappedUserId });

      expect(res.status).toBe(403);
    });

    test('1.2 Rejects linking if emails differ and confirmEmailMismatch is false', async () => {
      // testEmployeeId has email tunde.hr@bfa.com, testUnmappedUserId has tunde.test@bfa.com
      const res = await request(app)
        .post(`/api/v1/employees/${testEmployeeId}/link-user`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: testUnmappedUserId, confirmEmailMismatch: false });

      expect(res.status).toBe(422);
      expect((res.body.error?.message || res.body.message)).toMatch(/Email mismatch/i);
    });

    test('1.3 Successfully links user to employee when confirmEmailMismatch is true and records audit log', async () => {
      const res = await request(app)
        .post(`/api/v1/employees/${testEmployeeId}/link-user`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: testUnmappedUserId, confirmEmailMismatch: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify in database
      const empRows = await pool.query('SELECT user_id FROM employees WHERE id = ?', [testEmployeeId]);
      expect(empRows[0].user_id).toBe(testUnmappedUserId);

      // Verify immutable audit log
      const auditRows = await pool.query(
        'SELECT * FROM audit_logs WHERE action = "EMPLOYEE_USER_LINKED" AND entity_id = ? ORDER BY id DESC LIMIT 1',
        [String(testEmployeeId)]
      );
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe('EMPLOYEE_USER_LINKED');
    });

    test('1.4 Rejects duplicate linking of user already linked to another employee', async () => {
      // Create a second unlinked employee
      const secondEmp = await pool.query(
        `INSERT INTO employees (employee_code, first_name, last_name, full_name, email, phone, department, job_title, property_id, hire_date, employment_status)
         VALUES ('EMP-TEST-998', 'Duplicate', 'Test', 'Duplicate Test', 'dup@bfa.com', '+234800000001', 'MAINTENANCE', 'Tech', 1, '2026-01-01', 'ACTIVE')`
      );

      const res = await request(app)
        .post(`/api/v1/employees/${secondEmp.insertId}/link-user`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: testUnmappedUserId, confirmEmailMismatch: true });

      expect(res.status).toBe(409);
      expect((res.body.error?.message || res.body.message)).toMatch(/already linked/i);

      // Cleanup second employee
      await pool.query('DELETE FROM employees WHERE id = ?', [secondEmp.insertId]);
    });
  });

  // =========================================================================
  // 2. Verified Eligible Technicians API & State Calculations
  // =========================================================================
  describe('2. Verified Eligible Technicians Query & States', () => {
    test('2.1 Unmapped staff without linked employee are marked NOT_ELIGIBLE (DEC-2.5B-01)', async () => {
      // Unlink testUnmappedUserId for this test
      await pool.query('UPDATE employees SET user_id = NULL WHERE id = ?', [testEmployeeId]);

      const res = await request(app)
        .get('/api/v1/maintenance/eligible-technicians?propertyId=1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const unmapped = res.body.data.technicians.find((t) => t.userId === testUnmappedUserId);
      expect(unmapped).toBeDefined();
      expect(unmapped.dispatchEligibility).toBe('NOT_ELIGIBLE');
      expect(unmapped.canDispatch).toBe(false);
      expect(unmapped.eligibilityReason).toBe('NO_EMPLOYEE_RECORD');

      // Re-link for subsequent tests
      await pool.query('UPDATE employees SET user_id = ? WHERE id = ?', [testUnmappedUserId, testEmployeeId]);
    });

    test('2.2 Technician on approved leave today is marked NOT_ELIGIBLE with reason ON_APPROVED_LEAVE', async () => {
      const today = new Date().toISOString().split('T')[0];
      const leaveRes = await pool.query(
        `INSERT INTO leave_requests (request_code, employee_id, property_id, leave_category_id, start_date, end_date, total_days, reason, status)
         VALUES ('LV-TEST-PKG-A', ?, 1, 1, ?, ?, 1, 'Medical recovery', 'APPROVED')`,
        [testEmployeeId, today, today]
      );
      testLeaveRequestId = leaveRes.insertId;

      const res = await request(app)
        .get('/api/v1/maintenance/eligible-technicians?propertyId=1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const tech = res.body.data.technicians.find((t) => t.userId === testUnmappedUserId);
      expect(tech.dispatchEligibility).toBe('NOT_ELIGIBLE');
      expect(tech.canDispatch).toBe(false);
      expect(tech.eligibilityReason).toBe('ON_APPROVED_LEAVE');

      // Remove leave request for next tests
      await pool.query('DELETE FROM leave_requests WHERE id = ?', [testLeaveRequestId]);
      testLeaveRequestId = null;
    });

    test('2.3 Technician with published shift today is marked SCHEDULED with canDispatch: true', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Create a published roster & shift
      const rosterRes = await pool.query(
        `INSERT INTO rosters (roster_code, property_id, title, start_date, end_date, status, created_by_id)
         VALUES ('RST-TEST-PKG-A', 1, 'Test Roster', ?, ?, 'PUBLISHED', 2)`,
        [today, today]
      );
      testRosterId = rosterRes.insertId;

      const shiftRes = await pool.query(
        `INSERT INTO shifts (roster_id, property_id, department, employee_id, shift_date, start_time, end_time, status)
         VALUES (?, 1, 'MAINTENANCE', ?, ?, '08:00:00', '17:00:00', 'SCHEDULED')`,
        [testRosterId, testEmployeeId, today]
      );
      testShiftId = shiftRes.insertId;

      const res = await request(app)
        .get('/api/v1/maintenance/eligible-technicians?propertyId=1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const tech = res.body.data.technicians.find((t) => t.userId === testUnmappedUserId);
      expect(tech.dispatchEligibility).toBe('SCHEDULED');
      expect(tech.canDispatch).toBe(true);
      expect(tech.shiftDetails).toBeDefined();
      expect(tech.shiftDetails.shiftId).toBe(testShiftId);
    });

    test('2.4 Clock-in with active geofence review exception evaluates to ATTENDANCE_UNDER_REVIEW with canDispatch: true (DEC-2.5B-02 Option A)', async () => {
      const today = new Date().toISOString().split('T')[0];
      const nowTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const attRes = await pool.query(
        `INSERT INTO attendance_records (
          employee_id, property_id, shift_id, work_date, clock_in_time,
          clock_in_method, is_verified, requires_review, verification_notes
        ) VALUES (?, 1, ?, ?, ?, 'MOBILE_LOCATION', 0, 1, 'GPS Out of bounds: 1250m from property (GEOFENCE EXCEPTION)')`,
        [testEmployeeId, testShiftId, today, nowTime]
      );
      testAttendanceId = attRes.insertId;

      const res = await request(app)
        .get('/api/v1/maintenance/eligible-technicians?propertyId=1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const tech = res.body.data.technicians.find((t) => t.userId === testUnmappedUserId);
      expect(tech.dispatchEligibility).toBe('ATTENDANCE_UNDER_REVIEW');
      expect(tech.canDispatch).toBe(true);
      expect(tech.attendanceWarning).toBe('GEOFENCE_REVIEW_PENDING');
      expect(tech.attendanceDetails.requiresReview).toBe(true);
    });

    test('2.5 Verified clock-in evaluates to VERIFIED_ON_DUTY with canDispatch: true', async () => {
      await pool.query('UPDATE attendance_records SET is_verified = 1, requires_review = 0 WHERE id = ?', [testAttendanceId]);

      const res = await request(app)
        .get('/api/v1/maintenance/eligible-technicians?propertyId=1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const tech = res.body.data.technicians.find((t) => t.userId === testUnmappedUserId);
      expect(tech.dispatchEligibility).toBe('VERIFIED_ON_DUTY');
      expect(tech.canDispatch).toBe(true);
      expect(tech.attendanceWarning).toBeNull();
    });
  });

  // =========================================================================
  // 3. Dispatch Concurrency, Attendance Exception Audit & Workload Capacity
  // =========================================================================
  describe('3. Dispatch Concurrency, Audit & Workload Capacity (DEC-2.5B-02 & DEC-2.5B-03)', () => {
    test('3.1 Dispatching technician with geofence exception writes DISPATCH_WITH_ATTENDANCE_EXCEPTION immutable audit event', async () => {
      // Re-flag attendance as requires_review = 1
      await pool.query('UPDATE attendance_records SET is_verified = 0, requires_review = 1 WHERE id = ?', [testAttendanceId]);

      // Create test work order
      const createRes = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          property_id: 1,
          apartment_id: 1,
          category: 'ELECTRICAL',
          priority: 'MEDIUM',
          issue_title: 'PackageA Test: Circuit Breaker Trip',
          description: 'Power cut in living room',
        });
      expect(createRes.status).toBe(201);
      testWorkOrderId = createRes.body.data.id;

      // Assign technician who is currently ATTENDANCE_UNDER_REVIEW
      const assignRes = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ staffId: testUnmappedUserId });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.assigned_to_id).toBe(testUnmappedUserId);

      // Verify DISPATCH_WITH_ATTENDANCE_EXCEPTION immutable audit event
      const auditRows = await pool.query(
        'SELECT * FROM audit_logs WHERE action = "DISPATCH_WITH_ATTENDANCE_EXCEPTION" AND entity_id = ?',
        [String(testWorkOrderId)]
      );
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe('DISPATCH_WITH_ATTENDANCE_EXCEPTION');
    });

    test('3.2 Assigning technician with active tickets >= threshold returns advisory workload warning without blocking (DEC-2.5B-03 Option B)', async () => {
      // Set workload threshold to 1 in system_settings for testing
      await pool.query(
        'INSERT INTO system_settings (category, setting_key, setting_value, description) VALUES ("maintenance", "maintenance_workload_warning_threshold", "1", "Test") ON DUPLICATE KEY UPDATE setting_value = "1"'
      );

      // Technician already has testWorkOrderId in OPEN status.
      // Create a second work order and assign to same technician
      const secondOrderRes = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          property_id: 1,
          apartment_id: 1,
          category: 'PLUMBING',
          priority: 'LOW',
          issue_title: 'PackageA Test: Faucet Drip',
          description: 'Bathroom faucet dripping',
        });
      expect(secondOrderRes.status).toBe(201);
      const secondOrderId = secondOrderRes.body.data.id;

      const assignRes = await request(app)
        .post(`/api/v1/maintenance/${secondOrderId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ staffId: testUnmappedUserId });

      // Must NOT fail (Option B: Advisory Warning Only, No Hard Block)
      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.isOverloaded).toBe(true);
      expect(assignRes.body.data.workloadWarning).toMatch(/active work orders/i);

      // Cleanup second order
      await pool.query('DELETE FROM maintenance_requests WHERE id = ?', [secondOrderId]);

      // Reset threshold back to 5
      await pool.query(
        'UPDATE system_settings SET setting_value = "5" WHERE setting_key = "maintenance_workload_warning_threshold"'
      );
    });

    test('3.3 Rejects assignment of unmapped user account (DEC-2.5B-01 Option A)', async () => {
      // Unlink testUnmappedUserId
      await pool.query('UPDATE employees SET user_id = NULL WHERE id = ?', [testEmployeeId]);

      const res = await request(app)
        .post(`/api/v1/maintenance/${testWorkOrderId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ staffId: testUnmappedUserId });

      expect(res.status).toBe(422);
      expect((res.body.error?.message || res.body.message)).toMatch(/No authoritative employee record/i);

      // Restore link
      await pool.query('UPDATE employees SET user_id = ? WHERE id = ?', [testUnmappedUserId, testEmployeeId]);
    });
  });
});
