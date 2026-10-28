/**
 * Dedicated Audit Trail Service
 * Provides immutable audit logging, date/time range filtering, and deterministic server-side pagination.
 */
const pool = require('../../db/pool');
const logger = require('../logging/logger');

/**
 * Normalizes start and end datetime boundaries to UTC database-compatible format.
 */
function normalizeDateTimeRange({ fromDate, toDate, fromTime, toTime, from, to }) {
  let start = null;
  let end = null;

  // Handle start boundary
  if (fromDate) {
    const time = fromTime ? (fromTime.length === 5 ? `${fromTime}:00` : fromTime) : '00:00:00';
    start = `${fromDate} ${time}`;
  } else if (from) {
    if (typeof from === 'string' && from.includes('T')) {
      start = new Date(from).toISOString().slice(0, 19).replace('T', ' ');
    } else if (typeof from === 'string' && from.length === 10) {
      start = `${from} 00:00:00`;
    } else if (typeof from === 'string' && from.length === 16) {
      start = `${from}:00`;
    } else {
      start = from;
    }
  } else if (fromTime) {
    const today = new Date().toISOString().slice(0, 10);
    const time = fromTime.length === 5 ? `${fromTime}:00` : fromTime;
    start = `${today} ${time}`;
  }

  // Handle end boundary
  if (toDate) {
    const time = toTime ? (toTime.length === 5 ? `${toTime}:59` : toTime) : '23:59:59';
    end = `${toDate} ${time}`;
  } else if (to) {
    if (typeof to === 'string' && to.includes('T')) {
      end = new Date(to).toISOString().slice(0, 19).replace('T', ' ');
    } else if (typeof to === 'string' && to.length === 10) {
      end = `${to} 23:59:59`;
    } else if (typeof to === 'string' && to.length === 16) {
      end = `${to}:59`;
    } else {
      end = to;
    }
  } else if (toTime) {
    const today = new Date().toISOString().slice(0, 10);
    const time = toTime.length === 5 ? `${toTime}:59` : toTime;
    end = `${today} ${time}`;
  }

  return { start, end };
}

/**
 * Resolves action filter clause. When Action is 'All Actions', empty string, or undefined,
 * it returns null so all authorized records are retrieved.
 */
function buildActionClause(action) {
  if (!action) return null;
  const clean = String(action).trim().toUpperCase();
  if (!clean || clean === 'ALL' || clean === 'ALL ACTIONS' || clean === '*') {
    return null; // All Actions: Return every record without action restriction
  }

  const categoryMap = {
    LOGIN: "(action = 'USER_LOGIN' OR action = 'LOGIN' OR action LIKE '%LOGIN')",
    USER_LOGIN: "(action = 'USER_LOGIN' OR action = 'LOGIN')",
    LOGOUT: "(action = 'USER_LOGOUT' OR action = 'LOGOUT' OR action LIKE '%LOGOUT')",
    USER_LOGOUT: "(action = 'USER_LOGOUT' OR action = 'LOGOUT')",
    FAILED_LOGIN: "(action = 'USER_LOGIN_FAILED' OR action LIKE '%LOGIN_FAILED%')",
    'FAILED LOGIN': "(action = 'USER_LOGIN_FAILED' OR action LIKE '%LOGIN_FAILED%')",
    USER_LOGIN_FAILED: "(action = 'USER_LOGIN_FAILED' OR action LIKE '%LOGIN_FAILED%')",
    CREATE: "(action LIKE '%CREATE%' OR action LIKE '%CREATED%')",
    UPDATE: "(action LIKE '%UPDATE%' OR action LIKE '%UPDATED%')",
    DELETE: "(action LIKE '%DELETE%' OR action LIKE '%DELETED%')",
    VIEW: "(action LIKE '%VIEW%' OR action LIKE '%READ%')",
    RESERVATION_ACTIONS: "(action LIKE 'RESERVATION%' OR action LIKE '%RESERVATION%')",
    'RESERVATION ACTIONS': "(action LIKE 'RESERVATION%' OR action LIKE '%RESERVATION%')",
    PAYMENT_ACTIONS: "action LIKE 'PAYMENT%'",
    'PAYMENT ACTIONS': "action LIKE 'PAYMENT%'",
    EXPENSE_ACTIONS: "action LIKE 'EXPENSE%'",
    'EXPENSE ACTIONS': "action LIKE 'EXPENSE%'",
    USER_ACTIONS: "action LIKE 'USER%'",
    'USER ACTIONS': "action LIKE 'USER%'",
    PROPERTY_ACTIONS: "action LIKE 'PROPERTY%'",
    'PROPERTY ACTIONS': "action LIKE 'PROPERTY%'",
    APARTMENT_ACTIONS: "action LIKE 'APARTMENT%'",
    'APARTMENT ACTIONS': "action LIKE 'APARTMENT%'",
    MAINTENANCE_ACTIONS: "action LIKE 'MAINTENANCE%'",
    'MAINTENANCE ACTIONS': "action LIKE 'MAINTENANCE%'",
    INSPECTION_ACTIONS: "action LIKE 'INSPECTION%'",
    'INSPECTION ACTIONS': "action LIKE 'INSPECTION%'",
    SETTINGS_ACTIONS: "action LIKE 'SETTINGS%'",
    'SETTINGS ACTIONS': "action LIKE 'SETTINGS%'",
    ACCESS_ACTIONS: "(action LIKE 'CAPABILITY%' OR action LIKE 'ACCESS%')",
    'ACCESS ACTIONS': "(action LIKE 'CAPABILITY%' OR action LIKE 'ACCESS%')",
    COMMUNICATION_ACTIONS: "action LIKE 'COMMUNICATION%'",
    'COMMUNICATION ACTIONS': "action LIKE 'COMMUNICATION%'",
    NOTIFICATION_ACTIONS: "action LIKE 'NOTIFICATION%'",
    'NOTIFICATION ACTIONS': "action LIKE 'NOTIFICATION%'",
    ANNOUNCEMENT_ACTIONS: "action LIKE 'ANNOUNCEMENT%'",
    'ANNOUNCEMENT ACTIONS': "action LIKE 'ANNOUNCEMENT%'",
    ACCOUNTING_ACTIONS: "(action LIKE 'ACCOUNTING%' OR action LIKE 'JOURNAL%' OR action LIKE 'PERIOD%')",
    'ACCOUNTING ACTIONS': "(action LIKE 'ACCOUNTING%' OR action LIKE 'JOURNAL%' OR action LIKE 'PERIOD%')",
  };

  if (categoryMap[clean]) {
    return { clause: ` AND ${categoryMap[clean]}`, params: [] };
  }

  return { clause: ' AND action = ?', params: [action.trim()] };
}

class AuditService {
  /**
   * Record an immutable audit log entry
   */
  static async record({
    req = null,
    actorId = null,
    actorEmail = null,
    actorRole = null,
    action,
    entityType,
    entityId = null,
    oldValues = null,
    newValues = null,
    requestId = null,
    ipAddress = null,
    userAgent = null,
    conn = null,
    throwOnError = false,
  }) {
    try {
      const finalRequestId = requestId || req?.id || req?.headers?.['x-request-id'] || null;
      const finalIpAddress = ipAddress || req?.ip || req?.connection?.remoteAddress || null;
      const finalUserAgent = userAgent || req?.headers?.['user-agent']?.substring(0, 255) || null;

      // Prefer actor from request context if available
      const finalActorId = actorId || req?.user?.id || null;
      const finalActorEmail = actorEmail || req?.user?.email || null;
      const finalActorRole = actorRole || req?.user?.role || 'SYSTEM';

      // Sanitize oldValues and newValues to guarantee zero password/token/secret leakage in audit logs
      const cleanOldValues = oldValues ? logger.sanitizeMeta(oldValues) : null;
      const cleanNewValues = newValues ? logger.sanitizeMeta(newValues) : null;

      const sql = `
        INSERT INTO audit_logs 
        (actor_id, actor_email, actor_role, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, request_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

      const executor = conn || pool;
      await executor.query(sql, [
        finalActorId,
        finalActorEmail,
        finalActorRole,
        action,
        entityType,
        entityId ? String(entityId) : null,
        cleanOldValues ? JSON.stringify(cleanOldValues) : null,
        cleanNewValues ? JSON.stringify(cleanNewValues) : null,
        finalIpAddress,
        finalUserAgent,
        finalRequestId,
      ]);

      logger.info(`[AUDIT] Action: ${action} on ${entityType}#${entityId || 'N/A'} by ${finalActorRole}`, {
        requestId: finalRequestId,
        action,
        entityType,
        entityId,
      });
    } catch (err) {
      logger.error('Failed to record audit log:', { error: err.message, action, entityType });
      if (throwOnError) {
        throw err;
      }
    }
  }

  /**
   * Query audit logs with administrative filtering, date/time ranges, and deterministic pagination
   */
  static async queryLogs({
    action,
    actorId,
    actorRole,
    entityType,
    entityId,
    fromDate,
    toDate,
    fromTime,
    toTime,
    from,
    to,
    page = 1,
    pageSize = 50,
    limit,
    offset,
  } = {}) {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    let countSql = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
    const params = [];
    const countParams = [];

    // 1. Action filtering: 'All Actions' returns all authorized records
    const actionFilter = buildActionClause(action);
    if (actionFilter) {
      sql += actionFilter.clause;
      countSql += actionFilter.clause;
      if (actionFilter.params.length > 0) {
        params.push(...actionFilter.params);
        countParams.push(...actionFilter.params);
      }
    }

    if (actorId) {
      sql += ' AND actor_id = ?';
      countSql += ' AND actor_id = ?';
      params.push(actorId);
      countParams.push(actorId);
    }
    if (actorRole) {
      sql += ' AND actor_role = ?';
      countSql += ' AND actor_role = ?';
      params.push(actorRole);
      countParams.push(actorRole);
    }
    if (entityType) {
      sql += ' AND entity_type = ?';
      countSql += ' AND entity_type = ?';
      params.push(entityType);
      countParams.push(entityType);
    }
    if (entityId) {
      sql += ' AND entity_id = ?';
      countSql += ' AND entity_id = ?';
      params.push(entityId);
      countParams.push(entityId);
    }

    // 2. Complete DateTime range filtering with boundary handling
    const { start, end } = normalizeDateTimeRange({ fromDate, toDate, fromTime, toTime, from, to });
    if (start) {
      sql += ' AND created_at >= ?';
      countSql += ' AND created_at >= ?';
      params.push(start);
      countParams.push(start);
    }
    if (end) {
      sql += ' AND created_at <= ?';
      countSql += ' AND created_at <= ?';
      params.push(end);
      countParams.push(end);
    }

    // 3. Count total matching rows
    const countRows = await pool.query(countSql, countParams);
    const total = Number(countRows[0]?.total || 0);

    // 4. Server-side pagination parameters
    const finalPage = Math.max(1, parseInt(page, 10) || 1);
    // Page size default is 50, maximum ceiling is 100 to prevent client abuse
    const rawLimit = limit ? parseInt(limit, 10) : (pageSize ? parseInt(pageSize, 10) : 50);
    const finalPageSize = Math.min(100, Math.max(1, rawLimit));
    const finalOffset = offset != null ? parseInt(offset, 10) : (finalPage - 1) * finalPageSize;
    const totalPages = Math.ceil(total / finalPageSize) || 1;

    // 5. Deterministic sorting: newest audit events first, with id as secondary deterministic sort
    sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
    params.push(finalPageSize, finalOffset);

    const rows = await pool.query(sql, params);

    return {
      logs: rows,
      total,
      page: finalPage,
      pageSize: finalPageSize,
      totalPages,
      limit: finalPageSize,
      offset: finalOffset,
    };
  }
}

AuditService.log = AuditService.record;

module.exports = AuditService;
