process.env.NODE_ENV = 'test';

jest.mock('mysql2/promise', () => ({ createConnection: jest.fn() }));

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { runMigrations } = require('../src/db/migrator');

const migrationName = '015_one_night_check_constraint.sql';
const migrationPath = path.resolve(__dirname, '../src/db/migrations', migrationName);
const migrationsDirectory = path.resolve(__dirname, '../src/db/migrations');
const priorMigrations = fs.readdirSync(migrationsDirectory)
  .filter((file) => /^0(0[1-9]|1[0-4])_.*\.sql$/.test(file))
  .sort();

describe('Migration 015 one-night CHECK definition guard', () => {
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  test('checks TiDB CHECK metadata for the reservations table and both historical names', () => {
    expect(sql).toMatch(/FROM information_schema\.TIDB_CHECK_CONSTRAINTS/);
    expect(sql).toMatch(/CONSTRAINT_SCHEMA\s*=\s*DATABASE\(\)/);
    expect(sql).toMatch(/TABLE_NAME\s*=\s*'reservations'/);
    expect(sql).toMatch(/CONSTRAINT_NAME IN \('chk_one_night_stay', 'chk_one_night'\)/);
    expect(sql).not.toMatch(/FROM information_schema\.TABLE_CONSTRAINTS/);
  });

  test('reuses only the intended DATEDIFF = 1 definition', () => {
    expect(sql).toMatch(/LOWER\(REPLACE\(REPLACE\(CHECK_CLAUSE, '`', ''\), ' ', ''\)\)/);
    expect(sql).toContain('(datediff(check_out_date,check_in_date)=1)');
    expect(sql).toContain('datediff(check_out_date,check_in_date)=1');

    const migration003 = fs.readFileSync(
      path.resolve(__dirname, '../src/db/migrations/003_modular_erp_entities.sql'),
      'utf8'
    );
    expect(migration003).toContain(
      'CONSTRAINT chk_one_night_stay CHECK (DATEDIFF(check_out_date, check_in_date) = 1)'
    );
  });

  test('creates when absent, no-ops when correct, and fails closed for a wrong named definition', () => {
    expect(sql).toMatch(/@one_night_check_correct\s*>\s*0,\s*'SELECT 1'/s);
    expect(sql).toMatch(/@one_night_check_exists\s*=\s*0,[\s\S]*?'ALTER TABLE reservations ADD CONSTRAINT chk_one_night_stay CHECK \(DATEDIFF\(check_out_date, check_in_date\) = 1\)'/);
    expect(sql).toMatch(/@one_night_check_exists\s*=\s*0,[\s\S]*?'BFA_MIGRATION_015_CHECK_DEFINITION_MISMATCH'\s*\)\s*\)/);
    expect(sql).toMatch(/PREPARE add_one_night_check_stmt FROM @add_one_night_check;[\s\S]*?EXECUTE add_one_night_check_stmt/);
  });

  test('keeps the one-night rule that migration 022 later replaces with a minimum-one-night rule', () => {
    expect(sql).toContain('DATEDIFF(check_out_date, check_in_date) = 1');
    const migration022 = fs.readFileSync(
      path.resolve(__dirname, '../src/db/migrations/022_support_multinight_stays.sql'),
      'utf8'
    );
    expect(migration022).toContain('DATEDIFF(check_out_date, check_in_date) >= 1');
    expect(migration022).toContain("CONSTRAINT_NAME = 'chk_one_night_stay'");
  });
});

describe('Migration runner ledger behavior for migration 015', () => {
  let connection;
  let applied;
  let checkAlreadyPresent;
  let failFirstLedgerInsert;
  let events;

  beforeEach(() => {
    applied = new Set(priorMigrations);
    checkAlreadyPresent = false;
    failFirstLedgerInsert = true;
    events = [];
    connection = {
      query: jest.fn(),
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined),
    };
    connection.query.mockImplementation(async (statement, parameters) => {
      const query = String(statement).trim();
      if (query.startsWith('SELECT GET_LOCK')) return [[{ lockStatus: 1 }], []];
      if (query.startsWith('SELECT RELEASE_LOCK')) return [[{ releaseStatus: 1 }], []];
      if (query.startsWith('SELECT VERSION()')) return [[{ version: '8.0.11-TiDB-v8.5.3-serverless' }], []];
      if (query.includes('tidb_enable_check_constraint')) {
        return [[{ checkConstraints: 'ON', foreignKeyFeature: 'ON', foreignKeyChecks: 'ON' }], []];
      }
      if (query.startsWith('SELECT migration_name FROM schema_migrations')) {
        return [[...applied].map((migration_name) => ({ migration_name })), []];
      }
      if (query.startsWith('SELECT COALESCE(MAX(batch)')) return [[{ nextBatch: 2 }], []];
      if (query.startsWith('INSERT INTO schema_migrations')) {
        const name = parameters[0];
        events.push(`ledger:${name}`);
        if (name === migrationName && failFirstLedgerInsert) {
          failFirstLedgerInsert = false;
          throw new Error('simulated ledger insert failure after CHECK DDL');
        }
        applied.add(name);
        return [{ affectedRows: 1 }, []];
      }
      if (query.includes(`-- Migration: ${migrationName}`)) {
        events.push(`sql:${migrationName}`);
        // Simulate successful DDL persisting even though the following ledger
        // write fails; a retry sees the correct constraint and takes the no-op branch.
        checkAlreadyPresent = true;
        expect(query).toContain('TIDB_CHECK_CONSTRAINTS');
        expect(query).toContain('DATEDIFF(check_out_date, check_in_date) = 1');
        if (checkAlreadyPresent) return [{ affectedRows: 0 }, []];
      }
      if (query.includes('-- Migration: 016_create_automation_confirmations.sql')) {
        throw new Error('stop after migration 015 retry verification');
      }
      return [{ affectedRows: 0 }, []];
    });
    mysql.createConnection.mockResolvedValue(connection);
  });

  afterEach(() => jest.clearAllMocks());

  test('retries after DDL success and records 015 only after SQL succeeds', async () => {
    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'simulated ledger insert failure after CHECK DDL'
    );
    expect(checkAlreadyPresent).toBe(true);
    expect(applied.has(migrationName)).toBe(false);

    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'stop after migration 015 retry verification'
    );
    expect(applied.has(migrationName)).toBe(true);
    expect(events.indexOf(`sql:${migrationName}`)).toBeLessThan(
      events.indexOf(`ledger:${migrationName}`)
    );
    expect(events.filter((event) => event === `sql:${migrationName}`)).toHaveLength(2);
  });

  test('does not record 015 when its SQL fails for a mismatched existing definition', async () => {
    connection.query.mockImplementation(async (statement, parameters) => {
      const query = String(statement).trim();
      if (query.startsWith('SELECT GET_LOCK')) return [[{ lockStatus: 1 }], []];
      if (query.startsWith('SELECT RELEASE_LOCK')) return [[{ releaseStatus: 1 }], []];
      if (query.startsWith('SELECT VERSION()')) return [[{ version: '8.0.11-TiDB-v8.5.3-serverless' }], []];
      if (query.includes('tidb_enable_check_constraint')) {
        return [[{ checkConstraints: 'ON', foreignKeyFeature: 'ON', foreignKeyChecks: 'ON' }], []];
      }
      if (query.startsWith('SELECT migration_name FROM schema_migrations')) {
        return [[...applied].map((migration_name) => ({ migration_name })), []];
      }
      if (query.startsWith('SELECT COALESCE(MAX(batch)')) return [[{ nextBatch: 2 }], []];
      if (query.includes(`-- Migration: ${migrationName}`)) {
        throw new Error('simulated fail-closed mismatched CHECK definition');
      }
      if (query.startsWith('INSERT INTO schema_migrations')) {
        applied.add(parameters[0]);
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 0 }, []];
    });

    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'simulated fail-closed mismatched CHECK definition'
    );
    expect(applied.has(migrationName)).toBe(false);
  });
});
