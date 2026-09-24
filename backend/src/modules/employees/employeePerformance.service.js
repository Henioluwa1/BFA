const pool = require('../../db/pool');
const EmployeesRepository = require('./employees.repository');
const EmployeeActivitiesRepository = require('./employeeActivities.repository');
const EmployeeEvaluationsRepository = require('./employeeEvaluations.repository');

class EmployeePerformanceService {
  /**
   * Calculate objective, evidence-based system metrics for an employee over a period
   * (Separates observed system metrics from manager evaluation per Gate 11.6 & Rule 2)
   */
  static async calculateSystemMetrics(employeeId, fromDate, toDate) {
    const employee = await EmployeesRepository.findById(employeeId);
    if (!employee) return null;

    const start = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = toDate ? new Date(toDate) : new Date();
    const fromStr = start.toISOString().slice(0, 10);
    const toStr = end.toISOString().slice(0, 10);
    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));

    // 1. Observed Activities count & category breakdown
    const activitySummary = await EmployeeActivitiesRepository.getSummary({
      employeeId,
      fromDate: fromStr,
      toDate: toStr,
    });

    // 2. Active working days observed (days with recorded activities or shifts)
    const activeDaysRows = await pool.query(
      `SELECT COUNT(DISTINCT DATE(created_at)) AS active_days 
       FROM employee_activities 
       WHERE employee_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?`,
      [employeeId, fromStr, toStr]
    );
    const observedActiveDays = parseInt(activeDaysRows[0]?.active_days || 0, 10);
    // Typical work month has ~22 business days per 30 calendar days
    const expectedWorkDays = Math.max(1, Math.round(totalDays * (5 / 7)));
    const attendanceRate = Math.min(100, Math.round((observedActiveDays / expectedWorkDays) * 100));

    // 3. Operational Tasks Handled (Resolutions, Inspections, Bookings, Check-ins)
    let maintenanceResolved = 0;
    let inspectionsCompleted = 0;
    let reservationsCreated = 0;
    let frontOfficeCheckIns = 0;

    // Check if employee has associated user_id
    if (employee.user_id) {
      // Maintenance assigned & resolved
      const [maintRows] = await pool.query(
        `SELECT 
           COUNT(id) AS total_assigned,
           SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS total_resolved
         FROM maintenance_requests 
         WHERE assigned_to_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?`,
        [employee.user_id, fromStr, toStr]
      );
      maintenanceResolved = parseInt(maintRows?.total_resolved || 0, 10);

      // Inspections completed
      const [inspRows] = await pool.query(
        `SELECT COUNT(id) AS count 
         FROM apartment_inspections 
         WHERE inspector_id = ? AND status = 'COMPLETED' AND DATE(created_at) >= ? AND DATE(created_at) <= ?`,
        [employee.user_id, fromStr, toStr]
      );
      inspectionsCompleted = parseInt(inspRows?.count || 0, 10);

      // Reservations created
      const [resRows] = await pool.query(
        `SELECT COUNT(id) AS count 
         FROM reservations 
         WHERE created_by = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?`,
        [employee.user_id, fromStr, toStr]
      );
      reservationsCreated = parseInt(resRows?.count || 0, 10);
    }

    // Direct activities categorized
    const actRows = await pool.query(
      `SELECT activity_type, COUNT(id) as count 
       FROM employee_activities 
       WHERE employee_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ? 
       GROUP BY activity_type`,
      [employeeId, fromStr, toStr]
    );
    actRows.forEach((r) => {
      if (r.activity_type === 'GUEST_CHECKED_IN') frontOfficeCheckIns += parseInt(r.count, 10);
      if (r.activity_type === 'MAINTENANCE_RESOLVED' && maintenanceResolved === 0) maintenanceResolved += parseInt(r.count, 10);
      if (r.activity_type === 'INSPECTION_COMPLETED' && inspectionsCompleted === 0) inspectionsCompleted += parseInt(r.count, 10);
      if (r.activity_type === 'RESERVATION_CREATED' && reservationsCreated === 0) reservationsCreated += parseInt(r.count, 10);
    });

    const totalOperationalActions =
      maintenanceResolved + inspectionsCompleted + reservationsCreated + frontOfficeCheckIns + activitySummary.totalActivities;

    return {
      period: { fromDate: fromStr, toDate: toStr, days: totalDays },
      observedMetrics: {
        totalActivities: activitySummary.totalActivities,
        observedActiveDays,
        expectedWorkDays,
        estimatedAttendanceRate: attendanceRate,
        maintenanceResolved,
        inspectionsCompleted,
        reservationsCreated,
        frontOfficeCheckIns,
        totalOperationalActions,
        categoryBreakdown: activitySummary.byCategory,
      },
    };
  }

  /**
   * Get complete performance profile for an employee
   * Combines:
   * 1. Objective system metrics
   * 2. Latest manager evaluation
   * 3. Historical evaluation scores and trends
   * 4. Dimension breakdown
   */
  static async getEmployeePerformance(employeeId, { fromDate, toDate } = {}) {
    const employee = await EmployeesRepository.findById(employeeId);
    if (!employee) return null;

    // 1. System Metrics
    const systemMetrics = await this.calculateSystemMetrics(employeeId, fromDate, toDate);

    // 2. Evaluations history
    const evalsResult = await EmployeeEvaluationsRepository.findAll({
      employeeId,
      status: 'ALL',
      limit: 10,
    });
    const evaluations = evalsResult.evaluations || [];

    // Latest finalized evaluation
    const finalizedEvals = evaluations.filter((e) => e.status === 'FINALIZED');
    const latestEvaluation = finalizedEvals.length > 0 ? await EmployeeEvaluationsRepository.findById(finalizedEvals[0].id) : null;

    // Dimension breakdown averages
    const dimensionAverages = {};
    if (latestEvaluation && latestEvaluation.scores) {
      latestEvaluation.scores.forEach((s) => {
        dimensionAverages[s.criterion_name] = parseFloat(s.score);
      });
    }

    // Historical trend of scores
    const scoreTrend = finalizedEvals.map((e) => ({
      evaluationId: e.id,
      code: e.evaluation_code,
      period: e.evaluation_period_label,
      score: parseFloat(e.manager_overall_score || 0),
      date: e.finalized_at || e.period_end,
    }));

    // Overall Average Evaluation Score
    const totalScoreSum = finalizedEvals.reduce((sum, e) => sum + parseFloat(e.manager_overall_score || 0), 0);
    const averageEvaluationScore = finalizedEvals.length > 0 ? Math.round((totalScoreSum / finalizedEvals.length) * 10) / 10 : null;

    const hasEvaluation = !!latestEvaluation;
    const dimensionScores = (latestEvaluation?.scores || []).map((s) => ({
      criteria_name: s.criterion_name || s.name,
      score: parseFloat(s.score || 0),
      score_percentage: parseFloat(s.score || 0),
      comments: s.comments,
    }));

    const managerEvaluation = {
      has_evaluation: hasEvaluation,
      evaluation_id: latestEvaluation?.id || null,
      evaluation_code: latestEvaluation?.evaluation_code || null,
      average_score: latestEvaluation ? parseFloat(latestEvaluation.manager_overall_score || 0) : null,
      evaluator_name: latestEvaluation?.evaluator_name || null,
      finalized_at: latestEvaluation?.finalized_at || null,
      dimension_scores: dimensionScores,
      strengths: latestEvaluation?.strengths || null,
      areas_for_improvement: latestEvaluation?.areas_for_improvement || null,
      comments: latestEvaluation?.evaluator_comments || null,
    };

    const systemMetricsObj = {
      total_activities: systemMetrics?.observedMetrics?.totalActivities || 0,
      active_days: systemMetrics?.observedMetrics?.observedActiveDays || 0,
      expected_work_days: systemMetrics?.observedMetrics?.expectedWorkDays || 0,
      estimated_attendance_rate: systemMetrics?.observedMetrics?.estimatedAttendanceRate || 0,
      maintenance_resolved: systemMetrics?.observedMetrics?.maintenanceResolved || 0,
      inspections_completed: systemMetrics?.observedMetrics?.inspectionsCompleted || 0,
      reservations_handled: systemMetrics?.observedMetrics?.reservationsCreated || 0,
      total_operational_actions: systemMetrics?.observedMetrics?.totalOperationalActions || 0,
    };

    return {
      period: systemMetrics?.period ? {
        start: systemMetrics.period.fromDate,
        end: systemMetrics.period.toDate,
      } : null,
      employee: {
        id: employee.id,
        code: employee.employee_code,
        name: employee.full_name,
        department: employee.department,
        jobTitle: employee.job_title,
        status: employee.employment_status,
        propertyId: employee.property_id,
        propertyName: employee.property_name,
      },
      system_metrics: systemMetricsObj,
      systemMetrics: systemMetrics?.observedMetrics || {},
      manager_evaluation: managerEvaluation,
      evaluationSummary: {
        totalEvaluations: evaluations.length,
        finalizedEvaluationsCount: finalizedEvals.length,
        latestScore: latestEvaluation ? parseFloat(latestEvaluation.manager_overall_score) : null,
        averageScore: averageEvaluationScore,
        dimensionBreakdown: dimensionAverages,
        scoreTrend,
      },
      latestEvaluation,
      activity_breakdown: systemMetrics?.observedMetrics?.categoryBreakdown || {},
    };
  }
}

module.exports = EmployeePerformanceService;
