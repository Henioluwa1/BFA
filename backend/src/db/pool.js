const mysql = require('mysql2/promise');
const config = require('../config');
const logger = require('../utils/logger');
const { assertTestDatabase } = require('./databaseGuard');

let pool = null;

/**
 * Get or initialize MySQL connection pool
 */
function getPool() {
  if (!pool) {
    // Fail-Closed Guard: In test environment, explicitly prevent connection to shared/production databases
    if (config.app.isTest) {
      assertTestDatabase(config.db.database, 'MySQL Connection Pool Initialization');
    }

    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: config.db.connectionLimit,
      queueLimit: config.db.queueLimit,
      idleTimeout: config.db.idleTimeout,
      connectTimeout: config.db.connectTimeout,
      timezone: config.db.timezone,
      dateStrings: true,
    });

    logger.info(`MySQL connection pool created for database: ${config.db.database}`);
  }
  return pool;
}

/**
 * Test connectivity to MySQL
 */
async function testConnection() {
  const connectionPool = getPool();
  const startTime = Date.now();
  const [rows] = await connectionPool.query('SELECT 1 + 1 AS result, NOW() as serverTime;');
  const latencyMs = Date.now() - startTime;
  return {
    healthy: rows && rows[0] && rows[0].result === 2,
    latencyMs,
    serverTime: rows[0]?.serverTime,
    database: config.db.database,
  };
}

/**
 * Execute a query with parameters
 */
async function query(sql, params = []) {
  const connectionPool = getPool();
  const [results] = await connectionPool.query(sql, params);
  return results;
}

/**
 * Execute a set of queries in a database transaction
 */
async function withTransaction(callback) {
  const connectionPool = getPool();
  const connection = await connectionPool.getConnection();
  await connection.beginTransaction();

  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    logger.error('Transaction rolled back due to error:', { error: error.message });
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Gracefully close the connection pool
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MySQL connection pool closed.');
  }
}

module.exports = {
  getPool,
  testConnection,
  query,
  withTransaction,
  closePool,
};
