const PaymentsService = require('./payments.service');
const ApiResponse = require('../../utils/apiResponse');
const pool = require('../../db/pool');
const { NotFoundError } = require('../../core/errors/apiError');

class PaymentsController {
  static async processPayment(req, res, next) {
    try {
      const { reservationId, paymentMethod, amount, currency, provider, providerReference, metadata } = req.body;
      const result = await PaymentsService.processPayment({
        reservationId: parseInt(reservationId, 10),
        paymentMethod,
        amount,
        currency,
        provider,
        providerReference,
        metadata,
        user: req.user,
        req,
      });
      return ApiResponse.success(res, {
        message: result.message || 'Payment processed successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getGateways(req, res, next) {
    try {
      const gateways = [
        { method: 'CARD', name: 'Credit / Debit Card (Mastercard, Visa, Verve)', isOnline: true },
        { method: 'BANK_TRANSFER', name: 'Direct Bank Transfer / NIP', isOnline: true },
        { method: 'USSD', name: 'USSD Quick Banking', isOnline: true },
        { method: 'PAY_AT_PROPERTY', name: 'Pay at Property (Front Desk Counter)', isOnline: false },
      ];
      return ApiResponse.success(res, {
        message: 'Payment gateways retrieved successfully.',
        data: gateways,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const rows = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [id]);
      if (rows.length === 0) throw new NotFoundError(`Payment #${id} not found.`);
      return ApiResponse.success(res, {
        message: 'Payment transaction details retrieved.',
        data: rows[0],
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPayments(req, res, next) {
    try {
      const { reservationId, propertyId, status, page, pageSize } = req.query;
      const data = await PaymentsService.getPayments({
        reservationId: reservationId ? parseInt(reservationId, 10) : undefined,
        propertyId,
        status,
        page,
        pageSize,
      });
      return ApiResponse.success(res, {
        message: 'Payments list retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = PaymentsController;
