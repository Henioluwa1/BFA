const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const PostingBridgeService = require('../src/modules/accounting/postingBridge.service');
const PostingBridgeRepository = require('../src/modules/accounting/postingBridge.repository');
const AccountingRepository = require('../src/modules/accounting/accounting.repository');

describe('Phase 2 — Automated Subledger-to-General-Ledger Posting Bridges', () => {
  let superAdminToken = '';
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let agentToken = '';

  let testReservationId = null;
  let testPropertyId = null;
  let testApartmentId = null;
  let openPeriodId = null;

  beforeAll(async () => {
    // 1. Authenticate users
    const superAdminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'superadmin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    superAdminToken = superAdminRes.body.data.token;

    const adminRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = adminRes.body.data.token;

    const managerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'manager@bfa.com',
      password: 'Bfa2026!Secure',
    });
    managerToken = managerRes.body.data.token;

    const staffRes = await request(app).post('/api/v1/auth/login').send({
      email: 'staff@bfa.com',
      password: 'Bfa2026!Secure',
    });
    staffToken = staffRes.body?.data?.token || '';

    const agentRes = await request(app).post('/api/v1/auth/login').send({
      email: 'agent@bfa.com',
      password: 'Bfa2026!Secure',
    });
    agentToken = agentRes.body?.data?.token || '';

    // 2. Fetch sample property and apartment
    const properties = await pool.query('SELECT id FROM properties ORDER BY id ASC LIMIT 1');
    testPropertyId = properties[0].id;

    const apartments = await pool.query('SELECT id FROM apartments WHERE property_id = ? ORDER BY id ASC LIMIT 1', [
      testPropertyId,
    ]);
    testApartmentId = apartments[0].id;

    // 3. Fetch active open period
    const periods = await pool.query('SELECT id FROM accounting_periods WHERE status = "OPEN" ORDER BY id ASC LIMIT 1');
    openPeriodId = periods[0].id;

    // 4. Create an authoritative test reservation
    const resRows = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Bridge Test Guest', 'bridgetest@bfa.com', '2026-10-20', '2026-10-21', 1, 120000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING')`,
      [`BFA-TEST-BRG-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    testReservationId = resRows.insertId;
  });

  afterAll(async () => {
    // Cleanup test data created during suite run
    if (testReservationId) {
      const records = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id = ? OR source_entity_id LIKE ?',
        [testReservationId, `%${testReservationId}%`]
      );
      const journalIds = records.map((r) => r.journal_entry_id).filter(Boolean);

      if (journalIds.length > 0) {
        const placeholders = journalIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, journalIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, journalIds);
        await pool.query(
          `UPDATE journal_entries SET reversal_of_journal_id = NULL, reversed_by_journal_id = NULL WHERE id IN (${placeholders})`,
          journalIds
        );
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, journalIds);
      }

      await pool.query(
        'DELETE FROM accounting_posting_exceptions WHERE source_entity_id = ? OR source_entity_id LIKE ?',
        [testReservationId, `%${testReservationId}%`]
      );
      await pool.query(
        'DELETE FROM accounting_subledger_posting_records WHERE source_entity_id = ? OR source_entity_id LIKE ?',
        [testReservationId, `%${testReservationId}%`]
      );
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [testReservationId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [testReservationId]);
    }

    // Clean test expenses
    const testExpenses = await pool.query('SELECT id FROM expenses WHERE description LIKE "Bridge Test Expense%"');
    if (testExpenses.length > 0) {
      const expIds = testExpenses.map((e) => e.id);
      const records = await pool.query(
        `SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_module = "EXPENSES" AND source_entity_id IN (${expIds.map(() => '?').join(',')})`,
        expIds
      );
      const journalIds = records.map((r) => r.journal_entry_id).filter(Boolean);
      if (journalIds.length > 0) {
        const placeholders = journalIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, journalIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, journalIds);
        await pool.query(
          `UPDATE journal_entries SET reversal_of_journal_id = NULL, reversed_by_journal_id = NULL WHERE id IN (${placeholders})`,
          journalIds
        );
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, journalIds);
      }
      await pool.query(
        `DELETE FROM accounting_subledger_posting_records WHERE source_module = "EXPENSES" AND source_entity_id IN (${expIds.map(() => '?').join(',')})`,
        expIds
      );
      await pool.query(`DELETE FROM expenses WHERE id IN (${expIds.map(() => '?').join(',')})`, expIds);
    }

    await pool.closePool();
  }, 30000);

  /* -------------------------------------------------------------------------
   * Requirement 1 & 2: Payment Subledger Posting & Advance Deferred Revenue
   * ------------------------------------------------------------------------- */
  test('1. Payment Collection Bridge: Posts Debit to Clearing/Bank and Credit to Deferred Guest Revenue', async () => {
    // Process payment through operational Payments API
    const payRes = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: testReservationId,
        paymentMethod: 'CARD',
        amount: 120000.0,
        provider: 'PAYSTACK',
        providerReference: `PAY-TEST-${Date.now()}`,
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.success).toBe(true);
    const paymentId = payRes.body.data.id;

    // Verify subledger posting record was created
    const record = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:PAYMENT:${paymentId}`);
    expect(record).not.toBeNull();
    expect(record.status).toBe('POSTED');
    expect(record.source_module).toBe('PAYMENTS');
    expect(Number(record.amount)).toBe(120000.0);
    expect(record.journal_entry_id).not.toBeNull();

    // Verify journal lines
    const journal = await AccountingRepository.findJournalById(record.journal_entry_id);
    expect(journal).not.toBeNull();
    expect(journal.status).toBe('POSTED');
    expect(Number(journal.total_debit)).toBe(120000.0);
    expect(Number(journal.total_credit)).toBe(120000.0);

    // Assert lines: Debit Payment Gateway Clearing (1030), Credit Deferred Revenue (2020)
    const debitLine = journal.lines.find((l) => Number(l.debit) === 120000.0);
    const creditLine = journal.lines.find((l) => Number(l.credit) === 120000.0);
    expect(debitLine).toBeDefined();
    expect(creditLine).toBeDefined();

    const debitAcc = await AccountingRepository.findAccountById(debitLine.account_id);
    const creditAcc = await AccountingRepository.findAccountById(creditLine.account_id);
    expect(debitAcc.account_code).toBe('1030'); // Payment Gateway Clearing Account
    expect(creditAcc.account_code).toBe('2020'); // Deferred Guest Revenue (Liability)

    // Verify General Ledger entries exist and match
    const glEntries = await pool.query('SELECT * FROM general_ledger_entries WHERE journal_entry_id = ?', [
      journal.id,
    ]);
    expect(glEntries.length).toBe(2);
  });

  /* -------------------------------------------------------------------------
   * Requirement 3: Payment Posting Idempotency
   * ------------------------------------------------------------------------- */
  test('2. Idempotency: Duplicate payment posting call returns existing record without creating duplicate journals', async () => {
    const payRows = await pool.query('SELECT id FROM payment_transactions WHERE reservation_id = ? LIMIT 1', [
      testReservationId,
    ]);
    const paymentId = payRows[0].id;

    // First count journals
    const initialJournals = await pool.query(
      'SELECT COUNT(*) as count FROM journal_entries WHERE source_type = "PAYMENT" AND source_id = ?',
      [String(paymentId)]
    );
    expect(Number(initialJournals[0].count)).toBe(1);

    // Call PostingBridgeService.postPayment directly (simulating repeated hook/webhook)
    const secondPost = await PostingBridgeService.postPayment(paymentId);
    expect(secondPost.status).toBe('POSTED');

    // Confirm journal count remains exactly 1
    const postJournals = await pool.query(
      'SELECT COUNT(*) as count FROM journal_entries WHERE source_type = "PAYMENT" AND source_id = ?',
      [String(paymentId)]
    );
    expect(Number(postJournals[0].count)).toBe(1);
  });

  /* -------------------------------------------------------------------------
   * Requirement 4: Full and Partial Refund Posting & Closed-Period Safeguard
   * ------------------------------------------------------------------------- */
  test('3. Refund Subledger Bridge: Posts Debit to Deferred Revenue and Credit to Clearing in current OPEN period', async () => {
    const payRows = await pool.query(
      'SELECT id, amount FROM payment_transactions WHERE reservation_id = ? AND status = "SUCCESS" LIMIT 1',
      [testReservationId]
    );
    const paymentId = payRows[0].id;

    // Issue partial refund (₦30,000)
    const refundRes = await request(app)
      .post(`/api/v1/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 30000.0,
        reason: 'Bridge Test Partial Refund',
      });

    expect(refundRes.status).toBe(200);
    expect(refundRes.body.success).toBe(true);
    const refundTxId = refundRes.body.data.refundTransaction.id;

    // Verify refund posting record
    const refundRecord = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(
      `SUBLEDGER:REFUND:${refundTxId}`
    );
    expect(refundRecord).not.toBeNull();
    expect(refundRecord.status).toBe('POSTED');
    expect(Number(refundRecord.amount)).toBe(30000.0);

    // Verify refund journal: Debit Deferred Revenue (2020), Credit Clearing (1030)
    const refundJournal = await AccountingRepository.findJournalById(refundRecord.journal_entry_id);
    expect(refundJournal.status).toBe('POSTED');
    expect(Number(refundJournal.total_debit)).toBe(30000.0);
    expect(Number(refundJournal.total_credit)).toBe(30000.0);

    const debitLine = refundJournal.lines.find((l) => Number(l.debit) === 30000.0);
    const creditLine = refundJournal.lines.find((l) => Number(l.credit) === 30000.0);
    const debitAcc = await AccountingRepository.findAccountById(debitLine.account_id);
    const creditAcc = await AccountingRepository.findAccountById(creditLine.account_id);

    expect(debitAcc.account_code).toBe('2020'); // Deferred Guest Revenue liability relieved
    expect(creditAcc.account_code).toBe('1030'); // Cash/Clearing disbursed

    // Closed-period validation: Ensure the refund journal entry date is in current open period
    const todayStr = new Date().toISOString().slice(0, 10);
    expect(refundJournal.entry_date).toBe(todayStr);
  });

  /* -------------------------------------------------------------------------
   * Requirement 5: Accommodation Revenue Recognition on Stay Date
   * ------------------------------------------------------------------------- */
  test('4. Service-Date Revenue Recognition: Debits Deferred Revenue and Credits Accommodation Revenue', async () => {
    // Transition reservation to CHECKED_IN to represent delivered stay
    await pool.query('UPDATE reservations SET status = "CHECKED_IN" WHERE id = ?', [testReservationId]);

    // Trigger revenue recognition for the stay date
    const revRecord = await PostingBridgeService.postRevenueRecognition({
      reservationId: testReservationId,
      serviceDate: '2026-10-20',
      propertyId: testPropertyId,
      user: { id: 1, role: 'SUPER_ADMIN' },
    });

    expect(revRecord).not.toBeNull();
    expect(revRecord.status).toBe('POSTED');
    expect(Number(revRecord.amount)).toBe(120000.0);

    // Verify revenue journal: Debit Deferred Revenue (2020), Credit Accommodation Revenue (4010)
    const revJournal = await AccountingRepository.findJournalById(revRecord.journal_entry_id);
    expect(revJournal.status).toBe('POSTED');
    expect(Number(revJournal.total_debit)).toBe(120000.0);
    expect(Number(revJournal.total_credit)).toBe(120000.0);

    const deferredLine = revJournal.lines.find((l) => Number(l.debit) === 90000.0);
    const arLine = revJournal.lines.find((l) => Number(l.debit) === 30000.0);
    const creditLine = revJournal.lines.find((l) => Number(l.credit) === 120000.0);

    const deferredAcc = await AccountingRepository.findAccountById(deferredLine.account_id);
    const arAcc = await AccountingRepository.findAccountById(arLine.account_id);
    const creditAcc = await AccountingRepository.findAccountById(creditLine.account_id);

    expect(deferredAcc.account_code).toBe('2020'); // Liability relieved for prepaid portion (₦90,000)
    expect(arAcc.account_code).toBe('1200'); // Accounts Receivable booked for uncollected balance (₦30,000)
    expect(creditAcc.account_code).toBe('4010'); // Total Accommodation Revenue earned (₦120,000)

    // Verify idempotency: repeated attempt for same reservation and date is a no-op
    const repeatRecord = await PostingBridgeService.postRevenueRecognition({
      reservationId: testReservationId,
      serviceDate: '2026-10-20',
      propertyId: testPropertyId,
      user: { id: 1, role: 'SUPER_ADMIN' },
    });
    expect(repeatRecord.journal_entry_id).toBe(revRecord.journal_entry_id);
  });

  /* -------------------------------------------------------------------------
   * Requirement 6: Night Audit Batch Execution & Fault Isolation
   * ------------------------------------------------------------------------- */
  test('5. Night Audit: Batch recognizes stay revenue with fault isolation on individual item exceptions', async () => {
    // Create a secondary reservation for the same date that has an invalid status (PENDING)
    const badRes = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Bad Guest Pending', 'bad@bfa.com', '2026-10-20', '2026-10-21', 1, 80000.00, 0.00, 'PENDING', 'PAYMENT_PENDING')`,
      [`BFA-TEST-BAD-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const badResId = badRes.insertId;

    try {
      // Execute night audit via API endpoint
      const auditRes = await request(app)
        .post('/api/v1/accounting/night-audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          service_date: '2026-10-20',
          property_id: testPropertyId,
        });

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.success).toBe(true);
      expect(auditRes.body.data.serviceDate).toBe('2026-10-20');
      // Eligible count includes CHECKED_IN reservations
      expect(auditRes.body.data.totalEligible).toBeGreaterThanOrEqual(1);
    } finally {
      await pool.query('DELETE FROM reservations WHERE id = ?', [badResId]);
    }
  });

  /* -------------------------------------------------------------------------
   * Requirement 7: Operational Expense Subledger Posting & Accounts Payable
   * ------------------------------------------------------------------------- */
  test('6. Expense Posting Bridge: Approving expense posts Debit to category expense and Credit to Bank / AP', async () => {
    // Create operational expense as Admin
    const expRes = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: testPropertyId,
        category: 'UTILITIES',
        amount: 45000.0,
        description: 'Bridge Test Expense Diesel Generator Fuel',
        payment_method: 'BANK_TRANSFER',
      });

    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.data.id;

    // Approve expense (triggers automated posting hook)
    const approveRes = await request(app)
      .post(`/api/v1/expenses/${expenseId}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    // Verify subledger posting record
    const record = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:EXPENSE:${expenseId}`);
    expect(record).not.toBeNull();
    expect(record.status).toBe('POSTED');
    expect(Number(record.amount)).toBe(45000.0);

    // Verify journal lines
    const journal = await AccountingRepository.findJournalById(record.journal_entry_id);
    expect(journal.status).toBe('POSTED');
    expect(Number(journal.total_debit)).toBe(45000.0);
    expect(Number(journal.total_credit)).toBe(45000.0);

    const debitLine = journal.lines.find((l) => Number(l.debit) === 45000.0);
    const creditLine = journal.lines.find((l) => Number(l.credit) === 45000.0);
    const debitAcc = await AccountingRepository.findAccountById(debitLine.account_id);
    const creditAcc = await AccountingRepository.findAccountById(creditLine.account_id);

    expect(debitAcc.account_code).toBe('5020'); // Utilities - Power, Generator & Diesel
    expect(creditAcc.account_code).toBe('1010'); // Main Operating Bank Account (BANK_TRANSFER)

    // Void expense -> must trigger automated reversal of the journal
    const voidRes = await request(app)
      .post(`/api/v1/expenses/${expenseId}/void`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'Duplicate invoice submitted by fuel vendor' });

    expect(voidRes.status).toBe(200);
    expect(voidRes.body.data.status).toBe('VOIDED');

    // Verify original journal is marked is_reversed
    const originalJournal = await AccountingRepository.findJournalById(record.journal_entry_id);
    expect(originalJournal.is_reversed).toBe(1);
    expect(originalJournal.reversed_by_journal_id).not.toBeNull();
  });

  /* -------------------------------------------------------------------------
   * Requirement 8: Outbox, Reconciliation & Gap Detection
   * ------------------------------------------------------------------------- */
  test('7. Outbox & Reconciliation: Identifies operational events and reconciles against General Ledger', async () => {
    // 1. Query posting records outbox
    const listRes = await request(app)
      .get('/api/v1/accounting/posting-records')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThan(0);

    // 2. Query reconciliation summary
    const reconRes = await request(app)
      .get(`/api/v1/accounting/reconcile?propertyId=${testPropertyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reconRes.status).toBe(200);
    expect(reconRes.body.data).toHaveProperty('payments');
    expect(reconRes.body.data).toHaveProperty('expenses');
    expect(reconRes.body.data).toHaveProperty('openExceptionsCount');
  });

  /* -------------------------------------------------------------------------
   * Requirement 9: Account Mappings Configuration
   * ------------------------------------------------------------------------- */
  test('8. Account Mappings: Admin can list and update operational account mappings', async () => {
    // List mappings
    const listRes = await request(app)
      .get('/api/v1/accounting/account-mappings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);

    const cardMapping = listRes.body.data.find((m) => m.mapping_key === 'PAYMENT_CARD_CLEARING');
    expect(cardMapping).toBeDefined();
    expect(cardMapping.account_code).toBe('1030');

    // Update mapping with invalid account -> 404
    const invalidUpdateRes = await request(app)
      .put('/api/v1/accounting/account-mappings/PAYMENT_CARD_CLEARING')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ account_id: 999999 });

    expect(invalidUpdateRes.status).toBe(404);
  });

  /* -------------------------------------------------------------------------
   * Requirement 10: Capability Enforcement on Subledger Endpoints
   * ------------------------------------------------------------------------- */
  test('9. Capability Protection: Disabling ACCOUNTING_SUBLEDGER_POST blocks night-audit with 403', async () => {
    // 1. Temporarily disable capability
    await pool.query('UPDATE capabilities SET is_enabled = 0 WHERE name = "ACCOUNTING_SUBLEDGER_POST"');

    // 2. Attempt night audit -> 403 CAPABILITY_RESTRICTED
    const blockedRes = await request(app)
      .post('/api/v1/accounting/night-audit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ service_date: '2026-10-20' });

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe('CAPABILITY_RESTRICTED');

    // 3. Re-enable capability
    await pool.query('UPDATE capabilities SET is_enabled = 1 WHERE name = "ACCOUNTING_SUBLEDGER_POST"');

    // 4. Night audit now succeeds
    const allowedRes = await request(app)
      .post('/api/v1/accounting/night-audit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ service_date: '2026-10-20' });

    expect(allowedRes.status).toBe(200);
  });

  /* -------------------------------------------------------------------------
   * AUD-01 & AUD-02: Multi-Night Night Audit & No Repeated Prepayment Relief
   * ------------------------------------------------------------------------- */
  test('10. Multi-Night Night Audit: Recognizes in-house stays across all eligible stay dates and excludes checkout date (AUD-01)', async () => {
    // Create a 3-night reservation: 2026-10-22 to 2026-10-25
    const resRows = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Multi Night Guest', 'multinight@bfa.com', '2026-10-22', '2026-10-25', 3, 150000.00, 50000.00, 'CHECKED_IN', 'PARTIAL')`,
      [`BFA-TEST-MULTI-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const multiResId = resRows.insertId;

    try {
      // Record the advance payment of ₦50,000 in payment_transactions so netAccommodationPrepaid is known
      await pool.query(
        `INSERT INTO payment_transactions
         (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, paid_at)
         VALUES (?, ?, 'CARD', 50000.00, 'NGN', 'SUCCESS', 'PAYSTACK', ?, '2026-10-22 10:00:00')`,
        [multiResId, `TXN-MULTI-${Date.now()}`, `REF-MULTI-${Date.now()}`]
      );

      // Night 1 (2026-10-22): First in-house night
      const auditNight1 = await request(app)
        .post('/api/v1/accounting/night-audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ service_date: '2026-10-22', property_id: testPropertyId });

      expect(auditNight1.status).toBe(200);
      const res1 = auditNight1.body.data.records.find((r) => r.reservationId === multiResId);
      expect(res1).toBeDefined();
      expect(res1.status).toBe('POSTED');

      // Verify Night 1 journal: ₦50,000 paid covers night 1 -> Dr. 2020 Deferred Revenue ₦50,000, Cr. 4010 Accommodation Revenue ₦50,000
      const rec1 = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(
        `SUBLEDGER:REVENUE:RES_${multiResId}:DATE_2026-10-22`
      );
      const j1 = await AccountingRepository.findJournalById(rec1.journal_entry_id);
      const defLine1 = j1.lines.find((l) => Number(l.debit) === 50000.0);
      expect(defLine1).toBeDefined();

      // Night 2 (2026-10-23): Middle in-house night (Previously failed under AUD-01 check_in_date equality!)
      const auditNight2 = await request(app)
        .post('/api/v1/accounting/night-audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ service_date: '2026-10-23', property_id: testPropertyId });

      expect(auditNight2.status).toBe(200);
      const res2 = auditNight2.body.data.records.find((r) => r.reservationId === multiResId);
      expect(res2).toBeDefined();
      expect(res2.status).toBe('POSTED');

      // Verify Night 2 journal (AUD-02): Prepayment was already fully relieved on Night 1!
      // Therefore Night 2 must debit 1200 Accounts Receivable ₦50,000, NOT 2020 Deferred Revenue!
      const rec2 = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(
        `SUBLEDGER:REVENUE:RES_${multiResId}:DATE_2026-10-23`
      );
      const j2 = await AccountingRepository.findJournalById(rec2.journal_entry_id);
      const arLine2 = j2.lines.find((l) => Number(l.debit) === 50000.0);
      expect(arLine2).toBeDefined();
      const arAcc2 = await AccountingRepository.findAccountById(arLine2.account_id);
      expect(arAcc2.account_code).toBe('1200'); // Accounts Receivable - Guests

      // Night 3 (2026-10-24): Final in-house night
      const auditNight3 = await request(app)
        .post('/api/v1/accounting/night-audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ service_date: '2026-10-24', property_id: testPropertyId });

      expect(auditNight3.status).toBe(200);
      const res3 = auditNight3.body.data.records.find((r) => r.reservationId === multiResId);
      expect(res3).toBeDefined();
      expect(res3.status).toBe('POSTED');

      // Checkout Date (2026-10-25): Must be EXCLUDED from accommodation revenue!
      const auditCheckout = await request(app)
        .post('/api/v1/accounting/night-audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ service_date: '2026-10-25', property_id: testPropertyId });

      expect(auditCheckout.status).toBe(200);
      const resCheckout = auditCheckout.body.data.records.find((r) => r.reservationId === multiResId);
      expect(resCheckout).toBeUndefined(); // Excluded from checkout date!
    } finally {
      // Cleanup
      const records = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id = ?',
        [multiResId]
      );
      const jIds = records.map((r) => r.journal_entry_id).filter(Boolean);
      if (jIds.length > 0) {
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${jIds.map(() => '?').join(',')})`, jIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${jIds.map(() => '?').join(',')})`, jIds);
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${jIds.map(() => '?').join(',')})`, jIds);
      }
      await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_id = ?', [multiResId]);
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [multiResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [multiResId]);
    }
  });

  /* -------------------------------------------------------------------------
   * AUD-03: Post-Stay Payment Settling Outstanding Accounts Receivable
   * ------------------------------------------------------------------------- */
  test('11. Post-Stay Payment: Payment after stay credits Accounts Receivable instead of Deferred Revenue (AUD-03)', async () => {
    // Create completed reservation with ₦120,000 unpaid
    const resRows = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'AR Settlement Guest', 'arsettle@bfa.com', '2026-10-21', '2026-10-22', 1, 120000.00, 0.00, 'COMPLETED', 'PAYMENT_PENDING')`,
      [`BFA-TEST-AR-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const arResId = resRows.insertId;

    try {
      // 1. Recognize revenue for the stay date -> Books 100% to Accounts Receivable
      const revRec = await PostingBridgeService.postRevenueRecognition({
        reservationId: arResId,
        serviceDate: '2026-10-21',
        propertyId: testPropertyId,
        user: { id: 1, role: 'SUPER_ADMIN' },
      });
      expect(revRec.status).toBe('POSTED');

      // 2. Guest pays ₦120,000 post-stay at checkout
      const payRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reservationId: arResId,
          paymentMethod: 'BANK_TRANSFER',
          amount: 120000.0,
          provider: 'ZENITH_BANK',
          providerReference: `ZENITH-SETTLE-${Date.now()}`,
        });

      expect(payRes.status).toBe(200);
      const payId = payRes.body.data.id;

      // 3. Inspect payment journal: Must credit 1200 Accounts Receivable, NOT 2020 Deferred Revenue!
      const payRec = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:PAYMENT:${payId}`);
      expect(payRec.status).toBe('POSTED');

      const payJournal = await AccountingRepository.findJournalById(payRec.journal_entry_id);
      const arCreditLine = payJournal.lines.find((l) => Number(l.credit) === 120000.0);
      expect(arCreditLine).toBeDefined();

      const arAcc = await AccountingRepository.findAccountById(arCreditLine.account_id);
      expect(arAcc.account_code).toBe('1200'); // Accounts Receivable - Guests cleared!
    } finally {
      const records = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id = ?',
        [arResId]
      );
      const jIds = records.map((r) => r.journal_entry_id).filter(Boolean);
      if (jIds.length > 0) {
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${jIds.map(() => '?').join(',')})`, jIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${jIds.map(() => '?').join(',')})`, jIds);
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${jIds.map(() => '?').join(',')})`, jIds);
      }
      await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_id = ?', [arResId]);
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [arResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [arResId]);
    }
  });

  /* -------------------------------------------------------------------------
   * AUD-03: Security Deposits Kept Separate from Accommodation Revenue
   * ------------------------------------------------------------------------- */
  test('12. Security Deposit: Payment flagged as security deposit credits 2030 Refundable Deposits (AUD-03)', async () => {
    const payRes = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: testReservationId,
        paymentMethod: 'CARD',
        amount: 50000.0,
        provider: 'PAYSTACK',
        providerReference: `DEP-TEST-${Date.now()}`,
        metadata: { isSecurityDeposit: true },
      });

    expect(payRes.status).toBe(200);
    const payId = payRes.body.data.id;

    const payRec = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:PAYMENT:${payId}`);
    expect(payRec.status).toBe('POSTED');

    const payJournal = await AccountingRepository.findJournalById(payRec.journal_entry_id);
    const depCreditLine = payJournal.lines.find((l) => Number(l.credit) === 50000.0);
    expect(depCreditLine).toBeDefined();

    const depAcc = await AccountingRepository.findAccountById(depCreditLine.account_id);
    expect(depAcc.account_code).toBe('2030'); // Refundable Guest Security Deposits
  });

  /* -------------------------------------------------------------------------
   * AUD-05: Truthful Exception Resolution Enforced
   * ------------------------------------------------------------------------- */
  test('13. Exception Resolution: Rejects resolution when posting record is absent or retry fails (AUD-05)', async () => {
    // Create orphan exception with no posting record and invalid source
    const exc = await PostingBridgeRepository.createException({
      posting_record_id: null,
      source_module: 'UNKNOWN',
      source_entity_id: '999999',
      exception_code: 'ORPHAN_TEST_EXCEPTION',
      exception_message: 'Test exception with missing posting record',
    });

    // Attempt to resolve -> must fail with 422 ValidationError, NOT marked resolved!
    const resRes = await request(app)
      .post(`/api/v1/accounting/posting-exceptions/${exc.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'RETRY' });

    expect(resRes.status).toBe(422);

    // Verify exception remains OPEN in database
    const excAfter = await PostingBridgeRepository.findExceptionById(exc.id);
    expect(excAfter.status).toBe('OPEN');

    // Clean test exception
    await pool.query('DELETE FROM accounting_posting_exceptions WHERE id = ?', [exc.id]);
  });

  /* -------------------------------------------------------------------------
   * AUD-06: Journal Header and Lines Reconciled Atomically with Gateway Fees
   * ------------------------------------------------------------------------- */
  test('14. Gateway Fees: Header total_debit equals sum of lines exactly (AUD-06)', async () => {
    const resRows = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Fee Test Guest', 'feetest@bfa.com', '2026-10-23', '2026-10-24', 1, 80000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING')`,
      [`BFA-TEST-FEE-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const feeResId = resRows.insertId;

    try {
      const payRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reservationId: feeResId,
          paymentMethod: 'CARD',
          amount: 80000.0,
          provider: 'PAYSTACK',
          providerReference: `FEE-TEST-${Date.now()}`,
          metadata: { gatewayFee: 1200.0 },
        });

      expect(payRes.status).toBe(200);
      const payId = payRes.body.data.id;

      const payRec = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:PAYMENT:${payId}`);
      const payJournal = await AccountingRepository.findJournalById(payRec.journal_entry_id);

      // Total debit in header must equal lines sum (₦80,000 + ₦1,200 = ₦81,200)
      expect(Number(payJournal.total_debit)).toBe(81200.0);
      expect(Number(payJournal.total_credit)).toBe(81200.0);

      let sumLineDebits = 0;
      let sumLineCredits = 0;
      for (const line of payJournal.lines) {
        sumLineDebits += Number(line.debit);
        sumLineCredits += Number(line.credit);
      }
      expect(sumLineDebits).toBe(81200.0);
      expect(sumLineCredits).toBe(81200.0);
    } finally {
      const records = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id = ?',
        [feeResId]
      );
      const jIds = records.map((r) => r.journal_entry_id).filter(Boolean);
      if (jIds.length > 0) {
        const placeholders = jIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, jIds);
      }
      await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_id = ?', [feeResId]);
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [feeResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [feeResId]);
    }
  });

  /* -------------------------------------------------------------------------
   * AUD-08: Property Authorization Fails Closed
   * ------------------------------------------------------------------------- */
  test('15. Property Scoping: Manager with null property assignment receives empty set (AUD-08)', async () => {
    // Query posting records using manager with null propertyId
    const res = await PostingBridgeService.listPostingRecords({}, { role: 'MANAGER', propertyId: null });
    expect(res.data).toEqual([]);
    expect(res.total).toBe(0);
  });

  /* -------------------------------------------------------------------------
   * Section B: Transaction Boundaries & Durable Outbox on Failure
   * ------------------------------------------------------------------------- */
  test('16. Durable Outbox: Unmapped or invalid accounting posting records durable FAILED outbox record and exception atomically', async () => {
    // Temporarily deactivate mapping for CARD clearing to simulate mapping failure during payment
    await pool.query('UPDATE accounting_account_mappings SET is_active = 0 WHERE mapping_key = "PAYMENT_CARD_CLEARING"');

    const resRows = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Outbox Test Guest', 'outbox@bfa.com', '2026-10-25', '2026-10-26', 1, 60000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING')`,
      [`BFA-TEST-OUTBOX-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const outboxResId = resRows.insertId;

    try {
      // Process payment with card channel whose mapping is currently disabled
      const payRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reservationId: outboxResId,
          paymentMethod: 'CARD',
          amount: 60000.0,
          provider: 'PAYSTACK',
          providerReference: `OUTBOX-FAIL-${Date.now()}`,
        });

      // Operational payment was committed so provider transaction is preserved
      expect(payRes.status).toBe(200);
      const payId = payRes.body.data.id;

      // Durable posting record MUST be recorded with status FAILED (never swallowed!)
      const postingRec = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:PAYMENT:${payId}`);
      expect(postingRec).toBeDefined();
      expect(postingRec.status).toBe('FAILED');
      expect(postingRec.last_error).toMatch(/disabled|missing|Indispensable/);

      // Durable exception MUST be recorded in OPEN status with correct property_id
      const excRows = await pool.query(
        'SELECT * FROM accounting_posting_exceptions WHERE posting_record_id = ?',
        [postingRec.id]
      );
      expect(excRows.length).toBe(1);
      expect(excRows[0].status).toBe('OPEN');
      expect(excRows[0].property_id).toBe(testPropertyId);

      // Reconciliation engine detects the unresolved operational event
      const recon = await PostingBridgeService.reconcile({});
      expect(recon.openExceptionsCount).toBeGreaterThanOrEqual(1);

      // Re-enable mapping and resolve exception
      await pool.query('UPDATE accounting_account_mappings SET is_active = 1 WHERE mapping_key = "PAYMENT_CARD_CLEARING"');
      const resolveRes = await request(app)
        .post(`/api/v1/accounting/posting-exceptions/${excRows[0].id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'RETRY' });

      expect(resolveRes.status).toBe(200);

      // Verified: Posting record is now POSTED and linked to balanced journal
      const resolvedRec = await PostingBridgeRepository.findPostingRecordById(postingRec.id);
      expect(resolvedRec.status).toBe('POSTED');
      expect(resolvedRec.journal_entry_id).toBeDefined();

      const journal = await AccountingRepository.findJournalById(resolvedRec.journal_entry_id);
      expect(journal.status).toBe('POSTED');
    } finally {
      await pool.query('UPDATE accounting_account_mappings SET is_active = 1 WHERE mapping_key = "PAYMENT_CARD_CLEARING"');
      const records = await pool.query(
        'SELECT journal_entry_id, id FROM accounting_subledger_posting_records WHERE source_entity_type = "PAYMENT_TRANSACTION" AND source_entity_id IN (SELECT id FROM payment_transactions WHERE reservation_id = ?)',
        [outboxResId]
      );
      const jIds = records.map((r) => r.journal_entry_id).filter(Boolean);
      const pIds = records.map((r) => r.id);
      if (pIds.length > 0) {
        await pool.query(`DELETE FROM accounting_posting_exceptions WHERE posting_record_id IN (${pIds.map(() => '?').join(',')})`, pIds);
      }
      if (jIds.length > 0) {
        const placeholders = jIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, jIds);
      }
      await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_type = "PAYMENT_TRANSACTION" AND source_entity_id IN (SELECT id FROM payment_transactions WHERE reservation_id = ?)', [outboxResId]);
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [outboxResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [outboxResId]);
    }
  });

  /* -------------------------------------------------------------------------
   * Section C: External Payment Idempotency & Database Constraint Safety
   * ------------------------------------------------------------------------- */
  test('17. Provider Idempotency: Duplicate callback returns canonical payment without creating duplicate rows or journals', async () => {
    const resRows = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Idemp Guest', 'idemp@bfa.com', '2026-10-25', '2026-10-26', 1, 75000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING')`,
      [`BFA-TEST-IDEMP-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const idempResId = resRows.insertId;
    const providerRef = `PAYSTACK-UNIQUE-${Date.now()}`;

    try {
      // 1. Initial payment callback
      const pay1 = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reservationId: idempResId,
          paymentMethod: 'CARD',
          amount: 75000.0,
          provider: 'PAYSTACK',
          providerReference: providerRef,
        });

      expect(pay1.status).toBe(200);
      const originalPayId = pay1.body.data.id;

      // 2. Sequential duplicate callback with identical provider reference
      const pay2 = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reservationId: idempResId,
          paymentMethod: 'CARD',
          amount: 75000.0,
          provider: 'PAYSTACK',
          providerReference: providerRef,
        });

      expect(pay2.status).toBe(200);
      expect(pay2.body.data.id).toBe(originalPayId); // Returns canonical existing record

      // Verify MariaDB table has exactly 1 row for this provider reference
      const txRows = await pool.query(
        'SELECT id FROM payment_transactions WHERE provider = "PAYSTACK" AND provider_reference = ?',
        [providerRef]
      );
      expect(txRows.length).toBe(1);

      // Verify exactly 1 journal entry exists
      const postRecs = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE idempotency_key = ?',
        [`SUBLEDGER:PAYMENT:${originalPayId}`]
      );
      expect(postRecs.length).toBe(1);
    } finally {
      const records = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id IN (SELECT id FROM payment_transactions WHERE reservation_id = ?)',
        [idempResId]
      );
      const jIds = records.map((r) => r.journal_entry_id).filter(Boolean);
      if (jIds.length > 0) {
        const placeholders = jIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, jIds);
      }
      await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_id IN (SELECT id FROM payment_transactions WHERE reservation_id = ?)', [idempResId]);
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [idempResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [idempResId]);
    }
  });

  test('18. Concurrent Provider Callbacks: Database UNIQUE constraint prevents duplicate payment rows under parallel execution', async () => {
    const resRows = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Parallel Guest', 'parallel@bfa.com', '2026-10-25', '2026-10-26', 1, 90000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING')`,
      [`BFA-TEST-PAR-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const parResId = resRows.insertId;
    const commonRef = `CONCURRENT-REF-${Date.now()}`;

    try {
      // Dispatch 2 simultaneous callbacks with identical provider reference
      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/v1/payments/process')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            reservationId: parResId,
            paymentMethod: 'CARD',
            amount: 90000.0,
            provider: 'PAYSTACK',
            providerReference: commonRef,
          }),
        request(app)
          .post('/api/v1/payments/process')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            reservationId: parResId,
            paymentMethod: 'CARD',
            amount: 90000.0,
            provider: 'PAYSTACK',
            providerReference: commonRef,
          }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(resA.body.data.id).toBe(resB.body.data.id); // Both return the exact same canonical ID

      // Assert database level uniqueness: exactly 1 payment record exists
      const txRows = await pool.query(
        'SELECT id FROM payment_transactions WHERE provider = "PAYSTACK" AND provider_reference = ?',
        [commonRef]
      );
      expect(txRows.length).toBe(1);
    } finally {
      const records = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id IN (SELECT id FROM payment_transactions WHERE reservation_id = ?)',
        [parResId]
      );
      const jIds = records.map((r) => r.journal_entry_id).filter(Boolean);
      if (jIds.length > 0) {
        const placeholders = jIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, jIds);
      }
      await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_id IN (SELECT id FROM payment_transactions WHERE reservation_id = ?)', [parResId]);
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [parResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [parResId]);
    }
  });

  test('19. Multi-Provider Independence: Same reference across different providers creates distinct transactions', async () => {
    const resRows = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Multi Provider Guest', 'multiprov@bfa.com', '2026-10-25', '2026-10-26', 1, 100000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING')`,
      [`BFA-TEST-MP-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const mpResId = resRows.insertId;
    const sharedRef = `CROSS-PROV-${Date.now()}`;

    try {
      // Payment 1 via PAYSTACK
      const pay1 = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reservationId: mpResId,
          paymentMethod: 'CARD',
          amount: 50000.0,
          provider: 'PAYSTACK',
          providerReference: sharedRef,
        });
      expect(pay1.status).toBe(200);

      // Payment 2 via FLUTTERWAVE with same reference string
      const pay2 = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reservationId: mpResId,
          paymentMethod: 'CARD',
          amount: 50000.0,
          provider: 'FLUTTERWAVE',
          providerReference: sharedRef,
        });
      expect(pay2.status).toBe(200);

      // Distinct IDs created because composite key includes provider
      expect(pay1.body.data.id).not.toBe(pay2.body.data.id);
    } finally {
      const records = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id IN (SELECT id FROM payment_transactions WHERE reservation_id = ?)',
        [mpResId]
      );
      const jIds = records.map((r) => r.journal_entry_id).filter(Boolean);
      if (jIds.length > 0) {
        const placeholders = jIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, jIds);
      }
      await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_id IN (SELECT id FROM payment_transactions WHERE reservation_id = ?)', [mpResId]);
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [mpResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [mpResId]);
    }
  });

  /* -------------------------------------------------------------------------
   * Section D: Property Scoping on Posting Exceptions
   * ------------------------------------------------------------------------- */
  test('20. Exception Property Scoping: Scoped staff accesses only own property exceptions and forged params cannot override', async () => {
    // Create test exceptions for Property 1 and Property 2
    const excP1 = await PostingBridgeRepository.createException({
      source_module: 'RESERVATIONS',
      source_entity_id: '9901',
      property_id: 1,
      exception_code: 'TEST_PROP_1_EXCEPTION',
      exception_message: 'Test exception belonging to Property 1',
    });

    const excP2 = await PostingBridgeRepository.createException({
      source_module: 'RESERVATIONS',
      source_entity_id: '9902',
      property_id: 2,
      exception_code: 'TEST_PROP_2_EXCEPTION',
      exception_message: 'Test exception belonging to Property 2',
    });

    try {
      // 1. Staff assigned to Property 1 queries exceptions
      const staffRes = await request(app)
        .get('/api/v1/accounting/posting-exceptions')
        .set('Authorization', `Bearer ${staffToken}`); // staff is assigned to property 1

      expect(staffRes.status).toBe(200);
      const p1Items = staffRes.body.data.find((e) => e.id === excP1.id);
      const p2Items = staffRes.body.data.find((e) => e.id === excP2.id);
      expect(p1Items).toBeDefined();
      expect(p2Items).toBeUndefined(); // Strictly filtered out!

      // 2. Staff tries to forge propertyId=2 in query params
      const forgedRes = await request(app)
        .get('/api/v1/accounting/posting-exceptions?propertyId=2')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(forgedRes.status).toBe(200);
      const forgedP2 = forgedRes.body.data.find((e) => e.id === excP2.id);
      expect(forgedP2).toBeUndefined(); // Cannot override server-side property scope!

      // 3. Manager without property assignment receives empty set (fail closed)
      const unassignedRes = await request(app)
        .get('/api/v1/accounting/posting-exceptions')
        .set('Authorization', `Bearer ${managerToken}`); // manager has propertyId: null

      expect(unassignedRes.status).toBe(200);
      expect(unassignedRes.body.data).toEqual([]);
      const total = unassignedRes.body.meta?.pagination?.total ?? unassignedRes.body.pagination?.total;
      expect(total).toBe(0);

      // 4. Super Admin sees company-wide exceptions
      const adminRes = await request(app)
        .get('/api/v1/accounting/posting-exceptions')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.some((e) => e.id === excP1.id)).toBe(true);
      expect(adminRes.body.data.some((e) => e.id === excP2.id)).toBe(true);
    } finally {
      await pool.query('DELETE FROM accounting_posting_exceptions WHERE id IN (?, ?)', [excP1.id, excP2.id]);
    }
  });

  test('21. Cross-Property Exception Resolution Forbidden: Property-scoped manager cannot resolve exceptions for other properties', async () => {
    const excP2 = await PostingBridgeRepository.createException({
      source_module: 'RESERVATIONS',
      source_entity_id: '9903',
      property_id: 2,
      exception_code: 'TEST_CROSS_RESOLVE',
      exception_message: 'Cross resolve test',
    });

    try {
      // Attempt to resolve using user restricted to property 1
      await expect(
        PostingBridgeService.resolveException(
          excP2.id,
          { action: 'DISMISS', notes: 'Unauthorized attempt' },
          { id: 5, role: 'MANAGER', propertyId: 1 }
        )
      ).rejects.toThrow(/permission to access or resolve/);
    } finally {
      await pool.query('DELETE FROM accounting_posting_exceptions WHERE id = ?', [excP2.id]);
    }
  });

  /* -------------------------------------------------------------------------
   * Section E: Full Invariant Assertions (Cumulative 3-Night Multi-Night Stay)
   * ------------------------------------------------------------------------- */
  test('22. Comprehensive 3-Night Invariants: Asserts exact journal lines, cumulative GL balances, no double relief, and AR settlement', async () => {
    // 3 nights @ ₦50,000 = ₦150,000 total. Advance prepayment: ₦50,000.
    const resRows = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Full Invariant Guest', 'invariants@bfa.com', '2026-10-22', '2026-10-25', 3, 150000.00, 50000.00, 'CHECKED_IN', 'PARTIAL')`,
      [`BFA-TEST-CUMUL-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const cumulResId = resRows.insertId;

    try {
      // 1. Advance payment of ₦50,000
      const payTx = await pool.query(
        `INSERT INTO payment_transactions
         (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, paid_at)
         VALUES (?, ?, 'CARD', 50000.00, 'NGN', 'SUCCESS', 'PAYSTACK', ?, '2026-10-22 09:00:00')`,
        [cumulResId, `TXN-ADV-${Date.now()}`, `REF-ADV-${Date.now()}`]
      );
      await PostingBridgeService.postPayment(payTx.insertId, { user: { id: 1, role: 'SUPER_ADMIN' } });

      // 2. Run Night 1 (2026-10-22)
      await PostingBridgeService.postRevenueRecognition({
        reservationId: cumulResId,
        serviceDate: '2026-10-22',
        propertyId: testPropertyId,
        user: { id: 1, role: 'SUPER_ADMIN' },
      });

      // 3. Run Night 2 (2026-10-23)
      await PostingBridgeService.postRevenueRecognition({
        reservationId: cumulResId,
        serviceDate: '2026-10-23',
        propertyId: testPropertyId,
        user: { id: 1, role: 'SUPER_ADMIN' },
      });

      // 4. Run Night 3 (2026-10-24)
      await PostingBridgeService.postRevenueRecognition({
        reservationId: cumulResId,
        serviceDate: '2026-10-24',
        propertyId: testPropertyId,
        user: { id: 1, role: 'SUPER_ADMIN' },
      });

      // 5. Inspect individual journal lines:
      // Night 1 Journal: Dr. 2020 Deferred Revenue ₦50k, Cr. 4010 Accommodation Revenue ₦50k
      const rec1 = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:REVENUE:RES_${cumulResId}:DATE_2026-10-22`);
      const j1 = await AccountingRepository.findJournalById(rec1.journal_entry_id);
      const defLine1 = j1.lines.find((l) => Number(l.debit) === 50000.0);
      const revLine1 = j1.lines.find((l) => Number(l.credit) === 50000.0);
      const defAcc = await AccountingRepository.findAccountById(defLine1.account_id);
      const revAcc = await AccountingRepository.findAccountById(revLine1.account_id);
      expect(defAcc.account_code).toBe('2020');
      expect(revAcc.account_code).toBe('4010');

      // Night 2 Journal: Dr. 1200 AR ₦50k, Cr. 4010 Accommodation Revenue ₦50k
      const rec2 = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:REVENUE:RES_${cumulResId}:DATE_2026-10-23`);
      const j2 = await AccountingRepository.findJournalById(rec2.journal_entry_id);
      const arLine2 = j2.lines.find((l) => Number(l.debit) === 50000.0);
      const revLine2 = j2.lines.find((l) => Number(l.credit) === 50000.0);
      const arAcc2 = await AccountingRepository.findAccountById(arLine2.account_id);
      expect(arAcc2.account_code).toBe('1200');
      expect(revLine2).toBeDefined();

      // Night 3 Journal: Dr. 1200 AR ₦50k, Cr. 4010 Accommodation Revenue ₦50k
      const rec3 = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:REVENUE:RES_${cumulResId}:DATE_2026-10-24`);
      const j3 = await AccountingRepository.findJournalById(rec3.journal_entry_id);
      const arLine3 = j3.lines.find((l) => Number(l.debit) === 50000.0);
      const revLine3 = j3.lines.find((l) => Number(l.credit) === 50000.0);
      const arAcc3 = await AccountingRepository.findAccountById(arLine3.account_id);
      expect(arAcc3.account_code).toBe('1200');
      expect(revLine3).toBeDefined();

      // 6. Cumulative GL Balances across all revenue journals for this reservation:
      const glRevenue = await pool.query(
        `SELECT a.account_code, SUM(gle.debit) as total_debit, SUM(gle.credit) as total_credit
         FROM general_ledger_entries gle
         JOIN chart_of_accounts a ON gle.account_id = a.id
         JOIN journal_entries je ON gle.journal_entry_id = je.id
         WHERE je.source_type = 'RESERVATION' AND je.source_id = ?
         GROUP BY a.account_code`,
        [String(cumulResId)]
      );

      const glRevMap = Object.fromEntries(glRevenue.map((r) => [r.account_code, r]));
      // Accommodation Revenue (4010): exactly ₦150,000.00 credit
      expect(Number(glRevMap['4010']?.total_credit || 0)).toBe(150000.0);
      // Deferred Revenue relief (2020): exactly ₦50,000.00 debit
      expect(Number(glRevMap['2020']?.total_debit || 0)).toBe(50000.0);
      // Guest Receivables accrued (1200): exactly ₦100,000.00 debit
      expect(Number(glRevMap['1200']?.total_debit || 0)).toBe(100000.0);

      // 7. Verify Idempotency: Re-running night audit for any night produces NO duplicate revenue
      const retryNight2 = await PostingBridgeService.postRevenueRecognition({
        reservationId: cumulResId,
        serviceDate: '2026-10-23',
        propertyId: testPropertyId,
        user: { id: 1, role: 'SUPER_ADMIN' },
      });
      expect(retryNight2.id).toBe(rec2.id); // Same record returned

      // 8. Settle the ₦100,000 accrued AR with post-stay payment
      const settlePay = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reservationId: cumulResId,
          paymentMethod: 'BANK_TRANSFER',
          amount: 100000.0,
          provider: 'ZENITH_BANK',
          providerReference: `SETTLE-CUMUL-${Date.now()}`,
        });

      expect(settlePay.status).toBe(200);
      const settlePayRec = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(`SUBLEDGER:PAYMENT:${settlePay.body.data.id}`);
      const settleJournal = await AccountingRepository.findJournalById(settlePayRec.journal_entry_id);

      // Verify settlement journal credits 1200 AR exactly ₦100,000
      const arCredit = settleJournal.lines.find((l) => Number(l.credit) === 100000.0);
      expect(arCredit).toBeDefined();
      const settleArAcc = await AccountingRepository.findAccountById(arCredit.account_id);
      expect(settleArAcc.account_code).toBe('1200');

      // Net outstanding AR on reservation is now exactly ₦0
      const arNetRows = await pool.query(
        `SELECT 
           COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS net_ar
         FROM journal_lines jl
         JOIN chart_of_accounts a ON jl.account_id = a.id
         JOIN journal_entries je ON jl.journal_entry_id = je.id
         WHERE a.account_code = '1200' 
           AND ((je.source_type = 'RESERVATION' AND je.source_id = ?) 
             OR (je.source_type = 'PAYMENT' AND je.source_id IN (SELECT CAST(id AS CHAR) FROM payment_transactions WHERE reservation_id = ?)))`,
        [String(cumulResId), cumulResId]
      );
      expect(Number(arNetRows[0]?.net_ar || 0)).toBe(0.0);
    } finally {
      const records = await pool.query(
        'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id = ? OR source_entity_id IN (SELECT CAST(id AS CHAR) FROM payment_transactions WHERE reservation_id = ?)',
        [cumulResId, cumulResId]
      );
      const jIds = records.map((r) => r.journal_entry_id).filter(Boolean);
      if (jIds.length > 0) {
        const placeholders = jIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, jIds);
        await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, jIds);
      }
      await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_id = ? OR source_entity_id IN (SELECT CAST(id AS CHAR) FROM payment_transactions WHERE reservation_id = ?)', [cumulResId, cumulResId]);
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [cumulResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [cumulResId]);
    }
  });

  test('23. Full Prepayment vs Zero Prepayment Scenarios: Accurately reflects 100% advance and 100% credit stays', async () => {
    // A. 100% Fully Prepaid: 2 nights @ ₦40,000 = ₦80,000 paid in advance
    const resPre = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Prepaid Guest', 'prepaid@bfa.com', '2026-10-21', '2026-10-23', 2, 80000.00, 80000.00, 'CHECKED_IN', 'PAID')`,
      [`BFA-TEST-PRE-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const preResId = resPre.insertId;

    // B. 0% Advance (100% on Credit): 2 nights @ ₦40,000 = ₦80,000 unpaid
    const resPost = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, ?, ?, 'Postpaid Guest', 'postpaid@bfa.com', '2026-10-21', '2026-10-23', 2, 80000.00, 0.00, 'CHECKED_IN', 'PAYMENT_PENDING')`,
      [`BFA-TEST-POST-${Date.now().toString(36).toUpperCase()}`, testPropertyId, testApartmentId]
    );
    const postResId = resPost.insertId;

    try {
      // Record advance payment for resPre
      await pool.query(
        `INSERT INTO payment_transactions
         (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, paid_at)
         VALUES (?, ?, 'CARD', 80000.00, 'NGN', 'SUCCESS', 'PAYSTACK', ?, '2026-10-21 10:00:00')`,
        [preResId, `TXN-FULL-${Date.now()}`, `REF-FULL-${Date.now()}`]
      );

      // Recognize Night 1 for Prepaid Stay
      const recPre1 = await PostingBridgeService.postRevenueRecognition({
        reservationId: preResId,
        serviceDate: '2026-10-21',
        propertyId: testPropertyId,
        user: { id: 1, role: 'SUPER_ADMIN' },
      });
      const jPre1 = await AccountingRepository.findJournalById(recPre1.journal_entry_id);
      expect(jPre1.lines.some((l) => Number(l.debit) === 40000.0 && l.description.includes('Relief of'))).toBe(true);

      // Recognize Night 1 for Zero Prepayment Stay
      const recPost1 = await PostingBridgeService.postRevenueRecognition({
        reservationId: postResId,
        serviceDate: '2026-10-21',
        propertyId: testPropertyId,
        user: { id: 1, role: 'SUPER_ADMIN' },
      });
      const jPost1 = await AccountingRepository.findJournalById(recPost1.journal_entry_id);
      expect(jPost1.lines.some((l) => Number(l.debit) === 40000.0 && l.description.includes('Guest Receivable'))).toBe(true);
    } finally {
      for (const rId of [preResId, postResId]) {
        const records = await pool.query(
          'SELECT journal_entry_id FROM accounting_subledger_posting_records WHERE source_entity_id = ?',
          [rId]
        );
        const jIds = records.map((r) => r.journal_entry_id).filter(Boolean);
        if (jIds.length > 0) {
          const placeholders = jIds.map(() => '?').join(',');
          await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, jIds);
          await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, jIds);
          await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, jIds);
        }
        await pool.query('DELETE FROM accounting_subledger_posting_records WHERE source_entity_id = ?', [rId]);
        await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [rId]);
        await pool.query('DELETE FROM reservations WHERE id = ?', [rId]);
      }
    }
  });
});
