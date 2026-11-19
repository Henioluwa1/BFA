/**
 * Live Aiven PostgreSQL Adapter Integration Tests
 * TASK AIVEN-05: Backend PostgreSQL Integration
 *
 * Validates dbAdapter against the live Aiven PostgreSQL database (bfa_apartments_db).
 * Strictly preserves existing seed data; all write operations are performed inside
 * isolated transactions that are rolled back (ROLLBACK).
 */

const {
  query,
  withTransaction,
  testConnection,
  isPostgres,
  setEngineOverride,
  clearEngineOverride,
  closePool,
} = require('../src/db/pool');

describe('Database Adapter Live PostgreSQL Integration Tests (TASK AIVEN-05)', () => {
  beforeAll(() => {
    setEngineOverride('postgres');
  });

  afterAll(async () => {
    clearEngineOverride();
    await closePool();
  });

  test('1. testConnection reports healthy Aiven PostgreSQL connection', async () => {
    const status = await testConnection();
    expect(status.healthy).toBe(true);
    expect(status.engine).toBe('postgres');
    expect(status.provider).toBe('Aiven PostgreSQL');
    expect(status.database).toBe('bfa_apartments_db');
    expect(status.latencyMs).toBeGreaterThan(0);
  });

  test('2. Parameterized SELECT query against seeded users table', async () => {
    const rows = await query('SELECT id, name, email, role, status FROM users WHERE email = ? LIMIT 1', [
      'admin@bfa.com',
    ]);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(1);
    expect(rows[0].email).toBe('admin@bfa.com');
    expect(rows[0].role).toBe('ADMIN');
    expect(rows[0].status).toBe('ACTIVE');
  });

  test('3. Multi-table join query across properties and apartments', async () => {
    const rows = await query(`
      SELECT p.code as property_code, p.name as property_name, COUNT(a.id) as unit_count
      FROM properties p
      LEFT JOIN apartments a ON a.property_id = p.id
      GROUP BY p.id, p.code, p.name
      ORDER BY p.id ASC
    `);
    expect(rows.length).toBe(3);
    const codes = rows.map((r) => r.property_code);
    expect(codes).toContain('GHT');
    expect(codes).toContain('ABR');
    expect(codes).toContain('RPS');
  });

  test('4. Boolean column query using standard boolean syntax', async () => {
    const rows = await query(
      'SELECT id, account_code, account_name FROM chart_of_accounts WHERE is_active = TRUE AND is_posting_allowed = TRUE ORDER BY account_code ASC LIMIT 5'
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].account_code).toBeDefined();
  });

  test('5. Boolean column integer translation (is_active = 1 translated to is_active = TRUE)', async () => {
    const rows = await query(
      'SELECT id, account_code, account_name FROM chart_of_accounts WHERE is_active = 1 ORDER BY account_code ASC LIMIT 5'
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].account_code).toBeDefined();
  });

  test('6. withTransaction transactional rollback verification', async () => {
    const testEmail = `rollback_test_${Date.now()}@test.invalid`;

    // Execute transaction that inserts and then intentionally throws to trigger rollback
    let errorThrown = false;
    try {
      await withTransaction(async (conn) => {
        const [insertRes] = await conn.query(
          `INSERT INTO users (name, email, password_hash, role, status)
           VALUES (?, ?, ?, 'STAFF', 'ACTIVE')`,
          ['Rollback Test User', testEmail, '$2a$10$dummyHashNotUsableForLogin1234567890123456789012']
        );
        expect(insertRes.insertId).toBeDefined();

        // Verify row exists inside the transaction
        const [rowsInside] = await conn.query('SELECT id, email FROM users WHERE email = ?', [testEmail]);
        expect(rowsInside.length).toBe(1);

        // Deliberately throw to force transaction rollback
        throw new Error('FORCE_ROLLBACK_FOR_TESTING');
      });
    } catch (err) {
      if (err.message.includes('FORCE_ROLLBACK_FOR_TESTING')) {
        errorThrown = true;
      } else {
        throw err;
      }
    }

    expect(errorThrown).toBe(true);

    // Verify row does NOT exist after rollback outside the transaction
    const rowsAfter = await query('SELECT id FROM users WHERE email = ?', [testEmail]);
    expect(rowsAfter.length).toBe(0);
  });

  test('7. withTransaction result destructuring compatibility ([rows] and [result])', async () => {
    await withTransaction(async (conn) => {
      // 1. SELECT destructuring: const [rows] = await conn.query(...)
      const [userRows] = await conn.query('SELECT id, email FROM users WHERE id = ?', [1]);
      expect(Array.isArray(userRows)).toBe(true);
      expect(userRows.length).toBe(1);
      expect(userRows[0].id).toBe(1);

      // 2. Expression check: (await conn.query(...))[0]
      const rowsAlt = (await conn.query('SELECT id, email FROM users WHERE id = ?', [1]))[0];
      expect(Array.isArray(rowsAlt)).toBe(true);
      expect(rowsAlt.length).toBe(1);
      expect(rowsAlt[0].id).toBe(1);
    });
  });
});
