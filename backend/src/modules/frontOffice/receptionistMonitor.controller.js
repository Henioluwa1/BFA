const ReceptionistMonitorService = require('./receptionistMonitor.service');
const ApiResponse = require('../../utils/apiResponse');

class ReceptionistMonitorController {
  static async getLiveDashboard(req, res, next) {
    try {
      const data = await ReceptionistMonitorService.getMonitorDashboard({
        targetDate: req.query.date || null,
        propertyId: req.query.propertyId || null,
        user: req.user,
      });
      return ApiResponse.success(res, {
        message: 'Live receptionist monitoring dashboard retrieved',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getHistoricalDashboard(req, res, next) {
    try {
      const date = req.query.date || req.params.date;
      const data = await ReceptionistMonitorService.getMonitorDashboard({
        targetDate: date,
        propertyId: req.query.propertyId || null,
        user: req.user,
      });
      return ApiResponse.success(res, {
        message: `Historical receptionist performance for ${data.workDate} retrieved`,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getReceptionistLogs(req, res, next) {
    try {
      const receptionistId = parseInt(req.params.id, 10);
      const data = await ReceptionistMonitorService.getReceptionistLogs(
        receptionistId,
        req.query.date || null,
        req.user
      );
      return ApiResponse.success(res, {
        message: 'Receptionist activity logs retrieved',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async clockIn(req, res, next) {
    try {
      const propertyId = req.body.propertyId ? parseInt(req.body.propertyId, 10) : null;
      const metric = await ReceptionistMonitorService.clockIn(req.user, propertyId, req);
      return ApiResponse.success(res, {
        message: 'Clocked in successfully for front desk shift',
        data: metric,
      });
    } catch (err) {
      next(err);
    }
  }

  static async clockOut(req, res, next) {
    try {
      const propertyId = req.body.propertyId ? parseInt(req.body.propertyId, 10) : null;
      const metric = await ReceptionistMonitorService.clockOut(req.user, propertyId, req);
      return ApiResponse.success(res, {
        message: 'Clocked out successfully from front desk shift',
        data: metric,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateAvailability(req, res, next) {
    try {
      const propertyId = req.body.propertyId ? parseInt(req.body.propertyId, 10) : null;
      const metric = await ReceptionistMonitorService.updateAvailability(
        req.user,
        {
          availabilityStatus: req.body.availabilityStatus || req.body.status,
          currentActivity: req.body.currentActivity,
        },
        propertyId
      );
      return ApiResponse.success(res, {
        message: 'Availability status updated successfully',
        data: metric,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ReceptionistMonitorController;
