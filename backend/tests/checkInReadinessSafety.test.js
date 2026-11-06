/**
 * BFA Stage 2.6A: Atomic Check-In & Reservation/Maintenance Concurrency Hardening Test Suite
 * 
 * Verifies:
 *  - TC-01: Baseline Check-in with positive 5-part invariant (AVAILABLE & READY)
 *  - TC-02..04: Housekeeping status guards (DIRTY, CLEANING_IN_PROGRESS, CLEANED)
 *  - TC-05..08: Maintenance status guards & CRITICAL ticket blocking (with blocking_unit = 0)
 *  - TC-09..10: Occupancy allowlist and fail-closed guards (OCCUPIED, MAINTENANCE, BLOCKED)
 *  - TC-11..13: Reservation lifecycle status guards (PENDING, CLAIMED, CHECKED_IN, CANCELLED)
 *  - TC-14: Concurrency Scenario G: Double check-in race on one reservation
 *  - TC-15: Concurrency Scenario H: Two reservations competing for one unit
 *  - TC-16: Concurrency Scenario A/B: Blocking maintenance creation vs check-in
 *  - TC-17: Concurrency Scenario D: Bidirectional apartment transfers (Ascending-ID lock order)
 *  - TC-18: Concurrency Scenario F: Maintenance resolution vs check-in (Turnover safety)
 * 
 * Target Database: bfa_apartments_test_db
 */

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const { assertTestDatabase } = require('../src/db/databaseGuard');
const ReservationsService = require('../src/modules/reservations/reservations.service');
const ReservationsRepository = require('../src/modules/reservations/reservations.repository');
const MaintenanceService = require('../src/modules/maintenance/maintenance.service');
const MaintenanceRepository = require('../src/modules/maintenance/maintenance.repository');

const getMsg = (res) => (res && res.body ? (res.body.error?.message || res.body.message || '') : '');

describe('Stage 2.6A: Atomic Check-In & Concurrency Hardening Suite', () => {
  let receptionistToken = '';
  let receptionistUser = null;
  let adminToken = '';
  let adminUser = null;

  let unitA = null;
  let unitB = null;
  const createdReservationIds = [];
  const createdMaintenanceIds = [];

  const cleanupDb = async () => {
    if (createdMaintenanceIds.length > 0) {
      await pool.query('DELETE FROM maintenance_requests WHERE id IN (?)', [createdMaintenanceIds]);
      createdMaintenanceIds.length = 0;
    }
    if (createdReservationIds.length > 0) {
      await pool.query('DELETE FROM reservation_staff_assignments WHERE reservation_id IN (?)', [createdReservationIds]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id IN (?)', [createdReservationIds]);
      await pool.query('DELETE FROM operational_evidence_attachments WHERE reservation_id IN (?)', [createdReservationIds]);
      await pool.query('DELETE FROM payment_receipts WHERE reservation_id IN (?)', [createdReservationIds]);
      await pool.query('DELETE FROM booking_authentications WHERE reservation_id IN (?)', [createdReservationIds]);
      await pool.query('DELETE FROM audit_logs WHERE entity_type = "reservation" AND entity_id IN (?)', [createdReservationIds.map(String)]);
      await pool.query('DELETE FROM reservations WHERE id IN (?)', [createdReservationIds]);
      createdReservationIds.length = 0;
    }
  };

  const createTestReservation = async ({
    apartmentId,
    propertyId = 1,
    status = 'CONFIRMED',
    checkInDate = '2028-10-01',
    checkOutDate = '2028-10-02',
    tenantName = 'Test Guest',
    tenantEmail = 'test.guest@bfa.com',
  }) => {
    const code = `TEST-RES-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const result = await pool.query(
      `INSERT INTO reservations (
        reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone,
        check_in_date, check_out_date, status, payment_status, total_amount, paid_amount,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, '+2348011112222', ?, ?, ?, 'VERIFIED', 150000.00, 150000.00, NOW(), NOW())`,
      [code, propertyId, apartmentId, tenantName, tenantEmail, checkInDate, checkOutDate, status]
    );
    const id = result.insertId;
    createdReservationIds.push(id);
    return { id, code };
  };

  beforeAll(async () => {
    assertTestDatabase(process.env.DB_NAME || 'bfa_apartments_test_db', 'CheckInReadinessSafety Tests');

    // 1. Authenticate Receptionist
    const recRes = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = recRes.body.data?.token;
    receptionistUser = recRes.body.data?.user;

    // 2. Authenticate Admin
    const admRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = admRes.body.data?.token;
    adminUser = admRes.body.data?.user;

    // 3. Locate two test apartments in Property 1
    const apts = await pool.query(
      'SELECT id, unit_name, property_id FROM apartments WHERE property_id = 1 AND is_active = 1 ORDER BY id ASC LIMIT 2'
    );
    unitA = apts[0];
    unitB = apts[1];

    await cleanupDb();
  });

  afterAll(async () => {
    await cleanupDb();
    // Reset unit states
    if (unitA) {
      await pool.query(
        'UPDATE apartments SET status = "AVAILABLE", housekeeping_status = "INSPECTED_READY", maintenance_status = "OPERATIONAL" WHERE id = ?',
        [unitA.id]
      );
    }
    if (unitB) {
      await pool.query(
        'UPDATE apartments SET status = "AVAILABLE", housekeeping_status = "INSPECTED_READY", maintenance_status = "OPERATIONAL" WHERE id = ?',
        [unitB.id]
      );
    }
  });

  beforeEach(async () => {
    // Thoroughly clean test units before each test
    await pool.query('DELETE FROM maintenance_requests WHERE apartment_id IN (?, ?)', [unitA.id, unitB.id]);
    await pool.query('DELETE FROM reservations WHERE apartment_id IN (?, ?)', [unitA.id, unitB.id]);
    await pool.query(
      'UPDATE apartments SET status = "AVAILABLE", housekeeping_status = "INSPECTED_READY", maintenance_status = "OPERATIONAL" WHERE id IN (?, ?)',
      [unitA.id, unitB.id]
    );
  });

  // =========================================================================
  // SUITE 1: Baseline Check-In & Positive Readiness Invariant
  // =========================================================================
  describe('Suite 1: Baseline Check-In & Positive Invariant (TC-01)', () => {
    test('TC-01A: Normal check-in with status = AVAILABLE and housekeeping = INSPECTED_READY', async () => {
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data?.status).toBe('CHECKED_IN');

      // Verify unit occupancy updated
      const aptRows = await pool.query('SELECT status, housekeeping_status, maintenance_status FROM apartments WHERE id = ?', [unitA.id]);
      expect(aptRows[0].status).toBe('OCCUPIED');
      expect(aptRows[0].housekeeping_status).toBe('INSPECTED_READY');
      expect(aptRows[0].maintenance_status).toBe('OPERATIONAL');
    });

    test('TC-01B: Check-in succeeds with legacy occupancy status = READY', async () => {
      await pool.query('UPDATE apartments SET status = "READY" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data?.status).toBe('CHECKED_IN');

      const aptRows = await pool.query('SELECT status FROM apartments WHERE id = ?', [unitA.id]);
      expect(aptRows[0].status).toBe('OCCUPIED');
    });
  });

  // =========================================================================
  // SUITE 2: Housekeeping Status Negative Tests
  // =========================================================================
  describe('Suite 2: Housekeeping Status Negative Tests (TC-02 .. TC-04)', () => {
    test('TC-02: Rejects check-in when housekeeping_status = DIRTY (HTTP 422)', async () => {
      await pool.query('UPDATE apartments SET housekeeping_status = "DIRTY" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(422);
      expect(getMsg(response)).toMatch(/housekeeping status is 'DIRTY'/i);

      // Verify reservation was NOT checked in
      const rRows = await pool.query('SELECT status FROM reservations WHERE id = ?', [res.id]);
      expect(rRows[0].status).toBe('CONFIRMED');
    });

    test('TC-03: Rejects check-in when housekeeping_status = CLEANING_IN_PROGRESS (HTTP 422)', async () => {
      await pool.query('UPDATE apartments SET housekeeping_status = "CLEANING_IN_PROGRESS" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(422);
      expect(getMsg(response)).toMatch(/CLEANING_IN_PROGRESS/i);
    });

    test('TC-04: Rejects check-in when housekeeping_status = CLEANED (pending inspection) (HTTP 422)', async () => {
      await pool.query('UPDATE apartments SET housekeeping_status = "CLEANED" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(422);
      expect(getMsg(response)).toMatch(/CLEANED/i);
    });
  });

  // =========================================================================
  // SUITE 3: Maintenance Status & Blocking Ticket Negative Tests
  // =========================================================================
  describe('Suite 3: Maintenance Status & Blocking Ticket Negative Tests (TC-05 .. TC-08)', () => {
    test('TC-05: Rejects check-in when maintenance_status = UNDER_REPAIR (HTTP 409)', async () => {
      await pool.query('UPDATE apartments SET maintenance_status = "UNDER_REPAIR" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(409);
      expect(getMsg(response)).toMatch(/UNDER_REPAIR/i);
    });

    test('TC-06: Rejects check-in when maintenance_status = INSPECTION_REQUIRED (HTTP 409)', async () => {
      await pool.query('UPDATE apartments SET maintenance_status = "INSPECTION_REQUIRED" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(409);
      expect(getMsg(response)).toMatch(/INSPECTION_REQUIRED/i);
    });

    test('TC-07: Rejects check-in when maintenance_status = OUT_OF_ORDER (HTTP 409)', async () => {
      await pool.query('UPDATE apartments SET maintenance_status = "OUT_OF_ORDER" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(409);
      expect(getMsg(response)).toMatch(/OUT_OF_ORDER/i);
    });

    test('TC-08: Rejects check-in when CRITICAL maintenance ticket exists even if blocking_unit = 0 (HTTP 409)', async () => {
      // Insert CRITICAL ticket with blocking_unit = 0
      const critCode = `MNT-CRIT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
      const mRes = await pool.query(
        `INSERT INTO maintenance_requests (
          issue_code, property_id, apartment_id, issue_title, category, priority, status, blocking_unit, created_at, updated_at
        ) VALUES (?, 1, ?, 'Urgent plumbing burst', 'PLUMBING', 'CRITICAL', 'OPEN', 0, NOW(), NOW())`,
        [critCode, unitA.id]
      );
      createdMaintenanceIds.push(mRes.insertId);

      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(409);
      expect(getMsg(response)).toMatch(/active blocking maintenance request/i);
    });
  });

  // =========================================================================
  // SUITE 4: Occupancy State Allowlist & Fail-Closed Guards
  // =========================================================================
  describe('Suite 4: Occupancy Allowlist & Fail-Closed Guards (TC-09 .. TC-10)', () => {
    test('TC-09: Rejects check-in when unit status is OCCUPIED (HTTP 409)', async () => {
      await pool.query('UPDATE apartments SET status = "OCCUPIED" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(409);
      expect(getMsg(response)).toMatch(/currently OCCUPIED/i);
    });

    test('TC-10A: Rejects check-in when unit status is MAINTENANCE (HTTP 409)', async () => {
      await pool.query('UPDATE apartments SET status = "MAINTENANCE" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(409);
      expect(getMsg(response)).toMatch(/in MAINTENANCE status/i);
    });

    test('TC-10B: Rejects check-in when unit status is BLOCKED (HTTP 409)', async () => {
      await pool.query('UPDATE apartments SET status = "BLOCKED" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(409);
      expect(getMsg(response)).toMatch(/BLOCKED/i);
    });

    test('TC-10C: Rejects check-in on unknown occupancy status (fail closed HTTP 422)', async () => {
      await pool.query('UPDATE apartments SET status = "UNKNOWN_CUSTOM_STATUS" WHERE id = ?', [unitA.id]);
      const res = await createTestReservation({ apartmentId: unitA.id });

      const response = await request(app)
        .post(`/api/v1/reservations/${res.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(response.status).toBe(422);
      expect(getMsg(response)).toMatch(/invalid occupancy status 'UNKNOWN_CUSTOM_STATUS'/i);
    });
  });

  // =========================================================================
  // SUITE 5: Reservation Lifecycle Status Guards
  // =========================================================================
  describe('Suite 5: Reservation Lifecycle Status Guards (TC-11 .. TC-13)', () => {
    test('TC-11: Rejects check-in if reservation is PENDING or CLAIMED (HTTP 422)', async () => {
      const resPending = await createTestReservation({ apartmentId: unitA.id, status: 'PENDING' });
      const respPending = await request(app)
        .post(`/api/v1/reservations/${resPending.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(respPending.status).toBe(422);
      expect(getMsg(respPending)).toMatch(/Only CONFIRMED reservations can be checked in/i);

      const resClaimed = await createTestReservation({ apartmentId: unitA.id, status: 'CLAIMED' });
      const respClaimed = await request(app)
        .post(`/api/v1/reservations/${resClaimed.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(respClaimed.status).toBe(422);
      expect(getMsg(respClaimed)).toMatch(/Only CONFIRMED reservations can be checked in/i);
    });

    test('TC-12: Rejects check-in if reservation is already CHECKED_IN (HTTP 409)', async () => {
      const resCheckedIn = await createTestReservation({ apartmentId: unitA.id, status: 'CHECKED_IN' });
      const resp = await request(app)
        .post(`/api/v1/reservations/${resCheckedIn.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(resp.status).toBe(409);
      expect(getMsg(resp)).toMatch(/already checked in/i);
    });

    test('TC-13: Rejects check-in if reservation is CANCELLED or COMPLETED (HTTP 422)', async () => {
      const resCancelled = await createTestReservation({ apartmentId: unitA.id, status: 'CANCELLED' });
      const resp = await request(app)
        .post(`/api/v1/reservations/${resCancelled.id}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(resp.status).toBe(422);
      expect(getMsg(resp)).toMatch(/Only CONFIRMED reservations can be checked in/i);
    });
  });

  // =========================================================================
  // SUITE 6: Genuine Concurrency & Race Tests (TC-14 .. TC-18)
  // =========================================================================
  describe('Suite 6: Concurrency & Race Condition Scenarios (TC-14 .. TC-18)', () => {
    test('TC-14 (Scenario G): Concurrent check-in of the same reservation by two simultaneous requests', async () => {
      const res = await createTestReservation({ apartmentId: unitA.id });

      // Dispatch 2 concurrent check-in requests
      const [res1, res2] = await Promise.all([
        request(app).post(`/api/v1/reservations/${res.id}/check-in`).set('Authorization', `Bearer ${receptionistToken}`),
        request(app).post(`/api/v1/reservations/${res.id}/check-in`).set('Authorization', `Bearer ${adminToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must succeed (200), and the second must be rejected (409 or 422)
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      // Assert apartment is OCCUPIED
      const aptRows = await pool.query('SELECT status FROM apartments WHERE id = ?', [unitA.id]);
      expect(aptRows[0].status).toBe('OCCUPIED');
    });

    test('TC-15 (Scenario H): Two different reservations competing for the same apartment concurrently', async () => {
      const res1 = await createTestReservation({ apartmentId: unitA.id, tenantName: 'Guest 1', tenantEmail: 'guest1@bfa.com' });
      const res2 = await createTestReservation({ apartmentId: unitA.id, tenantName: 'Guest 2', tenantEmail: 'guest2@bfa.com' });

      // Both attempt check-in into unitA concurrently
      const [resp1, resp2] = await Promise.all([
        request(app).post(`/api/v1/reservations/${res1.id}/check-in`).set('Authorization', `Bearer ${receptionistToken}`),
        request(app).post(`/api/v1/reservations/${res2.id}/check-in`).set('Authorization', `Bearer ${adminToken}`),
      ]);

      const statuses = [resp1.status, resp2.status].sort();
      // Exactly one succeeds, second gets 409 APARTMENT_ALREADY_OCCUPIED
      expect(statuses[0]).toBe(200);
      expect(statuses[1]).toBe(409);

      const rejectedResp = resp1.status === 409 ? resp1 : resp2;
      expect(getMsg(rejectedResp)).toMatch(/OCCUPIED/i);
    });

    test('TC-16 (Scenario A/B): Concurrent blocking maintenance creation vs check-in', async () => {
      const res = await createTestReservation({ apartmentId: unitA.id });

      // Run createMaintenance and checkInReservation simultaneously
      const [maintResult, checkInResult] = await Promise.allSettled([
        MaintenanceService.createMaintenance(
          {
            property_id: 1,
            apartment_id: unitA.id,
            issue_title: 'Emergency pipe freeze',
            category: 'PLUMBING',
            priority: 'HIGH',
            blocking_unit: 1,
          },
          adminUser
        ),
        request(app).post(`/api/v1/reservations/${res.id}/check-in`).set('Authorization', `Bearer ${receptionistToken}`),
      ]);

      if (maintResult.status === 'fulfilled' && maintResult.value?.id) {
        createdMaintenanceIds.push(maintResult.value.id);
      }

      // Assert that the apartment status is coherent: either OCCUPIED or MAINTENANCE (never corrupted)
      const aptRows = await pool.query('SELECT status, maintenance_status FROM apartments WHERE id = ?', [unitA.id]);
      expect(['OCCUPIED', 'MAINTENANCE']).toContain(aptRows[0].status);

      // If check-in succeeded (status 200), unit must be OCCUPIED
      if (checkInResult.value?.status === 200) {
        expect(aptRows[0].status).toBe('OCCUPIED');
      }
    });

    test('TC-17 (Scenario D): Bidirectional apartment transfers (min/max ascending ID lock order eliminates deadlocks)', async () => {
      const idMin = Math.min(unitA.id, unitB.id);
      const idMax = Math.max(unitA.id, unitB.id);

      // Reservation 1 on unit min
      const res1 = await createTestReservation({
        apartmentId: idMin,
        checkInDate: '2028-11-10',
        checkOutDate: '2028-11-11',
        tenantName: 'Transfer 1',
        tenantEmail: 't1@bfa.com'
      });
      // Reservation 2 on unit max
      const res2 = await createTestReservation({
        apartmentId: idMax,
        checkInDate: '2028-11-20',
        checkOutDate: '2028-11-21',
        tenantName: 'Transfer 2',
        tenantEmail: 't2@bfa.com'
      });

      // Attempt simultaneous bidirectional transfers:
      // Res 1 transfers min -> max, while Res 2 transfers max -> min
      const [transfer1, transfer2] = await Promise.allSettled([
        ReservationsService.updateReservation(res1.id, { apartment_id: idMax }, { user: adminUser }),
        ReservationsService.updateReservation(res2.id, { apartment_id: idMin }, { user: adminUser }),
      ]);

      // Both transactions must cleanly complete or reject without circular deadlock exception (code 1213)
      const err1 = transfer1.status === 'rejected' ? transfer1.reason : null;
      const err2 = transfer2.status === 'rejected' ? transfer2.reason : null;

      if (err1) {
        console.error('TC-17 T1 err:', err1.message || err1);
        expect(err1.code).not.toBe('ER_LOCK_DEADLOCK');
      }
      if (err2) {
        console.error('TC-17 T2 err:', err2.message || err2);
        expect(err2.code).not.toBe('ER_LOCK_DEADLOCK');
      }

      // Both transfers should succeed because their dates (Nov 10 vs Nov 20) do not overlap
      expect(transfer1.status).toBe('fulfilled');
      expect(transfer2.status).toBe('fulfilled');
    });

    test('TC-18 (Scenario F): Maintenance resolution turnover does NOT overwrite checked-in in-house room', async () => {
      // Step 1: Create maintenance ticket on unitA and mark apartment as MAINTENANCE
      const mnt = await MaintenanceService.createMaintenance(
        {
          property_id: 1,
          apartment_id: unitA.id,
          issue_title: 'AC compressor overhaul',
          category: 'HVAC',
          priority: 'MEDIUM',
          blocking_unit: 1,
        },
        adminUser
      );
      createdMaintenanceIds.push(mnt.id);

      // Step 2: Now unitA has a checked-in guest (e.g. guest was checked in or room was moved)
      const res = await createTestReservation({
        apartmentId: unitA.id,
        status: 'CHECKED_IN',
        checkInDate: new Date().toISOString().slice(0, 10),
        checkOutDate: '2028-12-31',
      });
      await pool.query('UPDATE apartments SET status = "OCCUPIED" WHERE id = ?', [unitA.id]);

      // Step 3: Resolve the maintenance ticket
      await MaintenanceService.resolveIssue(
        mnt.id,
        {
          resolutionNotes: 'AC compressor successfully replaced and pressure tested.',
          actualCost: 35000,
          photoExemptionReason: 'NON_VISUAL_REPAIR',
        },
        adminUser
      );

      // Step 4: Verify that the unit remains OCCUPIED and was NOT demoted to CLEANING!
      const aptRows = await pool.query('SELECT status, maintenance_status FROM apartments WHERE id = ?', [unitA.id]);
      expect(aptRows[0].status).toBe('OCCUPIED');
      expect(aptRows[0].maintenance_status).toBe('OPERATIONAL');
    });

    test('TC-19 (Scenario C): Reservation approval versus check-in mutex race on same unit', async () => {
      // res1 is CONFIRMED and scheduled for today
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

      const res1 = await createTestReservation({
        apartmentId: unitA.id,
        checkInDate: today,
        checkOutDate: tomorrow,
        status: 'CONFIRMED',
        tenantName: 'CheckIn Guest',
        tenantEmail: 'checkin.guest@bfa.com',
      });

      // res2 is PENDING for the same dates and same unit
      const res2 = await createTestReservation({
        apartmentId: unitA.id,
        checkInDate: today,
        checkOutDate: tomorrow,
        status: 'PENDING',
        tenantName: 'Pending Approval Guest',
        tenantEmail: 'pending.guest@bfa.com',
      });

      // Execute approval and check-in concurrently
      const [approvalRes, checkInRes] = await Promise.allSettled([
        ReservationsService.confirmReservation(res2.id, { user: adminUser }),
        ReservationsService.checkInReservation(res1.id, { user: receptionistUser }),
      ]);

      const aptRows = await pool.query('SELECT status FROM apartments WHERE id = ?', [unitA.id]);
      const res1Rows = await pool.query('SELECT status FROM reservations WHERE id = ?', [res1.id]);
      const res2Rows = await pool.query('SELECT status FROM reservations WHERE id = ?', [res2.id]);

      const res1Status = res1Rows[0].status;
      const res2Status = res2Rows[0].status;

      // Both cannot be active checked-in stays
      expect([res1Status, res2Status].filter((s) => s === 'CHECKED_IN').length).toBeLessThanOrEqual(1);

      if (checkInRes.status === 'fulfilled') {
        expect(res1Status).toBe('CHECKED_IN');
        expect(aptRows[0].status).toBe('OCCUPIED');
        // When check-in wins, confirming an overlapping stay on OCCUPIED unit is rejected with 409
        expect(approvalRes.status).toBe('rejected');
        expect(approvalRes.reason.statusCode || approvalRes.reason.status).toBe(409);
        expect(res2Status).toBe('PENDING');
      } else {
        expect(approvalRes.status).toBe('fulfilled');
        expect(res2Status).toBe('CONFIRMED');
      }
    });

    test('TC-20A (Scenario E): Dynamic maintenance priority escalation to CRITICAL blocks concurrent check-in', async () => {
      // 1. Create a non-blocking MEDIUM priority ticket on unitA
      const mnt = await MaintenanceService.createMaintenance(
        {
          property_id: 1,
          apartment_id: unitA.id,
          issue_title: 'Slight paint scuff',
          category: 'GENERAL',
          priority: 'MEDIUM',
          blocking_unit: 0,
        },
        adminUser
      );
      createdMaintenanceIds.push(mnt.id);

      // Verify unitA is still AVAILABLE & OPERATIONAL
      let apt = (await pool.query('SELECT status, maintenance_status FROM apartments WHERE id = ?', [unitA.id]))[0];
      expect(apt.status).toBe('AVAILABLE');
      expect(apt.maintenance_status).toBe('OPERATIONAL');

      // 2. Create reservation ready to check in today
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const res = await createTestReservation({
        apartmentId: unitA.id,
        checkInDate: today,
        checkOutDate: tomorrow,
        status: 'CONFIRMED',
      });

      // 3. Concurrently escalate maintenance priority to CRITICAL while check-in is attempted
      const [updateResult, checkInResult] = await Promise.allSettled([
        MaintenanceRepository.update(mnt.id, { priority: 'CRITICAL' }),
        ReservationsService.checkInReservation(res.id, { user: receptionistUser }),
      ]);

      expect(updateResult.status).toBe('fulfilled');

      apt = (await pool.query('SELECT status, maintenance_status FROM apartments WHERE id = ?', [unitA.id]))[0];
      const mntRow = (await pool.query('SELECT priority, blocking_unit FROM maintenance_requests WHERE id = ?', [mnt.id]))[0];
      expect(mntRow.priority).toBe('CRITICAL');

      if (checkInResult.status === 'fulfilled') {
        expect(apt.status).toBe('OCCUPIED');
        expect(apt.maintenance_status).toBe('UNDER_REPAIR');
      } else {
        expect(checkInResult.reason.statusCode || checkInResult.reason.status).toBe(409);
        expect(apt.status).toBe('MAINTENANCE');
        expect(apt.maintenance_status).toBe('UNDER_REPAIR');
      }
    });

    test('TC-20B (Scenario E): Dynamic blocking_unit escalation (0 -> 1) blocks concurrent check-in', async () => {
      // 1. Create a non-blocking LOW priority ticket on unitA
      const mnt = await MaintenanceService.createMaintenance(
        {
          property_id: 1,
          apartment_id: unitA.id,
          issue_title: 'Loose door hinge',
          category: 'CARPENTRY',
          priority: 'LOW',
          blocking_unit: 0,
        },
        adminUser
      );
      createdMaintenanceIds.push(mnt.id);

      // 2. Create reservation ready to check in today
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const res = await createTestReservation({
        apartmentId: unitA.id,
        checkInDate: today,
        checkOutDate: tomorrow,
        status: 'CONFIRMED',
      });

      // 3. Concurrently escalate blocking_unit: 1 while check-in runs
      const [updateResult, checkInResult] = await Promise.allSettled([
        MaintenanceRepository.update(mnt.id, { blocking_unit: 1 }),
        ReservationsService.checkInReservation(res.id, { user: receptionistUser }),
      ]);

      expect(updateResult.status).toBe('fulfilled');
      const apt = (await pool.query('SELECT status, maintenance_status FROM apartments WHERE id = ?', [unitA.id]))[0];
      const mntRow = (await pool.query('SELECT blocking_unit FROM maintenance_requests WHERE id = ?', [mnt.id]))[0];
      expect(mntRow.blocking_unit).toBe(1);

      if (checkInResult.status === 'fulfilled') {
        expect(apt.status).toBe('OCCUPIED');
        expect(apt.maintenance_status).toBe('UNDER_REPAIR');
      } else {
        expect(checkInResult.reason.statusCode || checkInResult.reason.status).toBe(409);
        expect(apt.status).toBe('MAINTENANCE');
        expect(apt.maintenance_status).toBe('UNDER_REPAIR');
      }
    });

    test('TC-21 (Scenario F): Simultaneous maintenance resolution versus check-in turnover race', async () => {
      // 1. Create a blocking maintenance ticket on unitA
      const mnt = await MaintenanceService.createMaintenance(
        {
          property_id: 1,
          apartment_id: unitA.id,
          issue_title: 'Window latch replacement',
          category: 'CARPENTRY',
          priority: 'HIGH',
          blocking_unit: 1,
        },
        adminUser
      );
      createdMaintenanceIds.push(mnt.id);

      let apt = (await pool.query('SELECT status, maintenance_status FROM apartments WHERE id = ?', [unitA.id]))[0];
      expect(apt.status).toBe('MAINTENANCE');
      expect(apt.maintenance_status).toBe('UNDER_REPAIR');

      // 2. Create reservation ready to check in today
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const res = await createTestReservation({
        apartmentId: unitA.id,
        checkInDate: today,
        checkOutDate: tomorrow,
        status: 'CONFIRMED',
      });

      // 3. Concurrently race maintenance resolution against check-in
      const [resolveResult, checkInResult] = await Promise.allSettled([
        MaintenanceService.resolveIssue(
          mnt.id,
          {
            resolutionNotes: 'Window latch securely replaced and tested.',
            actualCost: 15000,
            photoExemptionReason: 'NON_VISUAL_REPAIR',
          },
          adminUser
        ),
        ReservationsService.checkInReservation(res.id, { user: receptionistUser }),
      ]);

      expect(resolveResult.status).toBe('fulfilled');

      apt = (await pool.query('SELECT status, housekeeping_status, maintenance_status FROM apartments WHERE id = ?', [unitA.id]))[0];
      expect(apt.maintenance_status).toBe('OPERATIONAL');

      if (checkInResult.status === 'rejected') {
        expect([409, 422]).toContain(checkInResult.reason.statusCode || checkInResult.reason.status);
        expect(apt.status).toBe('CLEANING');
        expect(apt.housekeeping_status).toBe('DIRTY');
      } else {
        expect(apt.status).toBe('OCCUPIED');
      }
    });

    test('TC-22 (C-2.6A-02): Post-commit reservation retrieval failure resilience', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const res = await createTestReservation({
        apartmentId: unitA.id,
        checkInDate: today,
        checkOutDate: tomorrow,
        status: 'CONFIRMED',
      });

      // Spy on ReservationsRepository.findById:
      // Allow calls with conn (inside transaction) to proceed normally.
      // When called without conn (post-commit), force it to throw a transient error.
      const originalFindById = ReservationsRepository.findById;
      const findByIdSpy = jest.spyOn(ReservationsRepository, 'findById').mockImplementation(async (id, conn = null) => {
        if (conn) {
          return originalFindById.call(ReservationsRepository, id, conn);
        }
        throw new Error('Transient connection drop during post-commit findById');
      });

      try {
        const result = await ReservationsService.checkInReservation(res.id, { user: receptionistUser });

        expect(result).toBeTruthy();
        expect(result.id).toBe(res.id);
        expect(result.status).toBe('CHECKED_IN');
        expect(result.checked_in_at).toBeTruthy();

        // Verify in database directly that transaction committed successfully
        const [dbRes] = await pool.query('SELECT status FROM reservations WHERE id = ?', [res.id]);
        expect(dbRes.status).toBe('CHECKED_IN');

        const [dbApt] = await pool.query('SELECT status FROM apartments WHERE id = ?', [unitA.id]);
        expect(dbApt.status).toBe('OCCUPIED');
      } finally {
        findByIdSpy.mockRestore();
      }
    });
  });
});
