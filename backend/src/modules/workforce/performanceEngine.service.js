/**
 * Unified Evidence-Based Staff Performance Engine
 * BFA Apartments Management System
 *
 * Computes holistic performance analytics from:
 * 1. Attendance & Punctuality (09:00 Africa/Lagos cutoff, excluding approved leave & non-scheduled days)
 * 2. Authoritative Ticket Lifecycle & SLA Metrics (19 tracked operational indicators with fair exclusions)
 * 3. Quality, Revisions, Reopens & Workload Fairness
 * 4. Actionable Coaching Recommendations & Configurable Scoring Weights
 * 5. Strict Role-Scoped Privacy (Owner sees Executive Overview without private HR disciplinary records;
 *    Managers scoped to assigned properties; Staff see personal breakdown only)
 */

const pool = require('../../db/pool');
const logger = require('../../utils/logger');
const { ForbiddenError, NotFoundError, BadRequestError } = require('../../core/errors/apiError');

const DEFAULT_WEIGHTS = {
  attendance: 20,
  acknowledgment: 15,
  execution: 30,
  quality: 20,
  workload: 15,
};

const DEFAULT_MIN_TICKET_THRESHOLD = 3;

const PRIORITY_WORKLOAD_WEIGHT = {
  CRITICAL: 4,
  URGENT: 3,
  HIGH: 3,
  IMPORTANT: 2.5,
  NORMAL: 2,
  LOW: 1,
};

function extractRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function formatDateOnly(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return getLagosDateString(parsed);
  return s.slice(0, 10);
}

function getLagosDateString(dt = new Date()) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

function getLagosTimeMinutes(dt) {
  if (!dt) return null;
  const d = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(d.getTime())) return null;
  const parts = d
    .toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false })
    .split(':');
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

function roundNum(n, digits = 2) {
  if (!Number.isFinite(n)) return 0;
  const factor = Math.pow(10, digits);
  return Math.round(n * factor) / factor;
}

class PerformanceEngineService {
  static async getPerformanceConfig() {
    let weights = { ...DEFAULT_WEIGHTS };
    let minTicketThreshold = DEFAULT_MIN_TICKET_THRESHOLD;
    try {
      const rows = extractRows(
        await pool.query(
          "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('performance_scoring_weights', 'performance_min_ticket_threshold')"
        )
      );
      for (const r of rows) {
        if (r.setting_key === 'performance_scoring_weights' && r.setting_value) {
          const parsed = typeof r.setting_value === 'string' ? JSON.parse(r.setting_value) : r.setting_value;
          weights = { ...DEFAULT_WEIGHTS, ...parsed };
        }
        if (r.setting_key === 'performance_min_ticket_threshold' && r.setting_value != null) {
          const parsedMin = parseInt(r.setting_value, 10);
          if (Number.isFinite(parsedMin) && parsedMin >= 1 && parsedMin <= 20) {
            minTicketThreshold = parsedMin;
          }
        }
      }
    } catch (err) {
      logger.warn(`Using default performance weights: ${err.message}`);
    }
    return { weights, minTicketThreshold };
  }

  static async updatePerformanceConfig(user, { weights, minTicketThreshold }) {
    const role = String(user?.role || '').toUpperCase();
    if (!['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only Owner, Admin, or Super Admin can modify performance scoring weights.');
    }

    const current = await this.getPerformanceConfig();
    let finalWeights = current.weights;
    let finalMin = current.minTicketThreshold;

    if (weights && typeof weights === 'object') {
      const next = {};
      let sum = 0;
      for (const k of Object.keys(DEFAULT_WEIGHTS)) {
        const val = Number(weights[k] !== undefined ? weights[k] : current.weights[k]);
        if (!Number.isFinite(val) || val < 0 || val > 100) {
          throw new BadRequestError(`Invalid weight for '${k}': ${weights[k]}`);
        }
        next[k] = Math.round(val);
        sum += next[k];
      }
      if (sum !== 100) {
        throw new BadRequestError(`Performance dimension weights must total exactly 100% (got ${sum}%).`);
      }
      finalWeights = next;
    }

    if (minTicketThreshold !== undefined) {
      const m = parseInt(minTicketThreshold, 10);
      if (!Number.isFinite(m) || m < 1 || m > 20) {
        throw new BadRequestError('Minimum ticket sample threshold must be between 1 and 20.');
      }
      finalMin = m;
    }

    const weightsStr = JSON.stringify(finalWeights);
    const minStr = String(finalMin);

    if (pool.isPostgres()) {
      await pool.query(
        `INSERT INTO system_settings (category, setting_key, setting_value, description)
         VALUES ('performance', 'performance_scoring_weights', ?, 'Configurable performance scoring weights totaling 100%')
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [weightsStr]
      );
      await pool.query(
        `INSERT INTO system_settings (category, setting_key, setting_value, description)
         VALUES ('performance', 'performance_min_ticket_threshold', ?, 'Minimum assessed ticket sample before scored rating')
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [minStr]
      );
    } else {
      await pool.query(
        `INSERT INTO system_settings (category, setting_key, setting_value, description)
         VALUES ('performance', 'performance_scoring_weights', ?, 'Configurable performance scoring weights totaling 100%')
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [weightsStr]
      );
      await pool.query(
        `INSERT INTO system_settings (category, setting_key, setting_value, description)
         VALUES ('performance', 'performance_min_ticket_threshold', ?, 'Minimum assessed ticket sample before scored rating')
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [minStr]
      );
    }

    await pool.query(
      `INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, new_values)
       VALUES (?, ?, ?, 'PERFORMANCE_CONFIG_UPDATED', 'system_settings', 'performance_scoring_weights', ?)`,
      [user.id, user.email || null, role, JSON.stringify({ weights: finalWeights, minTicketThreshold: finalMin })]
    );

    return { weights: finalWeights, minTicketThreshold: finalMin };
  }

  static async assertCanAccessStaffPerformance(requestingUser, targetUser) {
    const reqRole = String(requestingUser?.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(reqRole)) return true;

    if (Number(requestingUser.id) === Number(targetUser.id)) return true;

    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(reqRole)) {
      const assignedProps = extractRows(
        await pool.query(
          `SELECT property_id FROM user_property_assignments WHERE user_id = ?
           UNION SELECT property_id FROM users WHERE id = ? AND property_id IS NOT NULL`,
          [requestingUser.id, requestingUser.id]
        )
      ).map((r) => Number(r.property_id));

      if (assignedProps.length === 0) {
        throw new ForbiddenError('Access Denied: No property scope assigned to your manager profile.');
      }
      if (targetUser.property_id && assignedProps.includes(Number(targetUser.property_id))) {
        return true;
      }
      const targetExtraProps = extractRows(
        await pool.query('SELECT property_id FROM user_property_assignments WHERE user_id = ?', [targetUser.id])
      ).map((r) => Number(r.property_id));
      if (targetExtraProps.some((p) => assignedProps.includes(p))) {
        return true;
      }
      throw new ForbiddenError('Access Denied: Managers may only review staff assigned to their managed properties.');
    }

    throw new ForbiddenError('Access Denied: You can only view your own personal performance metrics.');
  }

  static resolveDateRange({ startDate, endDate, days = 30 } = {}) {
    const endStr = endDate || getLagosDateString(new Date());
    let startStr = startDate;
    if (!startStr) {
      const endObj = new Date(`${endStr}T12:00:00Z`);
      endObj.setUTCDate(endObj.getUTCDate() - Math.max(1, Number(days) || 30) + 1);
      startStr = getLagosDateString(endObj);
    }
    return {
      startDate: startStr,
      endDate: endStr,
      startTs: new Date(`${startStr}T00:00:00+01:00`),
      endTs: new Date(`${endStr}T23:59:59+01:00`),
    };
  }

  /**
   * Compute full Attendance, 19 Ticket Metrics, Score Breakdown & Coaching Guidance
   */
  static async getStaffPerformance(requestingUser, targetUserId, { startDate, endDate, days = 30, avgTeamWorkload = null } = {}) {
    const tUserId = parseInt(targetUserId, 10);
    if (!Number.isFinite(tUserId) || tUserId <= 0) {
      throw new BadRequestError('Valid staff user ID is required.');
    }

    const userRows = extractRows(
      await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.property_id, p.name AS property_name,
                e.id AS employee_id, e.employee_code, e.department, e.job_title
         FROM users u
         LEFT JOIN properties p ON u.property_id = p.id
         LEFT JOIN employees e ON e.user_id = u.id
         WHERE u.id = ? LIMIT 1`,
        [tUserId]
      )
    );
    if (userRows.length === 0) {
      throw new NotFoundError(`User #${targetUserId} not found.`);
    }
    const targetUser = userRows[0];
    await this.assertCanAccessStaffPerformance(requestingUser, targetUser);

    const { weights, minTicketThreshold } = await this.getPerformanceConfig();
    const period = this.resolveDateRange({ startDate, endDate, days });
    const reqRole = String(requestingUser?.role || '').toUpperCase();

    // ─── 1. Attendance & 09:00 Africa/Lagos Punctuality ──────────────────
    let attendanceMetrics = {
      scheduledWorkDays: 0,
      approvedLeaveDays: 0,
      daysWorked: 0,
      presentDays: 0,
      onTimeDays: 0,
      lateDays: 0,
      lateMinutesTotal: 0,
      unapprovedAbsences: 0,
      attendanceRatePct: 100,
      punctualityRatePct: 100,
      attendanceScore: 100,
      totalHoursWorked: 0,
      cutoffRule: '09:00 Africa/Lagos (WAT)',
    };

    if (targetUser.employee_id) {
      const empId = targetUser.employee_id;

      const attRows = extractRows(
        await pool.query(
          `SELECT ar.*, s.start_time AS shift_start_time
           FROM attendance_records ar
           LEFT JOIN shifts s ON s.id = ar.shift_id
           WHERE ar.employee_id = ? AND ar.work_date BETWEEN ? AND ?
           ORDER BY ar.work_date ASC`,
          [empId, period.startDate, period.endDate]
        )
      );

      const shiftRows = extractRows(
        await pool.query(
          `SELECT shift_date, start_time
           FROM shifts
           WHERE employee_id = ? AND shift_date BETWEEN ? AND ? AND status != 'CANCELLED'`,
          [empId, period.startDate, period.endDate]
        )
      );

      const leaveRows = extractRows(
        await pool.query(
          `SELECT start_date, end_date
           FROM leave_requests
           WHERE employee_id = ? AND status = 'APPROVED' AND start_date <= ? AND end_date >= ?`,
          [empId, period.endDate, period.startDate]
        )
      );

      // Build approved leave date set so approved leave NEVER counts as unapproved absence
      const leaveDates = new Set();
      for (const lv of leaveRows) {
        const startStr = formatDateOnly(lv.start_date);
        const endStr = formatDateOnly(lv.end_date);
        if (!startStr || !endStr) continue;
        const cur = new Date(`${startStr}T12:00:00Z`);
        const stop = new Date(`${endStr}T12:00:00Z`);
        while (cur <= stop) {
          const ds = cur.toISOString().slice(0, 10);
          if (ds >= period.startDate && ds <= period.endDate) leaveDates.add(ds);
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      }

      // Build scheduled date set (from shifts if published; otherwise evaluate observed worked dates without penalizing unscheduled days!)
      const scheduledShiftMap = new Map();
      for (const sh of shiftRows) {
        const ds = formatDateOnly(sh.shift_date);
        if (ds && !leaveDates.has(ds)) {
          scheduledShiftMap.set(ds, sh.start_time);
        }
      }

      let daysWorked = 0;
      let onTimeDays = 0;
      let lateDays = 0;
      let lateMinutesTotal = 0;
      let totalHoursWorked = 0;
      const workedDateSet = new Set();

      for (const rec of attRows) {
        const workDate = formatDateOnly(rec.work_date);
        if (!workDate || leaveDates.has(workDate)) continue;
        workedDateSet.add(workDate);

        if (rec.attendance_status === 'ABSENT') continue;
        daysWorked += 1;
        totalHoursWorked += parseFloat(rec.actual_hours || 0);

        const clockMin = getLagosTimeMinutes(rec.clock_in_time);
        let cutoffMin = 9 * 60; // Default 09:00 Africa/Lagos
        const shiftStart = rec.shift_start_time || scheduledShiftMap.get(workDate);
        if (shiftStart) {
          const parts = String(shiftStart).split(':');
          const shMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
          if (Number.isFinite(shMin)) cutoffMin = shMin;
        }

        const isLateByTime = clockMin !== null && clockMin > cutoffMin;
        const isLateStatus = rec.attendance_status === 'LATE';
        if (isLateByTime || isLateStatus) {
          lateDays += 1;
          if (clockMin !== null && clockMin > cutoffMin) {
            lateMinutesTotal += clockMin - cutoffMin;
          }
        } else {
          onTimeDays += 1;
        }
      }

      const scheduledWorkDays = scheduledShiftMap.size > 0 ? scheduledShiftMap.size : daysWorked;
      let unapprovedAbsences = 0;
      if (scheduledShiftMap.size > 0) {
        const todayLagos = getLagosDateString(new Date());
        for (const ds of scheduledShiftMap.keys()) {
          if (ds <= todayLagos && !workedDateSet.has(ds)) {
            unapprovedAbsences += 1;
          }
        }
      }

      const attendanceRatePct = scheduledWorkDays > 0 ? clampPct((daysWorked / scheduledWorkDays) * 100) : 100;
      const punctualityRatePct = daysWorked > 0 ? clampPct((onTimeDays / daysWorked) * 100) : 100;
      const attendanceScore = scheduledWorkDays > 0
        ? clampPct(attendanceRatePct * 0.55 + punctualityRatePct * 0.45)
        : 100;

      attendanceMetrics = {
        scheduledWorkDays,
        approvedLeaveDays: leaveDates.size,
        daysWorked,
        presentDays: onTimeDays + lateDays,
        onTimeDays,
        lateDays,
        lateMinutesTotal,
        unapprovedAbsences,
        attendanceRatePct,
        punctualityRatePct,
        attendanceScore,
        totalHoursWorked: roundNum(totalHoursWorked, 2),
        cutoffRule: '09:00 Africa/Lagos (WAT)',
      };
    }

    // ─── 2. Ticket Operations Metrics (19 Authoritative Indicators) ──────
    const ticketRows = extractRows(
      await pool.query(
        `SELECT DISTINCT
           co.*,
           cor.acknowledged_at AS user_acknowledged_at,
           cor.assigned_at AS user_assigned_at,
           cor.acceptance_status AS user_acceptance_status,
           cor.reassigned_out AS user_reassigned_out
         FROM central_operations co
         LEFT JOIN central_operation_recipients cor
           ON cor.operation_id = co.id AND cor.user_id = ?
         WHERE (co.current_responsible_user_id = ? OR cor.user_id = ?)
           AND co.created_at BETWEEN ? AND ?
         ORDER BY co.created_at DESC`,
        [tUserId, tUserId, tUserId, period.startTs, period.endTs]
      )
    );

    const reassignRows = extractRows(
      await pool.query(
        `SELECT trh.*, co.ticket_reference, co.operation_code, co.title,
                u_prev.name AS previous_user_name, u_new.name AS new_user_name, u_by.name AS reassigned_by_name
         FROM ticket_reassignment_history trh
         JOIN central_operations co ON co.id = trh.operation_id
         LEFT JOIN users u_prev ON u_prev.id = trh.previous_user_id
         JOIN users u_new ON u_new.id = trh.new_user_id
         JOIN users u_by ON u_by.id = trh.reassigned_by_id
         WHERE (trh.previous_user_id = ? OR trh.new_user_id = ?)
           AND trh.reassigned_at BETWEEN ? AND ?
         ORDER BY trh.reassigned_at DESC`,
        [tUserId, tUserId, period.startTs, period.endTs]
      )
    );

    const opIds = ticketRows.map((t) => t.id);
    const eventsForOps = opIds.length > 0
      ? extractRows(
          await pool.query(
            `SELECT operation_id, event_type, actor_user_id, created_at
             FROM central_operation_events
             WHERE operation_id IN (${opIds.map(() => '?').join(', ')})`,
            opIds
          )
        )
      : [];

    const now = new Date();
    let ticketsAssigned = 0;
    let ticketsAccepted = 0;
    let ticketsAcknowledgedOnTime = 0;
    let ticketsAcknowledgedLate = 0;
    let ticketsUnacknowledgedPastSla = 0;
    let ackHoursSum = 0;
    let ackCount = 0;
    let ticketsStartedCount = 0;
    let startHoursSum = 0;
    let startCount = 0;
    let ticketsCompleted = 0;
    let ticketsCompletedOnTime = 0;
    let ticketsCompletedLate = 0;
    let completionHoursSum = 0;
    let completionCount = 0;
    let ticketsOverdueActive = 0;
    let ticketsBlockedExternal = 0;
    let ticketsRejectedQuality = 0;
    let ticketsDeclinedInvalid = 0;
    let ticketsCancelledManagement = 0;
    let revisionRequestCount = 0;
    let reopenPenaltyCount = 0;
    let weightedWorkloadPoints = 0;

    for (const op of ticketRows) {
      const isCancelled = op.status === 'CANCELLED';
      const isInvalidDecline = op.rejection_category === 'ASSIGNEE_INVALID_DECLINED';
      const isOwnedByUser = Number(op.current_responsible_user_id) === tUserId;
      const isActiveRecipient = !op.user_reassigned_out;

      if (isCancelled) {
        ticketsCancelledManagement += 1;
        continue; // Fair exclusion: management-cancelled tickets never count against user KPIs
      }

      if (isInvalidDecline && op.rejected_by_user_id === tUserId) {
        ticketsDeclinedInvalid += 1;
        continue; // Fair exclusion: valid decline of impossible/misassigned ticket
      }

      if (isActiveRecipient || isOwnedByUser) {
        ticketsAssigned += 1;
      }

      // Acknowledgment SLA calculation (for non-reassigned recipients)
      if (isActiveRecipient) {
        const assignedBase = new Date(op.user_assigned_at || op.created_at);
        const ackDeadline = op.acknowledgment_deadline_at
          ? new Date(op.acknowledgment_deadline_at)
          : new Date(assignedBase.getTime() + (op.acknowledgment_sla_hours || 12) * 3600 * 1000);

        if (op.user_acknowledged_at) {
          const ackDt = new Date(op.user_acknowledged_at);
          ackHoursSum += Math.max(0, (ackDt.getTime() - assignedBase.getTime()) / 3600000);
          ackCount += 1;
          if (ackDt <= ackDeadline) {
            ticketsAcknowledgedOnTime += 1;
          } else {
            ticketsAcknowledgedLate += 1;
          }
        } else if (now > ackDeadline && !['COMPLETED', 'CLOSED'].includes(op.status)) {
          ticketsUnacknowledgedPastSla += 1;
        }
      }

      // Execution metrics (evaluated primarily for tickets owned by this staff member)
      if (!isOwnedByUser) continue;

      if (op.accepted_at || ['ACCEPTED', 'IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'COMPLETED', 'CLOSED'].includes(op.status)) {
        ticketsAccepted += 1;
      }

      if (op.started_at) {
        ticketsStartedCount += 1;
        const baseForStart = new Date(op.accepted_at || op.user_acknowledged_at || op.created_at);
        const startDt = new Date(op.started_at);
        if (startDt >= baseForStart) {
          startHoursSum += (startDt.getTime() - baseForStart.getTime()) / 3600000;
          startCount += 1;
        }
      }

      if (op.status === 'BLOCKED') {
        ticketsBlockedExternal += 1;
      }

      const opEvents = eventsForOps.filter((e) => Number(e.operation_id) === Number(op.id));
      revisionRequestCount += opEvents.filter((e) => e.event_type === 'REVISION_REQUESTED').length;
      reopenPenaltyCount += Number(op.reopen_count || 0);

      if (op.rejection_category === 'SUPERVISOR_QUALITY_REJECTED' || op.status === 'REVISION_REQUIRED') {
        ticketsRejectedQuality += 1;
      }

      const effortWeight = PRIORITY_WORKLOAD_WEIGHT[String(op.priority || 'NORMAL').toUpperCase()] || 2;

      if (['COMPLETED', 'CLOSED'].includes(op.status)) {
        ticketsCompleted += 1;
        weightedWorkloadPoints += effortWeight;
        const doneAt = new Date(op.completed_at || op.closed_at || op.updated_at);
        const startBase = new Date(op.accepted_at || op.created_at);
        completionHoursSum += Math.max(0, (doneAt.getTime() - startBase.getTime()) / 3600000);
        completionCount += 1;

        if (!op.deadline_at || doneAt <= new Date(op.deadline_at)) {
          ticketsCompletedOnTime += 1;
        } else {
          ticketsCompletedLate += 1;
        }
      } else if (op.status !== 'BLOCKED') {
        weightedWorkloadPoints += effortWeight * 0.4; // Partial credit for active effort in-flight
        if (op.deadline_at && (op.status === 'OVERDUE' || now > new Date(op.deadline_at))) {
          ticketsOverdueActive += 1;
        }
      }
    }

    const ticketsReassignedOut = reassignRows.filter((r) => Number(r.previous_user_id) === tUserId).length;
    const ticketsReassignedIn = reassignRows.filter((r) => Number(r.new_user_id) === tUserId).length;

    const ackDenominator = ticketsAcknowledgedOnTime + ticketsAcknowledgedLate + ticketsUnacknowledgedPastSla;
    const slaAcknowledgmentRate = ackDenominator > 0 ? clampPct((ticketsAcknowledgedOnTime / ackDenominator) * 100) : 100;

    const ownedExecutionDenominator = ticketsCompleted + ticketsOverdueActive + ticketsRejectedQuality;
    const completionRate = ticketsAssigned > 0 ? clampPct((ticketsCompleted / Math.max(1, ticketsAssigned - ticketsReassignedOut)) * 100) : 100;
    const onTimeCompletionRate = ownedExecutionDenominator > 0
      ? clampPct((ticketsCompletedOnTime / ownedExecutionDenominator) * 100)
      : 100;
    const overdueRate = ownedExecutionDenominator > 0
      ? clampPct(((ticketsCompletedLate + ticketsOverdueActive) / ownedExecutionDenominator) * 100)
      : 0;
    const reassignmentRate = ticketsAssigned > 0
      ? clampPct((ticketsReassignedOut / (ticketsAssigned + ticketsReassignedOut)) * 100)
      : 0;

    // ─── 3. Legacy Operational Activity & Supervisor Evaluations ─────────
    const [maintStats] = extractRows(
      await pool.query(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
         FROM maintenance_requests WHERE assigned_to_id = ?`,
        [tUserId]
      )
    );
    const [inspStats] = extractRows(
      await pool.query(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
         FROM inspections WHERE inspector_id = ?`,
        [tUserId]
      )
    );
    const [resStats] = extractRows(
      await pool.query(
        `SELECT COUNT(*) AS assigned, SUM(CASE WHEN status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED') THEN 1 ELSE 0 END) AS converted
         FROM reservations WHERE assigned_staff_id = ?`,
        [tUserId]
      )
    );

    const qualityPenaltyPoints = ticketsRejectedQuality * 18 + revisionRequestCount * 8 + reopenPenaltyCount * 10;
    const ticketQualityScore = clampPct(100 - qualityPenaltyPoints);

    // Execution score blends On-Time Rate (65%) + Overall Completion Rate (35%)
    const executionScore = clampPct(onTimeCompletionRate * 0.65 + completionRate * 0.35);

    // Workload score normalized relative to active benchmark (avoid penalizing normal balanced staff)
    const benchmarkWorkload = avgTeamWorkload && avgTeamWorkload > 0 ? avgTeamWorkload : 6;
    const workloadScore = ticketsCompleted > 0 || weightedWorkloadPoints > 0
      ? clampPct((weightedWorkloadPoints / benchmarkWorkload) * 75 + 25)
      : 75;

    // Transparent Weighted Composite Calculation
    const dimAttendance = attendanceMetrics.attendanceScore;
    const dimAck = slaAcknowledgmentRate;
    const dimExecution = executionScore;
    const dimQuality = ticketQualityScore;
    const dimWorkload = workloadScore;

    const weightedContributions = {
      attendance: {
        weightPct: weights.attendance,
        rawScore: dimAttendance,
        weightedPoints: roundNum((dimAttendance * weights.attendance) / 100, 2),
        formula: `${dimAttendance}% × ${weights.attendance}%`,
      },
      acknowledgment: {
        weightPct: weights.acknowledgment,
        rawScore: dimAck,
        weightedPoints: roundNum((dimAck * weights.acknowledgment) / 100, 2),
        formula: `${dimAck}% × ${weights.acknowledgment}%`,
      },
      execution: {
        weightPct: weights.execution,
        rawScore: dimExecution,
        weightedPoints: roundNum((dimExecution * weights.execution) / 100, 2),
        formula: `${dimExecution}% × ${weights.execution}%`,
      },
      quality: {
        weightPct: weights.quality,
        rawScore: dimQuality,
        weightedPoints: roundNum((dimQuality * weights.quality) / 100, 2),
        formula: `${dimQuality}% × ${weights.quality}%`,
      },
      workload: {
        weightPct: weights.workload,
        rawScore: dimWorkload,
        weightedPoints: roundNum((dimWorkload * weights.workload) / 100, 2),
        formula: `${dimWorkload}% × ${weights.workload}%`,
      },
    };

    const assessedTicketCount = ackDenominator + ownedExecutionDenominator;
    const insufficientData = assessedTicketCount < minTicketThreshold && attendanceMetrics.daysWorked === 0;
    const overallCompositeScore = Math.round(
      Object.values(weightedContributions).reduce((acc, d) => acc + d.weightedPoints, 0)
    );

    const rating = insufficientData
      ? 'INSUFFICIENT_DATA'
      : overallCompositeScore >= 90
        ? 'EXEMPLARY'
        : overallCompositeScore >= 75
          ? 'MEETS_EXPECTATIONS'
          : overallCompositeScore >= 60
            ? 'NEEDS_IMPROVEMENT'
            : 'CRITICAL_INTERVENTION';

    // ─── 4. Actionable Improvement Recommendations ───────────────────────
    const improvementRecommendations = [];
    if (insufficientData) {
      improvementRecommendations.push({
        area: 'Sample Threshold',
        severity: 'INFO',
        finding: `Only ${assessedTicketCount} assessed ticket(s) and ${attendanceMetrics.daysWorked} attendance log(s) recorded (minimum threshold: ${minTicketThreshold}).`,
        recommendation: 'Evaluate tentatively; gather additional completed tickets and attendance records before formal appraisal.',
      });
    }
    if (attendanceMetrics.lateDays > 0 || attendanceMetrics.unapprovedAbsences > 0) {
      improvementRecommendations.push({
        area: 'Attendance & 09:00 WAT Punctuality',
        severity: attendanceMetrics.unapprovedAbsences > 0 || attendanceMetrics.lateDays >= 3 ? 'HIGH' : 'MEDIUM',
        finding: `${attendanceMetrics.lateDays} late arrival(s) after 09:00 WAT (${attendanceMetrics.lateMinutesTotal} min total) and ${attendanceMetrics.unapprovedAbsences} unapproved absence(s).`,
        recommendation: 'Schedule morning arrival check-in coaching and align shift handovers ahead of 09:00 WAT start.',
      });
    }
    if (ticketsUnacknowledgedPastSla > 0 || ticketsAcknowledgedLate > 0) {
      improvementRecommendations.push({
        area: 'Ticket Acknowledgment SLA',
        severity: ticketsUnacknowledgedPastSla > 0 ? 'HIGH' : 'MEDIUM',
        finding: `${ticketsAcknowledgedLate} late acknowledgment(s) and ${ticketsUnacknowledgedPastSla} ticket(s) unacknowledged past SLA.`,
        recommendation: 'Enable chat notification chimes and acknowledge direct/group tickets immediately upon receipt.',
      });
    }
    if (ticketsOverdueActive > 0 || ticketsCompletedLate > 0) {
      improvementRecommendations.push({
        area: 'Execution Timeliness',
        severity: ticketsOverdueActive > 0 ? 'HIGH' : 'MEDIUM',
        finding: `${ticketsCompletedLate} late completion(s) and ${ticketsOverdueActive} currently overdue active ticket(s).`,
        recommendation: 'Submit deadline extension requests early when impeded rather than letting execution deadlines lapse.',
      });
    }
    if (ticketsRejectedQuality > 0 || revisionRequestCount > 0 || reopenPenaltyCount > 0) {
      improvementRecommendations.push({
        area: 'Execution Quality & Verification',
        severity: ticketsRejectedQuality > 0 ? 'HIGH' : 'MEDIUM',
        finding: `${ticketsRejectedQuality} supervisor quality rejection(s), ${revisionRequestCount} revision cycle(s), and ${reopenPenaltyCount} reopened ticket(s).`,
        recommendation: 'Review ticket checklists carefully and attach photographic/documented DB evidence before submitting completion.',
      });
    }
    if (improvementRecommendations.length === 0) {
      improvementRecommendations.push({
        area: 'Consistent Performance',
        severity: 'POSITIVE',
        finding: `Zero late punches past 09:00 WAT, ${slaAcknowledgmentRate}% Ack SLA compliance, and ${onTimeCompletionRate}% on-time execution.`,
        recommendation: 'Recognize positive contribution in quarterly feedback and consider for mentoring peers.',
      });
    }

    // ─── 5. Disciplinary Privacy Filter (Owner Strictly Barred) ───────────
    let disciplinaryMetrics = { restrictedFromOwner: true };
    if (reqRole !== 'OWNER') {
      const [queryStats] = extractRows(
        await pool.query(
          `SELECT COUNT(*) AS total_queries,
                  SUM(CASE WHEN status IN ('ISSUED', 'VIEWED', 'RESPONDED', 'UNDER_REVIEW') THEN 1 ELSE 0 END) AS open_queries,
                  SUM(CASE WHEN status = 'SANCTION_APPROVED' THEN 1 ELSE 0 END) AS approved_sanctions
           FROM disciplinary_queries WHERE staff_user_id = ?`,
          [tUserId]
        )
      );
      const [pipStats] = extractRows(
        await pool.query(
          `SELECT COUNT(*) AS total_pips,
                  SUM(CASE WHEN status IN ('ACTIVE', 'UNDER_REVIEW', 'EXTENDED') AND is_positive_recognition = FALSE THEN 1 ELSE 0 END) AS active_pips,
                  SUM(CASE WHEN is_positive_recognition = TRUE THEN 1 ELSE 0 END) AS positive_recognitions
           FROM performance_improvement_plans WHERE staff_user_id = ?`,
          [tUserId]
        )
      );
      disciplinaryMetrics = {
        restrictedFromOwner: false,
        totalQueries: parseInt(queryStats?.total_queries || 0, 10),
        openQueries: parseInt(queryStats?.open_queries || 0, 10),
        approvedSanctions: parseInt(queryStats?.approved_sanctions || 0, 10),
        activePips: parseInt(pipStats?.active_pips || 0, 10),
        positiveRecognitions: parseInt(pipStats?.positive_recognitions || 0, 10),
      };
    }

    // ─── 6. Contact Desk Inquiry & 90-Min Response SLA Metrics (Fair Attribution) ──
    let contactInquiryMetrics = {
      inquiriesAssigned: 0,
      inquiriesRespondedOnTime: 0,
      inquiriesSlaBreached: 0,
      inquiriesClosed: 0,
      avgClientFeedbackRating: null,
      clientFeedbackCount: 0,
    };
    try {
      const [inqStats] = extractRows(
        await pool.query(
          `SELECT COUNT(*) AS assigned_count,
                  SUM(CASE WHEN first_response_by_id = ? AND response_sla_met = 1 THEN 1 ELSE 0 END) AS responded_on_time,
                  SUM(CASE WHEN status IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) AS closed_count,
                  AVG(client_feedback_rating) AS avg_rating,
                  COUNT(client_feedback_rating) AS rating_count
           FROM contact_inquiries
           WHERE (current_assignee_id = ? OR assigned_receptionist_id = ?)
             AND submitted_at BETWEEN ? AND ?`,
          [tUserId, tUserId, tUserId, period.startTs, period.endTs]
        )
      );
      const [breachStats] = extractRows(
        await pool.query(
          `SELECT COUNT(*) AS breach_count
           FROM inquiry_sla_logs
           WHERE assignee_id = ? AND sla_stage = 'BREACHED'
             AND created_at BETWEEN ? AND ?`,
          [tUserId, period.startTs, period.endTs]
        )
      );
      contactInquiryMetrics = {
        inquiriesAssigned: parseInt(inqStats?.assigned_count || 0, 10),
        inquiriesRespondedOnTime: parseInt(inqStats?.responded_on_time || 0, 10),
        inquiriesSlaBreached: parseInt(breachStats?.breach_count || 0, 10),
        inquiriesClosed: parseInt(inqStats?.closed_count || 0, 10),
        avgClientFeedbackRating: inqStats?.avg_rating ? roundNum(inqStats.avg_rating, 2) : null,
        clientFeedbackCount: parseInt(inqStats?.rating_count || 0, 10),
      };
    } catch {
      // Safe fallback if migration 040 has not yet run in an isolated test
    }

    const ticketMetrics = {
      ticketsAssigned,
      ticketsAccepted,
      ticketsAcknowledgedOnTime,
      ticketsAcknowledgedLate,
      ticketsUnacknowledgedPastSla,
      averageAckTimeHours: ackCount > 0 ? roundNum(ackHoursSum / ackCount, 2) : 0,
      ticketsStartedCount,
      averageTimeToStartHours: startCount > 0 ? roundNum(startHoursSum / startCount, 2) : 0,
      ticketsCompleted,
      ticketsCompletedOnTime,
      ticketsCompletedLate,
      averageCompletionTimeHours: completionCount > 0 ? roundNum(completionHoursSum / completionCount, 2) : 0,
      ticketsOverdueActive,
      ticketsBlockedExternal,
      ticketsReassignedOut,
      ticketsReassignedIn,
      ticketsRejectedQuality,
      ticketsDeclinedInvalid,
      ticketsCancelledManagement,
      revisionRequestCount,
      reopenPenaltyCount,
      weightedWorkloadPoints: roundNum(weightedWorkloadPoints, 1),
      slaAcknowledgmentRate,
      onTimeCompletionRate,
      completionRate,
      overdueRate,
      reassignmentRate,
      qualityScore: ticketQualityScore,
      workloadScore,
    };

    return {
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        property_id: targetUser.property_id,
        property_name: targetUser.property_name,
        employee_id: targetUser.employee_id,
        employee_code: targetUser.employee_code,
        department: targetUser.department,
        job_title: targetUser.job_title,
      },
      period: { startDate: period.startDate, endDate: period.endDate, timezone: 'Africa/Lagos' },
      weights,
      minTicketThreshold,
      insufficientData,
      assessedTicketCount,
      attendance: {
        totalRecords: attendanceMetrics.daysWorked,
        presentCount: attendanceMetrics.onTimeDays,
        lateCount: attendanceMetrics.lateDays,
        absentCount: attendanceMetrics.unapprovedAbsences,
        totalHoursWorked: attendanceMetrics.totalHoursWorked,
        punctualityRate: attendanceMetrics.punctualityRatePct,
      },
      attendanceMetrics,
      ticketMetrics,
      contactInquiryMetrics,
      reassignmentContext: reassignRows.slice(0, 15),
      scoreBreakdown: weightedContributions,
      improvementRecommendations,
      operations: {
        totalTasks: ticketsAssigned,
        completedTasks: ticketsCompleted,
        overdueTasks: ticketsOverdueActive,
        openBlockersCount: ticketsBlockedExternal,
        maintenanceCompleted: parseInt(maintStats?.completed || 0, 10),
        maintenanceTotal: parseInt(maintStats?.total || 0, 10),
        inspectionsCompleted: parseInt(inspStats?.completed || 0, 10),
        reservationsConverted: parseInt(resStats?.converted || 0, 10),
        taskCompletionRate: completionRate,
      },
      disciplinary: disciplinaryMetrics,
      overallCompositeScore,
      rating,
      evaluationMethod:
        'Evidence-Based Ticket & Attendance Evaluation (Africa/Lagos 09:00 Punctuality, Priority Ack SLA, On-Time Execution, Quality & Fair Workload Exclusions)',
    };
  }

  /**
   * Management & Executive Team Performance Overview (Strictly Property-Scoped for Managers)
   */
  static async getWorkforceOverview(requestingUser, { propertyId = null, startDate = null, endDate = null, days = 30 } = {}) {
    const reqRole = String(requestingUser?.role || '').toUpperCase();
    const isGlobal = ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(reqRole);
    const isManager = ['MANAGER', 'OPERATIONS_MANAGER'].includes(reqRole);

    if (!isGlobal && !isManager) {
      throw new ForbiddenError('Access Denied: Management privileges are required to view team performance overview.');
    }

    const params = [];
    let sql = `
      SELECT DISTINCT u.id, u.name, u.role, u.property_id, p.name AS property_name
      FROM users u
      LEFT JOIN properties p ON u.property_id = p.id
      LEFT JOIN user_property_assignments upa ON upa.user_id = u.id
      WHERE u.status = 'ACTIVE'
        AND u.role IN ('STAFF', 'RECEPTIONIST', 'MANAGER', 'OPERATIONS_MANAGER')
    `;

    if (isManager && !isGlobal) {
      const assignedProps = extractRows(
        await pool.query(
          `SELECT property_id FROM user_property_assignments WHERE user_id = ?
           UNION SELECT property_id FROM users WHERE id = ? AND property_id IS NOT NULL`,
          [requestingUser.id, requestingUser.id]
        )
      ).map((r) => Number(r.property_id));

      if (assignedProps.length === 0) {
        throw new ForbiddenError('Access Denied: Manager account has no assigned property scope.');
      }
      if (propertyId && propertyId !== 'all' && !assignedProps.includes(parseInt(propertyId, 10))) {
        throw new ForbiddenError('Access Denied: Property requested is outside your management scope.');
      }

      const effectiveProps = propertyId && propertyId !== 'all' ? [parseInt(propertyId, 10)] : assignedProps;
      const ph = effectiveProps.map(() => '?').join(', ');
      sql += ` AND (u.property_id IN (${ph}) OR upa.property_id IN (${ph}))`;
      params.push(...effectiveProps, ...effectiveProps);
    } else if (propertyId && propertyId !== 'all') {
      const pid = parseInt(propertyId, 10);
      sql += ' AND (u.property_id = ? OR upa.property_id = ?)';
      params.push(pid, pid);
    }

    sql += ' ORDER BY u.name ASC';
    const staffUsers = extractRows(await pool.query(sql, params));

    const evaluations = await Promise.all(
      staffUsers.map((su) =>
        this.getStaffPerformance(requestingUser, su.id, { startDate, endDate, days }).catch((err) => {
          logger.warn(`Failed computing scorecard for user #${su.id}: ${err.message}`);
          return null;
        })
      )
    );

    const valid = evaluations.filter(Boolean);
    const config = await this.getPerformanceConfig();

    const teamSummary = {
      evaluatedStaffCount: valid.length,
      averageCompositeScore: valid.length > 0
        ? roundNum(valid.reduce((s, e) => s + e.overallCompositeScore, 0) / valid.length, 1)
        : 0,
      averageAckSlaRate: valid.length > 0
        ? roundNum(valid.reduce((s, e) => s + e.ticketMetrics.slaAcknowledgmentRate, 0) / valid.length, 1)
        : 100,
      averageOnTimeRate: valid.length > 0
        ? roundNum(valid.reduce((s, e) => s + e.ticketMetrics.onTimeCompletionRate, 0) / valid.length, 1)
        : 100,
      averagePunctualityRate: valid.length > 0
        ? roundNum(valid.reduce((s, e) => s + e.attendanceMetrics.punctualityRatePct, 0) / valid.length, 1)
        : 100,
      totalLateDays: valid.reduce((s, e) => s + e.attendanceMetrics.lateDays, 0),
      totalOverdueActive: valid.reduce((s, e) => s + e.ticketMetrics.ticketsOverdueActive, 0),
      totalEscalatedOrUnackPastSla: valid.reduce((s, e) => s + e.ticketMetrics.ticketsUnacknowledgedPastSla, 0),
    };

    return {
      generatedAt: new Date().toISOString(),
      timezone: 'Africa/Lagos',
      scopeRole: reqRole,
      disciplinaryDataRedacted: reqRole === 'OWNER',
      weights: config.weights,
      minTicketThreshold: config.minTicketThreshold,
      teamSummary,
      staffEvaluations: valid,
    };
  }
}

module.exports = PerformanceEngineService;
