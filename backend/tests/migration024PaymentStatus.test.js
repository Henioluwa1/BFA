/**
 * Migration 024 Payment Status ENUM & Fresh-Install Integrity Regression Suite
 * 
 * Target: Tests schema compliance, upgrade behavior, legacy status preservation,
 * and PARTIALLY_REFUNDED support without touching bfa_apartments_db.
 */

process.env.NODE_ENV = 'test';
jest.setTimeout(30000);

const pool = require('../src/db/pool');
const { assertTestDatabase } = require('../src/db/databaseGuard');
const mysql = require('mysql2/promise');
const config = require('../src/config');
const fs = require('fs');
const path = require('path');

describe('Migration 024 — Payment Status ENUM & Fresh-Install Integrity', () => {
  let createdTxnIds = [];

  beforeAll(async () => {
    assertTestDatabase(process.env.DB_NAME || 'bfa_apartments_test_db', 'Migration 024 Test Suite');
  });

  afterEach(async () => {
    if (createdTxnIds.length > 0) {
      for (const id of createdTxnIds) {
        await pool.query('DELETE FROM payment_transactions WHERE id = ?', [id]);
      }
      createdTxnIds = [];
    }
    await pool.query('DELETE FROM payment_transactions WHERE transaction_reference LIKE "TXN_MIG024_%"');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM payment_transactions WHERE transaction_reference LIKE "TXN_MIG024_%"');
    if (pool.getPool) {
      await pool.getPool().end();
    }
  });

  test('1. Schema Verification: payment_transactions.status contains PARTIALLY_REFUNDED and PARTIAL', async () => {
    const cols = await pool.query("SHOW COLUMNS FROM payment_transactions WHERE Field = 'status'");
    expect(cols.length).toBeGreaterThan(0);
    const colType = cols[0].Type;

    expect(colType).toContain("'PARTIALLY_REFUNDED'");
    expect(colType).toContain("'PARTIAL'");
    expect(colType).toContain("'REFUNDED'");
    expect(colType).toContain("'SUCCESS'");
    expect(colType).toContain("'PENDING'");
  });

  test('2. Insert and Retrieve PARTIALLY_REFUNDED: Successfully stored without truncation', async () => {
    const ref = `TXN_MIG024_PREF_${Date.now()}`;
    const insertRes = await pool.query(`
      INSERT INTO payment_transactions (
        reservation_id, transaction_reference, amount, currency, status, payment_method, provider, created_at, updated_at
      ) VALUES (1, ?, 75000.00, 'NGN', 'PARTIALLY_REFUNDED', 'CARD', 'PAYSTACK', NOW(), NOW())
    `, [ref]);

    const txnId = insertRes.insertId;
    createdTxnIds.push(txnId);

    const rows = await pool.query('SELECT id, transaction_reference, status, amount FROM payment_transactions WHERE id = ?', [txnId]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('PARTIALLY_REFUNDED');
    expect(parseFloat(rows[0].amount)).toBe(75000.00);
  });

  test('3. Legacy Status Preservation: PARTIAL, REFUNDED, and SUCCESS remain valid and distinct', async () => {
    const statuses = ['PARTIAL', 'REFUNDED', 'SUCCESS', 'PENDING'];
    for (const st of statuses) {
      const ref = `TXN_MIG024_${st}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const res = await pool.query(`
        INSERT INTO payment_transactions (
          reservation_id, transaction_reference, amount, currency, status, payment_method, provider, created_at, updated_at
        ) VALUES (1, ?, 50000.00, 'NGN', ?, 'CARD', 'PAYSTACK', NOW(), NOW())
      `, [ref, st]);
      createdTxnIds.push(res.insertId);

      const rows = await pool.query('SELECT status FROM payment_transactions WHERE id = ?', [res.insertId]);
      expect(rows[0].status).toBe(st);
    }
  });

  test('4. Strict Mode Guard: Invalid payment status values are rejected', async () => {
    const conn = await pool.getPool().getConnection();
    try {
      await conn.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'");
      let errorThrown = false;
      try {
        await conn.query(`
          INSERT INTO payment_transactions (
            reservation_id, transaction_reference, amount, currency, status, payment_method, provider, created_at, updated_at
          ) VALUES (1, 'TXN_MIG024_INVALID', 1000.00, 'NGN', 'UNRECOGNIZED_STATUS', 'CARD', 'PAYSTACK', NOW(), NOW())
        `);
      } catch (err) {
        errorThrown = true;
        expect(err.message).toMatch(/data truncated/i);
      }
      expect(errorThrown).toBe(true);
    } finally {
      conn.release();
    }
  });

  test('5. Upgrade Simulation on Disposable Database: 001-023 data preserved through migration 024', async () => {
    const disposableDb = 'bfa_disposable_jest_upgrade_test_db';
    assertTestDatabase(disposableDb, 'Jest Upgrade Simulation');

    const adminConn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      multipleStatements: true,
    });

    try {
      await adminConn.query(`DROP DATABASE IF EXISTS \`${disposableDb}\`;`);
      await adminConn.query(`CREATE DATABASE \`${disposableDb}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

      const dispConn = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: disposableDb,
        multipleStatements: true,
      });

      try {
        const migrationsDir = path.resolve(__dirname, '../src/db/migrations');
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        // Run migrations 001 through 023
        const legacyFiles = files.filter(f => f <= '023_payment_provider_unique_and_exception_scoping.sql');
        for (const f of legacyFiles) {
          const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
          await dispConn.query(sql);
        }

        // Insert pre-upgrade test row
        await dispConn.query(`
          INSERT INTO payment_transactions (
            reservation_id, transaction_reference, amount, currency, status, payment_method, provider, created_at, updated_at
          ) VALUES (1, 'UPGRADE_TEST_ROW', 99000.00, 'NGN', 'SUCCESS', 'CARD', 'PAYSTACK', NOW(), NOW())
        `);

        // Execute migration 024
        const m024Sql = fs.readFileSync(path.join(migrationsDir, '024_add_partially_refunded_to_payment_status.sql'), 'utf8');
        await dispConn.query(m024Sql);

        // Verify pre-upgrade row is 100% preserved
        const [rows] = await dispConn.query("SELECT status, amount FROM payment_transactions WHERE transaction_reference = 'UPGRADE_TEST_ROW'");
        expect(rows[0].status).toBe('SUCCESS');
        expect(parseFloat(rows[0].amount)).toBe(99000.00);

        // Verify new PARTIALLY_REFUNDED insert works
        await dispConn.query(`
          INSERT INTO payment_transactions (
            reservation_id, transaction_reference, amount, currency, status, payment_method, provider, created_at, updated_at
          ) VALUES (1, 'UPGRADE_PARTIAL_ROW', 45000.00, 'NGN', 'PARTIALLY_REFUNDED', 'CARD', 'PAYSTACK', NOW(), NOW())
        `);

        const [pRows] = await dispConn.query("SELECT status FROM payment_transactions WHERE transaction_reference = 'UPGRADE_PARTIAL_ROW'");
        expect(pRows[0].status).toBe('PARTIALLY_REFUNDED');
      } finally {
        await dispConn.end();
      }
    } finally {
      await adminConn.query(`DROP DATABASE IF EXISTS \`${disposableDb}\`;`);
      await adminConn.end();
    }
  });
});
