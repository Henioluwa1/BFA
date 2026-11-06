const WorkforceRepository = require('./workforce.repository');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ForbiddenError, NotFoundError, ConflictError } = require('../../core/errors/apiError');
const pool = require('../../db/pool');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

class AttendanceService {
  /**
   * Resolve employee record associated with the authenticated user
   */
  static async resolveEmployeeFromUser(user) {
    if (!user) throw new ForbiddenError('Authentication required.');
    const rows = await pool.query('SELECT * FROM employees WHERE user_id = ?', [user.id]);
    if (rows.length === 0) {
      throw new NotFoundError(`No employee record linked to user account '${user.email}'.`);
    }
    return rows[0];
  }

  /**
   * Haversine distance calculation in meters between two coordinates
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    const R = 6371e3; // meters
    const phi1 = (parseFloat(lat1) * Math.PI) / 180;
    const phi2 = (parseFloat(lat2) * Math.PI) / 180;
    const deltaPhi = ((parseFloat(lat2) - parseFloat(lat1)) * Math.PI) / 180;
    const deltaLambda = ((parseFloat(lon2) - parseFloat(lon1)) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ─── Clock-In ──────────────────────────────────────────────────────────
  static async clockIn({ shiftId = null, clockInMethod = 'WEB', locationLat = null, locationLng = null, verificationNotes = null }, user, req = null) {
    const employee = await this.resolveEmployeeFromUser(user);
    const now = new Date();
    const workDate = now.toISOString().split('T')[0];
    const propertyId = employee.property_id || user.propertyId || 1;

    // Check for duplicate clock-in
    const active = await WorkforceRepository.getTodayActiveAttendance(employee.id, workDate);
    if (active) {
      throw new ConflictError(`Duplicate clock-in rejected: You already clocked in today at ${active.clock_in_time}. Please clock out first.`);
    }

    // Evaluate attendance policy & event-based GPS geofence
    const policy = await WorkforceRepository.getAttendancePolicy(propertyId);
    let isVerified = false;
    let evalNotes = verificationNotes || '';
    let distMeters = null;

    if (policy) {
      if (clockInMethod === 'MOBILE_LOCATION' && !policy.allow_mobile) {
        throw new ForbiddenError('Mobile attendance method is disabled for this property.');
      }

      if (policy.require_gps || policy.allow_gps) {
        if (locationLat != null && locationLng != null && policy.geofence_lat != null && policy.geofence_lng != null) {
          const dist = this.calculateDistance(locationLat, locationLng, policy.geofence_lat, policy.geofence_lng);
          distMeters = dist != null ? Math.round(dist) : null;
          const radius = policy.geofence_radius_meters || 200;
          if (dist <= radius) {
            isVerified = true;
            evalNotes = `GPS_VERIFIED: within ${distMeters}m of property`;
          } else {
            isVerified = false;
            evalNotes = `EXCEPTION_OUTSIDE_GEOFENCE: Distance ${distMeters}m exceeds ${radius}m geofence limit (FLAGGED_FOR_REVIEW)`;
          }
        } else if (policy.require_gps) {
          isVerified = false;
          evalNotes = 'EXCEPTION_GPS_UNAVAILABLE: GPS location was not provided or permission denied (FLAGGED_FOR_REVIEW)';
        } else {
          isVerified = true;
        }
      } else {
        isVerified = true;
      }
    } else {
      isVerified = true;
    }

    // Determine scheduled shift if shiftId provided or auto-detect today's shift
    // DEF-C02 (OPTION A): Punctuality is completely independent of location verification.
    let shift = null;
    let scheduledHours = 8.00;
    let attendanceStatus = 'PRESENT'; // Default punctuality is PRESENT

    if (shiftId) {
      shift = await WorkforceRepository.getShiftById(shiftId);
    } else {
      const todayShifts = await WorkforceRepository.listShifts({
        employeeId: employee.id,
        startDate: workDate,
        endDate: workDate,
      });
      if (todayShifts.length > 0) {
        shift = todayShifts[0];
      }
    }

    if (shift) {
      const startDateTime = new Date(`${workDate}T${shift.start_time}`);
      const endDateTime = new Date(`${workDate}T${shift.end_time}`);
      const durationHours = (endDateTime - startDateTime) / 3600000;
      scheduledHours = durationHours > 0 ? parseFloat(durationHours.toFixed(2)) : 8.00;

      // Late arrival detection (Grace period from policy, default 15 minutes)
      const graceMinutes = policy?.grace_period_minutes ?? 15;
      const lateThreshold = new Date(startDateTime.getTime() + graceMinutes * 60 * 1000);
      if (now > lateThreshold) {
        attendanceStatus = 'LATE';
      }
    }

    const attendanceId = await WorkforceRepository.createAttendance({
      employee_id: employee.id,
      property_id: propertyId,
      shift_id: shift ? shift.id : null,
      work_date: workDate,
      clock_in_time: now,
      clock_in_method: clockInMethod,
      location_lat: locationLat,
      location_lng: locationLng,
      is_verified: isVerified ? 1 : 0,
      verification_notes: evalNotes,
      attendance_status: attendanceStatus,
      scheduled_hours: scheduledHours,
    });

    const record = await WorkforceRepository.getAttendanceById(attendanceId);

    await AuditService.record({
      req,
      action: 'ATTENDANCE_CLOCK_IN',
      entityType: 'attendance_record',
      entityId: String(attendanceId),
      newValues: {
        id: attendanceId,
        employee_id: employee.id,
        work_date: workDate,
        clock_in_time: now,
        status: attendanceStatus,
        method: clockInMethod,
        is_verified: isVerified,
        notes: evalNotes,
      },
    });

    // If geofence verification failed, record dedicated exception audit event for managerial review
    if (!isVerified && policy && (policy.require_gps || policy.allow_gps)) {
      await AuditService.record({
        req,
        action: 'ATTENDANCE_GEOFENCE_EXCEPTION',
        entityType: 'attendance_record',
        entityId: String(attendanceId),
        newValues: {
          attendance_id: attendanceId,
          employee_id: employee.id,
          property_id: propertyId,
          work_date: workDate,
          clock_in_time: now,
          status: attendanceStatus,
          distance_meters: distMeters,
          geofence_radius: policy.geofence_radius_meters,
          notes: evalNotes,
          flagged_for_review: true,
        },
      });
    }

    return record;
  }

  // ─── Clock-Out ─────────────────────────────────────────────────────────
  static async clockOut({ attendanceId = null, locationLat = null, locationLng = null, verificationNotes = null }, user, req = null) {
    const employee = await this.resolveEmployeeFromUser(user);
    const now = new Date();
    const workDate = now.toISOString().split('T')[0];

    let record = null;
    if (attendanceId) {
      record = await WorkforceRepository.getAttendanceById(attendanceId);
    } else {
      record = await WorkforceRepository.getTodayActiveAttendance(employee.id, workDate);
    }

    if (!record) {
      throw new ConflictError('No active clock-in found. You must clock in before clocking out.');
    }
    if (record.clock_out_time) {
      throw new ConflictError(`Invalid clock-out sequence: Attendance record #${record.id} was already clocked out.`);
    }

    // Calculate actual hours
    const clockIn = new Date(record.clock_in_time);
    const totalMinutesWorked = Math.max(0, (now - clockIn) / (1000 * 60) - (record.total_break_minutes || 0));
    const actualHours = parseFloat((totalMinutesWorked / 60).toFixed(2));
    const scheduledHours = parseFloat(record.scheduled_hours || 8.00);

    // Calculate overtime (approved over scheduled shift duration)
    const overtimeHours = actualHours > scheduledHours ? parseFloat((actualHours - scheduledHours).toFixed(2)) : 0.00;

    let finalStatus = record.attendance_status;
    if (record.scheduled_end) {
      const scheduledEndTime = new Date(`${record.work_date}T${record.scheduled_end}`);
      const earlyThreshold = new Date(scheduledEndTime.getTime() - 15 * 60 * 1000);
      if (now < earlyThreshold && finalStatus === 'PRESENT') {
        finalStatus = 'EARLY_DEPARTURE';
      }
    }

    await WorkforceRepository.updateAttendance(record.id, {
      clock_out_time: now,
      actual_hours: actualHours,
      overtime_hours: overtimeHours,
      attendance_status: finalStatus,
      verification_notes: verificationNotes || record.verification_notes,
    });

    const updated = await WorkforceRepository.getAttendanceById(record.id);

    await AuditService.record({
      req,
      action: 'ATTENDANCE_CLOCK_OUT',
      entityType: 'attendance_record',
      entityId: String(record.id),
      oldValues: { clock_in_time: record.clock_in_time },
      newValues: {
        clock_out_time: now,
        actual_hours: actualHours,
        overtime_hours: overtimeHours,
        status: finalStatus,
      },
    });

    return updated;
  }

  // ─── Break Management ──────────────────────────────────────────────────
  static async startBreak(user, req = null) {
    const employee = await this.resolveEmployeeFromUser(user);
    const workDate = new Date().toISOString().split('T')[0];
    const record = await WorkforceRepository.getTodayActiveAttendance(employee.id, workDate);

    if (!record) {
      throw new ConflictError('Cannot start break without an active clock-in.');
    }
    if (record.break_start_time && !record.break_end_time) {
      throw new ConflictError('Break is already in progress.');
    }

    const now = new Date();
    await WorkforceRepository.updateAttendance(record.id, {
      break_start_time: now,
      break_end_time: null,
    });

    return WorkforceRepository.getAttendanceById(record.id);
  }

  static async endBreak(user, req = null) {
    const employee = await this.resolveEmployeeFromUser(user);
    const workDate = new Date().toISOString().split('T')[0];
    const record = await WorkforceRepository.getTodayActiveAttendance(employee.id, workDate);

    if (!record || !record.break_start_time || record.break_end_time) {
      throw new ConflictError('No active break found to end.');
    }

    const now = new Date();
    const breakMinutes = Math.round((now - new Date(record.break_start_time)) / (1000 * 60));
    const totalBreaks = (record.total_break_minutes || 0) + breakMinutes;

    await WorkforceRepository.updateAttendance(record.id, {
      break_end_time: now,
      total_break_minutes: totalBreaks,
    });

    return WorkforceRepository.getAttendanceById(record.id);
  }

  // ─── Property Kiosk Attendance (Terminal Punch) ────────────────────────
  static async kioskClock({ kioskCode, kioskSecret, employeeIdentifier, pin = null, action = 'CLOCK_IN', notes = null }, req = null) {
    if (!kioskCode || !kioskSecret || !employeeIdentifier) {
      throw new ValidationError('kioskCode, kioskSecret, and employeeIdentifier are required.');
    }

    // 1. Authenticate Kiosk terminal (Bcrypt with backward-compatible legacy auto-upgrade)
    const kiosk = await WorkforceRepository.getKioskByCode(kioskCode);
    if (!kiosk || kiosk.status !== 'ACTIVE') {
      throw new ForbiddenError('Unauthorized or inactive kiosk terminal.');
    }

    let isMatch = false;
    if (kiosk.kiosk_secret_hash && kiosk.kiosk_secret_hash.startsWith('$2')) {
      // Modern bcrypt hash comparison
      isMatch = await bcrypt.compare(kioskSecret, kiosk.kiosk_secret_hash);
    } else {
      // Legacy transition support: test plaintext match
      if (kiosk.kiosk_secret_hash === kioskSecret || (kiosk.kiosk_secret_hash && kioskSecret.includes(kiosk.kiosk_secret_hash))) {
        isMatch = true;
        // Transparently upgrade legacy plaintext to bcrypt hash on successful authentication
        try {
          const salt = await bcrypt.genSalt(10);
          const upgradedHash = await bcrypt.hash(kioskSecret, salt);
          await WorkforceRepository.updateKiosk(kiosk.id, { kiosk_secret_hash: upgradedHash });
        } catch (upgradeErr) {
          // Do not fail clock-in if upgrade write encounters transient issue
        }
      }
    }

    if (!isMatch) {
      throw new ForbiddenError('Invalid kiosk authentication credentials.');
    }

    // 2. Resolve employee by ID or Code or Email
    const empRows = await pool.query(
      `SELECT e.*, u.email, u.name AS user_name 
       FROM employees e 
       JOIN users u ON e.user_id = u.id 
       WHERE e.id = ? OR e.employee_code = ? OR u.email = ?`,
      [employeeIdentifier, employeeIdentifier, employeeIdentifier]
    );

    if (empRows.length === 0) {
      throw new NotFoundError('Employee not found for provided kiosk identifier.');
    }
    const employee = empRows[0];

    // Enforce kiosk property restriction: employee must belong to kiosk property
    if (employee.property_id && String(employee.property_id) !== String(kiosk.property_id)) {
      throw new ForbiddenError(`Kiosk restriction: Terminal is registered to Property #${kiosk.property_id}. Employee belongs to Property #${employee.property_id}.`);
    }

    const now = new Date();
    const workDate = now.toISOString().split('T')[0];

    // Update terminal heartbeat
    await WorkforceRepository.updateKiosk(kiosk.id, { last_heartbeat_at: now });

    if (action === 'CLOCK_OUT') {
      const active = await WorkforceRepository.getTodayActiveAttendance(employee.id, workDate);
      if (!active) {
        throw new ConflictError('No active clock-in found on kiosk terminal for this employee today.');
      }
      const clockIn = new Date(active.clock_in_time);
      const totalMinutesWorked = Math.max(0, (now - clockIn) / (1000 * 60) - (active.total_break_minutes || 0));
      const actualHours = parseFloat((totalMinutesWorked / 60).toFixed(2));
      const scheduledHours = parseFloat(active.scheduled_hours || 8.00);
      const overtimeHours = actualHours > scheduledHours ? parseFloat((actualHours - scheduledHours).toFixed(2)) : 0.00;

      await WorkforceRepository.updateAttendance(active.id, {
        clock_out_time: now,
        actual_hours: actualHours,
        overtime_hours: overtimeHours,
        verification_notes: `KIOSK_OUT: ${kiosk.kiosk_name} (${kiosk.kiosk_code})`,
      });
      return WorkforceRepository.getAttendanceById(active.id);
    } else {
      // CLOCK_IN
      const active = await WorkforceRepository.getTodayActiveAttendance(employee.id, workDate);
      if (active) {
        throw new ConflictError(`Employee #${employee.id} is already clocked in today.`);
      }

      const attendanceId = await WorkforceRepository.createAttendance({
        employee_id: employee.id,
        property_id: kiosk.property_id,
        shift_id: null,
        work_date: workDate,
        clock_in_time: now,
        clock_in_method: 'KIOSK',
        is_verified: 1,
        verification_notes: `KIOSK_IN: ${kiosk.kiosk_name} (${kiosk.kiosk_code})`,
        attendance_status: 'PRESENT',
        scheduled_hours: 8.00,
      });

      return WorkforceRepository.getAttendanceById(attendanceId);
    }
  }

  // ─── Manager-Assisted Attendance (Manual Logging with Audit) ───────────
  static async recordManualAttendance({ employeeId, propertyId, workDate, clockInTime, clockOutTime, breakMinutes = 0, reason }, user, req = null) {
    if (!employeeId || !workDate || !clockInTime || !reason) {
      throw new ValidationError('employeeId, workDate, clockInTime, and reason are required.');
    }

    const role = (user.role || '').toUpperCase();
    const isOpsManager = role === 'OPERATIONS_MANAGER' || role === 'MANAGER';
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role) && !isOpsManager) {
      throw new ForbiddenError('Unauthorized to record manager-assisted attendance.');
    }

    const empRows = await pool.query('SELECT * FROM employees WHERE id = ?', [employeeId]);
    if (empRows.length === 0) throw new NotFoundError('Employee not found.');
    const employee = empRows[0];

    // Maker-checker policy: Manager cannot record attendance for themselves
    if (employee.user_id === user.id) {
      throw new ForbiddenError('Maker-checker violation: Operations Managers cannot record their own attendance.');
    }

    // Property scoping
    const targetPropId = propertyId || employee.property_id || 1;
    if (isOpsManager && user.propertyId && String(user.propertyId) !== String(targetPropId)) {
      throw new ForbiddenError(`You can only record attendance for your assigned Property #${user.propertyId}.`);
    }

    const start = new Date(clockInTime);
    let end = clockOutTime ? new Date(clockOutTime) : null;
    let actualHours = 0.00;
    let overtimeHours = 0.00;

    if (end) {
      const minutes = Math.max(0, (end - start) / (1000 * 60) - parseInt(breakMinutes, 10));
      actualHours = parseFloat((minutes / 60).toFixed(2));
      overtimeHours = actualHours > 8.00 ? parseFloat((actualHours - 8.00).toFixed(2)) : 0.00;
    }

    const attendanceId = await WorkforceRepository.createAttendance({
      employee_id: employee.id,
      property_id: targetPropId,
      shift_id: null,
      work_date: workDate,
      clock_in_time: start,
      clock_out_time: end,
      total_break_minutes: parseInt(breakMinutes, 10) || 0,
      actual_hours: actualHours,
      overtime_hours: overtimeHours,
      clock_in_method: 'MANUAL',
      is_verified: 1,
      verified_by_id: user.id,
      verified_at: new Date(),
      verification_notes: `MANAGER_ASSISTED: ${reason} (Recorded by ${user.name || user.email})`,
      attendance_status: 'PRESENT',
      scheduled_hours: 8.00,
    });

    await AuditService.record({
      req,
      action: 'ATTENDANCE_MANUAL_RECORDED',
      entityType: 'attendance_record',
      entityId: String(attendanceId),
      newValues: {
        employee_id: employee.id,
        work_date: workDate,
        clock_in: start,
        clock_out: end,
        manager_id: user.id,
        reason,
      },
    });

    return WorkforceRepository.getAttendanceById(attendanceId);
  }

  // ─── Attendance Corrections (Maker-Checker Workflow) ───────────────────
  static async requestCorrection({ attendanceRecordId, requestedClockIn, requestedClockOut, reason }, user, req = null) {
    if (!attendanceRecordId || !requestedClockIn || !requestedClockOut || !reason) {
      throw new ValidationError('attendanceRecordId, requestedClockIn, requestedClockOut, and reason are required.');
    }

    const attendance = await WorkforceRepository.getAttendanceById(attendanceRecordId);
    if (!attendance) {
      throw new NotFoundError(`Attendance record #${attendanceRecordId} not found.`);
    }

    const employee = await this.resolveEmployeeFromUser(user);
    if (attendance.employee_id !== employee.id && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenError('You can only request corrections for your own attendance records.');
    }

    const correctionId = await WorkforceRepository.createAttendanceCorrection({
      attendance_record_id: attendanceRecordId,
      employee_id: employee.id,
      requested_clock_in: requestedClockIn,
      requested_clock_out: requestedClockOut,
      reason,
    });

    await AuditService.record({
      req,
      action: 'ATTENDANCE_CORRECTION_REQUESTED',
      entityType: 'attendance_correction',
      entityId: String(correctionId),
      newValues: {
        attendance_record_id: attendanceRecordId,
        requested_clock_in: requestedClockIn,
        requested_clock_out: requestedClockOut,
        reason,
      },
    });

    return WorkforceRepository.getAttendanceCorrectionById(correctionId);
  }

  static async reviewCorrection(correctionId, { action, reviewNotes }, user, req = null) {
    const correction = await WorkforceRepository.getAttendanceCorrectionById(correctionId);
    if (!correction) {
      throw new NotFoundError(`Attendance correction #${correctionId} not found.`);
    }

    // Maker-checker policy: Employee cannot approve their own correction
    if (user.id === correction.employee_id) {
      throw new ForbiddenError('Maker-checker policy violation: You cannot approve your own attendance correction.');
    }

    // Role & property boundary checks
    const role = (user.role || '').toUpperCase();
    const isOpsManager = role === 'OPERATIONS_MANAGER' || role === 'MANAGER';
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role) && !isOpsManager) {
      throw new ForbiddenError('Unauthorized to review attendance corrections.');
    }
    if (isOpsManager && user.propertyId && String(user.propertyId) !== String(correction.property_id)) {
      throw new ForbiddenError(`You can only review attendance corrections for your assigned Property #${user.propertyId}.`);
    }

    const validActions = ['APPROVED', 'REJECTED'];
    if (!validActions.includes(action)) {
      throw new ValidationError('Action must be APPROVED or REJECTED.');
    }

    if (action === 'APPROVED') {
      const start = new Date(correction.requested_clock_in);
      const end = new Date(correction.requested_clock_out);
      const actualMinutes = Math.max(0, (end - start) / (1000 * 60));
      const actualHours = parseFloat((actualMinutes / 60).toFixed(2));
      const scheduled = parseFloat(correction.scheduled_hours || 8.00);
      const overtime = actualHours > scheduled ? parseFloat((actualHours - scheduled).toFixed(2)) : 0.00;

      await WorkforceRepository.updateAttendance(correction.attendance_record_id, {
        clock_in_time: start,
        clock_out_time: end,
        actual_hours: actualHours,
        overtime_hours: overtime,
        is_verified: 1,
        verified_by_id: user.id,
        verified_at: new Date(),
        verification_notes: `Adjusted via Approved Correction #${correctionId}: ${reviewNotes || 'Verified'}`,
      });
    }

    await WorkforceRepository.updateCorrectionStatus(correctionId, {
      status: action,
      reviewed_by_id: user.id,
      review_notes: reviewNotes,
    });

    await AuditService.record({
      req,
      action: action === 'APPROVED' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED',
      entityType: 'attendance_correction',
      entityId: String(correctionId),
      oldValues: { original_clock_in: correction.original_clock_in, original_clock_out: correction.original_clock_out },
      newValues: { status: action, reviewer_id: user.id, review_notes: reviewNotes },
    });

    return WorkforceRepository.getAttendanceCorrectionById(correctionId);
  }

  // ─── Attendance Policy & Kiosk Administration ──────────────────────────
  static async getPolicy(propertyId = null) {
    return WorkforceRepository.getAttendancePolicy(propertyId);
  }

  static async updatePolicy(propertyId, policyData, user, req = null) {
    const role = (user.role || '').toUpperCase();
    const isOpsManager = role === 'OPERATIONS_MANAGER' || role === 'MANAGER';
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role) && !isOpsManager) {
      throw new ForbiddenError('Unauthorized to configure attendance policy.');
    }
    if (isOpsManager && (!propertyId || String(user.propertyId) !== String(propertyId))) {
      throw new ForbiddenError('Operations Managers can only configure policy for their assigned property.');
    }

    const updated = await WorkforceRepository.upsertAttendancePolicy(propertyId, policyData);
    await AuditService.record({
      req,
      action: 'ATTENDANCE_POLICY_UPDATED',
      entityType: 'attendance_policy',
      entityId: String(propertyId || 'GLOBAL'),
      newValues: policyData,
    });
    return updated;
  }

  static async registerKiosk(data, user, req = null) {
    const role = (user.role || '').toUpperCase();
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only Administrators can register new property kiosks.');
    }
    if (!data.property_id || !data.kiosk_name || !data.kiosk_code) {
      throw new ValidationError('property_id, kiosk_name, and kiosk_code are required.');
    }

    // Require or generate high-entropy terminal secret
    const plainSecret = data.kiosk_secret && data.kiosk_secret.trim().length >= 8
      ? data.kiosk_secret.trim()
      : `bfa-${crypto.randomBytes(9).toString('base64url')}-2026`;

    // Securely hash secret with bcrypt (10 rounds)
    const salt = await bcrypt.genSalt(10);
    const secretHash = await bcrypt.hash(plainSecret, salt);

    const kioskId = await WorkforceRepository.createKiosk({
      property_id: data.property_id,
      kiosk_name: data.kiosk_name,
      kiosk_code: data.kiosk_code.toUpperCase(),
      kiosk_secret_hash: secretHash,
      status: data.status || 'ACTIVE',
      registered_by_id: user.id,
    });

    await AuditService.record({
      req,
      action: 'PROPERTY_KIOSK_REGISTERED',
      entityType: 'property_kiosk',
      entityId: String(kioskId),
      newValues: {
        property_id: data.property_id,
        kiosk_name: data.kiosk_name,
        kiosk_code: data.kiosk_code.toUpperCase(),
        // Plaintext secret and hash are omitted from audit log to prevent credential leakage
      },
    });

    const safeKiosk = await WorkforceRepository.getKioskById(kioskId);
    return {
      ...safeKiosk,
      kiosk_secret: plainSecret, // Returned ONCE for display during registration
    };
  }

  static async rotateKioskSecret(id, { newSecret = null } = {}, user, req = null) {
    const role = (user.role || '').toUpperCase();
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only Administrators can rotate kiosk terminal credentials.');
    }

    const kiosk = await WorkforceRepository.getKioskById(id);
    if (!kiosk) {
      throw new NotFoundError(`Property kiosk #${id} not found.`);
    }
    if (kiosk.status === 'REVOKED') {
      throw new ForbiddenError('Cannot rotate credentials for a REVOKED kiosk terminal.');
    }

    const plainSecret = newSecret && newSecret.trim().length >= 8
      ? newSecret.trim()
      : `bfa-${crypto.randomBytes(9).toString('base64url')}-2026`;

    const salt = await bcrypt.genSalt(10);
    const secretHash = await bcrypt.hash(plainSecret, salt);

    await WorkforceRepository.updateKiosk(kiosk.id, {
      kiosk_secret_hash: secretHash,
    });

    await AuditService.record({
      req,
      action: 'PROPERTY_KIOSK_SECRET_ROTATED',
      entityType: 'property_kiosk',
      entityId: String(kiosk.id),
      newValues: {
        kiosk_id: kiosk.id,
        kiosk_code: kiosk.kiosk_code,
        rotated_by_id: user.id,
        rotated_at: new Date(),
      },
    });

    const safeKiosk = await WorkforceRepository.getKioskById(kiosk.id);
    return {
      ...safeKiosk,
      kiosk_secret: plainSecret, // Returned ONCE on rotation
    };
  }

  static async verifyAttendanceRecord(id, { action = 'VERIFY', reviewNotes = '' } = {}, user, req = null) {
    const role = (user.role || '').toUpperCase();
    const isOpsManager = role === 'OPERATIONS_MANAGER' || role === 'MANAGER';
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role) && !isOpsManager) {
      throw new ForbiddenError('Unauthorized to review or verify attendance exceptions.');
    }

    const record = await WorkforceRepository.getAttendanceById(id);
    if (!record) {
      throw new NotFoundError(`Attendance record #${id} not found.`);
    }

    // Maker-checker policy: Acting manager cannot review/verify their own punch record
    const empRows = await pool.query('SELECT * FROM employees WHERE id = ?', [record.employee_id]);
    if (empRows.length > 0 && empRows[0].user_id === user.id) {
      throw new ForbiddenError('Maker-checker policy violation: You cannot verify or resolve your own attendance exception.');
    }

    // Property scoping
    if (isOpsManager && user.propertyId && String(user.propertyId) !== String(record.property_id)) {
      throw new ForbiddenError(`You can only review attendance records for your assigned Property #${user.propertyId}.`);
    }

    const validActions = ['VERIFY', 'FLAG_REJECTED'];
    if (!validActions.includes(action)) {
      throw new ValidationError('Action must be VERIFY or FLAG_REJECTED.');
    }

    const isVerified = action === 'VERIFY' ? 1 : 0;
    const actionTag = action === 'VERIFY' ? 'GEOFENCE_EXCEPTION_VERIFIED' : 'GEOFENCE_EXCEPTION_REJECTED';
    const originalNotes = record.verification_notes || '';
    const notesAppend = `${originalNotes} | [${actionTag}: ${reviewNotes || 'Reviewed by manager'} (Reviewed by ${user.name || user.email})]`.trim();

    await WorkforceRepository.updateAttendance(record.id, {
      is_verified: isVerified,
      verified_by_id: user.id,
      verified_at: new Date(),
      verification_notes: notesAppend,
    });

    await AuditService.record({
      req,
      action: action === 'VERIFY' ? 'ATTENDANCE_EXCEPTION_APPROVED' : 'ATTENDANCE_EXCEPTION_REJECTED',
      entityType: 'attendance_record',
      entityId: String(record.id),
      oldValues: {
        is_verified: record.is_verified,
        notes: record.verification_notes,
      },
      newValues: {
        is_verified: isVerified,
        verified_by: user.id,
        notes: notesAppend,
        action,
        reviewNotes,
      },
    });

    return WorkforceRepository.getAttendanceById(record.id);
  }

  static async listKiosks(propertyId = null, user = null) {
    return WorkforceRepository.listKiosks(propertyId);
  }

  static async updateKioskStatus(id, status, user, req = null) {
    const role = (user.role || '').toUpperCase();
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only Administrators can manage kiosk terminal status.');
    }
    return WorkforceRepository.updateKiosk(id, { status });
  }
}

module.exports = AttendanceService;
