const AnalyticsService = require('./analytics.service');

class AnalyticsController {
  static async getOverview(req, res, next) {
    try {
      const data = await AnalyticsService.getOverview(req.query, req);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getReservations(req, res, next) {
    try {
      const data = await AnalyticsService.getReservations(req.query, req);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getApartments(req, res, next) {
    try {
      const data = await AnalyticsService.getApartments(req.query, req);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAgents(req, res, next) {
    try {
      const data = await AnalyticsService.getAgents(req.query, req);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getOperations(req, res, next) {
    try {
      const data = await AnalyticsService.getOperations(req.query, req);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AnalyticsController;
