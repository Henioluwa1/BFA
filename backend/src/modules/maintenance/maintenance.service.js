const pool = require('../../db/pool');
const MaintenanceRepository = require('./maintenance.repository');
const PropertiesRepository = require('../properties/properties.repository');
const ApartmentsRepository = require('../apartments/apartments.repository');
const AuditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const EmployeeActivitiesService = require('../employees/employeeActivities.service');
const IdentityResolverService = require('../workforce/identityResolver.service');
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

/**
 * Deadlock retry helper with jitter
 */
async function executeWithDeadlockRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if ((err.code === 'ER_LOCK_DEADLOCK' || err.errno === 1213) && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 50) + 25 * attempt;
        await new Promise((resolve) => setTimeout(resolve, jitter));
        continue;
      }
      throw err;
    }
  }
}

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
    if (['MANAGER', 'STAFF', 'RECEPTIONIST'].includes(role)) {
      if (!user.propertyId) {
        throw new ForbiddenError('Access denied: User is not assigned to any property.');
      }
      if (propertyId && propertyId !== 'all' && parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
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

    // Verify assigned staff if provided (Stage 2.5B Row-Level Serialization & Policy Checks)
    let assignedStaffName = null;
    let assignedStaffId = null;
    let createWorkloadWarning = null;
    let createAttExceptionOccurred = false;
    let createAttExceptionDetails = null;

    if (data.assigned_to_id) {
      await executeWithDeadlockRetry(async () => {
        await pool.withTransaction(async (conn) => {
          const [staffRows] = await conn.query(
            'SELECT id, name, status, property_id, role FROM users WHERE id = ? FOR UPDATE',
            [data.assigned_to_id]
          );
          if (!staffRows || staffRows.length === 0) {
            throw new NotFoundError(`Assigned staff member #${data.assigned_to_id} not found.`);
          }
          const staff = staffRows[0];
          if (staff.status !== 'ACTIVE') {
            throw new ValidationError(`Staff member '${staff.name}' is currently inactive.`);
          }
          if (staff.property_id && parseInt(staff.property_id, 10) !== parseInt(data.property_id, 10)) {
            throw new ForbiddenError(`Staff member '${staff.name}' is only assigned to Property #${staff.property_id}.`);
          }

          // DEC-2.5B-01 (Option A): Identity check
          const [empRows] = await conn.query(
            'SELECT id, employee_code, full_name, employment_status FROM employees WHERE user_id = ?',
            [staff.id]
          );
          if (!empRows || empRows.length === 0) {
            throw new ValidationError(
              `Technician '${staff.name}' cannot be dispatched: No authoritative employee record linked to user account (DEC-2.5B-01 Option A).`
            );
          }
          const employee = empRows[0];
          if (employee.employment_status !== 'ACTIVE') {
            throw new ValidationError(`Technician '${staff.name}' employee record status is '${employee.employment_status}'.`);
          }

          // DEC-2.5B-02 (Option A): Attendance exception check
          const [attRows] = await conn.query(
            'SELECT id, requires_review, verification_notes FROM attendance_records WHERE employee_id = ? AND work_date = CURDATE() AND clock_out_time IS NULL ORDER BY id DESC LIMIT 1',
            [employee.id]
          );
          if (attRows.length > 0 && (attRows[0].requires_review == 1 || attRows[0].requires_review === true)) {
            createAttExceptionOccurred = true;
            createAttExceptionDetails = {
              technicianId: staff.id,
              technicianName: staff.name,
              employeeId: employee.id,
              attendanceRecordId: attRows[0].id,
              verificationNotes: attRows[0].verification_notes,
            };
          }

          // DEC-2.5B-03 (Option B): Workload warning threshold
          const [wRows] = await conn.query(
            'SELECT COUNT(*) as count FROM maintenance_requests WHERE assigned_to_id = ? AND status IN ("OPEN", "IN_PROGRESS")',
            [staff.id]
          );
          const activeCount = parseInt(wRows[0].count, 10);
          const [settRows] = await conn.query(
            'SELECT setting_value FROM system_settings WHERE setting_key = "maintenance_workload_warning_threshold" LIMIT 1'
          );
          const threshold = settRows.length > 0 ? parseInt(settRows[0].setting_value, 10) : 5;
          if (activeCount >= threshold) {
            createWorkloadWarning = `Technician has ${activeCount} active work orders (threshold: ${threshold})`;
          }

          assignedStaffId = staff.id;
          assignedStaffName = staff.name;
        });
      });
    }

    let insertId = null;

    // Concurrency Hardening: Every operation creating a blocking maintenance restriction
    // must coordinate through the apartment row lock before writing that restriction.
    if (data.apartment_id && isBlocking) {
      insertId = await executeWithDeadlockRetry(async () => {
        return pool.withTransaction(async (conn) => {
          // Priority: Lock apartment row first
          const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [data.apartment_id]);
          if (!aptRows || aptRows.length === 0) {
            throw new NotFoundError(`Apartment unit #${data.apartment_id} not found.`);
          }
          const lockedApt = aptRows[0];

          // Create ticket inside protected transaction
          const [insertResult] = await conn.query(
            `INSERT INTO maintenance_requests (
              issue_code, property_id, apartment_id, reservation_id,
              issue_title, description, category, priority, status,
              reported_by_id, assigned_to_id, assigned_to,
              estimated_cost, actual_cost, blocking_unit, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, 0.00, ?, NOW(), NOW())`,
            [
              issueCode,
              parseInt(data.property_id, 10),
              parseInt(data.apartment_id, 10),
              data.reservation_id ? parseInt(data.reservation_id, 10) : null,
              data.issue_title.trim(),
              data.description ? data.description.trim() : null,
              category,
              priority,
              user?.id || null,
              assignedStaffId,
              assignedStaffName,
              parseFloat(data.estimated_cost || 0),
              isBlocking ? 1 : 0
            ]
          );

          // Update apartment operational & maintenance status under lock:
          // If apartment is currently OCCUPIED, keep status = 'OCCUPIED' and update maintenance_status = 'UNDER_REPAIR'
          // If apartment is vacant/available/ready, update status = 'MAINTENANCE' and maintenance_status = 'UNDER_REPAIR'
          if (lockedApt.status === 'OCCUPIED') {
            await conn.query(
              'UPDATE apartments SET maintenance_status = "UNDER_REPAIR", updated_at = NOW() WHERE id = ?',
              [lockedApt.id]
            );
          } else {
            await conn.query(
              'UPDATE apartments SET status = "MAINTENANCE", maintenance_status = "UNDER_REPAIR", updated_at = NOW() WHERE id = ?',
              [lockedApt.id]
            );
          }

          return insertResult.insertId;
        });
      });
    } else {
      insertId = await MaintenanceRepository.create({
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

    if (createAttExceptionOccurred && createAttExceptionDetails) {
      await AuditService.record({
        req,
        actorId: user?.id,
        actorEmail: user?.email,
        actorRole: user?.role,
        action: 'DISPATCH_WITH_ATTENDANCE_EXCEPTION',
        entityType: 'maintenance',
        entityId: String(insertId),
        details: {
          ...createAttExceptionDetails,
          workOrderCode: issueCode,
        },
      });
    }

    // Employee activity logging
    if (user?.id) {
      EmployeeActivitiesService.recordUserActivity(user.id, {
        property_id: data.property_id,
        activity_type: 'MAINTENANCE_CREATED',
        activity_category: 'MAINTENANCE',
        related_entity_type: 'maintenance',
        related_entity_id: insertId,
        description: `Logged maintenance request ${issueCode}: ${data.issue_title}`,
        metadata: { issue_code: issueCode, priority, category }
      }).catch(() => {});
    }

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
   * Hardened with Row-Level Serialization & Deadlock Prevention (Package A)
   * Policies: DEC-2.5B-01, DEC-2.5B-02, DEC-2.5B-03
   */
  static async assignStaff(id, data, user, req = null) {
    const staffId = parseInt(data?.staffId || data?.assigned_to_id, 10);
    if (!staffId || isNaN(staffId)) {
      throw new ValidationError('staffId is required for assignment.');
    }

    let updated = null;
    let attendanceExceptionOccurred = false;
    let attExceptionDetails = null;
    let workloadWarning = null;
    let activeWorkload = 0;
    let threshold = 5;

    await executeWithDeadlockRetry(async () => {
      await pool.withTransaction(async (conn) => {
        // 1. Lock the maintenance work order row
        const [maintRows] = await conn.query(
          'SELECT id, issue_code, property_id, apartment_id, assigned_to_id, assigned_to, status, priority, issue_title FROM maintenance_requests WHERE id = ? FOR UPDATE',
          [id]
        );
        if (!maintRows || maintRows.length === 0) {
          throw new NotFoundError(`Maintenance request #${id} not found.`);
        }
        const record = maintRows[0];

        if (user) {
          this.validatePropertyScope(user, record.property_id);
        }

        if (['RESOLVED', 'CANCELLED'].includes(record.status)) {
          throw new ValidationError(`Cannot assign technician: Current work order status is '${record.status}'.`);
        }

        // 2. Deadlock-free ascending ID serialization for user locks
        const oldStaffId = record.assigned_to_id ? parseInt(record.assigned_to_id, 10) : null;
        const idsToLock = Array.from(new Set([staffId, oldStaffId].filter(Boolean))).sort((a, b) => a - b);

        const lockedUsers = {};
        for (const uId of idsToLock) {
          const [uRows] = await conn.query(
            'SELECT id, name, email, status, property_id, role FROM users WHERE id = ? FOR UPDATE',
            [uId]
          );
          if (uRows.length > 0) {
            lockedUsers[uId] = uRows[0];
          }
        }

        const staff = lockedUsers[staffId];
        if (!staff) {
          throw new NotFoundError(`Staff member #${staffId} not found.`);
        }
        if (staff.status !== 'ACTIVE') {
          throw new ValidationError(`Staff member '${staff.name}' is currently inactive.`);
        }
        if (staff.property_id && parseInt(staff.property_id, 10) !== parseInt(record.property_id, 10)) {
          throw new ForbiddenError(`Staff member '${staff.name}' is assigned to Property #${staff.property_id}, not Property #${record.property_id}.`);
        }

        // 3. DEC-2.5B-01 (Option A): Identity Check - must have active employee record
        const [empRows] = await conn.query(
          'SELECT id, employee_code, full_name, employment_status FROM employees WHERE user_id = ?',
          [staff.id]
        );
        if (!empRows || empRows.length === 0) {
          throw new ValidationError(
            `Technician '${staff.name}' cannot be dispatched: No authoritative employee record linked to user account (DEC-2.5B-01 Option A).`
          );
        }
        const employee = empRows[0];
        if (employee.employment_status !== 'ACTIVE') {
          throw new ValidationError(`Technician '${staff.name}' employee record status is '${employee.employment_status}'.`);
        }

        // 4. DEC-2.5B-02 (Option A): Attendance Exception Check
        const [attRows] = await conn.query(
          'SELECT id, requires_review, verification_notes FROM attendance_records WHERE employee_id = ? AND work_date = CURDATE() AND clock_out_time IS NULL ORDER BY id DESC LIMIT 1',
          [employee.id]
        );
        if (attRows.length > 0 && (attRows[0].requires_review == 1 || attRows[0].requires_review === true)) {
          attendanceExceptionOccurred = true;
          attExceptionDetails = {
            technicianId: staff.id,
            technicianName: staff.name,
            employeeId: employee.id,
            attendanceRecordId: attRows[0].id,
            verificationNotes: attRows[0].verification_notes,
            workOrderCode: record.issue_code,
          };
        }

        // 5. DEC-2.5B-03 (Option B): Workload warning capacity calculation
        const [wRows] = await conn.query(
          'SELECT COUNT(*) as count FROM maintenance_requests WHERE assigned_to_id = ? AND status IN ("OPEN", "IN_PROGRESS") AND id != ?',
          [staff.id, id]
        );
        activeWorkload = parseInt(wRows[0].count, 10);
        const [settRows] = await conn.query(
          'SELECT setting_value FROM system_settings WHERE setting_key = "maintenance_workload_warning_threshold" LIMIT 1'
        );
        threshold = settRows.length > 0 ? parseInt(settRows[0].setting_value, 10) : 5;
        if (activeWorkload >= threshold) {
          workloadWarning = `Technician has ${activeWorkload} active work orders (threshold: ${threshold})`;
        }

        // 6. Update maintenance request assignment
        await conn.query(
          'UPDATE maintenance_requests SET assigned_to_id = ?, assigned_to = ? WHERE id = ?',
          [staff.id, staff.name, id]
        );
      });
    });

    updated = await MaintenanceRepository.findById(id);

    // Immutable audit record for assignment
    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'MAINTENANCE_ASSIGNED',
      entityType: 'maintenance',
      entityId: String(id),
      newValues: { assignedToId: staffId, workloadWarning: workloadWarning || undefined },
    });

    // Immutable audit record for attendance exception if applicable (DEC-2.5B-02)
    if (attendanceExceptionOccurred && attExceptionDetails) {
      await AuditService.record({
        req,
        actorId: user?.id,
        actorEmail: user?.email,
        actorRole: user?.role,
        action: 'DISPATCH_WITH_ATTENDANCE_EXCEPTION',
        entityType: 'maintenance',
        entityId: String(id),
        details: attExceptionDetails,
      });
    }

    // Attach advisory workload warning metadata to returned object
    if (workloadWarning) {
      updated.isOverloaded = true;
      updated.activeWorkload = activeWorkload;
      updated.workloadWarningThreshold = threshold;
      updated.workloadWarning = workloadWarning;
    }

    try {
      await NotificationsService.dispatchNotification({
        recipientId: staffId,
        title: `Work Order Assignment: ${updated.issue_code}`,
        message: `You have been assigned to work order: ${updated.issue_title}.`,
        category: 'MAINTENANCE',
        priority: updated.priority,
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
   * Update maintenance request details or blocking escalation (Stage 2.6A Hardening)
   * Coordinates via MaintenanceRepository.update with apartment-row mutex locks.
   */
  static async updateMaintenance(id, data, user, req = null) {
    const record = await this.getMaintenanceById(id, user);

    if (['RESOLVED', 'CANCELLED'].includes(record.status) && (data.status === undefined || data.status === record.status)) {
      throw new ValidationError(`Cannot update maintenance request: Current status is already '${record.status}'.`);
    }

    await MaintenanceRepository.update(id, data);
    const updated = await MaintenanceRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'MAINTENANCE_UPDATED',
      entityType: 'maintenance',
      entityId: String(id),
      oldValues: {
        priority: record.priority,
        status: record.status,
        blocking_unit: record.blocking_unit,
        apartment_id: record.apartment_id,
      },
      newValues: data,
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

    // DEC-2.5B-04: Flexible Evidence Policy
    const ALLOWED_EXEMPTIONS = ['TENANT_PRIVACY', 'PRIVACY_RESTRICTION', 'EMERGENCY_CONTAINMENT', 'DEVICE_FAILURE', 'NON_VISUAL_REPAIR', 'OTHER'];
    let attachedEvidence = null;
    let photoExemptionReason = data?.photo_exemption_reason || data?.photoExemptionReason || data?.exemption_reason || null;

    if (photoExemptionReason) {
      photoExemptionReason = String(photoExemptionReason).trim().toUpperCase();
      if (!ALLOWED_EXEMPTIONS.includes(photoExemptionReason)) {
        throw new ValidationError(`Invalid photo exemption reason '${photoExemptionReason}'. Allowed: ${ALLOWED_EXEMPTIONS.join(', ')}`);
      }
    }

    // If photo or fileData is provided directly in resolve payload, store evidence
    const rawPhoto = data?.photo || data?.fileData || data?.fileBase64 || data?.evidence;
    if (rawPhoto) {
      attachedEvidence = await this.attachEvidence(id, {
        fileData: rawPhoto,
        evidenceCategory: data?.evidenceCategory || 'MAINTENANCE_AFTER',
        caption: data?.caption || `Post-repair evidence for ${record.issue_code}`,
      }, user, req);
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await executeWithDeadlockRetry(async () => {
      await pool.withTransaction(async (conn) => {
        // 1. Lock maintenance request row
        const [maintRows] = await conn.query('SELECT * FROM maintenance_requests WHERE id = ? FOR UPDATE', [id]);
        if (!maintRows || maintRows.length === 0) {
          throw new NotFoundError(`Maintenance request #${id} not found.`);
        }
        const currentMaint = maintRows[0];
        if (['RESOLVED', 'CANCELLED'].includes(currentMaint.status)) {
          throw new ValidationError(`Cannot resolve request: Current status is already '${currentMaint.status}'.`);
        }

        await conn.query(
          `UPDATE maintenance_requests 
           SET status = 'RESOLVED', 
               resolved_at = ?, 
               resolution_notes = ?, 
               actual_cost = ?, 
               updated_at = NOW() 
           WHERE id = ?`,
          [nowStr, resolutionNotes.trim(), costNum, id]
        );

        // 2. Concurrency Hardening: Coordinate turnover through apartment lock
        if (record.apartment_id) {
          const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [record.apartment_id]);
          if (aptRows && aptRows.length > 0) {
            const apt = aptRows[0];

            // Check if ANY other active blocking requests remain (blocking_unit = 1 OR priority = 'CRITICAL')
            const [remRows] = await conn.query(
              `SELECT COUNT(*) as count 
               FROM maintenance_requests 
               WHERE apartment_id = ? 
                 AND id != ? 
                 AND status NOT IN ('RESOLVED', 'CANCELLED') 
                 AND (blocking_unit = 1 OR priority = 'CRITICAL')`,
              [record.apartment_id, id]
            );
            const remainingCount = parseInt(remRows[0]?.count || 0, 10);

            if (remainingCount === 0) {
              await conn.query(
                'UPDATE apartments SET maintenance_status = "OPERATIONAL", updated_at = NOW() WHERE id = ?',
                [apt.id]
              );

              // Turnover logic:
              // If unit was in MAINTENANCE, evaluate turnover without clobbering checked-in stays
              if (apt.status === 'MAINTENANCE') {
                const todayStr = new Date().toISOString().slice(0, 10);
                const [activeRes] = await conn.query(
                  `SELECT id FROM reservations 
                   WHERE apartment_id = ? 
                     AND status = 'CHECKED_IN' 
                     AND check_in_date <= ? 
                     AND check_out_date > ? 
                   LIMIT 1`,
                  [apt.id, todayStr, todayStr]
                );

                if (activeRes.length > 0) {
                  await conn.query('UPDATE apartments SET status = "OCCUPIED", updated_at = NOW() WHERE id = ?', [apt.id]);
                } else {
                  const [activeBlocked] = await conn.query(
                    `SELECT id FROM blocked_periods 
                     WHERE apartment_id = ? 
                       AND start_date <= ? 
                       AND end_date >= ? 
                     LIMIT 1`,
                    [apt.id, todayStr, todayStr]
                  );
                  if (activeBlocked.length > 0) {
                    await conn.query('UPDATE apartments SET status = "BLOCKED", updated_at = NOW() WHERE id = ?', [apt.id]);
                  } else {
                    await conn.query(
                      'UPDATE apartments SET status = "CLEANING", housekeeping_status = "DIRTY", updated_at = NOW() WHERE id = ?',
                      [apt.id]
                    );
                  }
                }
              }
            }
          }
        }
      });
    });

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

    // Employee activity logging
    if (user?.id) {
      EmployeeActivitiesService.recordUserActivity(user.id, {
        property_id: record.property_id,
        activity_type: 'MAINTENANCE_RESOLVED',
        activity_category: 'MAINTENANCE',
        related_entity_type: 'maintenance',
        related_entity_id: id,
        description: `Resolved maintenance issue ${record.issue_code}: ${record.issue_title}`,
        metadata: { issue_code: record.issue_code, actual_cost: costNum }
      }).catch(() => {});
    }

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

    await executeWithDeadlockRetry(async () => {
      await pool.withTransaction(async (conn) => {
        const [maintRows] = await conn.query('SELECT * FROM maintenance_requests WHERE id = ? FOR UPDATE', [id]);
        if (!maintRows || maintRows.length === 0) {
          throw new NotFoundError(`Maintenance request #${id} not found.`);
        }
        const currentMaint = maintRows[0];
        if (currentMaint.status === 'RESOLVED') {
          throw new ValidationError('Cannot cancel an already resolved maintenance request.');
        }

        await conn.query(
          `UPDATE maintenance_requests 
           SET status = 'CANCELLED', 
               resolution_notes = ?, 
               updated_at = NOW() 
           WHERE id = ?`,
          [`Cancelled: ${reason}`, id]
        );

        if (record.apartment_id) {
          const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [record.apartment_id]);
          if (aptRows && aptRows.length > 0) {
            const apt = aptRows[0];

            const [remRows] = await conn.query(
              `SELECT COUNT(*) as count 
               FROM maintenance_requests 
               WHERE apartment_id = ? 
                 AND id != ? 
                 AND status NOT IN ('RESOLVED', 'CANCELLED') 
                 AND (blocking_unit = 1 OR priority = 'CRITICAL')`,
              [record.apartment_id, id]
            );
            const remainingCount = parseInt(remRows[0]?.count || 0, 10);

            if (remainingCount === 0) {
              await conn.query(
                'UPDATE apartments SET maintenance_status = "OPERATIONAL", updated_at = NOW() WHERE id = ?',
                [apt.id]
              );

              if (apt.status === 'MAINTENANCE') {
                const todayStr = new Date().toISOString().slice(0, 10);
                const [activeRes] = await conn.query(
                  `SELECT id FROM reservations 
                   WHERE apartment_id = ? 
                     AND status = 'CHECKED_IN' 
                     AND check_in_date <= ? 
                     AND check_out_date > ? 
                   LIMIT 1`,
                  [apt.id, todayStr, todayStr]
                );

                if (activeRes.length > 0) {
                  await conn.query('UPDATE apartments SET status = "OCCUPIED", updated_at = NOW() WHERE id = ?', [apt.id]);
                } else {
                  const [activeBlocked] = await conn.query(
                    `SELECT id FROM blocked_periods 
                     WHERE apartment_id = ? 
                       AND start_date <= ? 
                       AND end_date >= ? 
                     LIMIT 1`,
                    [apt.id, todayStr, todayStr]
                  );
                  if (activeBlocked.length > 0) {
                    await conn.query('UPDATE apartments SET status = "BLOCKED", updated_at = NOW() WHERE id = ?', [apt.id]);
                  } else {
                    await conn.query(
                      'UPDATE apartments SET status = "CLEANING", housekeeping_status = "DIRTY", updated_at = NOW() WHERE id = ?',
                      [apt.id]
                    );
                  }
                }
              }
            }
          }
        }
      });
    });

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

  /**
   * Get eligible maintenance technicians for property dispatch
   * Binding Policies: DEC-2.5B-01, DEC-2.5B-02, DEC-2.5B-03
   */
  static async getEligibleTechnicians(propertyId, user = null, query = {}) {
    let targetPropId = null;
    if (propertyId && propertyId !== 'all') {
      targetPropId = parseInt(propertyId, 10);
    } else if (user && user.propertyId) {
      targetPropId = parseInt(user.propertyId, 10);
    }

    if (user && targetPropId) {
      this.validatePropertyScope(user, targetPropId);
    }

    // Get configured workload warning threshold
    const settRows = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = "maintenance_workload_warning_threshold" LIMIT 1'
    );
    const threshold = settRows && settRows.length > 0 && !isNaN(parseInt(settRows[0].setting_value, 10))
      ? parseInt(settRows[0].setting_value, 10)
      : 5;

    // Fetch candidate staff users
    let userSql = `
      SELECT u.id, u.name, u.email, u.role, u.status, u.property_id
      FROM users u
      WHERE u.role IN ('STAFF', 'OPERATIONS_MANAGER', 'MANAGER', 'ADMIN')
        AND u.status = 'ACTIVE'
    `;
    const params = [];
    if (targetPropId) {
      userSql += ' AND (u.property_id = ? OR u.property_id IS NULL)';
      params.push(targetPropId);
    }
    userSql += ' ORDER BY u.id ASC';

    const candidates = await pool.query(userSql, params);
    const results = [];

    for (const cand of candidates) {
      // 1. Resolve employee record (DEC-2.5B-01 Option A)
      const employee = await IdentityResolverService.resolveEmployeeFromUser(cand.id);

      // Workload calculation (DEC-2.5B-03 Option B)
      const wRows = await pool.query(
        'SELECT COUNT(*) as count FROM maintenance_requests WHERE assigned_to_id = ? AND status IN ("OPEN", "IN_PROGRESS")',
        [cand.id]
      );
      const activeWorkload = wRows && wRows.length > 0 ? parseInt(wRows[0].count, 10) : 0;
      const isOverloaded = activeWorkload >= threshold;
      const workloadWarning = isOverloaded
        ? `Technician has ${activeWorkload} active work orders (threshold: ${threshold})`
        : null;

      if (!employee) {
        // Unmapped staff - DEC-2.5B-01 Option A: strictly NOT_ELIGIBLE
        results.push({
          userId: cand.id,
          name: cand.name,
          email: cand.email,
          role: cand.role,
          userStatus: cand.status,
          propertyId: cand.property_id,
          employee: null,
          dispatchEligibility: 'NOT_ELIGIBLE',
          canDispatch: false,
          eligibilityReason: 'NO_EMPLOYEE_RECORD',
          notes: 'User account has no linked employee profile. Formal HR onboarding required before dispatch eligibility.',
          activeWorkload,
          isOverloaded,
          workloadWarning,
          workloadWarningThreshold: threshold,
        });
        continue;
      }

      if (employee.employment_status !== 'ACTIVE') {
        results.push({
          userId: cand.id,
          name: cand.name,
          email: cand.email,
          role: cand.role,
          userStatus: cand.status,
          propertyId: cand.property_id,
          employee: {
            id: employee.id,
            employeeCode: employee.employee_code,
            fullName: employee.full_name,
            department: employee.department,
            jobTitle: employee.job_title,
            status: employee.employment_status,
          },
          dispatchEligibility: 'NOT_ELIGIBLE',
          canDispatch: false,
          eligibilityReason: `EMPLOYEE_STATUS_${employee.employment_status}`,
          notes: `Employee employment status is ${employee.employment_status}.`,
          activeWorkload,
          isOverloaded,
          workloadWarning,
          workloadWarningThreshold: threshold,
        });
        continue;
      }

      // 2. Check approved leave today
      const leaveRows = await pool.query(
        `SELECT id, request_code, start_date, end_date
         FROM leave_requests
         WHERE employee_id = ?
           AND status = 'APPROVED'
           AND CURDATE() BETWEEN start_date AND end_date
         LIMIT 1`,
        [employee.id]
      );
      if (leaveRows && leaveRows.length > 0) {
        const leave = leaveRows[0];
        results.push({
          userId: cand.id,
          name: cand.name,
          email: cand.email,
          role: cand.role,
          userStatus: cand.status,
          propertyId: cand.property_id,
          employee: {
            id: employee.id,
            employeeCode: employee.employee_code,
            fullName: employee.full_name,
            department: employee.department,
            jobTitle: employee.job_title,
            status: employee.employment_status,
          },
          dispatchEligibility: 'NOT_ELIGIBLE',
          canDispatch: false,
          eligibilityReason: 'ON_APPROVED_LEAVE',
          leaveDetails: {
            requestCode: leave.request_code,
            startDate: leave.start_date,
            endDate: leave.end_date,
          },
          notes: `Technician is on approved leave (${leave.start_date} to ${leave.end_date}).`,
          activeWorkload,
          isOverloaded,
          workloadWarning,
          workloadWarningThreshold: threshold,
        });
        continue;
      }

      // 3. Check published shift today
      const shiftRows = await pool.query(
        `SELECT s.id, s.start_time, s.end_time, s.department, s.status, r.roster_code, r.title as roster_title
         FROM shifts s
         JOIN rosters r ON r.id = s.roster_id
         WHERE s.employee_id = ?
           AND s.shift_date = CURDATE()
           AND r.status = 'PUBLISHED'
           AND s.status != 'CANCELLED'
         LIMIT 1`,
        [employee.id]
      );
      const todayShift = shiftRows && shiftRows.length > 0 ? shiftRows[0] : null;

      // 4. Check active attendance today
      const attRows = await pool.query(
        `SELECT id, work_date, clock_in_time, clock_out_time, clock_in_method,
                is_verified, requires_review, verification_notes, location_lat, location_lng
         FROM attendance_records
         WHERE employee_id = ?
           AND work_date = CURDATE()
           AND clock_out_time IS NULL
         ORDER BY id DESC
         LIMIT 1`,
        [employee.id]
      );
      const activeAttendance = attRows && attRows.length > 0 ? attRows[0] : null;

      // 5. Determine eligibility state
      let dispatchEligibility = 'NOT_ELIGIBLE';
      let canDispatch = false;
      let eligibilityReason = null;
      let attendanceWarning = null;

      if (activeAttendance) {
        if (activeAttendance.requires_review == 1 || activeAttendance.requires_review === true) {
          // DEC-2.5B-02 Option A: Permissive dispatch during geofence review
          dispatchEligibility = 'ATTENDANCE_UNDER_REVIEW';
          canDispatch = true;
          attendanceWarning = 'GEOFENCE_REVIEW_PENDING';
          eligibilityReason = 'CLOCK_IN_GEOFENCE_EXCEPTION_UNDER_REVIEW';
        } else if (activeAttendance.is_verified == 1 || activeAttendance.is_verified === true) {
          dispatchEligibility = 'VERIFIED_ON_DUTY';
          canDispatch = true;
          eligibilityReason = 'VERIFIED_ATTENDANCE';
        } else {
          dispatchEligibility = 'CLOCKED_IN_UNVERIFIED';
          canDispatch = true;
          eligibilityReason = 'UNVERIFIED_ATTENDANCE';
        }
      } else if (todayShift) {
        dispatchEligibility = 'SCHEDULED';
        canDispatch = true;
        eligibilityReason = 'SCHEDULED_TODAY';
      } else {
        dispatchEligibility = 'NOT_ELIGIBLE';
        canDispatch = false;
        eligibilityReason = 'NOT_ON_DUTY_OR_SCHEDULED';
      }

      results.push({
        userId: cand.id,
        name: cand.name,
        email: cand.email,
        role: cand.role,
        userStatus: cand.status,
        propertyId: cand.property_id,
        employee: {
          id: employee.id,
          employeeCode: employee.employee_code,
          fullName: employee.full_name,
          department: employee.department,
          jobTitle: employee.job_title,
          status: employee.employment_status,
        },
        dispatchEligibility,
        canDispatch,
        eligibilityReason,
        attendanceWarning,
        shiftDetails: todayShift ? {
          shiftId: todayShift.id,
          startTime: todayShift.start_time,
          endTime: todayShift.end_time,
          department: todayShift.department,
          rosterCode: todayShift.roster_code,
        } : null,
        attendanceDetails: activeAttendance ? {
          attendanceId: activeAttendance.id,
          clockInTime: activeAttendance.clock_in_time,
          clockInMethod: activeAttendance.clock_in_method,
          isVerified: Boolean(activeAttendance.is_verified),
          requiresReview: Boolean(activeAttendance.requires_review),
          verificationNotes: activeAttendance.verification_notes,
        } : null,
        activeWorkload,
        isOverloaded,
        workloadWarning,
        workloadWarningThreshold: threshold,
      });
    }

    const eligibleCount = results.filter((r) => r.canDispatch).length;

    return {
      propertyId: targetPropId,
      threshold,
      totalCandidates: results.length,
      eligibleCount,
      technicians: results,
    };
  }

  /**
   * Attach evidence to a maintenance work order (or document written exemption)
   * DEC-2.5B-04: Flexible Evidence Policy
   */
  static async attachEvidence(workOrderId, data, user = null, req = null) {
    const record = await this.getMaintenanceById(workOrderId, user);

    // 1. Check for documented written exemption
    const isExemption = Boolean(data?.isExemption || data?.is_exemption);
    const exemptionReason = data?.photo_exemption_reason || data?.photoExemptionReason || data?.exemption_reason || null;
    const exemptionNotes = data?.exemption_notes || data?.exemptionNotes || data?.notes || data?.justification || null;

    const ALLOWED_EXEMPTIONS = ['TENANT_PRIVACY', 'PRIVACY_RESTRICTION', 'EMERGENCY_CONTAINMENT', 'DEVICE_FAILURE', 'NON_VISUAL_REPAIR', 'OTHER'];

    if (isExemption || (exemptionReason && !data?.fileData && !data?.fileBase64 && !data?.file && !data?.photo)) {
      const cleanReason = String(exemptionReason || 'OTHER').trim().toUpperCase();
      if (!ALLOWED_EXEMPTIONS.includes(cleanReason)) {
        throw new ValidationError(`Invalid photo exemption reason '${cleanReason}'. Allowed: ${ALLOWED_EXEMPTIONS.join(', ')}`);
      }
      if (!exemptionNotes || exemptionNotes.trim().length < 3) {
        throw new ValidationError('A documented explanation (minimum 3 characters) is required for written evidence exemption.');
      }

      await AuditService.record({
        req,
        actorId: user?.id,
        actorEmail: user?.email,
        actorRole: user?.role,
        action: 'MAINTENANCE_EVIDENCE_EXEMPTION',
        entityType: 'maintenance',
        entityId: String(workOrderId),
        newValues: {
          workOrderReference: record.issue_code,
          exemptionReason: cleanReason,
          exemptionNotes: exemptionNotes.trim(),
        },
      });

      return {
        isExemption: true,
        maintenanceId: record.id,
        workOrderReference: record.issue_code,
        exemptionReason: cleanReason,
        exemptionNotes: exemptionNotes.trim(),
        recordedAt: new Date().toISOString(),
        message: 'Written photo exemption documented successfully',
      };
    }

    // 2. Decode image file payload
    const rawData = data?.fileData || data?.fileBase64 || data?.file || data?.photo || data?.image;
    if (!rawData) {
      throw new ValidationError('Either image file data or an approved photo exemption reason is required.');
    }

    let buffer;
    let base64String = String(rawData);
    const matches = base64String.match(/^data:([A-Za-z0-9+/.-]+);base64,(.+)$/);
    if (matches) {
      base64String = matches[2];
    }
    try {
      buffer = Buffer.from(base64String, 'base64');
    } catch {
      throw new ValidationError('Failed to decode base64 file data.');
    }

    if (!buffer || buffer.length === 0) {
      throw new ValidationError('Uploaded file is empty (0 bytes).');
    }

    const category = data?.evidenceCategory || data?.evidence_category || 'MAINTENANCE_AFTER';
    const caption = data?.caption ? String(data.caption).trim() : null;
    const originalFileName = data?.originalFileName || data?.fileName || 'evidence.jpg';

    const PrivateStorageService = require('./privateStorage.service');
    return PrivateStorageService.storeMaintenanceEvidence({
      workOrderId: record.id,
      workOrderReference: record.issue_code,
      propertyId: record.property_id,
      apartmentId: record.apartment_id,
      evidenceCategory: category,
      fileBuffer: buffer,
      originalFileName,
      caption,
      uploadedById: user?.id || 1,
      req,
    });
  }

  /**
   * List evidence attachments for a work order
   */
  static async listEvidence(workOrderId, user = null) {
    const PrivateStorageService = require('./privateStorage.service');
    return PrivateStorageService.listEvidence(workOrderId, user);
  }

  /**
   * Get evidence file stream with traversal check
   */
  static async getEvidenceStream(workOrderId, evidenceId, user = null, req = null) {
    const PrivateStorageService = require('./privateStorage.service');
    return PrivateStorageService.getEvidenceStream(workOrderId, evidenceId, user);
  }

  /**
   * Delete evidence attachment with authorization and audit logging
   */
  static async deleteEvidence(workOrderId, evidenceId, data = {}, user = null, req = null) {
    const PrivateStorageService = require('./privateStorage.service');
    return PrivateStorageService.purgeEvidenceRecord(
      workOrderId,
      evidenceId,
      user,
      data?.justification || data?.reason,
      req
    );
  }

  /**
   * Delete maintenance request (Admin only)
   * Hardened: releases blocked unit if no other blocking tickets remain,
   * preserves evidence attachments snapshot with work_order_reference
   */
  static async deleteMaintenance(id, user = null, req = null) {
    const actorRole = (user?.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(actorRole)) {
      throw new ForbiddenError('Only Super Admin or Admin can delete maintenance work orders.');
    }

    const record = await this.getMaintenanceById(id, user);

    const isBlocking = record.blocking_unit === 1 || record.blocking_unit === true || record.priority === 'CRITICAL';

    await pool.withTransaction(async (conn) => {
      // 1. If unit was in MAINTENANCE, check if other blocking tickets remain
      if (record.apartment_id && isBlocking) {
        const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [record.apartment_id]);
        if (aptRows.length > 0) {
          const apt = aptRows[0];
          const [remRows] = await conn.query(
            `SELECT COUNT(*) as count 
             FROM maintenance_requests 
             WHERE apartment_id = ? 
               AND id != ? 
               AND status NOT IN ('RESOLVED', 'CANCELLED') 
               AND (blocking_unit = 1 OR priority = 'CRITICAL')`,
            [record.apartment_id, id]
          );
          const remainingCount = parseInt(remRows[0]?.count || 0, 10);
          if (remainingCount === 0) {
            await conn.query('UPDATE apartments SET maintenance_status = "OPERATIONAL", updated_at = NOW() WHERE id = ?', [apt.id]);
            if (apt.status === 'MAINTENANCE') {
              const todayStr = new Date().toISOString().slice(0, 10);
              const [activeRes] = await conn.query(
                `SELECT id FROM reservations 
                 WHERE apartment_id = ? AND status = 'CHECKED_IN' AND check_in_date <= ? AND check_out_date > ? LIMIT 1`,
                [record.apartment_id, todayStr, todayStr]
              );
              if (activeRes.length > 0) {
                await conn.query('UPDATE apartments SET status = "OCCUPIED", updated_at = NOW() WHERE id = ?', [record.apartment_id]);
              } else {
                const [activeBlocked] = await conn.query(
                  `SELECT id FROM blocked_periods WHERE apartment_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1`,
                  [record.apartment_id, todayStr, todayStr]
                );
                if (activeBlocked.length > 0) {
                  await conn.query('UPDATE apartments SET status = "BLOCKED", updated_at = NOW() WHERE id = ?', [record.apartment_id]);
                } else {
                  await conn.query('UPDATE apartments SET status = "CLEANING", housekeeping_status = "DIRTY", updated_at = NOW() WHERE id = ?', [record.apartment_id]);
                }
              }
            }
          }
        }
      }

      // 2. Ensure work_order_reference is populated on all attachments before deletion
      await conn.query(
        'UPDATE operational_evidence_attachments SET work_order_reference = ? WHERE maintenance_id = ? AND (work_order_reference IS NULL OR work_order_reference = "")',
        [record.issue_code, id]
      );

      // 3. Delete work order (foreign key ON DELETE SET NULL disassociates maintenance_id but preserves row)
      await conn.query('DELETE FROM maintenance_requests WHERE id = ?', [id]);
    });

    // 4. Record immutable audit log
    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'MAINTENANCE_DELETED',
      entityType: 'maintenance',
      entityId: String(id),
      oldValues: {
        issueCode: record.issue_code,
        issueTitle: record.issue_title,
        propertyId: record.property_id,
        apartmentId: record.apartment_id,
        status: record.status,
      },
    });

    return {
      success: true,
      deletedId: id,
      issueCode: record.issue_code,
      message: 'Maintenance request deleted successfully; evidence references preserved.',
    };
  }
}

module.exports = MaintenanceService;
