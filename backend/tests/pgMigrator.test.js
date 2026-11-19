/**
 * PostgreSQL Schema Migrator Automated Test Suite
 * Tests checkPgMigrationStatus, runPgMigrations, advisory locking, transaction isolation,
 * error handling/rollback, and SQL file integrity across all 31 PostgreSQL migrations.
 */

const fs = require('fs');
const path = require('path');
const {
  checkPgMigrationStatus,
  runPgMigrations,
  PG_MIGRATOR_LOCK_KEY,
} = require('../src/db/pgMigrator');

describe('PostgreSQL Migration Engine (pgMigrator)', () => {
  const migrationsDir = path.resolve(__dirname, '../src/db/pgMigrations');

  // ─── SQL File Integrity Tests ──────────────────────────────────────────────
  describe('Migration File Integrity & PostgreSQL Compatibility', () => {
    test('contains exactly 31 versioned SQL migration files', () => {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      expect(files.length).toBe(31);
      expect(files[0]).toBe('001_create_schema_migrations.sql');
      expect(files[files.length - 1]).toBe('031_maintenance_evidence_and_dispatch_verification.sql');
    });

    test('creates exactly 70 distinct database tables across all migrations', () => {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      const tableSet = new Set();

      files.forEach((file) => {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        const matches = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi);
        for (const m of matches) {
          tableSet.add(m[1].toLowerCase());
        }
      });

      expect(tableSet.size).toBe(70);
      expect(tableSet.has('properties')).toBe(true);
      expect(tableSet.has('apartments')).toBe(true);
      expect(tableSet.has('reservations')).toBe(true);
      expect(tableSet.has('users')).toBe(true);
      expect(tableSet.has('payment_transactions')).toBe(true);
      expect(tableSet.has('chart_of_accounts')).toBe(true);
      expect(tableSet.has('general_ledger_entries')).toBe(true);
      expect(tableSet.has('shifts')).toBe(true);
      expect(tableSet.has('attendance_records')).toBe(true);
      expect(tableSet.has('schema_migrations')).toBe(true);
    });

    test('does not contain any MySQL-specific keywords or syntax artifacts', () => {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      const forbiddenPatterns = [
        { name: 'ENGINE=InnoDB', regex: /\bENGINE\s*=\s*InnoDB\b/i },
        { name: 'AUTO_INCREMENT', regex: /\bAUTO_INCREMENT\b/i },
        { name: 'DATEDIFF function', regex: /\bDATEDIFF\s*\(/i },
        { name: 'Backticks', regex: /`[a-zA-Z0-9_]+`/ },
        { name: 'PREPARE statement', regex: /^\s*PREPARE\s+/im },
        { name: 'DEALLOCATE PREPARE', regex: /^\s*DEALLOCATE\s+PREPARE\s+/im },
        { name: 'INSERT IGNORE', regex: /\bINSERT\s+IGNORE\b/i },
        { name: 'ON DUPLICATE KEY', regex: /\bON\s+DUPLICATE\s+KEY\b/i },
      ];

      files.forEach((file) => {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        forbiddenPatterns.forEach(({ name, regex }) => {
          expect({ file, hasMatch: regex.test(content), pattern: name }).toEqual({
            file,
            hasMatch: false,
            pattern: name,
          });
        });
      });
    });

    test('all SQL files have balanced parentheses', () => {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

      files.forEach((file) => {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        // Count unquoted, non-comment parentheses
        let depth = 0;
        let inSingleQuote = false;
        let inLineComment = false;
        let inBlockComment = false;

        for (let i = 0; i < content.length; i++) {
          const char = content[i];
          const next = content[i + 1];

          if (inLineComment) {
            if (char === '\n') inLineComment = false;
            continue;
          }
          if (inBlockComment) {
            if (char === '*' && next === '/') {
              inBlockComment = false;
              i++;
            }
            continue;
          }
          if (char === '-' && next === '-') {
            inLineComment = true;
            i++;
            continue;
          }
          if (char === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
          }
          if (char === "'") {
            if (inSingleQuote && next === "'") {
              i++; // escaped quote
            } else {
              inSingleQuote = !inSingleQuote;
            }
            continue;
          }
          if (!inSingleQuote) {
            if (char === '(') depth++;
            if (char === ')') depth--;
          }
        }

        expect({ file, depth }).toEqual({ file, depth: 0 });
      });
    });
  });

  // ─── checkPgMigrationStatus Unit Tests ─────────────────────────────────────
  describe('checkPgMigrationStatus', () => {
    test('returns all migrations pending when schema_migrations does not exist', async () => {
      const mockClient = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ table_exists: false }] };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const status = await checkPgMigrationStatus(mockPool);

      expect(status.isUpToDate).toBe(false);
      expect(status.appliedCount).toBe(0);
      expect(status.pendingCount).toBe(31);
      expect(status.totalMigrations).toBe(31);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('returns partial status when some migrations are recorded', async () => {
      const mockClient = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ table_exists: true }] };
          }
          if (sql.includes('SELECT migration_name FROM schema_migrations')) {
            return {
              rows: [
                { migration_name: '001_create_schema_migrations.sql' },
                { migration_name: '002_create_core_system_tables.sql' },
              ],
            };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const status = await checkPgMigrationStatus(mockPool);

      expect(status.isUpToDate).toBe(false);
      expect(status.appliedCount).toBe(2);
      expect(status.pendingCount).toBe(29);
      expect(status.appliedMigrations).toEqual([
        '001_create_schema_migrations.sql',
        '002_create_core_system_tables.sql',
      ]);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('returns isUpToDate true when all 31 migrations are recorded', async () => {
      const allFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      const mockClient = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ table_exists: true }] };
          }
          if (sql.includes('SELECT migration_name FROM schema_migrations')) {
            return {
              rows: allFiles.map((f) => ({ migration_name: f })),
            };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const status = await checkPgMigrationStatus(mockPool);

      expect(status.isUpToDate).toBe(true);
      expect(status.appliedCount).toBe(31);
      expect(status.pendingCount).toBe(0);
      expect(status.pendingMigrations).toEqual([]);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ─── runPgMigrations Unit Tests ───────────────────────────────────────────
  describe('runPgMigrations', () => {
    test('acquires advisory lock, executes pending migrations in transaction, and unlocks', async () => {
      const executedQueries = [];
      const mockClient = {
        query: jest.fn().mockImplementation(async (sql, params) => {
          executedQueries.push({ sql: typeof sql === 'string' ? sql.trim().substring(0, 50) : '', params });

          if (sql.includes('pg_advisory_lock')) {
            return { rows: [] };
          }
          if (sql.includes('SELECT migration_name FROM schema_migrations')) {
            // Suppose 001 is already applied, 002-031 are pending
            return { rows: [{ migration_name: '001_create_schema_migrations.sql' }] };
          }
          if (sql.includes('SELECT COALESCE(MAX(batch), 0) + 1')) {
            return { rows: [{ next_batch: '2' }] };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const result = await runPgMigrations(mockPool);

      expect(result.appliedCount).toBe(30);
      expect(result.batch).toBe(2);
      expect(result.isUpToDate).toBe(true);

      // Verify lock acquired and released
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_lock(hashtext($1));',
        [PG_MIGRATOR_LOCK_KEY]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_unlock(hashtext($1));',
        [PG_MIGRATOR_LOCK_KEY]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('returns immediately when already up to date', async () => {
      const allFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      const mockClient = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql.includes('SELECT migration_name FROM schema_migrations')) {
            return { rows: allFiles.map((f) => ({ migration_name: f })) };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const result = await runPgMigrations(mockPool);

      expect(result.appliedCount).toBe(0);
      expect(result.isUpToDate).toBe(true);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('rolls back transaction, releases advisory lock, and sanitizes error on failure', async () => {
      const mockClient = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql.includes('SELECT migration_name FROM schema_migrations')) {
            return { rows: [] };
          }
          if (sql.includes('SELECT COALESCE(MAX(batch), 0) + 1')) {
            return { rows: [{ next_batch: '1' }] };
          }
          if (sql === 'BEGIN') {
            return { rows: [] };
          }
          if (typeof sql === 'string' && sql.includes('001_create_schema_migrations.sql')) {
            // Simulate a DDL error containing a database password
            throw new Error('relation failed: postgresql://admin:SecretPass123@db.aiven.com:15432/defaultdb syntax error');
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      let caughtErr;
      try {
        await runPgMigrations(mockPool);
      } catch (err) {
        caughtErr = err;
      }

      expect(caughtErr).toBeDefined();
      expect(caughtErr.message).not.toContain('SecretPass123');
      expect(caughtErr.message).toContain('***');

      // Ensure ROLLBACK was invoked
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');

      // Ensure advisory unlock was invoked in finally
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_unlock(hashtext($1));',
        [PG_MIGRATOR_LOCK_KEY]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
