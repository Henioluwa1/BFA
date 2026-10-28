const pool = require('../../db/pool');
const { ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');
const AccessControlService = require('../../core/access/accessControl.service');
const logger = require('../../utils/logger');

class PaymentsService {
  /**
   * Process a payment transaction for a reservation with concurrency collision retry
   */
  static async processPayment(params) {
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        return await PaymentsService._doProcessPayment(params);
      } catch (err) {
        const isConflict =
          err.code === 'ER_LOCK_DEADLOCK' ||
          err.code === 'ER_DUP_ENTRY' ||
          (err.message && (err.message.includes('Deadlock') || err.message.includes('Duplicate entry')));
        if (isConflict && attempts < 3) {
          logger.warn(
            `[PAYMENTS CONCURRENCY] Collision detected on attempt #${attempts} (${err.code || err.message}). Retrying transaction safely...`
          );
          await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
          continue;
        }
        throw err;
      }
    }
  }

  static async _doProcessPayment({
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

    // 2. Provider idempotency: If external provider reference already processed, return existing canonical record
    if (provider && providerReference) {
      const existingTxRows = await pool.query(
        'SELECT * FROM payment_transactions WHERE provider = ? AND provider_reference = ? LIMIT 1',
        [provider, providerReference]
      );
      if (existingTxRows && existingTxRows.length > 0) {
        const existingTx = existingTxRows[0];
        const paidAmt = parseFloat(reservation.paid_amount || 0);
        const totalAmt = parseFloat(reservation.total_amount || 0);
        return {
          success: true,
          id: existingTx.id,
          reference: existingTx.transaction_reference,
          message: 'Online payment processed and confirmed successfully.',
          transactionReference: existingTx.transaction_reference,
          status: existingTx.status,
          amount: parseFloat(existingTx.amount),
          currency: existingTx.currency,
          paymentMethod: existingTx.payment_method,
          paidAmount: paidAmt,
          outstandingBalance: Math.max(0, totalAmt - paidAmt),
          isDuplicate: true,
        };
      }
    }

    // 3. Prevent duplicate payment if already fully paid
    if (reservation.payment_status === 'PAYMENT_SUCCESS' && parseFloat(reservation.paid_amount) >= parseFloat(reservation.total_amount)) {
      throw new ConflictError(`Reservation #${reservation.reservation_code} has already been fully paid.`);
    }

    const cleanMethod = String(paymentMethod).trim().toUpperCase();

    // 4. If PAY_AT_PROPERTY, verify system capability
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

    // 5. Online Payment Processing (CARD, BANK_TRANSFER, USSD)
    const accessCheck = await AccessControlService.canAccess(user, 'ONLINE_PAYMENT');
    if (!accessCheck.allowed) {
      throw new ValidationError(`Online payment processing is currently disabled (${accessCheck.reason}).`);
    }

    let txRef = `BFA-TXN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const finalProviderRef = providerReference || `REF-${Date.now()}`;

    let insertId = null;
    let newPaidAmount = parseFloat(reservation.paid_amount || 0);

    await pool.withTransaction(async (conn) => {
      // Idempotency: verify if external provider reference was already processed
      if (provider && providerReference) {
        const [dupRows] = await conn.query(
          'SELECT * FROM payment_transactions WHERE provider = ? AND provider_reference = ? AND status = "SUCCESS" LIMIT 1',
          [provider, providerReference]
        );
        if (dupRows && dupRows.length > 0) {
          insertId = dupRows[0].id;
          txRef = dupRows[0].transaction_reference;
          return;
        }
      }

      // Transactional recording with unique provider reference race-safety
      try {
        const [insertRes] = await conn.query(
          `INSERT INTO payment_transactions 
           (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, metadata, paid_at)
           VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?, CURRENT_TIMESTAMP)`,
          [reservation.id, txRef, cleanMethod, numAmount, currency, provider, finalProviderRef, JSON.stringify(metadata)]
        );
        insertId = insertRes.insertId;
      } catch (insertErr) {
        if (insertErr.code === 'ER_DUP_ENTRY' && provider && finalProviderRef) {
          const [dupRows] = await conn.query(
            'SELECT * FROM payment_transactions WHERE provider = ? AND provider_reference = ? LIMIT 1',
            [provider, finalProviderRef]
          );
          if (dupRows && dupRows.length > 0) {
            insertId = dupRows[0].id;
            txRef = dupRows[0].transaction_reference;
            return;
          }
        }
        throw insertErr;
      }

      newPaidAmount = Math.min(parseFloat(reservation.total_amount), parseFloat(reservation.paid_amount || 0) + numAmount);

      await conn.query(
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
        conn,
      });

      // Automated Subledger-to-General-Ledger Posting Bridge (coupled to same transaction)
      const PostingBridgeService = require('../accounting/postingBridge.service');
      await PostingBridgeService.postPayment(insertId, { conn, user, req });
    });

    return {
      success: true,
      id: insertId,
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

    if (transaction.status === 'REFUNDED') {
      throw new ConflictError(`Payment transaction #${transaction.transaction_reference} has already been fully refunded.`);
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

    // Atomic transaction with row locking to prevent concurrent double-refund race conditions
    let finalAvailableRefund = 0;
    let finalRefundAmount = refundAmount;
    let childRefundId = null;

    await pool.withTransaction(async (conn) => {
      // Lock the payment transaction row for update
      const [lockedTxRows] = await conn.query(
        'SELECT * FROM payment_transactions WHERE id = ? FOR UPDATE',
        [transaction.id]
      );
      if (!lockedTxRows || lockedTxRows.length === 0) {
        throw new NotFoundError(`Payment transaction #${transaction.id} not found.`);
      }
      const lockedTx = lockedTxRows[0];

      if (lockedTx.status === 'REFUNDED') {
        throw new ConflictError(`Payment transaction #${lockedTx.transaction_reference} has already been fully refunded.`);
      }

      if (lockedTx.status !== 'SUCCESS' && lockedTx.status !== 'PARTIALLY_REFUNDED') {
        throw new ValidationError(`Cannot refund transaction with status '${lockedTx.status}'. Only SUCCESSful payments can be refunded.`);
      }

      const lockedTotalRefunded = parseFloat(lockedTx.refund_amount || 0);
      const lockedAvailable = parseFloat(lockedTx.amount) - lockedTotalRefunded;
      if (lockedAvailable <= 0) {
        throw new ConflictError(`Payment transaction #${lockedTx.transaction_reference} has already been fully refunded.`);
      }

      if (finalRefundAmount > lockedAvailable) {
        throw new ValidationError(
          `Refund amount (₦${finalRefundAmount.toLocaleString()}) exceeds remaining refundable amount (₦${lockedAvailable.toLocaleString()}).`
        );
      }

      // Lock reservation row for update
      const [lockedResRows] = await conn.query(
        'SELECT id, total_amount, paid_amount FROM reservations WHERE id = ? FOR UPDATE',
        [lockedTx.reservation_id]
      );

      // 1. Insert reversal / refund transaction record (preserves full history)
      const [childRefundRes] = await conn.query(
        `INSERT INTO payment_transactions
         (reservation_id, transaction_reference, payment_method, amount, currency, status, provider, provider_reference, metadata, paid_at, parent_transaction_id, refund_reason)
         VALUES (?, ?, ?, ?, ?, 'REFUNDED', 'SYSTEM_REFUND', ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
        [
          lockedTx.reservation_id,
          refundRef,
          lockedTx.payment_method,
          -finalRefundAmount,
          lockedTx.currency,
          refundRef,
          JSON.stringify({ originalTransactionId: lockedTx.id, reason }),
          lockedTx.id,
          reason,
        ]
      );
      childRefundId = childRefundRes.insertId;

      // 2. Update original transaction with cumulative refund amount
      const newTotalRefunded = lockedTotalRefunded + finalRefundAmount;
      const isFullRefund = newTotalRefunded >= parseFloat(lockedTx.amount);
      const newStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

      await conn.query(
        `UPDATE payment_transactions
         SET refund_amount = ?,
             refund_reason = ?,
             refunded_at = ?,
             refunded_by_id = ?,
             status = ?
         WHERE id = ?`,
        [newTotalRefunded, reason, nowStr, user?.id || null, newStatus, lockedTx.id]
      );

      // 3. Atomically update reservation financial state
      const currentPaid = lockedResRows.length > 0 ? parseFloat(lockedResRows[0].paid_amount || 0) : parseFloat(transaction.paid_amount || 0);
      const newPaidAmount = Math.max(0, currentPaid - finalRefundAmount);
      const totalAmount = lockedResRows.length > 0 ? parseFloat(lockedResRows[0].total_amount || 0) : 0;
      let newPaymentStatus = 'PARTIAL';
      if (newPaidAmount <= 0) {
        newPaymentStatus = 'PAYMENT_PENDING';
      } else if (newPaidAmount >= totalAmount && totalAmount > 0) {
        newPaymentStatus = 'PAID';
      }

      await conn.query(
        `UPDATE reservations
         SET paid_amount = ?,
             payment_status = ?
         WHERE id = ?`,
        [newPaidAmount, newPaymentStatus, lockedTx.reservation_id]
      );

      // If reservation is now fully refunded, reconcile associated commission
      if (newPaidAmount <= 0) {
        try {
          const CommissionsService = require('../commissions/commissions.service');
          await CommissionsService.reconcileCancellationOrRefund(lockedTx.reservation_id, conn);
        } catch (comErr) {
          logger.warn('Failed to reconcile commission on full refund:', { error: comErr.message });
        }
      }

      finalAvailableRefund = Math.max(0, lockedAvailable - finalRefundAmount);

      // Audit log (inside transaction)
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
        conn,
      });

      // Automated Subledger-to-General-Ledger Posting Bridge (coupled to same transaction)
      const PostingBridgeService = require('../accounting/postingBridge.service');
      await PostingBridgeService.postRefund(childRefundId, { conn, user, req });
    });

    const origRows = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [transaction.id]);
    const refundRows = await pool.query('SELECT * FROM payment_transactions WHERE id = ?', [childRefundId]);

    return {
      success: true,
      message: `Refund of ₦${refundAmount.toLocaleString()} processed successfully.`,
      refundReference: refundRef,
      originalTransactionId: transaction.id,
      refundAmount,
      remainingRefundable: finalAvailableRefund,
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
