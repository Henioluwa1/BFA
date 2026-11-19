/**
 * Domain 1: Authentication & Users Integration Tests
 * TASK AIVEN-05: Live Aiven PostgreSQL
 */

const { setEngineOverride, clearEngineOverride, withTransaction, query, closePool } = require('../src/db/pool');
const AuthService = require('../src/modules/auth/auth.service');
const UsersService = require('../src/modules/users/users.service');

describe('Domain 1: Authentication & Users on PostgreSQL (TASK AIVEN-05)', () => {
  beforeAll(() => {
    setEngineOverride('postgres');
  });

  afterAll(async () => {
    clearEngineOverride();
    await closePool();
  });

  test('1. Super Admin login resolves correct role, status, and permissions', async () => {
    const result = await AuthService.login({
      email: 'superadmin@bfa.com',
      password: 'Bfa2026!Secure',
      ipAddress: '127.0.0.1',
      userAgent: 'Jest-Test',
      requestId: 'req-test-1',
    });

    expect(result).toHaveProperty('token');
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe('superadmin@bfa.com');
    expect(result.user.role).toBe('SUPER_ADMIN');
    expect(result.user.permissions).toContain('system:read');
    expect(result.user.permissions).toContain('users:write');
  });

  test('2. Admin login resolves correct role and properties permissions', async () => {
    const result = await AuthService.login({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
      ipAddress: '127.0.0.1',
      userAgent: 'Jest-Test',
      requestId: 'req-test-2',
    });

    expect(result).toHaveProperty('token');
    expect(result.user.role).toBe('ADMIN');
    expect(result.user.permissions).toContain('properties:read');
    expect(result.user.permissions).toContain('reservations:write');
  });

  test('3. Receptionist login resolves front-desk permissions', async () => {
    const result = await AuthService.login({
      email: 'receptionist@bfa.com',
      password: 'Bfa2026!Secure',
      ipAddress: '127.0.0.1',
      userAgent: 'Jest-Test',
      requestId: 'req-test-3',
    });

    expect(result).toHaveProperty('token');
    expect(result.user.role).toBe('RECEPTIONIST');
    expect(result.user.permissions).toContain('check_in_out:write');
  });

  test('4. Token verification decodes correct user payload', async () => {
    const loginRes = await AuthService.login({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });

    const decoded = AuthService.verifyToken(loginRes.token);
    expect(decoded.email).toBe('admin@bfa.com');
    expect(decoded.role).toBe('ADMIN');
  });

  test('5. UsersService.listUsers returns seeded users with property joins', async () => {
    const users = await UsersService.listUsers();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThanOrEqual(7);

    const roles = users.map((u) => u.role);
    expect(roles).toContain('SUPER_ADMIN');
    expect(roles).toContain('ADMIN');
    expect(roles).toContain('RECEPTIONIST');
  });

  test('6. UsersService.getUserById retrieves user with permissions', async () => {
    const user = await UsersService.getUserById(1);
    expect(user).toBeDefined();
    expect(user.id).toBe(1);
    expect(user.email).toBe('superadmin@bfa.com');
    expect(user.permissions).toBeDefined();
  });

  test('7. Isolated Transactional User Creation & Update with Rollback', async () => {
    const testEmail = `user_txn_test_${Date.now()}@bfa-test.invalid`;

    let createdId = null;
    try {
      await withTransaction(async (conn) => {
        // Direct insert in transaction
        const [insertRes] = await conn.query(
          `INSERT INTO users (name, email, password_hash, role, status)
           VALUES (?, ?, ?, 'STAFF', 'ACTIVE')`,
          ['Domain 1 Test Staff', testEmail, '$2a$10$dummyHash1234567890123456789012']
        );

        createdId = insertRes.insertId;
        expect(createdId).toBeDefined();
        expect(createdId).toBeGreaterThan(0);

        // Update in transaction
        await conn.query('UPDATE users SET name = ? WHERE id = ?', ['Updated Staff Name', createdId]);

        const [fetched] = await conn.query('SELECT * FROM users WHERE id = ?', [createdId]);
        expect(fetched[0].name).toBe('Updated Staff Name');

        // Roll back
        throw new Error('ROLLBACK_USER_TXN');
      });
    } catch (err) {
      if (!err.message.includes('ROLLBACK_USER_TXN')) throw err;
    }

    // Verify row not committed
    const check = await query('SELECT * FROM users WHERE email = ?', [testEmail]);
    expect(check.length).toBe(0);
  });
});
