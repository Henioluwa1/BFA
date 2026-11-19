'use strict';

const fs = require('fs');
const path = require('path');
const {
  TARGET_DATABASE,
  TARGET_HOST,
  TARGET_PORT,
  TARGET_MIGRATION,
  EXPECTED_COLUMNS,
  EXPECTED_FOREIGN_KEYS,
  validateConfiguration,
  selectMigrationFiles,
  planMigration,
  validateColumnMetadata,
  validateForeignKeyMetadata,
  run,
  runCli,
} = require('../scripts/runMigration027TiDBTest');

const migrationsDirectory = path.resolve(__dirname, '../src/db/migrations');
const actualMigrationSql = fs.readFileSync(
  path.join(migrationsDirectory, TARGET_MIGRATION), 'utf8'
);
const safeEnv = () => ({
  NODE_ENV: 'development',
  DB_NAME: TARGET_DATABASE,
  DB_HOST: TARGET_HOST,
  DB_PORT: String(TARGET_PORT),
  DB_TLS: 'true',
  AUTO_MIGRATE: 'false',
  DB_AUTO_MIGRATE: 'false',
});
const safeDb = (overrides = {}) => ({
  database: TARGET_DATABASE,
  host: TARGET_HOST,
  port: TARGET_PORT,
  user: 'test-user',
  password: 'test-password',
  connectTimeout: 10000,
  autoMigrate: false,
  tls: { enabled: true, ca: 'test CA', caPath: '' },
  ...overrides,
});
const tlsBuilder = jest.fn(() => ({ ssl: { ca: 'test CA', rejectUnauthorized: true } }));
function metadataColumn(overrides = {}) {
  return {
    columnName: '',
    dataType: '',
    columnType: '',
    isNullable: 'YES',
    columnDefault: null,
    columnComment: '',
    extra: '',
    generationExpression: '',
    characterMaximumLength: null,
    characterOctetLength: null,
    numericPrecision: null,
    numericScale: null,
    datetimePrecision: null,
    characterSetName: null,
    collationName: null,
    ordinalPosition: 0,
    ...overrides,
  };
}
const completeColumns = () => {
  const positions = {
    notes: 10,
    payment_proof_path: 11,
    cancellation_reason: 20,
    decline_reason: 21,
    declined_at: 22,
    declined_by_user_id: 23,
    room_change_requested_apartment_id: 24,
    room_change_status: 25,
    room_change_notes: 26,
  };
  return [
    metadataColumn({
      columnName: 'notes', dataType: 'text', columnType: 'text', characterMaximumLength: 65535,
      characterSetName: 'utf8mb4', collationName: 'utf8mb4_unicode_ci', ordinalPosition: positions.notes,
    }),
    metadataColumn({
      columnName: 'cancellation_reason', dataType: 'varchar', columnType: 'varchar(255)',
      characterMaximumLength: 255, characterSetName: 'utf8mb4', collationName: 'utf8mb4_unicode_ci',
      ordinalPosition: positions.cancellation_reason,
    }),
    ...EXPECTED_COLUMNS.map((column) => metadataColumn({
      columnName: column.name,
      dataType: column.dataType,
      columnType: column.dataType === 'int' ? 'int(11)' : column.dataType === 'timestamp'
        ? 'timestamp'
        : column.dataType === 'text' ? 'text' : `varchar(${column.length})`,
      characterMaximumLength: column.character ? column.length : null,
      characterOctetLength: column.character ? column.octetLength : null,
      numericPrecision: column.numericPrecision ?? null,
      numericScale: column.numericScale ?? null,
      datetimePrecision: column.datetimePrecision ?? null,
      characterSetName: column.character ? 'utf8mb4' : null,
      collationName: column.character ? 'utf8mb4_unicode_ci' : null,
      ordinalPosition: positions[column.name],
    })),
  ];
};
const completeForeignKeys = () => EXPECTED_FOREIGN_KEYS.map((foreignKey) => ({
  constraintName: foreignKey.name,
  constraintType: 'FOREIGN KEY',
  childTable: foreignKey.childTable,
  childColumn: foreignKey.childColumn,
  columnCount: 1,
  parentSchemaMatches: 1,
  parentTable: foreignKey.parentTable,
  parentColumn: foreignKey.parentColumn,
  ordinalPosition: 1,
  deleteRule: 'SET NULL',
  updateRule: 'NO ACTION',
}));

function makeConnection({
  ledger = null,
  lockStatus = 1,
  failMigration = false,
  failLedgerInsert = false,
  failLockRelease = false,
  failEnd = false,
  initialColumns = [],
  initialForeignKeys = [],
  state = null,
  failAfterPartial = false,
} = {}) {
  const migrationFiles = selectMigrationFiles(migrationsDirectory);
  const sharedState = state || {
    ledger: ledger || migrationFiles.slice(0, 26),
    columns: initialColumns,
    foreignKeys: initialForeignKeys,
  };
  if (ledger) sharedState.ledger = ledger;
  let partialFailurePending = failAfterPartial;
  let connectionLost = false;
  let transaction = false;
  const calls = [];
  const connection = {
    calls,
    state: sharedState,
    beginTransaction: jest.fn(async () => { transaction = true; calls.push('begin'); }),
    commit: jest.fn(async () => { transaction = false; calls.push('commit'); }),
    rollback: jest.fn(async () => { transaction = false; calls.push('rollback'); }),
    end: jest.fn(async () => {
      calls.push('end');
      if (failEnd) throw new Error('simulated close failure');
    }),
    query: jest.fn(async (sql, params) => {
      if (connectionLost) throw Object.assign(new Error('simulated connection loss'), { code: 'PROTOCOL_CONNECTION_LOST' });
      calls.push({ sql, params });
      if (sql.startsWith('SELECT DATABASE()')) {
        return [[{ databaseName: TARGET_DATABASE, serverVersion: '8.0.11-TiDB-v8.5.3-serverless' }], []];
      }
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ lockStatus }], []];
      if (sql.startsWith('SELECT RELEASE_LOCK')) {
        if (failLockRelease) throw new Error('simulated lock release failure');
        return [[{ releaseStatus: 1 }], []];
      }
      if (sql.startsWith('SHOW TABLES')) return [[{ tableName: 'schema_migrations' }], []];
      if (sql.startsWith('SELECT migration_name')) return [sharedState.ledger.map((migration_name) => ({ migration_name })), []];
      if (sql.startsWith('SELECT COALESCE(MAX(batch)')) return [[{ nextBatch: 4 }], []];
      if (sql.startsWith('SELECT COLUMN_NAME')) return [sharedState.columns, []];
      if (sql.startsWith('SELECT tc.CONSTRAINT_NAME')) return [sharedState.foreignKeys, []];
      if (sql === actualMigrationSql) {
        if (partialFailurePending) {
          partialFailurePending = false;
          sharedState.columns = [
            completeColumns().find((column) => column.columnName === 'notes'),
            completeColumns().find((column) => column.columnName === 'cancellation_reason'),
            ...EXPECTED_COLUMNS.slice(0, 4).map((expected) =>
              completeColumns().find((column) => column.columnName === expected.name)
            ),
          ];
          sharedState.foreignKeys = [completeForeignKeys()[0]];
          connectionLost = true;
          throw Object.assign(new Error('simulated disconnect after partial TiDB DDL'), { code: 'PROTOCOL_CONNECTION_LOST' });
        }
        if (failMigration) {
          const error = new Error(`database secret ${safeDb().password}`);
          error.code = 'ER_TEST_FAILURE';
          throw error;
        }
        sharedState.columns = completeColumns();
        sharedState.foreignKeys = completeForeignKeys();
        return [[], []];
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        if (failLedgerInsert) throw new Error('ledger insert failed');
        sharedState.ledger.push(params[0]);
        calls.push({ recorded: params[0], batch: params[1] });
        return [{ affectedRows: 1 }, []];
      }
      if (transaction && sql.startsWith('ALTER TABLE')) throw new Error('Unexpected inline migration statement.');
      return [[], []];
    }),
  };
  return connection;
}

function makeRunDependencies(options = {}) {
  const connection = options.connection || makeConnection(options);
  const readFileSync = jest.fn((filePath, encoding) => {
    expect(encoding).toBe('utf8');
    expect(path.basename(filePath)).toBe(TARGET_MIGRATION);
    return actualMigrationSql;
  });
  const fileSystem = {
    readdirSync: fs.readdirSync.bind(fs),
    readFileSync,
  };
  const mysqlClient = { createConnection: jest.fn(async () => connection) };
  const output = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return {
    connection,
    fileSystem,
    mysqlClient,
    output,
    readFileSync,
    dependencies: {
      env: options.env || safeEnv(),
      appConfig: options.appConfig || { isProduction: false },
      dbConfig: options.dbConfig || safeDb(),
      fileSystem,
      mysqlClient,
      migrationsDirectory,
      requirementsCheck: jest.fn(async () => {}),
      tlsOptionsBuilder: tlsBuilder,
      output,
    },
  };
}

describe('isolated migration 027 runner safeguards', () => {
  test('accepts the exact disposable endpoint with verified TLS and both migration switches off', () => {
    const options = validateConfiguration(safeEnv(), { isProduction: false }, safeDb(), tlsBuilder);
    expect(options.ssl.rejectUnauthorized).toBe(true);
    expect(options.ssl.ca).toBe('test CA');
  });

  test.each([
    ['wrong DB_NAME', { DB_NAME: 'bfa_apartments_db' }, {}],
    ['wrong configured database', {}, { database: 'bfa_apartments_db' }],
    ['wrong DB_HOST', { DB_HOST: 'other.example' }, {}],
    ['wrong configured host', {}, { host: 'other.example' }],
    ['wrong port', { DB_PORT: '3306' }, {}],
    ['wrong configured port', {}, { port: 3306 }],
    ['TLS disabled', { DB_TLS: 'false' }, { tls: { enabled: false, ca: '', caPath: '' } }],
    ['AUTO_MIGRATE enabled', { AUTO_MIGRATE: 'true' }, {}],
    ['DB_AUTO_MIGRATE enabled', { DB_AUTO_MIGRATE: '1' }, {}],
    ['AUTO_MIGRATE missing', { AUTO_MIGRATE: undefined }, {}],
    ['DB_AUTO_MIGRATE missing', { DB_AUTO_MIGRATE: undefined }, {}],
    ['app config allows auto migration', {}, { autoMigrate: true }],
  ])('rejects %s before connecting', (_label, envOverrides, dbOverrides) => {
    const env = { ...safeEnv(), ...envOverrides };
    const db = safeDb(dbOverrides);
    expect(() => validateConfiguration(env, { isProduction: false }, db, tlsBuilder)).toThrow();
  });

  test('rejects production mode, absent CA and certificate verification bypass', () => {
    expect(() => validateConfiguration(safeEnv(), { isProduction: true }, safeDb(), tlsBuilder)).toThrow(/production/);
    expect(() => validateConfiguration(
      safeEnv(), { isProduction: false }, safeDb({ tls: { enabled: true, ca: '', caPath: '' } }),
      () => ({ ssl: { ca: '', rejectUnauthorized: true } })
    )).toThrow(/CA certificate/);
    expect(() => validateConfiguration(
      safeEnv(), { isProduction: false }, safeDb(), () => ({ ssl: { ca: 'CA', rejectUnauthorized: false } })
    )).toThrow(/Verified TLS/);
    expect(() => validateConfiguration(
      safeEnv(),
      { isProduction: false },
      safeDb({ tls: { enabled: true, ca: '', caPath: path.join(__dirname, '__missing_ca_for_migration027_test__.pem') } })
    )).toThrow(/DB_TLS_CA_PATH could not be read/);
  });

  test('selects files 001-027 in order and does not load 028-031 SQL', () => {
    const files = selectMigrationFiles(migrationsDirectory);
    expect(files).toHaveLength(27);
    expect(files.at(-1)).toBe(TARGET_MIGRATION);
    expect(files.map((file) => Number(file.slice(0, 3)))).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
  });

  test('requires migrations 001-026 as contiguous ledger prefix and recognizes only complete 027 suffix', () => {
    const files = selectMigrationFiles(migrationsDirectory);
    expect(planMigration(files.slice(0, 26), files)).toEqual({ alreadyApplied: false });
    expect(planMigration(files.slice(0, 27), files)).toEqual({ alreadyApplied: true });
    expect(() => planMigration(files.slice(0, 25), files)).toThrow(/001-026/);
    expect(() => planMigration([...files.slice(0, 27), files[26]], files)).toThrow(/ending at 027/);
    expect(() => planMigration([...files.slice(0, 25), files[25], files[27] || '028_next.sql'], files)).toThrow();
    for (const laterMigration of [28, 29, 30, 31]) {
      const name = `${String(laterMigration).padStart(3, '0')}_later.sql`;
      expect(() => planMigration([...files.slice(0, 26), name], files)).toThrow();
    }
  });

  test('rejects TiDB server version mismatches before migration execution', async () => {
    const { dependencies, connection } = makeRunDependencies();
    connection.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT DATABASE()')) return [[{ databaseName: TARGET_DATABASE, serverVersion: '8.0.11-MySQL' }], []];
      return [[], []];
    });
    await expect(run(dependencies)).rejects.toThrow(/TiDB v8\.5\.3/);
    expect(connection.query.mock.calls.some(([sql]) => sql === actualMigrationSql)).toBe(false);
    expect(connection.end).toHaveBeenCalled();
  });

  test('rejects connected database identity mismatch before taking the lock', async () => {
    const { dependencies, connection } = makeRunDependencies();
    connection.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT DATABASE()')) return [[{ databaseName: 'bfa_apartments_db', serverVersion: '8.0.11-TiDB-v8.5.3-serverless' }], []];
      return [[], []];
    });
    await expect(run(dependencies)).rejects.toThrow(/database identity/);
    expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('SELECT GET_LOCK'))).toBe(false);
    expect(connection.query.mock.calls.some(([sql]) => sql === actualMigrationSql)).toBe(false);
    expect(connection.end).toHaveBeenCalled();
  });

  test('refuses unsafe configuration before opening a connection', async () => {
    const setup = makeRunDependencies({ env: { ...safeEnv(), DB_HOST: 'production.example' } });
    await expect(run(setup.dependencies)).rejects.toThrow(/DB_HOST/);
    expect(setup.mysqlClient.createConnection).not.toHaveBeenCalled();
  });

  test('redacts connector details when connection establishment fails', async () => {
    const setup = makeRunDependencies();
    const markers = [
      'FAKE_TIDB_USER_SECRET',
      'FAKE_TIDB_PASSWORD_SECRET',
      'FAKE_TIDB_URI_SECRET',
    ];
    const connectorError = new Error(
      `Connector failure ${markers[0]} ${markers[2]}`,
      { cause: new Error(`Nested connector cause ${markers[1]}`) }
    );
    connectorError.stack = `Error: ${connectorError.message}\n${markers.join(' ')}`;
    setup.mysqlClient.createConnection.mockRejectedValue(connectorError);

    let stdout = '';
    let stderr = '';
    const cliOutput = {
      log: (message) => { stdout += `${message}\n`; },
      warn: (message) => { stderr += `${message}\n`; },
      error: (message) => { stderr += `${message}\n`; },
    };
    const processRef = { exitCode: 0 };
    await runCli({
      runner: () => run(setup.dependencies),
      output: cliOutput,
      processRef,
    });

    expect(processRef.exitCode).toBe(1);
    expect(stderr).toContain(
      'Isolated TiDB migration 027 test failed: Could not establish the verified disposable TiDB connection; details redacted.'
    );
    for (const marker of markers) {
      expect(stdout).not.toContain(marker);
      expect(stderr).not.toContain(marker);
    }
    expect(setup.mysqlClient.createConnection).toHaveBeenCalledTimes(1);
    expect(setup.connection.query).not.toHaveBeenCalled();
    const attemptedSql = setup.connection.query.mock.calls.map(([sql]) => sql);
    expect(attemptedSql).not.toContain(actualMigrationSql);
    expect(attemptedSql.some((sql) => sql.startsWith('SELECT GET_LOCK'))).toBe(false);
    expect(attemptedSql.some((sql) => sql.startsWith('INSERT INTO schema_migrations'))).toBe(false);
  });
});

describe('migration 027 partial-application and execution behavior', () => {
  test('validates existing partial objects and reruns the actual 027 file before recording', async () => {
    const partialColumn = completeColumns().find((column) => column.columnName === EXPECTED_COLUMNS[0].name);
    const partialFk = completeForeignKeys()[0];
    const predecessor = completeColumns().find((column) => column.columnName === 'notes');
    const setup = makeRunDependencies({ initialColumns: [predecessor, partialColumn], initialForeignKeys: [partialFk] });
    await expect(run(setup.dependencies)).resolves.toMatchObject({
      alreadyApplied: false,
      migration: TARGET_MIGRATION,
      batch: 4,
    });
    expect(setup.readFileSync).toHaveBeenCalledTimes(1);
    expect(setup.connection.query.mock.calls.filter(([sql]) => sql === actualMigrationSql)).toHaveLength(1);
    const insertIndex = setup.connection.query.mock.calls.findIndex(([sql]) => sql.startsWith('INSERT INTO schema_migrations'));
    const migrationIndex = setup.connection.query.mock.calls.findIndex(([sql]) => sql === actualMigrationSql);
    expect(insertIndex).toBeGreaterThan(migrationIndex);
    expect(setup.connection.commit).toHaveBeenCalledTimes(1);
    expect(setup.mysqlClient.createConnection.mock.calls[0][0].ssl).toEqual({
      ca: 'test CA',
      rejectUnauthorized: true,
    });
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('SELECT RELEASE_LOCK'))).toBe(true);
    expect(setup.connection.end).toHaveBeenCalledTimes(1);
    const metadataSql = setup.connection.query.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.startsWith('SELECT tc.CONSTRAINT_NAME'));
    expect(metadataSql).toContain('tc.CONSTRAINT_SCHEMA = DATABASE()');
    expect(metadataSql).toContain('tc.TABLE_SCHEMA = DATABASE()');
    expect(metadataSql).toContain('kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA');
    expect(metadataSql).toContain('kcu.TABLE_SCHEMA = DATABASE()');
    expect(metadataSql).toContain('rc.DELETE_RULE AS deleteRule');
    expect(metadataSql).toContain('rc.UPDATE_RULE AS updateRule');
  });

  test('recovers on a second invocation after DDL persists and the first connection is lost', async () => {
    const setup = makeRunDependencies();
    const sharedState = setup.connection.state;
    const firstConnection = makeConnection({ state: sharedState, failAfterPartial: true });
    const secondConnection = makeConnection({ state: sharedState });
    setup.mysqlClient.createConnection
      .mockReset()
      .mockResolvedValueOnce(firstConnection)
      .mockResolvedValueOnce(secondConnection);

    await expect(run(setup.dependencies)).rejects.toThrow(/PROTOCOL_CONNECTION_LOST/);
    expect(sharedState.ledger).not.toContain(TARGET_MIGRATION);
    expect(sharedState.columns.map((column) => column.columnName)).toContain('declined_by_user_id');
    expect(sharedState.foreignKeys.map((foreignKey) => foreignKey.constraintName)).toContain('fk_res_declined_by');
    expect(firstConnection.end).toHaveBeenCalledTimes(1);
    expect(setup.output.warn).toHaveBeenCalledWith(expect.stringMatching(/lock release failed/));

    await expect(run(setup.dependencies)).resolves.toMatchObject({
      alreadyApplied: false,
      migration: TARGET_MIGRATION,
    });
    expect(sharedState.ledger.at(-1)).toBe(TARGET_MIGRATION);
    expect(secondConnection.query.mock.calls.filter(([sql]) => sql === actualMigrationSql)).toHaveLength(1);
    const secondInsertIndex = secondConnection.query.mock.calls.findIndex(([sql]) => sql.startsWith('INSERT INTO schema_migrations'));
    const secondPostCheckIndex = secondConnection.query.mock.calls.map(([sql], index) =>
      sql.startsWith('SELECT tc.CONSTRAINT_NAME') ? index : -1
    ).filter((index) => index >= 0).at(-1);
    expect(secondInsertIndex).toBeGreaterThan(secondPostCheckIndex);
    expect(secondConnection.commit).toHaveBeenCalledTimes(1);
    expect(secondConnection.query.mock.calls.some(([sql]) => sql.startsWith('SELECT RELEASE_LOCK'))).toBe(true);
    expect(secondConnection.end).toHaveBeenCalledTimes(1);
  });

  test('a failed column definition check refuses to treat a partial migration as complete', async () => {
    const wrongColumn = {
      ...completeColumns().find((column) => column.columnName === EXPECTED_COLUMNS[0].name),
      dataType: 'text',
    };
    const setup = makeRunDependencies({ initialColumns: [wrongColumn] });
    await expect(run(setup.dependencies)).rejects.toThrow(/incompatible definition/);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql === actualMigrationSql)).toBe(false);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO schema_migrations'))).toBe(false);
  });

  test('a metadata lookup failure before execution fails closed without ledger success', async () => {
    const setup = makeRunDependencies();
    setup.connection.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT DATABASE()')) return [[{ databaseName: TARGET_DATABASE, serverVersion: '8.0.11-TiDB-v8.5.3-serverless' }], []];
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ lockStatus: 1 }], []];
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ releaseStatus: 1 }], []];
      if (sql.startsWith('SHOW TABLES')) return [[{ tableName: 'schema_migrations' }], []];
      if (sql.startsWith('SELECT migration_name')) return [selectMigrationFiles(migrationsDirectory).slice(0, 26).map((migration_name) => ({ migration_name })), []];
      if (sql.startsWith('SELECT COLUMN_NAME')) throw new Error('metadata unavailable');
      return [[], []];
    });
    await expect(run(setup.dependencies)).rejects.toThrow(/metadata unavailable/);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql === actualMigrationSql)).toBe(false);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO schema_migrations'))).toBe(false);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('SELECT RELEASE_LOCK'))).toBe(true);
    expect(setup.connection.end).toHaveBeenCalledTimes(1);
  });

  test('SQL failure prevents ledger insertion, rolls back, releases lock, and closes connection', async () => {
    const setup = makeRunDependencies({ failMigration: true });
    await expect(run(setup.dependencies)).rejects.toThrow(/Migration 027_.*SQL error ER_TEST_FAILURE/);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO schema_migrations'))).toBe(false);
    expect(setup.connection.rollback).toHaveBeenCalledTimes(1);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('SELECT RELEASE_LOCK'))).toBe(true);
    expect(setup.connection.end).toHaveBeenCalledTimes(1);
    expect(setup.output.log.mock.calls.flat().join(' ')).not.toContain('test-password');
  });

  test('ledger insertion failure leaves DDL eligible for verified retry and does not commit success', async () => {
    const setup = makeRunDependencies({ failLedgerInsert: true });
    await expect(run(setup.dependencies)).rejects.toThrow(/Migration 027_.*ledger insert failed/);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO schema_migrations'))).toBe(true);
    expect(setup.connection.commit).not.toHaveBeenCalled();
    expect(setup.connection.rollback).toHaveBeenCalledTimes(1);
    expect(setup.connection.end).toHaveBeenCalledTimes(1);
  });

  test('lock acquisition failure prevents migration execution and still closes connection', async () => {
    const setup = makeRunDependencies({ lockStatus: 0 });
    await expect(run(setup.dependencies)).rejects.toThrow(/Migration 027/);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql === actualMigrationSql)).toBe(false);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('SELECT RELEASE_LOCK'))).toBe(false);
    expect(setup.connection.end).toHaveBeenCalledTimes(1);
  });

  test('explicit lock release failure still closes connection after success', async () => {
    const setup = makeRunDependencies({ failLockRelease: true });
    await expect(run(setup.dependencies)).resolves.toMatchObject({ migration: TARGET_MIGRATION });
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('SELECT RELEASE_LOCK'))).toBe(true);
    expect(setup.output.warn).toHaveBeenCalledWith(expect.stringMatching(/lock release failed/));
    expect(setup.connection.end).toHaveBeenCalledTimes(1);
  });

  test('connection cleanup failure after a migration failure does not mask the primary error', async () => {
    const setup = makeRunDependencies({ failMigration: true, failEnd: true });
    await expect(run(setup.dependencies)).rejects.toThrow(/SQL error ER_TEST_FAILURE/);
    expect(setup.connection.end).toHaveBeenCalledTimes(1);
    expect(setup.output.warn).toHaveBeenCalledWith(expect.stringMatching(/cleanup reported an error/));
  });

  test('an already recorded 027 is a no-op only after complete objects are verified', async () => {
    const files = selectMigrationFiles(migrationsDirectory);
    const setup = makeRunDependencies({ ledger: files.slice(0, 27), initialColumns: completeColumns(), initialForeignKeys: completeForeignKeys() });
    await expect(run(setup.dependencies)).resolves.toEqual({ alreadyApplied: true });
    expect(setup.connection.query.mock.calls.some(([sql]) => sql === actualMigrationSql)).toBe(false);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO schema_migrations'))).toBe(false);
  });

  test('an already recorded but incomplete 027 fails closed', async () => {
    const files = selectMigrationFiles(migrationsDirectory);
    const setup = makeRunDependencies({ ledger: files.slice(0, 27) });
    await expect(run(setup.dependencies)).rejects.toThrow(/schema is incomplete/);
    expect(setup.connection.query.mock.calls.some(([sql]) => sql === actualMigrationSql)).toBe(false);
  });
});

describe('migration 027 metadata validators', () => {
  test('accepts the exact nullable types, precision, defaults, extras, charset and placement', () => {
    validateColumnMetadata(completeColumns(), { requireComplete: true });
    const normalizedStringPositions = completeColumns().map((column) => ({
      ...column,
      ordinalPosition: String(column.ordinalPosition),
      characterMaximumLength: column.characterMaximumLength == null ? null : String(column.characterMaximumLength),
      characterOctetLength: column.characterOctetLength == null ? null : String(column.characterOctetLength),
      numericPrecision: column.numericPrecision == null ? null : String(column.numericPrecision),
      numericScale: column.numericScale == null ? null : String(column.numericScale),
      datetimePrecision: column.datetimePrecision == null ? null : String(column.datetimePrecision),
    }));
    expect(() => validateColumnMetadata(normalizedStringPositions, { requireComplete: true })).not.toThrow();
  });

  test('rejects incompatible signedness, EXTRA, timestamp behavior, defaults, nullability, precision and length', () => {
    const proofPath = completeColumns().find((column) => column.columnName === 'payment_proof_path');
    const declinedAt = completeColumns().find((column) => column.columnName === 'declined_at');
    const declinedBy = completeColumns().find((column) => column.columnName === 'declined_by_user_id');
    const mutations = [
      [{ ...declinedBy, columnType: 'int(10) unsigned' }, declinedBy],
      [{ ...proofPath, extra: 'auto_increment' }, proofPath],
      [{ ...declinedAt, extra: 'on update CURRENT_TIMESTAMP' }, declinedAt],
      [{ ...proofPath, columnDefault: 'sample' }, proofPath],
      [{ ...proofPath, columnComment: 'unexpected' }, proofPath],
      [{ ...proofPath, isNullable: 'NO' }, proofPath],
      [{ ...declinedAt, datetimePrecision: 6 }, declinedAt],
      [{ ...declinedAt, columnType: 'timestamp(6)' }, declinedAt],
      [{ ...declinedBy, numericPrecision: 12 }, declinedBy],
      [{ ...declinedBy, numericScale: 1 }, declinedBy],
      [{ ...proofPath, characterMaximumLength: 64 }, proofPath],
      [{ ...proofPath, characterOctetLength: 256 }, proofPath],
      [{ ...proofPath, characterSetName: 'latin1' }, proofPath],
      [{ ...declinedBy, generationExpression: 'id + 1' }, declinedBy],
    ];
    for (const [bad, valid] of mutations) {
      const rows = completeColumns().map((row) => row.columnName === valid.columnName ? bad : row);
      expect(() => validateColumnMetadata(rows, { requireComplete: true })).toThrow(/incompatible definition/);
    }
  });

  test('fails closed when column metadata is missing, ambiguous or incorrectly positioned', () => {
    expect(() => validateColumnMetadata([], { requireComplete: true })).toThrow(/missing/);
    const rows = completeColumns();
    const proofPath = rows.find((column) => column.columnName === 'payment_proof_path');
    const incomplete = { ...proofPath };
    delete incomplete.columnType;
    expect(() => validateColumnMetadata(rows.map((column) => column.columnName === proofPath.columnName ? incomplete : column), { requireComplete: true })).toThrow(/metadata is incomplete/);
    expect(() => validateColumnMetadata([...rows, proofPath], { requireComplete: true })).toThrow(/ambiguous/);
    expect(() => validateColumnMetadata(rows.map((column) => column.columnName === proofPath.columnName
      ? { ...column, ordinalPosition: 'not-a-number' }
      : column), { requireComplete: true })).toThrow(/position/);
  });

  test('requires exact single-column foreign-key definition and normalizes ordinal metadata', () => {
    validateForeignKeyMetadata(completeForeignKeys(), { requireComplete: true });
    expect(() => validateForeignKeyMetadata(completeForeignKeys().map((foreignKey) => ({
      ...foreignKey,
      ordinalPosition: '1',
      columnCount: '1',
      parentSchemaMatches: '1',
    })), { requireComplete: true })).not.toThrow();
    expect(() => validateForeignKeyMetadata([], { requireComplete: true })).toThrow(/missing/);
    const expected = completeForeignKeys()[0];
    const mutations = [
      { childTable: 'other_table' },
      { childColumn: 'another_child' },
      { parentTable: 'other_parent' },
      { parentColumn: 'other_id' },
      { parentSchemaMatches: '0' },
      { updateRule: 'CASCADE' },
      { deleteRule: 'CASCADE' },
      { columnCount: '2' },
      { ordinalPosition: '2' },
      { constraintType: 'UNIQUE' },
    ];
    for (const mutation of mutations) {
      expect(() => validateForeignKeyMetadata([{ ...expected, ...mutation }], { requireComplete: false })).toThrow(/incompatible/);
    }
    expect(() => validateForeignKeyMetadata([expected, { ...expected, updateRule: 'CASCADE' }], { requireComplete: false })).toThrow(/ambiguous/);
  });
});
