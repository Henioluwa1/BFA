const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');
const logger = require('../utils/logger');
const { assertTestDatabase, assertProductionMigrationAuthorized } = require('./databaseGuard');

/**
 * Migration Engine for BFA Apartments Management System
 * Hardened with MariaDB Advisory Locking (GET_LOCK) and Read-Only Schema Validation.
 */

const LOCK_TIMEOUT_DEFAULT_SECONDS = 10;

/**
 * Acquires a MariaDB advisory lock on a dedicated connection.
 * @param {mysql.Connection} connection
 * @param {string} lockName
 * @param {number} timeoutSeconds
 */
async function acquireAdvisoryLock(connection, lockName, timeoutSeconds = LOCK_TIMEOUT_DEFAULT_SECONDS) {
  logger.info(`Acquiring database migration advisory lock '${lockName}' (timeout: ${timeoutSeconds}s)...`);
  const [rows] = await connection.query('SELECT GET_LOCK(?, ?) AS lockStatus;', [lockName, timeoutSeconds]);
  const lockStatus = rows[0]?.lockStatus;

  if (lockStatus === 1) {
    logger.info(`Advisory lock '${lockName}' acquired successfully.`);
    return true;
  }

  if (lockStatus === 0) {
    throw new Error(
      `[MIGRATION CONCURRENCY CONFLICT]: Lock timeout (${timeoutSeconds}s) exceeded for '${lockName}'. ` +
      `Another migration process is actively executing on this database.`
    );
  }

  throw new Error(`[MIGRATION LOCK ERROR]: GET_LOCK returned unexpected status '${lockStatus}' for '${lockName}'.`);
}

/**
 * Releases a MariaDB advisory lock on the connection.
 * @param {mysql.Connection} connection
 * @param {string} lockName
 */
async function releaseAdvisoryLock(connection, lockName) {
  try {
    const [rows] = await connection.query('SELECT RELEASE_LOCK(?) AS releaseStatus;', [lockName]);
    const releaseStatus = rows[0]?.releaseStatus;
    if (releaseStatus === 1) {
      logger.info(`Advisory lock '${lockName}' cleanly released.`);
    } else {
      logger.warn(`Advisory lock '${lockName}' release returned status ${releaseStatus} (not held or already released).`);
    }
  } catch (err) {
    logger.warn(`Warning during advisory lock release for '${lockName}': ${err.message}`);
  }
}

/**
 * Read-only inspection of schema migration status without executing any migrations.
 * Safe to execute against production at any time.
 * @param {string|object} targetDbOrOptions
 * @returns {Promise<object>}
 */
async function checkMigrationStatus(targetDbOrOptions = null) {
  const targetDatabase =
    (typeof targetDbOrOptions === 'string' ? targetDbOrOptions : targetDbOrOptions?.database) ||
    config.db.database;

  const migrationsDir = path.resolve(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: targetDatabase,
    multipleStatements: false,
  });

  try {
    // 1. Check if schema_migrations table exists
    const [tableRows] = await connection.query(
      "SHOW TABLES LIKE 'schema_migrations';"
    );

    let appliedSet = new Set();
    if (tableRows.length > 0) {
      const [appliedRows] = await connection.query(
        'SELECT migration_name FROM schema_migrations ORDER BY id ASC;'
      );
      appliedSet = new Set(appliedRows.map((r) => r.migration_name));
    }

    const pending = files.filter((file) => !appliedSet.has(file));

    return {
      isUpToDate: pending.length === 0,
      appliedCount: appliedSet.size,
      pendingCount: pending.length,
      pendingMigrations: pending,
      appliedMigrations: Array.from(appliedSet),
      totalMigrations: files.length,
      targetDatabase,
    };
  } finally {
    await connection.end();
  }
}

/**
 * Executes pending database migrations with advisory locking and production guards.
 * @param {string|object} targetDbOrOptions
 * @param {object} maybeOptions
 */
async function runMigrations(targetDbOrOptions = null, maybeOptions = {}) {
  let targetDatabase;
  let options;

  if (typeof targetDbOrOptions === 'string') {
    targetDatabase = targetDbOrOptions;
    options = maybeOptions || {};
  } else if (typeof targetDbOrOptions === 'object' && targetDbOrOptions !== null) {
    targetDatabase = targetDbOrOptions.database || config.db.database;
    options = targetDbOrOptions;
  } else {
    targetDatabase = config.db.database;
    options = maybeOptions || {};
  }

  // 1. Enforce fail-closed guards
  if (config.app.isTest) {
    assertTestDatabase(targetDatabase, 'Migration Engine in Test Mode');
  } else {
    assertProductionMigrationAuthorized(targetDatabase, options);
  }

  const migrationsDir = path.resolve(__dirname, 'migrations');
  logger.info(`Starting migration execution in: ${migrationsDir} (Target DB: ${targetDatabase})`);

  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: targetDatabase,
    multipleStatements: true,
  });

  const lockName = `bfa_migrator_${targetDatabase.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 64);
  const timeoutSeconds = options.lockTimeoutSeconds || LOCK_TIMEOUT_DEFAULT_SECONDS;
  let lockAcquired = false;

  try {
    // 2. Acquire advisory lock
    await acquireAdvisoryLock(connection, lockName, timeoutSeconds);
    lockAcquired = true;

    // 3. Ensure schema_migrations table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        batch INT NOT NULL DEFAULT 1,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_migration_name (migration_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Fetch applied migrations
    const [appliedRows] = await connection.query(
      'SELECT migration_name FROM schema_migrations ORDER BY id ASC;'
    );
    const appliedSet = new Set(appliedRows.map((r) => r.migration_name));

    // 5. Read migration files
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const pending = files.filter((file) => !appliedSet.has(file));

    if (pending.length === 0) {
      logger.info(`Database '${targetDatabase}' is up to date. No pending migrations.`);
      return {
        appliedCount: 0,
        totalMigrations: files.length,
        batch: 0,
        targetDatabase,
        isUpToDate: true,
      };
    }

    logger.info(`Found ${pending.length} pending migration(s) to execute on '${targetDatabase}'.`);

    // 6. Determine current batch number
    const [batchRows] = await connection.query(
      'SELECT COALESCE(MAX(batch), 0) + 1 AS nextBatch FROM schema_migrations;'
    );
    const nextBatch = batchRows[0]?.nextBatch || 1;

    let appliedCount = 0;
    for (const file of pending) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      logger.info(`Applying migration: ${file}...`);
      await connection.beginTransaction();

      try {
        await connection.query(sql);
        await connection.query(
          'INSERT INTO schema_migrations (migration_name, batch) VALUES (?, ?);',
          [file, nextBatch]
        );
        await connection.commit();
        logger.info(`Successfully applied: ${file}`);
        appliedCount++;
      } catch (err) {
        await connection.rollback();
        logger.error(`Migration failed at ${file}: ${err.message}`);
        throw err;
      }
    }

    logger.info(`Successfully executed ${appliedCount} migration(s). Batch #${nextBatch}`);
    return {
      appliedCount,
      totalMigrations: files.length,
      batch: nextBatch,
      targetDatabase,
      isUpToDate: true,
    };
  } finally {
    if (lockAcquired) {
      await releaseAdvisoryLock(connection, lockName);
    }
    await connection.end();
  }
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check') || args.includes('status');
  const isStrictCheck = args.includes('--strict');
  const confirmProd = args.includes('--confirm-prod');

  // Parse db override if specified: --db=my_db
  const dbArg = args.find((a) => a.startsWith('--db='));
  const overrideDb = dbArg ? dbArg.split('=')[1] : null;

  // Parse timeout if specified: --timeout=20
  const timeoutArg = args.find((a) => a.startsWith('--timeout='));
  const lockTimeout = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) : LOCK_TIMEOUT_DEFAULT_SECONDS;

  if (isCheckMode) {
    checkMigrationStatus(overrideDb)
      .then((status) => {
        console.log('\n================================================================================');
        console.log(`BFA DATABASE MIGRATION STATUS [Target: ${status.targetDatabase}]`);
        console.log('================================================================================');
        console.log(`Total migrations defined:  ${status.totalMigrations}`);
        console.log(`Applied migrations:        ${status.appliedCount}`);
        console.log(`Pending migrations:        ${status.pendingCount}`);
        console.log(`Status:                    ${status.isUpToDate ? 'UP TO DATE' : 'PENDING MIGRATIONS DETECTED'}`);
        if (!status.isUpToDate) {
          console.log('\nPending Migration Files:');
          status.pendingMigrations.forEach((m) => console.log(`  - ${m}`));
          console.log('\nTo apply pending migrations, run:');
          console.log('  npm run db:migrate');
          if (config.app.isProduction) {
            console.log('  npm run db:migrate:prod (or pass --confirm-prod)');
          }
        }
        console.log('================================================================================\n');

        if (isStrictCheck && !status.isUpToDate) {
          process.exit(2);
        }
        process.exit(0);
      })
      .catch((err) => {
        console.error('Error checking migration status:', err.message);
        process.exit(1);
      });
  } else {
    runMigrations({
      database: overrideDb,
      confirmProduction: confirmProd,
      lockTimeoutSeconds: lockTimeout,
    })
      .then((result) => {
        console.log('\n[SUCCESS] Migrations completed successfully:', {
          database: result.targetDatabase,
          appliedCount: result.appliedCount,
          totalMigrations: result.totalMigrations,
          batch: result.batch,
        });
        process.exit(0);
      })
      .catch((err) => {
        console.error('\n[FATAL] Database migration failed:');
        console.error(err.message);
        process.exit(1);
      });
  }
}

module.exports = {
  runMigrations,
  checkMigrationStatus,
  acquireAdvisoryLock,
  releaseAdvisoryLock,
};
