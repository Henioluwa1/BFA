const AuditService = require('../../core/audit/audit.service');
const ApiResponse = require('../../utils/apiResponse');

class AuditController {
  static async getLogs(req, res, next) {
    try {
      const {
        action,
        actorId,
        actorRole,
        entityType,
        entityId,
        fromDate,
        toDate,
        fromTime,
        toTime,
        from,
        to,
        page,
        pageSize,
        limit,
        offset,
      } = req.query;

      const result = await AuditService.queryLogs({
        action,
        actorId,
        actorRole,
        entityType,
        entityId,
        fromDate,
        toDate,
        fromTime,
        toTime,
        from,
        to,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : (limit ? parseInt(limit, 10) : 50),
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset != null ? parseInt(offset, 10) : undefined,
      });

      // Provide both meta.pagination, top-level pagination, and meta.total for complete compatibility
      const paginationData = {
        page: result.page,
        pageSize: result.pageSize,
        limit: result.limit,
        offset: result.offset,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1,
      };

      return res.status(200).json({
        success: true,
        message: 'Audit logs retrieved successfully',
        data: result.logs,
        pagination: paginationData,
        meta: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          pagination: paginationData,
          timestamp: new Date().toISOString(),
          ...(req.id ? { requestId: req.id } : {}),
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AuditController;
