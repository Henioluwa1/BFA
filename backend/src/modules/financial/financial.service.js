const pool = require('../../db/pool');
const { ForbiddenError } = require('../../core/errors/apiError');

class FinancialService {
  /**
   * Validate property scoping
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return true;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return true;
    }
    if (['MANAGER', 'STAFF', 'RECEPTIONIST'].includes(role)) {
      if (!user.propertyId) {
        throw new ForbiddenError('Access denied: User is not assigned to any property.');
      }
      if (propertyId && propertyId !== 'all' && parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization for this property.');
      }
    }
    return true;
  }

  /**
   * Get comprehensive financial overview and KPI metrics
   */
  static async getOverview({ propertyId, fromDate, toDate, user = null } = {}) {
    let effectivePropertyId = propertyId;
    if (user) {
      const role = (user.role || '').toUpperCase();
      if (['MANAGER', 'STAFF', 'RECEPTIONIST'].includes(role)) {
        if (!user.propertyId) {
          throw new ForbiddenError('Access denied: User is not assigned to any property.');
        }
        if (propertyId && propertyId !== 'all' && parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
          throw new ForbiddenError('Access denied: You do not have authorization for this property.');
        }
        effectivePropertyId = user.propertyId;
      }
    }
    this.validatePropertyScope(user, effectivePropertyId);

    // 1. Gross payments collected (SUCCESS)
    let paySql = `
      SELECT 
        COUNT(pt.id) as payment_count,
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL AND pt.amount > 0 AND pt.status IN ('SUCCESS', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN pt.amount ELSE 0 END), 0) as gross_collected,
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL THEN COALESCE(pt.refund_amount, 0) ELSE 0 END), 0) as total_refunded,
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL AND pt.amount > 0 AND pt.status = 'PENDING' THEN pt.amount ELSE 0 END), 0) as pending_amount
      FROM payment_transactions pt
      JOIN reservations r ON r.id = pt.reservation_id
      WHERE 1=1
    `;
    const payParams = [];
    if (effectivePropertyId && effectivePropertyId !== 'all') {
      paySql += ' AND r.property_id = ?';
      payParams.push(effectivePropertyId);
    }
    if (fromDate) {
      paySql += ' AND DATE(COALESCE(pt.paid_at, pt.created_at)) >= ?';
      payParams.push(fromDate);
    }
    if (toDate) {
      paySql += ' AND DATE(COALESCE(pt.paid_at, pt.created_at)) <= ?';
      payParams.push(toDate);
    }

    const [payRows] = await pool.query(paySql, payParams);
    const grossCollected = parseFloat(payRows?.gross_collected || 0);
    const totalRefunded = parseFloat(payRows?.total_refunded || 0);
    const rawNetRevenue = Math.round((grossCollected - totalRefunded) * 100) / 100;
    const netRevenue = Math.max(0, rawNetRevenue);
    const pendingPayments = parseFloat(payRows?.pending_amount || 0);

    // 2. Reservation book revenue & receivables
    let resSql = `
      SELECT 
        COUNT(r.id) as total_reservations,
        COALESCE(SUM(r.total_amount), 0) as total_booked_revenue,
        COALESCE(SUM(r.paid_amount), 0) as total_paid_amount
      FROM reservations r
      WHERE r.status NOT IN ('CANCELLED')
    `;
    const resParams = [];
    if (effectivePropertyId && effectivePropertyId !== 'all') {
      resSql += ' AND r.property_id = ?';
      resParams.push(effectivePropertyId);
    }
    if (fromDate) {
      resSql += ' AND r.check_in_date >= ?';
      resParams.push(fromDate);
    }
    if (toDate) {
      resSql += ' AND r.check_in_date <= ?';
      resParams.push(toDate);
    }

    const [resRows] = await pool.query(resSql, resParams);
    const bookedRevenue = parseFloat(resRows?.total_booked_revenue || 0);
    const paidOnReservations = parseFloat(resRows?.total_paid_amount || 0);
    const rawOutstandingReceivables = Math.round((bookedRevenue - paidOnReservations) * 100) / 100;
    const outstandingReceivables = Math.max(0, rawOutstandingReceivables);

    // Anomaly Detection: inspect unlinked negative refund rows
    let orphanSql = `
      SELECT COUNT(pt.id) as orphan_count, COALESCE(SUM(pt.amount), 0) as orphan_total
      FROM payment_transactions pt
      JOIN reservations r ON r.id = pt.reservation_id
      WHERE pt.parent_transaction_id IS NULL AND pt.amount < 0
    `;
    const orphanParams = [];
    if (effectivePropertyId && effectivePropertyId !== 'all') {
      orphanSql += ' AND r.property_id = ?';
      orphanParams.push(effectivePropertyId);
    }
    const [orphanRows] = await pool.query(orphanSql, orphanParams);
    const orphanCount = parseInt(orphanRows?.orphan_count || 0, 10);
    const orphanTotal = parseFloat(orphanRows?.orphan_total || 0);

    const anomalies = [];
    if (orphanCount > 0) {
      anomalies.push({
        code: 'ORPHAN_REFUND_TRANSACTIONS',
        severity: 'CRITICAL',
        message: `Detected ${orphanCount} unlinked refund transaction(s) totaling ₦${Math.abs(orphanTotal).toLocaleString()} without parent payment references.`,
        affectedMetric: 'grossCollected',
        count: orphanCount,
        total: orphanTotal,
      });
    }

    if (rawNetRevenue < 0) {
      anomalies.push({
        code: 'NEGATIVE_NET_REVENUE',
        severity: 'HIGH',
        message: `Computed net collections (₦${rawNetRevenue.toLocaleString()}) are negative. Refunds exceed gross collections. Display value constrained to ₦0.00.`,
        affectedMetric: 'netRevenue',
        rawValue: rawNetRevenue,
      });
    }

    if (rawOutstandingReceivables < 0) {
      anomalies.push({
        code: 'NEGATIVE_RECEIVABLES',
        severity: 'MEDIUM',
        message: `Computed receivables (₦${rawOutstandingReceivables.toLocaleString()}) are negative. Payments recorded on reservations exceed booked total. Display value constrained to ₦0.00.`,
        affectedMetric: 'outstandingReceivables',
        rawValue: rawOutstandingReceivables,
      });
    }

    if (paidOnReservations > grossCollected) {
      const variance = Math.round((paidOnReservations - grossCollected) * 100) / 100;
      anomalies.push({
        code: 'RESERVATION_PAYMENT_MISMATCH',
        severity: 'HIGH',
        message: `Reservation headers claim ₦${paidOnReservations.toLocaleString()} paid, but transaction ledger records only ₦${grossCollected.toLocaleString()} in positive collections. Unbacked variance: ₦${variance.toLocaleString()}.`,
        affectedMetric: 'grossCollected',
        variance,
      });
    }

    // 3. Operational Expenses
    let expSql = `
      SELECT 
        COUNT(e.id) as expense_count,
        COALESCE(SUM(CASE WHEN e.status = 'APPROVED' THEN e.amount ELSE 0 END), 0) as approved_expenses,
        COALESCE(SUM(CASE WHEN e.status = 'RECORDED' THEN e.amount ELSE 0 END), 0) as pending_expenses,
        COALESCE(SUM(CASE WHEN e.status = 'VOIDED' THEN e.amount ELSE 0 END), 0) as voided_expenses
      FROM expenses e
      WHERE 1=1
    `;
    const expParams = [];
    if (effectivePropertyId && effectivePropertyId !== 'all') {
      expSql += ' AND e.property_id = ?';
      expParams.push(effectivePropertyId);
    }
    if (fromDate) {
      expSql += ' AND e.expense_date >= ?';
      expParams.push(fromDate);
    }
    if (toDate) {
      expSql += ' AND e.expense_date <= ?';
      expParams.push(toDate);
    }

    const [expRows] = await pool.query(expSql, expParams);
    const approvedExpenses = parseFloat(expRows?.approved_expenses || 0);
    const pendingExpenses = parseFloat(expRows?.pending_expenses || 0);
    const voidedExpenses = parseFloat(expRows?.voided_expenses || 0);

    // 4. Expenses by category (Approved only)
    let catSql = `
      SELECT 
        category,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(id) as count
      FROM expenses
      WHERE status = 'APPROVED'
    `;
    const catParams = [];
    if (effectivePropertyId && effectivePropertyId !== 'all') {
      catSql += ' AND property_id = ?';
      catParams.push(effectivePropertyId);
    }
    if (fromDate) {
      catSql += ' AND expense_date >= ?';
      catParams.push(fromDate);
    }
    if (toDate) {
      catSql += ' AND expense_date <= ?';
      catParams.push(toDate);
    }
    catSql += ' GROUP BY category ORDER BY total_amount DESC';
    const categoryBreakdown = await pool.query(catSql, catParams);

    // 5. Net Profit & Profit Margin
    const netProfit = Math.round((netRevenue - approvedExpenses) * 100) / 100;
    const profitMargin = netRevenue > 0 ? Math.round((netProfit / netRevenue) * 10000) / 100 : 0;

    // 6. Monthly Trends (Booked Revenue, Collections, Refunds, Expenses, Profit)
    let mPaySql = `
      SELECT 
        DATE_FORMAT(COALESCE(pt.paid_at, pt.created_at), '%Y-%m') as period,
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL AND pt.amount > 0 AND pt.status IN ('SUCCESS', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN pt.amount ELSE 0 END), 0) as gross_collected,
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL THEN COALESCE(pt.refund_amount, 0) ELSE 0 END), 0) as total_refunded
      FROM payment_transactions pt
      JOIN reservations r ON r.id = pt.reservation_id
      WHERE 1=1
    `;
    const mPayParams = [];
    if (effectivePropertyId && effectivePropertyId !== 'all') {
      mPaySql += ' AND r.property_id = ?';
      mPayParams.push(effectivePropertyId);
    }
    if (fromDate) {
      mPaySql += ' AND DATE(COALESCE(pt.paid_at, pt.created_at)) >= ?';
      mPayParams.push(fromDate);
    }
    if (toDate) {
      mPaySql += ' AND DATE(COALESCE(pt.paid_at, pt.created_at)) <= ?';
      mPayParams.push(toDate);
    }
    mPaySql += ` GROUP BY DATE_FORMAT(COALESCE(pt.paid_at, pt.created_at), '%Y-%m') ORDER BY period ASC`;
    const mPayRows = await pool.query(mPaySql, mPayParams);

    let mResSql = `
      SELECT 
        DATE_FORMAT(r.check_in_date, '%Y-%m') as period,
        COALESCE(SUM(r.total_amount), 0) as booked_revenue
      FROM reservations r
      WHERE r.status NOT IN ('CANCELLED')
    `;
    const mResParams = [];
    if (effectivePropertyId && effectivePropertyId !== 'all') {
      mResSql += ' AND r.property_id = ?';
      mResParams.push(effectivePropertyId);
    }
    if (fromDate) {
      mResSql += ' AND r.check_in_date >= ?';
      mResParams.push(fromDate);
    }
    if (toDate) {
      mResSql += ' AND r.check_in_date <= ?';
      mResParams.push(toDate);
    }
    mResSql += ` GROUP BY DATE_FORMAT(r.check_in_date, '%Y-%m') ORDER BY period ASC`;
    const mResRows = await pool.query(mResSql, mResParams);

    let mExpSql = `
      SELECT 
        DATE_FORMAT(e.expense_date, '%Y-%m') as period,
        COALESCE(SUM(e.amount), 0) as approved_expenses
      FROM expenses e
      WHERE e.status = 'APPROVED'
    `;
    const mExpParams = [];
    if (effectivePropertyId && effectivePropertyId !== 'all') {
      mExpSql += ' AND e.property_id = ?';
      mExpParams.push(effectivePropertyId);
    }
    if (fromDate) {
      mExpSql += ' AND e.expense_date >= ?';
      mExpParams.push(fromDate);
    }
    if (toDate) {
      mExpSql += ' AND e.expense_date <= ?';
      mExpParams.push(toDate);
    }
    mExpSql += ` GROUP BY DATE_FORMAT(e.expense_date, '%Y-%m') ORDER BY period ASC`;
    const mExpRows = await pool.query(mExpSql, mExpParams);

    // Merge distinct periods
    const periodsSet = new Set();
    mPayRows.forEach((r) => r.period && periodsSet.add(r.period));
    mResRows.forEach((r) => r.period && periodsSet.add(r.period));
    mExpRows.forEach((r) => r.period && periodsSet.add(r.period));
    const sortedPeriods = Array.from(periodsSet).sort();

    const payMap = new Map(mPayRows.map((r) => [r.period, r]));
    const resMap = new Map(mResRows.map((r) => [r.period, r]));
    const expMap = new Map(mExpRows.map((r) => [r.period, r]));

    const monthlyTrends = sortedPeriods.map((period) => {
      const p = payMap.get(period) || {};
      const r = resMap.get(period) || {};
      const e = expMap.get(period) || {};
      const gross = parseFloat(p.gross_collected || 0);
      const ref = parseFloat(p.total_refunded || 0);
      const net = Math.max(0, gross - ref);
      const booked = parseFloat(r.booked_revenue || 0);
      const exp = parseFloat(e.approved_expenses || 0);
      const profit = Math.round((net - exp) * 100) / 100;
      return {
        period,
        month: period,
        bookedRevenue: Math.round(booked * 100) / 100,
        grossCollected: Math.round(gross * 100) / 100,
        refunds: Math.round(ref * 100) / 100,
        netCollections: Math.round(net * 100) / 100,
        collections: Math.round(net * 100) / 100,
        approvedExpenses: Math.round(exp * 100) / 100,
        netProfit: profit,
        netRevenue: Math.round(net * 100) / 100,
      };
    });

    // 7. Receivables Breakdown by Property
    let recSql = `
      SELECT 
        p.id as property_id,
        p.name as property_name,
        p.code as property_code,
        COUNT(r.id) as reservation_count,
        COALESCE(SUM(r.total_amount), 0) as total_amount,
        COALESCE(SUM(r.paid_amount), 0) as paid_amount,
        COALESCE(SUM(r.total_amount - r.paid_amount), 0) as outstanding_amount,
        COALESCE(SUM(r.total_amount - r.paid_amount), 0) as outstanding
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      WHERE r.status NOT IN ('CANCELLED') AND r.total_amount > r.paid_amount
    `;
    const recParams = [];
    if (effectivePropertyId && effectivePropertyId !== 'all') {
      recSql += ' AND r.property_id = ?';
      recParams.push(effectivePropertyId);
    }
    if (fromDate) {
      recSql += ' AND r.check_in_date >= ?';
      recParams.push(fromDate);
    }
    if (toDate) {
      recSql += ' AND r.check_in_date <= ?';
      recParams.push(toDate);
    }
    recSql += ' GROUP BY p.id ORDER BY outstanding_amount DESC';
    const receivablesBreakdown = await pool.query(recSql, recParams);

    return {
      kpis: {
        grossCollected: Math.round(grossCollected * 100) / 100,
        totalRefunded: Math.round(totalRefunded * 100) / 100,
        netRevenue: Math.round(netRevenue * 100) / 100,
        rawNetRevenue,
        bookedRevenue: Math.round(bookedRevenue * 100) / 100,
        outstandingReceivables: Math.round(outstandingReceivables * 100) / 100,
        rawOutstandingReceivables,
        pendingPayments: Math.round(pendingPayments * 100) / 100,
        approvedExpenses: Math.round(approvedExpenses * 100) / 100,
        pendingExpenses: Math.round(pendingExpenses * 100) / 100,
        voidedExpenses: Math.round(voidedExpenses * 100) / 100,
        netProfit,
        profitMargin,
        currency: 'NGN',
      },
      categoryBreakdown,
      monthlyTrends,
      receivablesBreakdown,
      filters: {
        propertyId: effectivePropertyId || 'all',
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
      anomalies,
      hasAnomaly: anomalies.length > 0,
      reconciliationStatus: anomalies.length > 0 ? 'ANOMALIES_DETECTED' : 'RECONCILED',
    };
  }

  /**
   * Get Unified Financial Ledger (combined payments and expenses)
   */
  static async getLedger({ propertyId, fromDate, toDate, type, status, page = 1, pageSize = 20, user = null } = {}) {
    let effectivePropertyId = propertyId;
    if (user) {
      const role = (user.role || '').toUpperCase();
      if (['MANAGER', 'STAFF', 'RECEPTIONIST'].includes(role)) {
        if (!user.propertyId) {
          throw new ForbiddenError('Access denied: User is not assigned to any property.');
        }
        if (propertyId && propertyId !== 'all' && parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
          throw new ForbiddenError('Access denied: You do not have authorization for this property.');
        }
        effectivePropertyId = user.propertyId;
      }
    }
    this.validatePropertyScope(user, effectivePropertyId);

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(pageSize, 10));
    const limit = Math.max(1, parseInt(pageSize, 10));

    // Combine payments and expenses using UNION ALL
    let sql = `
      SELECT * FROM (
        SELECT 
          CONCAT('PAY-', pt.id) as ledger_id,
          'REVENUE' as entry_type,
          pt.id as source_id,
          pt.transaction_reference as transaction_code,
          r.property_id,
          p.name as property_name,
          p.code as property_code,
          r.apartment_id,
          a.unit_number,
          DATE(COALESCE(pt.paid_at, pt.created_at)) as entry_date,
          pt.amount as amount,
          COALESCE(pt.refund_amount, 0) as refund_amount,
          (pt.amount - COALESCE(pt.refund_amount, 0)) as net_amount,
          pt.payment_method,
          pt.status,
          COALESCE(pt.provider_reference, pt.payment_method) as description,
          COALESCE(g.display_name, r.tenant_name) as counterparty,
          r.reservation_code as reference_meta,
          pt.created_at
        FROM payment_transactions pt
        JOIN reservations r ON r.id = pt.reservation_id
        JOIN properties p ON p.id = r.property_id
        JOIN apartments a ON a.id = r.apartment_id
        LEFT JOIN guests g ON g.id = r.guest_id
        WHERE pt.parent_transaction_id IS NULL

        UNION ALL

        SELECT 
          CONCAT('EXP-', e.id) as ledger_id,
          'EXPENSE' as entry_type,
          e.id as source_id,
          e.expense_code as transaction_code,
          e.property_id,
          p.name as property_name,
          p.code as property_code,
          e.apartment_id,
          a.unit_number,
          e.expense_date as entry_date,
          e.amount as amount,
          0 as refund_amount,
          (-1 * e.amount) as net_amount,
          e.payment_method,
          e.status,
          CONCAT('[', e.category, '] ', e.description) as description,
          e.vendor_payee as counterparty,
          e.category as reference_meta,
          e.created_at
        FROM expenses e
        JOIN properties p ON e.property_id = p.id
        LEFT JOIN apartments a ON a.id = e.apartment_id
      ) AS ledger
      WHERE 1=1
    `;

    const params = [];

    if (effectivePropertyId && effectivePropertyId !== 'all') {
      sql += ' AND ledger.property_id = ?';
      params.push(effectivePropertyId);
    }
    if (fromDate) {
      sql += ' AND ledger.entry_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND ledger.entry_date <= ?';
      params.push(toDate);
    }
    if (type) {
      sql += ' AND ledger.entry_type = ?';
      params.push(type.toUpperCase());
    }
    if (status) {
      sql += ' AND ledger.status = ?';
      params.push(status.toUpperCase());
    }

    // Count query
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) as sub`;
    const countRows = await pool.query(countSql, params);
    const totalRecords = countRows && countRows[0] ? parseInt(countRows[0].total, 10) : 0;

    sql += ' ORDER BY ledger.entry_date DESC, ledger.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const items = await pool.query(sql, params);

    return {
      items,
      pagination: {
        page: parseInt(page, 10),
        pageSize: limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    };
  }
}

module.exports = FinancialService;
