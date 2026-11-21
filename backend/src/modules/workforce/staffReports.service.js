/**
 * Staff-Submitted Operational Reports Service
 * BFA Apartments Management System
 *
 * Implements human-authored staff reports (work completion, maintenance observations,
 * incidents, guest service issues), manager review workflows, and immutable auditability.
 */

const pool = require('../../db/pool');
const AuditService = require('../../core/audit/audit.service');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');

class StaffReportsService {
  /**
   * Enforce Manager property scope
   */
  static async verifyManagerPropertyAccess(user, propertyId) {
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
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
    return false;
  }

  /**
   * Generate sequential report code: SREP-YYYYMM-XXXX
   */
  static async generateReportCode() {
    const now = new Date();
    const prefix = `SREP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM staff_operational_reports WHERE report_code LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Submit an operational report
   */
  static async submitReport(user, data) {
    const {
      property_id,
      assignment_id = null,
      task_id = null,
      report_type = 'DAILY_ACTIVITY',
      summary,
      details,
      materials_used = null,
    } = data;

    if (!property_id || !summary || !details) {
      throw new BadRequestError('property_id, summary, and details are required.');
    }

    const validTypes = [
      'DAILY_ACTIVITY',
      'WORK_COMPLETION',
      'MAINTENANCE_OBSERVATION',
      'INCIDENT',
      'GUEST_SERVICE',
      'CLARIFICATION_COMPLAINT',
    ];

    if (!validTypes.includes(report_type)) {
      throw new BadRequestError(`Invalid report_type. Allowed: ${validTypes.join(', ')}`);
    }

    const reportCode = await this.generateReportCode();

    const insertSql = `
      INSERT INTO staff_operational_reports (
        report_code, staff_user_id, property_id, assignment_id, task_id,
        report_type, summary, details, materials_used, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'SUBMITTED'
      ) RETURNING *;
    `;

    const insertRes = await pool.query(insertSql, [
      reportCode,
      user.id,
      property_id,
      assignment_id,
      task_id,
      report_type,
      summary,
      details,
      materials_used,
    ]);

    const createdId = insertRes.insertId || insertRes.rows?.[0]?.id || (Array.isArray(insertRes) ? insertRes[0]?.id : null);
    const [createdReport] = await pool.query('SELECT * FROM staff_operational_reports WHERE id = ?', [createdId]);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'STAFF_REPORT_SUBMITTED',
      entityType: 'staff_operational_report',
      entityId: String(createdReport.id),
      newValues: { reportCode, report_type, propertyId: property_id },
    });

    return createdReport;
  }

  /**
   * List staff operational reports with role filtering
   */
  static async listStaffReports(user, filters = {}) {
    const role = (user.role || '').toUpperCase();
    const params = [];
    const conditions = [];

    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`sor.property_id = $${params.length}`);
      }
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (filters.property_id && filters.property_id !== 'all') {
        await this.verifyManagerPropertyAccess(user, filters.property_id);
        params.push(parseInt(filters.property_id, 10));
        conditions.push(`sor.property_id = $${params.length}`);
      } else {
        params.push(user.id);
        conditions.push(`(sor.property_id = (SELECT property_id FROM users WHERE id = $${params.length}) 
          OR sor.property_id IN (SELECT property_id FROM user_property_assignments WHERE user_id = $${params.length}))`);
      }
    } else {
      // Staff member sees only their own reports
      params.push(user.id);
      conditions.push(`sor.staff_user_id = $${params.length}`);
    }

    if (filters.status && filters.status !== 'all') {
      params.push(filters.status.toUpperCase());
      conditions.push(`sor.status = $${params.length}`);
    }

    if (filters.report_type && filters.report_type !== 'all') {
      params.push(filters.report_type.toUpperCase());
      conditions.push(`sor.report_type = $${params.length}`);
    }

    if (filters.staff_user_id) {
      params.push(parseInt(filters.staff_user_id, 10));
      conditions.push(`sor.staff_user_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        sor.*,
        p.name AS property_name,
        p.code AS property_code,
        u_staff.name AS staff_name,
        u_staff.email AS staff_email,
        u_mgr.name AS manager_name
      FROM staff_operational_reports sor
      JOIN properties p ON sor.property_id = p.id
      JOIN users u_staff ON sor.staff_user_id = u_staff.id
      LEFT JOIN users u_mgr ON sor.manager_id = u_mgr.id
      ${whereClause}
      ORDER BY sor.id DESC;
    `;

    return pool.query(sql, params);
  }

  /**
   * Get single report by ID
   */
  static async getReportById(user, id) {
    const sql = `
      SELECT 
        sor.*,
        p.name AS property_name,
        p.code AS property_code,
        u_staff.name AS staff_name,
        u_staff.email AS staff_email,
        u_mgr.name AS manager_name
      FROM staff_operational_reports sor
      JOIN properties p ON sor.property_id = p.id
      JOIN users u_staff ON sor.staff_user_id = u_staff.id
      LEFT JOIN users u_mgr ON sor.manager_id = u_mgr.id
      WHERE sor.id = $1
      LIMIT 1;
    `;

    const rows = await pool.query(sql, [id]);
    if (!rows || rows.length === 0) {
      throw new NotFoundError('Report not found.');
    }

    const report = rows[0];
    const role = (user.role || '').toUpperCase();

    if (['STAFF', 'RECEPTIONIST'].includes(role) && report.staff_user_id !== user.id) {
      throw new ForbiddenError('Access denied: You can only view your own reports.');
    }
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      await this.verifyManagerPropertyAccess(user, report.property_id);
    }

    return report;
  }

  /**
   * Manager reviews staff report
   */
  static async reviewStaffReport(managerUser, id, reviewData) {
    const report = await this.getReportById(managerUser, id);
    const role = (managerUser.role || '').toUpperCase();

    if (!['MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only managers and administrators can review staff reports.');
    }

    await this.verifyManagerPropertyAccess(managerUser, report.property_id);

    const { status, manager_feedback } = reviewData;
    const allowed = ['UNDER_REVIEW', 'CLARIFICATION_REQUIRED', 'RETURNED_FOR_CORRECTION', 'REVIEWED', 'FINALISED'];
    if (!allowed.includes(status)) {
      throw new BadRequestError(`Invalid status. Allowed: ${allowed.join(', ')}`);
    }

    // Crucial rule: original statement is NEVER modified; manager feedback is recorded separately
    const updateSql = `
      UPDATE staff_operational_reports 
      SET status = $2, manager_id = $3, manager_feedback = $4,
          manager_reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    await pool.query(updateSql, [id, status, managerUser.id, manager_feedback]);
    const [updated] = await pool.query('SELECT * FROM staff_operational_reports WHERE id = ?', [id]);

    await AuditService.record({
      actorId: managerUser.id,
      actorEmail: managerUser.email,
      actorRole: managerUser.role,
      action: `STAFF_REPORT_${status}`,
      entityType: 'staff_operational_report',
      entityId: String(id),
      newValues: { status, manager_feedback },
    });

    return updated;
  }
}

module.exports = StaffReportsService;
