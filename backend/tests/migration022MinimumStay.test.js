process.env.NODE_ENV = 'test';

jest.mock('mysql2/promise', () => ({ createConnection: jest.fn() }));

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { runMigrations } = require('../src/db/migrator');

const migrationName = '022_support_multinight_stays.sql';
const migrationPath = path.resolve(__dirname, '../src/db/migrations', migrationName);
const migrationsDirectory = path.resolve(__dirname, '../src/db/migrations');
const priorMigrations = fs.readdirSync(migrationsDirectory)
  .filter((file) => /^0(0[1-9]|1[0-9]|2[01])_.*\.sql$/.test(file))
  .sort();

describe('Migration 022 TiDB CHECK metadata and DDL', () => {
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  test('uses TiDB CHECK metadata scoped to reservations and the active schema', () => {
    expect(sql.match(/FROM information_schema\.TIDB_CHECK_CONSTRAINTS/g)).toHaveLength(8);
    expect(sql.match(/CONSTRAINT_SCHEMA = DATABASE\(\)/g)).toHaveLength(8);
    expect(sql.match(/TABLE_NAME = 'reservations'/g)).toHaveLength(8);
    expect(sql).not.toMatch(/information_schema\.TABLE_CONSTRAINTS/);
  });

  test('drops only correctly defined historical chk_one_night_stay and chk_one_night rules', () => {
    for (const name of ['chk_one_night_stay', 'chk_one_night']) {
      expect(sql).toContain(`CONSTRAINT_NAME = '${name}'`);
      expect(sql).toContain(`ALTER TABLE reservations DROP CONSTRAINT ${name}`);
    }
    expect(sql).toContain('(datediff(check_out_date,check_in_date)=1)');
    expect(sql).toContain('datediff(check_out_date,check_in_date)=1');
    expect(sql).toContain(`'BFA_MIGRATION_022_UNEXPECTED_CHK_ONE_NIGHT_STAY_DEFINITION'`);
    expect(sql).toContain(`'BFA_MIGRATION_022_UNEXPECTED_CHK_ONE_NIGHT_DEFINITION'`);
  });

  test('replaces a one-night-only chk_min_one_night but reuses the intended >= 1 definition', () => {
    expect(sql).toContain("CONSTRAINT_NAME = 'chk_min_one_night'");
    expect(sql).toContain('(datediff(check_out_date,check_in_date)>=1)');
    expect(sql).toContain('datediff(check_out_date,check_in_date)>=1');
    expect(sql).toContain('(datediff(check_out_date,check_in_date)=1)');
    expect(sql).toMatch(/@min_one_night_is_old_rule\s*>\s*0,[\s\S]*?DROP CONSTRAINT chk_min_one_night/);
    expect(sql).toMatch(/@min_one_night_exists\s*=\s*0 OR @min_one_night_is_correct\s*>\s*0,[\s\S]*?'SELECT 1'/);
    expect(sql).toContain('BFA_MIGRATION_022_UNEXPECTED_CHK_MIN_ONE_NIGHT_DEFINITION');
  });

  test('handles absent legacy constraints and an already-correct minimum constraint', () => {
    expect(sql).toMatch(/@check_one_night_stay_exists = 0,[\s\S]*?'SELECT 1'/);
    expect(sql).toMatch(/@check_one_night_exists = 0,[\s\S]*?'SELECT 1'/);
    expect(sql).toMatch(/@min_one_night_exists = 0 OR @min_one_night_is_correct > 0,[\s\S]*?'SELECT 1'/);
    expect(sql).toMatch(/@min_one_night_exists_after_drop = 0,[\s\S]*?ADD CONSTRAINT chk_min_one_night CHECK \(DATEDIFF\(check_out_date, check_in_date\) >= 1\)/);
  });

  test('adds the intended minimum stay only after removing legacy rules and rechecking metadata', () => {
    const replacePrepared = sql.indexOf('PREPARE replace_old_min_named_check_stmt');
    const recheckPosition = sql.indexOf('SET @min_one_night_exists_after_drop');
    const addPrepared = sql.indexOf('PREPARE add_min_one_night_stmt');
    expect(replacePrepared).toBeLessThan(recheckPosition);
    expect(recheckPosition).toBeLessThan(addPrepared);
    expect(sql).toMatch(/SET @min_one_night_exists_after_drop := \([\s\S]*?CONSTRAINT_NAME = 'chk_min_one_night'/);
    expect(sql).toContain('CHECK (DATEDIFF(check_out_date, check_in_date) >= 1)');
    expect(sql).not.toMatch(/DROP CONSTRAINT (?!chk_one_night(?:_stay)?\b|chk_min_one_night\b)/);
  });

  test('does not inspect or drop unrelated CHECK constraints', () => {
    const names = [...sql.matchAll(/CONSTRAINT_NAME = '([^']+)'/g)].map((match) => match[1]);
    expect(new Set(names)).toEqual(new Set(['chk_one_night_stay', 'chk_one_night', 'chk_min_one_night']));
    expect(sql.match(/ALTER TABLE reservations DROP CONSTRAINT/g)).toHaveLength(3);
  });

  test('each prepared operation is ordered as prepare, execute, deallocate for retry-safe DDL', () => {
    const prepared = [...sql.matchAll(/PREPARE (\w+) FROM ([^;]+);\s*EXECUTE \1;\s*DEALLOCATE PREPARE \1;/g)];
    expect(prepared).toHaveLength(4);
    expect(sql.match(/SET @(?:drop_one_night_stay|drop_one_night|replace_old_min_named_check|add_min_one_night) := IF/g)).toHaveLength(4);
  });
});

describe('Migration runner ledger behavior for migration 022', () => {
  let connection;
  let applied;
  let migrationSqlRuns;
  let failFirstLedgerInsert;
  let minConstraintExists;
  let events;

  beforeEach(() => {
    applied = new Set(priorMigrations);
    migrationSqlRuns = 0;
    failFirstLedgerInsert = true;
    minConstraintExists = false;
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
      if (query.startsWith('SELECT COALESCE(MAX(batch)')) return [[{ nextBatch: 3 }], []];
      if (query.startsWith('INSERT INTO schema_migrations')) {
        const name = parameters[0];
        events.push(`ledger:${name}`);
        if (name === migrationName && failFirstLedgerInsert) {
          failFirstLedgerInsert = false;
          throw new Error('simulated ledger insert failure after minimum CHECK DDL');
        }
        applied.add(name);
        return [{ affectedRows: 1 }, []];
      }
      if (query.includes(`-- Migration: ${migrationName}`)) {
        migrationSqlRuns++;
        events.push(`sql:${migrationName}`);
        expect(query).toContain('TIDB_CHECK_CONSTRAINTS');
        expect(query).toContain('DATEDIFF(check_out_date, check_in_date) >= 1');
        // Model TiDB's independent DDL persistence across a ledger failure.
        minConstraintExists = true;
        return [{ affectedRows: 0 }, []];
      }
      if (query.includes('-- Enforce unique provider references')) {
        throw new Error('stop after migration 022 retry verification');
      }
      return [{ affectedRows: 0 }, []];
    });
    mysql.createConnection.mockResolvedValue(connection);
  });

  afterEach(() => jest.clearAllMocks());

  test('retries partial execution, reuses the completed target CHECK, and records ledger only after SQL succeeds', async () => {
    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'simulated ledger insert failure after minimum CHECK DDL'
    );
    expect(minConstraintExists).toBe(true);
    expect(applied.has(migrationName)).toBe(false);

    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'stop after migration 022 retry verification'
    );
    expect(applied.has(migrationName)).toBe(true);
    expect(migrationSqlRuns).toBe(2);
    expect(events.indexOf(`sql:${migrationName}`)).toBeLessThan(
      events.indexOf(`ledger:${migrationName}`)
    );
  });
});
