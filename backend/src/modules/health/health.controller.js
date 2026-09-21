const HealthService = require('./health.service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Health Controller
 */
class HealthController {
  static async check(req, res, next) {
    try {
      const health = await HealthService.getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      return ApiResponse.success(res, {
        statusCode,
        message: health.status === 'healthy' ? 'System is operational and database connected' : 'System operational with degraded components',
        data: health,
      });
    } catch (error) {
      next(error);
    }
  }

  static ping(req, res) {
    return ApiResponse.success(res, {
      message: 'pong',
      data: {
        alive: true,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

module.exports = HealthController;
