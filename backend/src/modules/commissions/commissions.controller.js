const CommissionsService = require('./commissions.service');

class CommissionsController {
  static async getAll(req, res, next) {
    try {
      const result = await CommissionsService.listCommissions(req.query, req);
      res.status(200).json({
        success: true,
        data: result.commissions,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getSummary(req, res, next) {
    try {
      const summary = await CommissionsService.getSummary(req.query, req);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const commission = await CommissionsService.getCommissionById(req.params.id, req);
      res.status(200).json({
        success: true,
        data: commission,
      });
    } catch (err) {
      next(err);
    }
  }

  static async calculate(req, res, next) {
    try {
      const { reservationId, agentId, notes } = req.body;
      const commission = await CommissionsService.calculateCommissionForReservation(
        reservationId,
        { agentId, notes },
        req
      );
      res.status(201).json({
        success: true,
        message: 'Commission calculated successfully',
        data: commission,
      });
    } catch (err) {
      next(err);
    }
  }

  static async approve(req, res, next) {
    try {
      const approved = await CommissionsService.approveCommission(req.params.id, req);
      res.status(200).json({
        success: true,
        message: 'Commission approved successfully',
        data: approved,
      });
    } catch (err) {
      next(err);
    }
  }

  static async payout(req, res, next) {
    try {
      const paid = await CommissionsService.recordPayout(req.params.id, req.body, req);
      res.status(200).json({
        success: true,
        message: 'Commission payout recorded successfully',
        data: paid,
      });
    } catch (err) {
      next(err);
    }
  }

  static async voidCommission(req, res, next) {
    try {
      const voided = await CommissionsService.voidCommission(req.params.id, req.body, req);
      res.status(200).json({
        success: true,
        message: 'Commission voided successfully',
        data: voided,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CommissionsController;
