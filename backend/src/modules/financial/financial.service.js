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
    if (['MANAGER', 'STAFF'].includes(role) && user.propertyId) {
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
    if (user && ['MANAGER', 'STAFF'].includes((user.role || '').toUpperCase()) && user.propertyId) {
      effectivePropertyId = user.propertyId;
    }
    this.validatePropertyScope(user, effectivePropertyId);

    // 1. Gross payments collected (SUCCESS)
    let paySql = `
      SELECT 
        COUNT(pt.id) as payment_count,
        COALESCE(SUM(CASE WHEN pt.status IN ('SUCCESS', 'COMPLETED') THEN pt.amount ELSE 0 END), 0) as gross_collected,
        COALESCE(SUM(CASE WHEN pt.status IN ('SUCCESS', 'COMPLETED') THEN COALESCE(pt.refund_amount, 0) ELSE 0 END), 0) as total_refunded,
        COALESCE(SUM(CASE WHEN pt.status = 'PENDING' THEN pt.amount ELSE 0 END), 0) as pending_amount
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
    const netRevenue = Math.max(0, grossCollected - totalRefunded);
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
    const outstandingReceivables = Math.max(0, bookedRevenue - paidOnReservations);

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

    return {
      kpis: {
        grossCollected: Math.round(grossCollected * 100) / 100,
        totalRefunded: Math.round(totalRefunded * 100) / 100,
        netRevenue: Math.round(netRevenue * 100) / 100,
        bookedRevenue: Math.round(bookedRevenue * 100) / 100,
        outstandingReceivables: Math.round(outstandingReceivables * 100) / 100,
        pendingPayments: Math.round(pendingPayments * 100) / 100,
        approvedExpenses: Math.round(approvedExpenses * 100) / 100,
        pendingExpenses: Math.round(pendingExpenses * 100) / 100,
        voidedExpenses: Math.round(voidedExpenses * 100) / 100,
        netProfit,
        profitMargin,
        currency: 'NGN',
      },
      categoryBreakdown,
      filters: {
        propertyId: effectivePropertyId || 'all',
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
    };
  }

  /**
   * Get Unified Financial Ledger (combined payments and expenses)
   */
  static async getLedger({ propertyId, fromDate, toDate, type, status, page = 1, pageSize = 20, user = null } = {}) {
    let effectivePropertyId = propertyId;
    if (user && ['MANAGER', 'STAFF'].includes((user.role || '').toUpperCase()) && user.propertyId) {
      effectivePropertyId = user.propertyId;
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
        JOIN properties p ON p.id = e.property_id
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
