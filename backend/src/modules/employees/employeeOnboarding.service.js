const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');
const AuditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../../core/errors/apiError');

const ALLOWED_PROPOSED_ROLES = ['STAFF', 'RECEPTIONIST', 'MANAGER', 'OPERATIONS_MANAGER'];
const PRIVILEGED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OWNER'];

class EmployeeOnboardingService {
  static async createRequest(data, user, req = null) {
    const roleUpper = String(user?.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER'].includes(roleUpper)) {
      throw new ForbiddenError('Only Managers and Admins can submit employee onboarding requests.');
    }

    const fullName = String(data.fullName || data.full_name || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const phone = data.phone ? String(data.phone).trim() : null;
    const rawProposed = String(data.proposedRole || data.proposed_role || data.role || 'STAFF').trim().toUpperCase();
    const proposedRole = rawProposed === 'MANAGER' ? 'OPERATIONS_MANAGER' : rawProposed;
    const department = data.department ? String(data.department).trim() : 'OPERATIONS';
    const jobTitle = data.jobTitle || data.job_title ? String(data.jobTitle || data.job_title).trim() : proposedRole.replace(/_/g, ' ');
    const propertyId = data.propertyId || data.property_id ? parseInt(data.propertyId || data.property_id, 10) : (user.propertyId || null);
    const reportingManagerId = data.reportingManagerId || data.reporting_manager_id
      ? parseInt(data.reportingManagerId || data.reporting_manager_id, 10)
      : user.id;
    const notes = data.notes ? String(data.notes).trim() : null;

    if (!fullName || fullName.length < 2) {
      throw new ValidationError('Employee full name is required.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('A valid employee email address is required.');
    }
    if (PRIVILEGED_ROLES.includes(proposedRole)) {
      throw new ForbiddenError(`Role escalation blocked: Cannot propose privileged role '${proposedRole}' via employee onboarding.`);
    }
    if (!ALLOWED_PROPOSED_ROLES.includes(proposedRole)) {
      throw new ValidationError(`Invalid proposed role '${proposedRole}'. Allowed: ${ALLOWED_PROPOSED_ROLES.join(', ')}`);
    }

    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(roleUpper) && user.propertyId) {
      if (!propertyId || Number(propertyId) !== Number(user.propertyId)) {
        throw new ForbiddenError('Managers can only submit employee onboarding requests within their assigned property.');
      }
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
    if (existingUser.length > 0) {
      throw new ConflictError(`An active or existing user account with email '${email}' already exists.`);
    }

    const existingEmp = await pool.query('SELECT id FROM employees WHERE LOWER(email) = ? LIMIT 1', [email]);
    if (existingEmp.length > 0) {
      throw new ConflictError(`An employee record with email '${email}' already exists.`);
    }

    const existingPending = await pool.query(
      "SELECT id FROM employee_onboarding_requests WHERE LOWER(email) = ? AND status IN ('PENDING_ADMIN_APPROVAL', 'CHANGES_REQUESTED') LIMIT 1",
      [email]
    );
    if (existingPending.length > 0) {
      throw new ConflictError(`A pending employee onboarding request for '${email}' already exists.`);
    }

    const requestCode = `EMP-REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const insertRes = await pool.query(
      `INSERT INTO employee_onboarding_requests (
         request_code, full_name, email, phone, proposed_role, department, job_title,
         property_id, reporting_manager_id, submitted_by_id, notes, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_ADMIN_APPROVAL')`,
      [
        requestCode,
        fullName,
        email,
        phone,
        proposedRole,
        department,
        jobTitle,
        propertyId,
        reportingManagerId,
        user.id,
        notes,
      ]
    );

    const created = await this.getRequestById(insertRes.insertId, user);

    // Notify Admin & Super Admin
    for (const adminRole of ['ADMIN', 'SUPER_ADMIN']) {
      try {
        await NotificationsService.dispatchNotification({
          recipientRole: adminRole,
          title: `NEW EMPLOYEE AWAITING ADMIN APPROVAL: ${fullName}`,
          message: `${user.name || 'Manager'} submitted ${fullName} (${proposedRole}, ${department}) for onboarding approval. Review and approve before account activation.`,
          category: 'APPROVAL',
          priority: 'CRITICAL',
          sourceEntityType: 'employee_onboarding',
          sourceEntityId: String(created.id),
          linkUrl: `/app/employees?tab=onboarding&request=${created.id}`,
        });
      } catch (err) {
        // Non-blocking notification failure
      }
    }

    await AuditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'EMPLOYEE_ONBOARDING_SUBMITTED',
      entityType: 'employee_onboarding',
      entityId: String(created.id),
      newValues: { requestCode, fullName, email, proposedRole, propertyId },
    });

    return created;
  }

  static async listRequests(query = {}, user) {
    const roleUpper = String(user?.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER'].includes(roleUpper)) {
      throw new ForbiddenError('Not authorized to view employee onboarding requests.');
    }

    let sql = `
      SELECT r.*,
             p.name AS property_name,
             sub.name AS submitted_by_name, sub.role AS submitted_by_role,
             mgr.name AS reporting_manager_name,
             rev.name AS reviewed_by_name
      FROM employee_onboarding_requests r
      LEFT JOIN properties p ON r.property_id = p.id
      LEFT JOIN users sub ON r.submitted_by_id = sub.id
      LEFT JOIN users mgr ON r.reporting_manager_id = mgr.id
      LEFT JOIN users rev ON r.reviewed_by_id = rev.id
      WHERE 1=1
    `;
    const params = [];

    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(roleUpper)) {
      if (user.propertyId) {
        sql += ' AND (r.property_id = ? OR r.submitted_by_id = ?)';
        params.push(user.propertyId, user.id);
      } else {
        sql += ' AND r.submitted_by_id = ?';
        params.push(user.id);
      }
    }

    if (query.status) {
      sql += ' AND r.status = ?';
      params.push(String(query.status).toUpperCase());
    }

    sql += ' ORDER BY r.created_at DESC, r.id DESC';
    return pool.query(sql, params);
  }

  static async getRequestById(id, user) {
    const reqId = parseInt(id, 10);
    const rows = await pool.query(
      `SELECT r.*,
              p.name AS property_name,
              sub.name AS submitted_by_name, sub.role AS submitted_by_role,
              mgr.name AS reporting_manager_name,
              rev.name AS reviewed_by_name
       FROM employee_onboarding_requests r
       LEFT JOIN properties p ON r.property_id = p.id
       LEFT JOIN users sub ON r.submitted_by_id = sub.id
       LEFT JOIN users mgr ON r.reporting_manager_id = mgr.id
       LEFT JOIN users rev ON r.reviewed_by_id = rev.id
       WHERE r.id = ? LIMIT 1`,
      [reqId]
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundError(`Onboarding request #${reqId} not found.`);
    }
    const row = rows[0];
    const roleUpper = String(user?.role || '').toUpperCase();
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(roleUpper) && user.propertyId) {
      if (Number(row.property_id) !== Number(user.propertyId) && Number(row.submitted_by_id) !== Number(user.id)) {
        throw new ForbiddenError('You are not authorized to access another property onboarding request.');
      }
    }
    return row;
  }

  static async reviewRequest(id, { action, notes }, user, req = null) {
    const roleUpper = String(user?.role || '').toUpperCase();
    if (!['ADMIN', 'SUPER_ADMIN'].includes(roleUpper)) {
      throw new ForbiddenError('Only Admin or Super Admin can approve or reject employee onboarding requests.');
    }

    const normAction = String(action || '').trim().toUpperCase();
    if (!['APPROVE', 'APPROVED', 'REJECT', 'REJECTED', 'REQUEST_CHANGES', 'CHANGES_REQUESTED'].includes(normAction)) {
      throw new ValidationError("Review action must be APPROVE, REJECT, or REQUEST_CHANGES.");
    }
    const isApprove = ['APPROVE', 'APPROVED'].includes(normAction);
    const isReject = ['REJECT', 'REJECTED'].includes(normAction);
    const targetStatus = isApprove ? 'APPROVED' : isReject ? 'REJECTED' : 'CHANGES_REQUESTED';

    if ((isReject || targetStatus === 'CHANGES_REQUESTED') && (!notes || !String(notes).trim())) {
      throw new ValidationError('Review notes/reason are required when rejecting or requesting changes.');
    }

    const txResult = await pool.withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM employee_onboarding_requests WHERE id = ? FOR UPDATE', [id]);
      if (!rows || rows.length === 0) {
        throw new NotFoundError(`Onboarding request #${id} not found.`);
      }
      const r = rows[0];

      if (Number(r.submitted_by_id) === Number(user.id)) {
        throw new ForbiddenError('Self-approval violation: Submitters cannot approve their own onboarding request.');
      }
      if (r.status === 'APPROVED') {
        throw new ConflictError(`Onboarding request #${id} has already been approved.`);
      }
      if (PRIVILEGED_ROLES.includes(String(r.proposed_role || '').toUpperCase())) {
        throw new ForbiddenError('Role escalation blocked: Privileged roles cannot be provisioned via onboarding.');
      }

      let createdUserId = r.approved_user_id || null;
      let createdEmpId = r.approved_employee_id || null;

      if (isApprove) {
        // Re-check email uniqueness under lock
        const [dupUsers] = await conn.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [r.email.toLowerCase()]);
        if (dupUsers && dupUsers.length > 0) {
          throw new ConflictError(`User with email '${r.email}' already exists.`);
        }

        // Provision account with secure random credential hash (never placed in notifications/chat)
        const randomSecret = crypto.randomBytes(24).toString('hex');
        const passwordHash = await bcrypt.hash(randomSecret, 10);

        const [uIns] = await conn.query(
          `INSERT INTO users (name, email, password_hash, role, property_id, status, needs_onboarding, profile_completed)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE', TRUE, FALSE)`,
          [r.full_name, r.email.toLowerCase(), passwordHash, r.proposed_role, r.property_id || null]
        );
        createdUserId = uIns.insertId;

        const nameParts = r.full_name.trim().split(/\s+/);
        const firstName = nameParts[0] || r.full_name;
        const lastName = nameParts.slice(1).join(' ') || '-';
        const empCode = `EMP-${String(createdUserId).padStart(4, '0')}`;

        const [eIns] = await conn.query(
          `INSERT INTO employees (
             employee_code, user_id, property_id, first_name, last_name, full_name,
             email, phone, department, job_title, employment_status, hire_date,
             manager_id, profile_completed
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_DATE, ?, FALSE)`,
          [
            empCode,
            createdUserId,
            r.property_id || null,
            firstName,
            lastName,
            r.full_name,
            r.email.toLowerCase(),
            r.phone || null,
            r.department || 'OPERATIONS',
            r.job_title || r.proposed_role.replace(/_/g, ' '),
            r.reporting_manager_id || null,
          ]
        );
        createdEmpId = eIns.insertId;
      }

      await conn.query(
        `UPDATE employee_onboarding_requests
         SET status = ?,
             reviewed_by_id = ?,
             reviewed_at = CURRENT_TIMESTAMP,
             review_notes = ?,
             approved_user_id = ?,
             approved_employee_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [targetStatus, user.id, notes ? String(notes).trim() : null, createdUserId, createdEmpId, id]
      );

      return { request: r, targetStatus, createdUserId, createdEmpId };
    });

    const updated = await this.getRequestById(id, user);

    // Owner Notification on Approval (full safe details, zero credentials, idempotent via owner_notified_at)
    if (isApprove && !updated.owner_notified_at) {
      try {
        const addedDate = new Date().toISOString().slice(0, 10);
        const ownerDetails = [
          `Full Name: ${updated.full_name}`,
          `Email: ${updated.email}`,
          updated.phone ? `Phone: ${updated.phone}` : null,
          `Approved Role: ${updated.proposed_role}`,
          updated.department ? `Department: ${updated.department}` : null,
          updated.job_title ? `Position: ${updated.job_title}` : null,
          `Assigned Property: ${updated.property_name || 'Global / All Properties'}`,
          `Reporting Manager: ${updated.reporting_manager_name || updated.submitted_by_name || 'Operations Manager'}`,
          `Date Added: ${addedDate}`,
          `Approved By: ${user.name || 'Administrator'}`,
        ]
          .filter(Boolean)
          .join(' | ');

        await NotificationsService.dispatchNotification({
          recipientRole: 'OWNER',
          title: 'NEW EMPLOYEE ADDED TO BFA MANAGEMENT SYSTEM',
          message: ownerDetails,
          category: 'SYSTEM',
          priority: 'HIGH',
          sourceEntityType: 'employee',
          sourceEntityId: String(updated.approved_employee_id),
          linkUrl: `/app/employees/${updated.approved_employee_id}`,
        });

        await pool.query('UPDATE employee_onboarding_requests SET owner_notified_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      } catch (err) {
        console.warn('Owner onboarding notification failed:', err.message);
      }
    }

    // Notify submitting Manager of decision
    try {
      await NotificationsService.dispatchNotification({
        recipientId: updated.submitted_by_id,
        title: `EMPLOYEE ONBOARDING ${targetStatus}: ${updated.full_name}`,
        message: `${user.name || 'Admin'} marked onboarding request ${updated.request_code} for ${updated.full_name} as ${targetStatus}.${notes ? ` Notes: ${notes}` : ''}`,
        category: 'SYSTEM',
        priority: isApprove ? 'HIGH' : 'CRITICAL',
        sourceEntityType: 'employee_onboarding',
        sourceEntityId: String(id),
        linkUrl: isApprove && updated.approved_employee_id ? `/app/employees/${updated.approved_employee_id}` : `/app/employees?tab=onboarding`,
      });
    } catch (_) {}

    await AuditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: `EMPLOYEE_ONBOARDING_${targetStatus}`,
      entityType: 'employee_onboarding',
      entityId: String(id),
      newValues: {
        status: targetStatus,
        approvedUserId: txResult.createdUserId,
        approvedEmployeeId: txResult.createdEmpId,
      },
    });

    return updated;
  }
}

module.exports = EmployeeOnboardingService;
