const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EmployeesRepository = require('./employees.repository');
const EmployeeActivitiesService = require('./employeeActivities.service');
const EmployeePerformanceService = require('./employeePerformance.service');
const EmployeeEvaluationsService = require('./employeeEvaluations.service');
const EmployeeIdCardsService = require('./employeeIdCards.service');
const AccessControlService = require('../../core/access/accessControl.service');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError, BadRequestError } = require('../../core/errors/apiError');
const pool = require('../../db/pool');

const ALLOWED_PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

class EmployeesService {
  /**
   * List employees with filtering and property scoping
   */
  static async listEmployees(query, req = null) {
    const user = req?.user;
    return EmployeesRepository.findAll({
      ...query,
      user,
    });
  }

  /**
   * Get employee by ID with property scoping
   */
  static async getEmployeeById(id, req = null) {
    const employee = await EmployeesRepository.findById(id);
    if (!employee) {
      throw new NotFoundError(`Employee #${id} not found.`);
    }

    const user = req?.user;
    if (
      user &&
      user.propertyId &&
      !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((user.role || '').toUpperCase()) &&
      employee.property_id &&
      parseInt(employee.property_id, 10) !== parseInt(user.propertyId, 10)
    ) {
      throw new ForbiddenError('Access denied: You do not have authorization for this property.');
    }

    employee.profile = {
      date_of_birth: employee.date_of_birth,
      gender: employee.gender,
      address: employee.address,
      address_line1: employee.address,
      city: employee.city,
      state: employee.state,
      postal_code: employee.postal_code,
      emergency_contact_name: employee.emergency_contact_name,
      emergency_contact_phone: employee.emergency_contact_phone,
      emergency_contact_relation: employee.emergency_contact_relation,
      emergency_contact_relationship: employee.emergency_contact_relation,
      qualifications: employee.qualifications,
      skills: employee.skills,
      bio_notes: employee.bio_notes,
    };

    return employee;
  }

  /**
   * Get employee directory statistics
   */
  static async getStats(query, req = null) {
    const user = req?.user;
    return EmployeesRepository.getStats({
      ...query,
      user,
    });
  }

  /**
   * Register new employee
   */
  static async createEmployee(data, req = null) {
    const user = req?.user;

    // Capability check: EMPLOYEE_CREATE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_CREATE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Employee creation requires authorized capability (${capCheck.reason}).`);
    }

    if (!data.first_name || !data.first_name.trim()) {
      throw new ValidationError('First name is required.');
    }
    if (!data.last_name || !data.last_name.trim()) {
      throw new ValidationError('Last name is required.');
    }
    if (!data.email || !data.email.trim()) {
      throw new ValidationError('Email address is required.');
    }
    if (!data.phone || !data.phone.trim()) {
      throw new ValidationError('Phone number is required.');
    }
    if (!data.job_title || !data.job_title.trim()) {
      throw new ValidationError('Job title / position is required.');
    }

    const cleanEmail = data.email.trim().toLowerCase();
    const existingEmail = await EmployeesRepository.findByEmail(cleanEmail);
    if (existingEmail) {
      throw new ConflictError(`An employee with email '${cleanEmail}' already exists (ID: #${existingEmail.id}).`);
    }

    // Property scoping for creator
    let propertyId = data.property_id ? parseInt(data.property_id, 10) : null;
    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((user.role || '').toUpperCase())) {
      propertyId = parseInt(user.propertyId, 10);
    }

    // Auto-generate employee code if not provided
    const rawCode = data.employee_code || data.staff_code;
    let employeeCode = rawCode ? rawCode.trim().toUpperCase() : null;
    if (!employeeCode) {
      const randomSuffix = Math.floor(Math.random() * 900 + 100);
      employeeCode = `BFA-EMP-${Date.now().toString().slice(-4)}${randomSuffix}`;
    }

    const existingCode = await EmployeesRepository.findByCode(employeeCode);
    if (existingCode) {
      throw new ConflictError(`Employee code '${employeeCode}' is already in use.`);
    }

    let insertId;
    await pool.withTransaction(async (conn) => {
      insertId = await EmployeesRepository.create(
        {
          employee_code: employeeCode,
          user_id: data.user_id ? parseInt(data.user_id, 10) : null,
          property_id: propertyId,
          manager_id: data.manager_id ? parseInt(data.manager_id, 10) : null,
          first_name: data.first_name,
          last_name: data.last_name,
          email: cleanEmail,
          phone: data.phone,
          department: data.department || 'OPERATIONS',
          job_title: data.job_title,
          employment_type: data.employment_type || 'FULL_TIME',
          employment_status: data.employment_status || 'ACTIVE',
          hire_date: data.hire_date || new Date().toISOString().slice(0, 10),
          photo_url: data.photo_url || null,
        },
        conn
      );

      // Create profile record if profile fields supplied
      await EmployeesRepository.upsertProfile(
        insertId,
        {
          date_of_birth: data.date_of_birth,
          gender: data.gender,
          address: data.address,
          city: data.city,
          state: data.state,
          postal_code: data.postal_code,
          emergency_contact_name: data.emergency_contact_name,
          emergency_contact_phone: data.emergency_contact_phone,
          emergency_contact_relation: data.emergency_contact_relation,
          qualifications: data.qualifications,
          skills: data.skills,
          bio_notes: data.bio_notes,
        },
        conn
      );

      // Record activity
      await EmployeeActivitiesService.recordActivity(
        {
          employeeId: insertId,
          propertyId,
          activityType: 'EMPLOYEE_CREATED',
          activityCategory: 'PROFILE',
          description: `Employee record created: ${data.first_name} ${data.last_name} (${employeeCode})`,
          relatedEntityType: 'employee',
          relatedEntityId: insertId,
        },
        conn
      );
    });

    const created = await EmployeesRepository.findById(insertId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_CREATED',
      entityType: 'employee',
      entityId: String(insertId),
      newValues: {
        employeeCode,
        fullName: created.full_name,
        email: cleanEmail,
        department: created.department,
        jobTitle: created.job_title,
      },
    });

    return created;
  }

  /**
   * Update employee record
   */
  static async updateEmployee(id, data, req = null) {
    const existing = await this.getEmployeeById(id, req);
    const user = req?.user;

    // Capability check: EMPLOYEE_UPDATE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_UPDATE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Employee update requires authorized capability (${capCheck.reason}).`);
    }

    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      const existingEmail = await EmployeesRepository.findByEmail(cleanEmail);
      if (existingEmail && parseInt(existingEmail.id, 10) !== parseInt(id, 10)) {
        throw new ConflictError(`Email '${cleanEmail}' is already registered to another employee (#${existingEmail.id}).`);
      }
    }

    // Normalize profile aliases
    const normalizedData = { ...data };
    if (normalizedData.address_line1 && !normalizedData.address) {
      normalizedData.address = normalizedData.address_line1;
    }
    if (normalizedData.emergency_contact_relationship && !normalizedData.emergency_contact_relation) {
      normalizedData.emergency_contact_relation = normalizedData.emergency_contact_relationship;
    }

    await pool.withTransaction(async (conn) => {
      await EmployeesRepository.update(id, normalizedData, conn);

      // Upsert profile fields if provided
      if (
        normalizedData.date_of_birth !== undefined ||
        normalizedData.gender !== undefined ||
        normalizedData.address !== undefined ||
        normalizedData.city !== undefined ||
        normalizedData.state !== undefined ||
        normalizedData.postal_code !== undefined ||
        normalizedData.emergency_contact_name !== undefined ||
        normalizedData.emergency_contact_phone !== undefined ||
        normalizedData.emergency_contact_relation !== undefined ||
        normalizedData.qualifications !== undefined ||
        normalizedData.skills !== undefined ||
        normalizedData.bio_notes !== undefined
      ) {
        await EmployeesRepository.upsertProfile(id, normalizedData, conn);
      }

      await EmployeeActivitiesService.recordActivity(
        {
          employeeId: id,
          propertyId: existing.property_id,
          activityType: 'PROFILE_UPDATED',
          activityCategory: 'PROFILE',
          description: `Employee profile updated by management (${user?.name || 'Admin'})`,
          relatedEntityType: 'employee',
          relatedEntityId: id,
        },
        conn
      );
    });

    const updated = await this.getEmployeeById(id, req);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_UPDATED',
      entityType: 'employee',
      entityId: String(id),
      oldValues: {
        fullName: existing.full_name,
        department: existing.department,
        jobTitle: existing.job_title,
        status: existing.employment_status,
      },
      newValues: {
        fullName: updated.full_name,
        department: updated.department,
        jobTitle: updated.job_title,
        status: updated.employment_status,
      },
    });

    return updated;
  }

  /**
   * Update employment status (ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED)
   */
  static async updateStatus(id, statusInput, req = null) {
    const existing = await this.getEmployeeById(id, req);
    const user = req?.user;

    const rawStatus = typeof statusInput === 'object' && statusInput !== null
      ? (statusInput.status || statusInput.employment_status)
      : statusInput;
    const rawReason = typeof statusInput === 'object' && statusInput !== null
      ? (statusInput.reason || statusInput.status_reason)
      : 'Employment status adjustment';

    const validStatuses = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'];
    const cleanStatus = String(rawStatus || '').toUpperCase();
    if (!validStatuses.includes(cleanStatus)) {
      throw new ValidationError(`Invalid employment status. Allowed values: ${validStatuses.join(', ')}`);
    }

    // Capability check: EMPLOYEE_DEACTIVATE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_DEACTIVATE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Status update requires authorized capability (${capCheck.reason}).`);
    }

    const terminationDate = cleanStatus === 'TERMINATED' ? new Date().toISOString().slice(0, 10) : null;

    await pool.withTransaction(async (conn) => {
      await EmployeesRepository.update(
        id,
        {
          employment_status: cleanStatus,
          termination_date: terminationDate,
        },
        conn
      );

      // If terminated or suspended, revoke active ID card (Gate 11.12)
      if (['TERMINATED', 'SUSPENDED'].includes(cleanStatus)) {
        const activeCard = await EmployeeIdCardsService.getActiveCardForEmployee(id, req).catch(() => null);
        if (activeCard) {
          await EmployeeIdCardsService.revokeCard(
            activeCard.id,
            { reason: `Automatic card revocation due to employment status change (${cleanStatus})` },
            user,
            req
          );
        }
      }

      await EmployeeActivitiesService.recordActivity(
        {
          employeeId: id,
          propertyId: existing.property_id,
          activityType: 'STATUS_CHANGED',
          activityCategory: 'SECURITY',
          description: `Employment status changed from ${existing.employment_status} to ${cleanStatus}`,
          relatedEntityType: 'employee',
          relatedEntityId: id,
        },
        conn
      );
    });

    const updated = await EmployeesRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_STATUS_UPDATED',
      entityType: 'employee',
      entityId: String(id),
      oldValues: { status: existing.employment_status },
      newValues: { status: cleanStatus },
    });

    return updated;
  }

  /**
   * Upload & replace employee profile photo (Gate 11.4)
   * Supports base64 data URI payload or binary payload
   */
  static async uploadPhoto(id, photoData, req = null) {
    const employee = await this.getEmployeeById(id, req);
    const user = req?.user;

    // Self or authorized manager check
    const isSelf = employee.user_id && user && employee.user_id === user.id;
    if (!isSelf) {
      const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_UPDATE');
      if (!capCheck.allowed) {
        throw new ForbiddenError(`Photo upload requires authorized capability (${capCheck.reason}).`);
      }
    }

    const rawPayload = photoData?.photo_base64 || photoData?.photoBase64;
    if (!rawPayload || typeof rawPayload !== 'string') {
      throw new BadRequestError('Invalid image payload: photo_base64 or photoBase64 is required.');
    }

    // Check if it has data URI prefix
    const matches = rawPayload.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
    let mimeType = photoData?.mimeType;
    let base64String = rawPayload;

    if (matches) {
      mimeType = matches[1].toLowerCase();
      base64String = matches[2];
    } else {
      if (!/^[A-Za-z0-9+/=]+$/.test(rawPayload.trim())) {
        throw new BadRequestError('Invalid image payload: malformed base64 image data format.');
      }
      mimeType = (mimeType || 'image/jpeg').toLowerCase();
    }

    if (!ALLOWED_PHOTO_MIMES.includes(mimeType)) {
      throw new BadRequestError(`Unsupported image type '${mimeType}'. Allowed formats: JPEG, PNG, WebP.`);
    }

    let buffer;
    try {
      buffer = Buffer.from(base64String, 'base64');
    } catch {
      throw new BadRequestError('Invalid image payload: failed to decode base64 data.');
    }

    if (buffer.length > MAX_PHOTO_SIZE_BYTES) {
      throw new BadRequestError(`Photo file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the 5 MB limit.`);
    }

    // Ensure uploads directory exists
    const uploadsDir = path.resolve(__dirname, '../../../uploads/employees');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Clean up any existing photos for this employee in uploadsDir
    try {
      const existingFiles = fs.readdirSync(uploadsDir);
      for (const f of existingFiles) {
        if (f.startsWith(`emp_${employee.id}_`)) {
          fs.unlinkSync(path.join(uploadsDir, f));
        }
      }
    } catch {
      // Ignore
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const randomName = `emp_${employee.id}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const filePath = path.join(uploadsDir, randomName);
    fs.writeFileSync(filePath, buffer);

    const photoUrl = `/api/v1/employees/${employee.id}/photo`;
    await EmployeesRepository.update(id, { photo_url: photoUrl });
    const updated = await EmployeesRepository.findById(id);

    await EmployeeActivitiesService.recordActivity({
      employeeId: id,
      propertyId: employee.property_id,
      activityType: 'PROFILE_PHOTO_UPDATED',
      activityCategory: 'PROFILE',
      description: `Profile photograph updated by ${user?.name || 'User'}`,
      relatedEntityType: 'employee',
      relatedEntityId: id,
    });

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_PHOTO_UPDATED',
      entityType: 'employee',
      entityId: String(id),
      newValues: { photoFile: randomName, photoUrl },
    });

    return updated;
  }

  /**
   * Employee Self-Service: Get current logged-in employee profile (Gate 11.14)
   */
  static async getMyProfile(req) {
    const user = req?.user;
    if (!user || !user.id) {
      throw new ForbiddenError('Authentication required.');
    }

    const employee = await EmployeesRepository.findByUserId(user.id);
    if (!employee) {
      throw new NotFoundError('No employee record associated with your user account.');
    }

    return employee;
  }

  /**
   * Employee Self-Service: Update allowed personal information (Gate 11.14)
   * Strictly forbids altering employee ID, department, manager, property, or status!
   */
  static async updateMyProfile(data, req) {
    const myProfile = await this.getMyProfile(req);

    // Whitelist only allowed personal fields
    const safeData = {
      phone: data.phone !== undefined ? data.phone.trim() : myProfile.phone,
      address: data.address,
      city: data.city,
      state: data.state,
      postal_code: data.postal_code,
      emergency_contact_name: data.emergency_contact_name,
      emergency_contact_phone: data.emergency_contact_phone,
      emergency_contact_relation: data.emergency_contact_relation,
      qualifications: data.qualifications,
      skills: data.skills,
      bio_notes: data.bio_notes,
    };

    await pool.withTransaction(async (conn) => {
      await EmployeesRepository.update(myProfile.id, { phone: safeData.phone }, conn);
      await EmployeesRepository.upsertProfile(myProfile.id, safeData, conn);

      await EmployeeActivitiesService.recordActivity(
        {
          employeeId: myProfile.id,
          propertyId: myProfile.property_id,
          activityType: 'SELF_PROFILE_UPDATED',
          activityCategory: 'PROFILE',
          description: 'Employee updated personal profile details via self-service portal',
          relatedEntityType: 'employee',
          relatedEntityId: myProfile.id,
        },
        conn
      );
    });

    const updated = await EmployeesRepository.findById(myProfile.id);

    await AuditService.record({
      req,
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'EMPLOYEE_SELF_PROFILE_UPDATED',
      entityType: 'employee',
      entityId: String(myProfile.id),
    });

    return updated;
  }

  /**
   * Employee Self-Service: Get current employee performance
   */
  static async getMyPerformance(query, req) {
    const myProfile = await this.getMyProfile(req);
    return EmployeePerformanceService.getEmployeePerformance(myProfile.id, query);
  }

  /**
   * Employee Self-Service: Get current employee activities
   */
  static async getMyActivities(query, req) {
    const myProfile = await this.getMyProfile(req);
    return EmployeeActivitiesService.listActivities({ ...query, employeeId: myProfile.id }, req);
  }

  /**
   * Employee Self-Service: Get current employee evaluations
   */
  static async getMyEvaluations(query, req) {
    const myProfile = await this.getMyProfile(req);
    return EmployeeEvaluationsService.listEvaluations({ ...query, employeeId: myProfile.id, status: 'FINALIZED' }, req);
  }

  /**
   * Employee Self-Service: Get current employee active ID card
   */
  static async getMyIdCard(req) {
    const myProfile = await this.getMyProfile(req);
    return EmployeeIdCardsService.getActiveCardForEmployee(myProfile.id, req);
  }
}

module.exports = EmployeesService;
