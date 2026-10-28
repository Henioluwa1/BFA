const pool = require('../../db/pool');
const PostingBridgeRepository = require('./postingBridge.repository');
const AccountingRepository = require('./accounting.repository');
const AccountingService = require('./accounting.service');
const AuditService = require('../../core/audit/audit.service');
const { toMinorUnits, fromMinorUnits, toDecimalNumber } = require('./accounting.math');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = require('../../core/errors/apiError');
const logger = require('../../utils/logger');

async function executeQuery(executor, sql, params = []) {
  if (executor === pool) {
    return pool.query(sql, params);
  }
  const [rows] = await executor.query(sql, params);
  return rows;
}

class PostingBridgeService {
  /* =========================================================================
   * 1. ACCOUNT MAPPING RESOLUTION
   * ========================================================================= */

  static async resolveAccountMapping(key, conn = pool) {
    const mapping = await PostingBridgeRepository.findMapping(key, conn);
    if (!mapping) {
      throw new ValidationError(`Indispensable accounting account mapping '${key}' is missing or not configured.`);
    }
    if (!mapping.is_active) {
      throw new ValidationError(`Account mapping '${key}' is disabled.`);
    }
    if (!mapping.account_is_active) {
      throw new ValidationError(`Target account '${mapping.account_code}' for mapping '${key}' is inactive in the Chart of Accounts.`);
    }
    if (!mapping.is_posting_allowed) {
      throw new ValidationError(
        `Target account '${mapping.account_code}' for mapping '${key}' is a summary account; direct posting is not allowed.`
      );
    }
    return mapping;
  }

  /* =========================================================================
   * 2. PAYMENT SUBLEDGER POSTING (CARD, BANK_TRANSFER, CASH)
   * ========================================================================= */

  /**
   * Posts an approved/successful payment transaction to the General Ledger.
   * Accrual accounting rule: Advance accommodation receipts are liabilities (2020 Deferred Revenue),
   * NOT immediate accommodation revenue.
   */
  static async postPayment(paymentId, { conn: externalConn = null, user = null, req = null } = {}) {
    const executor = externalConn || pool;

    const postAction = async (conn) => {
      // Fetch authoritative payment transaction with row lock
      const payRows = await executeQuery(
        conn,
        `SELECT pt.*, r.reservation_code, r.property_id, r.status AS reservation_status, r.check_in_date, r.check_out_date
         FROM payment_transactions pt
         JOIN reservations r ON pt.reservation_id = r.id
         WHERE pt.id = ? FOR UPDATE`,
        [paymentId]
      );

      const payment = payRows[0];
      if (!payment) {
        throw new NotFoundError(`Payment transaction #${paymentId} not found.`);
      }

      // Guard: Distinguish initiated / pending from success
      if (payment.status !== 'SUCCESS') {
        logger.info(`[POSTING BRIDGE] Skipping non-success payment #${paymentId} (status: ${payment.status}).`);
        return null;
      }

      const idempotencyKey = `SUBLEDGER:PAYMENT:${payment.id}`;

      // Check duplicate posting at database level
      const existingRecord = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(idempotencyKey, conn);
      if (existingRecord && existingRecord.status === 'POSTED') {
        return existingRecord;
      }

      const paymentDateStr = (payment.paid_at ? new Date(payment.paid_at) : new Date(payment.created_at))
        .toISOString()
        .slice(0, 10);

      // 1. Resolve active open accounting period
      let period = await AccountingRepository.findActivePeriodForDate(paymentDateStr, conn);
      if (!period || period.status !== 'OPEN') {
        const errorMsg = `No OPEN accounting period found for payment date ${paymentDateStr}.`;
        const rec = await PostingBridgeRepository.createPostingRecord(
          {
            source_module: 'PAYMENTS',
            source_entity_type: 'PAYMENT_TRANSACTION',
            source_entity_id: payment.id,
            source_event_type: 'PAYMENT_COLLECTED',
            posting_purpose: 'PRIMARY',
            idempotency_key: idempotencyKey,
            accounting_period_id: period?.id || null,
            property_id: payment.property_id,
            status: 'FAILED',
            amount: payment.amount,
            last_error: errorMsg,
            error_type: 'PERMANENT',
          },
          conn
        );

        await PostingBridgeRepository.createException(
          {
            posting_record_id: rec.id,
            property_id: payment.property_id,
            source_module: 'PAYMENTS',
            source_entity_id: payment.id,
            exception_code: 'CLOSED_OR_MISSING_PERIOD',
            exception_message: errorMsg,
          },
          conn
        );
        return rec;
      }

      try {
        // 2. Resolve Debit asset account mapping based on payment channel
      let debitMappingKey = 'PAYMENT_DEFAULT_ASSET';
      const cleanMethod = (payment.payment_method || '').toUpperCase();
      if (cleanMethod === 'CARD') {
        debitMappingKey = 'PAYMENT_CARD_CLEARING';
      } else if (cleanMethod === 'BANK_TRANSFER') {
        debitMappingKey = 'PAYMENT_BANK_TRANSFER';
      } else if (['CASH', 'COUNTER'].includes(cleanMethod)) {
        debitMappingKey = 'PAYMENT_CASH_VAULT';
      }

      const debitMapping = await this.resolveAccountMapping(debitMappingKey, conn);

      // 3. Resolve Credit liability / receivable account mappings
      let metaObj = {};
      try {
        metaObj = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata || {};
      } catch {
        metaObj = {};
      }

      const isDeposit = metaObj.isSecurityDeposit === true;
      const creditMappingKey = isDeposit ? 'REFUNDABLE_SECURITY_DEPOSIT' : 'GUEST_DEFERRED_REVENUE';
      const creditMapping = await this.resolveAccountMapping(creditMappingKey, conn);
      const arMapping = await this.resolveAccountMapping('ACCOUNTS_RECEIVABLE_GUEST', conn);

      const totalPaymentCents = toMinorUnits(payment.amount, 'Payment Amount');
      const journalLines = [];

      // Primary Debit Line: Liquid asset / clearing account
      journalLines.push({
        account_id: debitMapping.account_id,
        property_id: payment.property_id,
        debit: toDecimalNumber(totalPaymentCents),
        credit: 0.0,
        description: `Payment collected via ${cleanMethod} for Res #${payment.reservation_code}`,
      });

      if (isDeposit) {
        // Refundable Security Deposit
        journalLines.push({
          account_id: creditMapping.account_id,
          property_id: payment.property_id,
          debit: 0.0,
          credit: toDecimalNumber(totalPaymentCents),
          description: `Security deposit held for Res #${payment.reservation_code} (${creditMapping.account_name})`,
        });
      } else {
        // Traceable payment allocation: check if reservation has accrued outstanding Accounts Receivable
        const arDebitsRows = await executeQuery(
          conn,
          `SELECT COALESCE(SUM(jl.debit), 0) AS total_ar_debited
           FROM journal_lines jl
           JOIN journal_entries je ON jl.journal_entry_id = je.id
           WHERE je.source_type = 'RESERVATION'
             AND je.source_id = ?
             AND je.status = 'POSTED'
             AND je.is_reversed = 0
             AND jl.account_id = ?`,
          [String(payment.reservation_id), arMapping.account_id]
        );

        const arCreditsRows = await executeQuery(
          conn,
          `SELECT COALESCE(SUM(jl.credit), 0) AS total_ar_credited
           FROM journal_lines jl
           JOIN journal_entries je ON jl.journal_entry_id = je.id
           JOIN payment_transactions pt ON je.source_id = CAST(pt.id AS CHAR)
           WHERE je.source_type = 'PAYMENT'
             AND pt.reservation_id = ?
             AND je.status = 'POSTED'
             AND je.is_reversed = 0
             AND jl.account_id = ?
             AND je.id != ?`,
          [payment.reservation_id, arMapping.account_id, existingRecord?.journal_entry_id || 0]
        );

        const totalArDebitedCents = toMinorUnits(arDebitsRows[0]?.total_ar_debited || 0);
        const totalArCreditedCents = toMinorUnits(arCreditsRows[0]?.total_ar_credited || 0);
        const outstandingArCents = totalArDebitedCents > totalArCreditedCents ? totalArDebitedCents - totalArCreditedCents : 0n;

        if (outstandingArCents > 0n) {
          const arSettlementCents = totalPaymentCents < outstandingArCents ? totalPaymentCents : outstandingArCents;
          const deferredPrepaidCents = totalPaymentCents - arSettlementCents;

          journalLines.push({
            account_id: arMapping.account_id,
            property_id: payment.property_id,
            debit: 0.0,
            credit: toDecimalNumber(arSettlementCents),
            description: `Settlement of Guest Accounts Receivable for Res #${payment.reservation_code}`,
          });

          if (deferredPrepaidCents > 0n) {
            journalLines.push({
              account_id: creditMapping.account_id,
              property_id: payment.property_id,
              debit: 0.0,
              credit: toDecimalNumber(deferredPrepaidCents),
              description: `Advance accommodation prepayment for Res #${payment.reservation_code}`,
            });
          }
        } else {
          // 100% Advance prepayment
          journalLines.push({
            account_id: creditMapping.account_id,
            property_id: payment.property_id,
            debit: 0.0,
            credit: toDecimalNumber(totalPaymentCents),
            description: `Advance liability for Res #${payment.reservation_code} (${creditMapping.account_name})`,
          });
        }
      }

      // Handle explicit gateway fees if present in transaction metadata
      if (metaObj.gatewayFee && parseFloat(metaObj.gatewayFee) > 0) {
        const feeCents = toMinorUnits(metaObj.gatewayFee, 'Gateway Fee');
        const feeDec = toDecimalNumber(feeCents);
        const feeMapping = await this.resolveAccountMapping('PAYMENT_GATEWAY_FEE', conn);
        journalLines.push(
          {
            account_id: feeMapping.account_id,
            property_id: payment.property_id,
            debit: feeDec,
            credit: 0.0,
            description: `Payment processor gateway fee for Txn #${payment.transaction_reference}`,
          },
          {
            account_id: debitMapping.account_id,
            property_id: payment.property_id,
            debit: 0.0,
            credit: feeDec,
            description: `Gateway fee withholding for Txn #${payment.transaction_reference}`,
          }
        );
      }

      // 5. Generate Journal Entry
      const journalNumber = await AccountingRepository.generateJournalNumber(conn);
      const actorId = user?.id || 1; // default system user if webhook

      const createdJournal = await AccountingRepository.createJournalEntry(
        {
          journal_number: journalNumber,
          entry_date: paymentDateStr,
          accounting_period_id: period.id,
          description: `Automated Subledger Posting: Payment #${payment.transaction_reference} for Res #${payment.reservation_code}`,
          source_type: 'PAYMENT',
          source_id: String(payment.id),
          idempotency_key: idempotencyKey,
          status: 'POSTED',
          created_by_id: actorId,
          approved_by_id: actorId,
          approved_at: new Date(),
          posted_by_id: actorId,
          posted_at: new Date(),
          total_debit: toDecimalNumber(totalPaymentCents),
          total_credit: toDecimalNumber(totalPaymentCents),
        },
        journalLines,
        conn
      );

      // 6. Direct General Ledger Posting
      const glEntries = [];
      for (const line of createdJournal.lines) {
        const account = await AccountingRepository.findAccountById(line.account_id, conn);
        const lineDebitCents = toMinorUnits(line.debit);
        const lineCreditCents = toMinorUnits(line.credit);
        const netImpactCents =
          account?.normal_balance === 'DEBIT' ? lineDebitCents - lineCreditCents : lineCreditCents - lineDebitCents;

        glEntries.push({
          journal_entry_id: createdJournal.id,
          journal_line_id: line.id,
          account_id: line.account_id,
          property_id: line.property_id || payment.property_id,
          posting_date: paymentDateStr,
          accounting_period_id: period.id,
          debit: line.debit,
          credit: line.credit,
          net_balance_impact: toDecimalNumber(netImpactCents),
          description: line.description,
        });
      }

      await AccountingRepository.insertGeneralLedgerEntries(glEntries, conn);

      // 7. Record Subledger Posting Record
      let postingRecord = existingRecord;
      if (postingRecord) {
        postingRecord = await PostingBridgeRepository.updatePostingRecord(
          postingRecord.id,
          {
            journal_entry_id: createdJournal.id,
            accounting_period_id: period.id,
            status: 'POSTED',
            last_error: null,
            error_type: null,
          },
          conn
        );
      } else {
        postingRecord = await PostingBridgeRepository.createPostingRecord(
          {
            source_module: 'PAYMENTS',
            source_entity_type: 'PAYMENT_TRANSACTION',
            source_entity_id: payment.id,
            source_event_type: 'PAYMENT_COLLECTED',
            posting_purpose: 'PRIMARY',
            idempotency_key: idempotencyKey,
            journal_entry_id: createdJournal.id,
            accounting_period_id: period.id,
            property_id: payment.property_id,
            status: 'POSTED',
            amount: payment.amount,
          },
          conn
        );
      }

      // 8. Transactional Audit Log
      await AuditService.record({
        req,
        actorId,
        actorEmail: user?.email || 'system@bfa.com',
        actorRole: user?.role || 'SYSTEM',
        action: 'SUBLEDGER_PAYMENT_POSTED',
        entityType: 'journal_entry',
        entityId: createdJournal.id,
        newValues: {
          journalNumber,
          paymentId: payment.id,
          amount: payment.amount,
          periodId: period.id,
        },
        conn,
        throwOnError: true,
      });

        return postingRecord;
      } catch (err) {
        logger.error(`[POSTING BRIDGE] Payment #${payment.id} subledger posting failed: ${err.message}`);
        const errorMsg = err.message || 'Subledger posting encountered an unexpected error.';
        let rec = existingRecord;
        if (rec) {
          rec = await PostingBridgeRepository.updatePostingRecord(
            rec.id,
            {
              status: 'FAILED',
              last_error: errorMsg,
              error_type: err.name === 'ValidationError' ? 'UNRESOLVED_POLICY' : 'TRANSIENT',
            },
            conn
          );
        } else {
          rec = await PostingBridgeRepository.createPostingRecord(
            {
              source_module: 'PAYMENTS',
              source_entity_type: 'PAYMENT_TRANSACTION',
              source_entity_id: payment.id,
              source_event_type: 'PAYMENT_COLLECTED',
              posting_purpose: 'PRIMARY',
              idempotency_key: idempotencyKey,
              accounting_period_id: period?.id || null,
              property_id: payment.property_id,
              status: 'FAILED',
              amount: payment.amount,
              last_error: errorMsg,
              error_type: err.name === 'ValidationError' ? 'UNRESOLVED_POLICY' : 'TRANSIENT',
            },
            conn
          );
        }

        await PostingBridgeRepository.createException(
          {
            posting_record_id: rec.id,
            property_id: payment.property_id,
            source_module: 'PAYMENTS',
            source_entity_id: payment.id,
            exception_code: err.name === 'ValidationError' ? 'ACCOUNT_MAPPING_EXCEPTION' : 'POSTING_EXECUTION_EXCEPTION',
            exception_message: errorMsg,
          },
          conn
        );
        return rec;
      }
    };

    if (externalConn) {
      return postAction(externalConn);
    }
    return pool.withTransaction(postAction);
  }

  /* =========================================================================
   * 3. REFUND SUBLEDGER POSTING (FULL & PARTIAL)
   * ========================================================================= */

  /**
   * Posts refund transactions to the General Ledger.
   * Closed-period rule: Refunds relating to a closed period post in the current OPEN period,
   * linked to the original transaction. Never silently rewrite closed-period balances.
   */
  static async postRefund(refundTxId, { conn: externalConn = null, user = null, req = null } = {}) {
    const executor = externalConn || pool;

    const refundRows = await executeQuery(
      executor,
      `SELECT pt.*, r.reservation_code, r.property_id
       FROM payment_transactions pt
       JOIN reservations r ON pt.reservation_id = r.id
       WHERE pt.id = ?`,
      [refundTxId]
    );

    const refundTx = refundRows[0];
    if (!refundTx) {
      throw new NotFoundError(`Refund transaction #${refundTxId} not found.`);
    }

    if (refundTx.status !== 'REFUNDED') {
      logger.info(`[POSTING BRIDGE] Skipping non-refunded transaction #${refundTxId} (status: ${refundTx.status}).`);
      return null;
    }

    const idempotencyKey = `SUBLEDGER:REFUND:${refundTx.id}`;
    const existingRecord = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(idempotencyKey, executor);
    if (existingRecord && existingRecord.status === 'POSTED') {
      return existingRecord;
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    const postAction = async (conn) => {
      // 1. Resolve current active open period (Closed-period protection)
      const period = await AccountingRepository.findActivePeriodForDate(todayStr, conn);
      if (!period || period.status !== 'OPEN') {
        const errorMsg = `No OPEN accounting period found for refund posting on date ${todayStr}.`;
        const rec = await PostingBridgeRepository.createPostingRecord(
          {
            source_module: 'PAYMENTS',
            source_entity_type: 'PAYMENT_TRANSACTION',
            source_entity_id: refundTx.id,
            source_event_type: 'PAYMENT_REFUNDED',
            posting_purpose: 'REFUND',
            idempotency_key: idempotencyKey,
            accounting_period_id: period?.id || null,
            property_id: refundTx.property_id,
            status: 'FAILED',
            amount: Math.abs(refundTx.amount),
            last_error: errorMsg,
            error_type: 'PERMANENT',
          },
          conn
        );

        await PostingBridgeRepository.createException(
          {
            posting_record_id: rec.id,
            property_id: refundTx.property_id,
            source_module: 'PAYMENTS',
            source_entity_id: refundTx.id,
            exception_code: 'CLOSED_OR_MISSING_PERIOD',
            exception_message: errorMsg,
          },
          conn
        );
        return rec;
      }

      try {
        // 2. Resolve accounts
      // Debit side: Reduce Guest Deferred Revenue Liability
      const debitMapping = await this.resolveAccountMapping('GUEST_DEFERRED_REVENUE', conn);

      // Credit side: Deduct from Asset Account
      let creditMappingKey = 'PAYMENT_DEFAULT_ASSET';
      const cleanMethod = (refundTx.payment_method || '').toUpperCase();
      if (cleanMethod === 'CARD') {
        creditMappingKey = 'PAYMENT_CARD_CLEARING';
      } else if (cleanMethod === 'BANK_TRANSFER') {
        creditMappingKey = 'PAYMENT_BANK_TRANSFER';
      } else if (['CASH', 'COUNTER'].includes(cleanMethod)) {
        creditMappingKey = 'PAYMENT_CASH_VAULT';
      }
      const creditMapping = await this.resolveAccountMapping(creditMappingKey, conn);

      const refundAbsAmount = Math.abs(parseFloat(refundTx.amount));
      const amountCents = toMinorUnits(refundAbsAmount, 'Refund Amount');
      const amountDec = toDecimalNumber(amountCents);

      const journalLines = [
        {
          account_id: debitMapping.account_id,
          property_id: refundTx.property_id,
          debit: amountDec,
          credit: 0.0,
          description: `Liability reduction for Refund #${refundTx.transaction_reference} (Res #${refundTx.reservation_code})`,
        },
        {
          account_id: creditMapping.account_id,
          property_id: refundTx.property_id,
          debit: 0.0,
          credit: amountDec,
          description: `Cash/bank disbursement for Refund #${refundTx.transaction_reference}`,
        },
      ];

      const journalNumber = await AccountingRepository.generateJournalNumber(conn);
      const actorId = user?.id || refundTx.refunded_by_id || 1;

      const createdJournal = await AccountingRepository.createJournalEntry(
        {
          journal_number: journalNumber,
          entry_date: todayStr,
          accounting_period_id: period.id,
          description: `Automated Subledger Posting: Refund #${refundTx.transaction_reference} for Res #${refundTx.reservation_code}`,
          source_type: 'REFUND',
          source_id: String(refundTx.id),
          idempotency_key: idempotencyKey,
          status: 'POSTED',
          created_by_id: actorId,
          approved_by_id: actorId,
          approved_at: new Date(),
          posted_by_id: actorId,
          posted_at: new Date(),
          total_debit: amountDec,
          total_credit: amountDec,
        },
        journalLines,
        conn
      );

      const glEntries = [];
      for (const line of createdJournal.lines) {
        const account = await AccountingRepository.findAccountById(line.account_id, conn);
        const lineDebitCents = toMinorUnits(line.debit);
        const lineCreditCents = toMinorUnits(line.credit);
        const netImpactCents =
          account?.normal_balance === 'DEBIT' ? lineDebitCents - lineCreditCents : lineCreditCents - lineDebitCents;

        glEntries.push({
          journal_entry_id: createdJournal.id,
          journal_line_id: line.id,
          account_id: line.account_id,
          property_id: line.property_id || refundTx.property_id,
          posting_date: todayStr,
          accounting_period_id: period.id,
          debit: line.debit,
          credit: line.credit,
          net_balance_impact: toDecimalNumber(netImpactCents),
          description: line.description,
        });
      }

      await AccountingRepository.insertGeneralLedgerEntries(glEntries, conn);

      let postingRecord = existingRecord;
      if (postingRecord) {
        postingRecord = await PostingBridgeRepository.updatePostingRecord(
          postingRecord.id,
          {
            journal_entry_id: createdJournal.id,
            accounting_period_id: period.id,
            status: 'POSTED',
            last_error: null,
            error_type: null,
          },
          conn
        );
      } else {
        postingRecord = await PostingBridgeRepository.createPostingRecord(
          {
            source_module: 'PAYMENTS',
            source_entity_type: 'PAYMENT_TRANSACTION',
            source_entity_id: refundTx.id,
            source_event_type: 'PAYMENT_REFUNDED',
            posting_purpose: 'REFUND',
            idempotency_key: idempotencyKey,
            journal_entry_id: createdJournal.id,
            accounting_period_id: period.id,
            property_id: refundTx.property_id,
            status: 'POSTED',
            amount: refundAbsAmount,
          },
          conn
        );
      }

      await AuditService.record({
        req,
        actorId,
        actorEmail: user?.email || 'system@bfa.com',
        actorRole: user?.role || 'SYSTEM',
        action: 'SUBLEDGER_REFUND_POSTED',
        entityType: 'journal_entry',
        entityId: createdJournal.id,
        newValues: {
          journalNumber,
          refundTxId: refundTx.id,
          amount: refundAbsAmount,
          periodId: period.id,
        },
        conn,
        throwOnError: true,
      });

        return postingRecord;
      } catch (err) {
        logger.error(`[POSTING BRIDGE] Refund #${refundTx.id} posting failed: ${err.message}`);
        const errorMsg = err.message || 'Subledger refund posting encountered an unexpected error.';
        let rec = existingRecord;
        if (rec) {
          rec = await PostingBridgeRepository.updatePostingRecord(
            rec.id,
            {
              status: 'FAILED',
              last_error: errorMsg,
              error_type: err.name === 'ValidationError' ? 'UNRESOLVED_POLICY' : 'TRANSIENT',
            },
            conn
          );
        } else {
          rec = await PostingBridgeRepository.createPostingRecord(
            {
              source_module: 'PAYMENTS',
              source_entity_type: 'PAYMENT_TRANSACTION',
              source_entity_id: refundTx.id,
              source_event_type: 'PAYMENT_REFUNDED',
              posting_purpose: 'REFUND',
              idempotency_key: idempotencyKey,
              accounting_period_id: period?.id || null,
              property_id: refundTx.property_id,
              status: 'FAILED',
              amount: refundAbsAmount,
              last_error: errorMsg,
              error_type: err.name === 'ValidationError' ? 'UNRESOLVED_POLICY' : 'TRANSIENT',
            },
            conn
          );
        }

        await PostingBridgeRepository.createException(
          {
            posting_record_id: rec.id,
            property_id: refundTx.property_id,
            source_module: 'PAYMENTS',
            source_entity_id: refundTx.id,
            exception_code: err.name === 'ValidationError' ? 'ACCOUNT_MAPPING_EXCEPTION' : 'POSTING_EXECUTION_EXCEPTION',
            exception_message: errorMsg,
          },
          conn
        );
        return rec;
      }
    };

    if (externalConn) {
      return postAction(externalConn);
    }
    return pool.withTransaction(postAction);
  }

  /* =========================================================================
   * 4. ACCOMMODATION REVENUE RECOGNITION (NIGHT AUDIT / DAILY EARNED REVENUE)
   * ========================================================================= */

  /**
   * Recognizes earned accommodation revenue for delivered room nights.
   * Service delivery standard: Revenue is recognized on the service date, NOT when cash was collected.
   * Debit: 2020 Deferred Guest Revenue (or 1200 Accounts Receivable if unpaid)
   * Credit: 4010 Accommodation Revenue
   */
  static async postRevenueRecognition(
    { reservationId, serviceDate, propertyId = null, user = null, req = null },
    { conn: externalConn = null } = {}
  ) {
    const executor = externalConn || pool;

    const resRows = await executeQuery(executor, 'SELECT * FROM reservations WHERE id = ?', [reservationId]);
    const reservation = resRows[0];
    if (!reservation) {
      throw new NotFoundError(`Reservation #${reservationId} not found.`);
    }

    // Only recognize revenue for delivered service stays (CHECKED_IN or COMPLETED)
    if (!['CHECKED_IN', 'COMPLETED'].includes(reservation.status)) {
      throw new ValidationError(
        `Cannot recognize accommodation revenue: Reservation status is '${reservation.status}'. Only CHECKED_IN or COMPLETED stays can be recognized.`
      );
    }

    const targetServiceDate = serviceDate || reservation.check_in_date;
    const idempotencyKey = `SUBLEDGER:REVENUE:RES_${reservation.id}:DATE_${targetServiceDate}`;

    const existingRecord = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(idempotencyKey, executor);
    const postAction = async (conn) => {
      // Fetch authoritative reservation with row lock
      const resRows = await executeQuery(conn, 'SELECT * FROM reservations WHERE id = ? FOR UPDATE', [reservationId]);
      const reservation = resRows[0];
      if (!reservation) {
        throw new NotFoundError(`Reservation #${reservationId} not found.`);
      }

      // Only recognize revenue for delivered service stays (CHECKED_IN or COMPLETED)
      if (!['CHECKED_IN', 'COMPLETED'].includes(reservation.status)) {
        throw new ValidationError(
          `Cannot recognize accommodation revenue: Reservation status is '${reservation.status}'. Only CHECKED_IN or COMPLETED stays can be recognized.`
        );
      }

      const targetServiceDate = serviceDate || reservation.check_in_date;
      const idempotencyKey = `SUBLEDGER:REVENUE:RES_${reservation.id}:DATE_${targetServiceDate}`;

      const existingRecord = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(idempotencyKey, conn);
      if (existingRecord && existingRecord.status === 'POSTED') {
        return existingRecord;
      }

      // 1. Resolve open accounting period covering service date
      const period = await AccountingRepository.findActivePeriodForDate(targetServiceDate, conn);
      if (!period || period.status !== 'OPEN') {
        const errorMsg = `No OPEN accounting period found for service date ${targetServiceDate}.`;
        const rec = await PostingBridgeRepository.createPostingRecord(
          {
            source_module: 'RESERVATIONS',
            source_entity_type: 'RESERVATION_STAY_NIGHT',
            source_entity_id: reservation.id,
            source_event_type: 'REVENUE_RECOGNITION',
            posting_purpose: 'ACCOMMODATION_REVENUE',
            idempotency_key: idempotencyKey,
            accounting_period_id: period?.id || null,
            property_id: reservation.property_id,
            status: 'FAILED',
            amount: reservation.total_amount,
            service_date: targetServiceDate,
            last_error: errorMsg,
            error_type: 'PERMANENT',
          },
          conn
        );

        await PostingBridgeRepository.createException(
          {
            posting_record_id: rec.id,
            property_id: reservation.property_id,
            source_module: 'RESERVATIONS',
            source_entity_id: reservation.id,
            exception_code: 'CLOSED_OR_MISSING_PERIOD',
            exception_message: errorMsg,
          },
          conn
        );
        return rec;
      }

      try {
        // 2. Resolve account mappings
      const creditMapping = await this.resolveAccountMapping('ACCOMMODATION_REVENUE', conn);
      const deferredMapping = await this.resolveAccountMapping('GUEST_DEFERRED_REVENUE', conn);
      const arMapping = await this.resolveAccountMapping('ACCOUNTS_RECEIVABLE_GUEST', conn);

      // Amount calculation for this stay night
      const nights = Math.max(1, reservation.nights || 1);
      const nightRate = parseFloat(reservation.total_amount) / nights;
      const totalNightCents = toMinorUnits(nightRate, 'Night Rate');
      const totalNightDec = toDecimalNumber(totalNightCents);

      // Calculate cumulative net advance payments available for accommodation (excluding security deposits)
      const payRows = await executeQuery(
        conn,
        `SELECT COALESCE(SUM(pt.amount), 0) AS total_paid
         FROM payment_transactions pt
         WHERE pt.reservation_id = ?
           AND pt.status IN ('SUCCESS', 'PARTIALLY_REFUNDED')
           AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pt.metadata, '$.isSecurityDeposit')), 'false') != 'true'`,
        [reservation.id]
      );

      const refundRows = await executeQuery(
        conn,
        `SELECT COALESCE(SUM(ABS(pt.amount)), 0) AS total_refunded
         FROM payment_transactions pt
         WHERE pt.reservation_id = ?
           AND pt.status = 'REFUNDED'`,
        [reservation.id]
      );

      const totalPaidCents = toMinorUnits(payRows[0]?.total_paid || 0);
      const totalRefundedCents = toMinorUnits(refundRows[0]?.total_refunded || 0);
      const netAccommodationPrepaidCents = totalPaidCents > totalRefundedCents ? totalPaidCents - totalRefundedCents : 0n;

      // Query cumulative deferred revenue already relieved for prior stay dates of this reservation
      const priorReliefRows = await executeQuery(
        conn,
        `SELECT COALESCE(SUM(jl.debit), 0) AS total_deferred_relieved
         FROM journal_lines jl
         JOIN journal_entries je ON jl.journal_entry_id = je.id
         WHERE je.source_type = 'RESERVATION'
           AND je.source_id = ?
           AND je.status = 'POSTED'
           AND je.is_reversed = 0
           AND jl.account_id = ?
           AND je.id != ?`,
        [String(reservation.id), deferredMapping.account_id, existingRecord?.journal_entry_id || 0]
      );

      const alreadyRelievedDeferredCents = toMinorUnits(priorReliefRows[0]?.total_deferred_relieved || 0);
      const remainingPrepaidCents = netAccommodationPrepaidCents > alreadyRelievedDeferredCents
        ? netAccommodationPrepaidCents - alreadyRelievedDeferredCents
        : 0n;

      // Allocate current night rate between remaining deferred prepaid balance and accounts receivable
      const deferredReliefCents = totalNightCents < remainingPrepaidCents ? totalNightCents : remainingPrepaidCents;
      const arAccrualCents = totalNightCents - deferredReliefCents;

      const journalLines = [];
      if (deferredReliefCents > 0n) {
        journalLines.push({
          account_id: deferredMapping.account_id,
          property_id: reservation.property_id,
          debit: toDecimalNumber(deferredReliefCents),
          credit: 0.0,
          description: `Relief of ${deferredMapping.account_name} for Stay Night ${targetServiceDate} (Res #${reservation.reservation_code})`,
        });
      }
      if (arAccrualCents > 0n) {
        journalLines.push({
          account_id: arMapping.account_id,
          property_id: reservation.property_id,
          debit: toDecimalNumber(arAccrualCents),
          credit: 0.0,
          description: `Guest Receivable for Unpaid Stay Night ${targetServiceDate} (Res #${reservation.reservation_code})`,
        });
      }

      // Credit: Earned Accommodation Revenue
      journalLines.push({
        account_id: creditMapping.account_id,
        property_id: reservation.property_id,
        debit: 0.0,
        credit: totalNightDec,
        description: `Earned Accommodation Revenue for Stay Night ${targetServiceDate} (Res #${reservation.reservation_code})`,
      });

      const journalNumber = await AccountingRepository.generateJournalNumber(conn);
      const actorId = user?.id || 1;

      const createdJournal = await AccountingRepository.createJournalEntry(
        {
          journal_number: journalNumber,
          entry_date: targetServiceDate,
          accounting_period_id: period.id,
          description: `Automated Revenue Recognition: Res #${reservation.reservation_code} on ${targetServiceDate}`,
          source_type: 'RESERVATION',
          source_id: String(reservation.id),
          idempotency_key: idempotencyKey,
          status: 'POSTED',
          created_by_id: actorId,
          approved_by_id: actorId,
          approved_at: new Date(),
          posted_by_id: actorId,
          posted_at: new Date(),
          total_debit: totalNightDec,
          total_credit: totalNightDec,
        },
        journalLines,
        conn
      );

      const glEntries = [];
      for (const line of createdJournal.lines) {
        const account = await AccountingRepository.findAccountById(line.account_id, conn);
        const lineDebitCents = toMinorUnits(line.debit);
        const lineCreditCents = toMinorUnits(line.credit);
        const netImpactCents =
          account?.normal_balance === 'DEBIT' ? lineDebitCents - lineCreditCents : lineCreditCents - lineDebitCents;

        glEntries.push({
          journal_entry_id: createdJournal.id,
          journal_line_id: line.id,
          account_id: line.account_id,
          property_id: line.property_id || reservation.property_id,
          posting_date: targetServiceDate,
          accounting_period_id: period.id,
          debit: line.debit,
          credit: line.credit,
          net_balance_impact: toDecimalNumber(netImpactCents),
          description: line.description,
        });
      }

      await AccountingRepository.insertGeneralLedgerEntries(glEntries, conn);

      let postingRecord = existingRecord;
      if (postingRecord) {
        postingRecord = await PostingBridgeRepository.updatePostingRecord(
          postingRecord.id,
          {
            journal_entry_id: createdJournal.id,
            accounting_period_id: period.id,
            status: 'POSTED',
            last_error: null,
            error_type: null,
          },
          conn
        );
      } else {
        postingRecord = await PostingBridgeRepository.createPostingRecord(
          {
            source_module: 'RESERVATIONS',
            source_entity_type: 'RESERVATION_STAY_NIGHT',
            source_entity_id: reservation.id,
            source_event_type: 'REVENUE_RECOGNITION',
            posting_purpose: 'ACCOMMODATION_REVENUE',
            idempotency_key: idempotencyKey,
            journal_entry_id: createdJournal.id,
            accounting_period_id: period.id,
            property_id: reservation.property_id,
            status: 'POSTED',
            amount: totalNightDec,
            service_date: targetServiceDate,
          },
          conn
        );
      }

      await AuditService.record({
        req,
        actorId,
        actorEmail: user?.email || 'system@bfa.com',
        actorRole: user?.role || 'SYSTEM',
        action: 'SUBLEDGER_REVENUE_RECOGNIZED',
        entityType: 'journal_entry',
        entityId: createdJournal.id,
        newValues: {
          journalNumber,
          reservationId: reservation.id,
          serviceDate: targetServiceDate,
          amount: totalNightDec,
        },
        conn,
        throwOnError: true,
      });

        return postingRecord;
      } catch (err) {
        logger.error(`[POSTING BRIDGE] Res #${reservation.id} revenue recognition failed: ${err.message}`);
        const errorMsg = err.message || 'Revenue recognition encountered an unexpected error.';
        let rec = existingRecord;
        if (rec) {
          rec = await PostingBridgeRepository.updatePostingRecord(
            rec.id,
            {
              status: 'FAILED',
              last_error: errorMsg,
              error_type: err.name === 'ValidationError' ? 'UNRESOLVED_POLICY' : 'TRANSIENT',
            },
            conn
          );
        } else {
          rec = await PostingBridgeRepository.createPostingRecord(
            {
              source_module: 'RESERVATIONS',
              source_entity_type: 'RESERVATION_STAY_NIGHT',
              source_entity_id: reservation.id,
              source_event_type: 'REVENUE_RECOGNITION',
              posting_purpose: 'ACCOMMODATION_REVENUE',
              idempotency_key: idempotencyKey,
              accounting_period_id: period?.id || null,
              property_id: reservation.property_id,
              status: 'FAILED',
              amount: totalNightDec || reservation.total_amount,
              service_date: targetServiceDate,
              last_error: errorMsg,
              error_type: err.name === 'ValidationError' ? 'UNRESOLVED_POLICY' : 'TRANSIENT',
            },
            conn
          );
        }

        await PostingBridgeRepository.createException(
          {
            posting_record_id: rec.id,
            property_id: reservation.property_id,
            source_module: 'RESERVATIONS',
            source_entity_id: reservation.id,
            exception_code: err.name === 'ValidationError' ? 'ACCOUNT_MAPPING_EXCEPTION' : 'POSTING_EXECUTION_EXCEPTION',
            exception_message: errorMsg,
          },
          conn
        );
        return rec;
      }
    };

    if (externalConn) {
      return postAction(externalConn);
    }
    return pool.withTransaction(postAction);
  }

  /**
   * Night Audit execution engine: Batch processes accommodation revenue recognition
   * for all checked-in or completed stays on a service date.
   * Fault Isolation: Exceptions on individual reservations are isolated and recorded
   * without aborting the batch run for other eligible reservations.
   */
  static async runNightAudit({ serviceDate, propertyId = null, user = null, req = null } = {}) {
    const targetDate = serviceDate || new Date().toISOString().slice(0, 10);

    let sql = `
      SELECT r.id, r.reservation_code, r.property_id, r.total_amount, r.paid_amount, r.status, r.check_in_date, r.check_out_date, r.nights
      FROM reservations r
      WHERE r.check_in_date <= ?
        AND r.check_out_date > ?
        AND r.status IN ('CHECKED_IN', 'COMPLETED')
    `;
    const params = [targetDate, targetDate];

    if (propertyId) {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }

    const eligibleReservations = await pool.query(sql, params);

    const results = {
      serviceDate: targetDate,
      totalEligible: eligibleReservations.length,
      postedCount: 0,
      skippedCount: 0,
      exceptionCount: 0,
      records: [],
      exceptions: [],
    };

    for (const res of eligibleReservations) {
      try {
        const record = await this.postRevenueRecognition(
          {
            reservationId: res.id,
            serviceDate: targetDate,
            propertyId: res.property_id,
            user,
            req,
          }
        );

        if (record && record.status === 'POSTED') {
          results.postedCount++;
          results.records.push({ reservationId: res.id, code: res.reservation_code, status: 'POSTED' });
        } else {
          results.skippedCount++;
        }
      } catch (err) {
        results.exceptionCount++;
        results.exceptions.push({
          reservationId: res.id,
          code: res.reservation_code,
          error: err.message,
        });

        // Record exception
        await PostingBridgeRepository.createException({
          source_module: 'RESERVATIONS',
          source_entity_id: res.id,
          property_id: res.property_id,
          exception_code: 'NIGHT_AUDIT_ITEM_EXCEPTION',
          exception_message: `Reservation #${res.reservation_code} night audit failed: ${err.message}`,
        });
      }
    }

    await AuditService.record({
      req,
      actorId: user?.id || 1,
      actorEmail: user?.email || 'system@bfa.com',
      actorRole: user?.role || 'SYSTEM',
      action: 'NIGHT_AUDIT_EXECUTED',
      entityType: 'accounting_period',
      entityId: targetDate,
      newValues: {
        serviceDate: targetDate,
        totalEligible: results.totalEligible,
        postedCount: results.postedCount,
        exceptionCount: results.exceptionCount,
      },
    });

    return results;
  }

  /* =========================================================================
   * 5. OPERATIONAL EXPENSES SUBLEDGER POSTING
   * ========================================================================= */

  /**
   * Posts an approved operational expense to the General Ledger.
   * Debit: Corresponding operational expense account based on category (5010-5080)
   * Credit: Bank / Petty Cash (if already paid) or Accounts Payable - Trade (if unpaid invoice)
   */
  static async postExpense(expenseId, { conn: externalConn = null, user = null, req = null } = {}) {
    const executor = externalConn || pool;

    const expRows = await executeQuery(executor, 'SELECT * FROM expenses WHERE id = ?', [expenseId]);
    const expense = expRows[0];
    if (!expense) {
      throw new NotFoundError(`Expense record #${expenseId} not found.`);
    }

    if (expense.status !== 'APPROVED') {
      logger.info(`[POSTING BRIDGE] Skipping unapproved expense #${expenseId} (status: ${expense.status}).`);
      return null;
    }

    const idempotencyKey = `SUBLEDGER:EXPENSE:${expense.id}`;
    const existingRecord = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(idempotencyKey, executor);
    if (existingRecord && existingRecord.status === 'POSTED') {
      return existingRecord;
    }

    const expenseDateStr = (expense.expense_date ? new Date(expense.expense_date) : new Date(expense.created_at))
      .toISOString()
      .slice(0, 10);

    const postAction = async (conn) => {
      // 1. Resolve open accounting period
      const period = await AccountingRepository.findActivePeriodForDate(expenseDateStr, conn);
      if (!period || period.status !== 'OPEN') {
        const errorMsg = `No OPEN accounting period found for expense date ${expenseDateStr}.`;
        const rec = await PostingBridgeRepository.createPostingRecord(
          {
            source_module: 'EXPENSES',
            source_entity_type: 'EXPENSE',
            source_entity_id: expense.id,
            source_event_type: 'EXPENSE_APPROVED',
            posting_purpose: 'EXPENSE_POSTING',
            idempotency_key: idempotencyKey,
            accounting_period_id: period?.id || null,
            property_id: expense.property_id,
            status: 'FAILED',
            amount: expense.amount,
            last_error: errorMsg,
            error_type: 'PERMANENT',
          },
          conn
        );

        await PostingBridgeRepository.createException(
          {
            posting_record_id: rec.id,
            property_id: expense.property_id,
            source_module: 'EXPENSES',
            source_entity_id: expense.id,
            exception_code: 'CLOSED_OR_MISSING_PERIOD',
            exception_message: errorMsg,
          },
          conn
        );
        return rec;
      }

      try {
        // 2. Resolve Debit Expense Account Mapping
      const catKey = `EXPENSE_${expense.category.toUpperCase()}`;
      let debitMapping = null;
      try {
        debitMapping = await this.resolveAccountMapping(catKey, conn);
      } catch {
        debitMapping = await this.resolveAccountMapping('EXPENSE_OTHER', conn);
      }

      // 3. Resolve Credit Account (Cash/Bank vs Accounts Payable)
      let creditMappingKey = 'ACCOUNTS_PAYABLE_TRADE';
      const cleanPayMethod = (expense.payment_method || '').toUpperCase();
      if (['BANK_TRANSFER', 'CARD'].includes(cleanPayMethod)) {
        creditMappingKey = 'PAYMENT_BANK_TRANSFER';
      } else if (['CASH', 'PETTY_CASH'].includes(cleanPayMethod)) {
        creditMappingKey = 'PAYMENT_CASH_VAULT';
      }
      const creditMapping = await this.resolveAccountMapping(creditMappingKey, conn);

      const amountCents = toMinorUnits(expense.amount, 'Expense Amount');
      const amountDec = toDecimalNumber(amountCents);

      const journalLines = [
        {
          account_id: debitMapping.account_id,
          property_id: expense.property_id,
          debit: amountDec,
          credit: 0.0,
          description: `Expense #${expense.expense_code}: ${expense.description} (${debitMapping.account_name})`,
        },
        {
          account_id: creditMapping.account_id,
          property_id: expense.property_id,
          debit: 0.0,
          credit: amountDec,
          description: `Disbursement / Payable for Expense #${expense.expense_code} (${creditMapping.account_name})`,
        },
      ];

      const journalNumber = await AccountingRepository.generateJournalNumber(conn);
      const actorId = user?.id || expense.approved_by_id || 1;

      const createdJournal = await AccountingRepository.createJournalEntry(
        {
          journal_number: journalNumber,
          entry_date: expenseDateStr,
          accounting_period_id: period.id,
          description: `Automated Subledger Posting: Expense #${expense.expense_code} - ${expense.description}`,
          source_type: 'EXPENSE',
          source_id: String(expense.id),
          idempotency_key: idempotencyKey,
          status: 'POSTED',
          created_by_id: actorId,
          approved_by_id: actorId,
          approved_at: new Date(),
          posted_by_id: actorId,
          posted_at: new Date(),
          total_debit: amountDec,
          total_credit: amountDec,
        },
        journalLines,
        conn
      );

      const glEntries = [];
      for (const line of createdJournal.lines) {
        const account = await AccountingRepository.findAccountById(line.account_id, conn);
        const lineDebitCents = toMinorUnits(line.debit);
        const lineCreditCents = toMinorUnits(line.credit);
        const netImpactCents =
          account?.normal_balance === 'DEBIT' ? lineDebitCents - lineCreditCents : lineCreditCents - lineDebitCents;

        glEntries.push({
          journal_entry_id: createdJournal.id,
          journal_line_id: line.id,
          account_id: line.account_id,
          property_id: line.property_id || expense.property_id,
          posting_date: expenseDateStr,
          accounting_period_id: period.id,
          debit: line.debit,
          credit: line.credit,
          net_balance_impact: toDecimalNumber(netImpactCents),
          description: line.description,
        });
      }

      await AccountingRepository.insertGeneralLedgerEntries(glEntries, conn);

      let postingRecord = existingRecord;
      if (postingRecord) {
        postingRecord = await PostingBridgeRepository.updatePostingRecord(
          postingRecord.id,
          {
            journal_entry_id: createdJournal.id,
            accounting_period_id: period.id,
            status: 'POSTED',
            last_error: null,
            error_type: null,
          },
          conn
        );
      } else {
        postingRecord = await PostingBridgeRepository.createPostingRecord(
          {
            source_module: 'EXPENSES',
            source_entity_type: 'EXPENSE',
            source_entity_id: expense.id,
            source_event_type: 'EXPENSE_APPROVED',
            posting_purpose: 'EXPENSE_POSTING',
            idempotency_key: idempotencyKey,
            journal_entry_id: createdJournal.id,
            accounting_period_id: period.id,
            property_id: expense.property_id,
            status: 'POSTED',
            amount: expense.amount,
          },
          conn
        );
      }

      await AuditService.record({
        req,
        actorId,
        actorEmail: user?.email || 'system@bfa.com',
        actorRole: user?.role || 'SYSTEM',
        action: 'SUBLEDGER_EXPENSE_POSTED',
        entityType: 'journal_entry',
        entityId: createdJournal.id,
        newValues: {
          journalNumber,
          expenseId: expense.id,
          amount: expense.amount,
          periodId: period.id,
        },
        conn,
        throwOnError: true,
      });

        return postingRecord;
      } catch (err) {
        logger.error(`[POSTING BRIDGE] Expense #${expense.id} posting failed: ${err.message}`);
        const errorMsg = err.message || 'Subledger expense posting encountered an unexpected error.';
        let rec = existingRecord;
        if (rec) {
          rec = await PostingBridgeRepository.updatePostingRecord(
            rec.id,
            {
              status: 'FAILED',
              last_error: errorMsg,
              error_type: err.name === 'ValidationError' ? 'UNRESOLVED_POLICY' : 'TRANSIENT',
            },
            conn
          );
        } else {
          rec = await PostingBridgeRepository.createPostingRecord(
            {
              source_module: 'EXPENSES',
              source_entity_type: 'EXPENSE',
              source_entity_id: expense.id,
              source_event_type: 'EXPENSE_APPROVED',
              posting_purpose: 'EXPENSE_POSTING',
              idempotency_key: idempotencyKey,
              accounting_period_id: period?.id || null,
              property_id: expense.property_id,
              status: 'FAILED',
              amount: expense.amount,
              last_error: errorMsg,
              error_type: err.name === 'ValidationError' ? 'UNRESOLVED_POLICY' : 'TRANSIENT',
            },
            conn
          );
        }

        await PostingBridgeRepository.createException(
          {
            posting_record_id: rec.id,
            property_id: expense.property_id,
            source_module: 'EXPENSES',
            source_entity_id: expense.id,
            exception_code: err.name === 'ValidationError' ? 'ACCOUNT_MAPPING_EXCEPTION' : 'POSTING_EXECUTION_EXCEPTION',
            exception_message: errorMsg,
          },
          conn
        );
        return rec;
      }
    };

    if (externalConn) {
      return postAction(externalConn);
    }
    return pool.withTransaction(postAction);
  }

  /**
   * Reverses a posted expense journal when an expense is voided.
   */
  static async reverseExpense(expenseId, { conn: externalConn = null, user = null, req = null } = {}) {
    const executor = externalConn || pool;
    const idempotencyKey = `SUBLEDGER:EXPENSE:${expenseId}`;

    const record = await PostingBridgeRepository.findPostingRecordByIdempotencyKey(idempotencyKey, executor);
    if (!record || !record.journal_entry_id || record.status !== 'POSTED') {
      logger.info(`[POSTING BRIDGE] No active posted journal found to reverse for expense #${expenseId}.`);
      return null;
    }

    const reverseAction = async (conn) => {
      const result = await AccountingService.reverseJournal(
        record.journal_entry_id,
        { reversal_reason: `Reversal triggered by expense #${expenseId} voiding`, conn },
        user || { id: 1, role: 'SYSTEM' },
        req
      );

      await PostingBridgeRepository.updatePostingRecord(
        record.id,
        {
          status: 'REVERSED',
        },
        conn
      );

      return result;
    };

    if (externalConn) {
      return reverseAction(externalConn);
    }
    return pool.withTransaction(reverseAction);
  }

  /* =========================================================================
   * 6. EXCEPTION MANAGEMENT & RETRIES
   * ========================================================================= */

  static async listPostingRecords(query, user = null) {
    const params = { ...query };
    if (['MANAGER', 'STAFF'].includes(user?.role?.toUpperCase())) {
      if (!user.propertyId) {
        // Fail closed: Property-scoped user without assigned property receives empty set
        return { data: [], total: 0, page: 1, limit: 50 };
      }
      params.propertyId = user.propertyId;
    }
    return PostingBridgeRepository.listPostingRecords(params);
  }

  static async listExceptions(query, user = null) {
    const params = { ...query };
    if (['MANAGER', 'STAFF'].includes(user?.role?.toUpperCase())) {
      if (!user.propertyId) {
        // Fail closed: Property-scoped user without assigned property receives empty set
        return { data: [], total: 0, page: 1, limit: 50 };
      }
      // Server-side enforcement: client-supplied property filters cannot override authenticated scope
      params.propertyId = user.propertyId;
    }
    return PostingBridgeRepository.listExceptions(params);
  }

  static async resolveException(exceptionId, { action = 'RETRY', notes = '' }, user, req = null) {
    const exception = await PostingBridgeRepository.findExceptionById(exceptionId);
    if (!exception) {
      throw new NotFoundError(`Posting exception #${exceptionId} not found.`);
    }

    if (user && ['MANAGER', 'STAFF'].includes(user?.role?.toUpperCase())) {
      if (!user.propertyId || (exception.property_id && exception.property_id !== user.propertyId)) {
        throw new ForbiddenError('You do not have permission to access or resolve posting exceptions for this property.');
      }
    }

    if (exception.status !== 'OPEN') {
      throw new ConflictError(`Posting exception #${exceptionId} is already ${exception.status}.`);
    }

    if (action.toUpperCase() === 'DISMISS') {
      const updated = await PostingBridgeRepository.updateException(exceptionId, {
        status: 'DISMISSED',
        resolution_notes: notes.trim() || 'Dismissed by authorized administrator',
        resolved_by_id: user.id,
        resolved_at: new Date(),
      });

      await AuditService.record({
        req,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'POSTING_EXCEPTION_DISMISSED',
        entityType: 'posting_exception',
        entityId: String(exceptionId),
        newValues: { notes },
      });

      return { success: true, message: 'Exception dismissed successfully', data: updated };
    }

    // Default Action: RETRY
    if (!exception.posting_record_id && !exception.source_entity_id) {
      throw new ValidationError(`Cannot retry exception #${exceptionId}: No associated posting record or source reference.`);
    }

    let retriedRecord = null;
    if (exception.posting_record_id) {
      const rec = await PostingBridgeRepository.findPostingRecordById(exception.posting_record_id);
      if (!rec) {
        throw new ValidationError(`Associated posting record #${exception.posting_record_id} not found.`);
      }
      if (rec.source_module === 'PAYMENTS' && rec.source_event_type === 'PAYMENT_COLLECTED') {
        retriedRecord = await this.postPayment(rec.source_entity_id, { user, req });
      } else if (rec.source_module === 'PAYMENTS' && rec.source_event_type === 'PAYMENT_REFUNDED') {
        retriedRecord = await this.postRefund(rec.source_entity_id, { user, req });
      } else if (rec.source_module === 'RESERVATIONS') {
        retriedRecord = await this.postRevenueRecognition({
          reservationId: rec.source_entity_id,
          serviceDate: rec.service_date,
          propertyId: rec.property_id,
          user,
          req,
        });
      } else if (rec.source_module === 'EXPENSES') {
        retriedRecord = await this.postExpense(rec.source_entity_id, { user, req });
      }
    } else if (exception.source_module && exception.source_entity_id) {
      if (exception.source_module === 'PAYMENTS') {
        retriedRecord = await this.postPayment(exception.source_entity_id, { user, req });
      } else if (exception.source_module === 'RESERVATIONS') {
        retriedRecord = await this.postRevenueRecognition({
          reservationId: exception.source_entity_id,
          serviceDate: new Date().toISOString().slice(0, 10),
          user,
          req,
        });
      } else if (exception.source_module === 'EXPENSES') {
        retriedRecord = await this.postExpense(exception.source_entity_id, { user, req });
      }
    }

    if (!retriedRecord || retriedRecord.status !== 'POSTED' || !retriedRecord.journal_entry_id) {
      throw new ValidationError(
        `Retry failed for exception #${exceptionId}: Subledger posting did not produce a posted journal entry.`
      );
    }

    const journal = await AccountingRepository.findJournalById(retriedRecord.journal_entry_id);
    if (!journal || journal.status !== 'POSTED') {
      throw new ValidationError(
        `Retry verification failed: Journal entry #${retriedRecord.journal_entry_id} is not in POSTED status.`
      );
    }

    const updated = await PostingBridgeRepository.updateException(exceptionId, {
      status: 'RESOLVED',
      resolution_notes: notes.trim() || `Retried and posted successfully as journal #${journal.journal_number}`,
      resolved_by_id: user.id,
      resolved_at: new Date(),
    });

    await AuditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'POSTING_EXCEPTION_RESOLVED',
      entityType: 'posting_exception',
      entityId: String(exceptionId),
      newValues: { notes, action: 'RETRY', journalNumber: journal.journal_number, journalId: journal.id },
    });

    return { success: true, message: 'Exception resolved and re-posted successfully', data: updated };
  }

  /* =========================================================================
   * 7. RECONCILIATION & ACCOUNT MAPPINGS
   * ========================================================================= */

  static async reconcile(query, user = null) {
    const params = { ...query };
    if (['MANAGER', 'STAFF'].includes(user?.role?.toUpperCase()) && user.propertyId) {
      params.propertyId = user.propertyId;
    }
    return PostingBridgeRepository.reconcileSubledger(params);
  }

  static async listAccountMappings() {
    return PostingBridgeRepository.findAllMappings();
  }

  static async updateAccountMapping(mappingKey, accountId, user, req = null) {
    const account = await AccountingRepository.findAccountById(accountId);
    if (!account) {
      throw new NotFoundError(`Account #${accountId} not found.`);
    }
    if (!account.is_active || !account.is_posting_allowed) {
      throw new ValidationError(`Account '${account.account_code}' must be active and allow direct postings.`);
    }

    const updated = await PostingBridgeRepository.updateMapping(mappingKey, accountId);

    await AuditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'ACCOUNT_MAPPING_UPDATED',
      entityType: 'account_mapping',
      entityId: mappingKey,
      newValues: { mappingKey, newAccountId: accountId, accountCode: account.account_code },
    });

    return updated;
  }
}

module.exports = PostingBridgeService;
