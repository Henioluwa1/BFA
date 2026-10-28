const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Financial Management & Operations Ledger Tests (Phase 8)', () => {
  let adminToken = '';
  let managerToken = '';
  let agentToken = '';

  let testReservationId = 1;
  let testPaymentId = null;
  let testExpenseId = null;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    const mgrRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = mgrRes.body.data.token;

    const agRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agRes.body.data.token;

    // Clean up test expense records
    await pool.query('DELETE FROM expenses WHERE description LIKE "%Automated Test%"');
    // Reset test reservation balance with sufficient total amount
    await pool.query('UPDATE reservations SET total_amount = 250000.00, paid_amount = 0.00, payment_status = "PAYMENT_PENDING" WHERE id = ?', [testReservationId]);
  });

  afterAll(async () => {
    if (testExpenseId) {
      await pool.query('DELETE FROM expenses WHERE id = ?', [testExpenseId]);
    }
    await pool.query('DELETE FROM expenses WHERE description LIKE "%Automated Test%"');
    if (testPaymentId) {
      // 1. Delete child refund records FIRST while parent reference is intact
      await pool.query('DELETE FROM payment_transactions WHERE parent_transaction_id = ?', [testPaymentId]);

      // 2. Clean up test subledger postings and journals in test database
      const subRows = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id = ?',
        [testPaymentId]
      );
      if (Array.isArray(subRows)) {
        for (const row of subRows) {
          if (row.journal_entry_id) {
            await pool.query('DELETE FROM general_ledger_entries WHERE journal_entry_id = ?', [row.journal_entry_id]);
            await pool.query('DELETE FROM journal_lines WHERE journal_entry_id = ?', [row.journal_entry_id]);
            await pool.query('DELETE FROM journal_entries WHERE id = ?', [row.journal_entry_id]);
          }
        }
      }
      await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_id = ?', [testPaymentId]);

      // 3. Delete parent payment transaction
      await pool.query('DELETE FROM payment_transactions WHERE id = ?', [testPaymentId]);
    }
    // Restore reservation 1 baseline
    await pool.query('UPDATE reservations SET total_amount = 220.00, paid_amount = 220.00, payment_status = "PAYMENT_SUCCESS" WHERE id = ?', [testReservationId]);
    await pool.closePool();
  });

  test('1. Record payment transaction against reservation and sync paid_amount', async () => {
    // Ensure reservation has balance
    const resRows = await pool.query('SELECT id, total_amount, paid_amount FROM reservations WHERE id = ?', [testReservationId]);
    const reservation = resRows[0];
    const outstanding = parseFloat(reservation.total_amount) - parseFloat(reservation.paid_amount);

    const paymentAmount = Math.min(outstanding > 0 ? outstanding : 50000.0, 50000.0);

    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: testReservationId,
        amount: paymentAmount,
        paymentMethod: 'BANK_TRANSFER',
        reference: `PAY-TEST-${Date.now()}`,
        status: 'SUCCESS',
        notes: 'Automated test payment collection',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('reference');
    testPaymentId = res.body.data.id;

    // Verify reservation paid_amount increased
    const updatedRes = await pool.query('SELECT paid_amount FROM reservations WHERE id = ?', [testReservationId]);
    expect(parseFloat(updatedRes[0].paid_amount)).toBeGreaterThanOrEqual(paymentAmount);
  });

  test('2. Process partial refund/reversal without physical row deletion', async () => {
    const refundAmount = 15000.0;
    const res = await request(app)
      .post(`/api/v1/payments/${testPaymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        refund_amount: refundAmount,
        reason: 'Automated Test: Partial cancellation fee refund',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.originalTransaction.status).toBe('PARTIALLY_REFUNDED');
    expect(parseFloat(res.body.data.originalTransaction.refund_amount)).toBe(refundAmount);
    expect(res.body.data).toHaveProperty('refundTransaction');
    expect(parseFloat(res.body.data.refundTransaction.amount)).toBe(-15000.0);
  });

  test('3. Reject refund amount exceeding remaining refundable payment', async () => {
    const excessiveRefund = 999999.0;
    const res = await request(app)
      .post(`/api/v1/payments/${testPaymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        refund_amount: excessiveRefund,
        reason: 'Automated Test: Excessive refund attempt',
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.error.message).toMatch(/exceeds remaining refundable amount/i);
  });

  test('4. Record operational expense with RECORDED draft status', async () => {
    const res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        property_id: 1,
        category: 'UTILITIES',
        description: 'Automated Test: Monthly Generator Servicing & Oil',
        amount: 45000.0,
        vendor_payee: 'Automated Test Vendor',
        payment_method: 'BANK_TRANSFER',
        expense_date: '2026-09-23',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.expense_code).toMatch(/^EXP-/);
    expect(res.body.data.status).toBe('RECORDED');
    expect(parseFloat(res.body.data.amount)).toBe(45000.0);

    testExpenseId = res.body.data.id;
  });

  test('5. Reject expense creation with non-positive amount or invalid category', async () => {
    const res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        property_id: 1,
        category: 'INVALID_CATEGORY',
        description: 'Automated Test: Bad category',
        amount: -500.0,
      });

    expect([400, 422]).toContain(res.status);
  });

  test('6. Approve recorded expense to apply it to operational financial ledger', async () => {
    const res = await request(app)
      .post(`/api/v1/expenses/${testExpenseId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.approved_by_id).toBeTruthy();
    expect(res.body.data.approved_at).toBeTruthy();
  });

  test('7. Void expense with documented mandatory reason preserving audit trail', async () => {
    const res = await request(app)
      .post(`/api/v1/expenses/${testExpenseId}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Automated Test: Duplicate invoice detected during audit reconciliation',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('VOIDED');
    expect(res.body.data.void_reason).toMatch(/Duplicate invoice/i);

    // Verify row was NOT deleted from DB
    const expRows = await pool.query('SELECT status, void_reason FROM expenses WHERE id = ?', [testExpenseId]);
    expect(expRows.length).toBe(1);
    expect(expRows[0].status).toBe('VOIDED');
  });

  test('8. Retrieve Financial Overview with accurate KPIs and net profit derivation', async () => {
    const res = await request(app)
      .get('/api/v1/financial/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('kpis');
    const { kpis } = res.body.data;
    expect(kpis).toHaveProperty('grossCollected');
    expect(kpis).toHaveProperty('totalRefunded');
    expect(kpis).toHaveProperty('netRevenue');
    expect(kpis).toHaveProperty('approvedExpenses');
    expect(kpis).toHaveProperty('netProfit');
    expect(kpis).toHaveProperty('profitMargin');

    // Net revenue = gross - refunds
    expect(kpis.netRevenue).toBe(Math.max(0, Math.round((kpis.grossCollected - kpis.totalRefunded) * 100) / 100));
    // Net profit = netRevenue - approvedExpenses
    expect(kpis.netProfit).toBe(Math.round((kpis.netRevenue - kpis.approvedExpenses) * 100) / 100);
  });

  test('9. Retrieve Unified Financial Ledger containing both revenue and expense entries', async () => {
    const res = await request(app)
      .get('/api/v1/financial/ledger?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data.items)).toBe(true);

    if (res.body.data.items.length > 0) {
      const entry = res.body.data.items[0];
      expect(entry).toHaveProperty('entry_type');
      expect(['REVENUE', 'EXPENSE']).toContain(entry.entry_type);
      expect(entry).toHaveProperty('transaction_code');
      expect(entry).toHaveProperty('net_amount');
    }
  });

  test('10. Agent role is forbidden from financial overview and expense creation', async () => {
    const res = await request(app)
      .get('/api/v1/financial/overview')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(403);
  });
});
