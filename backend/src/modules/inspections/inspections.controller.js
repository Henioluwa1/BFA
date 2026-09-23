const InspectionsService = require('./inspections.service');

class InspectionsController {
  static async getAll(req, res, next) {
    try {
      const inspections = await InspectionsService.listInspections(req.query, req);
      res.status(200).json({
        success: true,
        data: inspections,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const inspection = await InspectionsService.getInspectionById(req.params.id, req);
      res.status(200).json({
        success: true,
        data: inspection,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const inspection = await InspectionsService.createInspection(req.body, req);
      res.status(201).json({
        success: true,
        data: inspection,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const updated = await InspectionsService.updateInspection(req.params.id, req.body, req);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async complete(req, res, next) {
    try {
      const completed = await InspectionsService.completeInspection(req.params.id, req.body, req);
      res.status(200).json({
        success: true,
        data: completed,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = InspectionsController;
