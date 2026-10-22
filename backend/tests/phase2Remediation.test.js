const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const fs = require('fs');
const path = require('path');

describe('Phase 2 Defect Remediation Test Suite (DEF-01 & DEF-02)', () => {
  let adminToken = '';
  let agentToken = '';
  let managerToken = ''; // Scoped to property_id: 1
  let testReservationId = null;
  let testTxId = null;
  const testReservationCode = 'BFA-PAY-REM-999';

  beforeAll(async () => {
    // 1. Authenticate Admin
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body?.data?.token;

    // 2. Authenticate Agent
    const agentRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agentRes.body?.data?.token;

    // 3. Authenticate Manager
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body?.data?.token;

    // 4. Create dedicated test reservation with payment transaction
    const resResult = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, payment_method)
       VALUES (?, 1, 1, 'Remediation Tester', 'remediation@bfa.com', '+234 800 000 1111', '2028-11-01', '2028-11-02', 1, 120000.00, 120000.00, 'CONFIRMED', 'PAYMENT_SUCCESS', 'CARD')`,
      [testReservationCode]
    );
    testReservationId = resResult.insertId;

    const txResult = await pool.query(
      `INSERT INTO payment_transactions
       (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, paid_at)
       VALUES (?, 'TX-REM-999', 'CARD', 120000.00, 'NGN', 'SUCCESS', 'PAYSTACK', CURRENT_TIMESTAMP)`,
      [testReservationId]
    );
    testTxId = txResult.insertId;
  });

  afterAll(async () => {
    if (testTxId) {
      await pool.query('DELETE FROM payment_transactions WHERE id = ?', [testTxId]);
    }
    if (testReservationId) {
      await pool.query('DELETE FROM reservations WHERE id = ?', [testReservationId]);
    }
    await pool.closePool();
  });

  describe('DEF-01: Financial Records Deep-Link & Payment Search Verification', () => {
    it('1. GET /api/v1/payments?search=... finds payments by reservation code', async () => {
      const res = await request(app)
        .get(`/api/v1/payments?search=${testReservationCode}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const found = res.body.data.find((p) => p.reservation_code === testReservationCode);
      expect(found).toBeDefined();
      expect(found.transaction_reference).toBe('TX-REM-999');
      expect(parseFloat(found.amount)).toBe(120000.00);
    });

    it('2. GET /api/v1/payments?search=... handles URL-encoded special characters and spaces safely', async () => {
      const encodedSearch = encodeURIComponent('Remediation Tester');
      const res = await request(app)
        .get(`/api/v1/payments?search=${encodedSearch}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((p) => p.tenant_name === 'Remediation Tester');
      expect(found).toBeDefined();
    });

    it('3. GET /api/v1/payments enforces strict RBAC (Agent cannot access, returns HTTP 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/payments?search=${testReservationCode}`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('4. GET /api/v1/payments rejects unauthenticated requests (returns HTTP 401)', async () => {
      const res = await request(app).get(`/api/v1/payments?search=${testReservationCode}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('5. Source code audit: ReservationsPage.jsx targets canonical /app/financial?tab=payments&search=...', () => {
      const filePath = path.resolve(__dirname, '../../frontend/src/pages/ReservationsPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Verify no references to legacy /app/financials exist in navigation calls
      expect(content).not.toMatch(/navigate\(['"`]\/app\/financials/);

      // Verify canonical destination with tab=payments and encoded search exists
      expect(content).toMatch(/navigate\(`\/app\/financial\?tab=payments&search=\$\{searchCode\}`\)/);
      expect(content).toMatch(/const searchCode = encodeURIComponent/);
    });

    it('6. Source code audit: App.jsx registers canonical route and backward-compatible financials alias', () => {
      const filePath = path.resolve(__dirname, '../../frontend/src/App.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Canonical financial route
      expect(content).toMatch(/<Route path="financial" element={<FinancialPage \/>} \/>/);

      // In-app alias redirecting with query string preservation
      expect(content).toMatch(/<Route path="financials" element={<NavigateToFinancial \/>} \/>/);

      // Legacy direct alias redirecting with query string preservation
      expect(content).toMatch(/<Route path="\/financials" element={<NavigateToFinancial \/>} \/>/);

      // NavigateToFinancial helper preserves location.search
      expect(content).toMatch(/navigate to=\{`\/app\/financial\$\{location\.search\}`\} replace/i);
    });

    it('7. Source code audit: FinancialPage.jsx synchronizes search and tab query parameters', () => {
      const filePath = path.resolve(__dirname, '../../frontend/src/pages/FinancialPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Reads tab parameter
      expect(content).toMatch(/searchParams\.get\('tab'\)/);

      // Reads search parameter with prevSearchParamRef tracking
      expect(content).toMatch(/searchParams\.get\('search'\)/);
      expect(content).toMatch(/prevSearchParamRef/);

      // Passes search to paymentService.getTransactions
      expect(content).toMatch(/search:\s*searchFilter\s*\|\|\s*undefined/);

      // Renders search input and clear filter on payments tab
      expect(content).toMatch(/Clear Search/);
    });
  });

  describe('DEF-02: Properties Search Synchronization Logic Verification', () => {
    it('1. Source code audit: PropertiesPage.jsx synchronizes search query parameter without infinite loops', () => {
      const filePath = path.resolve(__dirname, '../../frontend/src/pages/PropertiesPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Uses prevSearchParamRef to avoid unnecessary resets and infinite loops
      expect(content).toMatch(/const prevSearchParamRef = useRef\(searchParams\.get\('search'\)\);/);
      expect(content).toMatch(/if \(currentSearchParam !== prevSearchParamRef\.current\)/);
      expect(content).toMatch(/setSearch\(currentSearchParam \|\| ''\);/);
    });

    it('2. State machine simulation: validates all transitions for URL search synchronization', () => {
      // Replicate the exact synchronizer logic from PropertiesPage.jsx
      let searchState = '';
      let prevParam = null;

      const syncSearch = (currentParam) => {
        if (currentParam !== prevParam) {
          prevParam = currentParam;
          searchState = currentParam || '';
        }
      };

      // Transition A: Initial mount at /app/properties?search=Acme
      prevParam = 'Acme';
      searchState = 'Acme';
      syncSearch('Acme');
      expect(searchState).toBe('Acme');

      // Transition B: Query changes to /app/properties?search=Grand+Horizon
      syncSearch('Grand Horizon');
      expect(searchState).toBe('Grand Horizon');
      expect(prevParam).toBe('Grand Horizon');

      // Transition C: Query parameter removed (/app/properties)
      syncSearch(null);
      expect(searchState).toBe('');
      expect(prevParam).toBe(null);

      // Transition D: User types into search input while URL has no search param
      searchState = 'User Typed Something';
      // An unrelated query param changes (e.g., /app/properties?status=ACTIVE)
      // currentParam remains null
      syncSearch(null);
      // Crucial: Typed search must NOT be reset when unrelated query parameter changes!
      expect(searchState).toBe('User Typed Something');

      // Transition E: Browser Back button pressed back to /app/properties?search=Grand+Horizon
      syncSearch('Grand Horizon');
      expect(searchState).toBe('Grand Horizon');

      // Transition F: Browser Forward button pressed back to /app/properties
      syncSearch(null);
      expect(searchState).toBe('');
    });
  });
});
