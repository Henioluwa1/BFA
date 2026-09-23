const pool = require('../../db/pool');
const { ValidationError, ForbiddenError, NotFoundError } = require('../errors/apiError');
const auditService = require('../audit/audit.service');
const logger = require('../logging/logger');

class AccessControlService {
  /**
   * Check whether a user or public caller has access to a dynamic capability
   */
  static async canAccess(user = null, capabilityName) {
    const cleanName = String(capabilityName).trim().toUpperCase();
    const rows = await pool.query('SELECT * FROM capabilities WHERE name = ?', [cleanName]);
    if (rows.length === 0) {
      return { allowed: false, reason: `Unknown capability '${cleanName}'` };
    }

    const cap = rows[0];

    // Check active overrides
    const overrides = await pool.query(
      'SELECT * FROM access_overrides WHERE capability_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1',
      [cap.id]
    );

    if (overrides.length > 0) {
      return {
        allowed: true,
        reason: `Active override in place (${overrides[0].override_type})`,
        capability: cap,
        override: overrides[0],
      };
    }

    if (!cap.is_enabled) {
      return {
        allowed: false,
        reason: `Capability '${cleanName}' is currently disabled (${cap.restriction_level})`,
        capability: cap,
      };
    }

    return { allowed: true, capability: cap };
  }

  /**
   * List all capabilities with live restriction status, active overrides, and pending approval requests
   */
  static async listCapabilities() {
    const sql = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM access_approval_requests r WHERE r.capability_id = c.id AND r.status = 'PENDING') AS pending_requests_count,
        (SELECT r.id FROM access_approval_requests r WHERE r.capability_id = c.id AND r.status = 'PENDING' ORDER BY r.id DESC LIMIT 1) AS latest_pending_request_id,
        (SELECT r.request_reason FROM access_approval_requests r WHERE r.capability_id = c.id AND r.status = 'PENDING' ORDER BY r.id DESC LIMIT 1) AS latest_pending_reason,
        (SELECT o.override_type FROM access_overrides o WHERE o.capability_id = c.id AND o.is_active = 1 ORDER BY o.id DESC LIMIT 1) AS active_override_type
      FROM capabilities c
      ORDER BY c.category ASC, c.name ASC
    `;
    return pool.query(sql);
  }

  /**
   * Update capability state following strict authority hierarchy:
   * SUPER_ADMIN -> OWNER -> MANAGER -> ADMIN
   */
  static async updateCapability({ capabilityName, isEnabled, user, reason = '', req = null }) {
    if (!user) throw new ForbiddenError('Authentication required to modify capabilities.');
    const userRole = (user.role || '').toUpperCase();
    const cleanName = String(capabilityName).trim().toUpperCase();

    const rows = await pool.query('SELECT * FROM capabilities WHERE name = ?', [cleanName]);
    if (rows.length === 0) throw new NotFoundError(`Capability '${cleanName}' not found.`);
    const cap = rows[0];

    const isDisabling = !isEnabled;

    if (isDisabling) {
      let restrictionLevel = 'NONE';
      if (['OWNER', 'SUPER_ADMIN'].includes(userRole)) {
        restrictionLevel = 'OWNER_RESTRICTED';
      } else if (userRole === 'MANAGER') {
        restrictionLevel = 'MANAGER_RESTRICTED';
      } else if (userRole === 'ADMIN') {
        restrictionLevel = 'MANAGER_RESTRICTED';
      } else {
        throw new ForbiddenError(`Role '${userRole}' is not authorized to disable capabilities.`);
      }

      await pool.query(
        `UPDATE capabilities 
         SET is_enabled = 0, 
             restriction_level = ?, 
             restricted_by_id = ?, 
             restricted_by_role = ?, 
             restricted_at = CURRENT_TIMESTAMP, 
             restriction_reason = ? 
         WHERE id = ?`,
        [restrictionLevel, user.id, userRole, reason || 'Restricted by management', cap.id]
      );

      // Deactivate any historical overrides
      await pool.query('UPDATE access_overrides SET is_active = 0 WHERE capability_id = ?', [cap.id]);

      await auditService.record({
        req,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: userRole,
        action: `CAPABILITY_DISABLE_${restrictionLevel}`,
        entityType: 'capability',
        entityId: String(cap.id),
        oldValues: { is_enabled: cap.is_enabled, restriction_level: cap.restriction_level },
        newValues: { is_enabled: false, restriction_level: restrictionLevel, reason },
      });

      const [updatedRows] = await pool.query('SELECT * FROM capabilities WHERE id = ?', [cap.id]);

      return {
        success: true,
        message: `Capability '${cleanName}' disabled as ${restrictionLevel}.`,
        capability: updatedRows || { ...cap, is_enabled: 0, restriction_level: restrictionLevel },
      };
    }

    // Enabling Capability
    if (cap.restriction_level === 'OWNER_RESTRICTED') {
      if (userRole !== 'OWNER' && userRole !== 'SUPER_ADMIN') {
        throw new ForbiddenError(
          `Capability '${cleanName}' is OWNER_RESTRICTED. A lower authority (${userRole}) cannot enable it. Owner approval or Super Admin override is required.`
        );
      }
      if (userRole === 'SUPER_ADMIN') {
        const reqResult = await AccessControlService.requestOverride({
          capabilityName: cleanName,
          user,
          reason: reason || 'Super Admin request to enable capability',
          req,
        });
        return {
          success: true,
          actionRequired: 'APPROVAL_REQUEST_SUBMITTED',
          statusCode: 202,
          message: `Capability '${cleanName}' was restricted by Owner. An Approval Request has been created for Owner review.`,
          approvalRequest: { id: reqResult.requestId, status: 'PENDING', capabilityName: cleanName },
        };
      }
    } else if (cap.restriction_level === 'MANAGER_RESTRICTED') {
      if (!['MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(userRole)) {
        throw new ForbiddenError(`Role '${userRole}' is not authorized to enable this capability.`);
      }
    }

    // Enabled successfully
    await pool.query(
      `UPDATE capabilities 
       SET is_enabled = 1, 
           restriction_level = 'NONE', 
           restricted_by_id = NULL, 
           restricted_by_role = NULL, 
           restricted_at = NULL, 
           restriction_reason = NULL 
       WHERE id = ?`,
      [cap.id]
    );

    // Deactivate any overrides since base capability is now fully enabled
    await pool.query('UPDATE access_overrides SET is_active = 0 WHERE capability_id = ?', [cap.id]);

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: userRole,
      action: 'CAPABILITY_ENABLE',
      entityType: 'capability',
      entityId: String(cap.id),
      oldValues: { is_enabled: cap.is_enabled, restriction_level: cap.restriction_level },
      newValues: { is_enabled: true, restriction_level: 'NONE', reason },
    });

    const [updatedRows] = await pool.query('SELECT * FROM capabilities WHERE id = ?', [cap.id]);

    return {
      success: true,
      message: `Capability '${cleanName}' is now enabled.`,
      capability: updatedRows || { ...cap, is_enabled: 1, restriction_level: 'NONE' },
    };
  }

  /**
   * Super Admin creates an Override Request requiring Owner approval
   */
  static async requestOverride({ capabilityName, user, reason, req = null }) {
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only Super Admin can initiate an Owner override approval request.');
    }
    if (!reason || reason.trim().length < 5) {
      throw new ValidationError('A detailed reason is required to request an access override.');
    }

    const cleanName = String(capabilityName).trim().toUpperCase();
    const rows = await pool.query('SELECT * FROM capabilities WHERE name = ?', [cleanName]);
    if (rows.length === 0) throw new NotFoundError(`Capability '${cleanName}' not found.`);
    const cap = rows[0];

    const result = await pool.query(
      `INSERT INTO access_approval_requests (capability_id, requested_by_id, target_role, status, request_reason)
       VALUES (?, ?, 'OWNER', 'PENDING', ?)`,
      [cap.id, user.id, reason.trim()]
    );

    // Trigger Notification for Owner
    await pool.query(
      `INSERT INTO notifications (recipient_role, title, message, category, priority, source_entity_type, source_entity_id, link_url)
       VALUES ('OWNER', 'Access Override Request', ?, 'APPROVAL', 'HIGH', 'capability', ?, '/app/access-control')`,
      [
        `Super Admin has requested to override your restriction on '${cleanName}'. Reason: ${reason.trim()}`,
        String(cap.id),
      ]
    );

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'SUPER_ADMIN',
      action: 'CAPABILITY_OVERRIDE_REQUESTED',
      entityType: 'capability',
      entityId: String(cap.id),
      newValues: { requestId: result.insertId, reason, status: 'PENDING' },
    });

    return {
      success: true,
      message: `Override approval request submitted to Owner for '${cleanName}'.`,
      requestId: result.insertId,
    };
  }

  /**
   * Owner reviews (Approve / Reject) pending override request
   */
  static async reviewApprovalRequest({ requestId, approved, user, reviewNotes = '', req = null }) {
    if (!user || !['OWNER', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenError('Only Owner or Super Admin can review access approval requests.');
    }

    const rows = await pool.query(
      `SELECT r.*, c.name as capability_name 
       FROM access_approval_requests r 
       JOIN capabilities c ON r.capability_id = c.id 
       WHERE r.id = ?`,
      [requestId]
    );
    if (rows.length === 0) throw new NotFoundError(`Approval request #${requestId} not found.`);
    const request = rows[0];

    if (request.status !== 'PENDING') {
      throw new ValidationError(`Request #${requestId} has already been resolved (${request.status}).`);
    }

    const newStatus = approved ? 'APPROVED' : 'REJECTED';

    await pool.query(
      `UPDATE access_approval_requests 
       SET status = ?, reviewed_by_id = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ? 
       WHERE id = ?`,
      [newStatus, user.id, reviewNotes || null, request.id]
    );

    if (approved) {
      // Create active override and enable capability
      await pool.query(
        `INSERT INTO access_overrides (capability_id, override_type, applied_by_id, applied_by_role, reason, is_active)
         VALUES (?, 'OWNER_APPROVED', ?, ?, ?, 1)`,
        [request.capability_id, user.id, user.role, reviewNotes || 'Approved by Owner']
      );

      await pool.query(
        `UPDATE capabilities 
         SET is_enabled = 1, restriction_level = 'NONE' 
         WHERE id = ?`,
        [request.capability_id]
      );
    }

    // Notify Super Admin
    await pool.query(
      `INSERT INTO notifications (recipient_role, title, message, category, priority, source_entity_type, source_entity_id, link_url)
       VALUES ('SUPER_ADMIN', ?, ?, 'APPROVAL', ?, 'capability', ?, '/app/access-control')`,
      [
        `Override Request ${newStatus}`,
        `Owner has ${newStatus.toLowerCase()} your override request for '${request.capability_name}'. Notes: ${reviewNotes || 'None'}`,
        approved ? 'MEDIUM' : 'HIGH',
        String(request.capability_id),
      ]
    );

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: approved ? 'CAPABILITY_OVERRIDE_APPROVED' : 'CAPABILITY_OVERRIDE_REJECTED',
      entityType: 'capability',
      entityId: String(request.capability_id),
      newValues: { requestId: request.id, status: newStatus, reviewNotes },
    });

    return {
      success: true,
      message: `Request #${requestId} was successfully ${newStatus.toLowerCase()}.`,
      status: newStatus,
    };
  }

  /**
   * Super Admin EMERGENCY FORCED OVERRIDE
   * Bypasses Owner restriction immediately with strict confirmation, reason, and critical audit log
   */
  static async forceSuperAdminOverride({ capabilityName, confirmation, reason, user, req = null }) {
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only Super Admin can execute a forced administrative override.');
    }
    if (confirmation !== 'CONFIRM_FORCE_OVERRIDE') {
      throw new ValidationError(
        'Forced override requires explicit confirmation string: "CONFIRM_FORCE_OVERRIDE".'
      );
    }
    if (!reason || reason.trim().length < 8) {
      throw new ValidationError(
        'A comprehensive justification reason (at least 8 characters) is mandatory for forced override.'
      );
    }

    const cleanName = String(capabilityName).trim().toUpperCase();
    const rows = await pool.query('SELECT * FROM capabilities WHERE name = ?', [cleanName]);
    if (rows.length === 0) throw new NotFoundError(`Capability '${cleanName}' not found.`);
    const cap = rows[0];

    // 1. Record forced override in access_overrides
    await pool.query(
      `INSERT INTO access_overrides (capability_id, override_type, applied_by_id, applied_by_role, reason, is_active)
       VALUES (?, 'SUPER_ADMIN_FORCED', ?, 'SUPER_ADMIN', ?, 1)`,
      [cap.id, user.id, reason.trim()]
    );

    // 2. Mark any pending requests for this capability as BYPASSED_FORCE
    await pool.query(
      `UPDATE access_approval_requests 
       SET status = 'BYPASSED_FORCE', reviewed_by_id = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ? 
       WHERE capability_id = ? AND status = 'PENDING'`,
      [user.id, `Bypassed via Super Admin forced override: ${reason.trim()}`, cap.id]
    );

    // 3. Enable capability
    await pool.query(
      `UPDATE capabilities 
       SET is_enabled = 1, restriction_level = 'NONE' 
       WHERE id = ?`,
      [cap.id]
    );

    // 4. Critical security notification broadcast to all Owners
    await pool.query(
      `INSERT INTO notifications (recipient_role, title, message, category, priority, source_entity_type, source_entity_id, link_url)
       VALUES ('OWNER', 'EMERGENCY: Super Admin Forced Override Executed', ?, 'SECURITY', 'CRITICAL', 'capability', ?, '/app/access-control')`,
      [
        `CRITICAL SECURITY EVENT: Super Admin (${user.email}) forcibly bypassed Owner restriction on '${cleanName}'. Reason: "${reason.trim()}".`,
        String(cap.id),
      ]
    );

    // 5. Immutable high-priority security audit event
    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'SUPER_ADMIN',
      action: 'CAPABILITY_FORCED_OVERRIDE_BY_SUPER_ADMIN',
      entityType: 'capability',
      entityId: String(cap.id),
      oldValues: {
        is_enabled: cap.is_enabled,
        restriction_level: cap.restriction_level,
        restricted_by: cap.restricted_by_role,
      },
      newValues: {
        is_enabled: true,
        override_type: 'SUPER_ADMIN_FORCED',
        reason: reason.trim(),
        owner_bypassed: true,
      },
    });

    return {
      success: true,
      message: `Forced override successfully executed on '${cleanName}'. Elevated audit log generated.`,
      override: {
        capabilityName: cleanName,
        overrideType: 'SUPER_ADMIN_FORCED',
        justification: reason.trim(),
        status: 'ACTIVE',
      },
    };
  }

  /**
   * Retrieve list of pending approval requests
   */
  static async listApprovalRequests({ status = 'PENDING' } = {}) {
    let sql = `
      SELECT 
        r.*, 
        c.name as capability_name, 
        c.category as capability_category,
        u.name as requester_name, 
        u.email as requester_email
      FROM access_approval_requests r
      JOIN capabilities c ON r.capability_id = c.id
      JOIN users u ON r.requested_by_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (status && status !== 'ALL') {
      sql += ' AND r.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY r.requested_at DESC';
    return pool.query(sql, params);
  }
}

module.exports = AccessControlService;
