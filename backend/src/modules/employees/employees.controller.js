const fs = require('fs');
const path = require('path');
const EmployeesService = require('./employees.service');
const EmployeePerformanceService = require('./employeePerformance.service');
const EmployeeActivitiesService = require('./employeeActivities.service');
const EmployeeEvaluationsService = require('./employeeEvaluations.service');
const EmployeeIdCardsService = require('./employeeIdCards.service');
const EmployeeIdCardsRepository = require('./employeeIdCards.repository');

class EmployeesController {
  // === EMPLOYEES CRUD ===
  static async getAll(req, res, next) {
    try {
      const result = await EmployeesService.listEmployees(req.query, req);
      res.status(200).json({
        success: true,
        data: {
          employees: result.employees,
          pagination: result.pagination,
        },
        employees: result.employees,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getStats(req, res, next) {
    try {
      const stats = await EmployeesService.getStats(req.query, req);
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const employee = await EmployeesService.getEmployeeById(req.params.id, req);
      res.status(200).json({
        success: true,
        data: employee,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const employee = await EmployeesService.createEmployee(req.body, req);
      res.status(201).json({
        success: true,
        message: 'Employee registered successfully',
        data: employee,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const updated = await EmployeesService.updateEmployee(req.params.id, req.body, req);
      res.status(200).json({
        success: true,
        message: 'Employee updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req, res, next) {
    try {
      const status = req.body.status || req.body.employment_status;
      const reason = req.body.status_reason || req.body.reason;
      const updated = await EmployeesService.updateStatus(req.params.id, { status, reason }, req);
      res.status(200).json({
        success: true,
        message: `Employee employment status changed to ${status}`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async uploadPhoto(req, res, next) {
    try {
      const updated = await EmployeesService.uploadPhoto(req.params.id, req.body, req);
      res.status(200).json({
        success: true,
        message: 'Employee photograph updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPhoto(req, res, next) {
    try {
      const uploadsDir = path.resolve(__dirname, '../../../uploads/employees');
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        const match = files.find((f) => f.startsWith(`emp_${req.params.id}_`));
        if (match) {
          const filePath = path.join(uploadsDir, match);
          const ext = path.extname(match).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          res.setHeader('Content-Type', mime);
          return fs.createReadStream(filePath).pipe(res);
        }
      }
      res.status(404).json({
        success: false,
        message: 'No photo configured for this employee.',
      });
    } catch (err) {
      next(err);
    }
  }

  // === PERFORMANCE & ACTIVITIES ===
  static async getPerformance(req, res, next) {
    try {
      const performance = await EmployeePerformanceService.getEmployeePerformance(req.params.id, req.query);
      res.status(200).json({
        success: true,
        data: performance,
      });
    } catch (err) {
      next(err);
    }
  }

  static async logActivity(req, res, next) {
    try {
      const employeeId = req.params.id || req.body.employee_id;
      const activity = await EmployeeActivitiesService.recordActivity({
        employeeId,
        propertyId: req.body.property_id,
        activityType: req.body.activity_type,
        activityCategory: req.body.activity_category,
        description: req.body.description,
        relatedEntityType: req.body.related_entity_type,
        relatedEntityId: req.body.related_entity_id,
        status: req.body.status || 'COMPLETED',
        metadata: req.body.metadata,
      });
      res.status(201).json({
        success: true,
        data: activity,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getActivities(req, res, next) {
    try {
      const query = { ...req.query, employeeId: req.params.id || req.query.employeeId };
      const result = await EmployeeActivitiesService.listActivities(query, req);
      res.status(200).json({
        success: true,
        data: {
          activities: result.activities,
          breakdown: result.breakdown || {},
          pagination: result.pagination,
        },
        activities: result.activities,
        breakdown: result.breakdown || {},
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getActivitySummary(req, res, next) {
    try {
      const query = { ...req.query, employeeId: req.params.id || req.query.employeeId };
      const summary = await EmployeeActivitiesService.getActivitySummary(query, req);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }

  // === EVALUATIONS ===
  static async getCriteria(req, res, next) {
    try {
      const criteria = await EmployeeEvaluationsService.getCriteria();
      res.status(200).json({
        success: true,
        data: criteria,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getEvaluations(req, res, next) {
    try {
      const query = { ...req.query, employeeId: req.params.id || req.query.employeeId };
      const result = await EmployeeEvaluationsService.listEvaluations(query, req);
      res.status(200).json({
        success: true,
        data: result.evaluations,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getEvaluationById(req, res, next) {
    try {
      const evaluation = await EmployeeEvaluationsService.getEvaluationById(req.params.evalId || req.params.id, req);
      res.status(200).json({
        success: true,
        data: evaluation,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createEvaluation(req, res, next) {
    try {
      const payload = {
        ...req.body,
        employee_id: req.params.id || req.body.employee_id || req.body.employeeId,
      };
      const evaluation = await EmployeeEvaluationsService.createDraft(payload, req.user, req);
      res.status(201).json({
        success: true,
        message: 'Evaluation created as DRAFT',
        data: evaluation,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateEvaluation(req, res, next) {
    try {
      const updated = await EmployeeEvaluationsService.updateDraft(req.params.evalId || req.params.id, req.body, req.user, req);
      res.status(200).json({
        success: true,
        message: 'Draft evaluation updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async submitEvaluation(req, res, next) {
    try {
      const submitted = await EmployeeEvaluationsService.submitEvaluation(req.params.evalId || req.params.id, req.user, req);
      res.status(200).json({
        success: true,
        message: 'Evaluation submitted successfully',
        data: submitted,
      });
    } catch (err) {
      next(err);
    }
  }

  static async finalizeEvaluation(req, res, next) {
    try {
      const finalized = await EmployeeEvaluationsService.finalizeEvaluation(req.params.evalId || req.params.id, req.user, req);
      res.status(200).json({
        success: true,
        message: 'Evaluation finalized successfully',
        data: finalized,
      });
    } catch (err) {
      next(err);
    }
  }

  // === ID CARDS ===
  static async getIdCards(req, res, next) {
    try {
      const query = { ...req.query, employeeId: req.params.id || req.query.employeeId };
      const result = await EmployeeIdCardsService.listCards(query, req);
      res.status(200).json({
        success: true,
        data: result.cards,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getIdCardById(req, res, next) {
    try {
      const card = await EmployeeIdCardsService.getCardById(req.params.cardId || req.params.id, req);
      res.status(200).json({
        success: true,
        data: card,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getActiveIdCard(req, res, next) {
    try {
      let card = await EmployeeIdCardsRepository.findActiveByEmployeeId(req.params.id);
      if (!card) {
        const allCards = await EmployeeIdCardsRepository.findByEmployeeId(req.params.id);
        card = allCards[0] || null;
      }
      if (!card) {
        return res.status(200).json({
          success: true,
          data: {
            current_card: null,
            status: 'NOT_GENERATED',
          },
        });
      }
      res.status(200).json({
        success: true,
        data: {
          ...card,
          current_card: card,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async generateIdCard(req, res, next) {
    try {
      const payload = {
        ...req.body,
        employee_id: req.params.id || req.body.employee_id || req.body.employeeId,
      };
      const card = await EmployeeIdCardsService.generateCard(payload, req.user, req);
      res.status(201).json({
        success: true,
        message: 'Employee ID card generated successfully',
        data: card,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reissueIdCard(req, res, next) {
    try {
      const card = await EmployeeIdCardsService.reissueCard(req.params.cardId || req.params.id, req.body, req.user, req);
      res.status(200).json({
        success: true,
        message: 'Employee ID card reissued successfully',
        data: card,
      });
    } catch (err) {
      next(err);
    }
  }

  static async revokeIdCard(req, res, next) {
    try {
      const card = await EmployeeIdCardsService.revokeCard(req.params.cardId || req.params.id, req.body, req.user, req);
      res.status(200).json({
        success: true,
        message: 'Employee ID card revoked successfully',
        data: card,
      });
    } catch (err) {
      next(err);
    }
  }

  static async downloadIdCardPDF(req, res, next) {
    try {
      const cardIdentifier = req.params.cardId || req.params.id;
      const pdfBuffer = await EmployeeIdCardsService.generateIdCardPDF(cardIdentifier, req);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="bfa-id-card-${cardIdentifier}.pdf"`);
      return res.status(200).send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  }

  // === PUBLIC VERIFICATION (Gate 11.13) ===
  static async verifyIdCardToken(req, res, next) {
    try {
      const result = await EmployeeIdCardsService.verifyCardByToken(req.params.token || req.query.token);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  // === SELF-SERVICE (Gate 11.14) ===
  static async getMyProfile(req, res, next) {
    try {
      const profile = await EmployeesService.getMyProfile(req);
      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateMyProfile(req, res, next) {
    try {
      const updated = await EmployeesService.updateMyProfile(req.body, req);
      res.status(200).json({
        success: true,
        message: 'Your personal profile has been updated.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMyPerformance(req, res, next) {
    try {
      const performance = await EmployeesService.getMyPerformance(req.query, req);
      res.status(200).json({
        success: true,
        data: performance,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMyActivities(req, res, next) {
    try {
      const result = await EmployeesService.getMyActivities(req.query, req);
      res.status(200).json({
        success: true,
        data: result.activities,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMyEvaluations(req, res, next) {
    try {
      const result = await EmployeesService.getMyEvaluations(req.query, req);
      res.status(200).json({
        success: true,
        data: result.evaluations,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMyIdCard(req, res, next) {
    try {
      const card = await EmployeesService.getMyIdCard(req);
      res.status(200).json({
        success: true,
        data: card,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = EmployeesController;
