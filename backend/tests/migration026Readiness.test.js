const fs = require('fs');
const path = require('path');
process.env.NODE_ENV = 'test';

jest.mock('mysql2/promise', () => ({ createConnection: jest.fn() }));

const mysql = require('mysql2/promise');
const { runMigrations } = require('../src/db/migrator');

const migrationPath = path.resolve(
  __dirname,
  '../src/db/migrations/026_property_governance_and_staff_operations.sql'
);

describe('Migration 026 apartment readiness DDL', () => {
  let sql;
  let readinessSql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
    readinessSql = sql.slice(sql.indexOf('-- 10. Decoupled Housekeeping & Maintenance from Occupancy'));
  });

  test('creates readiness columns separately before the dependent index', () => {
    const housekeeping = readinessSql.indexOf('ADD COLUMN IF NOT EXISTS `housekeeping_status`');
    const maintenance = readinessSql.indexOf('ADD COLUMN IF NOT EXISTS `maintenance_status`');
    const readinessIndex = readinessSql.indexOf('ADD INDEX IF NOT EXISTS `idx_apt_readiness`');

    expect(housekeeping).toBeGreaterThanOrEqual(0);
    expect(maintenance).toBeGreaterThan(housekeeping);
    expect(readinessIndex).toBeGreaterThan(maintenance);
    expect(readinessSql.match(/ALTER TABLE `apartments`/g)).toHaveLength(3);
    expect(readinessSql).not.toMatch(/ADD COLUMN[^;]*,\s*ADD COLUMN/s);
  });

  test('gives each column and index an independent existence guard', () => {
    expect(readinessSql).toMatch(
      /ADD COLUMN IF NOT EXISTS `housekeeping_status` ENUM\('DIRTY', 'CLEANING_IN_PROGRESS', 'CLEANED', 'INSPECTED_READY'\) NOT NULL DEFAULT 'INSPECTED_READY' AFTER `status`;/
    );
    expect(readinessSql).toMatch(
      /ADD COLUMN IF NOT EXISTS `maintenance_status` ENUM\('OPERATIONAL', 'INSPECTION_REQUIRED', 'UNDER_REPAIR', 'OUT_OF_ORDER'\) NOT NULL DEFAULT 'OPERATIONAL' AFTER `housekeeping_status`;/
    );
    expect(readinessSql).toMatch(
      /ADD INDEX IF NOT EXISTS `idx_apt_readiness` \(`property_id`, `housekeeping_status`, `maintenance_status`, `status`\);/
    );
  });

  test('continues to declare missing objects when housekeeping_status already exists', () => {
    const housekeepingStatement = readinessSql.match(
      /ALTER TABLE `apartments`\s+ADD COLUMN IF NOT EXISTS `housekeeping_status`[^;]*;/
    );
    const maintenanceStatement = readinessSql.match(
      /ALTER TABLE `apartments`\s+ADD COLUMN IF NOT EXISTS `maintenance_status`[^;]*;/
    );
    const indexStatement = readinessSql.match(
      /ALTER TABLE `apartments`\s+ADD INDEX IF NOT EXISTS `idx_apt_readiness`[^;]*;/
    );

    expect(housekeepingStatement).not.toBeNull();
    expect(maintenanceStatement).not.toBeNull();
    expect(indexStatement).not.toBeNull();
    expect(readinessSql).not.toMatch(/information_schema\.COLUMNS|@exist_hk_col|@add_readiness_sql/);
  });

  test('preserves the existing apartments table creation and operational definitions', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `operational_cases`/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `payment_receipts`/);
    expect(readinessSql).toContain("DEFAULT 'INSPECTED_READY' AFTER `status`");
    expect(readinessSql).toContain("DEFAULT 'OPERATIONAL' AFTER `housekeeping_status`");
    expect(readinessSql).toContain('(`property_id`, `housekeeping_status`, `maintenance_status`, `status`)');
  });
});

describe('Migration runner ledger behavior when migration 026 fails', () => {
  let connection;
  let insertedMigrations;
  let priorMigrations;

  beforeEach(() => {
    insertedMigrations = [];
    priorMigrations = fs.readdirSync(path.resolve(__dirname, '../src/db/migrations'))
      .filter((file) => /^0(0[1-9]|1[0-9]|2[0-5])_.*\.sql$/.test(file))
      .sort();

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
      if (query.startsWith("SHOW TABLES LIKE 'schema_migrations'")) return [[{ table: 'schema_migrations' }], []];
      if (query.startsWith('SELECT migration_name FROM schema_migrations')) {
        return [priorMigrations.map((migration_name) => ({ migration_name })), []];
      }
      if (query.startsWith('SELECT COALESCE(MAX(batch)')) return [[{ nextBatch: 2 }], []];
      if (query.startsWith('INSERT INTO schema_migrations')) {
        insertedMigrations.push(parameters[0]);
        return [{ affectedRows: 1 }, []];
      }
      if (query.includes('-- Migration: 026_property_governance_and_staff_operations.sql')) {
        throw new Error('simulated migration 026 SQL failure');
      }
      return [{ affectedRows: 0 }, []];
    });
    mysql.createConnection.mockResolvedValue(connection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('does not record migration 026 after its SQL fails and releases the runner resources', async () => {
    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      'simulated migration 026 SQL failure'
    );

    expect(insertedMigrations).not.toContain('026_property_governance_and_staff_operations.sql');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith(
      'SELECT RELEASE_LOCK(?) AS releaseStatus;',
      ['bfa_migrator_bfa_apartments_migration_test']
    );
    expect(connection.end).toHaveBeenCalledTimes(1);
  });
});
