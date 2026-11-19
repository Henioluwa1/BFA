const path = require('path');
const {
  TARGET_DATABASE,
  TARGET_HOST,
  TARGET_PORT,
  validateConfiguration,
  selectMigrationFiles,
  planMigrations,
  redactConnectionSecrets,
} = require('../scripts/runMigrations011To026TiDBTest');

const migrationsDirectory = path.resolve(__dirname, '../src/db/migrations');

function safeConfig(overrides = {}) {
  return {
    app: { isProduction: false },
    db: {
      database: TARGET_DATABASE,
      host: TARGET_HOST,
      port: TARGET_PORT,
      user: 'test-user',
      password: 'test-password',
      autoMigrate: false,
      tls: { enabled: true, ca: 'test CA certificate', caPath: '' },
      ...overrides,
    },
  };
}

function safeEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'development',
    DB_NAME: TARGET_DATABASE,
    DB_HOST: TARGET_HOST,
    DB_PORT: String(TARGET_PORT),
    DB_TLS: 'true',
    ...overrides,
  };
}

describe('isolated migrations 011-026 runner guards and range', () => {
  test('accepts only the explicitly configured disposable endpoint with verified TLS', () => {
    const options = validateConfiguration(safeEnvironment(), safeConfig().app, safeConfig().db);
    expect(options.ssl.ca).toBe('test CA certificate');
    expect(options.ssl.rejectUnauthorized).toBe(true);
  });

  test.each([
    ['database name', { DB_NAME: 'bfa_apartments_db' }, {}],
    ['host', {}, { host: 'production.example.com' }],
    ['port', { DB_PORT: '3306' }, {}],
    ['TLS disabled', { DB_TLS: 'false' }, { tls: { enabled: false, ca: '', caPath: '' } }],
    ['automatic migration enabled', {}, { autoMigrate: true }],
  ])('rejects unsafe %s configuration', (_label, envOverrides, dbOverrides) => {
    const base = safeConfig();
    const db = { ...base.db, ...dbOverrides };
    expect(() => validateConfiguration(safeEnvironment(envOverrides), base.app, db)).toThrow();
  });

  test('rejects production mode and missing CA before a connection can be created', () => {
    const base = safeConfig();
    expect(() => validateConfiguration(
      safeEnvironment({ NODE_ENV: 'production' }), base.app, base.db
    )).toThrow(/production/);
    expect(() => validateConfiguration(
      safeEnvironment(), base.app, { ...base.db, tls: { enabled: true, ca: '', caPath: '' } }
    )).toThrow(/CA certificate/);
    expect(() => validateConfiguration(
      safeEnvironment(),
      base.app,
      { ...base.db, tls: { enabled: true, ca: '', caPath: path.join(__dirname, '__missing_tidb_test_ca__.pem') } }
    )).toThrow(/DB_TLS_CA_PATH could not be read/);
  });

  test('selects exactly migrations 011-026 in lexical order, excluding 027-031', () => {
    const files = selectMigrationFiles(migrationsDirectory, 11, 26);
    expect(files).toHaveLength(16);
    expect(files.map((file) => Number(file.slice(0, 3)))).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 11)
    );
    expect(files.some((file) => /^02[7-9]_/.test(file) || /^03[01]_/.test(file))).toBe(false);
  });

  test('requires 001-010 and resumes only from a contiguous 011-026 ledger prefix', () => {
    const prior = selectMigrationFiles(migrationsDirectory, 1, 10);
    const target = selectMigrationFiles(migrationsDirectory, 11, 26);
    expect(planMigrations(prior, prior, target)).toEqual(target);
    expect(planMigrations([...prior, target[0], target[1]], prior, target)).toEqual(target.slice(2));
    expect(() => planMigrations(prior.slice(0, -1), prior, target)).toThrow(/001-010 are missing/);
    expect(() => planMigrations([...prior, target[0], target[2]], prior, target)).toThrow(/ledger gap/);
    expect(() => planMigrations([...prior, '027_example.sql'], prior, target)).toThrow(/027-031/);
  });

  test('redacts configured connection credentials from displayed errors', () => {
    const db = safeConfig().db;
    expect(redactConnectionSecrets(
      `Access denied for ${db.user} at ${TARGET_HOST}: ${db.password}`,
      db
    )).toBe('Access denied for [REDACTED] at [REDACTED]: [REDACTED]');
  });
});
