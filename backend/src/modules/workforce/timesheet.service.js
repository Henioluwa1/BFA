const WorkforceRepository = require('./workforce.repository');
const { ForbiddenError, ValidationError } = require('../../core/errors/apiError');
const pool = require('../../db/pool');

class TimesheetService {
  /**
   * Enforce least-privilege role boundaries for payroll-ready reporting
   */
  static validateTimesheetAccess(user, queryPropertyId = null) {
    if (!user) {
      throw new ForbiddenError('Authentication required to access workforce timesheets.');
    }
    const role = (user.role || '').toUpperCase();

    // SUPER_ADMIN has zero business payroll/financial access under BFA governance
    if (role === 'SUPER_ADMIN') {
      throw new ForbiddenError('Super Admin accounts are restricted to technical infrastructure and cannot view payroll records.');
    }

    if (role === 'STAFF') {
      // Handled in getTimesheetReport (restricted to employeeId = self)
      return;
    }

    if (role === 'OPERATIONS_MANAGER' || role === 'MANAGER') {
      if (!user.propertyId) {
        throw new ForbiddenError('Operations Manager account has no assigned property.');
      }
      if (queryPropertyId && String(user.propertyId) !== String(queryPropertyId)) {
        throw new ForbiddenError(`You can only access payroll timesheets for your assigned Property #${user.propertyId}.`);
      }
      return;
    }

    if (['ADMIN', 'OWNER'].includes(role)) {
      return; // Authorized across properties
    }

    throw new ForbiddenError(`Role '${role}' is not authorized to access timesheet reports.`);
  }

  static async getTimesheetReport({ propertyId = null, department = null, startDate, endDate }, user) {
    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate query parameters are required.');
    }

    this.validateTimesheetAccess(user, propertyId);

    let effectivePropertyId = propertyId;
    let employeeIdFilter = null;

    if (user.role === 'OPERATIONS_MANAGER' || user.role === 'MANAGER') {
      effectivePropertyId = user.propertyId;
    } else if (user.role === 'STAFF') {
      const empRows = await pool.query('SELECT id FROM employees WHERE user_id = ?', [user.id]);
      if (empRows.length === 0) {
        return [];
      }
      employeeIdFilter = empRows[0].id;
    }

    const rows = await WorkforceRepository.getTimesheetSummary({
      propertyId: effectivePropertyId,
      department,
      startDate,
      endDate,
      employeeId: employeeIdFilter,
    });

    return rows.map((r) => {
      const scheduled = parseFloat(r.total_scheduled_hours || 0);
      const actual = parseFloat(r.total_actual_hours || 0);
      const overtime = parseFloat(r.total_overtime_hours || 0);
      const leaveDays = parseFloat(r.approved_leave_days || 0);
      // Standard calculation: payable = actual hours + approved paid leave hours (8h/day)
      const payableHours = parseFloat((actual + leaveDays * 8.00).toFixed(2));

      return {
        employee_id: r.employee_id,
        employee_code: r.employee_code,
        employee_name: r.employee_name,
        department: r.department,
        job_title: r.job_title,
        property_id: r.property_id,
        property_name: r.property_name,
        property_code: r.property_code,
        period_start: startDate,
        period_end: endDate,
        days_present: parseInt(r.days_present || 0, 10),
        scheduled_hours: scheduled,
        actual_hours: actual,
        approved_overtime_hours: overtime,
        late_arrivals: parseInt(r.late_arrivals_count || 0, 10),
        early_departures: parseInt(r.early_departures_count || 0, 10),
        approved_leave_days: leaveDays,
        total_payable_hours: payableHours,
      };
    });
  }

  static generateCsv(timesheetData) {
    const headers = [
      'Employee Code',
      'Employee Name',
      'Department',
      'Job Title',
      'Property',
      'Reporting Period',
      'Days Present',
      'Scheduled Hours',
      'Actual Hours',
      'Overtime Hours',
      'Late Arrivals',
      'Early Departures',
      'Approved Leave Days',
      'Total Payable Hours',
    ];

    const rows = timesheetData.map((d) => [
      `"${d.employee_code}"`,
      `"${d.employee_name}"`,
      `"${d.department}"`,
      `"${d.job_title}"`,
      `"${d.property_name}"`,
      `"${d.period_start} to ${d.period_end}"`,
      d.days_present,
      d.scheduled_hours.toFixed(2),
      d.actual_hours.toFixed(2),
      d.approved_overtime_hours.toFixed(2),
      d.late_arrivals,
      d.early_departures,
      d.approved_leave_days,
      d.total_payable_hours.toFixed(2),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }
}

module.exports = TimesheetService;

