const WorkforceRepository = require('./workforce.repository');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ForbiddenError, NotFoundError, ConflictError } = require('../../core/errors/apiError');
const pool = require('../../db/pool');

class RosterService {
  /**
   * Validate that the actor has authority over the given property.
   * ADMIN and OWNER have company-wide access.
   * MANAGER must match user.propertyId.
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) {
      throw new ForbiddenError('Authentication required for roster operations.');
    }
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      return;
    }
    if (role === 'OPERATIONS_MANAGER' || role === 'MANAGER') {
      if (!user.propertyId) {
        throw new ForbiddenError('Operations Manager account has no assigned property.');
      }
      if (propertyId && String(user.propertyId) !== String(propertyId)) {
        throw new ForbiddenError(`You can only manage workforce schedules for your assigned Property #${user.propertyId}.`);
      }
      return;
    }
    throw new ForbiddenError(`Role '${role}' is not authorized to configure workforce schedules.`);
  }

  // ─── Shift Templates ───────────────────────────────────────────────
  static async createTemplate(data, user, req = null) {
    if (!data.name || !data.start_time || !data.end_time) {
      throw new ValidationError('Template name, start_time, and end_time are required.');
    }
    if (data.property_id) {
      this.validatePropertyScope(user, data.property_id);
    }

    const templateId = await WorkforceRepository.createTemplate(data);
    const created = await WorkforceRepository.getTemplateById(templateId);

    await AuditService.record({
      req,
      action: 'SHIFT_TEMPLATE_CREATED',
      entityType: 'shift_template',
      entityId: String(templateId),
      newValues: created,
    });

    return created;
  }

  static async listTemplates(propertyId, user) {
    if (user && (user.role === 'OPERATIONS_MANAGER' || user.role === 'MANAGER')) {
      propertyId = user.propertyId;
    }
    return WorkforceRepository.listTemplates(propertyId);
  }

  // ─── Rosters ────────────────────────────────────────────────────────
  static async createRoster(data, user, req = null) {
    if (!data.property_id || !data.title || !data.start_date || !data.end_date) {
      throw new ValidationError('Property, title, start_date, and end_date are required.');
    }
    if (new Date(data.start_date) > new Date(data.end_date)) {
      throw new ValidationError('Roster start_date cannot be later than end_date.');
    }

    this.validatePropertyScope(user, data.property_id);

    const rosterCode = `RST-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const rosterId = await WorkforceRepository.createRoster({
      ...data,
      roster_code: rosterCode,
      created_by_id: user.id,
    });

    const created = await WorkforceRepository.getRosterById(rosterId);

    await AuditService.record({
      req,
      action: 'ROSTER_CREATED',
      entityType: 'roster',
      entityId: String(rosterId),
      newValues: {
        id: rosterId,
        roster_code: rosterCode,
        property_id: data.property_id,
        title: data.title,
        start_date: data.start_date,
        end_date: data.end_date,
      },
    });

    return created;
  }

  static async listRosters(query, user) {
    let propertyId = query.propertyId;
    if (user && (user.role === 'OPERATIONS_MANAGER' || user.role === 'MANAGER')) {
      propertyId = user.propertyId;
    }
    return WorkforceRepository.listRosters({
      propertyId,
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  static async getRosterById(id, user) {
    const roster = await WorkforceRepository.getRosterById(id);
    if (!roster) {
      throw new NotFoundError(`Roster #${id} not found.`);
    }
    if (user && (user.role === 'OPERATIONS_MANAGER' || user.role === 'MANAGER')) {
      this.validatePropertyScope(user, roster.property_id);
    }
    const shifts = await WorkforceRepository.listShifts({ rosterId: id });
    return {
      ...roster,
      shifts,
    };
  }

  static async publishRoster(id, user, req = null) {
    const roster = await WorkforceRepository.getRosterById(id);
    if (!roster) {
      throw new NotFoundError(`Roster #${id} not found.`);
    }
    this.validatePropertyScope(user, roster.property_id);

    if (roster.status === 'PUBLISHED') {
      throw new ConflictError(`Roster #${id} is already published.`);
    }

    // Verify understaffed shifts
    const shifts = await WorkforceRepository.listShifts({ rosterId: id });
    const unassignedCount = shifts.filter((s) => !s.employee_id).length;

    await WorkforceRepository.updateRoster(id, {
      status: 'PUBLISHED',
      published_by_id: user.id,
      published_at: new Date(),
    });

    await AuditService.record({
      req,
      action: 'ROSTER_PUBLISHED',
      entityType: 'roster',
      entityId: String(id),
      oldValues: { status: roster.status },
      newValues: { status: 'PUBLISHED', published_by_id: user.id, unassignedCount },
    });

    return {
      ...roster,
      status: 'PUBLISHED',
      published_by_id: user.id,
      warnings: unassignedCount > 0 ? [`Warning: Roster has ${unassignedCount} unassigned shift(s).`] : [],
    };
  }

  // ─── Shift Scheduling & Conflict Engine ─────────────────────────────
  static async scheduleShift(data, user, req = null) {
    if (!data.roster_id || !data.property_id || !data.shift_date || !data.start_time || !data.end_time) {
      throw new ValidationError('Roster, property, shift_date, start_time, and end_time are required.');
    }
    this.validatePropertyScope(user, data.property_id);

    // If an employee is being assigned, run comprehensive conflict checks:
    if (data.employee_id) {
      await this.verifyEmployeeShiftIntegrity(data.employee_id, data.shift_date, data.start_time, data.end_time);
    }

    const shiftId = await WorkforceRepository.createShift(data);
    const created = await WorkforceRepository.getShiftById(shiftId);

    await AuditService.record({
      req,
      action: 'SHIFT_SCHEDULED',
      entityType: 'shift',
      entityId: String(shiftId),
      newValues: created,
    });

    return created;
  }

  static async updateShift(id, data, user, req = null) {
    const shift = await WorkforceRepository.getShiftById(id);
    if (!shift) {
      throw new NotFoundError(`Shift #${id} not found.`);
    }
    this.validatePropertyScope(user, shift.property_id);

    const targetEmpId = data.employee_id !== undefined ? data.employee_id : shift.employee_id;
    const targetDate = data.shift_date || shift.shift_date;
    const targetStart = data.start_time || shift.start_time;
    const targetEnd = data.end_time || shift.end_time;

    if (targetEmpId) {
      await this.verifyEmployeeShiftIntegrity(targetEmpId, targetDate, targetStart, targetEnd, id);
    }

    await WorkforceRepository.updateShift(id, data);
    const updated = await WorkforceRepository.getShiftById(id);

    await AuditService.record({
      req,
      action: 'SHIFT_UPDATED',
      entityType: 'shift',
      entityId: String(id),
      oldValues: shift,
      newValues: updated,
    });

    return updated;
  }

  static async deleteShift(id, user, req = null) {
    const shift = await WorkforceRepository.getShiftById(id);
    if (!shift) {
      throw new NotFoundError(`Shift #${id} not found.`);
    }
    this.validatePropertyScope(user, shift.property_id);

    await WorkforceRepository.deleteShift(id);

    await AuditService.record({
      req,
      action: 'SHIFT_DELETED',
      entityType: 'shift',
      entityId: String(id),
      oldValues: shift,
    });

    return { message: 'Shift removed successfully.' };
  }

  /**
   * Conflict Detection Engine:
   * 1. Overlapping shift check
   * 2. Approved leave conflict check
   * 3. Declared unavailability check
   * 4. Weekly maximum working hours check
   */
  static async verifyEmployeeShiftIntegrity(employeeId, shiftDate, startTime, endTime, excludeShiftId = null) {
    // 1. Check overlapping shifts
    const overlaps = await WorkforceRepository.findConflictingShifts(
      employeeId,
      shiftDate,
      startTime,
      endTime,
      excludeShiftId
    );
    if (overlaps.length > 0) {
      const conf = overlaps[0];
      throw new ConflictError(
        `Shift conflict: Employee already has shift #${conf.id} scheduled on ${shiftDate} from ${conf.start_time} to ${conf.end_time} at ${conf.property_name || 'assigned property'}.`
      );
    }

    // 2. Check approved leave conflict
    const leaveConflicts = await WorkforceRepository.findConflictingLeave(employeeId, shiftDate, shiftDate);
    if (leaveConflicts.length > 0) {
      throw new ConflictError(
        `Leave conflict: Employee has an APPROVED leave request (${leaveConflicts[0].request_code}) covering ${shiftDate}.`
      );
    }

    // 3. Check declared unavailability
    const availabilityRows = await WorkforceRepository.getAvailability({ employeeId, startDate: shiftDate, endDate: shiftDate });
    if (availabilityRows.length > 0 && availabilityRows[0].availability_status === 'UNAVAILABLE') {
      // Return a descriptive warning or allow supervisor override if flagged
      throw new ConflictError(
        `Availability conflict: Employee submitted unavailability for ${shiftDate} (Notes: ${availabilityRows[0].notes || 'Personal reasons'}).`
      );
    }

    // 4. Weekly maximum hours verification (Standard limit: 48 hours / week)
    const d = new Date(shiftDate);
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mondayStr = monday.toISOString().split('T')[0];
    const sundayStr = sunday.toISOString().split('T')[0];

    const currentWeeklyHours = await WorkforceRepository.getEmployeeWeeklyHours(employeeId, mondayStr, sundayStr);
    const shiftHours = (new Date(`1970-01-01T${endTime}`) - new Date(`1970-01-01T${startTime}`)) / 3600000;

    if (currentWeeklyHours + shiftHours > 60) {
      throw new ValidationError(
        `Overtime limit exceeded: Assigning this shift would put employee at ${(currentWeeklyHours + shiftHours).toFixed(1)} hours for the week (Threshold: 60h max safety ceiling).`
      );
    }
  }

  // ─── Shift Swap Workflow ───────────────────────────────────────────
  static async requestShiftSwap(data, user, req = null) {
    const shift = await WorkforceRepository.getShiftById(data.shift_id);
    if (!shift) {
      throw new NotFoundError(`Shift #${data.shift_id} not found.`);
    }

    // Staff can only request swaps for shifts assigned to their own employee record
    const empRows = await pool.query('SELECT id, user_id FROM employees WHERE user_id = ?', [user.id]);
    const myEmpId = empRows[0]?.id;

    if (!myEmpId || shift.employee_id !== myEmpId) {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        throw new ForbiddenError('You can only request shift swaps for shifts assigned to you.');
      }
    }

    const swapId = await WorkforceRepository.createSwapRequest({
      shift_id: data.shift_id,
      requesting_employee_id: myEmpId || shift.employee_id,
      target_employee_id: data.target_employee_id || null,
      target_shift_id: data.target_shift_id || null,
      reason: data.reason,
    });

    await AuditService.record({
      req,
      action: 'SHIFT_SWAP_REQUESTED',
      entityType: 'shift_swap_request',
      entityId: String(swapId),
      newValues: { shift_id: data.shift_id, requesting_employee_id: myEmpId, reason: data.reason },
    });

    return WorkforceRepository.getSwapRequestById(swapId);
  }

  static async reviewShiftSwap(swapId, { action, reviewNotes }, user, req = null) {
    const swap = await WorkforceRepository.getSwapRequestById(swapId);
    if (!swap) {
      throw new NotFoundError(`Swap request #${swapId} not found.`);
    }
    this.validatePropertyScope(user, swap.property_id);

    const validActions = ['APPROVED', 'REJECTED'];
    if (!validActions.includes(action)) {
      throw new ValidationError(`Invalid swap review action. Must be APPROVED or REJECTED.`);
    }

    if (swap.status !== 'PENDING') {
      throw new ConflictError(`Swap request #${swapId} has already been ${swap.status.toLowerCase()}.`);
    }

    if (action === 'APPROVED') {
      if (!swap.target_employee_id) {
        throw new ValidationError('Cannot approve swap without an assigned replacement employee.');
      }
      // Re-run conflict check for target employee
      await this.verifyEmployeeShiftIntegrity(
        swap.target_employee_id,
        swap.shift_date,
        swap.start_time,
        swap.end_time,
        swap.shift_id
      );

      // Swap official assignment
      await WorkforceRepository.updateShift(swap.shift_id, {
        employee_id: swap.target_employee_id,
        notes: `Reassigned via Approved Swap Request #${swapId}`,
      });
    }

    await WorkforceRepository.updateSwapStatus(swapId, {
      status: action,
      reviewed_by_id: user.id,
      review_notes: reviewNotes,
    });

    await AuditService.record({
      req,
      action: action === 'APPROVED' ? 'SHIFT_SWAP_APPROVED' : 'SHIFT_SWAP_REJECTED',
      entityType: 'shift_swap_request',
      entityId: String(swapId),
      oldValues: { status: swap.status, original_employee_id: swap.current_shift_employee_id },
      newValues: { status: action, new_employee_id: action === 'APPROVED' ? swap.target_employee_id : swap.current_shift_employee_id },
    });

    return WorkforceRepository.getSwapRequestById(swapId);
  }
}

module.exports = RosterService;

