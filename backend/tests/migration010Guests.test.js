process.env.NODE_ENV = 'test';

jest.mock('mysql2/promise', () => ({ createConnection: jest.fn() }));

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { runMigrations } = require('../src/db/migrator');

const migrationName = '010_guests_and_inspections.sql';
const migrationPath = path.resolve(__dirname, '../src/db/migrations', migrationName);

describe('Migration 010 guest schema DDL', () => {
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  test('adds guest_id before its independent index and foreign-key operations', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS guest_id INT NULL AFTER tenant_phone;\s*ALTER TABLE reservations\s+ADD INDEX IF NOT EXISTS idx_res_guest \(guest_id\);\s*--[\s\S]*?SET @guest_fk_exists/
    );
    expect(sql.indexOf('ADD COLUMN IF NOT EXISTS guest_id')).toBeLessThan(
      sql.indexOf('ADD INDEX IF NOT EXISTS idx_res_guest')
    );
    expect(sql.indexOf('ADD INDEX IF NOT EXISTS idx_res_guest')).toBeLessThan(
      sql.indexOf("CONSTRAINT_NAME = 'fk_reservations_guest'")
    );
    expect(sql.indexOf("CONSTRAINT_NAME = 'fk_reservations_guest'")).toBeLessThan(
      sql.indexOf('FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL')
    );
  });

  test('guards foreign-key creation by schema, table, name, and type', () => {
    expect(sql).toMatch(/CONSTRAINT_SCHEMA\s*=\s*DATABASE\(\)/);
    expect(sql).toMatch(/TABLE_NAME\s*=\s*'reservations'/);
    expect(sql).toMatch(/CONSTRAINT_NAME\s*=\s*'fk_reservations_guest'/);
    expect(sql).toMatch(/CONSTRAINT_TYPE\s*=\s*'FOREIGN KEY'/);
    expect(sql).toMatch(/@guest_fk_exists\s*=\s*0[\s\S]*?'ALTER TABLE reservations ADD CONSTRAINT fk_reservations_guest/);
    expect(sql).toMatch(/'SELECT 1'[\s\S]*?PREPARE stmt_reservations_guest_fk[\s\S]*?EXECUTE stmt_reservations_guest_fk[\s\S]*?DEALLOCATE PREPARE stmt_reservations_guest_fk/);
  });

  test('keeps guest and inspection creation, seed inserts, and reservation linking retryable', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS guests\s*\(/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS inspections\s*\(/);
    expect(sql).toMatch(/INSERT IGNORE INTO guests/);
    expect(sql).toMatch(/UPDATE reservations SET guest_id = 1 WHERE id = 1;/);
    expect(sql).toMatch(/UPDATE reservations SET guest_id = 2 WHERE id = 2;/);
  });
});

describe('Migration runner ledger behavior when migration 010 fails', () => {
  let connection;
  let ledgerEntries;

  beforeEach(() => {
    ledgerEntries = [];
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
      if (query.startsWith('SELECT migration_name FROM schema_migrations')) return [[], []];
      if (query.startsWith('SELECT COALESCE(MAX(batch)')) return [[{ nextBatch: 1 }], []];
      if (query.startsWith('INSERT INTO schema_migrations')) {
        ledgerEntries.push(parameters[0]);
        return [{ affectedRows: 1 }, []];
      }
      if (query.includes(`-- Migration: ${migrationName}`)) {
        throw new Error("Key column 'guest_id' doesn't exist in table");
      }
      return [{ affectedRows: 0 }, []];
    });
    mysql.createConnection.mockResolvedValue(connection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('does not record migration 010 after its SQL fails, while earlier migrations remain recorded', async () => {
    await expect(runMigrations('bfa_apartments_migration_test')).rejects.toThrow(
      "Key column 'guest_id' doesn't exist in table"
    );

    expect(ledgerEntries).toHaveLength(9);
    expect(ledgerEntries).toContain('009_properties_units_and_reservations_engine.sql');
    expect(ledgerEntries).not.toContain(migrationName);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.end).toHaveBeenCalledTimes(1);
  });
});
