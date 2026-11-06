const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Priority B: Financial Statements, Reports & Subledger Reconciliations', () => {
  let adminToken = '';
  let managerToken = '';

  beforeAll(async () => {
    // Authenticate Admin
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    // Authenticate Manager
    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data.token;
  });



  test('1. Income Statement (P&L): Returns accrual revenue, operating expenses, and net operating income', async () => {
    const res = await request(app)
      .get('/api/v1/accounting/reports/income-statement')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('revenues');
    expect(data.revenues).toHaveProperty('accounts');
    expect(data.revenues).toHaveProperty('totalRevenue');
    expect(data).toHaveProperty('expenses');
    expect(data.expenses).toHaveProperty('accounts');
    expect(data.expenses).toHaveProperty('totalExpenses');
    expect(data).toHaveProperty('netOperatingIncome');
    expect(data).toHaveProperty('isProfitable');
    expect(typeof data.netOperatingIncome).toBe('number');
  });

  test('2. Income Statement bridge route: /api/v1/financial/income-statement works seamlessly', async () => {
    const res = await request(app)
      .get('/api/v1/financial/income-statement')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('netOperatingIncome');
  });

  test('3. Balance Sheet: Returns assets, liabilities, equity, and mathematical parity check', async () => {
    const res = await request(app)
      .get('/api/v1/accounting/reports/balance-sheet')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('assets');
    expect(data.assets).toHaveProperty('totalAssets');
    expect(data).toHaveProperty('liabilities');
    expect(data.liabilities).toHaveProperty('totalLiabilities');
    expect(data).toHaveProperty('equity');
    expect(data.equity).toHaveProperty('totalEquity');
    expect(data.equity).toHaveProperty('currentPeriodEarnings');
    expect(data).toHaveProperty('isBalanced');
    expect(data).toHaveProperty('discrepancy');
    expect(typeof data.assets.totalAssets).toBe('number');
  });

  test('4. Balance Sheet bridge route: /api/v1/financial/balance-sheet works seamlessly', async () => {
    const res = await request(app)
      .get('/api/v1/financial/balance-sheet')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalLiabilitiesAndEquity');
  });

  test('5. Cash Flow Statement: Returns direct operating cash inflows, outflows, and net cash flow', async () => {
    const res = await request(app)
      .get('/api/v1/accounting/reports/cash-flow')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('beginningCashBalance');
    expect(data).toHaveProperty('operatingActivities');
    expect(data.operatingActivities).toHaveProperty('inflows');
    expect(data.operatingActivities).toHaveProperty('outflows');
    expect(data.operatingActivities).toHaveProperty('netCashFlow');
    expect(data).toHaveProperty('endingCashBalance');
  });

  test('6. Receivables Report: Reconciles guest folio balances with debtor counts and aging', async () => {
    const res = await request(app)
      .get('/api/v1/accounting/reports/receivables')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('summary');
    expect(data.summary).toHaveProperty('totalOutstanding');
    expect(data.summary).toHaveProperty('totalBilled');
    expect(data.summary).toHaveProperty('debtorCount');
    expect(data).toHaveProperty('receivables');
    expect(Array.isArray(data.receivables)).toBe(true);
  });

  test('7. Refunds Reconciliation Report: Matches subledger refunds against transactions', async () => {
    const res = await request(app)
      .get('/api/v1/accounting/reports/refunds-reconciliation')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('summary');
    expect(data.summary).toHaveProperty('totalRefunded');
    expect(data.summary).toHaveProperty('netRetained');
    expect(data).toHaveProperty('refunds');
    expect(Array.isArray(data.refunds)).toBe(true);
  });

  test('8. Property Scoping: Passing propertyId filter scopes the returned report', async () => {
    const res = await request(app)
      .get('/api/v1/accounting/reports/income-statement?propertyId=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.filters.propertyId).toBe('1');
  });

  test('9. Unauthorized Access Guard: Unauthenticated requests are rejected with 401', async () => {
    const res = await request(app).get('/api/v1/accounting/reports/income-statement');
    expect(res.status).toBe(401);
  });
});

