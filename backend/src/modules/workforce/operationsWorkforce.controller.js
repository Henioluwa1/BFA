/**
 * Operations Workforce Controller
 * BFA Apartments Management System
 *
 * Exposes API endpoints for:
 * - Roster Property Assignments & PDF Notices
 * - Operational Tasks & Blocker Reporting
 * - Disciplinary Queries & Show-Cause rebuttals
 * - Performance Improvement Plans (PIPs) & Recognitions
 * - Admin Directives & Manager Execution Plans
 * - Staff-Submitted Operational Reports & Reviews
 * - Role-appropriate Performance Analytics
 */

const ApiResponse = require('../../utils/apiResponse');
const RosterAssignmentService = require('./rosterAssignment.service');
const TaskOperationsService = require('./taskOperations.service');
const DisciplinaryAndPipService = require('./disciplinaryAndPip.service');
const DirectivesService = require('./directives.service');
const StaffReportsService = require('./staffReports.service');
const PerformanceEngineService = require('./performanceEngine.service');

class OperationsWorkforceController {
  // ─── Roster Property Assignments ──────────────────────────────────────────
  static async createAssignment(req, res, next) {
    try {
      const assignment = await RosterAssignmentService.createAssignment(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'Roster property assignment created and dispatched successfully',
        data: assignment,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listAssignments(req, res, next) {
    try {
      const assignments = await RosterAssignmentService.listAssignments(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Roster assignments retrieved successfully',
        data: assignments,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAssignmentById(req, res, next) {
    try {
      const assignment = await RosterAssignmentService.getAssignmentById(req.user, req.params.id);
      return ApiResponse.success(res, {
        message: 'Assignment details retrieved',
        data: assignment,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateAssignmentStatus(req, res, next) {
    try {
      const updated = await RosterAssignmentService.updateAssignmentStatus(
        req.user,
        req.params.id,
        req.body?.action,
        req.body
      );
      return ApiResponse.success(res, {
        message: `Assignment marked as ${updated.status}`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async downloadAssignmentPdf(req, res, next) {
    try {
      const pdfBuffer = await RosterAssignmentService.generateAssignmentNoticePdf(req.user, req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Assignment_Notice_${req.params.id}.pdf"`);
      return res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  }

  // ─── Operational Tasks & Blockers ─────────────────────────────────────────
  static async createTask(req, res, next) {
    try {
      const task = await TaskOperationsService.createTask(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'Operational task created successfully',
        data: task,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listTasks(req, res, next) {
    try {
      const tasks = await TaskOperationsService.listTasks(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Operational tasks retrieved',
        data: tasks,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getTaskById(req, res, next) {
    try {
      const task = await TaskOperationsService.getTaskById(req.user, req.params.id);
      return ApiResponse.success(res, {
        message: 'Task details retrieved',
        data: task,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateTaskProgress(req, res, next) {
    try {
      const task = await TaskOperationsService.updateTaskProgress(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Task progress updated successfully',
        data: task,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reportBlocker(req, res, next) {
    try {
      const blocker = await TaskOperationsService.reportBlocker(req.user, req.params.id, req.body);
      return ApiResponse.created(res, {
        message: 'Operational blocker reported and task flagged as BLOCKED',
        data: blocker,
      });
    } catch (err) {
      next(err);
    }
  }

  static async resolveBlocker(req, res, next) {
    try {
      const blocker = await TaskOperationsService.resolveBlocker(req.user, req.params.blockerId, req.body);
      return ApiResponse.success(res, {
        message: 'Operational blocker resolved successfully',
        data: blocker,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reviewTask(req, res, next) {
    try {
      const reviewed = await TaskOperationsService.reviewTask(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: `Task review finalized with status ${reviewed.review_status}`,
        data: reviewed,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Disciplinary Queries & Show-Cause Notices ───────────────────────────
  static async issueQuery(req, res, next) {
    try {
      const query = await DisciplinaryAndPipService.issueQuery(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'Formal show-cause query issued and dispatched',
        data: query,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listQueries(req, res, next) {
    try {
      const queries = await DisciplinaryAndPipService.listQueries(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Disciplinary queries retrieved',
        data: queries,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getQueryById(req, res, next) {
    try {
      const query = await DisciplinaryAndPipService.getQueryById(req.user, req.params.id);
      return ApiResponse.success(res, {
        message: 'Query details retrieved',
        data: query,
      });
    } catch (err) {
      next(err);
    }
  }

  static async submitQueryResponse(req, res, next) {
    try {
      const updated = await DisciplinaryAndPipService.submitQueryResponse(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Formal response submitted successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async concludeQuery(req, res, next) {
    try {
      const concluded = await DisciplinaryAndPipService.concludeQuery(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Query assessment and outcome recorded',
        data: concluded,
      });
    } catch (err) {
      next(err);
    }
  }

  static async sanctionReview(req, res, next) {
    try {
      const reviewed = await DisciplinaryAndPipService.reviewSanction(
        req.user,
        req.params.id,
        req.body?.decision,
        req.body?.notes
      );
      return ApiResponse.success(res, {
        message: `Formal sanction ${req.body?.decision === 'APPROVE' ? 'approved' : 'rejected'}`,
        data: reviewed,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Performance Improvement Plans (PIPs) & Recognitions ─────────────────
  static async createPip(req, res, next) {
    try {
      const pip = await DisciplinaryAndPipService.createPip(req.user, req.body);
      return ApiResponse.created(res, {
        message: pip.is_positive_recognition ? 'Positive recognition recorded' : 'Performance Improvement Plan established',
        data: pip,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listPips(req, res, next) {
    try {
      const pips = await DisciplinaryAndPipService.listPips(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Improvement plans retrieved',
        data: pips,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updatePip(req, res, next) {
    try {
      const updated = await DisciplinaryAndPipService.updatePip(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Improvement plan updated',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Directives ──────────────────────────────────────────────────────────
  static async createDirective(req, res, next) {
    try {
      const directive = await DirectivesService.createDirective(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'Operational directive issued successfully',
        data: directive,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listDirectives(req, res, next) {
    try {
      const directives = await DirectivesService.listDirectives(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Operational directives retrieved',
        data: directives,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getDirectiveById(req, res, next) {
    try {
      const directive = await DirectivesService.getDirectiveById(req.user, req.params.id);
      return ApiResponse.success(res, {
        message: 'Directive details retrieved',
        data: directive,
      });
    } catch (err) {
      next(err);
    }
  }

  static async submitDirectiveExecutionPlan(req, res, next) {
    try {
      const updated = await DirectivesService.submitExecutionPlan(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Manager execution plan submitted',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateDirectiveStatus(req, res, next) {
    try {
      const updated = await DirectivesService.updateDirectiveStatus(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Directive status updated',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Staff-Submitted Operational Reports ─────────────────────────────────
  static async submitStaffReport(req, res, next) {
    try {
      const report = await StaffReportsService.submitReport(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'Operational report submitted successfully',
        data: report,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listStaffReports(req, res, next) {
    try {
      const reports = await StaffReportsService.listStaffReports(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Staff reports retrieved',
        data: reports,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getStaffReportById(req, res, next) {
    try {
      const report = await StaffReportsService.getReportById(req.user, req.params.id);
      return ApiResponse.success(res, {
        message: 'Report details retrieved',
        data: report,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reviewStaffReport(req, res, next) {
    try {
      const reviewed = await StaffReportsService.reviewStaffReport(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: `Report reviewed with status ${reviewed.status}`,
        data: reviewed,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Performance Engine ──────────────────────────────────────────────────
  static async getPersonalPerformance(req, res, next) {
    try {
      const performance = await PerformanceEngineService.getStaffPerformance(req.user, req.user.id, req.query);
      return ApiResponse.success(res, {
        message: 'Personal performance metrics retrieved',
        data: performance,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getStaffPerformance(req, res, next) {
    try {
      const performance = await PerformanceEngineService.getStaffPerformance(req.user, req.params.userId, req.query);
      return ApiResponse.success(res, {
        message: 'Staff performance metrics retrieved',
        data: performance,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getWorkforcePerformanceOverview(req, res, next) {
    try {
      const overview = await PerformanceEngineService.getWorkforceOverview(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Workforce performance overview retrieved',
        data: overview,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = OperationsWorkforceController;
