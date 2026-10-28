const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');
const FinancialService = require('../src/modules/financial/financial.service');
const ReportsService = require('../src/modules/reports/reports.service');

describe('Reports Security Enforcement & Financial Reconciliation Suite (Phases 2 & 3)', () => {
  let adminToken;
  let managerProp1Token;
  let managerUnassignedToken;
  let agentToken;
  let staffToken;

  const testApartmentId = 1;
  const testPropertyId = 1;
  const runSuffix = Date.now();

  beforeAll(async () => {
    // Generate authoritative cryptographic tokens
    adminToken = jwt.sign(
      { id: 991, email: 'admin.sec@bfa.com', role: 'ADMIN', propertyId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    managerProp1Token = jwt.sign(
      { id: 992, email: 'mgr1.sec@bfa.com', role: 'MANAGER', propertyId: 1 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    managerUnassignedToken = jwt.sign(
      { id: 993, email: 'mgr.unassigned@bfa.com', role: 'MANAGER', propertyId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    agentToken = jwt.sign(
      { id: 994, email: 'agent.sec@bfa.com', role: 'AGENT', agentId: 1, propertyId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    staffToken = jwt.sign(
      { id: 995, email: 'staff.sec@bfa.com', role: 'STAFF', propertyId: 1 },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    // Initial cleanup of any remnant test records
    await pool.query('DELETE FROM payment_transactions WHERE transaction_reference LIKE "TXN-TEST-%"');
    await pool.query('DELETE FROM reservations WHERE reservation_code LIKE "RES-TEST-%"');
    await pool.query('DELETE FROM expenses WHERE expense_code LIKE "EXP-TEST-%"');
  });

  afterAll(async () => {
    // Clean up all synthetic test rows
    await pool.query('DELETE FROM payment_transactions WHERE transaction_reference LIKE "TXN-TEST-%"');
    await pool.query('DELETE FROM reservations WHERE reservation_code LIKE "RES-TEST-%"');
    await pool.query('DELETE FROM expenses WHERE expense_code LIKE "EXP-TEST-%"');
    await pool.closePool();
  });

  describe('Phase 2: Endpoint Authentication, RBAC, and Property Isolation', () => {
    it('1. GET /api/v1/reports/financial rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/reports/financial');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('2. GET /api/v1/reports/reservations rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/reports/reservations');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('3. GET /api/v1/reports/financial rejects AGENT role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${agentToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('4. GET /api/v1/reports/financial rejects STAFF role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('5. GET /api/v1/reports/financial allows ADMIN access with 200 OK', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
    });

    it('6. GET /api/v1/reports/financial allows property-assigned MANAGER access with 200 OK', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${managerProp1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
    });

    it('7. Property-scoped MANAGER attempting to query another property (?propertyId=2) is rejected with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial?propertyId=2')
        .set('Authorization', `Bearer ${managerProp1Token}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('authorization for this property');
    });

    it('8. Unassigned MANAGER (propertyId: null) fails closed with 403 FORBIDDEN on reports/financial', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${managerUnassignedToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('not assigned to any property');
    });

    it('9. Unassigned MANAGER (propertyId: null) fails closed with 403 FORBIDDEN on reports/reservations', async () => {
      const res = await request(app)
        .get('/api/v1/reports/reservations')
        .set('Authorization', `Bearer ${managerUnassignedToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('not assigned to any property');
    });

    it('10. AGENT role attempting to query other agents commissions is rejected with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/commissions?agentId=99')
        .set('Authorization', `Bearer ${agentToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('11. Neighboring report routes fail closed for unassigned MANAGER (payments, expenses, maintenance, inspections)', async () => {
      const endpoints = ['payments', 'expenses', 'maintenance', 'inspections'];
      for (const ep of endpoints) {
        const res = await request(app)
          .get(`/api/v1/reports/${ep}`)
          .set('Authorization', `Bearer ${managerUnassignedToken}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('Phase 3: Financial Calculation Reconciliation & Cross-Service Parity', () => {
    it('12. ReportsService.getFinancialReport and FinancialService.getOverview exhibit exact calculation parity', async () => {
      const user = { role: 'ADMIN', propertyId: null };
      const reportRes = await ReportsService.getFinancialReport({ user });
      const overviewRes = await FinancialService.getOverview({ user });

      // Check authoritative calculation parity
      expect(reportRes.summary.totalRevenue).toBe(overviewRes.kpis.bookedRevenue);
      expect(reportRes.summary.grossCollected).toBe(overviewRes.kpis.grossCollected);
      expect(reportRes.summary.totalRefunded).toBe(overviewRes.kpis.totalRefunded);
      expect(reportRes.summary.netRevenue).toBe(overviewRes.kpis.netRevenue);
      expect(reportRes.summary.totalOutstanding).toBe(overviewRes.kpis.outstandingReceivables);
      expect(reportRes.summary.totalExpenses).toBe(overviewRes.kpis.approvedExpenses);
      expect(reportRes.summary.netProfit).toBe(overviewRes.kpis.netProfit);
      expect(reportRes.summary.profitMargin).toBe(overviewRes.kpis.profitMargin);
    });

    it('13. Synthetic reservation matrix validates active vs cancelled revenue and receivables', async () => {
      const testFrom = '2029-01-01';
      const testTo = '2029-01-10';

      // 1. Unpaid reservation (50,000 total, 0 paid)
      const res1 = await pool.query(
        `INSERT INTO reservations 
          (reservation_code, guest_id, apartment_id, property_id, check_in_date, check_out_date, total_amount, paid_amount, status, payment_status)
         VALUES (?, 1, ?, ?, '2029-01-02', '2029-01-03', 50000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING')`,
        [`RES-TEST-UNPAID-${runSuffix}`, testApartmentId, testPropertyId]
      );

      // 2. Partially paid reservation (100,000 total, 40,000 paid)
      const res2 = await pool.query(
        `INSERT INTO reservations 
          (reservation_code, guest_id, apartment_id, property_id, check_in_date, check_out_date, total_amount, paid_amount, status, payment_status)
         VALUES (?, 1, ?, ?, '2029-01-03', '2029-01-04', 100000.00, 40000.00, 'CONFIRMED', 'PARTIALLY_PAID')`,
        [`RES-TEST-PARTIAL-${runSuffix}`, testApartmentId, testPropertyId]
      );

      // 3. Fully paid reservation (80,000 total, 80,000 paid)
      const res3 = await pool.query(
        `INSERT INTO reservations 
          (reservation_code, guest_id, apartment_id, property_id, check_in_date, check_out_date, total_amount, paid_amount, status, payment_status)
         VALUES (?, 1, ?, ?, '2029-01-04', '2029-01-05', 80000.00, 80000.00, 'CONFIRMED', 'PAYMENT_SUCCESS')`,
        [`RES-TEST-FULL-${runSuffix}`, testApartmentId, testPropertyId]
      );

      // 4. Cancelled reservation (120,000 total, 0 paid) -> MUST NOT inflate booked revenue or receivables
      const res4 = await pool.query(
        `INSERT INTO reservations 
          (reservation_code, guest_id, apartment_id, property_id, check_in_date, check_out_date, total_amount, paid_amount, status, payment_status)
         VALUES (?, 1, ?, ?, '2029-01-05', '2029-01-06', 120000.00, 0.00, 'CANCELLED', 'PAYMENT_PENDING')`,
        [`RES-TEST-CANCEL-${runSuffix}`, testApartmentId, testPropertyId]
      );

      // 5. Add matching payment transactions for the paid amounts
      await pool.query(
        `INSERT INTO payment_transactions
          (reservation_id, transaction_reference, amount, payment_method, status, paid_at)
         VALUES (?, ?, 40000.00, 'BANK_TRANSFER', 'SUCCESS', '2029-01-03 10:00:00')`,
        [res2.insertId, `TXN-TEST-P1-${runSuffix}`]
      );

      await pool.query(
        `INSERT INTO payment_transactions
          (reservation_id, transaction_reference, amount, payment_method, status, paid_at)
         VALUES (?, ?, 80000.00, 'PAYSTACK', 'SUCCESS', '2029-01-04 10:00:00')`,
        [res3.insertId, `TXN-TEST-P2-${runSuffix}`]
      );

      // 6. Add an approved operational expense in this date range
      await pool.query(
        `INSERT INTO expenses
          (expense_code, property_id, apartment_id, category, amount, description, vendor_payee, payment_method, status, expense_date)
         VALUES (?, ?, ?, 'CLEANING', 25000.00, 'Cleaning test batch', 'CleanCorp', 'BANK_TRANSFER', 'APPROVED', '2029-01-04')`,
        [`EXP-TEST-001-${runSuffix}`, testPropertyId, testApartmentId]
      );

      // Execute calculation queries on both services for this test window
      const user = { role: 'ADMIN', propertyId: null };
      const reportData = await ReportsService.getFinancialReport({
        propertyId: testPropertyId,
        fromDate: testFrom,
        toDate: testTo,
        user,
      });

      const overviewData = await FinancialService.getOverview({
        propertyId: testPropertyId,
        fromDate: testFrom,
        toDate: testTo,
        user,
      });

      // Expected values:
      // Active booked revenue = 50,000 + 100,000 + 80,000 = 230,000 (120,000 cancelled ignored)
      // Paid on reservations = 0 + 40,000 + 80,000 = 120,000
      // Outstanding receivables = 230,000 - 120,000 = 110,000
      // Gross collected = 40,000 + 80,000 = 120,000
      // Total refunded = 0
      // Net revenue = 120,000
      // Approved expenses = 25,000
      // Net operating profit = 120,000 - 25,000 = 95,000

      expect(reportData.summary.totalRevenue).toBe(230000);
      expect(overviewData.kpis.bookedRevenue).toBe(230000);

      expect(reportData.summary.totalOutstanding).toBe(110000);
      expect(overviewData.kpis.outstandingReceivables).toBe(110000);

      expect(reportData.summary.grossCollected).toBe(120000);
      expect(overviewData.kpis.grossCollected).toBe(120000);

      expect(reportData.summary.netRevenue).toBe(120000);
      expect(overviewData.kpis.netRevenue).toBe(120000);

      expect(reportData.summary.totalExpenses).toBe(25000);
      expect(overviewData.kpis.approvedExpenses).toBe(25000);

      expect(reportData.summary.netProfit).toBe(95000);
      expect(overviewData.kpis.netProfit).toBe(95000);

      expect(reportData.summary.reservationCount).toBe(3); // only active reservations
      expect(reportData.summary.totalReservationsCount).toBe(4); // includes cancelled
    });

    it('14. Validates chart data shapes and key bindings in financial overview and reports', async () => {
      const user = { role: 'ADMIN', propertyId: null };
      const overview = await FinancialService.getOverview({ user });
      const report = await ReportsService.getFinancialReport({ user });

      // Verify monthlyTrends shape in FinancialService overview
      expect(Array.isArray(overview.monthlyTrends)).toBe(true);
      if (overview.monthlyTrends.length > 0) {
        const item = overview.monthlyTrends[0];
        expect(item).toHaveProperty('period');
        expect(typeof item.period).toBe('string');
        expect(item).toHaveProperty('bookedRevenue');
        expect(item).toHaveProperty('netCollections');
        expect(item).toHaveProperty('approvedExpenses');
        expect(item).toHaveProperty('netProfit');
      }

      // Verify receivablesBreakdown shape in FinancialService overview
      expect(Array.isArray(overview.receivablesBreakdown)).toBe(true);
      if (overview.receivablesBreakdown.length > 0) {
        const item = overview.receivablesBreakdown[0];
        expect(item).toHaveProperty('property_name');
        expect(item).toHaveProperty('outstanding_amount');
      }

      // Verify monthlyTrends shape in ReportsService
      expect(Array.isArray(report.monthlyTrends)).toBe(true);
      if (report.monthlyTrends.length > 0) {
        const item = report.monthlyTrends[0];
        expect(item).toHaveProperty('period');
        expect(item).toHaveProperty('bookedRevenue');
        expect(item).toHaveProperty('netCollections');
        expect(item).toHaveProperty('approvedExpenses');
      }
    });
  });
});
