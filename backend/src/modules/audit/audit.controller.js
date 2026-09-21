const AuditService = require('../../core/audit/audit.service');
const ApiResponse = require('../../utils/apiResponse');

class AuditController {
  static async getLogs(req, res, next) {
    try {
      const { action, actorId, actorRole, entityType, entityId, fromDate, toDate, limit, offset } = req.query;

      const result = await AuditService.queryLogs({
        action,
        actorId,
        actorRole,
        entityType,
        entityId,
        fromDate,
        toDate,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      });

      return ApiResponse.success(res, {
        message: 'Audit logs retrieved successfully',
        data: result.logs,
        meta: {
          total: result.total,
          limit: limit ? parseInt(limit, 10) : 50,
          offset: offset ? parseInt(offset, 10) : 0,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AuditController;
