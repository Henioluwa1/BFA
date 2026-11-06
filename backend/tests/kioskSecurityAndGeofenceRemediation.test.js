const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const bcrypt = require('bcryptjs');

describe('Workspace C: DEF-C03 (Kiosk Security) & DEF-C02 (Geofence Review)', () => {
  let adminToken;
  let managerProp1Token;
  let managerProp2Token;
  let staffProp1Token;

  const today = new Date().toISOString().split('T')[0];

  beforeAll(async () => {
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

    // Setup employee 4 (linked to user 5) at property 1
    await pool.query('UPDATE employees SET property_id = 1 WHERE id = 4');
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PART 1: DEF-C03 — KIOSK CREDENTIAL SECURITY & ROTATION
  // ═════════════════════════════════════════════════════════════════════════
  describe('DEF-C03: Kiosk Credential Security', () => {
    const testKioskCode = `KIOSK-SEC-TEST-${Date.now().toString().slice(-4)}`;
    let createdKioskId;
    let provisionedSecret;

    test('1. New Kiosk Registration: Generates bcrypt hash and returns raw secret once', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/kiosks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          property_id: 1,
          kiosk_name: 'Secure Perimeter Terminal',
          kiosk_code: testKioskCode,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.kiosk_code).toBe(testKioskCode);
      expect(res.body.data.kiosk_secret).toBeDefined();
      expect(typeof res.body.data.kiosk_secret).toBe('string');
      // Hash must NEVER be exposed in registration response
      expect(res.body.data.kiosk_secret_hash).toBeUndefined();

      createdKioskId = res.body.data.id;
      provisionedSecret = res.body.data.kiosk_secret;
    });

    test('2. Database Credential Hashing: Stored secret is a valid bcrypt hash, never plaintext', async () => {
      const rows = await pool.query('SELECT kiosk_secret_hash FROM property_kiosks WHERE id = ?', [createdKioskId]);
      expect(rows.length).toBe(1);
      const storedHash = rows[0].kiosk_secret_hash;

      // Must be a bcrypt hash (starts with $2a$, $2b$, or $2y$)
      expect(storedHash).toMatch(/^\$2[aby]\$\d+\$/);
      // Must not equal the raw plaintext secret
      expect(storedHash).not.toBe(provisionedSecret);

      // Verify bcrypt match
      const isMatch = await bcrypt.compare(provisionedSecret, storedHash);
      expect(isMatch).toBe(true);
    });

    test('3. Successful Authentication: Kiosk punch succeeds with correct secret', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/attendance/kiosk-clock')
        .send({
          kioskCode: testKioskCode,
          kioskSecret: provisionedSecret,
          employeeIdentifier: 4,
          action: 'CLOCK_IN',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.clock_in_method).toBe('KIOSK');
      expect(res.body.data.is_verified).toBe(1);
    });

    test('4. Failed Authentication: Rejects incorrect secret with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/attendance/kiosk-clock')
        .send({
          kioskCode: testKioskCode,
          kioskSecret: 'Wrong-Secret-12345',
          employeeIdentifier: 4,
          action: 'CLOCK_IN',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Invalid kiosk authentication credentials/i);
    });

    test('5. Listing Endpoint Excludes Hash: GET /workforce/kiosks never returns kiosk_secret_hash', async () => {
      const res = await request(app)
        .get('/api/v1/workforce/kiosks')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);

      // Verify every returned kiosk record has NO kiosk_secret_hash
      for (const k of res.body.data) {
        expect(k.kiosk_secret_hash).toBeUndefined();
        expect(k.kiosk_secret).toBeUndefined();
      }
    });

    test('6. Status & Lookup Endpoints Exclude Credential Fields', async () => {
      const res = await request(app)
        .patch(`/api/v1/workforce/kiosks/${createdKioskId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('INACTIVE');
      expect(res.body.data.kiosk_secret_hash).toBeUndefined();
      expect(res.body.data.kiosk_secret).toBeUndefined();
    });

    test('7. Inactive / Revoked Kiosk: Authentication is immediately rejected', async () => {
      // Terminal is currently INACTIVE from previous test
      const res = await request(app)
        .post('/api/v1/workforce/attendance/kiosk-clock')
        .send({
          kioskCode: testKioskCode,
          kioskSecret: provisionedSecret,
          employeeIdentifier: 4,
          action: 'CLOCK_IN',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Unauthorized or inactive kiosk terminal/i);

      // Reactivate for rotation test
      await request(app)
        .patch(`/api/v1/workforce/kiosks/${createdKioskId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' });
    });

    test('8. Cross-Property Access Denied: Reject punch if employee property does not match kiosk property', async () => {
      // Temporarily assign employee 4 to property 2
      await pool.query('UPDATE employees SET property_id = 2 WHERE id = 4');

      const res = await request(app)
        .post('/api/v1/workforce/attendance/kiosk-clock')
        .send({
          kioskCode: testKioskCode, // Kiosk is Property 1
          kioskSecret: provisionedSecret,
          employeeIdentifier: 4,
          action: 'CLOCK_IN',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Kiosk restriction/i);

      // Restore employee 4 to property 1
      await pool.query('UPDATE employees SET property_id = 1 WHERE id = 4');
    });

    test('9. Unauthorized Registration Denied: Non-admin (STAFF) cannot register kiosks', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/kiosks')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          property_id: 1,
          kiosk_name: 'Illegal Terminal',
          kiosk_code: 'BAD-CODE-01',
        });

      expect(res.status).toBe(403);
    });

    test('10. Secure Credential Rotation: POST /kiosks/:id/rotate-secret rotates secret safely', async () => {
      const res = await request(app)
        .post(`/api/v1/workforce/kiosks/${createdKioskId}/rotate-secret`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newSecret: 'New-Rotated-Secret-2026!' });

      expect(res.status).toBe(200);
      expect(res.body.data.kiosk_secret).toBe('New-Rotated-Secret-2026!');
      expect(res.body.data.kiosk_secret_hash).toBeUndefined();

      // Old secret must no longer authenticate
      const oldAuthRes = await request(app)
        .post('/api/v1/workforce/attendance/kiosk-clock')
        .send({
          kioskCode: testKioskCode,
          kioskSecret: provisionedSecret,
          employeeIdentifier: 4,
          action: 'CLOCK_IN',
        });
      expect(oldAuthRes.status).toBe(403);

      // New secret must authenticate successfully
      await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);
      const newAuthRes = await request(app)
        .post('/api/v1/workforce/attendance/kiosk-clock')
        .send({
          kioskCode: testKioskCode,
          kioskSecret: 'New-Rotated-Secret-2026!',
          employeeIdentifier: 4,
          action: 'CLOCK_IN',
        });
      expect(newAuthRes.status).toBe(200);
      expect(newAuthRes.body.data.is_verified).toBe(1);
    });

    test('11. Legacy Plaintext Kiosk Auto-Upgrade on Auth', async () => {
      const legacyCode = `LEGACY-KIOSK-${Date.now().toString().slice(-4)}`;
      const legacySecret = 'raw_plaintext_pass_123';

      // Insert legacy kiosk with plaintext secret in database
      const insertRes = await pool.query(
        `INSERT INTO property_kiosks (property_id, kiosk_name, kiosk_code, kiosk_secret_hash, status, registered_by_id)
         VALUES (1, 'Legacy Desk Terminal', ?, ?, 'ACTIVE', 2)`,
        [legacyCode, legacySecret]
      );
      const legacyId = insertRes.insertId;

      await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);

      // Punch with legacy secret
      const punchRes = await request(app)
        .post('/api/v1/workforce/attendance/kiosk-clock')
        .send({
          kioskCode: legacyCode,
          kioskSecret: legacySecret,
          employeeIdentifier: 4,
          action: 'CLOCK_IN',
        });

      expect(punchRes.status).toBe(200);

      // Inspect DB: Must now be upgraded to bcrypt hash!
      const rows = await pool.query('SELECT kiosk_secret_hash FROM property_kiosks WHERE id = ?', [legacyId]);
      expect(rows[0].kiosk_secret_hash).toMatch(/^\$2[aby]\$\d+\$/);
      expect(rows[0].kiosk_secret_hash).not.toBe(legacySecret);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PART 2: DEF-C02 — GEOFENCE ENFORCEMENT (OPTION A: FLAG FOR REVIEW)
  // ═════════════════════════════════════════════════════════════════════════
  describe('DEF-C02: Geofence Enforcement Semantics (Option A)', () => {
    test('1. On-time punch inside geofence: is_verified = 1, status = PRESENT', async () => {
      const res = await request(app)
        .post('/api/v1/workforce/attendance/clock-in')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          clockInMethod: 'MOBILE_LOCATION',
          locationLat: 6.42812, // Within 15m of Property 1 (6.4281, 3.4219)
          locationLng: 3.42192,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.is_verified).toBe(1);
      expect(res.body.data.attendance_status).toBe('PRESENT');
      expect(res.body.data.verification_notes).toMatch(/GPS_VERIFIED/i);
    });

    test('2. On-time punch outside geofence: is_verified = 0, status = PRESENT (NOT LATE), flagged for review', async () => {
      await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);

      const res = await request(app)
        .post('/api/v1/workforce/attendance/clock-in')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          clockInMethod: 'MOBILE_LOCATION',
          locationLat: 6.60000, // ~25km away from property
          locationLng: 3.35000,
        });

      expect(res.status).toBe(201);
      // Location verification failed
      expect(res.body.data.is_verified).toBe(0);
      // CRITICAL: Punctuality is separate; on-time punch is PRESENT, NOT LATE!
      expect(res.body.data.attendance_status).toBe('PRESENT');
      // Exception note indicates distance and review flag
      expect(res.body.data.verification_notes).toMatch(/EXCEPTION_OUTSIDE_GEOFENCE/i);
      expect(res.body.data.verification_notes).toMatch(/FLAGGED_FOR_REVIEW/i);
    });

    test('3. Missing GPS coordinates when required: is_verified = 0, status = PRESENT, flagged for review', async () => {
      await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);

      const res = await request(app)
        .post('/api/v1/workforce/attendance/clock-in')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          clockInMethod: 'MOBILE_LOCATION',
          locationLat: null,
          locationLng: null,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.is_verified).toBe(0);
      expect(res.body.data.attendance_status).toBe('PRESENT');
      expect(res.body.data.verification_notes).toMatch(/EXCEPTION_GPS_UNAVAILABLE/i);
    });

    test('4. Review & Resolution Workflow: Manager verifies an unverified attendance record', async () => {
      await pool.query('DELETE FROM attendance_records WHERE employee_id = 4 AND work_date = ?', [today]);

      // 1. Clock in outside geofence
      const punchRes = await request(app)
        .post('/api/v1/workforce/attendance/clock-in')
        .set('Authorization', `Bearer ${staffProp1Token}`)
        .send({
          clockInMethod: 'MOBILE_LOCATION',
          locationLat: 6.60000,
          locationLng: 3.35000,
        });
      const recordId = punchRes.body.data.id;
      expect(punchRes.body.data.is_verified).toBe(0);

      // 2. Manager reviews and verifies the exception
      const verifyRes = await request(app)
        .patch(`/api/v1/workforce/attendance/${recordId}/verify`)
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({
          action: 'VERIFY',
          reviewNotes: 'Employee was attending off-site client property viewing at Lekki Phase 1',
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.is_verified).toBe(1);
      expect(verifyRes.body.data.verification_notes).toMatch(/GEOFENCE_EXCEPTION_VERIFIED/i);
      expect(verifyRes.body.data.verification_notes).toMatch(/off-site client property viewing/i);
    });

    test('5. Maker-Checker Enforcement on Review: Manager cannot verify their own punch record', async () => {
      // Marcus Vance (user 3, employee id 2 in seed data)
      // Attempting to verify employee 2's punch
      // Create test unverified punch for employee 2
      const insertRes = await pool.query(
        `INSERT INTO attendance_records (employee_id, property_id, work_date, clock_in_time, clock_in_method, is_verified, attendance_status, verification_notes)
         VALUES (2, 1, ?, NOW(), 'MOBILE_LOCATION', 0, 'PRESENT', 'EXCEPTION_OUTSIDE_GEOFENCE: Distance 500m (FLAGGED_FOR_REVIEW)')`,
        [today]
      );
      const managerPunchId = insertRes.insertId;

      const selfVerifyRes = await request(app)
        .patch(`/api/v1/workforce/attendance/${managerPunchId}/verify`)
        .set('Authorization', `Bearer ${managerProp1Token}`) // user id 3 is linked to employee id 2
        .send({ action: 'VERIFY', reviewNotes: 'Self approval attempt' });

      expect(selfVerifyRes.status).toBe(403);
      expect(selfVerifyRes.body.error.message).toMatch(/Maker-checker policy violation/i);

      // Clean up test record
      await pool.query('DELETE FROM attendance_records WHERE id = ?', [managerPunchId]);
    });

    test('6. Cross-Property Isolation on Review: Operations Manager cannot review punch of another property', async () => {
      // Create punch for Property 2
      const insertRes = await pool.query(
        `INSERT INTO attendance_records (employee_id, property_id, work_date, clock_in_time, clock_in_method, is_verified, attendance_status, verification_notes)
         VALUES (4, 2, ?, NOW(), 'MOBILE_LOCATION', 0, 'PRESENT', 'EXCEPTION_OUTSIDE_GEOFENCE')`,
        [today]
      );
      const prop2PunchId = insertRes.insertId;

      // Manager of Property 1 attempts review
      const crossRes = await request(app)
        .patch(`/api/v1/workforce/attendance/${prop2PunchId}/verify`)
        .set('Authorization', `Bearer ${managerProp1Token}`)
        .send({ action: 'VERIFY', reviewNotes: 'Cross property attempt' });

      expect(crossRes.status).toBe(403);
      expect(crossRes.body.error.message).toMatch(/You can only review attendance records for your assigned Property/i);

      // Clean up test record
      await pool.query('DELETE FROM attendance_records WHERE id = ?', [prop2PunchId]);
    });
  });
});
