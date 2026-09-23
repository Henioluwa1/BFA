const MaintenanceService = require('./maintenance.service');
const ApiResponse = require('../../utils/apiResponse');

class MaintenanceController {
  static async getAll(req, res, next) {
    try {
      const records = await MaintenanceService.listMaintenance(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Maintenance requests retrieved successfully',
        data: records,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const record = await MaintenanceService.getMaintenanceById(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Maintenance request details retrieved successfully',
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const created = await MaintenanceService.createMaintenance(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Maintenance request created successfully',
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  static async assign(req, res, next) {
    try {
      const updated = await MaintenanceService.assignStaff(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Staff member assigned successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async start(req, res, next) {
    try {
      const updated = await MaintenanceService.startWork(req.params.id, req.user, req);
      return ApiResponse.success(res, {
        message: 'Maintenance work marked as in-progress',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async resolve(req, res, next) {
    try {
      const updated = await MaintenanceService.resolveIssue(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Maintenance request resolved successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancel(req, res, next) {
    try {
      const updated = await MaintenanceService.cancelIssue(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Maintenance request cancelled',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getStats(req, res, next) {
    try {
      const stats = await MaintenanceService.getStats(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Maintenance statistics retrieved successfully',
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = MaintenanceController;
