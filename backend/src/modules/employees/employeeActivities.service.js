const EmployeeActivitiesRepository = require('./employeeActivities.repository');
const EmployeesRepository = require('./employees.repository');
const { ValidationError, ForbiddenError } = require('../../core/errors/apiError');

class EmployeeActivitiesService {
  /**
   * Record operational activity for an employee
   */
  static async recordActivity(data, conn = null) {
    if (!data.employeeId) {
      throw new ValidationError('employeeId is required to record activity.');
    }
    if (!data.activityType || !data.activityType.trim()) {
      throw new ValidationError('activityType is required.');
    }
    if (!data.description || !data.description.trim()) {
      throw new ValidationError('Activity description is required.');
    }

    return EmployeeActivitiesRepository.create(
      {
        employeeId: parseInt(data.employeeId, 10),
        propertyId: data.propertyId ? parseInt(data.propertyId, 10) : null,
        activityType: data.activityType.trim().toUpperCase(),
        activityCategory: data.activityCategory || 'GENERAL',
        description: data.description.trim(),
        relatedEntityType: data.relatedEntityType || null,
        relatedEntityId: data.relatedEntityId || null,
        status: data.status || 'SUCCESS',
        metadata: data.metadata || null,
      },
      conn
    );
  }

  /**
   * Helper to automatically log activity for the authenticated user if they are linked to an employee
   */
  static async recordUserActivity(user, activityData, conn = null) {
    if (!user || !user.id) return null;
    try {
      const employee = await EmployeesRepository.findByUserId(user.id);
      if (!employee) return null;

      return this.recordActivity(
        {
          employeeId: employee.id,
          propertyId: activityData.propertyId || employee.property_id || user.propertyId,
          activityType: activityData.activityType,
          activityCategory: activityData.activityCategory || 'GENERAL',
          description: activityData.description,
          relatedEntityType: activityData.relatedEntityType,
          relatedEntityId: activityData.relatedEntityId,
          status: activityData.status || 'SUCCESS',
          metadata: activityData.metadata,
        },
        conn
      );
    } catch {
      // Background non-fatal activity tracking
      return null;
    }
  }

  /**
   * List activities with security scoping
   */
  static async listActivities(query, req = null) {
    const user = req?.user;
    let targetEmployeeId = query.employeeId ? parseInt(query.employeeId, 10) : null;

    // Self-service ownership check: if current user is STAFF/RECEPTIONIST and not viewing their own record
    if (user && ['STAFF', 'RECEPTIONIST'].includes((user.role || '').toUpperCase())) {
      const myEmployee = await EmployeesRepository.findByUserId(user.id);
      if (myEmployee) {
        targetEmployeeId = myEmployee.id;
      }
    }

    const result = await EmployeeActivitiesRepository.findAll({
      ...query,
      employeeId: targetEmployeeId,
      user,
    });

    const summary = await EmployeeActivitiesRepository.getSummary({
      ...query,
      employeeId: targetEmployeeId,
    });

    return {
      ...result,
      breakdown: summary.byCategory || {},
      category_breakdown: summary.byCategory || {},
    };
  }

  /**
   * Get activity summary
   */
  static async getActivitySummary(query, req = null) {
    const user = req?.user;
    let targetEmployeeId = query.employeeId ? parseInt(query.employeeId, 10) : null;

    if (user && ['STAFF', 'RECEPTIONIST'].includes((user.role || '').toUpperCase())) {
      const myEmployee = await EmployeesRepository.findByUserId(user.id);
      if (myEmployee) {
        targetEmployeeId = myEmployee.id;
      }
    }

    return EmployeeActivitiesRepository.getSummary({
      ...query,
      employeeId: targetEmployeeId,
    });
  }
}

module.exports = EmployeeActivitiesService;
