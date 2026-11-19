/**
 * Domain 4 (Payments) & Domain 5 (Accounting) Integration Tests
 * TASK AIVEN-05: Live Aiven PostgreSQL
 */

const { setEngineOverride, clearEngineOverride, withTransaction, query, closePool } = require('../src/db/pool');
const AccountingRepository = require('../src/modules/accounting/accounting.repository');
const PostingBridgeRepository = require('../src/modules/accounting/postingBridge.repository');
const PostingBridgeService = require('../src/modules/accounting/postingBridge.service');

describe('Domain 4 (Payments) & Domain 5 (Accounting) on PostgreSQL (TASK AIVEN-05)', () => {
  beforeAll(() => {
    setEngineOverride('postgres');
  });

  afterAll(async () => {
    clearEngineOverride();
    await closePool();
  });

  describe('Priority 4 — Payments Verification', () => {
    test('1. Payment transaction idempotency query executes on PostgreSQL', async () => {
      const rows = await query(
        "SELECT * FROM payment_transactions WHERE provider = ? AND provider_reference = ? AND status = 'SUCCESS' LIMIT 1",
        ['MOCK_GATEWAY', 'NON_EXISTENT_REF']
      );
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(0);
    });

    test('2. Isolated Transactional Payment Recording & Rollback', async () => {
      const txRef = `BFA-TXN-TEST-${Date.now().toString(36).toUpperCase()}`;
      const providerRef = `PROV-${Date.now()}`;

      try {
        await withTransaction(async (conn) => {
          // 1. Insert payment transaction for reservation #1
          const [insertRes] = await conn.query(
            `INSERT INTO payment_transactions 
             (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, paid_at)
             VALUES (1, ?, 'CARD', 150000.00, 'NGN', 'SUCCESS', 'FLUTTERWAVE', ?, CURRENT_TIMESTAMP)`,
            [txRef, providerRef]
          );

          expect(insertRes.insertId).toBeDefined();
          expect(insertRes.insertId).toBeGreaterThan(0);

          // 2. Verify duplicate check finds it inside transaction
          const [dupRows] = await conn.query(
            "SELECT id, transaction_reference FROM payment_transactions WHERE provider = ? AND provider_reference = ? AND status = 'SUCCESS' LIMIT 1",
            ['FLUTTERWAVE', providerRef]
          );
          expect(dupRows.length).toBe(1);
          expect(dupRows[0].transaction_reference).toBe(txRef);

          // 3. Rollback
          throw new Error('ROLLBACK_PAYMENT_TXN');
        });
      } catch (err) {
        if (!err.message.includes('ROLLBACK_PAYMENT_TXN')) throw err;
      }

      // Verify row does not exist outside transaction
      const check = await query('SELECT * FROM payment_transactions WHERE transaction_reference = ?', [txRef]);
      expect(check.length).toBe(0);
    });
  });

  describe('Priority 5 — Accounting Verification', () => {
    test('3. Chart of Accounts has all 27 standard seeded accounts', async () => {
      const accounts = await AccountingRepository.findAllAccounts();
      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBe(27);

      const codes = accounts.map((a) => a.account_code);
      expect(codes).toContain('1010'); // Cash in Bank
      expect(codes).toContain('1020'); // Petty Cash
      expect(codes).toContain('2020'); // Deferred Revenue
      expect(codes).toContain('4010'); // Accommodation Revenue
    });

    test('4. Specific accounts have correct normal balance definitions', async () => {
      const cash = await AccountingRepository.findAccountByCode('1010');
      expect(cash).toBeDefined();
      expect(cash.account_type).toBe('ASSET');
      expect(cash.normal_balance).toBe('DEBIT');
      expect(cash.is_active).toBe(true);
      expect(cash.is_posting_allowed).toBe(true);

      const deferred = await AccountingRepository.findAccountByCode('2020');
      expect(deferred).toBeDefined();
      expect(deferred.account_type).toBe('LIABILITY');
      expect(deferred.normal_balance).toBe('CREDIT');
    });

    test('5. Accounting periods are seeded and queryable', async () => {
      const periods = await AccountingRepository.findAllPeriods();
      expect(Array.isArray(periods)).toBe(true);
      expect(periods.length).toBeGreaterThanOrEqual(4);
    });

    test('6. Accounting subledger posting mappings are configured and active', async () => {
      const mapping = await PostingBridgeRepository.findMapping('PAYMENT_CARD_CLEARING');
      expect(mapping).toBeDefined();
      expect(mapping.mapping_key).toBe('PAYMENT_CARD_CLEARING');
      expect(mapping.account_code).toBeDefined();
      expect(mapping.is_active).toBe(true);
    });

    test('7. Trial Balance summary executes with boolean comparisons on PostgreSQL', async () => {
      const tb = await AccountingRepository.getTrialBalanceSummary();
      expect(tb).toBeDefined();
      expect(Array.isArray(tb.accounts)).toBe(true);
      expect(typeof tb.isBalanced).toBe('boolean');
    });

    test('8. Isolated Balanced Double-Entry Journal Entry with Rollback via AccountingRepository', async () => {
      const journalNum = `JRN-TEST-${Date.now().toString().slice(-6)}`;

      try {
        await withTransaction(async (conn) => {
          // Get Cash (1010) and Deferred Revenue (2020) accounts
          const cash = await AccountingRepository.findAccountByCode('1010', conn);
          const defRev = await AccountingRepository.findAccountByCode('2020', conn);

          const headerData = {
            journal_number: journalNum,
            entry_date: '2026-11-13',
            accounting_period_id: 1,
            description: 'Test Balanced Journal',
            source_type: 'MANUAL',
            status: 'DRAFT',
            created_by_id: 1,
          };

          const linesData = [
            {
              line_number: 1,
              account_id: cash.id,
              debit: 50000.0,
              credit: 0.0,
              description: 'Debit Cash',
            },
            {
              line_number: 2,
              account_id: defRev.id,
              debit: 0.0,
              credit: 50000.0,
              description: 'Credit Deferred Revenue',
            },
          ];

          // Use production repository method
          const created = await AccountingRepository.createJournalEntry(headerData, linesData, conn);
          expect(created.id).toBeDefined();
          expect(created.journal_number).toBe(journalNum);
          expect(parseFloat(created.total_debit)).toBe(50000.0);
          expect(parseFloat(created.total_credit)).toBe(50000.0);

          // Verify lines
          const lines = await AccountingRepository.findJournalLines(created.id, conn);
          expect(lines.length).toBe(2);

          // Rollback
          throw new Error('ROLLBACK_JOURNAL_TXN');
        });
      } catch (err) {
        if (!err.message.includes('ROLLBACK_JOURNAL_TXN')) throw err;
      }

      // Verify journal does not exist outside transaction
      const check = await query('SELECT * FROM journal_entries WHERE journal_number = ?', [journalNum]);
      expect(check.length).toBe(0);
    });
  });
});
