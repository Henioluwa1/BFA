/**
 * Operational Directives Service
 * BFA Apartments Management System
 *
 * Implements Admin-Initiated Company Operations Directives,
 * Manager Execution Plans, Priority Tracking, and Administrative Oversight.
 */

const pool = require('../../db/pool');
const AuditService = require('../../core/audit/audit.service');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');
const ChatService = require('../chat/chat.service');

class DirectivesService {
  /**
   * Generate sequential directive code: DIR-YYYYMM-XXXX
   */
  static async generateDirectiveCode() {
    const now = new Date();
    const prefix = `DIR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM operational_directives WHERE directive_code LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Admin creates an operational directive
   */
  static async createDirective(adminUser, data) {
    const role = (adminUser.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      throw new ForbiddenError('Only Company Operations Administrators can issue operational directives.');
    }

    const {
      title,
      description,
      target_outcome = null,
      priority = 'NORMAL',
      property_id = null,
      assigned_manager_id = null,
      deadline_date = null,
    } = data;

    if (!title || !description) {
      throw new BadRequestError('Directive title and description are required.');
    }

    const directiveCode = await this.generateDirectiveCode();

    const insertSql = `
      INSERT INTO operational_directives (
        directive_code, title, description, target_outcome, priority,
        status, property_id, initiated_by_admin_id, assigned_manager_id, deadline_date
      ) VALUES (
        $1, $2, $3, $4, $5, 'ISSUED', $6, $7, $8, $9
      ) RETURNING *;
    `;

    const insertRes = await pool.query(insertSql, [
      directiveCode,
      title,
      description,
      target_outcome,
      priority,
      property_id,
      adminUser.id,
      assigned_manager_id,
      deadline_date,
    ]);

    const createdId = insertRes.insertId || insertRes.rows?.[0]?.id || (Array.isArray(insertRes) ? insertRes[0]?.id : null);
    const [createdDirective] = await pool.query('SELECT * FROM operational_directives WHERE id = ?', [createdId]);

    await AuditService.record({
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      actorRole: adminUser.role,
      action: 'ADMIN_DIRECTIVE_ISSUED',
      entityType: 'operational_directive',
      entityId: String(createdDirective.id),
      newValues: { directiveCode, title, priority, assignedManagerId: assigned_manager_id },
    });

    // Notify assigned manager via internal chat if designated
    if (assigned_manager_id) {
      try {
        const directThread = await ChatService.findOrCreateDirectThread(adminUser, assigned_manager_id);
        if (directThread && directThread.id) {
          const msg = `📋 [ADMINISTRATIVE OPERATIONAL DIRECTIVE - ${directiveCode}]\n` +
            `Title: ${title}\n` +
            `Priority: ${priority}\n` +
            `Deadline: ${deadline_date || 'Standard Operational Cadence'}\n` +
            `Objectives: ${description}\n` +
            `Expected Outcome: ${target_outcome || 'Full compliance and execution'}\n\n` +
            `Please prepare and submit your property execution plan via the Operations Portal.`;

          await ChatService.sendMessage(adminUser, {
            threadId: directThread.id,
            messageType: 'TEXT',
            content: msg,
            priority: priority === 'URGENT' ? 'URGENT' : 'IMPORTANT',
            contextEntityType: 'DIRECTIVE',
            contextEntityId: createdDirective.id,
          });
        }
      } catch (chatErr) {
        logger.warn(`Failed to dispatch directive chat notification: ${chatErr.message}`);
      }
    }

    return createdDirective;
  }

  /**
   * List directives with role-aware scoping
   */
  static async listDirectives(user, filters = {}) {
    const role = (user.role || '').toUpperCase();
    const params = [];
    const conditions = [];

    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`(od.property_id = $${params.length} OR od.property_id IS NULL)`);
      }
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      params.push(user.id);
      conditions.push(`(od.assigned_manager_id = $${params.length} 
        OR od.property_id = (SELECT property_id FROM users WHERE id = $${params.length})
        OR od.property_id IS NULL)`);
    } else {
      // General staff does not access directives directly
      throw new ForbiddenError('Staff members do not have direct access to administrative directives.');
    }

    if (filters.status && filters.status !== 'all') {
      params.push(filters.status.toUpperCase());
      conditions.push(`od.status = $${params.length}`);
    }

    if (filters.priority && filters.priority !== 'all') {
      params.push(filters.priority.toUpperCase());
      conditions.push(`od.priority = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        od.*,
        p.name AS property_name,
        p.code AS property_code,
        u_adm.name AS initiated_by_admin_name,
        u_mgr.name AS assigned_manager_name,
        (SELECT COUNT(*) FROM operational_tasks ot WHERE ot.directive_id = od.id) AS linked_tasks_count,
        (SELECT COUNT(*) FROM operational_tasks ot WHERE ot.directive_id = od.id AND ot.status = 'COMPLETED') AS completed_tasks_count
      FROM operational_directives od
      LEFT JOIN properties p ON od.property_id = p.id
      JOIN users u_adm ON od.initiated_by_admin_id = u_adm.id
      LEFT JOIN users u_mgr ON od.assigned_manager_id = u_mgr.id
      ${whereClause}
      ORDER BY od.id DESC;
    `;

    return pool.query(sql, params);
  }

  /**
   * Get single directive by ID
   */
  static async getDirectiveById(user, id) {
    const sql = `
      SELECT 
        od.*,
        p.name AS property_name,
        p.code AS property_code,
        u_adm.name AS initiated_by_admin_name,
        u_mgr.name AS assigned_manager_name
      FROM operational_directives od
      LEFT JOIN properties p ON od.property_id = p.id
      JOIN users u_adm ON od.initiated_by_admin_id = u_adm.id
      LEFT JOIN users u_mgr ON od.assigned_manager_id = u_mgr.id
      WHERE od.id = $1
      LIMIT 1;
    `;

    const rows = await pool.query(sql, [id]);
    if (!rows || rows.length === 0) {
      throw new NotFoundError('Directive not found.');
    }

    const directive = rows[0];

    // Fetch linked operational tasks
    const tasks = await pool.query(
      `SELECT ot.*, u.name AS assigned_to_name
       FROM operational_tasks ot
       JOIN users u ON ot.assigned_to_id = u.id
       WHERE ot.directive_id = $1
       ORDER BY ot.id DESC;`,
      [id]
    );

    directive.linked_tasks = tasks || [];
    return directive;
  }

  /**
   * Manager submits Execution Plan for directive
   */
  static async submitExecutionPlan(managerUser, id, planData) {
    const role = (managerUser.role || '').toUpperCase();
    if (!['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only managers can submit execution plans for directives.');
    }

    const { manager_execution_plan } = planData;
    if (!manager_execution_plan || manager_execution_plan.trim().length === 0) {
      throw new BadRequestError('Execution plan details are required.');
    }

    const updateSql = `
      UPDATE operational_directives 
      SET manager_execution_plan = $2, manager_plan_submitted_at = CURRENT_TIMESTAMP,
          status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, [id, manager_execution_plan]);
    const [updated] = await pool.query('SELECT * FROM operational_directives WHERE id = ?', [id]);

    await AuditService.record({
      actorId: managerUser.id,
      actorEmail: managerUser.email,
      actorRole: managerUser.role,
      action: 'DIRECTIVE_PLAN_SUBMITTED',
      entityType: 'operational_directive',
      entityId: String(id),
      newValues: { status: updated.status },
    });

    return updated;
  }

  /**
   * Admin reviews and updates directive status
   */
  static async updateDirectiveStatus(adminUser, id, statusData) {
    const role = (adminUser.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      throw new ForbiddenError('Only administrators can update directive status.');
    }

    const { status, admin_review_notes } = statusData;
    const allowed = ['ISSUED', 'IN_PROGRESS', 'AWAITING_REVIEW', 'COMPLETED', 'CANCELLED'];
    if (!allowed.includes(status)) {
      throw new BadRequestError(`Invalid status. Allowed: ${allowed.join(', ')}`);
    }

    const updateSql = `
      UPDATE operational_directives 
      SET status = $2, admin_review_notes = COALESCE($3, admin_review_notes),
          completed_at = CASE WHEN $2 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, [id, status, admin_review_notes]);
    const [updated] = await pool.query('SELECT * FROM operational_directives WHERE id = ?', [id]);
    return updated;
  }
}

module.exports = DirectivesService;
