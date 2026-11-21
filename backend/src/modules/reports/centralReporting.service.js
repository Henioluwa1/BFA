/**
 * Central Operational Reporting Engine Service
 * BFA Apartments Management System
 *
 * Implements unified operational data collection using Africa/Lagos date boundaries,
 * role-scoped Daily and Monthly reports (Staff, Manager, Admin, Owner),
 * custom reports, report request workflows, immutable snapshot ledger, and professional multi-page PDF generation.
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

class CentralReportingService {
  /**
   * Helper to format UTC Date into Africa/Lagos date bounds
   */
  static getLagosDateBounds(dateStr) {
    // If dateStr is provided (YYYY-MM-DD), anchor to Lagos midnight
    const target = dateStr ? new Date(`${dateStr}T00:00:00+01:00`) : new Date();
    const startOfDay = new Date(target);
    startOfDay.setUTCHours(0, 0, 0, 0); // Normalized
    const endOfDay = new Date(target);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const formattedDate = target.toISOString().split('T')[0];
    return { startOfDay, endOfDay, formattedDate };
  }

  /**
   * Enforce tenant isolation for Manager & Staff roles
   */
  static resolvePropertyScope(user, requestedPropertyId) {
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      if (requestedPropertyId && requestedPropertyId !== 'all') {
        return parseInt(requestedPropertyId, 10);
      }
      return null; // Company-wide
    }
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (!user.propertyId) {
        throw new ForbiddenError('Manager is not assigned to any property.');
      }
      return parseInt(user.propertyId, 10);
    }
    return user.propertyId ? parseInt(user.propertyId, 10) : null;
  }

  /**
   * Generate sequential report reference: REP-YYYYMMDD-ROLE-XXXX
   */
  static async generateReportReference(roleTarget, dateStr) {
    const cleanDate = (dateStr || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    const prefix = `REP-${cleanDate}-${roleTarget.substring(0, 3)}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM operational_reports_ledger WHERE report_reference LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Generate sequential report request code: REQ-YYYYMM-XXXX
   */
  static async generateRequestReference() {
    const now = new Date();
    const prefix = `REQ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM operational_report_requests WHERE request_reference LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Get Role-Tailored Daily Operational Report
   */
  static async getDailyReport(user, targetDateStr = null, propertyIdParam = null) {
    const role = (user.role || '').toUpperCase();
    const effectivePropId = this.resolvePropertyScope(user, propertyIdParam);
    const { startOfDay, endOfDay, formattedDate } = this.getLagosDateBounds(targetDateStr);

    const isStaff = ['STAFF', 'RECEPTIONIST'].includes(role);
    const isManager = ['MANAGER', 'OPERATIONS_MANAGER'].includes(role);
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role);
    const isOwner = role === 'OWNER';

    // 1. Operational Tasks in Date Range
    let taskParams = [startOfDay, endOfDay];
    let taskPropFilter = '';
    if (isStaff) {
      taskParams.push(user.id);
      taskPropFilter = ` AND assigned_to_id = $${taskParams.length}`;
    } else if (effectivePropId) {
      taskParams.push(effectivePropId);
      taskPropFilter = ` AND property_id = $${taskParams.length}`;
    }

    const taskRows = await pool.query(
      `SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending,
        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) AS in_progress,
        COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) AS blocked,
        COUNT(CASE WHEN status NOT IN ('COMPLETED', 'CANCELLED') AND due_date < CURRENT_TIMESTAMP THEN 1 END) AS overdue
       FROM operational_tasks
       WHERE created_at BETWEEN $1 AND $2 ${taskPropFilter};`,
      taskParams
    );

    // 2. Roster Property Assignments in Date Range
    let asgParams = [startOfDay, endOfDay];
    let asgPropFilter = '';
    if (isStaff) {
      asgParams.push(user.id);
      asgPropFilter = ` AND staff_user_id = $${asgParams.length}`;
    } else if (effectivePropId) {
      asgParams.push(effectivePropId);
      asgPropFilter = ` AND property_id = $${asgParams.length}`;
    }

    const asgRows = await pool.query(
      `SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'ACCEPTED' THEN 1 END) AS accepted,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) AS rejected,
        COUNT(CASE WHEN status = 'CLARIFICATION_REQUESTED' THEN 1 END) AS clarification
       FROM roster_property_assignments
       WHERE created_at BETWEEN $1 AND $2 ${asgPropFilter};`,
      asgParams
    );

    // 3. Receptionist Bookings & Front Desk Activity
    let bookingParams = [startOfDay, endOfDay];
    let bookingPropFilter = '';
    if (effectivePropId) {
      bookingParams.push(effectivePropId);
      bookingPropFilter = ` AND property_id = $${bookingParams.length}`;
    }

    const bookingRows = await pool.query(
      `SELECT 
        COUNT(*) AS total_bookings,
        COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END) AS confirmed,
        COUNT(CASE WHEN status = 'CHECKED_IN' THEN 1 END) AS checked_in,
        COUNT(CASE WHEN status = 'CHECKED_OUT' THEN 1 END) AS checked_out,
        COALESCE(SUM(total_amount), 0) AS total_booking_value
       FROM reservations
       WHERE created_at BETWEEN $1 AND $2 ${bookingPropFilter};`,
      bookingParams
    );

    // 4. Maintenance & Inspections
    let maintParams = [startOfDay, endOfDay];
    let maintPropFilter = '';
    if (effectivePropId) {
      maintParams.push(effectivePropId);
      maintPropFilter = ` AND property_id = $${maintParams.length}`;
    }

    const maintRows = await pool.query(
      `SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS resolved,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending
       FROM maintenance_requests
       WHERE created_at BETWEEN $1 AND $2 ${maintPropFilter};`,
      maintParams
    );

    // 5. Staff-Submitted Reports
    let reportParams = [startOfDay, endOfDay];
    let reportPropFilter = '';
    if (isStaff) {
      reportParams.push(user.id);
      reportPropFilter = ` AND staff_user_id = $${reportParams.length}`;
    } else if (effectivePropId) {
      reportParams.push(effectivePropId);
      reportPropFilter = ` AND property_id = $${reportParams.length}`;
    }

    const staffReportsRows = await pool.query(
      `SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'FINALISED' THEN 1 END) AS finalised,
        COUNT(CASE WHEN status = 'UNDER_REVIEW' THEN 1 END) AS under_review
       FROM staff_operational_reports
       WHERE created_at BETWEEN $1 AND $2 ${reportPropFilter};`,
      reportParams
    );

    // 6. Directives Execution (Admin / Manager / Owner)
    let directivesSummary = null;
    if (!isStaff) {
      const dirRows = await pool.query(
        `SELECT 
          COUNT(*) AS total,
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed,
          COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) AS in_progress
         FROM operational_directives;`
      );
      directivesSummary = {
        total: parseInt(dirRows[0]?.total || 0, 10),
        completed: parseInt(dirRows[0]?.completed || 0, 10),
        inProgress: parseInt(dirRows[0]?.in_progress || 0, 10),
      };
    }

    // 7. Property-by-Property Breakdown (Admin and Owner)
    let propertyBreakdown = [];
    if (isAdmin || isOwner) {
      const propBreakdownRows = await pool.query(
        `SELECT 
          p.id, p.name, p.code,
          (SELECT COUNT(*) FROM reservations r WHERE r.property_id = p.id AND r.created_at BETWEEN $1 AND $2) AS bookings_count,
          (SELECT COUNT(*) FROM operational_tasks ot WHERE ot.property_id = p.id AND ot.created_at BETWEEN $1 AND $2) AS tasks_count,
          (SELECT COUNT(*) FROM operational_tasks ot WHERE ot.property_id = p.id AND ot.status = 'COMPLETED' AND ot.created_at BETWEEN $1 AND $2) AS completed_tasks_count,
          (SELECT COUNT(*) FROM maintenance_requests mr WHERE mr.property_id = p.id AND mr.created_at BETWEEN $1 AND $2) AS maintenance_count
         FROM properties p
         ORDER BY p.name ASC;`,
        [startOfDay, endOfDay]
      );
      propertyBreakdown = propBreakdownRows || [];
    }

    const t = taskRows[0] || {};
    const a = asgRows[0] || {};
    const b = bookingRows[0] || {};
    const m = maintRows[0] || {};
    const sr = staffReportsRows[0] || {};

    return {
      reportType: 'DAILY',
      reportingDate: formattedDate,
      roleTarget: role,
      effectivePropertyId: effectivePropId,
      timezone: 'Africa/Lagos (WAT)',
      summary: {
        totalTasks: parseInt(t.total || 0, 10),
        completedTasks: parseInt(t.completed || 0, 10),
        pendingTasks: parseInt(t.pending || 0, 10),
        blockedTasks: parseInt(t.blocked || 0, 10),
        overdueTasks: parseInt(t.overdue || 0, 10),
        totalAssignments: parseInt(a.total || 0, 10),
        acceptedAssignments: parseInt(a.accepted || 0, 10),
        totalBookings: parseInt(b.total_bookings || 0, 10),
        checkins: parseInt(b.checked_in || 0, 10),
        checkouts: parseInt(b.checked_out || 0, 10),
        maintenanceCount: parseInt(m.total || 0, 10),
        staffReportsSubmitted: parseInt(sr.total || 0, 10),
      },
      directivesSummary,
      propertyBreakdown,
    };
  }

  /**
   * Get Role-Tailored Monthly Operational Report
   */
  static async getMonthlyReport(user, year, month, propertyIdParam = null) {
    const role = (user.role || '').toUpperCase();
    const effectivePropId = this.resolvePropertyScope(user, propertyIdParam);

    const y = parseInt(year || new Date().getFullYear(), 10);
    const m = parseInt(month || new Date().getMonth() + 1, 10);

    const startOfMonth = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const isStaff = ['STAFF', 'RECEPTIONIST'].includes(role);
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role);
    const isOwner = role === 'OWNER';

    // 1. Task aggregates for the month
    let taskParams = [startOfMonth, endOfMonth];
    let taskPropFilter = '';
    if (isStaff) {
      taskParams.push(user.id);
      taskPropFilter = ` AND assigned_to_id = $${taskParams.length}`;
    } else if (effectivePropId) {
      taskParams.push(effectivePropId);
      taskPropFilter = ` AND property_id = $${taskParams.length}`;
    }

    const taskRows = await pool.query(
      `SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed,
        COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) AS blocked,
        COUNT(CASE WHEN status NOT IN ('COMPLETED', 'CANCELLED') AND due_date < CURRENT_TIMESTAMP THEN 1 END) AS overdue
       FROM operational_tasks
       WHERE created_at BETWEEN $1 AND $2 ${taskPropFilter};`,
      taskParams
    );

    // 2. Reservation aggregates for the month
    let bookingParams = [startOfMonth, endOfMonth];
    let bookingPropFilter = '';
    if (effectivePropId) {
      bookingParams.push(effectivePropId);
      bookingPropFilter = ` AND property_id = $${bookingParams.length}`;
    }

    const bookingRows = await pool.query(
      `SELECT 
        COUNT(*) AS total_bookings,
        COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END) AS confirmed,
        COUNT(CASE WHEN status = 'CHECKED_IN' THEN 1 END) AS checkins,
        COUNT(CASE WHEN status = 'CHECKED_OUT' THEN 1 END) AS checkouts
       FROM reservations
       WHERE created_at BETWEEN $1 AND $2 ${bookingPropFilter};`,
      bookingParams
    );

    // 3. Property comparison breakdown for Admin and Owner
    let propertyComparisons = [];
    if (isAdmin || isOwner) {
      const propRows = await pool.query(
        `SELECT 
          p.id, p.name, p.code,
          (SELECT COUNT(*) FROM reservations r WHERE r.property_id = p.id AND r.created_at BETWEEN $1 AND $2) AS monthly_bookings,
          (SELECT COUNT(*) FROM operational_tasks ot WHERE ot.property_id = p.id AND ot.created_at BETWEEN $1 AND $2) AS monthly_tasks,
          (SELECT COUNT(*) FROM operational_tasks ot WHERE ot.property_id = p.id AND ot.status = 'COMPLETED' AND ot.created_at BETWEEN $1 AND $2) AS completed_tasks,
          (SELECT COUNT(*) FROM maintenance_requests mr WHERE mr.property_id = p.id AND mr.created_at BETWEEN $1 AND $2) AS maintenance_requests
         FROM properties p
         ORDER BY monthly_bookings DESC;`,
        [startOfMonth, endOfMonth]
      );
      propertyComparisons = propRows || [];
    }

    const t = taskRows[0] || {};
    const b = bookingRows[0] || {};

    return {
      reportType: 'MONTHLY',
      year: y,
      month: m,
      roleTarget: role,
      effectivePropertyId: effectivePropId,
      timezone: 'Africa/Lagos (WAT)',
      summary: {
        totalTasks: parseInt(t.total || 0, 10),
        completedTasks: parseInt(t.completed || 0, 10),
        blockedTasks: parseInt(t.blocked || 0, 10),
        overdueTasks: parseInt(t.overdue || 0, 10),
        totalBookings: parseInt(b.total_bookings || 0, 10),
        confirmedBookings: parseInt(b.confirmed || 0, 10),
        checkins: parseInt(b.checkins || 0, 10),
        checkouts: parseInt(b.checkouts || 0, 10),
      },
      propertyComparisons,
    };
  }

  /**
   * Save finalized report snapshot into immutable ledger
   */
  static async finalizeReportSnapshot(user, data) {
    const {
      reporting_period_type = 'DAILY',
      reporting_date,
      end_date = null,
      role_target,
      property_id = null,
      title,
      content_snapshot,
      parent_report_id = null,
      correction_reason = null,
    } = data;

    if (!reporting_date || !role_target || !title || !content_snapshot) {
      throw new BadRequestError('reporting_date, role_target, title, and content_snapshot are required.');
    }

    const reportRef = await this.generateReportReference(role_target, reporting_date);

    // Compute version number
    let versionNumber = 1;
    if (parent_report_id) {
      const parentRes = await pool.query('SELECT version_number FROM operational_reports_ledger WHERE id = $1 LIMIT 1;', [parent_report_id]);
      if (parentRes && parentRes.length > 0) {
        versionNumber = parseInt(parentRes[0].version_number || 1, 10) + 1;
      }
    }

    const insertSql = `
      INSERT INTO operational_reports_ledger (
        report_reference, reporting_period_type, reporting_date, end_date,
        role_target, target_user_id, property_id, title, content_snapshot,
        version_number, parent_report_id, correction_reason, is_finalised,
        generated_by_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, $13
      ) RETURNING *;
    `;

    const insertRes = await pool.query(insertSql, [
      reportRef,
      reporting_period_type,
      reporting_date,
      end_date,
      role_target,
      user.id,
      property_id,
      title,
      typeof content_snapshot === 'string' ? content_snapshot : JSON.stringify(content_snapshot),
      versionNumber,
      parent_report_id,
      correction_reason,
      user.id,
    ]);

    const createdId = insertRes.insertId || insertRes.rows?.[0]?.id || (Array.isArray(insertRes) ? insertRes[0]?.id : null);
    const [createdLedger] = await pool.query('SELECT * FROM operational_reports_ledger WHERE id = ?', [createdId]);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'REPORT_SNAPSHOT_FINALISED',
      entityType: 'operational_reports_ledger',
      entityId: String(createdLedger.id),
      newValues: { reportRef, versionNumber, role_target },
    });

    return createdLedger;
  }

  /**
   * Request a Report (Owner -> Admin/Manager, Admin -> Manager, Manager -> Staff)
   */
  static async requestReport(user, data) {
    const { recipient_id, property_id = null, reporting_period, instructions = null, due_date = null } = data;

    if (!recipient_id || !reporting_period) {
      throw new BadRequestError('recipient_id and reporting_period are required.');
    }

    const requestRef = await this.generateRequestReference();

    const insertSql = `
      INSERT INTO operational_report_requests (
        request_reference, requested_by_id, recipient_id, property_id,
        reporting_period, instructions, due_date, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'PENDING'
      ) RETURNING *;
    `;

    const insertRes = await pool.query(insertSql, [
      requestRef,
      user.id,
      recipient_id,
      property_id,
      reporting_period,
      instructions,
      due_date,
    ]);

    const createdId = insertRes.insertId || insertRes.rows?.[0]?.id || (Array.isArray(insertRes) ? insertRes[0]?.id : null);
    const [createdReq] = await pool.query('SELECT * FROM operational_report_requests WHERE id = ?', [createdId]);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'OPERATIONAL_REPORT_REQUESTED',
      entityType: 'operational_report_request',
      entityId: String(createdReq.id),
      newValues: { requestRef, recipientId: recipient_id, reporting_period },
    });

    return createdReq;
  }

  /**
   * List report requests for active user
   */
  static async listReportRequests(user) {
    const sql = `
      SELECT 
        orr.*,
        u_req.name AS requested_by_name,
        u_req.role AS requested_by_role,
        u_rec.name AS recipient_name,
        p.name AS property_name
      FROM operational_report_requests orr
      JOIN users u_req ON orr.requested_by_id = u_req.id
      JOIN users u_rec ON orr.recipient_id = u_rec.id
      LEFT JOIN properties p ON orr.property_id = p.id
      WHERE orr.recipient_id = $1 OR orr.requested_by_id = $1
      ORDER BY orr.id DESC;
    `;

    return pool.query(sql, [user.id]);
  }

  /**
   * Professional Multi-Page PDF Document Generation for Daily/Monthly Reports
   */
  static async generateReportPdf(reportData, title = 'OPERATIONAL PERFORMANCE REPORT') {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        // Multi-page page numbering
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).fillColor('#94a3b8').text(
            `Page ${i + 1} of ${range.count} — Authoritative BFA Operational Governance`,
            40,
            800,
            { align: 'center', width: 515 }
          );
        }
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      // Branding Header
      doc.fillColor('#1e293b').fontSize(18).font('Helvetica-Bold').text('BFA APARTMENTS', { align: 'center' });
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('Central Operational Governance & Management System', { align: 'center' });
      doc.moveDown(0.5);
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1);

      // Report Header Box
      doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text(title, { align: 'left' });
      doc.fontSize(9).font('Helvetica').fillColor('#64748b')
        .text(`Generated: ${new Date().toLocaleString()} (WAT) | Period: ${reportData.reportingDate || `${reportData.month}/${reportData.year}` || 'All Time'}`);
      doc.moveDown(1);

      // Summary KPI Grid
      doc.rect(40, doc.y, 515, 60).fill('#f8fafc').strokeColor('#e2e8f0');
      const startY = doc.y - 50;

      const summary = reportData.summary || {};
      const kpis = [
        ['Total Tasks', String(summary.totalTasks || 0)],
        ['Completed Tasks', String(summary.completedTasks || 0)],
        ['Overdue Tasks', String(summary.overdueTasks || 0)],
        ['Total Bookings', String(summary.totalBookings || 0)],
        ['Check-Ins', String(summary.checkins || 0)],
      ];

      kpis.forEach(([label, val], idx) => {
        const x = 50 + (idx * 100);
        doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text(label, x, startY, { width: 95, align: 'center' });
        doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(val, x, startY + 16, { width: 95, align: 'center' });
      });

      doc.moveDown(3);

      // Property Breakdown Section (if available)
      if (reportData.propertyBreakdown && reportData.propertyBreakdown.length > 0) {
        doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('PROPERTY OPERATIONAL BREAKDOWN:');
        doc.moveDown(0.5);

        // Table Header
        const tableTop = doc.y;
        doc.rect(40, tableTop, 515, 20).fill('#e2e8f0');
        doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold');
        doc.text('PROPERTY', 50, tableTop + 5, { width: 140 });
        doc.text('BOOKINGS', 200, tableTop + 5, { width: 70, align: 'center' });
        doc.text('TASKS TOTAL', 280, tableTop + 5, { width: 80, align: 'center' });
        doc.text('TASKS DONE', 370, tableTop + 5, { width: 80, align: 'center' });
        doc.text('MAINTENANCE', 460, tableTop + 5, { width: 80, align: 'center' });

        let currentY = tableTop + 20;

        reportData.propertyBreakdown.forEach((p, idx) => {
          const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(40, currentY, 515, 18).fill(bg);
          doc.fillColor('#0f172a').fontSize(8).font('Helvetica');
          doc.text(p.name, 50, currentY + 4, { width: 140 });
          doc.text(String(p.bookings_count || 0), 200, currentY + 4, { width: 70, align: 'center' });
          doc.text(String(p.tasks_count || 0), 280, currentY + 4, { width: 80, align: 'center' });
          doc.text(String(p.completed_tasks_count || 0), 370, currentY + 4, { width: 80, align: 'center' });
          doc.text(String(p.maintenance_count || 0), 460, currentY + 4, { width: 80, align: 'center' });
          currentY += 18;
        });
      }

      doc.end();
    });
  }
}

module.exports = CentralReportingService;
