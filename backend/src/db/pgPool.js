/**
 * Reusable PostgreSQL Connection Pool for Aiven PostgreSQL
 * BFA Apartments Management System
 *
 * Enforces mandatory TLS certificate verification with rejectUnauthorized: true.
 * Sanitizes all error messages to guarantee zero credential leakage.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config');
const logger = require('../core/logging/logger');
const { assertTestDatabase, assertLocalTestHost } = require('./databaseGuard');

let pgPool = null;

/**
 * Sanitizes connection strings and error messages to strip passwords.
 * @param {string} message
 * @returns {string}
 */
function sanitizeErrorMessage(message) {
  if (!message || typeof message !== 'string') return '';
  // Redact URI passwords including passwords containing special characters like @
  let clean = message.replace(/(postgres(?:ql)?:\/\/[^:\s]+):.*@([^\/\s]+)/gi, '$1:***@$2');
  // Redact password=value in connection strings
  clean = clean.replace(/password=\S+/gi, 'password=***');
  return clean;
}

/**
 * Builds SSL configuration enforcing mandatory TLS certificate verification.
 * Does NOT allow rejectUnauthorized to be disabled for remote/Aiven endpoints.
 * @param {object} sslConfig
 * @returns {object|boolean}
 */
function buildPgSslConfig(sslConfig = {}) {
  // If explicitly disabled in local non-production environment
  if (process.env.PG_SSL === 'false') {
    return false;
  }

  const ssl = {
    rejectUnauthorized: true,
  };

  let caCert = sslConfig.ca;

  // Read CA certificate from file path if specified
  if (!caCert && sslConfig.caPath) {
    try {
      const candidates = [
        sslConfig.caPath,
        path.resolve(process.cwd(), sslConfig.caPath),
        path.resolve(__dirname, '../../', sslConfig.caPath),
      ];
      const foundPath = candidates.find((p) => fs.existsSync(p)) || sslConfig.caPath;
      caCert = fs.readFileSync(foundPath, 'utf8');
    } catch (err) {
      throw new Error(`Aiven PostgreSQL TLS enabled but CA certificate file could not be read: ${err.message}`);
    }
  }

  // Normalize multi-line PEM strings with escaped newlines (common in Render environment variables)
  if (caCert && typeof caCert === 'string') {
    const normalizedCa = caCert.includes('\\n') ? caCert.replace(/\\n/g, '\n') : caCert;
    ssl.ca = normalizedCa.trim();
  }

  return ssl;
}

/**
 * Builds pool configuration object from application config.
 * @returns {object}
 */
function getPoolConfig() {
  const pgConfig = config.pg || {};
  const isTestProcess = process.env.NODE_ENV === 'test';
  const connectionString = isTestProcess
    ? (process.env.TEST_DATABASE_URL || null)
    : (process.env.DATABASE_URL || process.env.PG_URI || process.env.AIVEN_PG_URI || pgConfig.connectionString || null);

  const ssl = isTestProcess
    ? (['true', '1'].includes((process.env.TEST_PG_SSL || '').trim().toLowerCase())
      ? buildPgSslConfig({ ca: process.env.TEST_PG_CA_CERT, caPath: process.env.TEST_PG_CA_PATH })
      : false)
    : buildPgSslConfig({
      ca: process.env.PG_CA_CERT || process.env.AIVEN_CA_CERT || pgConfig.ssl?.ca,
      caPath: process.env.PG_CA_PATH || process.env.AIVEN_CA_PATH || pgConfig.ssl?.caPath,
    });

  if (isTestProcess) {
    const testPoolSettings = {
      max: parseInt(process.env.TEST_PG_MAX_POOL, 10) || pgConfig.max || 5,
      idleTimeoutMillis: parseInt(process.env.TEST_PG_IDLE_TIMEOUT_MS, 10) || pgConfig.idleTimeoutMillis || 10000,
      connectionTimeoutMillis: parseInt(process.env.TEST_PG_CONNECT_TIMEOUT_MS, 10) || pgConfig.connectionTimeoutMillis || 2000,
    };
    if (connectionString) return { connectionString, ssl, ...testPoolSettings };
    return {
      host: process.env.TEST_PGHOST || pgConfig.host || '127.0.0.1',
      port: parseInt(process.env.TEST_PGPORT, 10) || pgConfig.port || 5432,
      database: process.env.TEST_PGDATABASE || pgConfig.database || 'bfa_apartments_test_db',
      user: process.env.TEST_PGUSER || pgConfig.user || 'postgres',
      password: process.env.TEST_PGPASSWORD || pgConfig.password || '',
      ssl,
      ...testPoolSettings,
    };
  }

  if (connectionString) {
    return {
      connectionString,
      ssl,
      max: parseInt(process.env.PG_MAX_POOL, 10) || pgConfig.max || 4,
      idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS, 10) || pgConfig.idleTimeoutMillis || 5000,
      connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT_MS, 10) || pgConfig.connectionTimeoutMillis || 10000,
    };
  }

  return {
    host: process.env.PGHOST || process.env.AIVEN_PG_HOST || pgConfig.host || 'localhost',
    port: parseInt(process.env.PGPORT || process.env.AIVEN_PG_PORT, 10) || pgConfig.port || 5432,
    database: process.env.PGDATABASE || process.env.AIVEN_PG_DATABASE || pgConfig.database || 'defaultdb',
    user: process.env.PGUSER || process.env.AIVEN_PG_USER || pgConfig.user || 'avnadmin',
    password: process.env.PGPASSWORD || process.env.AIVEN_PG_PASSWORD || pgConfig.password || '',
    ssl,
    max: parseInt(process.env.PG_MAX_POOL, 10) || pgConfig.max || 4,
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS, 10) || pgConfig.idleTimeoutMillis || 5000,
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT_MS, 10) || pgConfig.connectionTimeoutMillis || 10000,
  };
}

/**
 * Test-mode PostgreSQL is restricted to a loopback host and a test-named database.
 * This prevents inherited development/production environment variables from ever
 * directing test writes to Aiven or another shared server.
 */
function assertTestPostgresTarget(poolConfig) {
  let host = poolConfig.host;
  let database = poolConfig.database;
  if (poolConfig.connectionString) {
    let target;
    try {
      target = new URL(poolConfig.connectionString);
    } catch {
      throw new Error('[FAIL-CLOSED DB GUARD]: Test PostgreSQL connection URL is invalid.');
    }
    host = target.hostname;
    database = decodeURIComponent(target.pathname.replace(/^\//, ''));
  }

  assertLocalTestHost(host, 'PostgreSQL Test Pool Initialization');
  assertTestDatabase(database, 'PostgreSQL Test Pool Initialization');
  return true;
}

/**
 * Returns or initializes the singleton PostgreSQL pool.
 * @param {object} customConfig Optional override for testing
 * @returns {Pool}
 */
function getPgPool(customConfig = null) {
  if (!pgPool) {
    const poolConfig = customConfig || getPoolConfig();
    if (config.app.isTest) assertTestPostgresTarget(poolConfig);
    pgPool = new Pool(poolConfig);

    pgPool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client:', {
        error: sanitizeErrorMessage(err.message),
        code: err.code,
      });
    });

    const sanitizedTarget = poolConfig.connectionString
      ? sanitizeErrorMessage(poolConfig.connectionString)
      : `${poolConfig.user}@${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`;

    logger.info(`PostgreSQL connection pool initialized for target: ${sanitizedTarget}`);
  }
  return pgPool;
}

/**
 * Tests PostgreSQL connectivity by executing SELECT 1.
 * Returns latency and database metadata. Throws sanitized error on failure.
 * Automatically retries with exponential backoff on transient connection slot exhaustion (e.g. during rolling deploys).
 * @param {Pool} poolInstance Optional pool override for testing
 * @param {number} maxRetries Maximum retry attempts (default: 8)
 * @param {number} initialDelayMs Initial retry delay in milliseconds (default: 2000)
 * @returns {Promise<object>}
 */
async function testPgConnection(poolInstance = null, maxRetries = 8, initialDelayMs = 2000) {
  const pool = poolInstance || getPgPool();
  let client = null;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    try {
      client = await pool.connect();
      const result = await client.query(
        'SELECT 1 AS result, NOW() AS server_time, current_database() AS database, version() AS version;'
      );
      const latencyMs = Date.now() - startTime;
      const row = result.rows[0];

      return {
        healthy: row && (row.result === 1 || row.result === '1'),
        latencyMs,
        database: row?.database,
        serverTime: row?.server_time,
        version: row?.version,
        provider: 'Aiven PostgreSQL',
      };
    } catch (err) {
      const sanitizedMsg = sanitizeErrorMessage(err.message);
      const isConnectionExhaustion =
        err.code === '53300' ||
        sanitizedMsg.includes('remaining connection slots') ||
        sanitizedMsg.includes('too many clients') ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT';

      if (attempt < maxRetries && isConnectionExhaustion) {
        logger.warn(
          `PostgreSQL connection check attempt ${attempt}/${maxRetries} failed (${err.code || 'transient'}). Retrying in ${delay / 1000}s...`,
          { error: sanitizedMsg, code: err.code }
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 8000);
        continue;
      }

      logger.error('PostgreSQL (Aiven) connection check failed:', {
        error: sanitizedMsg,
        code: err.code,
        host: config.pg?.host,
        port: config.pg?.port,
        database: config.pg?.database,
        user: config.pg?.user,
        attempt,
      });

      const error = new Error(`PostgreSQL (Aiven) connection test failed: ${sanitizedMsg}`);
      error.code = err.code;
      error.sanitized = true;
      throw error;
    } finally {
      if (client) {
        try {
          client.release();
        } catch (_) {}
        client = null;
      }
    }
  }
}

/**
 * Executes a parameterized query using the pool.
 * @param {string} text
 * @param {Array} params
 * @returns {Promise<object>}
 */
async function query(text, params = []) {
  const pool = getPgPool();
  return pool.query(text, params);
}

/**
 * Executes queries inside a PostgreSQL transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 * @param {Function} callback Callback receiving the checked-out client
 * @returns {Promise<any>}
 */
async function withTransaction(callback, poolInstance = null) {
  const pool = poolInstance || getPgPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('PostgreSQL transaction rolled back due to error:', {
      error: sanitizeErrorMessage(error.message),
      code: error.code,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gracefully closes the PostgreSQL connection pool.
 */
async function closePgPool() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
    logger.info('PostgreSQL connection pool closed.');
  }
}

// ─── CLI Entrypoint for Diagnostic Testing ────────────────────────────────────
if (require.main === module) {
  console.log('[AIVEN POSTGRESQL]: Executing diagnostic connectivity check...');
  testPgConnection()
    .then((res) => {
      console.log('[AIVEN POSTGRESQL]: Connection successful!');
      console.log(`  - Database:    ${res.database}`);
      console.log(`  - Latency:     ${res.latencyMs}ms`);
      console.log(`  - Server Time: ${res.serverTime}`);
      console.log(`  - Version:     ${res.version}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[AIVEN POSTGRESQL]: Connection check failed:');
      console.error(`  - Message: ${err.message}`);
      console.error(`  - Code:    ${err.code || 'UNKNOWN'}`);
      process.exit(1);
    })
    .finally(() => {
      closePgPool();
    });
}

module.exports = {
  getPgPool,
  testPgConnection,
  query,
  withTransaction,
  closePgPool,
  buildPgSslConfig,
  sanitizeErrorMessage,
  getPoolConfig,
  assertTestPostgresTarget,
};
