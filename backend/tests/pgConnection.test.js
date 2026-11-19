/**
 * Unit Tests for Aiven PostgreSQL Connection Pool & Security Enforcement
 * Tests connection configuration, TLS enforcement, error sanitization, and transaction lifecycle.
 */

const {
  buildPgSslConfig,
  sanitizeErrorMessage,
  getPoolConfig,
  assertTestPostgresTarget,
  testPgConnection,
  withTransaction,
  closePgPool,
} = require('../src/db/pgPool');

describe('Aiven PostgreSQL Connection Security & Configuration Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    process.env = originalEnv;
    await closePgPool();
  });

  describe('1. Error Message Sanitization (Zero Credential Leakage)', () => {
    test('redacts plain password from standard postgres connection URI', () => {
      const raw = 'error connecting to postgres://avnadmin:SuperSecretPass123!@pg-aiven-demo.aivencloud.com:28192/defaultdb';
      const clean = sanitizeErrorMessage(raw);
      expect(clean).not.toContain('SuperSecretPass123!');
      expect(clean).toContain('postgres://avnadmin:***@pg-aiven-demo.aivencloud.com:28192/defaultdb');
    });

    test('redacts plain password from postgresql URI variant', () => {
      const raw = 'FATAL: password authentication failed for user "avnadmin" at postgresql://avnadmin:MyP@ssw0rd!@host:5432/bfa';
      const clean = sanitizeErrorMessage(raw);
      expect(clean).not.toContain('MyP@ssw0rd!');
      expect(clean).toContain('postgresql://avnadmin:***@host:5432/bfa');
    });

    test('redacts password key-value pairs in connection error text', () => {
      const raw = 'Connection failed: host=pg.aiven.com user=avnadmin password=SuperSecretPassword123 port=28000';
      const clean = sanitizeErrorMessage(raw);
      expect(clean).not.toContain('SuperSecretPassword123');
      expect(clean).toContain('password=***');
    });

    test('handles null, undefined, and non-string inputs gracefully', () => {
      expect(sanitizeErrorMessage(null)).toBe('');
      expect(sanitizeErrorMessage(undefined)).toBe('');
      expect(sanitizeErrorMessage(12345)).toBe('');
    });
  });

  describe('2. Mandatory TLS Enforcement & CA Handling', () => {
    test('enforces rejectUnauthorized: true by default', () => {
      const ssl = buildPgSslConfig({});
      expect(ssl).toEqual({ rejectUnauthorized: true });
    });

    test('normalizes escaped newlines in PEM string certificates', () => {
      const pemWithEscapedNewlines = '-----BEGIN CERTIFICATE-----\\nMIIDXTCCAkWgAwIBAgIU...\\n-----END CERTIFICATE-----';
      const ssl = buildPgSslConfig({ ca: pemWithEscapedNewlines });
      expect(ssl.rejectUnauthorized).toBe(true);
      expect(ssl.ca).toBe('-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIU...\n-----END CERTIFICATE-----');
      expect(ssl.ca).not.toContain('\\n');
    });

    test('throws sanitized error if CA certificate file path does not exist', () => {
      expect(() => {
        buildPgSslConfig({ caPath: 'non/existent/path/ca.pem' });
      }).toThrow(/CA certificate file could not be read/);
    });

    test('allows SSL bypass ONLY if PG_SSL=false is explicitly set for local dev testing', () => {
      process.env.PG_SSL = 'false';
      const ssl = buildPgSslConfig({});
      expect(ssl).toBe(false);
    });
  });

  describe('3. Pool Configuration Builder', () => {
    test('builds configuration from discrete Aiven environment variables', () => {
      process.env.NODE_ENV = 'development';
      process.env.PGHOST = 'aiven-test-host.aivencloud.com';
      process.env.PGPORT = '28001';
      process.env.PGDATABASE = 'bfa_aiven_db';
      process.env.PGUSER = 'avnadmin_test';
      process.env.PGPASSWORD = 'secure_test_password';

      // Reload config to pick up env
      const reloadedConfig = getPoolConfig();
      expect(reloadedConfig.host).toBe('aiven-test-host.aivencloud.com');
      expect(reloadedConfig.port).toBe(28001);
      expect(reloadedConfig.database).toBe('bfa_aiven_db');
      expect(reloadedConfig.user).toBe('avnadmin_test');
      expect(reloadedConfig.ssl.rejectUnauthorized).toBe(true);
    });

    test('test profile ignores inherited Aiven variables and connection URLs', () => {
      process.env.NODE_ENV = 'test';
      process.env.DB_ENGINE = 'postgres';
      process.env.PGHOST = 'pg-live.example.com';
      process.env.PGPORT = '26780';
      process.env.PGDATABASE = 'bfa_apartments_db';
      process.env.DATABASE_URL = 'postgresql://user:secret@pg-live.example.com:26780/bfa_apartments_db';
      delete process.env.TEST_DATABASE_URL;

      const testConfig = getPoolConfig();
      expect(testConfig).toMatchObject({
        host: '127.0.0.1',
        database: 'bfa_apartments_test_db',
        port: 5432,
        ssl: false,
      });
      expect(testConfig.host).not.toContain('live');
    });

    test('test profile rejects non-loopback PostgreSQL targets', () => {
      expect(() => assertTestPostgresTarget({
        host: 'pg-test.example.com',
        database: 'bfa_apartments_test_db',
      })).toThrow(/only to a local loopback host/);
      expect(() => assertTestPostgresTarget({
        host: '127.0.0.1',
        database: 'bfa_apartments_db',
      })).toThrow(/FATALLY REJECTED/);
      expect(assertTestPostgresTarget({
        host: '127.0.0.1',
        database: 'bfa_apartments_test_db',
      })).toBe(true);
    });
  });

  describe('4. Connectivity Check & SELECT 1 Execution (Mocked)', () => {
    test('executes SELECT 1 query and returns healthy report', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              result: 1,
              server_time: '2026-11-12T19:00:00.000Z',
              database: 'defaultdb',
              version: 'PostgreSQL 16.4 (Aiven)',
            },
          ],
        }),
        release: jest.fn(),
      };

      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const health = await testPgConnection(mockPool);
      expect(health.healthy).toBe(true);
      expect(health.database).toBe('defaultdb');
      expect(health.provider).toBe('Aiven PostgreSQL');
      expect(typeof health.latencyMs).toBe('number');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT 1 AS result')
      );
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test('sanitizes error if database connection fails', async () => {
      const mockPool = {
        connect: jest.fn().mockRejectedValue(
          new Error('connect ECONNREFUSED postgres://avnadmin:SecretPass999@pg.aiven.com:28000/db')
        ),
      };

      await expect(testPgConnection(mockPool)).rejects.toThrow(
        /PostgreSQL \(Aiven\) connection test failed/
      );
      await expect(testPgConnection(mockPool)).rejects.toThrow(
        /postgres:\/\/avnadmin:\*\*\*@pg\.aiven\.com:28000\/db/
      );
      await expect(testPgConnection(mockPool)).rejects.not.toThrow(
        /SecretPass999/
      );
    });
  });

  describe('5. Transaction Lifecycle (withTransaction)', () => {
    test('manages BEGIN, callback execution, and COMMIT', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const result = await withTransaction(async (client) => {
        await client.query('INSERT INTO test (name) VALUES ($1)', ['bfa_demo']);
        return 'success_val';
      }, mockPool);

      expect(result).toBe('success_val');
      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'INSERT INTO test (name) VALUES ($1)', ['bfa_demo']);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test('executes ROLLBACK if callback throws error', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      await expect(
        withTransaction(async () => {
          throw new Error('Database write constraint violation');
        }, mockPool)
      ).rejects.toThrow('Database write constraint violation');

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
