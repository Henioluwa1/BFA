/**
 * Dedicated Audit Trail Service
 */
const pool = require('../../db/pool');
const logger = require('../logging/logger');

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
  }) {
    try {
      const requestId = req?.id || req?.headers?.['x-request-id'] || null;
      const ipAddress = req?.ip || req?.connection?.remoteAddress || null;
      const userAgent = req?.headers?.['user-agent']?.substring(0, 255) || null;

      // Prefer actor from request context if available
      const finalActorId = actorId || req?.user?.id || null;
      const finalActorEmail = actorEmail || req?.user?.email || null;
      const finalActorRole = actorRole || req?.user?.role || req?.headers?.['x-user-role'] || 'SYSTEM';

      const sql = `
        INSERT INTO audit_logs 
        (actor_id, actor_email, actor_role, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, request_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

      await pool.query(sql, [
        finalActorId,
        finalActorEmail,
        finalActorRole,
        action,
        entityType,
        entityId ? String(entityId) : null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress,
        userAgent,
        requestId,
      ]);

      logger.info(`[AUDIT] Action: ${action} on ${entityType}#${entityId || 'N/A'} by ${finalActorRole}`, {
        requestId,
        action,
        entityType,
        entityId,
      });
    } catch (err) {
      // Never crash the primary business operation if audit write fails, but log error
      logger.error('Failed to record audit log:', { error: err.message, action, entityType });
    }
  }

  /**
   * Query audit logs with administrative filtering
   */
  static async queryLogs({
    action,
    actorId,
    actorRole,
    entityType,
    entityId,
    fromDate,
    toDate,
    limit = 50,
    offset = 0,
  } = {}) {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (action) {
      sql += ' AND action = ?';
      params.push(action);
    }
    if (actorId) {
      sql += ' AND actor_id = ?';
      params.push(actorId);
    }
    if (actorRole) {
      sql += ' AND actor_role = ?';
      params.push(actorRole);
    }
    if (entityType) {
      sql += ' AND entity_type = ?';
      params.push(entityType);
    }
    if (entityId) {
      sql += ' AND entity_id = ?';
      params.push(entityId);
    }
    if (fromDate) {
      sql += ' AND created_at >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND created_at <= ?';
      params.push(toDate);
    }

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const rows = await pool.query(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
    const countParams = [];
    if (action) { countSql += ' AND action = ?'; countParams.push(action); }
    if (actorId) { countSql += ' AND actor_id = ?'; countParams.push(actorId); }
    if (actorRole) { countSql += ' AND actor_role = ?'; countParams.push(actorRole); }
    if (entityType) { countSql += ' AND entity_type = ?'; countParams.push(entityType); }
    if (entityId) { countSql += ' AND entity_id = ?'; countParams.push(entityId); }
    if (fromDate) { countSql += ' AND created_at >= ?'; countParams.push(fromDate); }
    if (toDate) { countSql += ' AND created_at <= ?'; countParams.push(toDate); }

    const countRows = await pool.query(countSql, countParams);
    const total = countRows[0]?.total || 0;

    return { logs: rows, total };
  }
}

module.exports = AuditService;
