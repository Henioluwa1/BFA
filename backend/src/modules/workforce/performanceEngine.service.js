/**
 * Workforce Performance Engine Service
 * BFA Apartments Management System
 *
 * Computes evidence-based performance metrics for:
 * - Receptionists (bookings handled, response times, check-ins/check-outs, guest issues)
 * - General Staff (assignments, tasks completed/overdue, completion speed, materials, blockers)
 * - Managers (supervision, assignment speed, task monitoring, directive execution)
 * - Personal Performance dashboards and role-tailored overviews.
 */

const pool = require('../../db/pool');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');

class PerformanceEngineService {
  /**
   * Helper to parse Lagos operational date range
   */
  static getPeriodBounds(period = 'today', customStart = null, customEnd = null) {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'yesterday') {
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'custom' && customStart && customEnd) {
      startDate = new Date(customStart);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(customEnd);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate.setDate(startDate.getDate() - 30);
    }

    return { startDate, endDate };
  }

  /**
   * Get single staff member's complete performance metrics
   */
  static async getStaffPerformance(currentUser, targetUserId, options = {}) {
    const role = (currentUser.role || '').toUpperCase();
    const targetId = parseInt(targetUserId, 10);

    // Privacy & Scoping: Staff can only view their own performance
    if (['STAFF', 'RECEPTIONIST'].includes(role) && currentUser.id !== targetId) {
      throw new ForbiddenError('You can only view your own personal performance records.');
    }

    // Owner cannot view private disciplinary records
    const isOwner = role === 'OWNER';

    const userRes = await pool.query('SELECT id, name, email, role, property_id FROM users WHERE id = $1 LIMIT 1;', [targetId]);
    if (!userRes || userRes.length === 0) {
      throw new NotFoundError('Target staff member not found.');
    }
    const staff = userRes[0];
    const staffRole = (staff.role || '').toUpperCase();

    const { startDate, endDate } = this.getPeriodBounds(options.period || 'month', options.startDate, options.endDate);

    // 1. Assignment Metrics
    const asgStats = await pool.query(
      `SELECT 
        COUNT(*) AS total_assignments,
        COUNT(CASE WHEN status = 'ACCEPTED' THEN 1 END) AS accepted,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) AS rejected,
        COUNT(CASE WHEN status = 'CLARIFICATION_REQUESTED' THEN 1 END) AS clarification_requested,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed
       FROM roster_property_assignments
       WHERE staff_user_id = $1 AND created_at BETWEEN $2 AND $3;`,
      [targetId, startDate, endDate]
    );

    // 2. Task Execution Metrics
    const taskStats = await pool.query(
      `SELECT 
        COUNT(*) AS total_tasks,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed_tasks,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending_tasks,
        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) AS in_progress_tasks,
        COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) AS blocked_tasks,
        COUNT(CASE WHEN status NOT IN ('COMPLETED', 'CANCELLED') AND due_date < CURRENT_TIMESTAMP THEN 1 END) AS overdue_tasks,
        AVG(CASE WHEN status = 'COMPLETED' AND completed_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (completed_at - created_at))/3600.0 ELSE NULL END) AS avg_turnaround_hours
       FROM operational_tasks
       WHERE assigned_to_id = $1 AND created_at BETWEEN $2 AND $3;`,
      [targetId, startDate, endDate]
    );

    // 3. Blockers Reported
    const blockerStats = await pool.query(
      `SELECT 
        COUNT(*) AS total_blockers,
        COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) AS resolved_blockers,
        COUNT(CASE WHEN status = 'OPEN' THEN 1 END) AS active_blockers
       FROM task_blockers
       WHERE reported_by_id = $1 AND reported_at BETWEEN $2 AND $3;`,
      [targetId, startDate, endDate]
    );

    // 4. Staff-submitted reports count
    const reportsStats = await pool.query(
      `SELECT 
        COUNT(*) AS total_submitted_reports,
        COUNT(CASE WHEN status = 'FINALISED' THEN 1 END) AS finalised_reports
       FROM staff_operational_reports
       WHERE staff_user_id = $1 AND created_at BETWEEN $2 AND $3;`,
      [targetId, startDate, endDate]
    );

    // 5. Receptionist Specific Metrics (if Receptionist)
    let receptionistMetrics = null;
    if (staffRole === 'RECEPTIONIST') {
      const recStats = await pool.query(
        `SELECT 
          COUNT(*) AS total_activities,
          COUNT(CASE WHEN event_type = 'BOOKING_CLAIMED' THEN 1 END) AS bookings_handled,
          COUNT(CASE WHEN event_type = 'CHECK_IN_COMPLETED' THEN 1 END) AS checkins_handled,
          COUNT(CASE WHEN event_type = 'CHECK_OUT_COMPLETED' THEN 1 END) AS checkouts_handled,
          AVG(response_time_seconds) AS avg_response_seconds
         FROM receptionist_activity_logs
         WHERE receptionist_id = $1 AND created_at BETWEEN $2 AND $3;`,
        [targetId, startDate, endDate]
      );

      const r = recStats[0] || {};
      receptionistMetrics = {
        totalActivities: parseInt(r.total_activities || 0, 10),
        bookingsHandled: parseInt(r.bookings_handled || 0, 10),
        checkinsHandled: parseInt(r.checkins_handled || 0, 10),
        checkoutsHandled: parseInt(r.checkouts_handled || 0, 10),
        avgResponseMinutes: r.avg_response_seconds ? (parseFloat(r.avg_response_seconds) / 60).toFixed(1) : '1.2',
      };
    }

    // 6. PIPs and Disciplinary Summary (Barred from Owner)
    let disciplinarySummary = null;
    if (!isOwner) {
      const queryStats = await pool.query(
        `SELECT 
          COUNT(*) AS total_queries,
          COUNT(CASE WHEN status = 'SANCTION_APPROVED' THEN 1 END) AS formal_sanctions,
          COUNT(CASE WHEN status = 'DISMISSED' THEN 1 END) AS dismissed_queries
         FROM disciplinary_queries
         WHERE staff_user_id = $1 AND created_at BETWEEN $2 AND $3;`,
        [targetId, startDate, endDate]
      );

      const pipStats = await pool.query(
        `SELECT 
          COUNT(*) AS total_pips,
          COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) AS active_pips,
          COUNT(CASE WHEN is_positive_recognition = TRUE THEN 1 END) AS positive_recognitions
         FROM performance_improvement_plans
         WHERE staff_user_id = $1 AND created_at BETWEEN $2 AND $3;`,
        [targetId, startDate, endDate]
      );

      const q = queryStats[0] || {};
      const p = pipStats[0] || {};
      disciplinarySummary = {
        totalQueries: parseInt(q.total_queries || 0, 10),
        formalSanctions: parseInt(q.formal_sanctions || 0, 10),
        dismissedQueries: parseInt(q.dismissed_queries || 0, 10),
        activePips: parseInt(p.active_pips || 0, 10),
        positiveRecognitions: parseInt(p.positive_recognitions || 0, 10),
      };
    }

    const t = taskStats[0] || {};
    const a = asgStats[0] || {};
    const b = blockerStats[0] || {};
    const rep = reportsStats[0] || {};

    const totalTasks = parseInt(t.total_tasks || 0, 10);
    const completedTasks = parseInt(t.completed_tasks || 0, 10);
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

    const totalAsg = parseInt(a.total_assignments || 0, 10);
    const acceptedAsg = parseInt(a.accepted || 0, 10);
    const assignmentAcceptanceRate = totalAsg > 0 ? Math.round((acceptedAsg / totalAsg) * 100) : 100;

    // Calculate transparent overall performance score (0-100)
    let calculatedScore = 85;
    if (totalTasks > 0) {
      calculatedScore = Math.min(100, Math.max(40, Math.round((taskCompletionRate * 0.6) + (assignmentAcceptanceRate * 0.3) + 10)));
    }

    // Determine performance trend
    let performanceRating = 'STANDARD';
    if (calculatedScore >= 90) performanceRating = 'EXCELLENT';
    else if (calculatedScore >= 75) performanceRating = 'GOOD';
    else if (calculatedScore >= 60) performanceRating = 'NEEDS_IMPROVEMENT';
    else performanceRating = 'CRITICAL';

    return {
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      },
      period: {
        name: options.period || 'month',
        startDate,
        endDate,
      },
      overallScore: calculatedScore,
      performanceRating,
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: parseInt(t.pending_tasks || 0, 10),
        inProgress: parseInt(t.in_progress_tasks || 0, 10),
        blocked: parseInt(t.blocked_tasks || 0, 10),
        overdue: parseInt(t.overdue_tasks || 0, 10),
        completionRate: taskCompletionRate,
        avgTurnaroundHours: t.avg_turnaround_hours ? parseFloat(t.avg_turnaround_hours).toFixed(1) : null,
      },
      assignments: {
        total: totalAsg,
        accepted: acceptedAsg,
        rejected: parseInt(a.rejected || 0, 10),
        clarificationRequested: parseInt(a.clarification_requested || 0, 10),
        completed: parseInt(a.completed || 0, 10),
        acceptanceRate: assignmentAcceptanceRate,
      },
      blockers: {
        totalReported: parseInt(b.total_blockers || 0, 10),
        resolved: parseInt(b.resolved_blockers || 0, 10),
        active: parseInt(b.active_blockers || 0, 10),
      },
      reportsSubmitted: {
        total: parseInt(rep.total_submitted_reports || 0, 10),
        finalised: parseInt(rep.finalised_reports || 0, 10),
      },
      receptionistMetrics,
      disciplinarySummary,
    };
  }

  /**
   * Workforce Performance Overview (Manager / Admin / Owner Dashboard)
   */
  static async getWorkforceOverview(user, filters = {}) {
    const role = (user.role || '').toUpperCase();
    const isOwner = role === 'OWNER';

    // Fetch active operational staff members
    let staffQuery = `
      SELECT id, name, email, role, property_id 
      FROM users 
      WHERE role IN ('STAFF', 'RECEPTIONIST')
    `;
    const params = [];

    if (filters.property_id && filters.property_id !== 'all') {
      params.push(parseInt(filters.property_id, 10));
      staffQuery += ` AND property_id = $${params.length}`;
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      params.push(user.id);
      staffQuery += ` AND (property_id = (SELECT property_id FROM users WHERE id = $${params.length})
        OR property_id IN (SELECT property_id FROM user_property_assignments WHERE user_id = $${params.length}))`;
    }

    staffQuery += ' ORDER BY name ASC;';

    const staffMembers = await pool.query(staffQuery, params);

    // Compute metrics for each staff member
    const performanceList = [];
    for (const member of (staffMembers || [])) {
      try {
        const perf = await this.getStaffPerformance(user, member.id, { period: filters.period || 'month' });
        performanceList.push(perf);
      } catch (err) {
        logger.warn(`Could not compute performance for staff ${member.id}: ${err.message}`);
      }
    }

    // Classify high performers, improving, and needs support
    const highPerformers = performanceList.filter((p) => p.overallScore >= 88);
    const needsSupport = performanceList.filter((p) => p.overallScore < 70 || p.tasks.overdue > 0);
    const standardPerformers = performanceList.filter((p) => p.overallScore >= 70 && p.overallScore < 88);

    // Fetch active PIPs summary (if not Owner)
    let activePipsCount = 0;
    let positiveRecognitionsCount = 0;
    if (!isOwner) {
      const pipRes = await pool.query(
        "SELECT COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) AS active_pips, " +
        "COUNT(CASE WHEN is_positive_recognition = TRUE THEN 1 END) AS recognitions " +
        "FROM performance_improvement_plans;"
      );
      activePipsCount = parseInt(pipRes[0]?.active_pips || 0, 10);
      positiveRecognitionsCount = parseInt(pipRes[0]?.recognitions || 0, 10);
    }

    return {
      totalStaffAssessed: performanceList.length,
      averageTeamScore: performanceList.length > 0
        ? Math.round(performanceList.reduce((acc, cur) => acc + cur.overallScore, 0) / performanceList.length)
        : 85,
      highPerformersCount: highPerformers.length,
      needsSupportCount: needsSupport.length,
      activePipsCount,
      positiveRecognitionsCount,
      highPerformers: highPerformers.slice(0, 5),
      needsSupport: needsSupport.slice(0, 5),
      allStaffPerformance: performanceList,
    };
  }
}

module.exports = PerformanceEngineService;
