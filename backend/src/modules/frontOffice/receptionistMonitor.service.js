const pool = require('../../db/pool');
const logger = require('../../utils/logger');
const auditService = require('../../core/audit/audit.service');
const { broadcastOperationalEvent } = require('../../core/socket/socketEmitter');
const { ValidationError, ForbiddenError, NotFoundError } = require('../../core/errors/apiError');

class ReceptionistMonitorService {
  /**
   * Get Africa/Lagos operational date string (YYYY-MM-DD)
   * Ensures daily resets occur precisely at Lagos midnight.
   */
  static getLagosDate(targetDate = null) {
    if (targetDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return targetDate;
      const d = new Date(targetDate);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // Using Intl formatter for Africa/Lagos timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  }

  /**
   * Ensure or get daily metric row for a receptionist
   */
  static async getOrCreateDailyMetric(receptionistId, propertyId, workDate = null) {
    const date = workDate || this.getLagosDate();

    // Check if exists
    const existing = await pool.query(
      `SELECT * FROM receptionist_daily_metrics 
       WHERE receptionist_id = ? AND property_id = ? AND work_date = ? LIMIT 1`,
      [receptionistId, propertyId, date]
    );

    if (existing && existing.length > 0) {
      return existing[0];
    }

    // Insert new daily record (midnight reset preserves history and starts fresh row)
    await pool.query(
      `INSERT INTO receptionist_daily_metrics 
        (receptionist_id, property_id, work_date, shift_status, availability_status, 
         bookings_alerted_count, bookings_claimed_count, bookings_completed_count, 
         pending_assigned_count, total_claim_response_seconds, average_claim_response_seconds, 
         check_ins_count, check_outs_count, tasks_completed_count)
       VALUES (?, ?, ?, 'OFF_SHIFT', 'AVAILABLE', 0, 0, 0, 0, 0, 0, 0, 0, 0)
       ON CONFLICT (receptionist_id, property_id, work_date) DO NOTHING`,
      [receptionistId, propertyId, date]
    );

    const created = await pool.query(
      `SELECT * FROM receptionist_daily_metrics 
       WHERE receptionist_id = ? AND property_id = ? AND work_date = ? LIMIT 1`,
      [receptionistId, propertyId, date]
    );
    return created[0];
  }

  /**
   * Log a receptionist activity event
   */
  static async logActivity({
    receptionistId,
    propertyId,
    eventType,
    description,
    reservationId = null,
    responseTimeSeconds = null,
    details = null,
  }) {
    const date = this.getLagosDate();
    const detailsJson = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;

    await pool.query(
      `INSERT INTO receptionist_activity_logs 
        (receptionist_id, property_id, event_type, work_date, reservation_id, response_time_seconds, description, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [receptionistId, propertyId, eventType, date, reservationId, responseTimeSeconds, description, detailsJson]
    );

    // Update last activity timestamp on metrics
    await pool.query(
      `UPDATE receptionist_daily_metrics 
       SET last_activity_at = NOW(), updated_at = NOW()
       WHERE receptionist_id = ? AND property_id = ? AND work_date = ?`,
      [receptionistId, propertyId, date]
    );
  }

  /**
   * Clock-in shift
   */
  static async clockIn(user, propertyId = null, req = null) {
    const propId = propertyId || user.propertyId || 1;
    const date = this.getLagosDate();

    await this.getOrCreateDailyMetric(user.id, propId, date);

    await pool.query(
      `UPDATE receptionist_daily_metrics 
       SET shift_status = 'ON_SHIFT',
           availability_status = 'AVAILABLE',
           shift_start_time = COALESCE(shift_start_time, NOW()),
           current_activity = 'On duty at front desk',
           last_activity_at = NOW(),
           updated_at = NOW()
       WHERE receptionist_id = ? AND property_id = ? AND work_date = ?`,
      [user.id, propId, date]
    );

    await this.logActivity({
      receptionistId: user.id,
      propertyId: propId,
      eventType: 'SHIFT_START',
      description: `${user.name} clocked in for shift.`,
    });

    broadcastOperationalEvent('receptionist:shift_change', {
      receptionistId: user.id,
      receptionistName: user.name,
      propertyId: propId,
      shiftStatus: 'ON_SHIFT',
      availabilityStatus: 'AVAILABLE',
      timestamp: new Date().toISOString(),
    });

    return await this.getOrCreateDailyMetric(user.id, propId, date);
  }

  /**
   * Clock-out shift
   */
  static async clockOut(user, propertyId = null, req = null) {
    const propId = propertyId || user.propertyId || 1;
    const date = this.getLagosDate();

    const metric = await this.getOrCreateDailyMetric(user.id, propId, date);
    let shiftMinutes = metric.total_shift_minutes || 0;
    if (metric.shift_start_time) {
      const elapsedMs = Date.now() - new Date(metric.shift_start_time).getTime();
      shiftMinutes += Math.max(0, Math.floor(elapsedMs / (1000 * 60)));
    }

    await pool.query(
      `UPDATE receptionist_daily_metrics 
       SET shift_status = 'OFF_SHIFT',
           availability_status = 'OFFLINE',
           shift_end_time = NOW(),
           total_shift_minutes = ?,
           current_activity = 'Off shift',
           last_activity_at = NOW(),
           updated_at = NOW()
       WHERE receptionist_id = ? AND property_id = ? AND work_date = ?`,
      [shiftMinutes, user.id, propId, date]
    );

    await this.logActivity({
      receptionistId: user.id,
      propertyId: propId,
      eventType: 'SHIFT_END',
      description: `${user.name} clocked out from shift. Total shift duration: ${shiftMinutes} minutes.`,
    });

    broadcastOperationalEvent('receptionist:shift_change', {
      receptionistId: user.id,
      receptionistName: user.name,
      propertyId: propId,
      shiftStatus: 'OFF_SHIFT',
      availabilityStatus: 'OFFLINE',
      totalShiftMinutes: shiftMinutes,
      timestamp: new Date().toISOString(),
    });

    return await this.getOrCreateDailyMetric(user.id, propId, date);
  }

  /**
   * Update receptionist availability status (Available, Busy, Away)
   */
  static async updateAvailability(user, { availabilityStatus, currentActivity }, propertyId = null) {
    const validStatuses = ['AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE'];
    if (!validStatuses.includes(availabilityStatus)) {
      throw new ValidationError(`Invalid availability status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const propId = propertyId || user.propertyId || 1;
    const date = this.getLagosDate();
    await this.getOrCreateDailyMetric(user.id, propId, date);

    const activityText = (currentActivity || (
      availabilityStatus === 'AVAILABLE' ? 'Available for bookings & guest services' :
      availabilityStatus === 'BUSY' ? 'Attending to guest / processing arrival' : 'Away from front desk'
    )).trim();

    await pool.query(
      `UPDATE receptionist_daily_metrics 
       SET availability_status = ?,
           current_activity = ?,
           last_activity_at = NOW(),
           updated_at = NOW()
       WHERE receptionist_id = ? AND property_id = ? AND work_date = ?`,
      [availabilityStatus, activityText, user.id, propId, date]
    );

    await this.logActivity({
      receptionistId: user.id,
      propertyId: propId,
      eventType: 'AVAILABILITY_CHANGE',
      description: `${user.name} changed status to ${availabilityStatus}: ${activityText}`,
    });

    broadcastOperationalEvent('receptionist:availability_change', {
      receptionistId: user.id,
      receptionistName: user.name,
      propertyId: propId,
      availabilityStatus,
      currentActivity: activityText,
      timestamp: new Date().toISOString(),
    });

    return await this.getOrCreateDailyMetric(user.id, propId, date);
  }

  /**
   * Record a booking alert dispatched to receptionists
   */
  static async recordBookingAlert(propertyId, reservation) {
    const date = this.getLagosDate();

    // Increment alerted count for all active receptionists assigned to this property
    const activeStaff = await pool.query(
      `SELECT u.id 
       FROM users u
       LEFT JOIN user_property_assignments upa ON u.id = upa.user_id AND upa.property_id = ?
       WHERE u.role = 'RECEPTIONIST' AND u.status = 'ACTIVE'`,
      [propertyId]
    );

    for (const staff of activeStaff) {
      await this.getOrCreateDailyMetric(staff.id, propertyId, date);
      await pool.query(
        `UPDATE receptionist_daily_metrics 
         SET bookings_alerted_count = bookings_alerted_count + 1,
             updated_at = NOW()
         WHERE receptionist_id = ? AND property_id = ? AND work_date = ?`,
        [staff.id, propertyId, date]
      );
      await this.logActivity({
        receptionistId: staff.id,
        propertyId,
        eventType: 'BOOKING_ALERTED',
        reservationId: reservation.id,
        description: `New booking #${reservation.reservation_code} alerted to front desk.`,
      });
    }
  }

  /**
   * Record a successful booking claim
   */
  static async recordBookingClaim({ receptionistId, propertyId, reservation, responseTimeSeconds }) {
    const date = this.getLagosDate();
    await this.getOrCreateDailyMetric(receptionistId, propertyId, date);

    const safeResponseTime = Math.max(1, parseInt(responseTimeSeconds, 10) || 5);

    await pool.query(
      `UPDATE receptionist_daily_metrics 
       SET bookings_claimed_count = bookings_claimed_count + 1,
           pending_assigned_count = pending_assigned_count + 1,
           total_claim_response_seconds = total_claim_response_seconds + ?,
           average_claim_response_seconds = ROUND((total_claim_response_seconds + ?) / (bookings_claimed_count + 1)),
           current_activity = ?,
           last_activity_at = NOW(),
           updated_at = NOW()
       WHERE receptionist_id = ? AND property_id = ? AND work_date = ?`,
      [
        safeResponseTime,
        safeResponseTime,
        `Claimed booking #${reservation.reservation_code} for ${reservation.tenant_name || 'Guest'}`,
        receptionistId,
        propertyId,
        date,
      ]
    );

    await this.logActivity({
      receptionistId,
      propertyId,
      eventType: 'BOOKING_CLAIMED',
      reservationId: reservation.id,
      responseTimeSeconds: safeResponseTime,
      description: `Claimed booking #${reservation.reservation_code} in ${safeResponseTime}s.`,
      details: {
        reservationCode: reservation.reservation_code,
        guestName: reservation.tenant_name,
        apartmentId: reservation.apartment_id,
        checkInDate: reservation.check_in_date,
        checkOutDate: reservation.check_out_date,
      },
    });

    broadcastOperationalEvent('receptionist:performance_update', {
      receptionistId,
      propertyId,
      workDate: date,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Record front desk check-in completion
   */
  static async recordCheckIn(receptionistId, propertyId, reservationId) {
    const date = this.getLagosDate();
    await this.getOrCreateDailyMetric(receptionistId, propertyId, date);

    await pool.query(
      `UPDATE receptionist_daily_metrics 
       SET check_ins_count = check_ins_count + 1,
           bookings_completed_count = bookings_completed_count + 1,
           pending_assigned_count = GREATEST(0, pending_assigned_count - 1),
           current_activity = 'Completed guest check-in',
           last_activity_at = NOW(),
           updated_at = NOW()
       WHERE receptionist_id = ? AND property_id = ? AND work_date = ?`,
      [receptionistId, propertyId, date]
    );

    await this.logActivity({
      receptionistId,
      propertyId,
      eventType: 'CHECK_IN_COMPLETED',
      reservationId,
      description: 'Completed guest arrival check-in and room key issuance.',
    });
  }

  /**
   * Record front desk check-out completion
   */
  static async recordCheckOut(receptionistId, propertyId, reservationId) {
    const date = this.getLagosDate();
    await this.getOrCreateDailyMetric(receptionistId, propertyId, date);

    await pool.query(
      `UPDATE receptionist_daily_metrics 
       SET check_outs_count = check_outs_count + 1,
           tasks_completed_count = tasks_completed_count + 1,
           current_activity = 'Processed guest departure check-out',
           last_activity_at = NOW(),
           updated_at = NOW()
       WHERE receptionist_id = ? AND property_id = ? AND work_date = ?`,
      [receptionistId, propertyId, date]
    );

    await this.logActivity({
      receptionistId,
      propertyId,
      eventType: 'CHECK_OUT_COMPLETED',
      reservationId,
      description: 'Processed departure check-out and released unit to housekeeping.',
    });
  }

  /**
   * Alias for getMonitorDashboard
   */
  static async getLiveDashboard(params = {}) {
    return this.getMonitorDashboard(params);
  }

  /**
   * Get Live or Historical Receptionist Monitoring Dashboard data
   */
  static async getMonitorDashboard({ targetDate = null, propertyId = null, user }) {
    const date = this.getLagosDate(targetDate);
    const userRole = (user.role || '').toUpperCase();

    // Role Security Boundary:
    // RECEPTIONIST and STAFF cannot access management monitoring
    if (['RECEPTIONIST', 'STAFF', 'AGENT'].includes(userRole)) {
      throw new ForbiddenError('Access denied: Management monitoring is restricted to Administrators and Managers.');
    }

    // Manager Scoping Boundary:
    let scopedPropertyId = propertyId;
    if (['OPERATIONS_MANAGER', 'MANAGER'].includes(userRole) && user.propertyId) {
      scopedPropertyId = user.propertyId;
    }

    // 1. Fetch all receptionists matching scope
    let staffSql = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.status as account_status,
        COALESCE(p.id, 1) as property_id,
        COALESCE(p.name, 'All Properties') as property_name,
        COALESCE(p.code, 'BFA') as property_code
      FROM users u
      LEFT JOIN user_property_assignments upa ON u.id = upa.user_id AND upa.is_primary = TRUE
      LEFT JOIN properties p ON upa.property_id = p.id
      WHERE u.role = 'RECEPTIONIST' AND u.status = 'ACTIVE'
    `;
    const staffParams = [];
    if (scopedPropertyId && scopedPropertyId !== 'all') {
      staffSql += ' AND (upa.property_id = ? OR upa.property_id IS NULL)';
      staffParams.push(parseInt(scopedPropertyId, 10));
    }
    staffSql += ' ORDER BY u.name ASC';

    const receptionists = await pool.query(staffSql, staffParams);

    // 2. Fetch metrics for this date
    let metricsSql = `
      SELECT * FROM receptionist_daily_metrics WHERE work_date = ?
    `;
    const metricsParams = [date];
    if (scopedPropertyId && scopedPropertyId !== 'all') {
      metricsSql += ' AND property_id = ?';
      metricsParams.push(parseInt(scopedPropertyId, 10));
    }
    const metricsRows = await pool.query(metricsSql, metricsParams);
    const metricsByStaff = {};
    for (const m of metricsRows) {
      metricsByStaff[m.receptionist_id] = m;
    }

    // 3. Assemble Receptionist Cards
    const receptionistCards = receptionists.map((rec) => {
      const metric = metricsByStaff[rec.id] || {
        shift_status: 'OFF_SHIFT',
        availability_status: 'AVAILABLE',
        current_activity: 'No shift started today',
        shift_start_time: null,
        shift_end_time: null,
        total_shift_minutes: 0,
        bookings_alerted_count: 0,
        bookings_claimed_count: 0,
        bookings_completed_count: 0,
        pending_assigned_count: 0,
        average_claim_response_seconds: 0,
        check_ins_count: 0,
        check_outs_count: 0,
        tasks_completed_count: 0,
        last_activity_at: null,
      };

      // Calculate live elapsed shift duration if currently on shift
      let liveElapsedMinutes = metric.total_shift_minutes || 0;
      if (metric.shift_status === 'ON_SHIFT' && metric.shift_start_time) {
        const ms = Date.now() - new Date(metric.shift_start_time).getTime();
        liveElapsedMinutes = Math.max(liveElapsedMinutes, Math.floor(ms / (1000 * 60)));
      }

      return {
        id: rec.id,
        name: rec.name,
        email: rec.email,
        phone: rec.phone,
        avatar_url: rec.avatar_url,
        property_id: rec.property_id,
        property_name: rec.property_name,
        property_code: rec.property_code,
        shift_status: metric.shift_status,
        availability_status: metric.availability_status,
        current_activity: metric.current_activity,
        shift_start_time: metric.shift_start_time,
        shift_end_time: metric.shift_end_time,
        elapsed_shift_minutes: liveElapsedMinutes,
        bookings_alerted_count: metric.bookings_alerted_count,
        bookings_claimed_count: metric.bookings_claimed_count,
        bookings_completed_count: metric.bookings_completed_count,
        pending_assigned_count: metric.pending_assigned_count,
        average_claim_response_seconds: metric.average_claim_response_seconds,
        check_ins_count: metric.check_ins_count,
        check_outs_count: metric.check_outs_count,
        tasks_completed_count: metric.tasks_completed_count,
        last_activity_at: metric.last_activity_at,
      };
    });

    // 4. Calculate Aggregate Overview KPIs
    const onShiftCount = receptionistCards.filter((r) => r.shift_status === 'ON_SHIFT').length;
    const availableCount = receptionistCards.filter(
      (r) => r.shift_status === 'ON_SHIFT' && r.availability_status === 'AVAILABLE'
    ).length;
    const busyCount = receptionistCards.filter(
      (r) => r.shift_status === 'ON_SHIFT' && r.availability_status === 'BUSY'
    ).length;
    const awayCount = receptionistCards.filter(
      (r) => r.shift_status === 'ON_SHIFT' && r.availability_status === 'AWAY'
    ).length;
    const offShiftCount = receptionistCards.filter((r) => r.shift_status === 'OFF_SHIFT').length;

    // Actual bookings created on this date
    let bookingsSql = `
      SELECT 
        COUNT(r.id) as total_received,
        COUNT(CASE WHEN r.assigned_staff_id IS NOT NULL THEN 1 END) as total_claimed,
        COUNT(CASE WHEN r.assigned_staff_id IS NULL AND r.status IN ('PENDING_REVIEW', 'AWAITING_ASSIGNMENT') THEN 1 END) as pending_unclaimed,
        COUNT(CASE WHEN r.status IN ('CHECKED_IN', 'COMPLETED') THEN 1 END) as total_completed
      FROM reservations r
      WHERE DATE(r.created_at AT TIME ZONE 'Africa/Lagos') = ?
    `;
    const bookingParams = [date];
    if (scopedPropertyId && scopedPropertyId !== 'all') {
      bookingsSql += ' AND r.property_id = ?';
      bookingParams.push(parseInt(scopedPropertyId, 10));
    }
    const bookingStats = await pool.query(bookingsSql, bookingParams);
    const bRow = bookingStats[0] || {};

    const totalClaimed = receptionistCards.reduce((acc, r) => acc + (r.bookings_claimed_count || 0), 0);
    const totalCheckIns = receptionistCards.reduce((acc, r) => acc + (r.check_ins_count || 0), 0);
    const totalCheckOuts = receptionistCards.reduce((acc, r) => acc + (r.check_outs_count || 0), 0);

    const respondingRecs = receptionistCards.filter((r) => r.average_claim_response_seconds > 0);
    const avgResponseTimeSeconds = respondingRecs.length > 0
      ? Math.round(respondingRecs.reduce((acc, r) => acc + r.average_claim_response_seconds, 0) / respondingRecs.length)
      : 0;

    return {
      workDate: date,
      isToday: date === this.getLagosDate(),
      timezone: 'Africa/Lagos',
      kpis: {
        totalActiveReceptionists: receptionistCards.length,
        receptionistsOnShift: onShiftCount,
        receptionistsAvailable: availableCount,
        receptionistsBusy: busyCount,
        receptionistsAway: awayCount,
        receptionistsOffline: offShiftCount,
        totalBookingsReceivedToday: parseInt(bRow.total_received, 10) || 0,
        totalBookingsClaimedToday: Math.max(parseInt(bRow.total_claimed, 10) || 0, totalClaimed),
        pendingUnclaimedBookings: parseInt(bRow.pending_unclaimed, 10) || 0,
        completedBookingsToday: parseInt(bRow.total_completed, 10) || 0,
        todayCheckIns: totalCheckIns,
        todayCheckOuts: totalCheckOuts,
        averageClaimResponseSeconds: avgResponseTimeSeconds,
      },
      receptionists: receptionistCards,
    };
  }

  /**
   * Get detailed event history logs for an individual receptionist
   */
  static async getReceptionistLogs(receptionistId, targetDate = null, user) {
    const date = this.getLagosDate(targetDate);
    const userRole = (user.role || '').toUpperCase();

    // Check permissions
    if (['RECEPTIONIST'].includes(userRole) && parseInt(user.id, 10) !== parseInt(receptionistId, 10)) {
      throw new ForbiddenError('You can only view your own operational performance logs.');
    }

    const logs = await pool.query(
      `SELECT l.*, r.reservation_code, r.tenant_name, p.name as property_name
       FROM receptionist_activity_logs l
       LEFT JOIN reservations r ON l.reservation_id = r.id
       LEFT JOIN properties p ON l.property_id = p.id
       WHERE l.receptionist_id = ? AND l.work_date = ?
       ORDER BY l.created_at DESC`,
      [receptionistId, date]
    );

    const metrics = await this.getOrCreateDailyMetric(receptionistId, user.propertyId || 1, date);

    return {
      receptionistId: parseInt(receptionistId, 10),
      workDate: date,
      metrics,
      logs: logs.map((l) => ({
        ...l,
        details: typeof l.details === 'string' ? JSON.parse(l.details || '{}') : (l.details || {}),
      })),
    };
  }
}

module.exports = ReceptionistMonitorService;
