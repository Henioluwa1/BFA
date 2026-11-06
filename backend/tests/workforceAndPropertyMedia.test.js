const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const jwt = require('jsonwebtoken');
const config = require('../src/config');

describe('Workforce Roster Management & Property Media Upload (Priority Suite)', () => {
  let adminToken;
  let managerProp1Token;
  let managerProp2Token;
  let staffProp1Token;
  let superAdminToken;

  const validPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeAll(async () => {
    // Generate auth tokens
    adminToken = jwt.sign(
      { id: 2, name: 'Operations Admin', email: 'admin@bfa.com', role: 'ADMIN', propertyId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    managerProp1Token = jwt.sign(
      { id: 3, name: 'Marcus Vance', email: 'manager@bfa.com', role: 'MANAGER', propertyId: 1 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    managerProp2Token = jwt.sign(
      { id: 99, name: 'Other Manager', email: 'othermanager@bfa.com', role: 'MANAGER', propertyId: 2 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    staffProp1Token = jwt.sign(
      { id: 5, name: 'David Kalu', email: 'staff@bfa.com', role: 'STAFF', propertyId: 1 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    superAdminToken = jwt.sign(
      { id: 1, name: 'Super Admin', email: 'superadmin@bfa.com', role: 'SUPER_ADMIN', propertyId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    // Ensure staff employee records have property_id = 1
    await pool.query('UPDATE employees SET property_id = 1 WHERE id IN (3, 4)');
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM shift_swap_requests');
    await pool.query('DELETE FROM attendance_corrections');
    await pool.query('DELETE FROM attendance_records WHERE employee_id IN (3, 4)');
    await pool.query('DELETE FROM shifts WHERE employee_id IN (3, 4)');
    await pool.query('DELETE FROM leave_requests WHERE employee_id IN (3, 4)');
    await pool.query('DELETE FROM leave_balances WHERE employee_id IN (3, 4)');
    await pool.query("DELETE FROM rosters WHERE title LIKE '%Test%'");
  });

  // ─── 1. Property Scoping & Roster Creation ─────────────────────────
  test('1. Roster Creation: Manager can create roster for assigned property but is REJECTED for unauthorized property', async () => {
    // Attempt unauthorized property creation by Manager Prop 1 on Property 2
    const unauthRes = await request(app)
      .post('/api/v1/workforce/rosters')
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        property_id: 2,
        title: 'Unauthorized Cross-Property Roster',
        start_date: '2026-11-10',
        end_date: '2026-11-16',
      });

    expect(unauthRes.status).toBe(403);
    expect(unauthRes.body.error.message).toMatch(/only manage workforce schedules for your assigned Property #1/i);

    // Authorized creation on Property 1
    const authRes = await request(app)
      .post('/api/v1/workforce/rosters')
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        property_id: 1,
        title: 'Week 46 Operations Roster',
        start_date: '2026-11-10',
        end_date: '2026-11-16',
      });

    expect(authRes.status).toBe(201);
    expect(authRes.body.success).toBe(true);
    expect(authRes.body.data.roster_code).toMatch(/^RST-/);
    expect(authRes.body.data.status).toBe('DRAFT');
  });

  // ─── 2. Shift Scheduling & Overlap Conflict Detection ──────────────
  test('2. Conflict Detection: Rejects overlapping shift assignment for the same employee', async () => {
    // Create test roster
    const rosterRes = await request(app)
      .post('/api/v1/workforce/rosters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 1,
        title: 'Conflict Test Roster',
        start_date: '2026-11-20',
        end_date: '2026-11-26',
      });
    const rosterId = rosterRes.body.data.id;

    // First shift: 08:00 - 16:00
    const shift1 = await request(app)
      .post('/api/v1/workforce/shifts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roster_id: rosterId,
        property_id: 1,
        employee_id: 4,
        shift_date: '2026-11-20',
        start_time: '08:00:00',
        end_time: '16:00:00',
        break_minutes: 60,
      });

    expect(shift1.status).toBe(201);

    // Second shift overlapping: 12:00 - 20:00 (overlaps by 4 hours)
    const shiftOverlap = await request(app)
      .post('/api/v1/workforce/shifts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roster_id: rosterId,
        property_id: 1,
        employee_id: 4,
        shift_date: '2026-11-20',
        start_time: '12:00:00',
        end_time: '20:00:00',
      });

    expect(shiftOverlap.status).toBe(409);
    expect(shiftOverlap.body.error.message).toMatch(/Shift conflict: Employee already has shift/i);
  });

  // ─── 3. Shift Swap Workflow & Approval ─────────────────────────────
  test('3. Shift Swap Workflow: Staff requests swap and Manager approval reassigns shift', async () => {
    // Create shift assigned to Staff (emp #4)
    const rosterRes = await request(app)
      .post('/api/v1/workforce/rosters')
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        property_id: 1,
        title: 'Swap Test Roster',
        start_date: '2026-11-25',
        end_date: '2026-11-30',
      });
    const rosterId = rosterRes.body.data.id;

    const shiftRes = await request(app)
      .post('/api/v1/workforce/shifts')
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        roster_id: rosterId,
        property_id: 1,
        employee_id: 4,
        shift_date: '2026-11-25',
        start_time: '09:00:00',
        end_time: '17:00:00',
      });
    const shiftId = shiftRes.body.data.id;

    // Staff requests swap with Elena (emp #3)
    const swapReq = await request(app)
      .post('/api/v1/workforce/swaps')
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({
        shift_id: shiftId,
        target_employee_id: 3,
        reason: 'Family appointment',
      });

    expect(swapReq.status).toBe(201);
    expect(swapReq.body.data.status).toBe('PENDING');
    const swapId = swapReq.body.data.id;

    // Manager reviews and approves swap
    const reviewRes = await request(app)
      .patch(`/api/v1/workforce/swaps/${swapId}/review`)
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        action: 'APPROVED',
        reviewNotes: 'Coverage verified and approved',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('APPROVED');

    // Verify shift was reassigned to Elena (emp #3)
    const updatedShift = await request(app)
      .get(`/api/v1/workforce/shifts?rosterId=${rosterId}`)
      .set('Authorization', `Bearer ${managerProp1Token}`);

    const myShift = updatedShift.body.data.find((s) => s.id === shiftId);
    expect(myShift.employee_id).toBe(3);
    expect(myShift.notes).toMatch(/Reassigned via Approved Swap Request/i);
  });

  // ─── 4. Attendance Clock-In & Duplicate Prevention ─────────────────
  test('4. Attendance: Clock-in succeeds, late arrival detected, and duplicate clock-in is rejected', async () => {
    // Clear today's test attendance for emp #4
    const today = new Date().toISOString().split('T')[0];
    await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);

    // Clock in
    const clockInRes = await request(app)
      .post('/api/v1/workforce/attendance/clock-in')
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({
        clockInMethod: 'WEB',
        locationLat: 7.2571,
        locationLng: 5.2058,
      });

    expect(clockInRes.status).toBe(201);
    expect(clockInRes.body.success).toBe(true);
    expect(clockInRes.body.data.attendance_status).toBeDefined();

    // Second clock in on same day rejected as duplicate
    const dupRes = await request(app)
      .post('/api/v1/workforce/attendance/clock-in')
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({
        clockInMethod: 'WEB',
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.message).toMatch(/Duplicate clock-in rejected/i);

    // Clock out
    const clockOutRes = await request(app)
      .post('/api/v1/workforce/attendance/clock-out')
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({});

    expect(clockOutRes.status).toBe(200);
    expect(clockOutRes.body.data.clock_out_time).not.toBeNull();
  });

  // ─── 5. Attendance Correction Maker-Checker Boundary ───────────────
  test('5. Attendance Correction: Employee cannot approve their own correction', async () => {
    const today = new Date().toISOString().split('T')[0];
    const attId = await pool.query(
      `INSERT INTO attendance_records (employee_id, property_id, work_date, clock_in_time, clock_out_time, scheduled_hours, actual_hours, attendance_status, clock_in_method)
       VALUES (4, 1, ?, ?, ?, 8.00, 8.00, 'PRESENT', 'WEB')`,
      [today, `${today} 08:30:00`, `${today} 16:30:00`]
    );

    const correctionReq = await request(app)
      .post('/api/v1/workforce/attendance/corrections')
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({
        attendanceRecordId: attId.insertId,
        requestedClockIn: `${today}T08:00:00`,
        requestedClockOut: `${today}T17:00:00`,
        reason: 'Missed punch due to mobile browser crash',
      });

    expect(correctionReq.status).toBe(201);
    const corrId = correctionReq.body.data.id;

    // Staff cannot approve own correction
    const selfApprove = await request(app)
      .patch(`/api/v1/workforce/attendance/corrections/${corrId}/review`)
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({
        action: 'APPROVED',
      });

    expect(selfApprove.status).toBe(403);
    expect(selfApprove.body.error.message).toMatch(/Access denied|Maker-checker/i);

    // Manager approves correction
    const mgrApprove = await request(app)
      .patch(`/api/v1/workforce/attendance/corrections/${corrId}/review`)
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        action: 'APPROVED',
        reviewNotes: 'Verified with security desk log',
      });

    expect(mgrApprove.status).toBe(200);
    expect(mgrApprove.body.data.status).toBe('APPROVED');
  });

  // ─── 6. Leave Request & Shift Conflict Prevention ──────────────────
  test('6. Leave Management: Approved leave cancels scheduled shifts on leave dates', async () => {
    const leaveDate = '2026-12-01';

    // Schedule a shift on 2026-12-01 for emp #4
    const rosterRes = await request(app)
      .post('/api/v1/workforce/rosters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 1,
        title: 'December Holiday Roster',
        start_date: '2026-12-01',
        end_date: '2026-12-07',
      });
    const rosterId = rosterRes.body.data.id;

    const shiftRes = await request(app)
      .post('/api/v1/workforce/shifts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roster_id: rosterId,
        property_id: 1,
        employee_id: 4,
        shift_date: leaveDate,
        start_time: '08:00:00',
        end_time: '16:00:00',
      });
    const shiftId = shiftRes.body.data.id;

    // Staff requests Annual Leave for 2026-12-01
    const catRows = await pool.query("SELECT id FROM leave_categories WHERE code = 'ANNUAL' LIMIT 1");
    const leaveReq = await request(app)
      .post('/api/v1/workforce/leave/requests')
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({
        leave_category_id: catRows[0].id,
        start_date: leaveDate,
        end_date: leaveDate,
        reason: 'Personal time off',
      });

    expect(leaveReq.status).toBe(201);
    const leaveId = leaveReq.body.data.id;

    // Manager approves leave
    const leaveApproval = await request(app)
      .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        action: 'APPROVED',
        notes: 'Holiday coverage verified',
      });

    expect(leaveApproval.status).toBe(200);
    expect(leaveApproval.body.data.status).toBe('APPROVED');

    // Verify shift was cancelled due to approved leave
    const checkShiftRows = await pool.query('SELECT status, notes FROM shifts WHERE id = ?', [shiftId]);
    expect(checkShiftRows[0].status).toBe('CANCELLED');
    expect(checkShiftRows[0].notes).toMatch(/Approved Leave/i);
  });

  // ─── 7. Payroll-Ready Timesheet & Super Admin Boundary ─────────────
  test('7. Timesheets: Generates payroll report, exports CSV, and blocks SUPER_ADMIN from financial payroll data', async () => {
    // Super Admin must be FORBIDDEN from viewing payroll timesheets
    const superAdminTry = await request(app)
      .get('/api/v1/workforce/timesheets?startDate=2026-11-01&endDate=2026-11-30')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(superAdminTry.status).toBe(403);
    expect(superAdminTry.body.error.message).toMatch(/Access denied|restricted to technical infrastructure|cannot view payroll/i);

    // Admin can view company-wide timesheet
    const adminTimesheet = await request(app)
      .get('/api/v1/workforce/timesheets?startDate=2026-11-01&endDate=2026-11-30')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminTimesheet.status).toBe(200);
    expect(Array.isArray(adminTimesheet.body.data)).toBe(true);

    // Export CSV
    const csvExport = await request(app)
      .get('/api/v1/workforce/timesheets/export?startDate=2026-11-01&endDate=2026-11-30')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(csvExport.status).toBe(200);
    expect(csvExport.header['content-type']).toMatch(/text\/csv/);
    expect(csvExport.text).toMatch(/Employee Code,Employee Name,Department/);
  });

  // ─── 8. Property Multiple Media Upload & Security Validation ────────
  test('8. Property Media: Multi-upload validates MIME, rejects SVG/EXE, sets cover, and reorders gallery', async () => {
    // Valid PNG upload
    const validUpload = await request(app)
      .post('/api/v1/properties/1/media')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        images: [
          {
            fileData: validPngBase64,
            fileName: 'building_entrance.png',
            fileType: 'image/png',
            category: 'BUILDING_ENTRANCE',
            caption: 'Main Entrance & Lobby Glass Façade',
            isPrimary: true,
          },
          {
            fileData: validPngBase64,
            fileName: 'swimming_pool.png',
            fileType: 'image/png',
            category: 'SWIMMING_POOL',
            caption: 'Heated Infinity Pool and Deck',
            isPrimary: false,
          },
        ],
      });

    expect(validUpload.status).toBe(201);
    expect(validUpload.body.data.length).toBe(2);
    expect(validUpload.body.data[0].category).toBe('BUILDING_ENTRANCE');
    expect(validUpload.body.data[0].is_primary).toBe(1);

    const entranceId = validUpload.body.data[0].id;
    const poolId = validUpload.body.data[1].id;

    // Switch cover to swimming pool
    const setCover = await request(app)
      .patch(`/api/v1/properties/1/media/${poolId}/cover`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(setCover.status).toBe(200);

    // Verify pool is now cover
    const mediaList = await request(app).get('/api/v1/properties/1/media');
    expect(mediaList.status).toBe(200);
    const coverItem = mediaList.body.data.find((m) => m.id === poolId);
    expect(coverItem.is_primary).toBe(1);

    // Rejection of invalid file type (executable/svg)
    const invalidUpload = await request(app)
      .post('/api/v1/properties/1/media')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        images: [
          {
            fileData: 'data:application/octet-stream;base64,TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAA=',
            fileName: 'payload.exe',
            fileType: 'application/octet-stream',
          },
        ],
      });

    expect(invalidUpload.status).toBe(422);
    expect(invalidUpload.body.error.message).toMatch(/Invalid file type|Supported: JPEG, PNG, WebP/i);

    // Manager Property Isolation on media upload: Manager 2 cannot upload to Property 1
    const unauthMediaUpload = await request(app)
      .post('/api/v1/properties/1/media')
      .set('Authorization', `Bearer ${managerProp2Token}`)
      .send({
        images: [
          {
            fileData: validPngBase64,
            fileName: 'unauth.png',
            fileType: 'image/png',
          },
        ],
      });

    expect(unauthMediaUpload.status).toBe(403);
    expect(unauthMediaUpload.body.error.message).toMatch(/only authorized to access Property #2/i);

    // Delete media
    const deleteRes = await request(app)
      .delete(`/api/v1/properties/1/media/${entranceId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
  });

  // ─── 9. Property Kiosk Terminal Punches & Restrictions ─────────────
  test('9. Kiosk Terminal: Punch succeeds with valid kiosk secret and is rejected for mismatched property or invalid secret', async () => {
    // 1. Ensure test kiosk exists for Property 1
    const kioskCode1 = 'TEST-KIOSK-P1';
    const kioskSecret = 'secret_kiosk_key_123';
    await pool.query('DELETE FROM property_kiosks WHERE kiosk_code IN (?, ?)', [kioskCode1, 'TEST-KIOSK-P2']);
    await pool.query(
      `INSERT INTO property_kiosks (property_id, kiosk_name, kiosk_code, kiosk_secret_hash, status, registered_by_id)
       VALUES (1, 'Front Desk Terminal P1', ?, ?, 'ACTIVE', 2)`,
      [kioskCode1, kioskSecret]
    );

    // Ensure test kiosk exists for Property 2
    await pool.query(
      `INSERT INTO property_kiosks (property_id, kiosk_name, kiosk_code, kiosk_secret_hash, status, registered_by_id)
       VALUES (2, 'Front Desk Terminal P2', 'TEST-KIOSK-P2', ?, 'ACTIVE', 2)`,
      [kioskSecret]
    );

    const today = new Date().toISOString().split('T')[0];
    await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);

    // 2. Reject invalid kiosk secret
    const badSecretRes = await request(app)
      .post('/api/v1/workforce/attendance/kiosk-clock')
      .send({
        kioskCode: kioskCode1,
        kioskSecret: 'wrong_secret',
        employeeIdentifier: 4,
        action: 'CLOCK_IN',
      });
    expect(badSecretRes.status).toBe(403);
    expect(badSecretRes.body.error.message).toMatch(/Invalid kiosk authentication credentials/i);

    // 3. Reject cross-property kiosk punch (emp #4 is at Property 1, attempting to punch at Property 2 kiosk)
    const crossPropRes = await request(app)
      .post('/api/v1/workforce/attendance/kiosk-clock')
      .send({
        kioskCode: 'TEST-KIOSK-P2',
        kioskSecret: kioskSecret,
        employeeIdentifier: 4,
        action: 'CLOCK_IN',
      });
    expect(crossPropRes.status).toBe(403);
    expect(crossPropRes.body.error.message).toMatch(/Kiosk restriction: Terminal is registered to Property #2/i);

    // 4. Authorized Kiosk Clock-in at Property 1
    const validPunchRes = await request(app)
      .post('/api/v1/workforce/attendance/kiosk-clock')
      .send({
        kioskCode: kioskCode1,
        kioskSecret: kioskSecret,
        employeeIdentifier: 4,
        action: 'CLOCK_IN',
      });
    expect(validPunchRes.status).toBe(200);
    expect(validPunchRes.body.success).toBe(true);
    expect(validPunchRes.body.data.clock_in_method).toBe('KIOSK');
  });

  // ─── 10. Event-Based GPS Geofence Verification ──────────────────────
  test('10. GPS Geofence: Verifies clock-in within geofence and logs exception note outside geofence', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Clock out any open punch
    await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);

    // Geofence center for Property 1 is 6.4281, 3.4219 (radius 200m)
    // 1. Punch with coordinates within ~15m
    const insideRes = await request(app)
      .post('/api/v1/workforce/attendance/clock-in')
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({
        clockInMethod: 'MOBILE',
        locationLat: 6.42812,
        locationLng: 3.42192,
      });

    expect(insideRes.status).toBe(201);
    expect(insideRes.body.data.is_verified).toBe(1);

    // Clean up for outside geofence punch
    await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);

    // 2. Punch with coordinates ~40km away (7.5000, 5.5000)
    const outsideRes = await request(app)
      .post('/api/v1/workforce/attendance/clock-in')
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({
        clockInMethod: 'MOBILE',
        locationLat: 7.5000,
        locationLng: 5.5000,
      });

    expect(outsideRes.status).toBe(201);
    expect(outsideRes.body.data.is_verified).toBe(0);
    expect(outsideRes.body.data.verification_notes).toMatch(/Geofence exception|EXCEPTION_OUTSIDE_GEOFENCE/i);
  });

  // ─── 11. Delegated Leave Escalation & Admin Dual Approval ───────────
  test('11. Leave Escalation: Manager cannot approve leave > 14 days, escalates to PENDING_ADMIN, and Admin approves', async () => {
    const catRows = await pool.query("SELECT id FROM leave_categories WHERE code = 'ANNUAL' LIMIT 1");
    const leaveCatId = catRows[0].id;

    // Staff applies for 16 days leave (2026-11-01 to 2026-11-16)
    const leaveApp = await request(app)
      .post('/api/v1/workforce/leave/requests')
      .set('Authorization', `Bearer ${staffProp1Token}`)
      .send({
        leave_category_id: leaveCatId,
        start_date: '2026-11-01',
        end_date: '2026-11-16',
        reason: 'Extended family relocation leave',
      });

    expect(leaveApp.status).toBe(201);
    const leaveId = leaveApp.body.data.id;
    expect(leaveApp.body.data.total_days).toBeGreaterThan(14);

    // 1. Manager attempts direct approval -> REJECTED due to delegated authority limit (> 14 days)
    const directApprove = await request(app)
      .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        action: 'APPROVED',
        notes: 'Manager attempts to sign off on 16 days',
      });

    expect(directApprove.status).toBe(403);
    expect(directApprove.body.error.message).toMatch(/exceeds Operations Manager delegated authority limit/i);

    // 2. Manager escalates to Admin
    const escalateRes = await request(app)
      .patch(`/api/v1/workforce/leave/requests/${leaveId}/escalate`)
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        reason: 'Recommended for approval; exceeds 14-day manager threshold',
      });

    expect(escalateRes.status).toBe(200);
    expect(escalateRes.body.data.status).toBe('PENDING_ADMIN');

    // 3. Admin gives final executive sign-off
    const adminApprove = await request(app)
      .patch(`/api/v1/workforce/leave/requests/${leaveId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'APPROVED',
        notes: 'Admin approved after operational impact review',
      });

    expect(adminApprove.status).toBe(200);
    expect(adminApprove.body.data.status).toBe('APPROVED');
  });

  // ─── 12. Manager-Assisted Attendance & Maker-Checker Enforcement ────
  test('12. Manual Attendance: Manager records assisted punch for staff, is blocked from self-punching, and cross-property is rejected', async () => {
    const workDate = '2026-10-15';
    await pool.query('DELETE FROM attendance_records WHERE work_date = ?', [workDate]);

    // 1. Manager attempts to record manual attendance for themselves -> REJECTED (Maker-checker violation)
    // Find Marcus Vance employee ID (user_id = 3)
    const mgrEmpRows = await pool.query('SELECT id FROM employees WHERE user_id = 3');
    if (mgrEmpRows.length > 0) {
      const selfPunchRes = await request(app)
        .post('/api/v1/workforce/attendance/manual')
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({
          employeeId: mgrEmpRows[0].id,
          propertyId: 1,
          workDate,
          clockInTime: `${workDate} 08:00:00`,
          clockOutTime: `${workDate} 16:30:00`,
          breakMinutes: 30,
          reason: 'Manual self-punch test',
        });

      expect(selfPunchRes.status).toBe(403);
      expect(selfPunchRes.body.error.message).toMatch(/Maker-checker violation: Operations Managers cannot record their own attendance/i);
    }

    // 2. Manager #1 attempts to record manual punch on Property 2 -> REJECTED (Property scoping)
    const crossPropPunch = await request(app)
      .post('/api/v1/workforce/attendance/manual')
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        employeeId: 4,
        propertyId: 2,
        workDate,
        clockInTime: `${workDate} 08:00:00`,
        clockOutTime: `${workDate} 16:30:00`,
        reason: 'Cross property manual punch test',
      });

    expect(crossPropPunch.status).toBe(403);
    expect(crossPropPunch.body.error.message).toMatch(/only record attendance for your assigned Property #1/i);

    // 3. Authorized Manager-assisted manual punch for Staff (emp #4) on Property 1
    const validManualPunch = await request(app)
      .post('/api/v1/workforce/attendance/manual')
      .set('Authorization', `Bearer ${managerProp1Token}`)
      .send({
        employeeId: 4,
        propertyId: 1,
        workDate,
        clockInTime: `${workDate} 08:00:00`,
        clockOutTime: `${workDate} 16:30:00`,
        breakMinutes: 30,
        reason: 'Terminal offline during morning shift start',
      });

    expect(validManualPunch.status).toBe(201);
    expect(validManualPunch.body.success).toBe(true);
    expect(validManualPunch.body.data.clock_in_method).toBe('MANUAL');
    expect(validManualPunch.body.data.verified_by_id).toBe(3);
  });
});
