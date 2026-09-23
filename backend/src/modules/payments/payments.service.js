const pool = require('../../db/pool');
const { ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../core/errors/apiError');
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
    const insertRes = await pool.query(
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
      id: insertRes.insertId,
      reference: txRef,
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
   * Validate user's property scope
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return true;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return true;
    }
    if (['MANAGER', 'STAFF'].includes(role) && user.propertyId) {
      if (parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization for this property.');
      }
    }
    return true;
  }

  /**
   * Get single payment transaction by ID
   */
  static async getPaymentById(id, user = null) {
    const sql = `
      SELECT pt.*, r.reservation_code, r.tenant_name, r.tenant_email, r.property_id, r.paid_amount, r.total_amount, p.name as property_name
      FROM payment_transactions pt
      JOIN reservations r ON pt.reservation_id = r.id
      JOIN properties p ON r.property_id = p.id
      WHERE pt.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    if (rows.length === 0) throw new NotFoundError(`Payment transaction #${id} not found.`);

    if (user) {
      this.validatePropertyScope(user, rows[0].property_id);
    }

    return rows[0];
  }

  /**
   * Safe financial reversal / refund for a completed payment
   */
  static async refundPayment(id, data = {}, user, req = null) {
    const transaction = await this.getPaymentById(id, user);

    // Capability check: REFUNDS
    const capCheck = await AccessControlService.canAccess(user, 'REFUNDS');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Refund processing is currently disabled by system policy (${capCheck.reason}).`);
    }

    if (transaction.status !== 'SUCCESS' && transaction.status !== 'PARTIALLY_REFUNDED') {
      throw new ValidationError(`Cannot refund transaction with status '${transaction.status}'. Only SUCCESSful payments can be refunded.`);
    }

    const availableRefund = parseFloat(transaction.amount) - parseFloat(transaction.refund_amount || 0);
    if (availableRefund <= 0) {
      throw new ConflictError(`Payment transaction #${transaction.transaction_reference} has already been fully refunded.`);
    }

    const reqAmount = data.amount !== undefined ? data.amount : data.refund_amount;
    const refundAmount = reqAmount !== undefined ? parseFloat(reqAmount) : availableRefund;
    if (isNaN(refundAmount) || refundAmount <= 0) {
      throw new ValidationError('A positive refund amount is required.');
    }

    if (refundAmount > availableRefund) {
      throw new ValidationError(
        `Refund amount (₦${refundAmount.toLocaleString()}) exceeds remaining refundable amount (₦${availableRefund.toLocaleString()}).`
      );
    }

    const reason = data.reason || 'Refund requested by guest / management';
    const refundRef = `BFA-REF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Atomic transaction
    await pool.withTransaction(async (conn) => {
      // 1. Insert reversal / refund transaction record (preserves full history)
      await conn.query(
        `INSERT INTO payment_transactions
         (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, metadata, paid_at, parent_transaction_id, refund_reason)
         VALUES (?, ?, ?, ?, ?, 'REFUNDED', 'SYSTEM_REFUND', ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
        [
          transaction.reservation_id,
          refundRef,
          transaction.payment_method,
          -refundAmount,
          transaction.currency,
          refundRef,
          JSON.stringify({ originalTransactionId: transaction.id, reason }),
          transaction.id,
          reason,
        ]
      );

      // 2. Update original transaction with cumulative refund amount
      const newTotalRefunded = parseFloat(transaction.refund_amount || 0) + refundAmount;
      const isFullRefund = newTotalRefunded >= parseFloat(transaction.amount);
      const newStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

      await conn.query(
        `UPDATE payment_transactions
         SET refund_amount = ?,
             refund_reason = ?,
             refunded_at = ?,
             refunded_by_id = ?,
             status = ?
         WHERE id = ?`,
        [newTotalRefunded, reason, nowStr, user?.id || null, newStatus, transaction.id]
      );

      // 3. Atomically update reservation financial state
      const currentPaid = parseFloat(transaction.paid_amount || 0);
      const newPaidAmount = Math.max(0, currentPaid - refundAmount);
      const newPaymentStatus = newPaidAmount <= 0 ? 'PAYMENT_PENDING' : 'PARTIAL';

      await conn.query(
        `UPDATE reservations
         SET paid_amount = ?,
             payment_status = ?
         WHERE id = ?`,
        [newPaidAmount, newPaymentStatus, transaction.reservation_id]
      );
    });

    // Audit log
    await auditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'PAYMENT_REFUNDED',
      entityType: 'payment',
      entityId: String(id),
      oldValues: {
        paidAmount: transaction.paid_amount,
        refundAmount: transaction.refund_amount,
      },
      newValues: {
        refundReference: refundRef,
        refundAmount,
        reason,
        newPaidAmount: Math.max(0, parseFloat(transaction.paid_amount || 0) - refundAmount),
      },
    });

    const origRows = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [transaction.id]);
    const refundRows = await pool.query('SELECT * FROM payment_transactions WHERE transaction_reference = ?', [refundRef]);

    return {
      success: true,
      message: `Refund of ₦${refundAmount.toLocaleString()} processed successfully.`,
      refundReference: refundRef,
      originalTransactionId: transaction.id,
      refundAmount,
      remainingRefundable: Math.max(0, availableRefund - refundAmount),
      originalTransaction: origRows[0],
      refundTransaction: refundRows[0],
    };
  }

  /**
   * Get payments history for a reservation or overall system
   */
  static async getPayments({ reservationId, propertyId, status, search, page = 1, pageSize = 50, user } = {}) {
    let sql = `
      SELECT pt.*, r.reservation_code, r.tenant_name, r.tenant_email, r.property_id, p.name as property_name,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM payment_transactions pt
      JOIN reservations r ON pt.reservation_id = r.id
      JOIN properties p ON r.property_id = p.id
      WHERE 1=1
    `;
    const params = [];

    // Property scope check for manager/staff
    if (user?.role === 'MANAGER' && user.propertyId) {
      sql += ' AND r.property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }

    if (reservationId) {
      sql += ' AND pt.reservation_id = ?';
      params.push(reservationId);
    }

    if (status && status !== 'ALL') {
      sql += ' AND pt.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      sql += ` AND (
        pt.transaction_reference LIKE ? OR
        r.reservation_code LIKE ? OR
        r.tenant_name LIKE ? OR
        r.tenant_email LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY pt.created_at DESC, pt.id DESC LIMIT ? OFFSET ?';
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
    params.push(limit, offset);

    return pool.query(sql, params);
  }
}

module.exports = PaymentsService;
