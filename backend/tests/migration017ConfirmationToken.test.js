process.env.NODE_ENV = 'test';

jest.mock('mysql2/promise', () => ({ createConnection: jest.fn() }));

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { runMigrations } = require('../src/db/migrator');

const migrationName = '017_add_confirmation_token_to_reservations.sql';
const migrationPath = path.resolve(__dirname, '../src/db/migrations', migrationName);
const migrationsDirectory = path.resolve(__dirname, '../src/db/migrations');
const priorMigrations = fs.readdirSync(migrationsDirectory)
  .filter((file) => /^0(0[1-9]|1[0-6])_.*\.sql$/.test(file))
  .sort();

describe('Migration 017 confirmation token column and unique index', () => {
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  test('adds the nullable VARCHAR(64) column after reservation_code without inline uniqueness', () => {
    expect(sql).toMatch(
      /ALTER TABLE reservations ADD COLUMN IF NOT EXISTS confirmation_token VARCHAR\(64\) NULL AFTER reservation_code/
    );
    expect(sql).not.toMatch(/confirmation_token VARCHAR\(64\)[^;]*UNIQUE/);
    expect(sql).toMatch(/DATA_TYPE\) = 'varchar'/i);
    expect(sql).toContain('CHARACTER_MAXIMUM_LENGTH = 64');
    expect(sql).toContain("IS_NULLABLE = 'YES'");
    expect(sql).toContain('token_column.ORDINAL_POSITION = reservation_code_column.ORDINAL_POSITION + 1');
  });

  test('checks column definition and existence independently before column DDL', () => {
    expect(sql).toContain('information_schema.COLUMNS');
    expect(sql).toContain("COLUMN_NAME = 'confirmation_token'");
    expect(sql).toMatch(/@confirmation_token_column_exists = 0,[\s\S]*?ADD COLUMN IF NOT EXISTS confirmation_token/);
    expect(sql).toMatch(/@confirmation_token_column_correct = 1,[\s\S]*?'SELECT 1'/);
    expect(sql).toContain('BFA_MIGRATION_017_UNEXPECTED_CONFIRMATION_TOKEN_COLUMN_DEFINITION');
  });

  test('creates both objects from an empty schema state', () => {
    expect(sql).toMatch(/@confirmation_token_column_exists = 0,[\s\S]*?ADD COLUMN IF NOT EXISTS confirmation_token/);
    expect(sql).toMatch(/@confirmation_token_index_entries > 0,[\s\S]*?@confirmation_token_unique_index_exists > 0,[\s\S]*?ADD UNIQUE INDEX uq_res_confirmation_token/);
  });

  test('checks the named unique index independently and validates its exact single-column definition', () => {
    expect(sql).toContain('information_schema.STATISTICS');
    expect(sql).toContain("INDEX_NAME = 'uq_res_confirmation_token'");
    expect(sql).toContain('NON_UNIQUE = 0');
    expect(sql).toContain('SEQ_IN_INDEX = 1');
    expect(sql).toContain("COLUMN_NAME = 'confirmation_token'");
    expect(sql).toContain('SUB_PART IS NULL');
    expect(sql).toContain('BFA_MIGRATION_017_UNEXPECTED_CONFIRMATION_TOKEN_INDEX_DEFINITION');
    expect(sql).toContain('ALTER TABLE reservations ADD UNIQUE INDEX uq_res_confirmation_token (confirmation_token)');
  });

  test('does not skip unique-index creation when only the column already exists', () => {
    const columnDdl = sql.indexOf('ADD COLUMN IF NOT EXISTS confirmation_token');
    const indexExistenceQuery = sql.indexOf('SET @confirmation_token_index_entries');
    const indexDdl = sql.indexOf('ADD UNIQUE INDEX uq_res_confirmation_token');
    expect(columnDdl).toBeGreaterThanOrEqual(0);
    expect(indexExistenceQuery).toBeGreaterThan(columnDdl);
    expect(indexDdl).toBeGreaterThan(indexExistenceQuery);
    expect(sql).toMatch(/@confirmation_token_index_entries > 0,[\s\S]*?@confirmation_token_unique_index_exists > 0/);
  });

  test('with an existing valid column and no index, reaches the independent index-add branch', () => {
    expect(sql).toMatch(/@confirmation_token_column_correct = 1,[\s\S]*?'SELECT 1'/);
    expect(sql).toMatch(/SET @confirmation_token_index_entries :=[\s\S]*?SET @confirmation_token_unique_index_exists :=/);
    expect(sql).toMatch(/@confirmation_token_index_entries > 0,[\s\S]*?@confirmation_token_unique_index_exists > 0,[\s\S]*?ADD UNIQUE INDEX uq_res_confirmation_token/);
  });

  test('reuses a correct unique index, including an equivalent index under another name', () => {
    expect(sql).toMatch(/@confirmation_token_index_entries = 1[\s\S]*?@confirmation_token_index_correct_entries = 1[\s\S]*?'SELECT 1'/);
    expect(sql).toContain('@confirmation_token_unique_index_exists > 0');
    expect(sql).toMatch(/@confirmation_token_unique_index_exists > 0,[\s\S]*?'SELECT 1'/);
  });
});

describe('Migration 017 retry and migration ledger behavior', () => {
  let applied;
  let columnExists;
  let uniqueIndexExists;
  let events;
  let failFirstLedgerInsert;
  let failFirstIndexDdl;
  let incompatibleIndex;

  function configureRunner() {
    applied = new Set(priorMigrations);
    columnExists = false;
    uniqueIndexExists = false;
    events = [];
    failFirstLedgerInsert = false;
    failFirstIndexDdl = false;
    incompatibleIndex = false;

    mysql.createConnection.mockImplementation(async () => {
      const connection = {
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
            throw new Error('simulated ledger insert failure after column and index DDL');
          }
          applied.add(name);
          return [{ affectedRows: 1 }, []];
        }
        if (query.includes(`-- Migration: ${migrationName}`)) {
          events.push(`sql:${migrationName}`);
          expect(query).toContain('ADD COLUMN IF NOT EXISTS confirmation_token');
          expect(query).toContain('ADD UNIQUE INDEX uq_res_confirmation_token');
          if (incompatibleIndex) {
            throw new Error('simulated incompatible existing confirmation-token index');
          }
          // Model TiDB committing column DDL independently. A simulated index
          // failure leaves the column present but the index absent on retry.
          columnExists = true;
          if (failFirstIndexDdl) {
            failFirstIndexDdl = false;
            throw new Error('simulated unique-index DDL failure after column creation');
          }
          uniqueIndexExists = true;
          return [{ affectedRows: 0 }, []];
        }
        if (query.includes('-- Migration: 018_create_internal_chat_tables.sql')) {
          throw new Error('stop after migration 017 retry verification');
        }
        return [{ affectedRows: 0 }, []];
      });
      return connection;
    });
  }

  beforeEach(configureRunner);
  afterEach(() => jest.clearAllMocks());

  test('retries when column creation succeeded but unique-index creation failed', async () => {
    failFirstIndexDdl = true;

    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'simulated unique-index DDL failure after column creation'
    );
    expect(columnExists).toBe(true);
    expect(uniqueIndexExists).toBe(false);
    expect(applied.has(migrationName)).toBe(false);

    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'stop after migration 017 retry verification'
    );
    expect(applied.has(migrationName)).toBe(true);
    expect(events.filter((event) => event === `sql:${migrationName}`)).toHaveLength(2);
    expect(events.indexOf(`sql:${migrationName}`)).toBeLessThan(events.indexOf(`ledger:${migrationName}`));
  });

  test('retries after SQL succeeds but ledger insertion fails', async () => {
    failFirstLedgerInsert = true;
    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'simulated ledger insert failure after column and index DDL'
    );
    expect(columnExists).toBe(true);
    expect(uniqueIndexExists).toBe(true);
    expect(applied.has(migrationName)).toBe(false);

    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'stop after migration 017 retry verification'
    );
    expect(applied.has(migrationName)).toBe(true);
    expect(events.filter((event) => event === `sql:${migrationName}`)).toHaveLength(2);
    expect(events.indexOf(`sql:${migrationName}`)).toBeLessThan(events.indexOf(`ledger:${migrationName}`));
  });

  test('does not record 017 when an existing index definition is incompatible', async () => {
    incompatibleIndex = true;
    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'simulated incompatible existing confirmation-token index'
    );
    expect(applied.has(migrationName)).toBe(false);
    expect(events).not.toContain(`ledger:${migrationName}`);
  });
});
