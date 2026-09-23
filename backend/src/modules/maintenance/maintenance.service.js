const pool = require('../../db/pool');
const MaintenanceRepository = require('./maintenance.repository');
const PropertiesRepository = require('../properties/properties.repository');
const ApartmentsRepository = require('../apartments/apartments.repository');
const AuditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');
const logger = require('../../utils/logger');

const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_CATEGORIES = [
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'CARPENTRY',
  'APPLIANCE',
  'PAINTING',
  'GENERAL',
  'CLEANING',
];
const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];

class MaintenanceService {
  /**
   * Validate property scoping for role
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return true;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return true;
    }
    if (['MANAGER', 'STAFF'].includes(role) && user.propertyId) {
      if (parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization for this property.');
      }
    }
    return true;
  }

  /**
   * List maintenance work orders
   */
  static async listMaintenance(params, user = null) {
    return MaintenanceRepository.findAll({
      ...params,
      user,
    });
  }

  /**
   * Get single work order by ID
   */
  static async getMaintenanceById(id, user = null) {
    const record = await MaintenanceRepository.findById(id);
    if (!record) {
      throw new NotFoundError(`Maintenance request #${id} not found.`);
    }

    if (user) {
      this.validatePropertyScope(user, record.property_id);
    }

    return record;
  }

  /**
   * Create new maintenance request
   */
  static async createMaintenance(data, user = null, req = null) {
    if (!data.property_id || !data.issue_title) {
      throw new ValidationError('Property ID and issue title are required.');
    }

    this.validatePropertyScope(user, data.property_id);

    // Verify property exists
    const property = await PropertiesRepository.findById(data.property_id);
    if (!property) {
      throw new NotFoundError(`Property #${data.property_id} not found.`);
    }

    // Verify apartment if supplied
    let apartment = null;
    if (data.apartment_id) {
      apartment = await ApartmentsRepository.findById(data.apartment_id);
      if (!apartment) {
        throw new NotFoundError(`Apartment unit #${data.apartment_id} not found.`);
      }
      if (parseInt(apartment.property_id, 10) !== parseInt(data.property_id, 10)) {
        throw new ValidationError('Data Integrity Violation: Unit does not belong to specified property.');
      }
    }

    // Validate category & priority
    const category = data.category ? String(data.category).toUpperCase() : 'GENERAL';
    if (!VALID_CATEGORIES.includes(category)) {
      throw new ValidationError(`Invalid category '${data.category}'. Allowed: ${VALID_CATEGORIES.join(', ')}`);
    }

    const priority = data.priority ? String(data.priority).toUpperCase() : 'MEDIUM';
    if (!VALID_PRIORITIES.includes(priority)) {
      throw new ValidationError(`Invalid priority '${data.priority}'. Allowed: ${VALID_PRIORITIES.join(', ')}`);
    }

    // Generate unique issue code
    const propCode = property.code || 'BFA';
    const issueCode = `MNT-${propCode}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

    const isBlocking = data.blocking_unit === true || data.blocking_unit === 1 || priority === 'CRITICAL';

    // Verify assigned staff if provided
    let assignedStaffName = null;
    let assignedStaffId = null;
    if (data.assigned_to_id) {
      const [staff] = await pool.query('SELECT id, name, status, property_id FROM users WHERE id = ?', [data.assigned_to_id]);
      if (!staff) {
        throw new NotFoundError(`Assigned staff member #${data.assigned_to_id} not found.`);
      }
      if (staff.status !== 'ACTIVE') {
        throw new ValidationError(`Staff member '${staff.name}' is currently inactive.`);
      }
      if (staff.property_id && parseInt(staff.property_id, 10) !== parseInt(data.property_id, 10)) {
        throw new ForbiddenError(`Staff member '${staff.name}' is only assigned to Property #${staff.property_id}.`);
      }
      assignedStaffId = staff.id;
      assignedStaffName = staff.name;
    }

    const insertId = await MaintenanceRepository.create({
      issue_code: issueCode,
      property_id: parseInt(data.property_id, 10),
      apartment_id: data.apartment_id ? parseInt(data.apartment_id, 10) : null,
      reservation_id: data.reservation_id ? parseInt(data.reservation_id, 10) : null,
      issue_title: data.issue_title.trim(),
      description: data.description ? data.description.trim() : null,
      category,
      priority,
      status: 'OPEN',
      reported_by_id: user?.id || null,
      assigned_to_id: assignedStaffId,
      assigned_to: assignedStaffName,
      estimated_cost: parseFloat(data.estimated_cost || 0),
      actual_cost: 0.00,
      blocking_unit: isBlocking,
    });

    // Coupling with Unit Operational State:
    // If issue is marked blocking or critical, transition unit to MAINTENANCE
    if (isBlocking && apartment) {
      await pool.query('UPDATE apartments SET status = "MAINTENANCE" WHERE id = ?', [apartment.id]);
    }

    const created = await MaintenanceRepository.findById(insertId);

    // Audit record
    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'MAINTENANCE_CREATED',
      entityType: 'maintenance',
      entityId: String(insertId),
      newValues: {
        issueCode,
        propertyId: data.property_id,
        apartmentId: data.apartment_id,
        priority,
        category,
        blockingUnit: isBlocking,
        estimatedCost: data.estimated_cost,
      },
    });

    // Notifications
    try {
      if (priority === 'CRITICAL') {
        await NotificationsService.dispatchNotification({
          recipientRole: 'MANAGER',
          propertyId: data.property_id,
          title: `CRITICAL Maintenance Reported: ${issueCode}`,
          message: `Critical issue '${data.issue_title}' reported in ${property.name}${apartment ? ` (Unit ${apartment.unit_number})` : ''}.`,
          category: 'MAINTENANCE',
          priority: 'CRITICAL',
          sourceEntityType: 'maintenance',
          sourceEntityId: insertId,
        });
      }

      if (assignedStaffId) {
        await NotificationsService.dispatchNotification({
          recipientId: assignedStaffId,
          title: `New Maintenance Assignment: ${issueCode}`,
          message: `You have been assigned to work order '${data.issue_title}'.`,
          category: 'MAINTENANCE',
          priority: priority,
          sourceEntityType: 'maintenance',
          sourceEntityId: insertId,
        });
      }
    } catch (notifErr) {
      logger.warn('Failed to send maintenance notification:', { error: notifErr.message });
    }

    return created;
  }

  /**
   * Assign staff member to maintenance work order
   */
  static async assignStaff(id, data, user, req = null) {
    const staffId = data?.staffId || data?.assigned_to_id;
    if (!staffId) {
      throw new ValidationError('staffId is required for assignment.');
    }

    const record = await this.getMaintenanceById(id, user);

    const staffList = await pool.query('SELECT id, name, status, property_id, role FROM users WHERE id = ?', [staffId]);
    const staff = staffList[0];
    if (!staff) {
      throw new NotFoundError(`Staff member #${staffId} not found.`);
    }
    if (staff.status !== 'ACTIVE') {
      throw new ValidationError(`Staff member '${staff.name}' is currently inactive.`);
    }
    if (staff.property_id && parseInt(staff.property_id, 10) !== parseInt(record.property_id, 10)) {
      throw new ForbiddenError(`Staff member '${staff.name}' is assigned to Property #${staff.property_id}, not Property #${record.property_id}.`);
    }

    await MaintenanceRepository.update(id, {
      assigned_to_id: staff.id,
      assigned_to: staff.name,
    });

    const updated = await MaintenanceRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'MAINTENANCE_ASSIGNED',
      entityType: 'maintenance',
      entityId: String(id),
      oldValues: { assignedToId: record.assigned_to_id, assignedTo: record.assigned_to },
      newValues: { assignedToId: staff.id, assignedTo: staff.name },
    });

    try {
      await NotificationsService.dispatchNotification({
        recipientId: staff.id,
        title: `Work Order Assignment: ${record.issue_code}`,
        message: `You have been assigned to work order: ${record.issue_title}.`,
        category: 'MAINTENANCE',
        priority: record.priority,
        sourceEntityType: 'maintenance',
        sourceEntityId: id,
      });
    } catch (notifErr) {
      logger.warn('Failed to send assignment notification:', { error: notifErr.message });
    }

    return updated;
  }

  /**
   * Start work on maintenance request (OPEN -> IN_PROGRESS)
   */
  static async startWork(id, user, req = null) {
    const record = await this.getMaintenanceById(id, user);

    if (record.status !== 'OPEN') {
      throw new ValidationError(`Cannot start work: Current status is '${record.status}'. Only OPEN requests can be started.`);
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await MaintenanceRepository.update(id, {
      status: 'IN_PROGRESS',
      started_at: nowStr,
    });

    const updated = await MaintenanceRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'MAINTENANCE_STARTED',
      entityType: 'maintenance',
      entityId: String(id),
      oldValues: { status: 'OPEN' },
      newValues: { status: 'IN_PROGRESS', startedAt: nowStr },
    });

    return updated;
  }

  /**
   * Resolve maintenance request (IN_PROGRESS/OPEN -> RESOLVED)
   */
  static async resolveIssue(id, data, user, req = null) {
    const record = await this.getMaintenanceById(id, user);

    if (['RESOLVED', 'CANCELLED'].includes(record.status)) {
      throw new ValidationError(`Cannot resolve request: Current status is already '${record.status}'.`);
    }

    const resolutionNotes = data?.resolutionNotes || data?.resolution_notes;
    if (!resolutionNotes || resolutionNotes.trim().length < 3) {
      throw new ValidationError('Resolution notes are required (minimum 3 characters).');
    }

    const costVal = data?.actualCost !== undefined ? data.actualCost : data?.actual_cost;
    const costNum = costVal !== undefined ? parseFloat(costVal) : parseFloat(record.actual_cost || 0);
    if (isNaN(costNum) || costNum < 0) {
      throw new ValidationError('Actual cost must be a valid non-negative number.');
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await MaintenanceRepository.update(id, {
      status: 'RESOLVED',
      resolved_at: nowStr,
      resolution_notes: resolutionNotes.trim(),
      actual_cost: costNum,
    });

    // Section 11 & 29: Unit Operational State Lifecycle Coupling
    // When maintenance is resolved, the unit does NOT automatically become AVAILABLE!
    // It transitions to CLEANING (housekeeping progression CLEANING -> READY -> AVAILABLE)
    if (record.apartment_id) {
      const apartment = await ApartmentsRepository.findById(record.apartment_id);
      if (apartment && apartment.status === 'MAINTENANCE') {
        await pool.query('UPDATE apartments SET status = "CLEANING" WHERE id = ?', [record.apartment_id]);
      }
    }

    const updated = await MaintenanceRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'MAINTENANCE_RESOLVED',
      entityType: 'maintenance',
      entityId: String(id),
      oldValues: { status: record.status },
      newValues: {
        status: 'RESOLVED',
        resolvedAt: nowStr,
        actualCost: costNum,
        resolutionNotes,
      },
    });

    return updated;
  }

  /**
   * Cancel maintenance request
   */
  static async cancelIssue(id, { reason = 'Cancelled by management' } = {}, user, req = null) {
    const record = await this.getMaintenanceById(id, user);

    if (record.status === 'RESOLVED') {
      throw new ValidationError('Cannot cancel an already resolved maintenance request.');
    }

    await MaintenanceRepository.update(id, {
      status: 'CANCELLED',
      resolution_notes: `Cancelled: ${reason}`,
    });

    // If unit was locked in MAINTENANCE, restore to AVAILABLE/CLEANING
    if (record.apartment_id && record.blocking_unit) {
      const apartment = await ApartmentsRepository.findById(record.apartment_id);
      if (apartment && apartment.status === 'MAINTENANCE') {
        await pool.query('UPDATE apartments SET status = "AVAILABLE" WHERE id = ?', [record.apartment_id]);
      }
    }

    const updated = await MaintenanceRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'MAINTENANCE_CANCELLED',
      entityType: 'maintenance',
      entityId: String(id),
      oldValues: { status: record.status },
      newValues: { status: 'CANCELLED', reason },
    });

    return updated;
  }

  /**
   * Get operational statistics for dashboard
   */
  static async getStats(query, user = null) {
    return MaintenanceRepository.getStats({
      propertyId: query.propertyId,
      user,
    });
  }
}

module.exports = MaintenanceService;
