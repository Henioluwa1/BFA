const pool = require('../../db/pool');
const { ValidationError, NotFoundError, ConflictError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');
const AccessControlService = require('../../core/access/accessControl.service');

class PaymentsService {
  /**
   * Process a payment transaction for a reservation
   */
  static async processPayment({
    reservationId,
    paymentMethod = 'CARD',
    amount,
    currency = 'NGN',
    provider = 'MOCK_GATEWAY',
    providerReference = null,
    metadata = {},
    user = null,
    req = null,
  }) {
    // 1. Fetch reservation
    const resRows = await pool.query('SELECT * FROM reservations WHERE id = ?', [reservationId]);
    if (resRows.length === 0) throw new NotFoundError(`Reservation #${reservationId} not found.`);
    const reservation = resRows[0];

    const numAmount = parseFloat(amount || reservation.total_amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new ValidationError('A positive monetary amount is required.');
    }

    // 2. Prevent duplicate payment if already fully paid
    if (reservation.payment_status === 'PAYMENT_SUCCESS' && parseFloat(reservation.paid_amount) >= parseFloat(reservation.total_amount)) {
      throw new ConflictError(`Reservation #${reservation.reservation_code} has already been fully paid.`);
    }

    const cleanMethod = String(paymentMethod).trim().toUpperCase();

    // 3. If PAY_AT_PROPERTY, verify system capability
    if (cleanMethod === 'PAY_AT_PROPERTY') {
      const accessCheck = await AccessControlService.canAccess(user, 'PAY_AT_PROPERTY');
      if (!accessCheck.allowed) {
        throw new ValidationError(`Pay at Property is currently disabled by management (${accessCheck.reason}).`);
      }

      const txRef = `BFA-PAP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

      await pool.query(
        `INSERT INTO payment_transactions 
         (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, metadata)
         VALUES (?, ?, 'PAY_AT_PROPERTY', ?, ?, 'PENDING', 'OFFLINE_COUNTER', ?, ?)`,
        [reservation.id, txRef, numAmount, currency, txRef, JSON.stringify({ note: 'Pay at property chosen', ...metadata })]
      );

      await pool.query(
        `UPDATE reservations 
         SET payment_status = 'PAYMENT_PENDING', payment_method = 'PAY_AT_PROPERTY' 
         WHERE id = ?`,
        [reservation.id]
      );

      await auditService.record({
        req,
        actorId: user?.id || null,
        actorEmail: user?.email || reservation.tenant_email,
        actorRole: user?.role || 'GUEST',
        action: 'PAYMENT_PAY_AT_PROPERTY_RECORDED',
        entityType: 'payment',
        entityId: txRef,
        newValues: { reservationId: reservation.id, amount: numAmount, status: 'PENDING' },
      });

      return {
        success: true,
        message: 'Pay-at-property option recorded. Payment is pending upon arrival.',
        transactionReference: txRef,
        status: 'PENDING',
        amount: numAmount,
        currency,
        paymentMethod: 'PAY_AT_PROPERTY',
        paidAmount: parseFloat(reservation.paid_amount || 0),
        outstandingBalance: numAmount,
      };
    }

    // 4. Online Payment Processing (CARD, BANK_TRANSFER, USSD)
    const accessCheck = await AccessControlService.canAccess(user, 'ONLINE_PAYMENT');
    if (!accessCheck.allowed) {
      throw new ValidationError(`Online payment processing is currently disabled (${accessCheck.reason}).`);
    }

    const txRef = `BFA-TXN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const finalProviderRef = providerReference || `REF-${Date.now()}`;

    // Transactional recording
    await pool.query(
      `INSERT INTO payment_transactions 
       (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, metadata, paid_at)
       VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?, CURRENT_TIMESTAMP)`,
      [reservation.id, txRef, cleanMethod, numAmount, currency, provider, finalProviderRef, JSON.stringify(metadata)]
    );

    const newPaidAmount = Math.min(parseFloat(reservation.total_amount), parseFloat(reservation.paid_amount || 0) + numAmount);

    await pool.query(
      `UPDATE reservations 
       SET payment_status = 'PAYMENT_SUCCESS', 
           payment_method = ?, 
           paid_amount = ? 
       WHERE id = ?`,
      [cleanMethod, newPaidAmount, reservation.id]
    );

    await auditService.record({
      req,
      actorId: user?.id || null,
      actorEmail: user?.email || reservation.tenant_email,
      actorRole: user?.role || 'GUEST',
      action: 'PAYMENT_SUCCESS',
      entityType: 'payment',
      entityId: txRef,
      newValues: {
        reservationId: reservation.id,
        amount: numAmount,
        currency,
        paymentMethod: cleanMethod,
        transactionReference: txRef,
      },
    });

    return {
      success: true,
      message: 'Online payment processed and confirmed successfully.',
      transactionReference: txRef,
      status: 'PAYMENT_SUCCESS',
      amount: numAmount,
      currency,
      paymentMethod: cleanMethod,
      paidAmount: newPaidAmount,
      outstandingBalance: Math.max(0, parseFloat(reservation.total_amount) - newPaidAmount),
    };
  }

  /**
   * Get payments history for a reservation or overall system
   */
  static async getPayments({ reservationId, propertyId, status, page = 1, pageSize = 50 } = {}) {
    let sql = `
      SELECT pt.*, r.reservation_code, r.tenant_name, r.tenant_email, r.property_id, p.name as property_name
      FROM payment_transactions pt
      JOIN reservations r ON pt.reservation_id = r.id
      JOIN properties p ON r.property_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (reservationId) {
      sql += ' AND pt.reservation_id = ?';
      params.push(reservationId);
    }
    if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }
    if (status) {
      sql += ' AND pt.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY pt.created_at DESC, pt.id DESC LIMIT ? OFFSET ?';
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
    params.push(limit, offset);

    return pool.query(sql, params);
  }
}

module.exports = PaymentsService;
