/**
 * Unified Database Adapter for MySQL and PostgreSQL
 * BFA Apartments Management System — TASK AIVEN-05
 *
 * Provides a seamless, dual-engine abstraction layer supporting both
 * MySQL (legacy/local/TiDB) and PostgreSQL (Aiven/Render).
 *
 * Guarantees:
 * 1. Safe parameter translation (? -> $1, $2, ...) respecting strings, comments, and JSON operators.
 * 2. Result normalization for both direct queries (pool.query) and transactions (conn.query).
 * 3. Consistent insertId and affectedRows retrieval across both engines.
 * 4. Transaction lifecycle management with automatic rollback on failure.
 * 5. Error code normalization (deadlock, duplicate key, foreign key).
 * 6. Zero credential leakage in logs or error traces.
 */

const config = require('../config');
const logger = require('../core/logging/logger');
const mysqlPool = require('./mysqlPool');
const { getPgPool, testPgConnection, closePgPool, sanitizeErrorMessage } = require('./pgPool');

function getMysqlModule() {
  return mysqlPool;
}

let explicitEngineOverride = null;

/**
 * Returns active database engine: 'postgres' or 'mysql'
 * @returns {'postgres' | 'mysql'}
 */
function getEngine() {
  if (explicitEngineOverride) {
    return explicitEngineOverride;
  }
  if (config.app.isTest) {
    return (process.env.TEST_DB_ENGINE || config.pg?.engine || 'postgres').trim().toLowerCase();
  }
  const envEngine = (process.env.DB_ENGINE || '').trim().toLowerCase();
  if (envEngine === 'postgres' || envEngine === 'postgresql') {
    return 'postgres';
  }
  if (envEngine === 'mysql') {
    return 'mysql';
  }
  // Fall back to config check:
  if (config.pg && config.pg.enabled) {
    return 'postgres';
  }
  return 'mysql';
}

function isPostgres() {
  return getEngine() === 'postgres';
}

function isMySql() {
  return getEngine() === 'mysql';
}

function setEngineOverride(engine) {
  explicitEngineOverride = engine;
}

function clearEngineOverride() {
  explicitEngineOverride = null;
}

/**
 * Known boolean columns in the BFA schema.
 */
const BOOLEAN_COLUMNS = new Set([
  'is_active',
  'is_posting_allowed',
  'is_verified',
  'requires_review',
  'requires_dual_approval',
  'is_enabled',
  'is_deleted',
  'is_edited',
  'is_muted',
  'is_reversed',
  'is_paid',
  'requires_document',
  'blocking_unit',
  'is_primary',
  'is_published',
  'is_representative',
  'browser_enabled',
  'email_enabled',
  'in_app_enabled',
  'is_read',
  'is_archived',
  'allow_gps',
  'allow_kiosk',
  'allow_manager_assisted',
  'allow_mobile',
  'require_gps',
]);

/**
 * Robust SQL translation and placeholder transformation for PostgreSQL.
 * Lexes SQL text character-by-character to avoid replacing ? inside quotes or comments.
 *
 * @param {string} sql
 * @param {'postgres' | 'mysql'} targetEngine
 * @returns {string}
 */
function translateSql(sql, targetEngine = null) {
  const engine = targetEngine || getEngine();
  if (!sql || typeof sql !== 'string' || engine !== 'postgres') {
    return sql;
  }

  let out = '';
  let paramIndex = 1;
  const len = sql.length;
  let i = 0;

  // Parser states: NORMAL, SINGLE_QUOTE, DOUBLE_QUOTE, BACKTICK, LINE_COMMENT, BLOCK_COMMENT, DOLLAR_QUOTE
  let state = 'NORMAL';
  let dollarTag = '';

  while (i < len) {
    const ch = sql[i];
    const nextCh = i + 1 < len ? sql[i + 1] : '';

    if (state === 'NORMAL') {
      if (ch === "'") {
        state = 'SINGLE_QUOTE';
        out += ch;
      } else if (ch === '"') {
        state = 'DOUBLE_QUOTE';
        out += ch;
      } else if (ch === '`') {
        // MySQL backtick identifier: convert to double quote in PostgreSQL
        state = 'BACKTICK';
        out += '"';
      } else if (ch === '-' && nextCh === '-') {
        state = 'LINE_COMMENT';
        out += '--';
        i++;
      } else if (ch === '/' && nextCh === '*') {
        state = 'BLOCK_COMMENT';
        out += '/*';
        i++;
      } else if (ch === '$') {
        // Potential dollar quote in PostgreSQL ($$ or $tag$)
        const match = sql.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
        if (match) {
          dollarTag = match[0];
          state = 'DOLLAR_QUOTE';
          out += dollarTag;
          i += dollarTag.length - 1;
        } else {
          out += ch;
        }
      } else if (ch === '?') {
        // PostgreSQL JSONB operators: ?| or ?& must NOT be treated as parameters
        if (nextCh === '|' || nextCh === '&') {
          out += ch + nextCh;
          i++;
        } else {
          out += `$${paramIndex++}`;
        }
      } else {
        out += ch;
      }
    } else if (state === 'SINGLE_QUOTE') {
      out += ch;
      if (ch === "'") {
        if (nextCh === "'") {
          // Escaped single quote ('')
          out += nextCh;
          i++;
        } else if (i > 0 && sql[i - 1] === '\\') {
          // Escaped by backslash (\')
        } else {
          state = 'NORMAL';
        }
      }
    } else if (state === 'DOUBLE_QUOTE') {
      out += ch;
      if (ch === '"') {
        if (nextCh === '"') {
          out += nextCh;
          i++;
        } else {
          state = 'NORMAL';
        }
      }
    } else if (state === 'BACKTICK') {
      if (ch === '`') {
        out += '"';
        state = 'NORMAL';
      } else {
        out += ch;
      }
    } else if (state === 'LINE_COMMENT') {
      out += ch;
      if (ch === '\n') {
        state = 'NORMAL';
      }
    } else if (state === 'BLOCK_COMMENT') {
      out += ch;
      if (ch === '*' && nextCh === '/') {
        out += '/';
        i++;
        state = 'NORMAL';
      }
    } else if (state === 'DOLLAR_QUOTE') {
      out += ch;
      if (ch === '$' && sql.slice(i - dollarTag.length + 1, i + 1) === dollarTag) {
        state = 'NORMAL';
        dollarTag = '';
      }
    }

    i++;
  }

  // --- Post-Lexing PostgreSQL Syntax Normalizations ---

  // 1. Function normalizations: CURRENT_DATE() -> CURRENT_DATE
  out = out.replace(/\bCURRENT_DATE\s*\(\s*\)/gi, 'CURRENT_DATE');

  // 2. Double-quoted enum/status literals mistakenly used in SQL
  // e.g., SET status = "DIRTY" -> SET status = 'DIRTY'
  out = out.replace(/(\b(?:status|housekeeping_status|maintenance_status)\s*=\s*)"([A-Z_]+)"/g, "$1'$2'");

  // 3. Boolean literal comparisons: is_active = 1 -> is_active = TRUE, is_active = 0 -> is_active = FALSE
  // Matches both bare columns (is_active = 1) and qualified columns (a.is_active = 1)
  out = out.replace(
    /\b((?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+))\s*=\s*1\b/g,
    (match, fullCol, colName) => {
      if (BOOLEAN_COLUMNS.has(colName.toLowerCase())) {
        return `${fullCol} = TRUE`;
      }
      return match;
    }
  );
  out = out.replace(
    /\b((?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+))\s*=\s*0\b/g,
    (match, fullCol, colName) => {
      if (BOOLEAN_COLUMNS.has(colName.toLowerCase())) {
        return `${fullCol} = FALSE`;
      }
      return match;
    }
  );

  // 4. Automatic RETURNING id for INSERT queries in PostgreSQL
  // Applies only to INSERT statements that do not already have RETURNING
  const trimmed = out.trim();
  const insertMatch = trimmed.match(/^INSERT\s+INTO\s+([a-zA-Z0-9_."]+)/i);
  if (insertMatch && !/\bRETURNING\b/i.test(trimmed)) {
    const rawTableName = insertMatch[1].replace(/["`]/g, '').split('.').pop().toLowerCase();
    // Do not append RETURNING id if table has no id column (e.g. notification_preferences)
    if (rawTableName !== 'notification_preferences') {
      const endsWithSemicolon = trimmed.endsWith(';');
      const baseSql = endsWithSemicolon ? trimmed.slice(0, -1).trim() : trimmed;
      out = `${baseSql} RETURNING id;`;
    }
  }

  return out;
}

/**
 * Normalizes error messages and maps engine-specific error codes
 * @param {Error} err
 * @returns {Error}
 */
function normalizeError(err) {
  if (!err) return err;
  const sanitizedMsg = sanitizeErrorMessage(err.message || '');
  err.message = sanitizedMsg;

  // Map PostgreSQL error codes to application-recognized error codes
  if (err.code === '40P01') {
    // deadlock_detected
    err.code = 'ER_LOCK_DEADLOCK';
    err.isDeadlock = true;
  } else if (err.code === '23505') {
    // unique_violation
    err.code = 'ER_DUP_ENTRY';
    err.isDuplicate = true;
  } else if (err.code === '23503') {
    // foreign_key_violation
    err.code = 'ER_NO_REFERENCED_ROW_2';
    err.isForeignKey = true;
  }

  return err;
}

/**
 * Normalizes PostgreSQL query result for DML commands
 * @param {object} res
 * @param {string} sql
 * @returns {object|Array}
 */
function normalizePgResult(res, sql) {
  const cmd = (res.command || '').toUpperCase();
  const isSelect = cmd === 'SELECT' || cmd === 'SHOW' || cmd === 'WITH' || /^\s*(SELECT|SHOW|WITH)\b/i.test(sql);

  if (isSelect) {
    return res.rows || [];
  }

  const insertId = res.rows && res.rows[0] && res.rows[0].id !== undefined
    ? (typeof res.rows[0].id === 'string' && /^\d+$/.test(res.rows[0].id)
        ? parseInt(res.rows[0].id, 10)
        : res.rows[0].id)
    : null;

  return {
    insertId,
    affectedRows: res.rowCount !== undefined ? res.rowCount : (res.rows ? res.rows.length : 0),
    rowCount: res.rowCount,
    rows: res.rows || [],
    command: res.command,
  };
}

/**
 * Execute a query with parameters across active engine
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<any>}
 */
async function query(sql, params = []) {
  const engine = getEngine();

  if (engine === 'postgres') {
    const pgPool = getPgPool();
    const translatedSql = translateSql(sql, 'postgres');
    try {
      const res = await pgPool.query(translatedSql, params);
      return normalizePgResult(res, sql);
    } catch (err) {
      throw normalizeError(err);
    }
  } else {
    const mysql = getMysqlModule();
    try {
      const [results] = await mysql.getPool().query(sql, params);
      return results;
    } catch (err) {
      throw normalizeError(err);
    }
  }
}

/**
 * Execute a callback within an isolated database transaction
 * @param {Function} callback Callback receiving wrapped connection `conn`
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const engine = getEngine();

  if (engine === 'postgres') {
    const pgPool = getPgPool();
    const client = await pgPool.connect();

    try {
      await client.query('BEGIN');

      // Create a normalized connection wrapper matching mysql2 connection interface
      const txConn = {
        /**
         * Executes query inside transaction.
         * Returns [normalizedResult, fields] so both `const [rows] = await conn.query(...)`
         * and `(await conn.query(...))[0]` work seamlessly.
         */
        query: async (sql, params = []) => {
          const translatedSql = translateSql(sql, 'postgres');
          try {
            const res = await client.query(translatedSql, params);
            const normalized = normalizePgResult(res, sql);
            return [normalized, res.fields || []];
          } catch (err) {
            throw normalizeError(err);
          }
        },
        rawClient: client,
        engine: 'postgres',
      };

      const result = await callback(txConn);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        logger.error('Error during PostgreSQL transaction rollback:', { error: rbErr.message });
      }
      logger.error('PostgreSQL transaction rolled back due to error:', {
        error: sanitizeErrorMessage(error.message),
        code: error.code,
      });
      throw normalizeError(error);
    } finally {
      client.release();
    }
  } else {
    // MySQL path: preserve existing mysql2 pool.withTransaction
    const mysql = getMysqlModule();
    return mysql.withTransaction(callback);
  }
}

/**
 * Tests connectivity to the active database engine
 * @returns {Promise<object>}
 */
async function testConnection() {
  const engine = getEngine();

  if (engine === 'postgres') {
    const pgTest = await testPgConnection();
    return {
      healthy: pgTest.healthy,
      engine: 'postgres',
      provider: 'Aiven PostgreSQL',
      latencyMs: pgTest.latencyMs,
      database: pgTest.database,
      serverTime: pgTest.serverTime,
      version: pgTest.version,
    };
  } else {
    const mysql = getMysqlModule();
    const myTest = await mysql.testConnection();
    return {
      healthy: myTest.healthy,
      engine: 'mysql',
      provider: 'MySQL / TiDB',
      latencyMs: myTest.latencyMs,
      database: myTest.database,
      serverTime: myTest.serverTime,
    };
  }
}

/**
 * Closes the connection pool for active engine(s)
 */
async function closePool() {
  if (isPostgres()) {
    await closePgPool();
  } else {
    const mysql = getMysqlModule();
    await mysql.closePool();
  }
}

module.exports = {
  getEngine,
  isPostgres,
  isMySql,
  setEngineOverride,
  clearEngineOverride,
  translateSql,
  normalizeError,
  normalizePgResult,
  query,
  withTransaction,
  testConnection,
  closePool,
  BOOLEAN_COLUMNS,
};
