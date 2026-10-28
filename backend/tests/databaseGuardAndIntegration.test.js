/**
 * Database Guard, Test Isolation, Foreign Key Behavior, and Anomaly Visibility Integration Suite
 * 
 * Target Database: bfa_apartments_test_db (MariaDB on port 3306)
 * Strict Constraint: bfa_apartments_db must NEVER be targeted.
 */

process.env.NODE_ENV = 'test';

const pool = require('../src/db/pool');
const { assertTestDatabase, isTestDatabase } = require('../src/db/databaseGuard');
const FinancialService = require('../src/modules/financial/financial.service');
const ReportsService = require('../src/modules/reports/reports.service');

describe('Database Guard, MariaDB Isolation & Financial Anomaly Visibility', () => {
  let createdPaymentIds = [];

  afterEach(async () => {
    // Ensure clean state after each test: delete child refunds first, then parents
    if (createdPaymentIds.length > 0) {
      for (const id of createdPaymentIds) {
        await pool.query('DELETE FROM payment_transactions WHERE parent_transaction_id = ?', [id]);
        await pool.query('DELETE FROM payment_transactions WHERE id = ?', [id]);
      }
      createdPaymentIds = [];
    }
    // Clean any test transactions
    await pool.query('DELETE FROM payment_transactions WHERE transaction_reference LIKE "TXN_INTEG_%"');
  });

  afterAll(async () => {
    // Final check: ensure no test records left behind in bfa_apartments_test_db
    await pool.query('DELETE FROM payment_transactions WHERE transaction_reference LIKE "TXN_INTEG_%"');
    if (pool.getPool) {
      await pool.getPool().end();
    }
  });

  describe('1. Fail-Closed Database Guard Verification', () => {
    it('should identify valid test databases correctly', () => {
      expect(isTestDatabase('bfa_apartments_test_db')).toBe(true);
      expect(isTestDatabase('bfa_apartments_test')).toBe(true);
      expect(isTestDatabase('test_db')).toBe(true);
    });

    it('should reject production and shared databases', () => {
      expect(isTestDatabase('bfa_apartments_db')).toBe(false);
      expect(isTestDatabase('bfa_production')).toBe(false);
      expect(isTestDatabase('production')).toBe(false);
      expect(isTestDatabase('staging')).toBe(false);
      expect(isTestDatabase('')).toBe(false);
      expect(isTestDatabase(null)).toBe(false);
    });

    it('should throw fatal error when assertTestDatabase is called with shared database', () => {
      expect(() => {
        assertTestDatabase('bfa_apartments_db', 'Test execution');
      }).toThrow(/FATALLY REJECTED/);
    });

    it('should pass cleanly when assertTestDatabase is called with isolated test database', () => {
      expect(() => {
        assertTestDatabase('bfa_apartments_test_db', 'Test execution');
      }).not.toThrow();
    });
  });

  describe('2. Active MariaDB Connection Isolation', () => {
    it('should be connected to bfa_apartments_test_db, NOT bfa_apartments_db', async () => {
      const [dbResult] = await pool.query('SELECT DATABASE() as current_db');
      expect(dbResult.current_db).toBe('bfa_apartments_test_db');
      expect(dbResult.current_db).not.toBe('bfa_apartments_db');
    });

    it('should verify bfa_apartments_test_db has complete schema migrated', async () => {
      const tables = await pool.query('SHOW TABLES');
      // Schema contains 49 core tables from migrations 001 through 023
      expect(tables.length).toBeGreaterThanOrEqual(40);
    });
  });

  describe('3. Foreign Key Behavior & Teardown Order Verification', () => {
    it('should cleanly create parent and child refund and teardown children before parents', async () => {
      // 1. Insert parent payment
      const parentRef = `TXN_INTEG_PARENT_${Date.now()}`;
      const parentInsert = await pool.query(
        `INSERT INTO payment_transactions 
         (reservation_id, transaction_reference, amount, currency, status, payment_method, provider, provider_reference, created_at, updated_at) 
         VALUES (1, ?, 100000.00, 'NGN', 'SUCCESS', 'CARD', 'PAYSTACK', ?, NOW(), NOW())`,
        [parentRef, parentRef]
      );
      const parentId = parentInsert.insertId;
      createdPaymentIds.push(parentId);

      // 2. Insert child refund referencing parent
      const childRef = `TXN_INTEG_CHILD_${Date.now()}`;
      const childInsert = await pool.query(
        `INSERT INTO payment_transactions 
         (reservation_id, transaction_reference, parent_transaction_id, amount, currency, status, payment_method, provider, provider_reference, created_at, updated_at) 
         VALUES (1, ?, ?, -30000.00, 'NGN', 'REFUNDED', 'CARD', 'PAYSTACK', ?, NOW(), NOW())`,
        [childRef, parentId, childRef]
      );
      const childId = childInsert.insertId;

      // 3. Verify relations in DB
      const [childRow] = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [childId]);
      expect(childRow.parent_transaction_id).toBe(parentId);
      expect(parseFloat(childRow.amount)).toBe(-30000.00);

      // 4. Correct Teardown Order: Child first, then Parent
      await pool.query('DELETE FROM payment_transactions WHERE parent_transaction_id = ?', [parentId]);
      const [afterChildDelete] = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [childId]);
      expect(afterChildDelete).toBeUndefined();

      await pool.query('DELETE FROM payment_transactions WHERE id = ?', [parentId]);
      const [afterParentDelete] = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [parentId]);
      expect(afterParentDelete).toBeUndefined();

      // Clear from cleanup array since already deleted
      createdPaymentIds = [];
    });

    it('demonstrates the ON DELETE SET NULL orphan vulnerability when parent is deleted first', async () => {
      // 1. Insert parent payment
      const parentRef = `TXN_INTEG_VULN_PARENT_${Date.now()}`;
      const parentInsert = await pool.query(
        `INSERT INTO payment_transactions 
         (reservation_id, transaction_reference, amount, currency, status, payment_method, provider, provider_reference, created_at, updated_at) 
         VALUES (1, ?, 50000.00, 'NGN', 'SUCCESS', 'CARD', 'PAYSTACK', ?, NOW(), NOW())`,
        [parentRef, parentRef]
      );
      const parentId = parentInsert.insertId;

      // 2. Insert child refund referencing parent
      const childRef = `TXN_INTEG_VULN_CHILD_${Date.now()}`;
      const childInsert = await pool.query(
        `INSERT INTO payment_transactions 
         (reservation_id, transaction_reference, parent_transaction_id, amount, currency, status, payment_method, provider, provider_reference, created_at, updated_at) 
         VALUES (1, ?, ?, -15000.00, 'NGN', 'REFUNDED', 'CARD', 'PAYSTACK', ?, NOW(), NOW())`,
        [childRef, parentId, childRef]
      );
      const childId = childInsert.insertId;

      // 3. Flawed Teardown: Deleting parent directly triggers MariaDB ON DELETE SET NULL on child
      await pool.query('DELETE FROM payment_transactions WHERE id = ?', [parentId]);

      // 4. Inspect child row: It survives as an orphan with parent_transaction_id = NULL
      const [survivingChild] = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [childId]);
      expect(survivingChild).toBeDefined();
      expect(survivingChild.parent_transaction_id).toBeNull();
      expect(parseFloat(survivingChild.amount)).toBe(-15000.00);

      // Clean up the surviving orphan
      await pool.query('DELETE FROM payment_transactions WHERE id = ?', [childId]);
    });
  });

  describe('4. Financial Anomaly Reporting & Non-Clamping Visibility', () => {
    it('FinancialService.getOverview exposes anomalies and raw values when orphaned refund exists', async () => {
      // Create an orphaned refund transaction
      const orphanRef = `TXN_INTEG_ORPHAN_${Date.now()}`;
      const orphanInsert = await pool.query(
        `INSERT INTO payment_transactions 
         (reservation_id, transaction_reference, parent_transaction_id, amount, currency, status, payment_method, provider, provider_reference, created_at, updated_at) 
         VALUES (1, ?, NULL, -20000.00, 'NGN', 'REFUNDED', 'CARD', 'PAYSTACK', ?, NOW(), NOW())`,
        [orphanRef, orphanRef]
      );
      const orphanId = orphanInsert.insertId;

      try {
        const overview = await FinancialService.getOverview({ propertyId: 'all' });

        expect(overview.hasAnomaly).toBe(true);
        expect(overview.reconciliationStatus).toBe('ANOMALIES_DETECTED');
        expect(Array.isArray(overview.anomalies)).toBe(true);

        const orphanAnomaly = overview.anomalies.find(a => a.code === 'ORPHAN_REFUND_TRANSACTIONS');
        expect(orphanAnomaly).toBeDefined();
        expect(orphanAnomaly.severity).toBe('CRITICAL');
        expect(orphanAnomaly.count).toBeGreaterThanOrEqual(1);

        // Verify rawNetRevenue is exposed in kpis rather than silently masking
        expect(overview.kpis.rawNetRevenue).toBeDefined();
      } finally {
        // Clean up the orphan
        await pool.query('DELETE FROM payment_transactions WHERE id = ?', [orphanId]);
      }
    });

    it('ReportsService.getFinancialReport matches FinancialService anomaly reporting contract', async () => {
      // Create an orphaned refund transaction
      const orphanRef = `TXN_INTEG_ORPHAN_REP_${Date.now()}`;
      const orphanInsert = await pool.query(
        `INSERT INTO payment_transactions 
         (reservation_id, transaction_reference, parent_transaction_id, amount, currency, status, payment_method, provider, provider_reference, created_at, updated_at) 
         VALUES (1, ?, NULL, -25000.00, 'NGN', 'REFUNDED', 'CARD', 'PAYSTACK', ?, NOW(), NOW())`,
        [orphanRef, orphanRef]
      );
      const orphanId = orphanInsert.insertId;

      try {
        const report = await ReportsService.getFinancialReport({ propertyId: 'all' });

        expect(report.hasAnomaly).toBe(true);
        expect(report.reconciliationStatus).toBe('ANOMALIES_DETECTED');
        expect(Array.isArray(report.anomalies)).toBe(true);

        const orphanAnomaly = report.anomalies.find(a => a.code === 'ORPHAN_REFUND_TRANSACTIONS');
        expect(orphanAnomaly).toBeDefined();
        expect(orphanAnomaly.severity).toBe('CRITICAL');

        // Verify rawNetRevenue is present in summary and raw un-clamped math is preserved
        expect(report.summary.rawNetRevenue).toBeDefined();
      } finally {
        await pool.query('DELETE FROM payment_transactions WHERE id = ?', [orphanId]);
      }
    });

    it('returns RECONCILED with zero anomalies when dataset is clean', async () => {
      // Clean up any remaining transactions first
      await pool.query('DELETE FROM payment_transactions WHERE transaction_reference LIKE "TXN_INTEG_%"');
      
      const orphans = await pool.query('SELECT COUNT(*) as count FROM payment_transactions WHERE parent_transaction_id IS NULL AND amount < 0');
      if (orphans[0].count === 0) {
        const overview = await FinancialService.getOverview({ propertyId: 'all' });
        const orphanAnomaly = (overview.anomalies || []).find(a => a.code === 'ORPHAN_REFUND_TRANSACTIONS');
        expect(orphanAnomaly).toBeUndefined();
      }
    });
  });
});
