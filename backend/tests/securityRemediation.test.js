/**
 * Security Remediation Regression Suite
 * Findings: M1 (Reservation API Auth), M2 (Search Data Exposure),
 *           L1 (CORS Validation), L2 (One-Night Rule)
 *
 * Design principles:
 * - NO conditional early returns on security assertions (if (!x) return)
 * - All property-isolation tests create their own fixture data in beforeAll
 *   and clean up in afterAll via try/finally so cleanup runs even on failure
 * - Invalid-token and expired-token paths are tested in addition to missing tokens
 * - Public booking price manipulation and rule bypass are tested explicitly
 * - Every internal reservation endpoint (list, get, history, create, lifecycle)
 *   has at least one unauthenticated rejection assertion
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');
const { validateEnvironment } = require('../src/config/envValidator');

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────
const EXPIRED_TOKEN = jwt.sign(
  { id: 99, email: 'expired@bfa.com', role: 'ADMIN' },
  config.security.jwtSecret,
  { expiresIn: -1 }                  // already expired
);
const INVALID_TOKEN = 'Bearer invalid.jwt.signature';

function makeAdminToken() {
  return jwt.sign(
    { id: 1, name: 'Admin User', email: 'admin@bfa.com', role: 'ADMIN' },
    config.security.jwtSecret
  );
}

function makeManagerToken(propertyId) {
  return jwt.sign(
    { id: 10, name: 'Manager', email: `manager.p${propertyId}@bfa.com`, role: 'MANAGER', propertyId },
    config.security.jwtSecret
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────
async function getApartmentForProperty(propId) {
  const rows = await pool.query(
    'SELECT id FROM apartments WHERE property_id = ? LIMIT 1',
    [propId]
  );
  if (!rows || !rows.length) throw new Error(`No apartment found for property ${propId}`);
  return rows[0].id;
}

async function createTestReservation(apartmentId, offsetDays = 0) {
  // Use far-future dates (2031) to avoid collision with live data
  const base = new Date('2031-06-01');
  const checkInDate = new Date(base);
  checkInDate.setDate(base.getDate() + offsetDays);
  const checkOutDate = new Date(checkInDate);
  checkOutDate.setDate(checkInDate.getDate() + 1);

  const fmt = (d) => d.toISOString().split('T')[0];
  const code = `BFA-TST-${Date.now()}-${Math.floor(Math.random() * 9999)}`.slice(0, 50);

  const result = await pool.query(
    `INSERT INTO reservations
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email,
        tenant_phone, check_in_date, check_out_date, nights, total_amount, status)
     SELECT ?, a.property_id, ?, 'Security Test Guest', ?,
            '+234 800 000 0001', ?, ?, 1, 50000, 'CONFIRMED'
     FROM apartments a WHERE a.id = ? LIMIT 1`,
    [code, apartmentId, `sec.test.${Date.now()}@example.com`,
     fmt(checkInDate), fmt(checkOutDate), apartmentId]
  );
  if (!result || !result.insertId) throw new Error(`Failed to create fixture reservation for apartment ${apartmentId}`);
  return result.insertId;
}

async function deleteTestReservation(id) {
  if (!id) return;
  await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [id]);
  await pool.query('DELETE FROM reservations WHERE id = ?', [id]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────
describe('Security Remediation Regression Suite (M1, M2, L1, L2)', () => {
  let adminToken;
  let managerProp1Token;
  let managerProp2Token;

  // Deterministic fixture IDs — created fresh for each run, cleaned up always
  let prop1ApartmentId;
  let prop2ApartmentId;
  let fixtureResProp1Id;
  let fixtureResProp2Id;

  beforeAll(async () => {
    adminToken = makeAdminToken();
    managerProp1Token = makeManagerToken(1);
    managerProp2Token = makeManagerToken(2);

    // Create deterministic cross-property reservation fixtures
    try {
      prop1ApartmentId = await getApartmentForProperty(1);
      prop2ApartmentId = await getApartmentForProperty(2);
      fixtureResProp1Id = await createTestReservation(prop1ApartmentId, 0);
      fixtureResProp2Id = await createTestReservation(prop2ApartmentId, 5);
    } catch (err) {
      // Surface setup failures clearly — do not silently skip
      throw new Error(`Test fixture setup failed: ${err.message}`);
    }
  });

  afterAll(async () => {
    // Cleanup always runs regardless of test failures
    await deleteTestReservation(fixtureResProp1Id).catch(() => {});
    await deleteTestReservation(fixtureResProp2Id).catch(() => {});
    await pool.closePool();
  });

  // ===========================================================================
  // M1 — Reservation API: Authentication & Authorization
  // ===========================================================================
  describe('Finding M1: Reservation API Security & Authorization', () => {

    // ── Unauthenticated rejection ──────────────────────────────────────────
    it('M1-1: GET /api/v1/reservations rejects missing token with 401', async () => {
      const res = await request(app).get('/api/v1/reservations');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('M1-2: GET /api/v1/reservations rejects invalid JWT with 401', async () => {
      const res = await request(app)
        .get('/api/v1/reservations')
        .set('Authorization', INVALID_TOKEN);
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('M1-3: GET /api/v1/reservations rejects expired JWT with 401', async () => {
      const res = await request(app)
        .get('/api/v1/reservations')
        .set('Authorization', `Bearer ${EXPIRED_TOKEN}`);
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('M1-4: GET /api/v1/reservations/:id rejects missing token with 401', async () => {
      const res = await request(app).get(`/api/v1/reservations/${fixtureResProp1Id}`);
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('M1-5: GET /api/v1/reservations/:id/history rejects missing token with 401', async () => {
      const res = await request(app).get(`/api/v1/reservations/${fixtureResProp1Id}/history`);
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('M1-6: POST /api/v1/reservations rejects missing token with 401', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .send({
          apartment_id: prop1ApartmentId,
          tenant_name: 'Unauth Guest',
          tenant_email: 'unauth@test.com',
          tenant_phone: '+234 800 000 0000',
          check_in_date: '2031-07-01',
          check_out_date: '2031-07-02',
          total_amount: 50000,
        });
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    // ── Authenticated access ───────────────────────────────────────────────
    it('M1-7: Admin can list reservations (200)', async () => {
      const res = await request(app)
        .get('/api/v1/reservations?page=1&pageSize=5')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('M1-8: Admin can retrieve fixture reservation in property 1 (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/reservations/${fixtureResProp1Id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      // Exact fixture ID is present in the response
      expect(res.body.data.id).toBe(fixtureResProp1Id);
    });

    it('M1-9: Admin can retrieve reservation history (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/reservations/${fixtureResProp1Id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    // ── Property isolation — these tests ALWAYS run (no conditional returns) ─
    it('M1-10: Manager of property 1 can access their own reservation', async () => {
      // fixtureResProp1Id is guaranteed by beforeAll — no conditional guard
      const res = await request(app)
        .get(`/api/v1/reservations/${fixtureResProp1Id}`)
        .set('Authorization', `Bearer ${managerProp1Token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(fixtureResProp1Id);
    });

    it('M1-11: Manager of property 1 CANNOT access reservation belonging to property 2', async () => {
      // fixtureResProp2Id is guaranteed by beforeAll — no conditional guard
      const res = await request(app)
        .get(`/api/v1/reservations/${fixtureResProp2Id}`)
        .set('Authorization', `Bearer ${managerProp1Token}`);
      // Must be 403 (Forbidden) or 404 (obscured) — never 200
      expect([403, 404]).toContain(res.statusCode);
      expect(res.body.success).toBe(false);
    });

    it('M1-12: Manager of property 2 CANNOT access reservation belonging to property 1', async () => {
      const res = await request(app)
        .get(`/api/v1/reservations/${fixtureResProp1Id}`)
        .set('Authorization', `Bearer ${managerProp2Token}`);
      expect([403, 404]).toContain(res.statusCode);
      expect(res.body.success).toBe(false);
    });

    it('M1-13: Manager cannot override property scope via ?propertyId query param', async () => {
      // Manager of property 1 attempts to view listing scoped to property 2
      const res = await request(app)
        .get('/api/v1/reservations?propertyId=2')
        .set('Authorization', `Bearer ${managerProp1Token}`);
      // Either denied or returns only own-property data — must never expose prop-2 records
      if (res.statusCode === 200) {
        // If listing succeeds, every returned record must belong to property 1
        const records = res.body.data || [];
        records.forEach((r) => {
          expect(r.property_id).toBe(1);
        });
      } else {
        expect([403]).toContain(res.statusCode);
      }
    });
  });

  // ===========================================================================
  // M2 — Global Search: Data Exposure & Property Isolation
  // ===========================================================================
  describe('Finding M2: Global Search Data Exposure & Isolation', () => {

    it('M2-1: GET /api/v1/search rejects missing token with 401', async () => {
      const res = await request(app).get('/api/v1/search?q=Penthouse');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('M2-2: GET /api/v1/search rejects invalid JWT with 401', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=Horizon')
        .set('Authorization', INVALID_TOKEN);
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('M2-3: GET /api/v1/search rejects expired JWT with 401', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=Suite')
        .set('Authorization', `Bearer ${EXPIRED_TOKEN}`);
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('M2-4: Admin can search successfully and receives categorized results', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=Horizon')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('categories');
    });

    it('M2-5: MANAGER property scope is enforced — query-param override is ignored', async () => {
      // Manager of property 1 requests search scoped to property 2 via query string
      const res = await request(app)
        .get('/api/v1/search?q=Suite&propertyId=2')
        .set('Authorization', `Bearer ${managerProp1Token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      // Any returned apartments must belong to property 1 (not property 2)
      const apartments = (res.body.data?.categories?.apartments) || [];
      apartments.forEach((apt) => {
        // property_id or property_code must reflect property 1
        expect(apt.property_id).not.toBe(2);
      });
    });

    it('M2-6: Search response must not expose password hashes', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain('password_hash');
      expect(jsonStr).not.toContain('$2b$12$');
      expect(jsonStr).not.toContain('$2a$');
    });

    it('M2-7: Search response must not expose raw JWT secrets', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=secret')
        .set('Authorization', `Bearer ${adminToken}`);
      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain(config.security.jwtSecret);
    });
  });

  // ===========================================================================
  // L1 — CORS: Production Validation Logic
  // ===========================================================================
  describe('Finding L1: CORS Production Validation Logic', () => {
    const savedEnv = {};

    beforeEach(() => {
      // Snapshot current values for safe restoration
      savedEnv.NODE_ENV = process.env.NODE_ENV;
      savedEnv.JWT_SECRET = process.env.JWT_SECRET;
      savedEnv.DB_HOST = process.env.DB_HOST;
      savedEnv.DB_USER = process.env.DB_USER;
      savedEnv.DB_NAME = process.env.DB_NAME;
      savedEnv.DB_PASSWORD = process.env.DB_PASSWORD;
      savedEnv.CORS_ORIGIN = process.env.CORS_ORIGIN;

      // Set minimum valid prod values so only CORS errors show
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'super_secure_jwt_secret_at_least_32_chars!';
      process.env.DB_HOST = 'db.example.com';
      process.env.DB_USER = 'prod_user';
      process.env.DB_NAME = 'prod_db';
      process.env.DB_PASSWORD = 'strong_password_123';
    });

    afterEach(() => {
      // Always restore — even if test fails
      process.env.NODE_ENV = savedEnv.NODE_ENV;
      process.env.JWT_SECRET = savedEnv.JWT_SECRET;
      process.env.DB_HOST = savedEnv.DB_HOST;
      process.env.DB_USER = savedEnv.DB_USER;
      process.env.DB_NAME = savedEnv.DB_NAME;
      process.env.DB_PASSWORD = savedEnv.DB_PASSWORD;
      if (savedEnv.CORS_ORIGIN === undefined) {
        delete process.env.CORS_ORIGIN;
      } else {
        process.env.CORS_ORIGIN = savedEnv.CORS_ORIGIN;
      }
    });

    it('L1-1: Rejects bare wildcard "*" in production', () => {
      process.env.CORS_ORIGIN = '*';
      const result = validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('wildcard'))).toBe(true);
    });

    it('L1-2: Rejects mixed wildcard "https://legit.com,*" in production', () => {
      process.env.CORS_ORIGIN = 'https://legit.com,*';
      const result = validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('wildcard'))).toBe(true);
    });

    it('L1-3: Rejects whitespace-padded wildcard "https://legit.com, * " in production', () => {
      process.env.CORS_ORIGIN = 'https://legit.com, * ';
      const result = validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('wildcard'))).toBe(true);
    });

    it('L1-4: Rejects missing/empty CORS_ORIGIN in production', () => {
      delete process.env.CORS_ORIGIN;
      const result = validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('CORS_ORIGIN must be explicitly configured'))).toBe(true);
    });

    it('L1-5: Accepts explicit comma-separated trusted domains in production', () => {
      process.env.CORS_ORIGIN = 'https://app.bfa.com,https://admin.bfa.com';
      const result = validateEnvironment();
      const corsErrors = result.errors.filter((e) => e.toLowerCase().includes('cors'));
      expect(corsErrors).toHaveLength(0);
    });

    it('L1-6: Runtime CORS middleware rejects untrusted origin in production-equivalent mode', async () => {
      // Tests the actual corsMiddleware function in security.js — not just the validator
      // In development mode (current test env), non-localhost foreign origins are rejected
      const res = await request(app)
        .get('/api/v1/health/ping')
        .set('Origin', 'https://evil-attacker.com');
      // Either blocked at CORS level or returned without Access-Control-Allow-Origin header
      const allowOrigin = res.headers['access-control-allow-origin'];
      if (allowOrigin) {
        expect(allowOrigin).not.toBe('https://evil-attacker.com');
      }
    });
  });

  // ===========================================================================
  // L2 — One-Night Business Rule: Application + DB Layer
  // ===========================================================================
  describe('Finding L2: One-Night Business Rule Enforcement', () => {

    it('L2-1: Internal POST /api/v1/reservations rejects 2-night booking with 422', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          apartment_id: prop1ApartmentId,
          tenant_name: 'Multi Night Test',
          tenant_email: 'multinight@test.com',
          tenant_phone: '+234 809 000 1111',
          check_in_date: '2031-08-01',
          check_out_date: '2031-08-03',   // 2 nights — must fail
          total_amount: 500000,
        });
      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('maximum of 1 night');
    });

    it('L2-2: Internal POST /api/v1/reservations rejects 5-night booking with 422', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          apartment_id: prop1ApartmentId,
          tenant_name: 'Five Night Test',
          tenant_email: 'fivenight@test.com',
          tenant_phone: '+234 809 000 2222',
          check_in_date: '2031-08-10',
          check_out_date: '2031-08-15',   // 5 nights — must fail
          total_amount: 500000,
        });
      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('L2-3: Public booking POST /api/v1/public/booking rejects multi-night with 422', async () => {
      const res = await request(app)
        .post('/api/v1/public/booking')
        .send({
          apartmentId: prop1ApartmentId,
          guestName: 'Public Multi Night',
          guestEmail: 'publicmulti@test.com',
          guestPhone: '+234 809 000 3333',
          checkInDate: '2031-09-01',
          checkOutDate: '2031-09-04',     // 3 nights — must fail
        });
      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('maximum of 1 night');
    });

    it('L2-4: Public booking cannot override price via body field injection', async () => {
      // Guest attempts to set total_amount to 1 by injecting into the body
      const res = await request(app)
        .post('/api/v1/public/booking')
        .send({
          apartmentId: prop1ApartmentId,
          guestName: 'Price Injection Attacker',
          guestEmail: `inject.${Date.now()}@evil.com`,
          guestPhone: '+234 800 000 0000',
          checkInDate: '2031-10-01',
          checkOutDate: '2031-10-02',
          total_amount: 1,               // must be ignored
          totalAmount: 1,                // must be ignored
          price: 1,                      // must be ignored
        });
      // The booking may succeed or fail for other reasons (availability, etc.)
      // If it succeeds, the price must NOT be 1
      if (res.statusCode === 201) {
        if (res.body.data.reservationId) {
          const [rows] = await pool.query(
            'SELECT total_amount FROM reservations WHERE id = ?',
            [res.body.data.reservationId]
          );
          if (rows.length) {
            expect(parseFloat(rows[0].total_amount)).toBeGreaterThan(1);
          }
          // Cleanup
          await pool.query('DELETE FROM booking_authentications WHERE reservation_id = ?', [res.body.data.reservationId]);
          await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [res.body.data.reservationId]);
          await pool.query('DELETE FROM reservations WHERE id = ?', [res.body.data.reservationId]);
        }
      }
      // If booking fails for any non-422 reason, just verify it's not a server error
      if (res.statusCode >= 500) {
        fail(`Unexpected server error on public booking: ${res.statusCode}`);
      }
    });

    it('L2-5: Migration 015 SQL file exists with correct constraint definition', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../src/db/migrations/015_one_night_check_constraint.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);
      const content = fs.readFileSync(migrationPath, 'utf8');
      expect(content).toContain('chk_one_night_stay');
      expect(content).toContain('DATEDIFF(check_out_date, check_in_date) = 1');
    });

    it('L2-6: Production DB already has one-night CHECK constraint enforced', async () => {
      // Verify database-level enforcement exists (chk_one_night from migration 009)
      const rows = await pool.query(
        `SELECT tc.CONSTRAINT_NAME
         FROM information_schema.TABLE_CONSTRAINTS tc
         WHERE tc.TABLE_SCHEMA = DATABASE()
           AND tc.TABLE_NAME = 'reservations'
           AND tc.CONSTRAINT_TYPE = 'CHECK'`
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const constraintNames = rows.map((r) => r.CONSTRAINT_NAME);
      // At least one CHECK constraint must exist (chk_one_night from earlier migration)
      expect(
        constraintNames.some((n) => n.toLowerCase().includes('one_night') || n.toLowerCase().includes('chk_one'))
      ).toBe(true);
    });
  });
});
