/**
 * Roster Property Assignment Service
 * BFA Apartments Management System
 *
 * Implements property and building staff assignments, flexible classifications,
 * lifecycle state transitions (Draft -> Sent -> Delivered -> Viewed -> Accepted/Rejected/Clarification -> Completed),
 * emergency Admin override audit, automatic chat dispatch, and PDF generation.
 */

const pool = require('../../db/pool');
const PDFDocument = require('pdfkit');
const AuditService = require('../../core/audit/audit.service');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');
const ChatService = require('../chat/chat.service');

class RosterAssignmentService {
  /**
   * Enforce Manager property boundary.
   * Super Admin and Admin have company-wide authority.
   * Managers can ONLY manage properties assigned to them.
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
      // Check multi-property assignment table
      const res = await pool.query(
        'SELECT 1 FROM user_property_assignments WHERE user_id = $1 AND property_id = $2 LIMIT 1;',
        [user.id, targetPropId]
      );
      if (res && res.length > 0) {
        return true;
      }
      throw new ForbiddenError('Access denied: You are not authorized to manage staff for this property.');
    }
    throw new ForbiddenError('Access denied: Only managers and administrators can assign staff.');
  }

  /**
   * Generate a unique sequential assignment reference code: ASG-YYYYMM-XXXX
   */
  static async generateAssignmentCode() {
    const now = new Date();
    const prefix = `ASG-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM roster_property_assignments WHERE assignment_code LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Create a new Roster Property Assignment
   */
  static async createAssignment(assignorUser, data) {
    const {
      staff_user_id,
      property_id,
      classification = 'GENERAL_STAFF',
      duty_category,
      start_date,
      end_date,
      start_time = null,
      end_time = null,
      priority = 'NORMAL',
      instructions,
      is_admin_override = false,
      override_reason = null,
      acceptance_deadline_at = null,
    } = data;

    if (!staff_user_id || !property_id || !duty_category || !start_date || !end_date || !instructions) {
      throw new BadRequestError('Missing required fields: staff_user_id, property_id, duty_category, start_date, end_date, instructions.');
    }

    if (new Date(end_date) < new Date(start_date)) {
      throw new BadRequestError('Assignment end_date cannot be earlier than start_date.');
    }

    // Role boundary checks
    const role = (assignorUser.role || '').toUpperCase();
    if (role === 'ADMIN' && is_admin_override) {
      if (!override_reason || override_reason.trim().length < 5) {
        throw new BadRequestError('A detailed reason is required for Admin Emergency Direct Assignment Override.');
      }
    } else {
      await this.verifyManagerPropertyAccess(assignorUser, property_id);
    }

    // Verify staff user exists and is active
    const staffRes = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1 LIMIT 1;', [staff_user_id]);
    if (!staffRes || staffRes.length === 0) {
      throw new NotFoundError('Target staff user does not exist.');
    }
    const staffUser = staffRes[0];

    // Verify property exists
    const propRes = await pool.query('SELECT id, name, code, address, city FROM properties WHERE id = $1 LIMIT 1;', [property_id]);
    if (!propRes || propRes.length === 0) {
      throw new NotFoundError('Target property does not exist.');
    }
    const property = propRes[0];

    // Check for conflicting overlapping active assignments for the same staff member
    const overlapRes = await pool.query(
      `SELECT id, assignment_code, property_id, start_date, end_date 
       FROM roster_property_assignments 
       WHERE staff_user_id = $1 
         AND status IN ('SENT', 'DELIVERED', 'VIEWED', 'ACCEPTED')
         AND (start_date <= $2 AND end_date >= $3)
       LIMIT 1;`,
      [staff_user_id, end_date, start_date]
    );

    if (overlapRes && overlapRes.length > 0) {
      const existing = overlapRes[0];
      throw new BadRequestError(
        `Staff member already has an active assignment (${existing.assignment_code}) overlapping this duration (${existing.start_date} to ${existing.end_date}).`
      );
    }

    const assignmentCode = await this.generateAssignmentCode();

    const insertSql = `
      INSERT INTO roster_property_assignments (
        assignment_code, staff_user_id, property_id, assigned_by_id,
        classification, duty_category, start_date, end_date,
        start_time, end_time, priority, instructions,
        status, is_admin_override, override_reason,
        acceptance_deadline_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SENT', $13, $14, $15
      ) RETURNING *;
    `;

    const insertRes = await pool.query(insertSql, [
      assignmentCode,
      staff_user_id,
      property_id,
      assignorUser.id,
      classification,
      duty_category,
      start_date,
      end_date,
      start_time,
      end_time,
      priority,
      instructions,
      Boolean(is_admin_override),
      override_reason,
      acceptance_deadline_at,
    ]);

    const createdId = insertRes.insertId || insertRes.rows?.[0]?.id || (Array.isArray(insertRes) ? insertRes[0]?.id : null);
    const [createdAssignment] = await pool.query('SELECT * FROM roster_property_assignments WHERE id = ?', [createdId]);

    // If Admin Emergency Override was used, log into permanent audit table
    if (is_admin_override) {
      const overrideCode = `OVR-${Date.now()}`;
      await pool.query(
        `INSERT INTO admin_assignment_overrides (
          override_code, admin_user_id, target_staff_user_id, property_id, reason, assignment_reference
        ) VALUES ($1, $2, $3, $4, $5, $6);`,
        [overrideCode, assignorUser.id, staff_user_id, property_id, override_reason, assignmentCode]
      );
    }

    // Record system audit log
    await AuditService.record({
      actorId: assignorUser.id,
      actorEmail: assignorUser.email,
      actorRole: assignorUser.role,
      action: is_admin_override ? 'ADMIN_OVERRIDE_STAFF_ASSIGNMENT' : 'STAFF_ASSIGNMENT_CREATED',
      entityType: 'roster_property_assignment',
      entityId: String(createdAssignment.id),
      newValues: {
        code: assignmentCode,
        staffId: staff_user_id,
        propertyId: property_id,
        classification,
        start_date,
        end_date,
      },
    });

    // Automatically send structured assignment notice via internal chat (marked IMPORTANT)
    try {
      const directThread = await ChatService.findOrCreateDirectThread(assignorUser, staff_user_id);
      if (directThread && directThread.id) {
        const timeDisplay = start_time && end_time ? ` (${start_time} - ${end_time})` : '';
        const msgContent = `📋 [OFFICIAL ROSTER ASSIGNMENT NOTICE - ${assignmentCode}]\n` +
          `Property: ${property.name}\n` +
          `Classification: ${classification === 'RECEPTIONIST' ? 'Receptionist' : 'General Staff'}\n` +
          `Duty: ${duty_category}\n` +
          `Duration: ${start_date} to ${end_date}${timeDisplay}\n` +
          `Priority: ${priority}\n` +
          `Assigned By: ${assignorUser.name} (${assignorUser.role})\n` +
          `Instructions: ${instructions}\n\n` +
          `Please open your schedule or click this notice to Accept or submit Clarification.`;

        await ChatService.sendMessage(assignorUser, {
          threadId: directThread.id,
          messageType: 'TEXT',
          content: msgContent,
          priority: 'IMPORTANT',
          contextEntityType: 'ROSTER_ASSIGNMENT',
          contextEntityId: createdAssignment.id,
        });
      }
    } catch (chatErr) {
      logger.warn(`Failed to auto-dispatch assignment notice via chat: ${chatErr.message}`);
    }

    return createdAssignment;
  }

  /**
   * List assignments with tenant and role-based isolation
   */
  static async listAssignments(user, filters = {}) {
    const role = (user.role || '').toUpperCase();
    const params = [];
    const conditions = [];

    // Role-based visibility scoping
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`rpa.property_id = $${params.length}`);
      }
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        await this.verifyManagerPropertyAccess(user, filters.property_id);
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`rpa.property_id = $${params.length}`);
      } else {
        // Restrict to manager's primary or assigned properties
        params.push(user.id);
        conditions.push(`(rpa.property_id = (SELECT property_id FROM users WHERE id = $${params.length}) 
          OR rpa.property_id IN (SELECT property_id FROM user_property_assignments WHERE user_id = $${params.length}))`);
      }
    } else {
      // General Staff or Receptionist can only view their own assignments
      params.push(user.id);
      conditions.push(`rpa.staff_user_id = $${params.length}`);
    }

    if (filters.status && filters.status !== 'all') {
      params.push(filters.status.toUpperCase());
      conditions.push(`rpa.status = $${params.length}`);
    }

    if (filters.classification && filters.classification !== 'all') {
      params.push(filters.classification.toUpperCase());
      conditions.push(`rpa.classification = $${params.length}`);
    }

    if (filters.staff_user_id) {
      params.push(parseInt(filters.staff_user_id, 10));
      conditions.push(`rpa.staff_user_id = $${params.length}`);
    }

    if (filters.start_date) {
      params.push(filters.start_date);
      conditions.push(`rpa.end_date >= $${params.length}`);
    }

    if (filters.end_date) {
      params.push(filters.end_date);
      conditions.push(`rpa.start_date <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        rpa.*,
        p.name AS property_name,
        p.code AS property_code,
        p.city AS property_city,
        u_staff.name AS staff_name,
        u_staff.email AS staff_email,
        u_mgr.name AS assigned_by_name,
        u_mgr.role AS assigned_by_role
      FROM roster_property_assignments rpa
      JOIN properties p ON rpa.property_id = p.id
      JOIN users u_staff ON rpa.staff_user_id = u_staff.id
      JOIN users u_mgr ON rpa.assigned_by_id = u_mgr.id
      ${whereClause}
      ORDER BY rpa.start_date DESC, rpa.id DESC;
    `;

    return pool.query(sql, params);
  }

  /**
   * Get assignment by ID with authorization verification
   */
  static async getAssignmentById(user, id) {
    const sql = `
      SELECT 
        rpa.*,
        p.name AS property_name,
        p.code AS property_code,
        p.address AS property_address,
        p.city AS property_city,
        u_staff.name AS staff_name,
        u_staff.email AS staff_email,
        u_mgr.name AS assigned_by_name,
        u_mgr.role AS assigned_by_role
      FROM roster_property_assignments rpa
      JOIN properties p ON rpa.property_id = p.id
      JOIN users u_staff ON rpa.staff_user_id = u_staff.id
      JOIN users u_mgr ON rpa.assigned_by_id = u_mgr.id
      WHERE rpa.id = $1
      LIMIT 1;
    `;

    const rows = await pool.query(sql, [id]);
    if (!rows || rows.length === 0) {
      throw new NotFoundError('Assignment not found.');
    }

    const assignment = rows[0];
    const role = (user.role || '').toUpperCase();

    // Verify view permissions
    if (['STAFF', 'RECEPTIONIST'].includes(role) && assignment.staff_user_id !== user.id) {
      throw new ForbiddenError('Access denied: You can only view your own assignments.');
    }
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      await this.verifyManagerPropertyAccess(user, assignment.property_id);
    }

    // Mark as VIEWED if staff member is opening it for the first time
    if (assignment.staff_user_id === user.id && assignment.status === 'SENT') {
      await pool.query(
        "UPDATE roster_property_assignments SET status = 'VIEWED', viewed_at = CURRENT_TIMESTAMP WHERE id = $1;",
        [id]
      );
      assignment.status = 'VIEWED';
      assignment.viewed_at = new Date();
    }

    return assignment;
  }

  /**
   * Update assignment lifecycle status
   * Supported transitions: ACCEPTED, REJECTED, CLARIFICATION_REQUESTED, RESPOND_CLARIFICATION, CANCELLED, COMPLETED
   */
  static async updateAssignmentStatus(user, id, action, payload = {}) {
    const assignment = await this.getAssignmentById(user, id);
    const role = (user.role || '').toUpperCase();

    if (['ACCEPTED', 'REJECTED', 'CLARIFICATION_REQUESTED'].includes(action)) {
      // Must be the assigned staff member
      if (assignment.staff_user_id !== user.id && !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
        throw new ForbiddenError('Only the assigned staff member can accept, reject, or request clarification.');
      }
    }

    let updateSql = '';
    const params = [id];

    if (action === 'ACCEPTED') {
      updateSql = `
        UPDATE roster_property_assignments 
        SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *;
      `;
    } else if (action === 'REJECTED') {
      const reason = (payload.rejection_reason || '').trim();
      if (!reason) {
        throw new BadRequestError('A reason must be provided when rejecting an assignment.');
      }
      params.push(reason);
      updateSql = `
        UPDATE roster_property_assignments 
        SET status = 'REJECTED', rejected_at = CURRENT_TIMESTAMP, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *;
      `;
    } else if (action === 'CLARIFICATION_REQUESTED') {
      const text = (payload.clarification_text || '').trim();
      if (!text) {
        throw new BadRequestError('Clarification details or questions are required.');
      }
      params.push(text);
      updateSql = `
        UPDATE roster_property_assignments 
        SET status = 'CLARIFICATION_REQUESTED', clarification_requested_at = CURRENT_TIMESTAMP, 
            clarification_text = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *;
      `;
    } else if (action === 'RESPOND_CLARIFICATION') {
      // Manager or Admin responding to clarification
      if (!['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
        throw new ForbiddenError('Only a Manager or Administrator can respond to clarification requests.');
      }
      const resp = (payload.manager_response || '').trim();
      if (!resp) {
        throw new BadRequestError('Response text is required.');
      }
      params.push(resp);
      updateSql = `
        UPDATE roster_property_assignments 
        SET status = 'SENT', manager_response = $2, manager_responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *;
      `;
    } else if (action === 'CANCELLED') {
      if (!['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
        throw new ForbiddenError('Only a Manager or Administrator can cancel an assignment.');
      }
      updateSql = `
        UPDATE roster_property_assignments 
        SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *;
      `;
    } else if (action === 'COMPLETED') {
      updateSql = `
        UPDATE roster_property_assignments 
        SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *;
      `;
    } else {
      throw new BadRequestError(`Invalid action: ${action}`);
    }

    await pool.query(updateSql, params);
    const [updated] = await pool.query('SELECT * FROM roster_property_assignments WHERE id = ?', [id]);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: `ASSIGNMENT_STATUS_${action}`,
      entityType: 'roster_property_assignment',
      entityId: String(id),
      newValues: { status: updated.status, action },
    });

    return updated;
  }

  /**
   * Generate Professional Assignment Notice PDF Document
   */
  static async generateAssignmentNoticePdf(user, id) {
    const assignment = await this.getAssignmentById(user, id);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header Branding
      doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold').text('BFA APARTMENTS', { align: 'center' });
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Hospitality & Workforce Operations Management', { align: 'center' });
      doc.moveDown(0.5);
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Title & Reference
      doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text('OFFICIAL ROSTER ASSIGNMENT NOTICE', { align: 'left' });
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`Reference: ${assignment.assignment_code}`);
      doc.text(`Issue Date: ${new Date(assignment.created_at).toLocaleDateString()}`);
      doc.moveDown(1);

      // Status Badge Banner
      const statusColor = assignment.status === 'ACCEPTED' ? '#16a34a' : assignment.status === 'REJECTED' ? '#dc2626' : '#2563eb';
      doc.rect(50, doc.y, 495, 26).fill(statusColor);
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text(`STATUS: ${assignment.status}`, 60, doc.y - 20);
      doc.moveDown(1.5);

      // Assignment Details Table
      const leftCol = 50;
      const rightCol = 200;
      const details = [
        ['Assigned Staff Member:', `${assignment.staff_name} (${assignment.staff_email})`],
        ['Classification:', assignment.classification === 'RECEPTIONIST' ? 'Receptionist' : 'General Staff'],
        ['Assigned Property / Building:', `${assignment.property_name} (${assignment.property_code})`],
        ['Location:', `${assignment.property_address || ''}, ${assignment.property_city || ''}`],
        ['Duty Category:', assignment.duty_category],
        ['Assignment Period:', `${assignment.start_date} to ${assignment.end_date}`],
        ['Shift Hours:', assignment.start_time && assignment.end_time ? `${assignment.start_time} - ${assignment.end_time}` : 'Standard Operational Shift'],
        ['Priority Level:', assignment.priority],
        ['Supervising Manager:', `${assignment.assigned_by_name} (${assignment.assigned_by_role})`],
      ];

      details.forEach(([label, value]) => {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#334155').text(label, leftCol, doc.y, { width: 140 });
        doc.font('Helvetica').fillColor('#0f172a').text(value, rightCol, doc.y - 12, { width: 345 });
        doc.moveDown(0.3);
      });

      doc.moveDown(1);

      // Operational Instructions Box
      doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('OPERATIONAL INSTRUCTIONS & EXPECTED DUTIES:');
      doc.moveDown(0.3);
      doc.rect(50, doc.y, 495, 70).strokeColor('#e2e8f0').fillAndStroke('#f8fafc', '#cbd5e1');
      doc.fillColor('#1e293b').fontSize(10).font('Helvetica').text(assignment.instructions, 60, doc.y - 62, { width: 475 });
      doc.moveDown(2);

      // Signatures / Acceptance Block
      if (assignment.status === 'ACCEPTED') {
        doc.fillColor('#16a34a').fontSize(10).font('Helvetica-Bold')
          .text(`Accepted electronically by ${assignment.staff_name} on ${new Date(assignment.accepted_at).toLocaleString()}`);
      } else if (assignment.status === 'REJECTED') {
        doc.fillColor('#dc2626').fontSize(10).font('Helvetica-Bold')
          .text(`Rejected by ${assignment.staff_name} on ${new Date(assignment.rejected_at).toLocaleString()}`);
        doc.fontSize(9).font('Helvetica').text(`Reason: ${assignment.rejection_reason || 'No reason provided'}`);
      }

      // Footer
      doc.fontSize(8).fillColor('#94a3b8').text('This document is an authoritative BFA operational assignment record generated under strict enterprise compliance governance.', 50, 780, { align: 'center', width: 495 });

      doc.end();
    });
  }
}

module.exports = RosterAssignmentService;
