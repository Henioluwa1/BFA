const crypto = require('crypto');
const pool = require('../../db/pool');
const { NotFoundError, ConflictError, ForbiddenError, ValidationError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');

const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes validity

/**
 * Computes deterministic SHA-256 hash of parameters to prevent parameter substitution attacks
 */
function hashParameters(params) {
  function canonicalize(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(canonicalize);
    const sorted = {};
    Object.keys(obj)
      .sort()
      .forEach((k) => {
        sorted[k] = canonicalize(obj[k]);
      });
    return sorted;
  }
  const serialized = JSON.stringify(canonicalize(params));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

class ConfirmationService {
  /**
   * Create a pending server-side confirmation for a consequential action
   */
  static async createConfirmation({
    action,
    user,
    params,
    propertyId = null,
    recordId = null,
    summary = null,
    idempotencyKey = null,
    requiresDualApproval = false,
    req = null,
  }) {
    if (!user || !user.id) {
      throw new ForbiddenError('Authenticated user is required to create a confirmation.');
    }

    const token = `bfa_conf_${crypto.randomBytes(24).toString('hex')}`;
    const paramHash = hashParameters(params);
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);
    const defaultSummary = summary || action.summaryBuilder(params);

    const sql = `
      INSERT INTO automation_confirmations
      (confirmation_token, action_id, user_id, user_role, property_id, record_id, parameters_hash, parameters_payload, summary, status, requires_dual_approval, expires_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), ?);
    `;

    const result = await pool.query(sql, [
      token,
      action.actionId,
      user.id,
      (user.role || 'STAFF').toUpperCase(),
      propertyId ? parseInt(propertyId, 10) : null,
      recordId ? String(recordId) : null,
      paramHash,
      JSON.stringify(params),
      defaultSummary,
      requiresDualApproval ? 1 : 0,
      idempotencyKey || null,
    ]);

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUTOMATION_CONFIRMATION_CREATED',
      entityType: 'automation_confirmation',
      entityId: String(result.insertId),
      newValues: {
        token: `${token.substring(0, 12)}...`,
        actionId: action.actionId,
        summary: defaultSummary,
        propertyId,
        recordId,
        expiresAt: expiresAt.toISOString(),
        requiresDualApproval,
      },
    });

    return {
      confirmationId: result.insertId,
      confirmationToken: token,
      actionId: action.actionId,
      summary: defaultSummary,
      propertyId,
      recordId,
      requiresDualApproval,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: Math.floor(CONFIRMATION_TTL_MS / 1000),
    };
  }

  /**
   * Validate and retrieve a pending confirmation by token
   */
  static async validateAndGetPending(token, user) {
    if (!token || typeof token !== 'string') {
      throw new ValidationError('A valid confirmationToken string is required.');
    }

    const rows = await pool.query(
      'SELECT *, (expires_at <= NOW()) AS is_expired FROM automation_confirmations WHERE confirmation_token = ? LIMIT 1',
      [token.trim()]
    );

    if (rows.length === 0) {
      throw new NotFoundError('Invalid, expired, or unknown confirmation token.');
    }

    const conf = rows[0];

    // Check status first
    if (conf.status === 'CONFIRMED') {
      let parsedParams = {};
      try {
        parsedParams = typeof conf.parameters_payload === 'string'
          ? JSON.parse(conf.parameters_payload)
          : conf.parameters_payload;
      } catch (e) {}
      const recovery = await ConfirmationService.handleInFlightRecovery({ ...conf, parsedParams });
      if (recovery?.recovered) {
        return { ...conf, parsedParams, recovered: true, recoveredResult: recovery.reservation };
      }
    }

    if (conf.status !== 'PENDING') {
      throw new ConflictError(
        `Confirmation token cannot be used. It has already been ${conf.status.toLowerCase()}.`
      );
    }

    // Check expiration against database server time
    if (conf.is_expired) {
      await pool.query("UPDATE automation_confirmations SET status = 'EXPIRED' WHERE id = ?", [conf.id]);
      throw new ConflictError('Confirmation token has expired. Please propose the operation again.');
    }

    // Verify user authorization binding
    if (conf.requires_dual_approval) {
      // Dual approval requires an approver DIFFERENT from the user who proposed it
      if (parseInt(user.id, 10) === parseInt(conf.user_id, 10)) {
        throw new ForbiddenError(
          'Dual approval policy violation: The proposing user cannot approve their own operation. A second authorized user must approve.'
        );
      }
    } else {
      // Standard confirmation must be confirmed by the same user who initiated it
      if (parseInt(user.id, 10) !== parseInt(conf.user_id, 10)) {
        throw new ForbiddenError(
          'Confirmation token binding mismatch: This confirmation can only be confirmed by the user who initiated the proposal.'
        );
      }
    }

    // Parse parameters
    let params;
    try {
      params = typeof conf.parameters_payload === 'string'
        ? JSON.parse(conf.parameters_payload)
        : conf.parameters_payload;
    } catch (e) {
      params = {};
    }

    // Verify hash integrity to ensure parameters were not tampered with
    const currentHash = hashParameters(params);
    if (currentHash !== conf.parameters_hash) {
      throw new ConflictError('Parameter integrity check failed: Proposal parameters have been tampered with.');
    }

    return { ...conf, parsedParams: params };
  }

  /**
   * Atomically claim a pending confirmation for execution (transitions PENDING -> CONFIRMED)
   * Eliminates concurrency race conditions. Returns true if successfully claimed.
   */
  static async atomicClaimPending({ confirmationId, approverUser = null, req = null }) {
    const approverId = approverUser ? approverUser.id : null;
    const approverRole = approverUser ? approverUser.role : null;
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const result = await pool.query(
      `UPDATE automation_confirmations 
       SET status = 'CONFIRMED', 
           approver_id = ?,
           approver_role = ?,
           approved_at = ?
       WHERE id = ? AND status = 'PENDING' AND (expires_at > NOW())`,
      [approverId, approverRole, nowStr, confirmationId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Handle in-flight or stalled confirmation for crash recovery and retry resilience
   */
  static async handleInFlightRecovery(conf) {
    // If confirmation is in CONFIRMED state, check if underlying reservation was committed
    if (conf.action_id === 'reservations.create' && conf.confirmation_token) {
      // 1. Direct indexed unique link check via confirmation_token column (O(1) index lookup)
      let rows = await pool.query(
        `SELECT id, reservation_code, status, total_amount, tenant_name, check_in_date, check_out_date, nights 
         FROM reservations 
         WHERE confirmation_token = ? 
         LIMIT 1`,
        [conf.confirmation_token]
      );

      // 2. Legacy fallback check for transition periods
      if (rows.length === 0) {
        rows = await pool.query(
          `SELECT id, reservation_code, status, total_amount, tenant_name, check_in_date, check_out_date, nights 
           FROM reservations 
           WHERE notes LIKE CONCAT('%', ?, '%')
           LIMIT 1`,
          [conf.confirmation_token]
        );
      }

      if (rows.length > 0) {
        const resv = rows[0];
        // Operation committed prior to process termination; heal status to EXECUTED
        await pool.query(
          `UPDATE automation_confirmations 
           SET status = 'EXECUTED', record_id = ?, executed_at = NOW() 
           WHERE id = ? AND status = 'CONFIRMED'`,
          [String(resv.id), conf.id]
        );
        return {
          recovered: true,
          reservation: resv,
        };
      }
    }

    // Check if stalled for longer than 30s timeout
    const approvedAtMs = conf.approved_at ? new Date(conf.approved_at).getTime() : 0;
    const isStalled = Date.now() - approvedAtMs > 30000;
    if (isStalled) {
      await pool.query(
        "UPDATE automation_confirmations SET status = 'REJECTED' WHERE id = ? AND status = 'CONFIRMED'",
        [conf.id]
      );
      throw new ConflictError(
        'Previous confirmation attempt timed out or process was interrupted without a committed operation. Proposal has been marked REJECTED. Please propose a new request.'
      );
    }

    throw new ConflictError(
      'Concurrent execution conflict: This confirmation is currently being executed. Please wait.'
    );
  }

  /**
   * Mark confirmation as successfully executed (transitions CONFIRMED -> EXECUTED)
   */
  static async markExecuted({ confirmationId, recordId = null, approverUser = null, req = null }) {
    const approverId = approverUser ? approverUser.id : null;
    const approverRole = approverUser ? approverUser.role : null;
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      `UPDATE automation_confirmations 
       SET status = 'EXECUTED', 
           executed_at = ?,
           record_id = COALESCE(?, record_id),
           approver_id = COALESCE(?, approver_id),
           approver_role = COALESCE(?, approver_role),
           approved_at = COALESCE(?, approved_at)
       WHERE id = ?`,
      [nowStr, recordId ? String(recordId) : null, approverId, approverRole, approverUser ? nowStr : null, confirmationId]
    );

    await auditService.record({
      req,
      actorId: approverUser?.id,
      actorEmail: approverUser?.email,
      actorRole: approverUser?.role,
      action: 'AUTOMATION_CONFIRMATION_EXECUTED',
      entityType: 'automation_confirmation',
      entityId: String(confirmationId),
      newValues: { status: 'EXECUTED', executedAt: nowStr, recordId: recordId ? String(recordId) : undefined },
    });
  }

  /**
   * Mark confirmation as failed/rejected upon business logic or database error
   */
  static async markFailed({ confirmationId, reason = 'Execution failed', approverUser = null, req = null }) {
    await pool.query(
      `UPDATE automation_confirmations 
       SET status = 'REJECTED'
       WHERE id = ? AND status IN ('CONFIRMED', 'PENDING')`,
      [confirmationId]
    );

    await auditService.record({
      req,
      actorId: approverUser?.id,
      actorEmail: approverUser?.email,
      actorRole: approverUser?.role,
      action: 'AUTOMATION_CONFIRMATION_FAILED',
      entityType: 'automation_confirmation',
      entityId: String(confirmationId),
      newValues: { status: 'REJECTED', failureReason: reason },
    });
  }

  /**
   * Cancel / reject a pending confirmation
   */
  static async cancelConfirmation({ token, user, reason = 'Cancelled by user', req = null }) {
    if (!token) throw new ValidationError('confirmationToken is required.');

    const rows = await pool.query(
      'SELECT * FROM automation_confirmations WHERE confirmation_token = ? LIMIT 1',
      [token.trim()]
    );

    if (rows.length === 0) {
      throw new NotFoundError('Confirmation token not found.');
    }

    const conf = rows[0];
    const isOwner = parseInt(user.id, 10) === parseInt(conf.user_id, 10);
    const isSuperAdmin = (user.role || '').toUpperCase() === 'SUPER_ADMIN';

    if (!isOwner && !isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to cancel this confirmation.');
    }

    if (conf.status !== 'PENDING') {
      throw new ConflictError(`Confirmation cannot be cancelled because it is already ${conf.status.toLowerCase()}.`);
    }

    await pool.query(
      "UPDATE automation_confirmations SET status = 'REJECTED' WHERE id = ?",
      [conf.id]
    );

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUTOMATION_CONFIRMATION_CANCELLED',
      entityType: 'automation_confirmation',
      entityId: String(conf.id),
      newValues: { status: 'REJECTED', reason },
    });

    return { success: true, cancelled: true, message: 'Confirmation successfully rejected.' };
  }
}

module.exports = ConfirmationService;
