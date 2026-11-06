const WorkforceRepository = require('./workforce.repository');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ForbiddenError, NotFoundError, ConflictError } = require('../../core/errors/apiError');
const pool = require('../../db/pool');

class LeaveService {
  static async resolveEmployeeFromUser(user) {
    if (!user) throw new ForbiddenError('Authentication required.');
    const rows = await pool.query('SELECT * FROM employees WHERE user_id = ?', [user.id]);
    if (rows.length === 0) {
      throw new NotFoundError(`No employee record linked to user account '${user.email}'.`);
    }
    return rows[0];
  }

  static async listCategories() {
    return WorkforceRepository.listLeaveCategories();
  }

  static async getLeaveBalances(employeeId, user) {
    // Staff can only view their own balance; Manager can view property staff; Admin/Owner can view all
    if (user.role === 'STAFF') {
      const self = await this.resolveEmployeeFromUser(user);
      if (String(self.id) !== String(employeeId)) {
        throw new ForbiddenError('You can only view your own leave balances.');
      }
    }
    return WorkforceRepository.getLeaveBalances(employeeId);
  }

  static async submitLeaveRequest(data, user, req = null) {
    if (!data.leave_category_id || !data.start_date || !data.end_date || !data.reason) {
      throw new ValidationError('leave_category_id, start_date, end_date, and reason are required.');
    }

    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (start > end) {
      throw new ValidationError('start_date cannot be later than end_date.');
    }

    const employee = await this.resolveEmployeeFromUser(user);
    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);

    // Verify leave category
    const category = await WorkforceRepository.getLeaveCategoryById(data.leave_category_id);
    if (!category) {
      throw new NotFoundError(`Leave category #${data.leave_category_id} not found.`);
    }

    // Check leave balance if paid leave
    if (category.is_paid) {
      const balances = await WorkforceRepository.getLeaveBalances(employee.id, start.getFullYear());
      const catBal = balances.find((b) => b.leave_category_id === category.id);
      const remaining = catBal ? parseFloat(catBal.remaining_days) : category.default_days_per_year;
      if (totalDays > remaining) {
        throw new ValidationError(`Insufficient leave balance: Requested ${totalDays} day(s), but only ${remaining} day(s) remain in your ${category.name} balance.`);
      }
    }

    const requestCode = `LV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const requestId = await WorkforceRepository.createLeaveRequest({
      request_code: requestCode,
      employee_id: employee.id,
      property_id: employee.property_id || user.propertyId || 1,
      leave_category_id: data.leave_category_id,
      start_date: data.start_date,
      end_date: data.end_date,
      total_days: totalDays,
      reason: data.reason,
      document_url: data.document_url || null,
      status: totalDays > 5 ? 'PENDING_ADMIN' : 'PENDING_MANAGER', // Escalate automatically if > 5 days
    });

    // Update pending days in balance
    await WorkforceRepository.updateLeaveBalance(employee.id, data.leave_category_id, start.getFullYear(), {
      pendingDaysDelta: totalDays,
    });

    const created = await WorkforceRepository.getLeaveRequestById(requestId);

    await AuditService.record({
      req,
      action: 'LEAVE_REQUESTED',
      entityType: 'leave_request',
      entityId: String(requestId),
      newValues: {
        request_code: requestCode,
        employee_id: employee.id,
        category: category.name,
        start_date: data.start_date,
        end_date: data.end_date,
        total_days: totalDays,
      },
    });

    return created;
  }

  static async reviewLeaveRequest(id, { action, notes }, user, req = null) {
    const leave = await WorkforceRepository.getLeaveRequestById(id);
    if (!leave) {
      throw new NotFoundError(`Leave request #${id} not found.`);
    }

    // Maker-checker policy: Employees cannot approve their own leave
    const empRows = await pool.query('SELECT id FROM employees WHERE user_id = ?', [user.id]);
    if (empRows.length > 0 && empRows[0].id === leave.employee_id) {
      throw new ForbiddenError('Maker-checker violation: You cannot approve your own leave request.');
    }

    const role = (user.role || '').toUpperCase();
    const isOpsManager = role === 'OPERATIONS_MANAGER' || role === 'MANAGER';
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role) && !isOpsManager) {
      throw new ForbiddenError('Unauthorized to review leave requests.');
    }

    // Property scoping for Operations Managers
    if (isOpsManager) {
      if (user.propertyId && String(user.propertyId) !== String(leave.property_id)) {
        throw new ForbiddenError(`You can only review leave requests for your assigned Property #${user.propertyId}.`);
      }

      // DEF-B11 Remediation: Enforce strict 5-day approval ceiling.
      // Operations Managers may approve requests of 1–5 days inclusive.
      // Requests exceeding 5 days (including 6-14 days and 15+ days) require Administrator approval.
      if (action === 'APPROVED') {
        if (leave.total_days > 5) {
          throw new ForbiddenError(
            `Leave request of ${leave.total_days} days exceeds Operations Manager delegated authority limit of 5 days. Requests exceeding 5 days must be ESCALATED to Administrator.`
          );
        }
        if (leave.status === 'PENDING_ADMIN') {
          throw new ForbiddenError(
            `Leave request has status PENDING_ADMIN and requires Administrator approval. Operations Managers cannot approve requests pending Administrator review.`
          );
        }
      }
    }

    const validActions = ['APPROVED', 'REJECTED', 'ESCALATED'];
    if (!validActions.includes(action)) {
      throw new ValidationError('Action must be APPROVED, REJECTED, or ESCALATED.');
    }

    let finalStatus = leave.status;
    const updateData = {};

    if (isOpsManager) {
      updateData.manager_reviewed_by_id = user.id;
      updateData.manager_decision = action;
      updateData.manager_notes = notes;
      updateData.manager_reviewed_at = new Date();

      if (action === 'APPROVED') {
        finalStatus = 'APPROVED';
      } else if (action === 'REJECTED') {
        finalStatus = 'REJECTED';
      } else if (action === 'ESCALATED') {
        finalStatus = 'PENDING_ADMIN';
      }
    } else {
      // ADMIN or OWNER
      updateData.admin_reviewed_by_id = user.id;
      updateData.admin_decision = action === 'ESCALATED' ? 'APPROVED' : action;
      updateData.admin_notes = notes;
      updateData.admin_reviewed_at = new Date();
      finalStatus = action === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    }

    updateData.status = finalStatus;
    await WorkforceRepository.updateLeaveRequest(id, updateData);

    const year = new Date(leave.start_date).getFullYear();

    // Adjust leave balances
    if (finalStatus === 'APPROVED') {
      await WorkforceRepository.updateLeaveBalance(leave.employee_id, leave.leave_category_id, year, {
        usedDaysDelta: leave.total_days,
        pendingDaysDelta: -leave.total_days,
      });

      // Prevent conflicting shift assignments on approved leave dates:
      // Flag or cancel shifts scheduled for this employee during approved leave
      await pool.query(
        `UPDATE shifts SET status = 'CANCELLED', notes = CONCAT(COALESCE(notes, ''), ' [Cancelled: Employee Approved Leave ', ?) 
         WHERE employee_id = ? AND shift_date BETWEEN ? AND ? AND status NOT IN ('COMPLETED', 'CANCELLED')`,
        [leave.request_code, leave.employee_id, leave.start_date, leave.end_date]
      );
    } else if (finalStatus === 'REJECTED') {
      // Release pending days
      await WorkforceRepository.updateLeaveBalance(leave.employee_id, leave.leave_category_id, year, {
        pendingDaysDelta: -leave.total_days,
      });
    }

    await AuditService.record({
      req,
      action: `LEAVE_${finalStatus}`,
      entityType: 'leave_request',
      entityId: String(id),
      oldValues: { status: leave.status },
      newValues: { status: finalStatus, reviewer_id: user.id, decision_notes: notes },
    });

    return WorkforceRepository.getLeaveRequestById(id);
  }

  static async escalateLeaveRequest(id, { reason }, user, req = null) {
    const leave = await WorkforceRepository.getLeaveRequestById(id);
    if (!leave) throw new NotFoundError(`Leave request #${id} not found.`);

    const role = (user.role || '').toUpperCase();
    const isOpsManager = role === 'OPERATIONS_MANAGER' || role === 'MANAGER';
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role) && !isOpsManager) {
      throw new ForbiddenError('Unauthorized to escalate leave requests.');
    }

    if (isOpsManager && user.propertyId && String(user.propertyId) !== String(leave.property_id)) {
      throw new ForbiddenError(`You can only escalate leave requests for your assigned Property #${user.propertyId}.`);
    }

    await WorkforceRepository.updateLeaveRequest(id, {
      status: 'PENDING_ADMIN',
      manager_reviewed_by_id: user.id,
      manager_decision: 'ESCALATED',
      manager_notes: reason,
      manager_reviewed_at: new Date(),
    });

    await AuditService.record({
      req,
      action: 'LEAVE_ESCALATED',
      entityType: 'leave_request',
      entityId: String(id),
      newValues: { status: 'PENDING_ADMIN', manager_id: user.id, escalation_reason: reason },
    });

    return WorkforceRepository.getLeaveRequestById(id);
  }
}

module.exports = LeaveService;

