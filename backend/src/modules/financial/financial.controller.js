const FinancialService = require('./financial.service');
const ApiResponse = require('../../utils/apiResponse');

class FinancialController {
  static async getOverview(req, res, next) {
    try {
      const overview = await FinancialService.getOverview({
        propertyId: req.query.propertyId,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        user: req.user,
      });

      return ApiResponse.success(res, {
        message: 'Financial metrics and overview retrieved successfully',
        data: overview,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getLedger(req, res, next) {
    try {
      const ledger = await FinancialService.getLedger({
        propertyId: req.query.propertyId,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        type: req.query.type,
        status: req.query.status,
        page: req.query.page,
        pageSize: req.query.pageSize,
        user: req.user,
      });

      return ApiResponse.success(res, {
        message: 'Financial ledger entries retrieved successfully',
        data: ledger,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = FinancialController;
