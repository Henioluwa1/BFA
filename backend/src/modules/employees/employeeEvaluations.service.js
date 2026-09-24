const EmployeeEvaluationsRepository = require('./employeeEvaluations.repository');
const EmployeesRepository = require('./employees.repository');
const EmployeePerformanceService = require('./employeePerformance.service');
const AccessControlService = require('../../core/access/accessControl.service');
const AuditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');
const pool = require('../../db/pool');

class EmployeeEvaluationsService {
  /**
   * Get active evaluation criteria templates
   */
  static async getCriteria() {
    return EmployeeEvaluationsRepository.getCriteria();
  }

  /**
   * List evaluations with security scoping
   */
  static async listEvaluations(query, req = null) {
    const user = req?.user;
    let employeeId = query.employeeId ? parseInt(query.employeeId, 10) : undefined;

    // Self-service: Staff can only see their own evaluations
    if (user && ['STAFF', 'RECEPTIONIST'].includes((user.role || '').toUpperCase())) {
      const myEmp = await EmployeesRepository.findByUserId(user.id);
      if (myEmp) {
        employeeId = myEmp.id;
      }
    }

    return EmployeeEvaluationsRepository.findAll({
      ...query,
      employeeId,
      user,
    });
  }

  /**
   * Get single evaluation by ID with permissions check
   */
  static async getEvaluationById(id, req = null) {
    const evalRecord = await EmployeeEvaluationsRepository.findById(id);
    if (!evalRecord) {
      throw new NotFoundError(`Evaluation #${id} not found.`);
    }

    const user = req?.user;
    // Staff self-service check
    if (user && ['STAFF', 'RECEPTIONIST'].includes((user.role || '').toUpperCase())) {
      const myEmp = await EmployeesRepository.findByUserId(user.id);
      if (!myEmp || parseInt(myEmp.id, 10) !== parseInt(evalRecord.employee_id, 10)) {
        throw new ForbiddenError('You are only authorized to view your own performance evaluations.');
      }
      // Non-managers cannot view DRAFT evaluations
      if (evalRecord.status === 'DRAFT') {
        throw new ForbiddenError('Draft evaluations are not yet visible to the employee.');
      }
    }

    // Property scope check
    if (
      user &&
      user.propertyId &&
      !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((user.role || '').toUpperCase()) &&
      evalRecord.property_id &&
      parseInt(evalRecord.property_id, 10) !== parseInt(user.propertyId, 10)
    ) {
      throw new ForbiddenError('Access denied: Evaluation belongs to another property scope.');
    }

    return evalRecord;
  }

  /**
   * Create new evaluation in DRAFT state
   */
  static async createDraft(data, user, req = null) {
    // Capability check: EMPLOYEE_EVALUATION_CREATE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_EVALUATION_CREATE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Evaluation creation requires authorized capability (${capCheck.reason}).`);
    }

    const employeeId = data.employee_id || data.employeeId;
    const periodStart = data.period_start || data.periodStart;
    const periodEnd = data.period_end || data.periodEnd;
    const generalComments = data.general_comments || data.evaluator_comments || data.comments;
    const areasForImprovement = data.areas_for_improvement || data.areasForImprovement;
    const strengths = data.strengths;

    if (!employeeId) {
      throw new ValidationError('employeeId is required.');
    }
    if (!periodStart || !periodEnd) {
      throw new ValidationError('Evaluation period start and end dates are required.');
    }

    const employee = await EmployeesRepository.findById(employeeId);
    if (!employee) {
      throw new NotFoundError(`Employee #${employeeId} not found.`);
    }

    // Prevent evaluator evaluating themselves
    if (employee.user_id && user && employee.user_id === user.id) {
      throw new ConflictError('Employees cannot conduct or author their own performance evaluations.');
    }

    // Check existing evaluation in period
    const existing = await EmployeeEvaluationsRepository.findExistingInPeriod(
      employee.id,
      periodStart,
      periodEnd
    );
    if (existing) {
      throw new ConflictError(`An evaluation already exists for ${employee.full_name} in period ${periodStart} to ${periodEnd} (#${existing.evaluation_code}).`);
    }

    const periodLabel =
      data.evaluationPeriodLabel || data.evaluation_period_label || `${new Date(periodStart).toLocaleDateString()} - ${new Date(periodEnd).toLocaleDateString()}`;
    const evalCode = `EVAL-EMP${employee.id}-${Date.now().toString(36).toUpperCase()}`;

    // Capture objective system metrics snapshot
    const systemSnapshot = await EmployeePerformanceService.calculateSystemMetrics(
      employee.id,
      periodStart,
      periodEnd
    );

    // Calculate initial manager score if scores provided
    let managerOverallScore = null;
    if (data.scores && Array.isArray(data.scores) && data.scores.length > 0) {
      const sum = data.scores.reduce((acc, s) => acc + (parseFloat(s.score) || 0), 0);
      managerOverallScore = Number((sum / data.scores.length).toFixed(2));
    }

    let insertId;
    await pool.withTransaction(async (conn) => {
      insertId = await EmployeeEvaluationsRepository.create(
        {
          evaluation_code: evalCode,
          employee_id: employee.id,
          evaluator_id: user?.id || 1,
          property_id: employee.property_id || user?.propertyId || null,
          period_start: periodStart,
          period_end: periodEnd,
          evaluation_period_label: periodLabel,
          status: 'DRAFT',
          system_metrics_snapshot: systemSnapshot?.observedMetrics || null,
          manager_overall_score: managerOverallScore,
          strengths: strengths || null,
          areas_for_improvement: areasForImprovement || null,
          evaluator_comments: generalComments || null,
        },
        conn
      );

      if (data.scores && Array.isArray(data.scores) && data.scores.length > 0) {
        await EmployeeEvaluationsRepository.saveScores(insertId, data.scores, conn);
      }
    });

    const created = await EmployeeEvaluationsRepository.findById(insertId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_EVALUATION_CREATED',
      entityType: 'employee_evaluation',
      entityId: String(insertId),
      newValues: {
        evaluationCode: evalCode,
        employeeId: employee.id,
        employeeName: employee.full_name,
        period: periodLabel,
        status: 'DRAFT',
      },
    });

    return created;
  }

  /**
   * Update draft evaluation
   */
  static async updateDraft(id, data, user, req = null) {
    const existing = await this.getEvaluationById(id, req);

    if (existing.status !== 'DRAFT') {
      throw new ConflictError(`Cannot edit evaluation: Current status is '${existing.status}'. Only DRAFT evaluations can be edited.`);
    }

    // Capability check: EMPLOYEE_EVALUATION_UPDATE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_EVALUATION_UPDATE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Evaluation update requires authorized capability (${capCheck.reason}).`);
    }

    let managerOverallScore = existing.manager_overall_score;
    if (data.scores && Array.isArray(data.scores) && data.scores.length > 0) {
      const sum = data.scores.reduce((acc, s) => acc + (parseFloat(s.score) || 0), 0);
      managerOverallScore = Number((sum / data.scores.length).toFixed(2));
    }

    await pool.withTransaction(async (conn) => {
      await EmployeeEvaluationsRepository.update(
        id,
        {
          manager_overall_score: managerOverallScore,
          strengths: data.strengths !== undefined ? data.strengths : existing.strengths,
          areas_for_improvement: data.areasForImprovement !== undefined ? data.areasForImprovement : existing.areas_for_improvement,
          evaluator_comments: data.evaluatorComments !== undefined ? data.evaluatorComments : existing.evaluator_comments,
        },
        conn
      );

      if (data.scores && Array.isArray(data.scores) && data.scores.length > 0) {
        await EmployeeEvaluationsRepository.saveScores(id, data.scores, conn);
      }
    });

    const updated = await EmployeeEvaluationsRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_EVALUATION_UPDATED',
      entityType: 'employee_evaluation',
      entityId: String(id),
      newValues: {
        score: managerOverallScore,
      },
    });

    return updated;
  }

  /**
   * Submit evaluation (DRAFT -> SUBMITTED)
   */
  static async submitEvaluation(id, user, req = null) {
    const existing = await this.getEvaluationById(id, req);

    if (existing.status !== 'DRAFT') {
      throw new ConflictError(`Cannot submit evaluation: Current status is '${existing.status}'.`);
    }

    // Capability check: EMPLOYEE_EVALUATION_UPDATE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_EVALUATION_UPDATE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Submitting evaluation requires authorized capability (${capCheck.reason}).`);
    }

    if (!existing.scores || existing.scores.length === 0) {
      throw new ValidationError('Evaluation must have dimension scores before submission.');
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await EmployeeEvaluationsRepository.update(id, {
      status: 'SUBMITTED',
      submitted_at: nowStr,
    });

    const updated = await EmployeeEvaluationsRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_EVALUATION_SUBMITTED',
      entityType: 'employee_evaluation',
      entityId: String(id),
      oldValues: { status: 'DRAFT' },
      newValues: { status: 'SUBMITTED', submittedAt: nowStr },
    });

    return updated;
  }

  /**
   * Finalize evaluation (SUBMITTED / DRAFT -> FINALIZED)
   */
  static async finalizeEvaluation(id, user, req = null) {
    const existing = await this.getEvaluationById(id, req);

    if (existing.status === 'FINALIZED') {
      throw new ConflictError(`Evaluation #${existing.evaluation_code} is already finalized.`);
    }

    // Capability check: EMPLOYEE_EVALUATION_FINALIZE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_EVALUATION_FINALIZE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Finalizing evaluations requires authorized capability (${capCheck.reason}).`);
    }

    if (!existing.scores || existing.scores.length === 0) {
      throw new ValidationError('Evaluation cannot be finalized without evaluation dimension scores.');
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await EmployeeEvaluationsRepository.update(id, {
      status: 'FINALIZED',
      finalized_by_id: user?.id || null,
      finalized_at: nowStr,
    });

    const updated = await EmployeeEvaluationsRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_EVALUATION_FINALIZED',
      entityType: 'employee_evaluation',
      entityId: String(id),
      oldValues: { status: existing.status },
      newValues: {
        status: 'FINALIZED',
        finalizedById: user?.id,
        finalizedAt: nowStr,
        finalScore: updated.manager_overall_score,
      },
    });

    // Notify employee if linked to user
    try {
      const emp = await EmployeesRepository.findById(existing.employee_id);
      if (emp && emp.user_id) {
        await NotificationsService.dispatchNotification({
          recipientId: emp.user_id,
          title: `Performance Evaluation Finalized: ${existing.evaluation_period_label}`,
          message: `Your evaluation for ${existing.evaluation_period_label} has been finalized with an overall score of ${updated.manager_overall_score}%.`,
          category: 'OPERATIONAL',
          priority: 'MEDIUM',
          sourceEntityType: 'employee_evaluation',
          sourceEntityId: id,
        });
      }
    } catch (notifErr) {
      // Non-fatal
    }

    return updated;
  }
}

module.exports = EmployeeEvaluationsService;
