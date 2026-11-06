const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Financial Subledger-to-GL Reconciliation & Revenue Segregation Tests', () => {
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

  test('1. Subledger Reconciliation endpoint returns comparative operational vs posted balances', async () => {
    const res = await request(app)
      .get('/api/v1/accounting/reconcile')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('payments');
    expect(data.payments).toHaveProperty('operationalCount');
    expect(data.payments).toHaveProperty('postedCount');
    expect(data.payments).toHaveProperty('countDifference');
    expect(data).toHaveProperty('expenses');
    expect(data.expenses).toHaveProperty('operationalCount');
    expect(data.expenses).toHaveProperty('postedCount');
    expect(data.expenses).toHaveProperty('amountDifference');
  });

  test('2. Expense-to-GL Posting Bridge: Approving an expense creates posted journal entry & ledger lines', async () => {
    // Create operational expense in current open period (2026-10)
    const createRes = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: 1,
        category: 'MAINTENANCE',
        description: 'Bridge Test: Air conditioner compressor repair',
        amount: 35000.00,
        currency: 'NGN',
        payment_method: 'BANK_TRANSFER',
        expense_date: '2026-10-15',
        autoApprove: true,
      });

    expect([200, 201]).toContain(createRes.status);
    const expense = createRes.body.data;
    expect(expense.status).toBe('APPROVED');

    // Verify subledger posting record exists
    const records = await pool.query(
      `SELECT * FROM accounting_subledger_posting_records 
       WHERE source_module = 'EXPENSES' AND source_entity_id = ?`,
      [String(expense.id)]
    );
    expect(records.length).toBe(1);
    expect(records[0].status).toBe('POSTED');
    expect(records[0].journal_entry_id).toBeTruthy();

    // Verify journal entry & ledger lines
    const lines = await pool.query(
      'SELECT * FROM general_ledger_entries WHERE journal_entry_id = ?',
      [records[0].journal_entry_id]
    );
    expect(lines.length).toBe(2);
    // Double entry balance: Total Debit == Total Credit
    const totalDebit = lines.reduce((acc, l) => acc + parseFloat(l.debit), 0);
    const totalCredit = lines.reduce((acc, l) => acc + parseFloat(l.credit), 0);
    expect(totalDebit).toBe(35000.00);
    expect(totalCredit).toBe(35000.00);

    // Clean up test expense and journal lines
    await pool.query('DELETE FROM general_ledger_entries WHERE journal_entry_id = ?', [records[0].journal_entry_id]);
    await pool.query('DELETE FROM journal_entries WHERE id = ?', [records[0].journal_entry_id]);
    await pool.query('DELETE FROM accounting_subledger_posting_records WHERE id = ?', [records[0].id]);
    await pool.query('DELETE FROM expenses WHERE id = ?', [expense.id]);
  });

  test('3. Revenue Segregation: Advance guest payment credits Deferred Revenue (Liability), not immediate revenue', async () => {
    // Create reservation for future date
    const resInsert = await pool.query(`
      INSERT INTO reservations (
        reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone,
        check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, payment_method, source
      ) VALUES (
        CONCAT('BFA-ADV-', UNIX_TIMESTAMP()), 1, 1, 'Advance Guest', 'advance.guest@example.com', '+234800000002',
        '2028-09-01', '2028-09-02', 1, 50000.00, 50000.00, 'CONFIRMED', 'PAYMENT_SUCCESS', 'CARD', 'ONLINE'
      )
    `);
    const reservationId = resInsert.insertId;

    // Create payment transaction
    const payInsert = await pool.query(`
      INSERT INTO payment_transactions (
        transaction_reference, reservation_id, amount, payment_method, status, paid_at
      ) VALUES (
        CONCAT('TXN-ADV-', UNIX_TIMESTAMP()), ?, 50000.00, 'CARD', 'SUCCESS', '2026-10-20 12:00:00'
      )
    `, [reservationId]);
    const paymentId = payInsert.insertId;

    // Post payment through posting bridge
    const PostingBridgeService = require('../src/modules/accounting/postingBridge.service');
    const postingRecord = await PostingBridgeService.postPayment(paymentId);
    expect(postingRecord).toBeTruthy();
    expect(postingRecord.status).toBe('POSTED');

    // Check GL lines: Must credit 2020 (Guest Deferred Revenue), NOT 4010 (Accommodation Revenue)
    const lines = await pool.query(`
      SELECT gl.*, coa.account_code, coa.account_type, coa.account_name
      FROM general_ledger_entries gl
      JOIN chart_of_accounts coa ON gl.account_id = coa.id
      WHERE gl.journal_entry_id = ?
    `, [postingRecord.journal_entry_id]);

    const creditLine = lines.find((l) => parseFloat(l.credit) > 0);
    expect(creditLine).toBeTruthy();
    expect(creditLine.account_type).toBe('LIABILITY');
    expect(creditLine.account_code).toBe('2020'); // GUEST_DEFERRED_REVENUE

    // Clean up
    await pool.query('DELETE FROM general_ledger_entries WHERE journal_entry_id = ?', [postingRecord.journal_entry_id]);
    await pool.query('DELETE FROM journal_entries WHERE id = ?', [postingRecord.journal_entry_id]);
    await pool.query('DELETE FROM accounting_subledger_posting_records WHERE id = ?', [postingRecord.id]);
    await pool.query('DELETE FROM payment_transactions WHERE id = ?', [paymentId]);
    await pool.query('DELETE FROM reservations WHERE id = ?', [reservationId]);
  });

  test('4. Caution Deposit Segregation: Security deposit credits Refundable Caution Deposit (Liability 2100)', async () => {
    // Create reservation
    const resInsert = await pool.query(`
      INSERT INTO reservations (
        reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone,
        check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, payment_method, source
      ) VALUES (
        CONCAT('BFA-DEP-', UNIX_TIMESTAMP()), 1, 1, 'Deposit Guest', 'deposit.guest@example.com', '+234800000003',
        '2028-09-01', '2028-09-02', 1, 20000.00, 20000.00, 'CONFIRMED', 'PAYMENT_SUCCESS', 'BANK_TRANSFER', 'ONLINE'
      )
    `);
    const reservationId = resInsert.insertId;

    // Create security deposit payment with isSecurityDeposit: true in metadata
    const payInsert = await pool.query(`
      INSERT INTO payment_transactions (
        transaction_reference, reservation_id, amount, payment_method, status, metadata, paid_at
      ) VALUES (
        CONCAT('TXN-DEP-', UNIX_TIMESTAMP()), ?, 20000.00, 'BANK_TRANSFER', 'SUCCESS', '{"isSecurityDeposit": true}', '2026-10-20 12:00:00'
      )
    `, [reservationId]);
    const paymentId = payInsert.insertId;

    const PostingBridgeService = require('../src/modules/accounting/postingBridge.service');
    const postingRecord = await PostingBridgeService.postPayment(paymentId);
    expect(postingRecord).toBeTruthy();
    expect(postingRecord.status).toBe('POSTED');

    // Check GL lines: Must credit Refundable Security Deposit
    const lines = await pool.query(`
      SELECT gl.*, coa.account_code, coa.account_type, coa.account_name
      FROM general_ledger_entries gl
      JOIN chart_of_accounts coa ON gl.account_id = coa.id
      WHERE gl.journal_entry_id = ?
    `, [postingRecord.journal_entry_id]);

    const creditLine = lines.find((l) => parseFloat(l.credit) > 0);
    expect(creditLine).toBeTruthy();
    expect(creditLine.account_type).toBe('LIABILITY');
    expect(creditLine.account_code).toBe('2030'); // Refundable Guest Security Deposits

    // Clean up
    await pool.query('DELETE FROM general_ledger_entries WHERE journal_entry_id = ?', [postingRecord.journal_entry_id]);
    await pool.query('DELETE FROM journal_entries WHERE id = ?', [postingRecord.journal_entry_id]);
    await pool.query('DELETE FROM accounting_subledger_posting_records WHERE id = ?', [postingRecord.id]);
    await pool.query('DELETE FROM payment_transactions WHERE id = ?', [paymentId]);
    await pool.query('DELETE FROM reservations WHERE id = ?', [reservationId]);
  });

  test('5. Balance Sheet & Income Statement endpoints maintain mathematical accounting parity', async () => {
    // Balance Sheet
    const bsRes = await request(app)
      .get('/api/v1/accounting/reports/balance-sheet')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(bsRes.status).toBe(200);
    const bsData = bsRes.body.data;
    expect(bsData).toHaveProperty('assets');
    expect(bsData).toHaveProperty('liabilities');
    expect(bsData).toHaveProperty('equity');
    expect(bsData).toHaveProperty('isBalanced');
    expect(bsData.isBalanced).toBe(true);

    // Income Statement
    const isRes = await request(app)
      .get('/api/v1/accounting/reports/income-statement')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(isRes.status).toBe(200);
    const isData = isRes.body.data;
    expect(isData).toHaveProperty('revenues');
    expect(isData).toHaveProperty('expenses');
    expect(isData).toHaveProperty('netOperatingIncome');
  });
});
