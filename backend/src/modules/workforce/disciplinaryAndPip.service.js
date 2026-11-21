/**
 * Disciplinary Management & Performance Improvement Plans (PIPs) Service
 * BFA Apartments Management System
 *
 * Implements formal show-cause queries, staff responses, outcome assessments,
 * sanction approval workflows (Admin approval for formal warnings/suspension/termination),
 * active PIP tracking, and positive performance recognition.
 *
 * STRICT GOVERNANCE:
 * - Owner role is FORBIDDEN from viewing private individual staff disciplinary records.
 * - Staff can only view their own queries and PIPs.
 * - Managers are strictly scoped to their assigned properties.
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

class DisciplinaryAndPipService {
  /**
   * Enforce privacy guard: Owner is forbidden from accessing private individual disciplinary records
   */
  static assertNotOwner(user) {
    const role = (user.role || '').toUpperCase();
    if (role === 'OWNER') {
      throw new ForbiddenError(
        'Executive Governance Restriction: Owner access is scoped to executive operational summaries and is strictly barred from individual employee disciplinary records.'
      );
    }
  }

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
    throw new ForbiddenError('Access denied: Only managers and administrators can manage disciplinary proceedings.');
  }

  /**
   * Generate sequential query code: QRY-YYYYMM-XXXX
   */
  static async generateQueryCode() {
    const now = new Date();
    const prefix = `QRY-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM disciplinary_queries WHERE query_code LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Generate sequential PIP code: PIP-YYYYMM-XXXX
   */
  static async generatePipCode() {
    const now = new Date();
    const prefix = `PIP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM performance_improvement_plans WHERE pip_code LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Issue a Formal Query / Show-Cause Notice to a staff member
   */
  static async issueQuery(issuerUser, data) {
    this.assertNotOwner(issuerUser);

    const {
      staff_user_id,
      property_id,
      linked_task_id = null,
      subject,
      allegation_details,
      evidence_summary = null,
      response_deadline_at,
    } = data;

    if (!staff_user_id || !property_id || !subject || !allegation_details || !response_deadline_at) {
      throw new BadRequestError('staff_user_id, property_id, subject, allegation_details, and response_deadline_at are required.');
    }

    await this.verifyManagerPropertyAccess(issuerUser, property_id);

    // If query is linked to a task, verify whether the task has active documented blockers
    if (linked_task_id) {
      const taskBlockerRes = await pool.query(
        "SELECT id, category, description FROM task_blockers WHERE task_id = $1 AND status = 'OPEN' LIMIT 1;",
        [linked_task_id]
      );
      if (taskBlockerRes && taskBlockerRes.length > 0) {
        logger.warn(
          `Disciplinary query issued on task #${linked_task_id} which has an active documented blocker: ${taskBlockerRes[0].category}`
        );
      }
    }

    const queryCode = await this.generateQueryCode();

    const insertSql = `
      INSERT INTO disciplinary_queries (
        query_code, staff_user_id, issued_by_id, property_id,
        linked_task_id, subject, allegation_details, evidence_summary,
        response_deadline_at, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'ISSUED'
      ) RETURNING *;
    `;

    const insertRes = await pool.query(insertSql, [
      queryCode,
      staff_user_id,
      issuerUser.id,
      property_id,
      linked_task_id,
      subject,
      allegation_details,
      evidence_summary,
      response_deadline_at,
    ]);

    const createdId = insertRes.insertId || insertRes.rows?.[0]?.id || (Array.isArray(insertRes) ? insertRes[0]?.id : null);
    const [createdQuery] = await pool.query('SELECT * FROM disciplinary_queries WHERE id = ?', [createdId]);

    await AuditService.record({
      actorId: issuerUser.id,
      actorEmail: issuerUser.email,
      actorRole: issuerUser.role,
      action: 'DISCIPLINARY_QUERY_ISSUED',
      entityType: 'disciplinary_query',
      entityId: String(createdQuery.id),
      newValues: { queryCode, staffId: staff_user_id, subject },
    });

    // Notify staff member via internal chat (marked IMPORTANT)
    try {
      const directThread = await ChatService.findOrCreateDirectThread(issuerUser, staff_user_id);
      if (directThread && directThread.id) {
        const msg = `⚠️ [FORMAL NOTICE / SHOW-CAUSE QUERY - ${queryCode}]\n` +
          `Subject: ${subject}\n` +
          `Issued By: ${issuerUser.name} (${issuerUser.role})\n` +
          `Response Deadline: ${new Date(response_deadline_at).toLocaleString()}\n` +
          `Details: ${allegation_details}\n\n` +
          `You are required to submit your formal explanation and rebuttal before the deadline via the Performance & Disciplinary portal.`;

        await ChatService.sendMessage(issuerUser, {
          threadId: directThread.id,
          messageType: 'TEXT',
          content: msg,
          priority: 'IMPORTANT',
          contextEntityType: 'QUERY',
          contextEntityId: createdQuery.id,
        });
      }
    } catch (chatErr) {
      logger.warn(`Failed to dispatch query chat notification: ${chatErr.message}`);
    }

    return createdQuery;
  }

  /**
   * List disciplinary queries with strict privacy and tenant scoping
   */
  static async listQueries(user, filters = {}) {
    this.assertNotOwner(user);

    const role = (user.role || '').toUpperCase();
    const params = [];
    const conditions = [];

    if (['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`dq.property_id = $${params.length}`);
      }
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        await this.verifyManagerPropertyAccess(user, filters.property_id);
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`dq.property_id = $${params.length}`);
      } else {
        params.push(user.id);
        conditions.push(`(dq.property_id = (SELECT property_id FROM users WHERE id = $${params.length}) 
          OR dq.property_id IN (SELECT property_id FROM user_property_assignments WHERE user_id = $${params.length}))`);
      }
    } else {
      // General Staff or Receptionist can ONLY view queries issued to them
      params.push(user.id);
      conditions.push(`dq.staff_user_id = $${params.length}`);
    }

    if (filters.status && filters.status !== 'all') {
      params.push(filters.status.toUpperCase());
      conditions.push(`dq.status = $${params.length}`);
    }

    if (filters.staff_user_id) {
      params.push(parseInt(filters.staff_user_id, 10));
      conditions.push(`dq.staff_user_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        dq.*,
        p.name AS property_name,
        p.code AS property_code,
        u_staff.name AS staff_name,
        u_staff.email AS staff_email,
        u_iss.name AS issued_by_name,
        u_iss.role AS issued_by_role,
        u_appr.name AS sanction_approved_by_name
      FROM disciplinary_queries dq
      JOIN properties p ON dq.property_id = p.id
      JOIN users u_staff ON dq.staff_user_id = u_staff.id
      JOIN users u_iss ON dq.issued_by_id = u_iss.id
      LEFT JOIN users u_appr ON dq.sanction_approved_by_id = u_appr.id
      ${whereClause}
      ORDER BY dq.id DESC;
    `;

    return pool.query(sql, params);
  }

  /**
   * Get single query by ID
   */
  static async getQueryById(user, id) {
    this.assertNotOwner(user);

    const sql = `
      SELECT 
        dq.*,
        p.name AS property_name,
        p.code AS property_code,
        u_staff.name AS staff_name,
        u_staff.email AS staff_email,
        u_iss.name AS issued_by_name,
        u_iss.role AS issued_by_role,
        u_appr.name AS sanction_approved_by_name
      FROM disciplinary_queries dq
      JOIN properties p ON dq.property_id = p.id
      JOIN users u_staff ON dq.staff_user_id = u_staff.id
      JOIN users u_iss ON dq.issued_by_id = u_iss.id
      LEFT JOIN users u_appr ON dq.sanction_approved_by_id = u_appr.id
      WHERE dq.id = $1
      LIMIT 1;
    `;

    const rows = await pool.query(sql, [id]);
    if (!rows || rows.length === 0) {
      throw new NotFoundError('Disciplinary query not found.');
    }

    const query = rows[0];
    const role = (user.role || '').toUpperCase();

    if (['STAFF', 'RECEPTIONIST'].includes(role) && query.staff_user_id !== user.id) {
      throw new ForbiddenError('Access denied: You can only view your own queries.');
    }
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      await this.verifyManagerPropertyAccess(user, query.property_id);
    }

    // Mark as VIEWED if staff member is reading it for the first time
    if (query.staff_user_id === user.id && query.status === 'ISSUED') {
      await pool.query(
        "UPDATE disciplinary_queries SET status = 'VIEWED', viewed_at = CURRENT_TIMESTAMP WHERE id = $1;",
        [id]
      );
      query.status = 'VIEWED';
      query.viewed_at = new Date();
    }

    return query;
  }

  /**
   * Staff submits formal explanation / rebuttal
   */
  static async submitQueryResponse(user, id, responseData) {
    const query = await this.getQueryById(user, id);

    if (query.staff_user_id !== user.id) {
      throw new ForbiddenError('Only the staff member to whom the query was issued can submit a response.');
    }

    const { staff_response } = responseData;
    if (!staff_response || staff_response.trim().length === 0) {
      throw new BadRequestError('Response explanation is required.');
    }

    const updateSql = `
      UPDATE disciplinary_queries 
      SET status = 'RESPONDED', staff_response = $2, staff_responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, [id, staff_response]);
    const [updated] = await pool.query('SELECT * FROM disciplinary_queries WHERE id = ?', [id]);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'DISCIPLINARY_QUERY_RESPONDED',
      entityType: 'disciplinary_query',
      entityId: String(id),
      newValues: { staff_responded_at: updated.staff_responded_at },
    });

    return updated;
  }

  /**
   * Conclude query with managerial outcome assessment and sanction approval
   */
  static async concludeQuery(user, id, outcomeData) {
    this.assertNotOwner(user);

    const query = await this.getQueryById(user, id);
    const role = (user.role || '').toUpperCase();

    if (!['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only managers and administrators can assess query outcomes.');
    }

    await this.verifyManagerPropertyAccess(user, query.property_id);

    const { outcome_decision, outcome_notes, manager_assessment } = outcomeData;

    const validDecisions = [
      'DISMISSED',
      'EXONERATED',
      'COACHING_GUIDANCE',
      'PIP_INITIATED',
      'VERBAL_WARNING',
      'WRITTEN_WARNING',
      'FINAL_WARNING',
      'SUSPENSION',
      'TERMINATION',
    ];

    if (!validDecisions.includes(outcome_decision)) {
      throw new BadRequestError(`Invalid outcome decision. Allowed: ${validDecisions.join(', ')}`);
    }

    // High-impact sanctions require Admin / Super Admin authorization
    const requiresAdminApproval = ['WRITTEN_WARNING', 'FINAL_WARNING', 'SUSPENSION', 'TERMINATION'].includes(outcome_decision);

    let status = 'RESOLVED';
    let sanctionApprovedById = null;
    let sanctionApprovedAt = null;

    if (requiresAdminApproval) {
      if (['SUPER_ADMIN', 'ADMIN'].includes(role)) {
        sanctionApprovedById = user.id;
        sanctionApprovedAt = new Date();
        status = 'SANCTION_APPROVED';
      } else {
        // Manager submitted a formal sanction recommendation; status is UNDER_REVIEW pending Admin approval
        status = 'UNDER_REVIEW';
      }
    }

    const updateSql = `
      UPDATE disciplinary_queries 
      SET status = $2, outcome_decision = $3, outcome_notes = $4,
          manager_assessment = $5, sanction_approved_by_id = $6,
          sanction_approved_at = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, [
      id,
      status,
      outcome_decision,
      outcome_notes,
      manager_assessment,
      sanctionApprovedById,
      sanctionApprovedAt,
    ]);

    const [updated] = await pool.query('SELECT * FROM disciplinary_queries WHERE id = ?', [id]);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: `QUERY_CONCLUDED_${outcome_decision}`,
      entityType: 'disciplinary_query',
      entityId: String(id),
      newValues: { outcome_decision, status },
    });

    return updated;
  }

  /**
   * Admin approve or reject pending formal sanction
   */
  static async reviewSanction(adminUser, id, decision, reviewNotes) {
    const role = (adminUser.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      throw new ForbiddenError('Only company administrators can approve or reject formal disciplinary sanctions.');
    }

    const query = await this.getQueryById(adminUser, id);
    const newStatus = decision === 'APPROVE' ? 'SANCTION_APPROVED' : 'SANCTION_REJECTED';

    const updateSql = `
      UPDATE disciplinary_queries 
      SET status = $2, sanction_approved_by_id = $3, sanction_approved_at = CURRENT_TIMESTAMP,
          outcome_notes = COALESCE(outcome_notes, '') || E'\\n[Admin Review]: ' || $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, [id, newStatus, adminUser.id, reviewNotes || decision]);
    const [reviewed] = await pool.query('SELECT * FROM disciplinary_queries WHERE id = ?', [id]);
    return reviewed;
  }

  /**
   * Create Performance Improvement Plan (PIP) or Positive Recognition
   */
  static async createPip(user, data) {
    this.assertNotOwner(user);

    const role = (user.role || '').toUpperCase();
    if (!['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only managers and administrators can create improvement plans or recognition.');
    }

    const {
      staff_user_id,
      property_id,
      linked_query_id = null,
      concerns_summary,
      improvement_objectives,
      coaching_training_plan,
      start_date,
      review_date,
      is_positive_recognition = false,
      recognition_title = null,
    } = data;

    if (!staff_user_id || !property_id || !concerns_summary || !improvement_objectives || !coaching_training_plan || !start_date || !review_date) {
      throw new BadRequestError('staff_user_id, property_id, concerns_summary, improvement_objectives, coaching_training_plan, start_date, and review_date are required.');
    }

    await this.verifyManagerPropertyAccess(user, property_id);

    const pipCode = await this.generatePipCode();

    const insertSql = `
      INSERT INTO performance_improvement_plans (
        pip_code, staff_user_id, manager_id, property_id, linked_query_id,
        concerns_summary, improvement_objectives, coaching_training_plan,
        start_date, review_date, status, is_positive_recognition, recognition_title
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11, $12
      ) RETURNING *;
    `;

    const insertRes = await pool.query(insertSql, [
      pipCode,
      staff_user_id,
      user.id,
      property_id,
      linked_query_id,
      concerns_summary,
      improvement_objectives,
      coaching_training_plan,
      start_date,
      review_date,
      Boolean(is_positive_recognition),
      recognition_title,
    ]);

    const createdId = insertRes.insertId || insertRes.rows?.[0]?.id || (Array.isArray(insertRes) ? insertRes[0]?.id : null);
    const [createdPip] = await pool.query('SELECT * FROM performance_improvement_plans WHERE id = ?', [createdId]);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: is_positive_recognition ? 'POSITIVE_RECOGNITION_RECORDED' : 'PIP_CREATED',
      entityType: 'performance_improvement_plan',
      entityId: String(createdPip.id),
      newValues: { pipCode, staffId: staff_user_id, is_positive_recognition },
    });

    return createdPip;
  }

  /**
   * List Performance Improvement Plans & Positive Recognitions
   */
  static async listPips(user, filters = {}) {
    this.assertNotOwner(user);

    const role = (user.role || '').toUpperCase();
    const params = [];
    const conditions = [];

    if (['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`pip.property_id = $${params.length}`);
      }
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        await this.verifyManagerPropertyAccess(user, filters.property_id);
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`pip.property_id = $${params.length}`);
      } else {
        params.push(user.id);
        conditions.push(`(pip.property_id = (SELECT property_id FROM users WHERE id = $${params.length}) 
          OR pip.property_id IN (SELECT property_id FROM user_property_assignments WHERE user_id = $${params.length}))`);
      }
    } else {
      params.push(user.id);
      conditions.push(`pip.staff_user_id = $${params.length}`);
    }

    if (filters.status && filters.status !== 'all') {
      params.push(filters.status.toUpperCase());
      conditions.push(`pip.status = $${params.length}`);
    }

    if (filters.is_positive_recognition !== undefined) {
      params.push(filters.is_positive_recognition === 'true' || filters.is_positive_recognition === true);
      conditions.push(`pip.is_positive_recognition = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        pip.*,
        p.name AS property_name,
        p.code AS property_code,
        u_staff.name AS staff_name,
        u_staff.email AS staff_email,
        u_mgr.name AS manager_name
      FROM performance_improvement_plans pip
      JOIN properties p ON pip.property_id = p.id
      JOIN users u_staff ON pip.staff_user_id = u_staff.id
      JOIN users u_mgr ON pip.manager_id = u_mgr.id
      ${whereClause}
      ORDER BY pip.id DESC;
    `;

    return pool.query(sql, params);
  }

  /**
   * Update PIP status / follow-up evaluation
   */
  static async updatePip(user, id, updateData) {
    this.assertNotOwner(user);

    const role = (user.role || '').toUpperCase();
    if (!['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only managers and administrators can update improvement plans.');
    }

    const { status, follow_up_notes } = updateData;
    const allowed = ['ACTIVE', 'UNDER_REVIEW', 'SUCCESSFULLY_COMPLETED', 'EXTENDED', 'UNRESOLVED_ESCALATED'];

    if (status && !allowed.includes(status)) {
      throw new BadRequestError(`Invalid PIP status. Allowed: ${allowed.join(', ')}`);
    }

    const updateSql = `
      UPDATE performance_improvement_plans 
      SET status = COALESCE($2, status),
          follow_up_notes = COALESCE($3, follow_up_notes),
          completed_at = CASE WHEN $2 IN ('SUCCESSFULLY_COMPLETED', 'UNRESOLVED_ESCALATED') THEN CURRENT_TIMESTAMP ELSE completed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, [id, status, follow_up_notes]);
    const [updated] = await pool.query('SELECT * FROM performance_improvement_plans WHERE id = ?', [id]);
    if (!updated) {
      throw new NotFoundError('PIP not found.');
    }

    return updated;
  }
}

module.exports = DisciplinaryAndPipService;
