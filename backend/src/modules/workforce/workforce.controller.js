const RosterService = require('./roster.service');
const AttendanceService = require('./attendance.service');
const LeaveService = require('./leave.service');
const TimesheetService = require('./timesheet.service');
const WorkforceRepository = require('./workforce.repository');
const ApiResponse = require('../../utils/apiResponse');

class WorkforceController {
  // ─── Shift Templates ───────────────────────────────────────────────
  static async createTemplate(req, res, next) {
    try {
      const template = await RosterService.createTemplate(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Shift template created successfully',
        data: template,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listTemplates(req, res, next) {
    try {
      const templates = await RosterService.listTemplates(req.query.propertyId, req.user);
      return ApiResponse.success(res, {
        message: 'Shift templates retrieved',
        data: templates,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Rosters ────────────────────────────────────────────────────────
  static async createRoster(req, res, next) {
    try {
      const roster = await RosterService.createRoster(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Roster schedule created successfully',
        data: roster,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listRosters(req, res, next) {
    try {
      const rosters = await RosterService.listRosters(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Rosters retrieved successfully',
        data: rosters,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getRosterById(req, res, next) {
    try {
      const roster = await RosterService.getRosterById(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Roster details retrieved successfully',
        data: roster,
      });
    } catch (err) {
      next(err);
    }
  }

  static async publishRoster(req, res, next) {
    try {
      const result = await RosterService.publishRoster(req.params.id, req.user, req);
      return ApiResponse.success(res, {
        message: 'Roster published successfully to assigned staff',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Shifts ─────────────────────────────────────────────────────────
  static async scheduleShift(req, res, next) {
    try {
      const shift = await RosterService.scheduleShift(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Shift scheduled successfully',
        data: shift,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listShifts(req, res, next) {
    try {
      let propertyId = req.query.propertyId;
      if (req.user && ['OPERATIONS_MANAGER', 'MANAGER'].includes(req.user.role)) {
        propertyId = req.user.propertyId;
      }
      const shifts = await WorkforceRepository.listShifts({
        rosterId: req.query.rosterId,
        propertyId,
        employeeId: req.query.employeeId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        department: req.query.department,
      });
      return ApiResponse.success(res, {
        message: 'Shifts retrieved successfully',
        data: shifts,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateShift(req, res, next) {
    try {
      const shift = await RosterService.updateShift(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Shift updated successfully',
        data: shift,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteShift(req, res, next) {
    try {
      const result = await RosterService.deleteShift(req.params.id, req.user, req);
      return ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }

  // ─── Availability ───────────────────────────────────────────────────
  static async submitAvailability(req, res, next) {
    try {
      const emp = await AttendanceService.resolveEmployeeFromUser(req.user);
      await WorkforceRepository.setAvailability({
        employee_id: emp.id,
        date: req.body.date,
        availability_status: req.body.availability_status || 'AVAILABLE',
        preferred_shift_id: req.body.preferred_shift_id || null,
        notes: req.body.notes || null,
      });
      return ApiResponse.success(res, {
        message: 'Availability preference saved successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAvailability(req, res, next) {
    try {
      let employeeId = req.query.employeeId;
      let propertyId = req.query.propertyId;
      if (req.user.role === 'STAFF') {
        const emp = await AttendanceService.resolveEmployeeFromUser(req.user);
        employeeId = emp.id;
      } else if (['OPERATIONS_MANAGER', 'MANAGER'].includes(req.user.role)) {
        propertyId = req.user.propertyId;
      }
      const data = await WorkforceRepository.getAvailability({
        employeeId,
        propertyId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      });
      return ApiResponse.success(res, {
        message: 'Availability records retrieved',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Shift Swaps ────────────────────────────────────────────────────
  static async requestSwap(req, res, next) {
    try {
      const swap = await RosterService.requestShiftSwap(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Shift swap request submitted successfully',
        data: swap,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listSwaps(req, res, next) {
    try {
      let propertyId = req.query.propertyId;
      let employeeId = null;
      if (req.user.role === 'STAFF') {
        const emp = await AttendanceService.resolveEmployeeFromUser(req.user);
        employeeId = emp.id;
      } else if (['OPERATIONS_MANAGER', 'MANAGER'].includes(req.user.role)) {
        propertyId = req.user.propertyId;
      }
      const swaps = await WorkforceRepository.listSwapRequests({
        propertyId,
        employeeId,
        status: req.query.status,
      });
      return ApiResponse.success(res, {
        message: 'Shift swap requests retrieved',
        data: swaps,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reviewSwap(req, res, next) {
    try {
      const swap = await RosterService.reviewShiftSwap(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: `Shift swap ${req.body.action.toLowerCase()} successfully`,
        data: swap,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Attendance ─────────────────────────────────────────────────────
  static async clockIn(req, res, next) {
    try {
      const record = await AttendanceService.clockIn(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: `Clock-in recorded successfully (${record.attendance_status})`,
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  static async clockOut(req, res, next) {
    try {
      const record = await AttendanceService.clockOut(req.body, req.user, req);
      return ApiResponse.success(res, {
        message: `Clock-out recorded successfully. Total actual hours: ${record.actual_hours}h`,
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  static async startBreak(req, res, next) {
    try {
      const record = await AttendanceService.startBreak(req.user, req);
      return ApiResponse.success(res, {
        message: 'Break period started',
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  static async endBreak(req, res, next) {
    try {
      const record = await AttendanceService.endBreak(req.user, req);
      return ApiResponse.success(res, {
        message: `Break period ended. Total break: ${record.total_break_minutes} mins`,
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listAttendance(req, res, next) {
    try {
      let propertyId = req.query.propertyId;
      let employeeId = req.query.employeeId;
      if (req.user.role === 'STAFF') {
        const emp = await AttendanceService.resolveEmployeeFromUser(req.user);
        employeeId = emp.id;
      } else if (['OPERATIONS_MANAGER', 'MANAGER'].includes(req.user.role)) {
        propertyId = req.user.propertyId;
      }
      const records = await WorkforceRepository.listAttendance({
        propertyId,
        employeeId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        status: req.query.status,
      });
      return ApiResponse.success(res, {
        message: 'Attendance records retrieved successfully',
        data: records,
      });
    } catch (err) {
      next(err);
    }
  }

  static async requestAttendanceCorrection(req, res, next) {
    try {
      const correction = await AttendanceService.requestCorrection(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Attendance correction request submitted for managerial review',
        data: correction,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listAttendanceCorrections(req, res, next) {
    try {
      let propertyId = req.query.propertyId;
      let employeeId = null;
      if (req.user.role === 'STAFF') {
        const emp = await AttendanceService.resolveEmployeeFromUser(req.user);
        employeeId = emp.id;
      } else if (['OPERATIONS_MANAGER', 'MANAGER'].includes(req.user.role)) {
        propertyId = req.user.propertyId;
      }
      const corrections = await WorkforceRepository.listAttendanceCorrections({
        propertyId,
        employeeId,
        status: req.query.status,
      });
      return ApiResponse.success(res, {
        message: 'Attendance corrections retrieved',
        data: corrections,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reviewAttendanceCorrection(req, res, next) {
    try {
      const correction = await AttendanceService.reviewCorrection(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: `Attendance correction ${req.body.action.toLowerCase()} successfully`,
        data: correction,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Leave Management ───────────────────────────────────────────────
  static async listLeaveCategories(req, res, next) {
    try {
      const categories = await LeaveService.listCategories();
      return ApiResponse.success(res, {
        message: 'Leave categories retrieved',
        data: categories,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getLeaveBalances(req, res, next) {
    try {
      let employeeId = req.params.employeeId;
      if (!employeeId || employeeId === 'me') {
        const emp = await AttendanceService.resolveEmployeeFromUser(req.user);
        employeeId = emp.id;
      }
      const balances = await LeaveService.getLeaveBalances(employeeId, req.user);
      return ApiResponse.success(res, {
        message: 'Leave balances retrieved',
        data: balances,
      });
    } catch (err) {
      next(err);
    }
  }

  static async submitLeave(req, res, next) {
    try {
      const leave = await LeaveService.submitLeaveRequest(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Leave request submitted successfully',
        data: leave,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listLeaveRequests(req, res, next) {
    try {
      let propertyId = req.query.propertyId;
      let employeeId = req.query.employeeId;
      if (req.user.role === 'STAFF') {
        const emp = await AttendanceService.resolveEmployeeFromUser(req.user);
        employeeId = emp.id;
      } else if (['OPERATIONS_MANAGER', 'MANAGER'].includes(req.user.role)) {
        propertyId = req.user.propertyId;
      }
      const requests = await WorkforceRepository.listLeaveRequests({
        propertyId,
        employeeId,
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      });
      return ApiResponse.success(res, {
        message: 'Leave requests retrieved successfully',
        data: requests,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reviewLeave(req, res, next) {
    try {
      const leave = await LeaveService.reviewLeaveRequest(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: `Leave request ${req.body.action.toLowerCase()} successfully`,
        data: leave,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Payroll-Ready Timesheet Reports ────────────────────────────────
  static async getTimesheets(req, res, next) {
    try {
      const data = await TimesheetService.getTimesheetReport({
        propertyId: req.query.propertyId,
        department: req.query.department,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      }, req.user);
      return ApiResponse.success(res, {
        message: 'Timesheet report generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async exportTimesheets(req, res, next) {
    try {
      const data = await TimesheetService.getTimesheetReport({
        propertyId: req.query.propertyId,
        department: req.query.department,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      }, req.user);

      const csv = TimesheetService.generateCsv(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="bfa_timesheet_${req.query.startDate}_to_${req.query.endDate}.csv"`);
      return res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  // ─── Property Kiosk Terminal Clock-In / Clock-Out ─────────────────────
  static async kioskClock(req, res, next) {
    try {
      const record = await AttendanceService.kioskClock(req.body, req);
      return ApiResponse.success(res, {
        message: `Kiosk ${req.body.action || 'CLOCK_IN'} recorded successfully`,
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Manager-Assisted Attendance ───────────────────────────────────────
  static async recordManualAttendance(req, res, next) {
    try {
      const record = await AttendanceService.recordManualAttendance(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Manager-assisted attendance recorded successfully',
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Attendance Policies ───────────────────────────────────────────────
  static async getPolicy(req, res, next) {
    try {
      let propertyId = req.params.propertyId || req.query.propertyId || null;
      if (req.user && ['OPERATIONS_MANAGER', 'MANAGER'].includes(req.user.role)) {
        propertyId = req.user.propertyId || propertyId;
      }
      const policy = await AttendanceService.getPolicy(propertyId);
      return ApiResponse.success(res, {
        message: 'Attendance policy retrieved',
        data: policy,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updatePolicy(req, res, next) {
    try {
      const propertyId = req.params.propertyId || req.body.property_id || null;
      const policy = await AttendanceService.updatePolicy(propertyId, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Attendance policy updated successfully',
        data: policy,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Kiosk Terminal Management ─────────────────────────────────────────
  static async registerKiosk(req, res, next) {
    try {
      const kiosk = await AttendanceService.registerKiosk(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Property kiosk terminal registered successfully',
        data: kiosk,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listKiosks(req, res, next) {
    try {
      let propertyId = req.query.propertyId || null;
      if (req.user && ['OPERATIONS_MANAGER', 'MANAGER'].includes(req.user.role)) {
        propertyId = req.user.propertyId;
      }
      const kiosks = await AttendanceService.listKiosks(propertyId, req.user);
      return ApiResponse.success(res, {
        message: 'Property kiosks retrieved successfully',
        data: kiosks,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateKioskStatus(req, res, next) {
    try {
      const kiosk = await AttendanceService.updateKioskStatus(req.params.id, req.body.status, req.user, req);
      return ApiResponse.success(res, {
        message: `Kiosk status updated to ${req.body.status}`,
        data: kiosk,
      });
    } catch (err) {
      next(err);
    }
  }

  static async rotateKioskSecret(req, res, next) {
    try {
      const result = await AttendanceService.rotateKioskSecret(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Kiosk terminal credentials rotated successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async verifyAttendance(req, res, next) {
    try {
      const result = await AttendanceService.verifyAttendanceRecord(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: `Attendance exception ${req.body?.action === 'FLAG_REJECTED' ? 'rejected' : 'verified'} successfully`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Leave Escalation to Admin ─────────────────────────────────────────
  static async escalateLeave(req, res, next) {
    try {
      const leave = await LeaveService.escalateLeaveRequest(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Leave request escalated to Administrator for review',
        data: leave,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = WorkforceController;

