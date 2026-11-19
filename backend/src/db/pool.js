/**
 * Dual-Engine Database Connection Pool Facade
 * BFA Apartments Management System — TASK AIVEN-05
 *
 * Exposes a unified query, transaction, and health interface supporting both
 * MySQL (legacy/local/TiDB) and PostgreSQL (Aiven/Render) based on the active
 * environment configuration (DB_ENGINE=postgres | mysql).
 *
 * 100% backward compatible with all existing repository and service imports.
 */

const dbAdapter = require('./dbAdapter');
const mysqlPool = require('./mysqlPool');
const { getPgPool } = require('./pgPool');

/**
 * Get or initialize active connection pool
 */
function getPool() {
  if (dbAdapter.isPostgres()) {
    return getPgPool();
  }
  return mysqlPool.getPool();
}

/**
 * Test connectivity to active database engine
 */
async function testConnection() {
  return dbAdapter.testConnection();
}

/**
 * Execute a query with parameters across active database engine
 */
async function query(sql, params = []) {
  return dbAdapter.query(sql, params);
}

/**
 * Execute a set of queries in a database transaction with automatic commit/rollback
 */
async function withTransaction(callback) {
  return dbAdapter.withTransaction(callback);
}

/**
 * Gracefully close the active connection pool(s)
 */
async function closePool() {
  return dbAdapter.closePool();
}

module.exports = {
  getPool,
  testConnection,
  query,
  withTransaction,
  closePool,
  // Dual-Engine Inspection & Controls
  getEngine: dbAdapter.getEngine,
  isPostgres: dbAdapter.isPostgres,
  isMySql: dbAdapter.isMySql,
  setEngineOverride: dbAdapter.setEngineOverride,
  clearEngineOverride: dbAdapter.clearEngineOverride,
  translateSql: dbAdapter.translateSql,
  // Direct Engine Access
  getMysqlPool: mysqlPool.getPool,
  getPgPool,
};
