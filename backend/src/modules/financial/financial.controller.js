const FinancialService = require('./financial.service');
const AccountingService = require('../accounting/accounting.service');
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

  static async getIncomeStatement(req, res, next) {
    try {
      const statement = await AccountingService.getIncomeStatement(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Income statement retrieved successfully',
        data: statement,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getBalanceSheet(req, res, next) {
    try {
      const statement = await AccountingService.getBalanceSheet(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Balance sheet retrieved successfully',
        data: statement,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getCashFlowStatement(req, res, next) {
    try {
      const statement = await AccountingService.getCashFlowStatement(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Cash flow statement retrieved successfully',
        data: statement,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getReceivables(req, res, next) {
    try {
      const report = await AccountingService.getReceivablesReport(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Receivables and outstanding balances retrieved successfully',
        data: report,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getRefundsReconciliation(req, res, next) {
    try {
      const report = await AccountingService.getRefundsReconciliationReport(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Refunds reconciliation report retrieved successfully',
        data: report,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = FinancialController;
