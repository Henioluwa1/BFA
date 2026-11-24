/**
 * Operational Tasks and Blockers Service
 * BFA Apartments Management System
 *
 * Implements task lifecycle, blocker documentation (materials, access, safety),
 * manager review, overdue monitoring, and chat context integration.
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

class TaskOperationsService {
  /**
   * Enforce Manager property scope
   */
  static async verifyManagerPropertyAccess(user, propertyId) {
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      return true;
    }
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      const targetPropId = parseInt(propertyId, 10);
      if (user.propertyId && parseInt(user.propertyId, 10) === targetPropId) {
        return true;
      }
      const res = await pool.query(
        'SELECT 1 FROM user_property_assignments WHERE user_id = $1 AND property_id = $2 LIMIT 1;',
        [user.id, targetPropId]
      );
      if (res && res.length > 0) return true;
      throw new ForbiddenError('Access denied: You are not authorized for this property.');
    }
    throw new ForbiddenError('Access denied: Only managers and administrators can assign operational tasks.');
  }

  /**
   * Generate sequential task code: TSK-YYYYMM-XXXX
   */
  static async generateTaskCode() {
    const now = new Date();
    const prefix = `TSK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM operational_tasks WHERE task_code LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Create an operational task
   */
  static async createTask(assignorUser, data) {
    const {
      property_id,
      apartment_id = null,
      assignment_id = null,
      directive_id = null,
      assigned_to_id,
      title,
      description,
      expected_outcome = null,
      task_category = 'GENERAL',
      priority = 'NORMAL',
      start_date = null,
      due_date,
    } = data;

    if (!property_id || !assigned_to_id || !title || !description || !due_date) {
      throw new BadRequestError('property_id, assigned_to_id, title, description, and due_date are required.');
    }

    await this.verifyManagerPropertyAccess(assignorUser, property_id);

    // Verify assigned user exists
    const staffRes = await pool.query('SELECT id, name, email FROM users WHERE id = $1 LIMIT 1;', [assigned_to_id]);
    if (!staffRes || staffRes.length === 0) {
      throw new NotFoundError('Target staff user does not exist.');
    }

    // Verify property exists
    const propRes = await pool.query('SELECT id, name FROM properties WHERE id = $1 LIMIT 1;', [property_id]);
    if (!propRes || propRes.length === 0) {
      throw new NotFoundError('Property does not exist.');
    }
    const property = propRes[0];

    const taskCode = await this.generateTaskCode();

    const insertSql = `
      INSERT INTO operational_tasks (
        task_code, property_id, apartment_id, assignment_id, directive_id,
        assigned_to_id, assigned_by_id, title, description,
        expected_outcome, task_category, priority, start_date, due_date, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'PENDING'
      ) RETURNING *;
    `;

    const insertRes = await pool.query(insertSql, [
      taskCode,
      property_id,
      apartment_id,
      assignment_id,
      directive_id,
      assigned_to_id,
      assignorUser.id,
      title,
      description,
      expected_outcome,
      task_category,
      priority,
      start_date,
      due_date,
    ]);

    const createdId = insertRes.insertId || insertRes.rows?.[0]?.id || (Array.isArray(insertRes) ? insertRes[0]?.id : null);
    const [createdTask] = await pool.query('SELECT * FROM operational_tasks WHERE id = ?', [createdId]);

    await AuditService.record({
      actorId: assignorUser.id,
      actorEmail: assignorUser.email,
      actorRole: assignorUser.role,
      action: 'OPERATIONAL_TASK_CREATED',
      entityType: 'operational_task',
      entityId: String(createdTask.id),
      newValues: { taskCode, title, assignedTo: assigned_to_id, propertyId: property_id },
    });

    // Notify staff via internal chat
    try {
      const directThread = await ChatService.findOrCreateDirectThread(assignorUser, assigned_to_id);
      if (directThread && directThread.id) {
        const msg = `🔧 [OPERATIONAL TASK ASSIGNED - ${taskCode}]\n` +
          `Title: ${title}\n` +
          `Property: ${property.name}\n` +
          `Category: ${task_category}\n` +
          `Priority: ${priority}\n` +
          `Due Date: ${new Date(due_date).toLocaleString()}\n` +
          `Expected Outcome: ${expected_outcome || 'Complete task as instructed.'}\n` +
          `Instructions: ${description}`;

        await ChatService.sendMessage(assignorUser, {
          threadId: directThread.id,
          messageType: 'TEXT',
          content: msg,
          priority: priority === 'URGENT' ? 'URGENT' : 'NORMAL',
          contextEntityType: 'TASK',
          contextEntityId: createdTask.id,
        });
      }
    } catch (chatErr) {
      logger.warn(`Failed to dispatch task chat notice: ${chatErr.message}`);
    }

    return createdTask;
  }

  /**
   * List operational tasks with role-scoped filtering and dynamic overdue detection
   */
  static async listTasks(user, filters = {}) {
    const role = (user.role || '').toUpperCase();
    const params = [];
    const conditions = [];

    // Role scoping
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`ot.property_id = $${params.length}`);
      }
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        await this.verifyManagerPropertyAccess(user, filters.property_id);
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`ot.property_id = $${params.length}`);
      } else {
        params.push(user.id);
        conditions.push(`(ot.property_id = (SELECT property_id FROM users WHERE id = $${params.length}) 
          OR ot.property_id IN (SELECT property_id FROM user_property_assignments WHERE user_id = $${params.length}))`);
      }
    } else {
      // Staff member sees only tasks assigned to them
      params.push(user.id);
      conditions.push(`ot.assigned_to_id = $${params.length}`);
    }

    if (filters.status && filters.status !== 'all') {
      if (filters.status.toUpperCase() === 'OVERDUE') {
        conditions.push(`ot.status NOT IN ('COMPLETED', 'CANCELLED') AND ot.due_date < CURRENT_TIMESTAMP`);
      } else {
        params.push(filters.status.toUpperCase());
        conditions.push(`ot.status = $${params.length}`);
      }
    }

    if (filters.category && filters.category !== 'all') {
      params.push(filters.category.toUpperCase());
      conditions.push(`ot.task_category = $${params.length}`);
    }

    if (filters.assigned_to_id) {
      params.push(parseInt(filters.assigned_to_id, 10));
      conditions.push(`ot.assigned_to_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        ot.*,
        CASE 
          WHEN ot.status NOT IN ('COMPLETED', 'CANCELLED') AND ot.due_date < CURRENT_TIMESTAMP THEN TRUE
          ELSE FALSE
        END AS is_overdue,
        p.name AS property_name,
        p.code AS property_code,
        a.unit_number AS apartment_unit_number,
        u_staff.name AS assigned_to_name,
        u_staff.email AS assigned_to_email,
        u_mgr.name AS assigned_by_name,
        co.operation_code,
        co.title AS central_operation_title,
        (SELECT COUNT(*) FROM task_blockers tb WHERE tb.task_id = ot.id AND tb.status = 'OPEN') AS open_blockers_count
      FROM operational_tasks ot
      JOIN properties p ON ot.property_id = p.id
      LEFT JOIN apartments a ON ot.apartment_id = a.id
      LEFT JOIN central_operations co ON ot.central_operation_id = co.id
      JOIN users u_staff ON ot.assigned_to_id = u_staff.id
      JOIN users u_mgr ON ot.assigned_by_id = u_mgr.id
      ${whereClause}
      ORDER BY 
        CASE WHEN ot.status NOT IN ('COMPLETED', 'CANCELLED') AND ot.due_date < CURRENT_TIMESTAMP THEN 0 ELSE 1 END,
        ot.due_date ASC, ot.id DESC;
    `;

    return pool.query(sql, params);
  }

  /**
   * Get task by ID including blockers and history
   */
  static async getTaskById(user, id) {
    const sql = `
      SELECT 
        ot.*,
        CASE 
          WHEN ot.status NOT IN ('COMPLETED', 'CANCELLED') AND ot.due_date < CURRENT_TIMESTAMP THEN TRUE
          ELSE FALSE
        END AS is_overdue,
        p.name AS property_name,
        p.code AS property_code,
        a.unit_number AS apartment_unit_number,
        u_staff.name AS assigned_to_name,
        u_staff.email AS assigned_to_email,
        u_mgr.name AS assigned_by_name,
        u_rev.name AS reviewed_by_name,
        co.operation_code,
        co.title AS central_operation_title
      FROM operational_tasks ot
      JOIN properties p ON ot.property_id = p.id
      LEFT JOIN apartments a ON ot.apartment_id = a.id
      LEFT JOIN central_operations co ON ot.central_operation_id = co.id
      JOIN users u_staff ON ot.assigned_to_id = u_staff.id
      JOIN users u_mgr ON ot.assigned_by_id = u_mgr.id
      LEFT JOIN users u_rev ON ot.reviewed_by_id = u_rev.id
      WHERE ot.id = $1
      LIMIT 1;
    `;

    const rows = await pool.query(sql, [id]);
    if (!rows || rows.length === 0) {
      throw new NotFoundError('Task not found.');
    }

    const task = rows[0];
    const role = (user.role || '').toUpperCase();

    if (['STAFF', 'RECEPTIONIST'].includes(role) && task.assigned_to_id !== user.id) {
      throw new ForbiddenError('Access denied: You can only view your own assigned tasks.');
    }
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      await this.verifyManagerPropertyAccess(user, task.property_id);
    }

    // Fetch blockers
    const blockers = await pool.query(
      `SELECT tb.*, u.name AS reported_by_name, u_res.name AS resolved_by_name
       FROM task_blockers tb
       JOIN users u ON tb.reported_by_id = u.id
       LEFT JOIN users u_res ON tb.resolved_by_id = u_res.id
       WHERE tb.task_id = $1
       ORDER BY tb.reported_at DESC;`,
      [id]
    );

    task.blockers = blockers || [];
    return task;
  }

  /**
   * Update task progress (by assigned staff or manager)
   */
  static async updateTaskProgress(user, id, data) {
    const task = await this.getTaskById(user, id);
    const role = (user.role || '').toUpperCase();

    // Verify authorized user
    if (task.assigned_to_id !== user.id && !['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('You are not authorized to update progress on this task.');
    }

    const { status, materials_used, completion_notes } = data;
    const updates = [];
    const params = [id];

    if (status) {
      params.push(status.toUpperCase());
      updates.push(`status = $${params.length}`);

      if (status.toUpperCase() === 'COMPLETED') {
        updates.push('completed_at = CURRENT_TIMESTAMP');
      }
    }

    if (materials_used !== undefined) {
      params.push(materials_used);
      updates.push(`materials_used = $${params.length}`);
    }

    if (completion_notes !== undefined) {
      params.push(completion_notes);
      updates.push(`completion_notes = $${params.length}`);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const updateSql = `
      UPDATE operational_tasks 
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, params);
    const [updated] = await pool.query('SELECT * FROM operational_tasks WHERE id = ?', [id]);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'TASK_PROGRESS_UPDATED',
      entityType: 'operational_task',
      entityId: String(id),
      newValues: { status: updated.status, completion_notes },
    });

    return updated;
  }

  /**
   * Report an Operational Blocker (Materials, Access, Safety, Equipment, Other)
   */
  static async reportBlocker(user, taskId, blockerData) {
    const task = await this.getTaskById(user, taskId);
    const role = (user.role || '').toUpperCase();

    if (task.assigned_to_id !== user.id && !['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('You can only report blockers on your assigned tasks.');
    }

    const { category, description } = blockerData;
    if (!category || !description) {
      throw new BadRequestError('Blocker category and description are required.');
    }

    // Insert blocker record
    const insertSql = `
      INSERT INTO task_blockers (task_id, reported_by_id, category, description, status)
      VALUES ($1, $2, $3, $4, 'OPEN')
      RETURNING *;
    `;

    const insertRes = await pool.query(insertSql, [taskId, user.id, category.toUpperCase(), description]);
    const blockerId = insertRes.insertId || insertRes.rows?.[0]?.id || (Array.isArray(insertRes) ? insertRes[0]?.id : null);
    const [blocker] = await pool.query('SELECT * FROM task_blockers WHERE id = ?', [blockerId]);

    // Automatically transition task status to BLOCKED
    await pool.query(
      "UPDATE operational_tasks SET status = 'BLOCKED', updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [taskId]
    );

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'TASK_BLOCKER_REPORTED',
      entityType: 'task_blocker',
      entityId: String(blocker.id),
      newValues: { taskId, category, description },
    });

    // Notify assigning manager via chat
    try {
      const directThread = await ChatService.findOrCreateDirectThread(user, task.assigned_by_id);
      if (directThread && directThread.id) {
        const msg = `⚠️ [BLOCKER REPORTED - ${task.task_code}]\n` +
          `Task: ${task.title}\n` +
          `Category: ${category}\n` +
          `Reported By: ${user.name}\n` +
          `Details: ${description}\n\n` +
          `Task has been flagged as BLOCKED. Please review and provide necessary materials/access.`;

        await ChatService.sendMessage(user, {
          threadId: directThread.id,
          messageType: 'TEXT',
          content: msg,
          priority: 'IMPORTANT',
          contextEntityType: 'TASK',
          contextEntityId: task.id,
        });
      }
    } catch (chatErr) {
      logger.warn(`Failed to dispatch blocker notice via chat: ${chatErr.message}`);
    }

    return blocker;
  }

  /**
   * Resolve an Operational Blocker (Manager / Admin)
   */
  static async resolveBlocker(user, blockerId, resolutionData) {
    const { resolution_notes } = resolutionData;
    if (!resolution_notes || resolution_notes.trim().length === 0) {
      throw new BadRequestError('Resolution notes are required.');
    }

    const blockerRows = await pool.query('SELECT * FROM task_blockers WHERE id = $1 LIMIT 1;', [blockerId]);
    if (!blockerRows || blockerRows.length === 0) {
      throw new NotFoundError('Blocker not found.');
    }
    const blocker = blockerRows[0];

    // Verify manager has access to property
    const task = await this.getTaskById(user, blocker.task_id);
    const role = (user.role || '').toUpperCase();
    if (!['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only managers and administrators can resolve operational blockers.');
    }

    const updateSql = `
      UPDATE task_blockers 
      SET status = 'RESOLVED', resolved_by_id = $2, resolved_at = CURRENT_TIMESTAMP, resolution_notes = $3
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, [blockerId, user.id, resolution_notes]);
    const [resolvedBlocker] = await pool.query('SELECT * FROM task_blockers WHERE id = ?', [blockerId]);

    // Check if there are remaining open blockers on this task
    const remainingOpen = await pool.query(
      "SELECT COUNT(*) AS count FROM task_blockers WHERE task_id = $1 AND status = 'OPEN';",
      [task.id]
    );

    if (parseInt(remainingOpen[0]?.count || 0, 10) === 0) {
      // Resume task status to IN_PROGRESS
      await pool.query(
        "UPDATE operational_tasks SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
        [task.id]
      );
    }

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'TASK_BLOCKER_RESOLVED',
      entityType: 'task_blocker',
      entityId: String(blockerId),
      newValues: { taskId: task.id, resolution_notes },
    });

    return resolvedBlocker;
  }

  /**
   * Manager / Admin review of completed operational task
   */
  static async reviewTask(user, taskId, reviewData) {
    const task = await this.getTaskById(user, taskId);
    const role = (user.role || '').toUpperCase();

    if (!['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only managers and administrators can review completed tasks.');
    }

    await this.verifyManagerPropertyAccess(user, task.property_id);

    const { review_status, review_notes } = reviewData;
    if (!['ACCEPTED', 'REVISE_REQUIRED', 'REJECTED'].includes(review_status)) {
      throw new BadRequestError('review_status must be ACCEPTED, REVISE_REQUIRED, or REJECTED.');
    }

    const newOverallStatus = review_status === 'ACCEPTED' ? 'COMPLETED' : 'IN_PROGRESS';

    const updateSql = `
      UPDATE operational_tasks 
      SET review_status = $2, reviewed_by_id = $3, reviewed_at = CURRENT_TIMESTAMP,
          review_notes = $4, status = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, [taskId, review_status, user.id, review_notes, newOverallStatus]);
    const [reviewedTask] = await pool.query('SELECT * FROM operational_tasks WHERE id = ?', [taskId]);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: `TASK_REVIEW_${review_status}`,
      entityType: 'operational_task',
      entityId: String(taskId),
      newValues: { review_status, review_notes },
    });

    return reviewedTask;
  }
}

module.exports = TaskOperationsService;
