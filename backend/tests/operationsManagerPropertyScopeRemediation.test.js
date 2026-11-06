const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');
const ReservationsService = require('../src/modules/reservations/reservations.service');
const ReservationsRepository = require('../src/modules/reservations/reservations.repository');
const FrontOfficeRepository = require('../src/modules/frontOffice/frontOffice.repository');

describe('Stage 2.6B Step 1: Operations Manager Property-Scope Security Remediation Tests', () => {
  let adminToken;
  let opManagerProp1Token;
  let opManagerNullPropToken;
  let opManagerProp2Token;
  let legacyManagerProp1Token;
  let receptionistToken;
  let ownerToken;
  let opManagerInvalidPropToken;
  let testProofPathProp1 = '';
  let testProofPathProp2 = '';

  let prop1ResId;
  let prop2ResId;
  let prop1AptId = 1; // Apartment in Property 1
  let prop2AptId = 4; // Apartment in Property 2

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  function makeToken(payload) {
    return jwt.sign(payload, config.security.jwtSecret, { expiresIn: '1h' });
  }

  beforeAll(async () => {
    // 1. Login real users to obtain standard tokens
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminLogin.body.data.token;

    const opLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    opManagerProp1Token = opLogin.body.data.token;

    const recLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
    });
    receptionistToken = recLogin.body.data.token;

    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@bfa.com',
      password: 'Bfa2026!Secure',
    });
    ownerToken = ownerLogin.body.data.token;

    // 2. Generate specialized token variations for edge-case authorization checks
    opManagerNullPropToken = makeToken({
      id: 991,
      name: 'Unassigned Op Manager',
      email: 'op.unassigned@bfa.com',
      role: 'OPERATIONS_MANAGER',
      propertyId: null,
    });

    opManagerProp2Token = makeToken({
      id: 992,
      name: 'Op Manager Property 2',
      email: 'op.prop2@bfa.com',
      role: 'OPERATIONS_MANAGER',
      propertyId: 2,
    });

    legacyManagerProp1Token = makeToken({
      id: 993,
      name: 'Legacy Manager Prop 1',
      email: 'legacy.manager@bfa.com',
      role: 'MANAGER',
      propertyId: 1,
    });

    opManagerInvalidPropToken = makeToken({
      id: 994,
      name: 'Invalid Prop Manager',
      email: 'op.invalid@bfa.com',
      role: 'OPERATIONS_MANAGER',
      propertyId: 'invalid',
    });

    // 3. Find valid apartments in Property 1 and Property 2
    const [p1Apts] = await pool.query('SELECT id FROM apartments WHERE property_id = 1 AND is_active = 1 LIMIT 1');
    if (p1Apts.length > 0) prop1AptId = p1Apts[0].id;

    const [p2Apts] = await pool.query('SELECT id FROM apartments WHERE property_id = 2 AND is_active = 1 LIMIT 1');
    if (p2Apts.length > 0) prop2AptId = p2Apts[0].id;

    // Reset units to clean state
    await pool.query('UPDATE apartments SET status = "AVAILABLE", housekeeping_status = "INSPECTED_READY", maintenance_status = "OPERATIONAL" WHERE id IN (?, ?)', [prop1AptId, prop2AptId]);

    // 4. Create test reservation for Property 1
    const p1Res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 1,
        apartment_id: prop1AptId,
        tenant_name: 'Prop 1 Security Guest',
        tenant_email: 'prop1.guest@bfa.ng',
        tenant_phone: '+234 801 111 2222',
        check_in_date: today,
        check_out_date: tomorrow,
        source: 'DIRECT',
        total_amount: 250.00,
        paid_amount: 250.00,
        status: 'CONFIRMED',
      });
    prop1ResId = p1Res.body.data?.id;

    // 5. Create test reservation for Property 2
    const p2Res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 2,
        apartment_id: prop2AptId,
        tenant_name: 'Prop 2 Security Guest',
        tenant_email: 'prop2.guest@bfa.ng',
        tenant_phone: '+234 802 222 3333',
        check_in_date: today,
        check_out_date: tomorrow,
        source: 'DIRECT',
        total_amount: 300.00,
        paid_amount: 300.00,
        status: 'CONFIRMED',
      });
    prop2ResId = p2Res.body.data?.id;

    // Seed dummy history records for prop1 and prop2
    await pool.query(
      'INSERT INTO reservation_status_history (reservation_id, from_status, to_status, actor_role, notes) VALUES (?, "PENDING", "CONFIRMED", "ADMIN", "Test history Prop 1")',
      [prop1ResId]
    );
    await pool.query(
      'INSERT INTO reservation_status_history (reservation_id, from_status, to_status, actor_role, notes) VALUES (?, "PENDING", "CONFIRMED", "ADMIN", "Test history Prop 2")',
      [prop2ResId]
    );

    // Seed dummy payment proof files and link to reservations
    const testEvidenceDir = path.resolve(__dirname, '../storage/evidence');
    if (!fs.existsSync(testEvidenceDir)) fs.mkdirSync(testEvidenceDir, { recursive: true });
    testProofPathProp1 = path.join(testEvidenceDir, 'test_proof_prop1.png');
    testProofPathProp2 = path.join(testEvidenceDir, 'test_proof_prop2.png');
    fs.writeFileSync(testProofPathProp1, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    fs.writeFileSync(testProofPathProp2, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    await pool.query('UPDATE reservations SET payment_proof_path = ? WHERE id = ?', ['storage/evidence/test_proof_prop1.png', prop1ResId]);
    await pool.query('UPDATE reservations SET payment_proof_path = ? WHERE id = ?', ['storage/evidence/test_proof_prop2.png', prop2ResId]);
  });

  afterAll(async () => {
    if (prop1ResId) {
      await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [prop1ResId]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [prop1ResId]);
      await pool.query('DELETE FROM reservation_staff_assignments WHERE reservation_id = ?', [prop1ResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [prop1ResId]);
    }
    if (prop2ResId) {
      await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [prop2ResId]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [prop2ResId]);
      await pool.query('DELETE FROM reservation_staff_assignments WHERE reservation_id = ?', [prop2ResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [prop2ResId]);
    }
    if (testProofPathProp1 && fs.existsSync(testProofPathProp1)) fs.unlinkSync(testProofPathProp1);
    if (testProofPathProp2 && fs.existsSync(testProofPathProp2)) fs.unlinkSync(testProofPathProp2);
    await pool.query('UPDATE apartments SET status = "AVAILABLE", housekeeping_status = "INSPECTED_READY", maintenance_status = "OPERATIONAL" WHERE id IN (?, ?)', [prop1AptId, prop2AptId]);
  });

  // ─── Test 1: Authorized Property Access ─────────────────────────────────────────
  test('1. Operations Manager can access reservations belonging to their assigned property (Property 1)', async () => {
    const res = await request(app)
      .get(`/api/v1/reservations/${prop1ResId}`)
      .set('Authorization', `Bearer ${opManagerProp1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(prop1ResId);
    expect(res.body.data.property_id).toBe(1);
  });

  // ─── Test 2: Cross-Property Access Denied ──────────────────────────────────────
  test('2. Operations Manager cannot access another property reservation (HTTP 403 Forbidden)', async () => {
    // Attempt to view Property 2 reservation with Property 1 manager token
    const res = await request(app)
      .get(`/api/v1/reservations/${prop2ResId}`)
      .set('Authorization', `Bearer ${opManagerProp1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/authorization for this property/i);
  });

  test('2B. Operations Manager cannot mutate another property reservation (HTTP 403 Forbidden)', async () => {
    // Attempt to update Property 2 reservation with Property 1 manager token
    const res = await request(app)
      .put(`/api/v1/reservations/${prop2ResId}`)
      .set('Authorization', `Bearer ${opManagerProp1Token}`)
      .send({ special_requests: 'Unauthorized cross-property edit attempt' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ─── Test 3: Null Property Assignment Fails Closed ─────────────────────────────
  test('3. Operations Manager with null property assignment is denied access (HTTP 403 / Fail-Closed)', async () => {
    // Single reservation fetch with unassigned manager token
    const getRes = await request(app)
      .get(`/api/v1/reservations/${prop1ResId}`)
      .set('Authorization', `Bearer ${opManagerNullPropToken}`);

    expect(getRes.status).toBe(403);
    expect(getRes.body.error.message).toMatch(/not assigned to any property/i);

    // List query returns empty collection (fail closed via SQL AND 1 = 0)
    const listRes = await request(app)
      .get('/api/v1/reservations')
      .set('Authorization', `Bearer ${opManagerNullPropToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items || listRes.body.data).toHaveLength(0);
  });

  // ─── Test 4: Invalid Property Assignment Fails Closed ──────────────────────────
  test('4. Operations Manager with invalid property assignment fails closed', async () => {
    const invalidToken = makeToken({
      id: 994,
      name: 'Invalid Op Manager',
      email: 'invalid@bfa.com',
      role: 'OPERATIONS_MANAGER',
      propertyId: 'non-numeric-invalid',
    });

    const res = await request(app)
      .get(`/api/v1/reservations/${prop1ResId}`)
      .set('Authorization', `Bearer ${invalidToken}`);

    expect(res.status).toBe(403);
  });

  // ─── Test 5: Front-Office Queues Property Scoping ──────────────────────────────
  test('5. Operations Manager front-office pending queues and stats are strictly property-scoped', async () => {
    const statsRes = await request(app)
      .get('/api/v1/front-office/stats')
      .set('Authorization', `Bearer ${opManagerProp1Token}`);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.success).toBe(true);

    const pendingRes = await request(app)
      .get('/api/v1/front-office/pending-bookings')
      .set('Authorization', `Bearer ${opManagerProp1Token}`);

    expect(pendingRes.status).toBe(200);
    const bookings = pendingRes.body.data || [];
    // Every single booking returned must belong exclusively to Property 1
    bookings.forEach((b) => {
      expect(b.property_id).toBe(1);
    });
  });

  // ─── Test 6: Cross-Property Arrivals and Departures Inaccessible ────────────────
  test('6. Cross-property arrivals query is completely inaccessible (filtered out at SQL level)', async () => {
    // Op Manager for Property 1 explicitly requests Property 2 arrivals
    const arrRes = await request(app)
      .get(`/api/v1/front-office/arrivals?propertyId=2&date=${today}`)
      .set('Authorization', `Bearer ${opManagerProp1Token}`);

    expect(arrRes.status).toBe(200);
    // Must return zero records because cross-property query fails closed (AND 1 = 0)
    expect(arrRes.body.data).toHaveLength(0);
  });

  test('6B. Cross-property departures query is completely inaccessible', async () => {
    const depRes = await request(app)
      .get(`/api/v1/front-office/departures?propertyId=2&date=${tomorrow}`)
      .set('Authorization', `Bearer ${opManagerProp1Token}`);

    expect(depRes.status).toBe(200);
    expect(depRes.body.data).toHaveLength(0);
  });

  // ─── Test 7: Receptionist Restrictions Intact ─────────────────────────────────
  test('7. Receptionist property restrictions remain intact and fail closed', async () => {
    // Receptionist for Property 1 cannot view Property 2 reservation
    const res = await request(app)
      .get(`/api/v1/reservations/${prop2ResId}`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/authorization for this property/i);
  });

  // ─── Test 8: ADMIN and OWNER Retain Portfolio Access ───────────────────────────
  test('8. ADMIN retains portfolio-wide authorized access across all properties', async () => {
    const p1Res = await request(app)
      .get(`/api/v1/reservations/${prop1ResId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(p1Res.status).toBe(200);

    const p2Res = await request(app)
      .get(`/api/v1/reservations/${prop2ResId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(p2Res.status).toBe(200);
  });

  test('8B. OWNER retains authorized portfolio-wide reservation access', async () => {
    const p1Res = await request(app)
      .get(`/api/v1/reservations/${prop1ResId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(p1Res.status).toBe(200);

    const p2Res = await request(app)
      .get(`/api/v1/reservations/${prop2ResId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(p2Res.status).toBe(200);
  });

  // ─── Test 9: Legacy MANAGER Role Normalization ────────────────────────────────
  test('9. Legacy MANAGER token is normalized and correctly property-scoped to Property 1', async () => {
    // Access own property succeeds
    const p1Res = await request(app)
      .get(`/api/v1/reservations/${prop1ResId}`)
      .set('Authorization', `Bearer ${legacyManagerProp1Token}`);
    expect(p1Res.status).toBe(200);

    // Cross-property access is blocked
    const p2Res = await request(app)
      .get(`/api/v1/reservations/${prop2ResId}`)
      .set('Authorization', `Bearer ${legacyManagerProp1Token}`);
    expect(p2Res.status).toBe(403);
  });

  // ─── Test 10: Query String Parameter Cannot Bypass Repository Restriction ──────
  test('10. Passing ?propertyId=2 query parameter cannot bypass server-side repository restriction', async () => {
    // Op Manager assigned to Property 1 tries to query Property 2 via query param
    const res = await request(app)
      .get('/api/v1/reservations?propertyId=2')
      .set('Authorization', `Bearer ${opManagerProp1Token}`);

    expect(res.status).toBe(200);
    const items = res.body.data.items || res.body.data || [];
    // Must return 0 items; Property 2 records must NEVER leak to Property 1 manager
    expect(items).toHaveLength(0);
  });

  // ─── Direct Service & Repository Unit-Level Verification ───────────────────────
  test('11. Direct service helper unit test validates fail-closed behavior', () => {
    // Unauthenticated public request passes
    expect(ReservationsService.validatePropertyScope(null, 1)).toBe(true);

    // Admin passes across all properties
    expect(ReservationsService.validatePropertyScope({ role: 'ADMIN', propertyId: null }, 1)).toBe(true);
    expect(ReservationsService.validatePropertyScope({ role: 'ADMIN', propertyId: null }, 2)).toBe(true);

    // Op Manager matching property passes
    expect(ReservationsService.validatePropertyScope({ role: 'OPERATIONS_MANAGER', propertyId: 1 }, 1)).toBe(true);

    // Op Manager mismatching property throws ForbiddenError
    expect(() => {
      ReservationsService.validatePropertyScope({ role: 'OPERATIONS_MANAGER', propertyId: 1 }, 2);
    }).toThrow(/authorization for this property/i);

    // Op Manager null property throws ForbiddenError
    expect(() => {
      ReservationsService.validatePropertyScope({ role: 'OPERATIONS_MANAGER', propertyId: null }, 1);
    }).toThrow(/not assigned to any property/i);

    // Unknown role throws ForbiddenError
    expect(() => {
      ReservationsService.validatePropertyScope({ role: 'UNKNOWN_ROLE', propertyId: 1 }, 1);
    }).toThrow(/not authorized/i);
  });

  // ─── DEF-SEC-2.6B-01: Reservation History Property Scoping ─────────────────
  describe('DEF-SEC-2.6B-01: Reservation History Property Scoping', () => {
    test('12. Operations Manager assigned to Property 1 can access Property 1 reservation history (HTTP 200)', async () => {
      const res = await request(app)
        .get(`/api/v1/reservations/${prop1ResId}/history`)
        .set('Authorization', `Bearer ${opManagerProp1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test('13. Operations Manager assigned to Property 1 CANNOT access Property 2 reservation history (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/reservations/${prop2ResId}/history`)
        .set('Authorization', `Bearer ${opManagerProp1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/authorization for this property/i);
    });

    test('14. Receptionist assigned to Property 1 can access Property 1 reservation history (HTTP 200)', async () => {
      const res = await request(app)
        .get(`/api/v1/reservations/${prop1ResId}/history`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('15. Receptionist assigned to Property 1 CANNOT access Property 2 reservation history (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/reservations/${prop2ResId}/history`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/authorization for this property/i);
    });

    test('16. Operations Manager with null property assignment fails closed on history (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/reservations/${prop1ResId}/history`)
        .set('Authorization', `Bearer ${opManagerNullPropToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not assigned to any property/i);
    });

    test('17. Operations Manager with invalid property assignment fails closed on history (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/reservations/${prop1ResId}/history`)
        .set('Authorization', `Bearer ${opManagerInvalidPropToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/invalid property assignment/i);
    });

    test('18. ADMIN retains portfolio-wide access to reservation history on Property 1 and Property 2 (HTTP 200)', async () => {
      const p1Res = await request(app)
        .get(`/api/v1/reservations/${prop1ResId}/history`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(p1Res.status).toBe(200);

      const p2Res = await request(app)
        .get(`/api/v1/reservations/${prop2ResId}/history`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(p2Res.status).toBe(200);
    });

    test('19. OWNER retains portfolio-wide access to reservation history on Property 1 and Property 2 (HTTP 200)', async () => {
      const p1Res = await request(app)
        .get(`/api/v1/reservations/${prop1ResId}/history`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(p1Res.status).toBe(200);

      const p2Res = await request(app)
        .get(`/api/v1/reservations/${prop2ResId}/history`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(p2Res.status).toBe(200);
    });

    test('20. Nonexistent reservation ID returns HTTP 404 Not Found on history endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/reservations/999999/history')
        .set('Authorization', `Bearer ${opManagerProp1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── DEF-SEC-2.6B-02: Payment Proof Streaming Property Scoping ──────────────
  describe('DEF-SEC-2.6B-02: Payment Proof Streaming Property Scoping', () => {
    test('21. Operations Manager assigned to Property 1 can stream Property 1 payment proof (HTTP 200)', async () => {
      const res = await request(app)
        .get(`/api/v1/front-office/reservations/${prop1ResId}/payment-proof`)
        .set('Authorization', `Bearer ${opManagerProp1Token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image/i);
    });

    test('22. Operations Manager assigned to Property 1 CANNOT stream Property 2 payment proof (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/front-office/reservations/${prop2ResId}/payment-proof`)
        .set('Authorization', `Bearer ${opManagerProp1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/authorization for this property/i);
    });

    test('23. Receptionist assigned to Property 1 can stream Property 1 payment proof (HTTP 200)', async () => {
      const res = await request(app)
        .get(`/api/v1/front-office/reservations/${prop1ResId}/payment-proof`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image/i);
    });

    test('24. Receptionist assigned to Property 1 CANNOT stream Property 2 payment proof (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/front-office/reservations/${prop2ResId}/payment-proof`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/authorization for this property/i);
    });

    test('25. Operations Manager with null property assignment fails closed on payment proof (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/front-office/reservations/${prop1ResId}/payment-proof`)
        .set('Authorization', `Bearer ${opManagerNullPropToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not assigned to any property/i);
    });

    test('26. Operations Manager with invalid property assignment fails closed on payment proof (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/front-office/reservations/${prop1ResId}/payment-proof`)
        .set('Authorization', `Bearer ${opManagerInvalidPropToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/invalid property assignment/i);
    });

    test('27. ADMIN retains portfolio-wide access to payment proof across properties (HTTP 200)', async () => {
      const p1Res = await request(app)
        .get(`/api/v1/front-office/reservations/${prop1ResId}/payment-proof`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(p1Res.status).toBe(200);

      const p2Res = await request(app)
        .get(`/api/v1/front-office/reservations/${prop2ResId}/payment-proof`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(p2Res.status).toBe(200);
    });

    test('28. Nonexistent reservation ID returns HTTP 404 Not Found on payment proof endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/front-office/reservations/999999/payment-proof')
        .set('Authorization', `Bearer ${opManagerProp1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('29. Cross-property attempt does not expose file contents, filesystem path, or attachment metadata', async () => {
      const res = await request(app)
        .get(`/api/v1/front-office/reservations/${prop2ResId}/payment-proof`)
        .set('Authorization', `Bearer ${opManagerProp1Token}`);

      expect(res.status).toBe(403);
      // Ensure no file bytes or file paths are returned in response
      expect(res.text).not.toContain('storage/evidence');
      expect(res.text).not.toContain('test_proof');
      expect(res.body.data).toBeUndefined();
    });
  });
});
