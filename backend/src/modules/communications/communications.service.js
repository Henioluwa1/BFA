const pool = require('../../db/pool');
const { ValidationError, ForbiddenError, NotFoundError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');

class CommunicationsService {
  /**
   * List communications with role filtering, status filters, and property scope
   */
  static async listCommunications({ status, type, propertyId, user, page = 1, pageSize = 50 } = {}) {
    let sql = `
      SELECT 
        c.*, 
        u.name as author_name, 
        u.email as author_email,
        p.name as property_name,
        (SELECT COUNT(*) FROM communication_recipients cr WHERE cr.communication_id = c.id) as recipient_count
      FROM communications c
      LEFT JOIN users u ON c.author_id = u.id
      LEFT JOIN properties p ON c.property_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'ALL') {
      sql += ' AND c.status = ?';
      params.push(status);
    }
    if (type && type !== 'ALL') {
      sql += ' AND c.type = ?';
      params.push(type);
    }
    if (propertyId && propertyId !== 'all') {
      sql += ' AND (c.property_id = ? OR c.property_id IS NULL)';
      params.push(propertyId);
    }

    sql += ' ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?';
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
    params.push(limit, offset);

    return pool.query(sql, params);
  }

  /**
   * Get single communication with recipients and approval history
   */
  static async getCommunicationById(id) {
    const rows = await pool.query(
      `SELECT c.*, u.name as author_name, u.email as author_email, p.name as property_name
       FROM communications c
       LEFT JOIN users u ON c.author_id = u.id
       LEFT JOIN properties p ON c.property_id = p.id
       WHERE c.id = ?`,
      [id]
    );
    if (rows.length === 0) throw new NotFoundError(`Communication #${id} not found.`);
    const communication = rows[0];

    const recipients = await pool.query('SELECT * FROM communication_recipients WHERE communication_id = ?', [id]);
    const approvals = await pool.query(
      `SELECT a.*, u.name as reviewer_name, u.email as reviewer_email 
       FROM communication_approvals a 
       LEFT JOIN users u ON a.reviewer_id = u.id 
       WHERE a.communication_id = ? ORDER BY a.created_at DESC`,
      [id]
    );

    return { ...communication, recipients, approvals };
  }

  /**
   * Create a new communication (DRAFT or SUBMITTED)
   */
  static async createCommunication({
    title,
    subject,
    content,
    body,
    type = 'INTERNAL_MEMO',
    priority = 'MEDIUM',
    propertyId = null,
    recipients = [{ recipient_type: 'ALL' }],
    scheduledAt = null,
    submitForApproval = false,
    user,
    req = null,
  }) {
    const cleanTitle = (title || subject || '').trim();
    const cleanContent = (content || body || '').trim();

    if (!cleanTitle || !cleanContent) {
      throw new ValidationError('Communication title and content are mandatory.');
    }

    const initialStatus = submitForApproval ? 'PENDING_APPROVAL' : 'DRAFT';

    const result = await pool.query(
      `INSERT INTO communications (title, content, type, status, priority, author_id, author_role, property_id, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanTitle,
        cleanContent,
        type,
        initialStatus,
        priority,
        user.id,
        user.role,
        propertyId && propertyId !== 'all' ? propertyId : null,
        scheduledAt || null,
      ]
    );

    const commId = result.insertId;

    // Insert recipients
    for (const r of recipients) {
      await pool.query(
        `INSERT INTO communication_recipients (communication_id, recipient_type, recipient_id, recipient_role)
         VALUES (?, ?, ?, ?)`,
        [commId, r.recipient_type || 'ALL', r.recipient_id || null, r.recipient_role || null]
      );
    }

    if (submitForApproval) {
      await pool.query(
        `INSERT INTO communication_approvals (communication_id, reviewer_id, reviewer_role, action, notes)
         VALUES (?, ?, ?, 'SUBMIT', 'Submitted for administrative approval')`,
        [commId, user.id, user.role]
      );

      // Notify approver roles (Admin, Owner, Super Admin)
      await pool.query(
        `INSERT INTO notifications (recipient_role, title, message, category, priority, source_entity_type, source_entity_id, link_url)
         VALUES ('ADMIN', 'New Communication Pending Approval', ?, 'APPROVAL', 'HIGH', 'communication', ?, '/app/communications')`,
        [`A new communication "${title.trim()}" (${type}) has been submitted by ${user.name || user.email} and awaits approval.`, String(commId)]
      );
    }

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: submitForApproval ? 'COMMUNICATION_SUBMITTED' : 'COMMUNICATION_CREATED',
      entityType: 'communication',
      entityId: String(commId),
      newValues: { title, type, status: initialStatus, priority },
    });

    return {
      success: true,
      message: submitForApproval
        ? 'Communication submitted for management approval.'
        : 'Communication draft saved successfully.',
      id: commId,
      communicationId: commId,
      title: cleanTitle,
      subject: cleanTitle,
      status: initialStatus,
    };
  }

  /**
   * Submit draft communication for approval
   */
  static async submitCommunication(id, user, req = null) {
    const comm = await this.getCommunicationById(id);
    if (comm.status !== 'DRAFT') {
      throw new ValidationError(`Communication #${id} cannot be submitted from status '${comm.status}'.`);
    }

    await pool.query("UPDATE communications SET status = 'PENDING_APPROVAL' WHERE id = ?", [id]);

    await pool.query(
      `INSERT INTO communication_approvals (communication_id, reviewer_id, reviewer_role, action, notes)
       VALUES (?, ?, ?, 'SUBMIT', 'Submitted for review')`,
      [id, user.id, user.role]
    );

    // Notify approver roles
    await pool.query(
      `INSERT INTO notifications (recipient_role, title, message, category, priority, source_entity_type, source_entity_id, link_url)
       VALUES ('ADMIN', 'Communication Pending Approval', ?, 'APPROVAL', 'HIGH', 'communication', ?, '/app/communications')`,
      [`Communication "${comm.title}" has been submitted for approval.`, String(id)]
    );

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'COMMUNICATION_SUBMITTED',
      entityType: 'communication',
      entityId: String(id),
      newValues: { status: 'PENDING_APPROVAL' },
    });

    return {
      success: true,
      message: `Communication #${id} submitted for approval.`,
      id: parseInt(id, 10),
      status: 'PENDING_APPROVAL',
    };
  }

  /**
   * Approve a communication (Admin, Owner, Super Admin)
   */
  static async approveCommunication(id, user, notes = '', req = null) {
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenError('Only Admin, Owner, or Super Admin can approve communications.');
    }

    const comm = await this.getCommunicationById(id);
    if (comm.status !== 'PENDING_APPROVAL' && comm.status !== 'SUBMITTED') {
      throw new ValidationError(`Communication #${id} is not pending approval (currently ${comm.status}).`);
    }

    await pool.query("UPDATE communications SET status = 'APPROVED' WHERE id = ?", [id]);

    await pool.query(
      `INSERT INTO communication_approvals (communication_id, reviewer_id, reviewer_role, action, notes)
       VALUES (?, ?, ?, 'APPROVE', ?)`,
      [id, user.id, user.role, notes || 'Approved for broadcast']
    );

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'COMMUNICATION_APPROVED',
      entityType: 'communication',
      entityId: String(id),
      newValues: { status: 'APPROVED', notes },
    });

    return {
      success: true,
      message: `Communication #${id} has been approved.`,
      id: parseInt(id, 10),
      status: 'APPROVED',
    };
  }

  /**
   * Reject a communication with notes
   */
  static async rejectCommunication(id, user, notes = '', req = null) {
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenError('Only Admin, Owner, or Super Admin can reject communications.');
    }

    const comm = await this.getCommunicationById(id);
    if (comm.status !== 'PENDING_APPROVAL' && comm.status !== 'SUBMITTED') {
      throw new ValidationError(`Communication #${id} is not pending approval (currently ${comm.status}).`);
    }

    await pool.query("UPDATE communications SET status = 'REJECTED' WHERE id = ?", [id]);

    await pool.query(
      `INSERT INTO communication_approvals (communication_id, reviewer_id, reviewer_role, action, notes)
       VALUES (?, ?, ?, 'REJECT', ?)`,
      [id, user.id, user.role, notes || 'Rejected by reviewer']
    );

    // Notify author
    if (comm.author_id) {
      await pool.query(
        `INSERT INTO notifications (recipient_id, title, message, category, priority, source_entity_type, source_entity_id, link_url)
         VALUES (?, 'Communication Rejected', ?, 'COMMUNICATION', 'HIGH', 'communication', ?, '/app/communications')`,
        [comm.author_id, `Your communication "${comm.title}" was rejected. Reviewer notes: ${notes || 'None'}`, String(id)]
      );
    }

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'COMMUNICATION_REJECTED',
      entityType: 'communication',
      entityId: String(id),
      newValues: { status: 'REJECTED', notes },
    });

    return {
      success: true,
      message: `Communication #${id} was rejected.`,
      id: parseInt(id, 10),
      status: 'REJECTED',
    };
  }

  /**
   * Send / Broadcast an approved communication
   */
  static async sendCommunication(id, user, req = null) {
    if (!['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenError('You are not authorized to send communications.');
    }

    const comm = await this.getCommunicationById(id);
    if (comm.status !== 'APPROVED' && comm.status !== 'DRAFT') {
      // If user is Admin or Super Admin and sending their own draft directly
      if (!['ADMIN', 'SUPER_ADMIN', 'OWNER'].includes(user.role)) {
        throw new ValidationError(`Communication #${id} must be approved prior to sending.`);
      }
    }

    await pool.query(
      "UPDATE communications SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id]
    );

    // Fan-out notifications to intended recipients
    for (const r of comm.recipients) {
      let recipientRole = r.recipient_role;
      if (r.recipient_type === 'ALL_STAFF') recipientRole = 'STAFF';
      if (r.recipient_type === 'ALL') recipientRole = null; // broadcast to all

      await pool.query(
        `INSERT INTO notifications (recipient_id, recipient_role, property_id, title, message, category, priority, source_entity_type, source_entity_id, link_url)
         VALUES (?, ?, ?, ?, ?, 'COMMUNICATION', ?, 'communication', ?, '/app/communications')`,
        [
          r.recipient_id || null,
          recipientRole,
          comm.property_id || null,
          comm.title,
          comm.content.substring(0, 200),
          comm.priority,
          String(id),
        ]
      );
    }

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'COMMUNICATION_SENT',
      entityType: 'communication',
      entityId: String(id),
      newValues: { status: 'SENT', sentAt: new Date().toISOString() },
    });

    return {
      success: true,
      message: `Communication #${id} has been broadcast successfully.`,
      id: parseInt(id, 10),
      status: 'SENT',
    };
  }

  /**
   * List templates
   */
  static async listTemplates() {
    return pool.query('SELECT * FROM communication_templates ORDER BY name ASC');
  }

  /**
   * Create template
   */
  static async createTemplate({ name, type, subjectTemplate, bodyTemplate, user }) {
    const result = await pool.query(
      `INSERT INTO communication_templates (name, type, subject_template, body_template, created_by_id)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), type, subjectTemplate.trim(), bodyTemplate.trim(), user.id]
    );
    return { success: true, templateId: result.insertId };
  }
}

module.exports = CommunicationsService;
