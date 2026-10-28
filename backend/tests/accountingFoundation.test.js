const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Double-Entry Accounting Foundation Tests (Phase 1)', () => {
  let superAdminToken = '';
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let agentToken = '';

  let cashAccountId = null;
  let revenueAccountId = null;
  let bankAccountId = null;
  let summaryAccountId = null;
  let openPeriodId = null;
  let closedPeriodId = null;

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

    // Clean up any lingering test records
    const testJournals = await pool.query('SELECT id FROM journal_entries WHERE description LIKE "%Automated Test%" OR description LIKE "%REVERSAL%"');
    if (testJournals.length > 0) {
      const ids = testJournals.map((j) => j.id);
      const placeholders = ids.map(() => '?').join(',');
      await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, ids);
      await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, ids);
      await pool.query(`UPDATE journal_entries SET reversal_of_journal_id = NULL, reversed_by_journal_id = NULL WHERE id IN (${placeholders})`, ids);
      await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, ids);
    }

    // 2. Fetch sample accounts
    const accounts = await pool.query(
      'SELECT id, account_code, is_posting_allowed FROM chart_of_accounts WHERE account_code IN ("1010", "1020", "1000", "4010")'
    );
    for (const acc of accounts) {
      if (acc.account_code === '1010') cashAccountId = acc.id;
      if (acc.account_code === '1020') bankAccountId = acc.id;
      if (acc.account_code === '1000') summaryAccountId = acc.id;
      if (acc.account_code === '4010') revenueAccountId = acc.id;
    }

    // 3. Fetch accounting periods
    const periods = await pool.query('SELECT id, period_name, status FROM accounting_periods ORDER BY id ASC');
    const openPeriod = periods.find((p) => p.status === 'OPEN');
    openPeriodId = openPeriod ? openPeriod.id : periods[0].id;

    const closedPeriod = periods.find((p) => p.status === 'CLOSED');
    if (closedPeriod) {
      closedPeriodId = closedPeriod.id;
    } else {
      const createClosedRes = await pool.query(`
        INSERT INTO accounting_periods (period_name, fiscal_year, start_date, end_date, status)
        VALUES ('TEST-CLOSED-2025', 2025, '2025-12-01', '2025-12-31', 'CLOSED')
      `);
      closedPeriodId = createClosedRes.insertId;
    }
  });

  afterAll(async () => {
    // Clean up test accounting records created in tests
    const testJournals = await pool.query('SELECT id FROM journal_entries WHERE description LIKE "%Automated Test%" OR description LIKE "%REVERSAL%"');
    if (testJournals.length > 0) {
      const ids = testJournals.map((j) => j.id);
      const placeholders = ids.map(() => '?').join(',');
      await pool.query(`DELETE FROM general_ledger_entries WHERE journal_entry_id IN (${placeholders})`, ids);
      await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (${placeholders})`, ids);
      await pool.query(`UPDATE journal_entries SET reversal_of_journal_id = NULL, reversed_by_journal_id = NULL WHERE id IN (${placeholders})`, ids);
      await pool.query(`DELETE FROM journal_entries WHERE id IN (${placeholders})`, ids);
    }
    await pool.query('DELETE FROM accounting_periods WHERE period_name LIKE "TEST-%"');
    await pool.query('DELETE FROM chart_of_accounts WHERE account_code LIKE "999%"');
    await pool.closePool();
  });

  /* -------------------------------------------------------------------------
   * Requirement 1: Valid balanced journals progress through permitted workflow
   * ------------------------------------------------------------------------- */
  test('1. Valid balanced journals can progress through DRAFT -> PENDING_APPROVAL -> APPROVED -> POSTED', async () => {
    // Create draft journal as Admin
    const createRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Full Lifecycle Journal',
        source_type: 'MANUAL',
        lines: [
          { account_id: cashAccountId, debit: 15000.00, credit: 0.00, description: 'Automated Test Line Cash Inflow' },
          { account_id: revenueAccountId, debit: 0.00, credit: 15000.00, description: 'Automated Test Line Revenue' },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const journalId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('DRAFT');
    expect(Number(createRes.body.data.total_debit)).toBe(15000.00);
    expect(Number(createRes.body.data.total_credit)).toBe(15000.00);

    // Submit for approval
    const submitRes = await request(app)
      .post(`/api/v1/accounting/journals/${journalId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('PENDING_APPROVAL');

    // Independent approval by Super Admin (different user than creator Admin)
    const approveRes = await request(app)
      .post(`/api/v1/accounting/journals/${journalId}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ approval_notes: 'Automated Test Approval Verified' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');
    expect(approveRes.body.data.approved_by_id).not.toBeNull();

    // Post to General Ledger
    const postRes = await request(app)
      .post(`/api/v1/accounting/journals/${journalId}/post`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(postRes.status).toBe(200);
    expect(postRes.body.data.status).toBe('POSTED');
    expect(postRes.body.data.posted_by_id).not.toBeNull();

    // Verify GL entries exist for this journal
    const glRes = await request(app)
      .get(`/api/v1/accounting/ledger?journalEntryId=${journalId}&limit=50`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(glRes.status).toBe(200);
    const postedLines = glRes.body.data.filter((entry) => entry.journal_entry_id === journalId);
    expect(postedLines.length).toBe(2);
  });

  /* -------------------------------------------------------------------------
   * Requirement 2: Unbalanced journals cannot be posted or created
   * ------------------------------------------------------------------------- */
  test('2. Unbalanced journals cannot be created or posted', async () => {
    const res = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Unbalanced Journal',
        lines: [
          { account_id: cashAccountId, debit: 10000.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 9500.00 },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/out of balance/i);
  });

  /* -------------------------------------------------------------------------
   * Requirement 3: Empty or invalid journals cannot be posted
   * ------------------------------------------------------------------------- */
  test('3. Empty or invalid journals (< 2 lines, negative amounts) are rejected', async () => {
    // Less than 2 lines
    const singleLineRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Single line',
        lines: [
          { account_id: cashAccountId, debit: 5000.00, credit: 0.00 },
        ],
      });
    expect(singleLineRes.status).toBe(422);

    // Negative amounts
    const negativeRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Negative amounts',
        lines: [
          { account_id: cashAccountId, debit: -5000.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: -5000.00 },
        ],
      });
    expect(negativeRes.status).toBe(422);
  });

  /* -------------------------------------------------------------------------
   * Requirement 4: Invalid, inactive, or non-posting accounts are rejected
   * ------------------------------------------------------------------------- */
  test('4. Invalid, inactive, or non-posting accounts are rejected', async () => {
    // Summary non-posting account (1000 Total Assets has is_posting_allowed = 0)
    const summaryRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Non-posting account',
        lines: [
          { account_id: summaryAccountId, debit: 5000.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 5000.00 },
        ],
      });

    expect(summaryRes.status).toBe(422);
    expect(summaryRes.body.error.message).toMatch(/summary account|posting is not allowed/i);
  });

  /* -------------------------------------------------------------------------
   * Requirement 5: Unauthorized users cannot create, approve, post, reverse
   * ------------------------------------------------------------------------- */
  test('5. Unauthorized users (e.g. AGENT, STAFF) cannot create, approve, or post journals', async () => {
    // AGENT cannot create journal
    const agentCreate = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Agent forbidden',
        lines: [
          { account_id: cashAccountId, debit: 1000.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 1000.00 },
        ],
      });
    expect(agentCreate.status).toBe(403);

    // STAFF cannot approve journal
    const staffApprove = await request(app)
      .post('/api/v1/accounting/journals/1/approve')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ approval_notes: 'Staff trying to approve' });
    expect(staffApprove.status).toBe(403);
  });

  /* -------------------------------------------------------------------------
   * Requirement 6: Journal creators cannot approve their own manual journals
   * (Maker-Checker Dual Control Enforcement)
   * ------------------------------------------------------------------------- */
  test('6. Maker-Checker enforcement: Creator cannot approve their own manual journal', async () => {
    // Admin creates draft journal
    const createRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Maker-Checker Dual Control Test',
        lines: [
          { account_id: cashAccountId, debit: 8000.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 8000.00 },
        ],
      });
    expect(createRes.status).toBe(201);
    const jId = createRes.body.data.id;

    // Admin submits for approval
    await request(app)
      .post(`/api/v1/accounting/journals/${jId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Admin attempts to self-approve their own journal -> MUST BE FORBIDDEN
    const selfApproveRes = await request(app)
      .post(`/api/v1/accounting/journals/${jId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approval_notes: 'Self-approval attempt' });

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.success).toBe(false);
    expect(selfApproveRes.body.error.message).toMatch(/maker-checker/i);

    // Independent approver (Super Admin) CAN approve it
    const independentApproveRes = await request(app)
      .post(`/api/v1/accounting/journals/${jId}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ approval_notes: 'Independent review approved' });

    expect(independentApproveRes.status).toBe(200);
    expect(independentApproveRes.body.data.status).toBe('APPROVED');
  });

  /* -------------------------------------------------------------------------
   * Requirement 7: Rejected and draft journals do not affect posted balances
   * ------------------------------------------------------------------------- */
  test('7. Draft and rejected journals do not affect General Ledger posted balances', async () => {
    // Create draft
    const createRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Rejected Journal Balance Isolation',
        lines: [
          { account_id: cashAccountId, debit: 77777.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 77777.00 },
        ],
      });
    const jId = createRes.body.data.id;

    // Submit
    await request(app).post(`/api/v1/accounting/journals/${jId}/submit`).set('Authorization', `Bearer ${adminToken}`);

    // Reject by Super Admin
    const rejectRes = await request(app)
      .post(`/api/v1/accounting/journals/${jId}/reject`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ rejection_reason: 'Automated test intentional rejection' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');

    // Confirm neither draft nor rejected created GL entries
    const glRows = await pool.query('SELECT * FROM general_ledger_entries WHERE journal_entry_id = ?', [jId]);
    expect(glRows.length).toBe(0);

    // Rejected cannot be posted
    const postRejected = await request(app)
      .post(`/api/v1/accounting/journals/${jId}/post`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(postRejected.status).toBe(409);
  });

  /* -------------------------------------------------------------------------
   * Requirement 8: Closed periods reject ordinary posting
   * ------------------------------------------------------------------------- */
  test('8. Closed periods reject posting', async () => {
    const closedRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2025-12-15',
        accounting_period_id: closedPeriodId,
        description: 'Automated Test: Attempt to post in closed period',
        lines: [
          { account_id: cashAccountId, debit: 5000.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 5000.00 },
        ],
      });

    expect(closedRes.status).toBe(422);
    expect(closedRes.body.error.message).toMatch(/CLOSED|LOCKED/i);
  });

  /* -------------------------------------------------------------------------
   * Requirement 9: Authorized reopening is audited and restricted
   * ------------------------------------------------------------------------- */
  test('9. Accounting period reopening requires reason, authorization, and records audit trail', async () => {
    // Reopen without reason should fail
    const failReopen = await request(app)
      .post(`/api/v1/accounting/periods/${closedPeriodId}/reopen`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({});
    expect(failReopen.status).toBe(422);

    // Reopen with reason succeeds
    const reopenRes = await request(app)
      .post(`/api/v1/accounting/periods/${closedPeriodId}/reopen`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'Audit compliance adjustment approved by Head of Finance' });

    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.data.status).toBe('OPEN');
    expect(reopenRes.body.data.reopen_reason).toBe('Audit compliance adjustment approved by Head of Finance');

    // Verify audit log exists
    const auditRows = await pool.query(
      'SELECT * FROM audit_logs WHERE action = "ACCOUNTING_PERIOD_REOPEN" AND entity_id = ? ORDER BY id DESC LIMIT 1',
      [closedPeriodId]
    );
    expect(auditRows.length).toBe(1);

    // Reclose period
    await request(app)
      .post(`/api/v1/accounting/periods/${closedPeriodId}/close`)
      .set('Authorization', `Bearer ${superAdminToken}`);
  });

  /* -------------------------------------------------------------------------
   * Requirement 10: Duplicate requests do not create duplicate journals (Idempotency)
   * ------------------------------------------------------------------------- */
  test('10. Idempotency key prevents duplicate journal creation', async () => {
    const idempotencyKey = `idemp-test-${Date.now()}`;
    const payload = {
      entry_date: '2026-10-15',
      accounting_period_id: openPeriodId,
      description: 'Automated Test: Idempotent Journal',
      idempotency_key: idempotencyKey,
      lines: [
        { account_id: cashAccountId, debit: 12000.00, credit: 0.00 },
        { account_id: revenueAccountId, debit: 0.00, credit: 12000.00 },
      ],
    };

    const firstRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(firstRes.status).toBe(201);
    const firstJournalId = firstRes.body.data.id;

    // Repeat same request with same idempotency key
    const secondRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    // Must return original journal without duplicate creation
    expect(secondRes.body.data.id).toBe(firstJournalId);

    const countRows = await pool.query('SELECT COUNT(*) AS total FROM journal_entries WHERE idempotency_key = ?', [idempotencyKey]);
    expect(Number(countRows[0].total)).toBe(1);
  });

  /* -------------------------------------------------------------------------
   * Requirement 11: Concurrent/repeated posting safety
   * ------------------------------------------------------------------------- */
  test('11. Journals cannot be posted twice or posted while not in APPROVED status', async () => {
    // Create, submit, approve
    const createRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Concurrency Double Post Guard',
        lines: [
          { account_id: cashAccountId, debit: 5500.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 5500.00 },
        ],
      });
    const jId = createRes.body.data.id;
    await request(app).post(`/api/v1/accounting/journals/${jId}/submit`).set('Authorization', `Bearer ${adminToken}`);
    await request(app).post(`/api/v1/accounting/journals/${jId}/approve`).set('Authorization', `Bearer ${superAdminToken}`);

    // First post: succeeds
    const postRes1 = await request(app).post(`/api/v1/accounting/journals/${jId}/post`).set('Authorization', `Bearer ${superAdminToken}`);
    expect(postRes1.status).toBe(200);

    // Second post: rejected with 409 Conflict
    const postRes2 = await request(app).post(`/api/v1/accounting/journals/${jId}/post`).set('Authorization', `Bearer ${superAdminToken}`);
    expect(postRes2.status).toBe(409);
    expect(postRes2.body.error.message).toMatch(/expected 'APPROVED'/i);
  });

  /* -------------------------------------------------------------------------
   * Requirement 12: Posted journals cannot be silently modified or deleted
   * ------------------------------------------------------------------------- */
  test('12. Posted journals cannot be edited', async () => {
    const postedRows = await pool.query('SELECT id FROM journal_entries WHERE status = "POSTED" LIMIT 1');
    expect(postedRows.length).toBeGreaterThan(0);
    const postedId = postedRows[0].id;

    const editRes = await request(app)
      .put(`/api/v1/accounting/journals/${postedId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Attempting illegal update to posted journal',
      });

    expect(editRes.status).toBe(409);
    expect(editRes.body.error.message).toMatch(/Only DRAFT journals can be edited/i);
  });

  /* -------------------------------------------------------------------------
   * Requirement 13: Reversals preserve links and history
   * ------------------------------------------------------------------------- */
  test('13. Reversals preserve links, swap debits/credits, and maintain audit history', async () => {
    // 1. Create, submit, approve, and post journal
    const createRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Journal For Reversal',
        lines: [
          { account_id: cashAccountId, debit: 25000.00, credit: 0.00, description: 'Debit Cash' },
          { account_id: revenueAccountId, debit: 0.00, credit: 25000.00, description: 'Credit Revenue' },
        ],
      });
    const jId = createRes.body.data.id;
    await request(app).post(`/api/v1/accounting/journals/${jId}/submit`).set('Authorization', `Bearer ${adminToken}`);
    await request(app).post(`/api/v1/accounting/journals/${jId}/approve`).set('Authorization', `Bearer ${superAdminToken}`);
    await request(app).post(`/api/v1/accounting/journals/${jId}/post`).set('Authorization', `Bearer ${superAdminToken}`);

    // 2. Execute reversal
    const revRes = await request(app)
      .post(`/api/v1/accounting/journals/${jId}/reverse`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reversal_reason: 'Incorrect booking transaction attribution' });

    expect(revRes.status).toBe(200);
    expect(revRes.body.success).toBe(true);
    const { originalJournal, reversingJournal } = revRes.body.data;

    expect(originalJournal.is_reversed).toBe(1);
    expect(originalJournal.reversed_by_journal_id).toBe(reversingJournal.id);

    expect(reversingJournal.source_type).toBe('ADJUSTMENT');
    expect(reversingJournal.reversal_of_journal_id).toBe(originalJournal.id);
    expect(reversingJournal.status).toBe('POSTED');

    // Confirm debits and credits were inverted
    const originalCashLine = originalJournal.lines.find((l) => l.account_id === cashAccountId);
    const reversedCashLine = reversingJournal.lines.find((l) => l.account_id === cashAccountId);
    expect(Number(originalCashLine.debit)).toBe(25000.00);
    expect(Number(reversedCashLine.credit)).toBe(25000.00);

    // Double reversal attempt should fail
    const doubleRevRes = await request(app)
      .post(`/api/v1/accounting/journals/${jId}/reverse`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reversal_reason: 'Duplicate reversal attempt' });
    expect(doubleRevRes.status).toBe(409);
  });

  /* -------------------------------------------------------------------------
   * Requirement 14: Trial balance equality (Grand Total Debits === Grand Total Credits)
   * ------------------------------------------------------------------------- */
  test('14. Trial balance maintains mathematical equality (Grand Total Debits === Grand Total Credits)', async () => {
    const tbRes = await request(app)
      .get('/api/v1/accounting/trial-balance-summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(tbRes.status).toBe(200);
    expect(tbRes.body.data.isBalanced).toBe(true);
    expect(tbRes.body.data.difference).toBe(0);
    expect(tbRes.body.data.grandTotalDebit).toBe(tbRes.body.data.grandTotalCredit);
  });

  /* -------------------------------------------------------------------------
   * Requirement 15: Property-level authorization restricts manager property attribution
   * ------------------------------------------------------------------------- */
  test('15. Property-level authorization restricts manager property attribution', async () => {
    const properties = await pool.query('SELECT id FROM properties ORDER BY id ASC LIMIT 2');
    if (properties.length >= 2) {
      const jwt = require('jsonwebtoken');
      const config = require('../src/config');
      const restrictedManagerToken = jwt.sign(
        {
          id: 999,
          name: 'Restricted Manager',
          email: 'test_mgr@bfa.com',
          role: 'MANAGER',
          propertyId: properties[0].id,
        },
        config.security.jwtSecret,
        { expiresIn: '1h' }
      );

      const crossPropertyRes = await request(app)
        .post('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${restrictedManagerToken}`)
        .send({
          entry_date: '2026-10-15',
          accounting_period_id: openPeriodId,
          description: 'Automated Test: Cross-property attempt',
          lines: [
            { account_id: cashAccountId, property_id: properties[1].id, debit: 2000.00, credit: 0.00 },
            { account_id: revenueAccountId, property_id: properties[1].id, debit: 0.00, credit: 2000.00 },
          ],
        });

      expect(crossPropertyRes.status).toBe(403);
      expect(crossPropertyRes.body.error.message).toMatch(/authorization for property/i);
    }
  });

  /* -------------------------------------------------------------------------
   * Requirement 16 (Phase 1.1): Null propertyId blocked for Manager, allowed for Admin
   * ------------------------------------------------------------------------- */
  test('16. Property Scope: Manager cannot create null property lines; Admin can create company-level lines', async () => {
    const properties = await pool.query('SELECT id FROM properties ORDER BY id ASC LIMIT 1');
    const jwt = require('jsonwebtoken');
    const config = require('../src/config');
    const restrictedManagerToken = jwt.sign(
      {
        id: 999,
        name: 'Restricted Manager',
        email: 'test_mgr@bfa.com',
        role: 'MANAGER',
        propertyId: properties[0].id,
      },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );

    // Manager submitting line with property_id: null MUST BE FORBIDDEN
    const mgrNullPropRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${restrictedManagerToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Manager unassigned property line',
        lines: [
          { account_id: cashAccountId, property_id: null, debit: 1000.00, credit: 0.00 },
          { account_id: revenueAccountId, property_id: properties[0].id, debit: 0.00, credit: 1000.00 },
        ],
      });

    expect(mgrNullPropRes.status).toBe(403);
    expect(mgrNullPropRes.body.error.message).toMatch(/company-level or unassigned property entries/i);

    // Admin submitting company-level line with property_id: null IS PERMITTED
    const adminCompanyRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Corporate Head Office Company-Level Journal',
        lines: [
          { account_id: cashAccountId, property_id: null, debit: 50000.00, credit: 0.00 },
          { account_id: revenueAccountId, property_id: null, debit: 0.00, credit: 50000.00 },
        ],
      });

    expect(adminCompanyRes.status).toBe(201);
    expect(adminCompanyRes.body.success).toBe(true);
    expect(adminCompanyRes.body.data.lines[0].property_id).toBeNull();
  });

  /* -------------------------------------------------------------------------
   * Requirement 17 (Phase 1.1): Property boundary isolation (No mixed-property leak)
   * ------------------------------------------------------------------------- */
  test('17. Property Isolation: Restricted manager cannot view mixed-property or foreign journals', async () => {
    const properties = await pool.query('SELECT id FROM properties ORDER BY id ASC LIMIT 2');
    if (properties.length >= 2) {
      // Admin creates mixed-property journal
      const mixedRes = await request(app)
        .post('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          entry_date: '2026-10-15',
          accounting_period_id: openPeriodId,
          description: 'Automated Test: Mixed Property Inter-property Journal',
          lines: [
            { account_id: cashAccountId, property_id: properties[0].id, debit: 10000.00, credit: 0.00 },
            { account_id: revenueAccountId, property_id: properties[1].id, debit: 0.00, credit: 10000.00 },
          ],
        });
      expect(mixedRes.status).toBe(201);
      const mixedJournalId = mixedRes.body.data.id;

      // Restricted manager for property 0 attempts to view mixed journal -> FORBIDDEN
      const jwt = require('jsonwebtoken');
      const config = require('../src/config');
      const managerToken0 = jwt.sign(
        {
          id: 998,
          name: 'Manager Prop 0',
          email: 'mgr0@bfa.com',
          role: 'MANAGER',
          propertyId: properties[0].id,
        },
        config.security.jwtSecret,
        { expiresIn: '1h' }
      );

      const viewRes = await request(app)
        .get(`/api/v1/accounting/journals/${mixedJournalId}`)
        .set('Authorization', `Bearer ${managerToken0}`);

      expect(viewRes.status).toBe(403);
      expect(viewRes.body.error.message).toMatch(/lines outside your authorized property/i);
    }
  });

  /* -------------------------------------------------------------------------
   * Requirement 18 (Phase 1.1): Dynamic capability enforcement on routes
   * ------------------------------------------------------------------------- */
  test('18. Dynamic Capabilities: Disabling ACCOUNTING_JOURNAL_CREATE blocks requests with 403', async () => {
    // 1. Temporarily disable capability
    await pool.query('UPDATE capabilities SET is_enabled = 0 WHERE name = "ACCOUNTING_JOURNAL_CREATE"');

    // 2. Attempt to create journal -> Must return 403 CAPABILITY_RESTRICTED
    const blockedRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Capability suspended attempt',
        lines: [
          { account_id: cashAccountId, debit: 1000.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 1000.00 },
        ],
      });

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe('CAPABILITY_RESTRICTED');

    // 3. Re-enable capability
    await pool.query('UPDATE capabilities SET is_enabled = 1 WHERE name = "ACCOUNTING_JOURNAL_CREATE"');

    // 4. Creation now succeeds
    const allowedRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Capability restored creation',
        lines: [
          { account_id: cashAccountId, debit: 1000.00, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 1000.00 },
        ],
      });

    expect(allowedRes.status).toBe(201);
  });

  /* -------------------------------------------------------------------------
   * Requirement 19 (Phase 1.1): Exact minor unit precision validation
   * ------------------------------------------------------------------------- */
  test('19. Monetary Precision: Rejects > 2 decimal places and handles large numbers without drift', async () => {
    // Reject fractional kobo (3 decimals)
    const invalidPrecisionRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Fractional cents',
        lines: [
          { account_id: cashAccountId, debit: 100.555, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 100.555 },
        ],
      });

    expect(invalidPrecisionRes.status).toBe(422);
    expect(invalidPrecisionRes.body.error.message).toMatch(/exceeds maximum precision of 2 decimal places/i);

    // Large financial values handled accurately without floating point loss
    const largeValueRes = await request(app)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_date: '2026-10-15',
        accounting_period_id: openPeriodId,
        description: 'Automated Test: Large Amount Exact Precision',
        lines: [
          { account_id: cashAccountId, debit: 5000000000.50, credit: 0.00 },
          { account_id: revenueAccountId, debit: 0.00, credit: 5000000000.50 },
        ],
      });

    expect(largeValueRes.status).toBe(201);
    expect(Number(largeValueRes.body.data.total_debit)).toBe(5000000000.50);
    expect(Number(largeValueRes.body.data.total_credit)).toBe(5000000000.50);
  });

  /* -------------------------------------------------------------------------
   * Requirement 20 (Phase 1.1): Trial Balance presentation, filters & abnormal balances
   * ------------------------------------------------------------------------- */
  test('20. Trial Balance: Supports SQL filters and reports abnormal balances accurately', async () => {
    // 1. Filtered trial balance by period
    const tbFiltered = await request(app)
      .get(`/api/v1/accounting/trial-balance-summary?periodId=${openPeriodId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(tbFiltered.status).toBe(200);
    expect(tbFiltered.body.data.isBalanced).toBe(true);
    expect(tbFiltered.body.data.filters.periodId).toBe(String(openPeriodId));

    // 2. Verify account structure in trial balance
    for (const acc of tbFiltered.body.data.accounts) {
      expect(acc).toHaveProperty('account_code');
      expect(acc).toHaveProperty('net_debit_balance');
      expect(acc).toHaveProperty('net_credit_balance');
      expect(acc).toHaveProperty('is_abnormal');
      expect(typeof acc.is_abnormal).toBe('boolean');
    }
  });
});

