const ExpensesService = require('./expenses.service');
const ApiResponse = require('../../utils/apiResponse');

class ExpensesController {
  static async getAll(req, res, next) {
    try {
      const records = await ExpensesService.listExpenses(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Expenses retrieved successfully',
        data: records,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getStats(req, res, next) {
    try {
      const stats = await ExpensesService.getStats(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Expense metrics retrieved successfully',
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const record = await ExpensesService.getExpenseById(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Expense details retrieved successfully',
        data: record,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const created = await ExpensesService.createExpense(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Expense recorded successfully',
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const updated = await ExpensesService.updateExpense(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Expense updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async approve(req, res, next) {
    try {
      const approved = await ExpensesService.approveExpense(req.params.id, req.user, req);
      return ApiResponse.success(res, {
        message: 'Expense approved successfully',
        data: approved,
      });
    } catch (err) {
      next(err);
    }
  }

  static async void(req, res, next) {
    try {
      const voided = await ExpensesService.voidExpense(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Expense voided successfully',
        data: voided,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ExpensesController;
