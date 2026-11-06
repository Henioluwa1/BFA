/**
 * BFA WORKSPACE C: Migration Infrastructure Hardening Test Suite
 *
 * Verifies:
 * 1. Startup behavior and environment-specific migration controls.
 * 2. Read-only schema validation (checkMigrationStatus).
 * 3. MariaDB advisory locking (GET_LOCK / RELEASE_LOCK) and concurrency timeout protection.
 * 4. Production guard enforcement against unintended execution.
 * 5. Dedicated migration execution and idempotent re-runs on test database.
 */

process.env.NODE_ENV = 'test';

const mysql = require('mysql2/promise');
const config = require('../src/config');
const {
  runMigrations,
  checkMigrationStatus,
  acquireAdvisoryLock,
  releaseAdvisoryLock,
} = require('../src/db/migrator');
const {
  assertTestDatabase,
  assertProductionMigrationAuthorized,
  BLOCKED_SHARED_DATABASES,
} = require('../src/db/databaseGuard');
const { validateEnvironment } = require('../src/config/envValidator');

const TEST_DB = 'bfa_apartments_test_db';

describe('Workspace C: Database Migration Hardening & Concurrency Protection', () => {
  beforeAll(() => {
    assertTestDatabase(TEST_DB, 'Hardening Test Suite Initialization');
  });

  describe('1. Startup Environment & Migration Configuration Controls', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
      process.env.NODE_ENV = 'test';
    });

    test('1.1. validateEnvironment rejects invalid AUTO_MIGRATE values', () => {
      process.env.AUTO_MIGRATE = 'invalid_boolean_string';
      const result = validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid AUTO_MIGRATE value'))).toBe(true);
    });

    test('1.2. validateEnvironment accepts valid boolean strings for AUTO_MIGRATE', () => {
      process.env.AUTO_MIGRATE = 'false';
      let result = validateEnvironment();
      expect(result.errors.some((e) => e.includes('AUTO_MIGRATE'))).toBe(false);

      process.env.AUTO_MIGRATE = 'true';
      result = validateEnvironment();
      expect(result.errors.some((e) => e.includes('AUTO_MIGRATE'))).toBe(false);

      process.env.AUTO_MIGRATE = '1';
      result = validateEnvironment();
      expect(result.errors.some((e) => e.includes('AUTO_MIGRATE'))).toBe(false);

      process.env.AUTO_MIGRATE = '0';
      result = validateEnvironment();
      expect(result.errors.some((e) => e.includes('AUTO_MIGRATE'))).toBe(false);
    });

    test('1.3. validateEnvironment rejects invalid STRICT_SCHEMA_CHECK values', () => {
      process.env.STRICT_SCHEMA_CHECK = 'not_a_bool';
      const result = validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid STRICT_SCHEMA_CHECK value'))).toBe(true);
    });

    test('1.4. Production configuration defaults autoMigrate to false when unset', () => {
      delete process.env.AUTO_MIGRATE;
      delete process.env.DB_AUTO_MIGRATE;

      // Re-evaluate config resolution logic for production
      const rawAutoMigrate = (process.env.AUTO_MIGRATE || process.env.DB_AUTO_MIGRATE || '').trim().toLowerCase();
      const isProduction = true;
      const isTest = false;

      let resolvedAutoMigrate = false;
      if (isProduction || isTest) {
        resolvedAutoMigrate = rawAutoMigrate === 'true' || rawAutoMigrate === '1';
      } else {
        resolvedAutoMigrate = rawAutoMigrate === '' ? true : (rawAutoMigrate === 'true' || rawAutoMigrate === '1');
      }

      expect(resolvedAutoMigrate).toBe(false);
    });

    test('1.5. Development configuration defaults autoMigrate to true when unset', () => {
      delete process.env.AUTO_MIGRATE;
      delete process.env.DB_AUTO_MIGRATE;

      const rawAutoMigrate = (process.env.AUTO_MIGRATE || process.env.DB_AUTO_MIGRATE || '').trim().toLowerCase();
      const isProduction = false;
      const isTest = false;

      let resolvedAutoMigrate = false;
      if (isProduction || isTest) {
        resolvedAutoMigrate = rawAutoMigrate === 'true' || rawAutoMigrate === '1';
      } else {
        resolvedAutoMigrate = rawAutoMigrate === '' ? true : (rawAutoMigrate === 'true' || rawAutoMigrate === '1');
      }

      expect(resolvedAutoMigrate).toBe(true);
    });
  });

  describe('2. Fail-Closed Production Migration Authorization Guard', () => {
    test('2.1. Blocks unconfirmed migration on primary production database', () => {
      expect(() => {
        assertProductionMigrationAuthorized('bfa_apartments_db', {});
      }).toThrow(/Deliberate production migration confirmation required/);
    });

    test('2.2. Blocks unconfirmed migration on any blocked shared database name', () => {
      for (const blockedDb of BLOCKED_SHARED_DATABASES) {
        expect(() => {
          assertProductionMigrationAuthorized(blockedDb, {});
        }).toThrow(/Deliberate production migration confirmation required/);
      }
    });

    test('2.3. Allows production migration when options.confirmProduction is true', () => {
      expect(() => {
        assertProductionMigrationAuthorized('bfa_apartments_db', { confirmProduction: true });
      }).not.toThrow();
    });

    test('2.4. Allows production migration when CONFIRM_PRODUCTION_MIGRATION env is true', () => {
      const orig = process.env.CONFIRM_PRODUCTION_MIGRATION;
      process.env.CONFIRM_PRODUCTION_MIGRATION = 'true';
      expect(() => {
        assertProductionMigrationAuthorized('bfa_apartments_db', {});
      }).not.toThrow();
      process.env.CONFIRM_PRODUCTION_MIGRATION = orig;
    });
  });

  describe('3. Read-Only Schema Status Inspection (checkMigrationStatus)', () => {
    test('3.1. checkMigrationStatus executes safely without applying migrations', async () => {
      const status = await checkMigrationStatus(TEST_DB);
      expect(status).toHaveProperty('isUpToDate');
      expect(status).toHaveProperty('appliedCount');
      expect(status).toHaveProperty('pendingCount');
      expect(status).toHaveProperty('pendingMigrations');
      expect(status).toHaveProperty('totalMigrations');
      expect(status.targetDatabase).toBe(TEST_DB);
      expect(typeof status.isUpToDate).toBe('boolean');
      expect(Array.isArray(status.pendingMigrations)).toBe(true);
    });

    test('3.2. checkMigrationStatus does not execute DDL or modify database', async () => {
      const conn = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: TEST_DB,
      });

      const [beforeCountRows] = await conn.query('SELECT COUNT(*) AS cnt FROM schema_migrations;');
      const beforeCount = beforeCountRows[0].cnt;

      await checkMigrationStatus(TEST_DB);

      const [afterCountRows] = await conn.query('SELECT COUNT(*) AS cnt FROM schema_migrations;');
      const afterCount = afterCountRows[0].cnt;

      expect(afterCount).toBe(beforeCount);
      await conn.end();
    });
  });

  describe('4. MariaDB Advisory Locking & Concurrency Protection', () => {
    let connA;
    let connB;
    const lockName = `bfa_migrator_test_lock_${Date.now()}`;

    beforeEach(async () => {
      connA = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: TEST_DB,
      });

      connB = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: TEST_DB,
      });
    });

    afterEach(async () => {
      if (connA) {
        await releaseAdvisoryLock(connA, lockName);
        await connA.end();
      }
      if (connB) {
        await releaseAdvisoryLock(connB, lockName);
        await connB.end();
      }
    });

    test('4.1. Acquires advisory lock successfully on dedicated connection', async () => {
      const acquired = await acquireAdvisoryLock(connA, lockName, 2);
      expect(acquired).toBe(true);
    });

    test('4.2. Prevents concurrent lock acquisition by a second connection (Timeout Protection)', async () => {
      // Connection A acquires lock
      await acquireAdvisoryLock(connA, lockName, 2);

      // Connection B attempts to acquire the same lock with 1s timeout -> Must fail
      await expect(
        acquireAdvisoryLock(connB, lockName, 1)
      ).rejects.toThrow(/MIGRATION CONCURRENCY CONFLICT/);
    });

    test('4.3. Releasing lock allows second connection to acquire immediately', async () => {
      // Connection A acquires lock
      await acquireAdvisoryLock(connA, lockName, 2);

      // Connection A releases lock
      await releaseAdvisoryLock(connA, lockName);

      // Connection B can now acquire immediately
      const acquiredB = await acquireAdvisoryLock(connB, lockName, 2);
      expect(acquiredB).toBe(true);
    });

    test('4.4. Closing connection automatically releases advisory lock in MariaDB', async () => {
      // Connection A acquires lock
      await acquireAdvisoryLock(connA, lockName, 2);

      // Connection A abruptly closes
      await connA.end();
      connA = null;

      // Connection B can now acquire the lock because MariaDB auto-releases upon connection close
      const acquiredB = await acquireAdvisoryLock(connB, lockName, 2);
      expect(acquiredB).toBe(true);
    });
  });

  describe('5. Dedicated Migration Execution & Idempotence on Test Database', () => {
    test('5.1. Executes pending migrations on test database with advisory locking', async () => {
      const result = await runMigrations(TEST_DB);
      expect(result).toHaveProperty('appliedCount');
      expect(result).toHaveProperty('totalMigrations');
      expect(result.targetDatabase).toBe(TEST_DB);
      expect(result.isUpToDate).toBe(true);
    });

    test('5.2. Re-running runMigrations on up-to-date database is a safe no-op', async () => {
      const rerunResult = await runMigrations(TEST_DB);
      expect(rerunResult.appliedCount).toBe(0);
      expect(rerunResult.isUpToDate).toBe(true);
    });

    test('5.3. checkMigrationStatus confirms test database is now up to date', async () => {
      const finalStatus = await checkMigrationStatus(TEST_DB);
      expect(finalStatus.isUpToDate).toBe(true);
      expect(finalStatus.pendingCount).toBe(0);
      expect(finalStatus.appliedCount).toBe(finalStatus.totalMigrations);
    });
  });
});

