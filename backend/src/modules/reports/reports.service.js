const pool = require('../../db/pool');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { formatNaira } = require('../../utils/currency');
const { UnauthorizedError, ForbiddenError } = require('../../core/errors/apiError');

class ReportsService {
  /**
   * Convert JSON rows to RFC 4180 compliant CSV string
   */
  static toCSV(headers, rows) {
    const escapeField = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headerLine = headers.map((h) => escapeField(h.label)).join(',');
    const bodyLines = (rows || []).map((row) =>
      headers.map((h) => escapeField(h.getter ? h.getter(row) : row[h.key])).join(',')
    );

    return [headerLine, ...bodyLines].join('\r\n');
  }

  /**
   * Font helper for PDF generation
   */
  static getFonts() {
    const hasArial = fs.existsSync('C:/Windows/Fonts/arial.ttf');
    const hasArialBd = fs.existsSync('C:/Windows/Fonts/arialbd.ttf');
    return {
      defaultFont: hasArial ? 'C:/Windows/Fonts/arial.ttf' : 'Helvetica',
      boldFont: hasArialBd ? 'C:/Windows/Fonts/arialbd.ttf' : 'Helvetica-Bold',
    };
  }

  /**
   * Resolve effective property scope strictly enforcing tenant isolation and fail-closed security.
   * - Company-wide roles (SUPER_ADMIN, OWNER, ADMIN) can query all properties or filter to any single property.
   * - Property-scoped roles (MANAGER, STAFF, RECEPTIONIST) MUST have an assigned propertyId; unassigned fails closed (403).
   * - Query parameters cannot override or bypass assigned property scope for property-scoped roles.
   * - Agent role can optionally filter by property.
   */
  static resolveEffectivePropertyScope(user, requestedPropertyId) {
    if (!user) {
      throw new UnauthorizedError('Authentication is required to access report data.');
    }
    const role = (user.role || '').toUpperCase();

    // 1. Company-wide administrative roles
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      if (requestedPropertyId && requestedPropertyId !== 'all') {
        return parseInt(requestedPropertyId, 10);
      }
      return null; // All properties
    }

    // 2. Property-scoped operational roles
    if (['MANAGER', 'STAFF', 'RECEPTIONIST'].includes(role)) {
      if (!user.propertyId) {
        throw new ForbiddenError('Access denied: User is not assigned to any property.');
      }
      const userPropId = parseInt(user.propertyId, 10);
      if (requestedPropertyId && requestedPropertyId !== 'all') {
        const reqPropId = parseInt(requestedPropertyId, 10);
        if (reqPropId !== userPropId) {
          throw new ForbiddenError('Access denied: You do not have authorization for this property.');
        }
      }
      return userPropId;
    }

    // 3. Agent role
    if (role === 'AGENT') {
      if (requestedPropertyId && requestedPropertyId !== 'all') {
        return parseInt(requestedPropertyId, 10);
      }
      return null;
    }

    throw new ForbiddenError(`Access denied: Role '${role}' is not authorized to access report data.`);
  }

  /**
   * 1. Reservations Report Data
   */
  static async getReservationsReport({ propertyId, fromDate, toDate, user = null, userRole = null, agentId = null } = {}) {
    let effectivePropertyId = null;
    let effectiveAgentId = agentId;
    const role = user ? (user.role || '').toUpperCase() : (userRole || 'ADMIN').toUpperCase();

    if (user) {
      effectivePropertyId = this.resolveEffectivePropertyScope(user, propertyId);
      if (role === 'AGENT') {
        if (!user.agentId) {
          throw new ForbiddenError('Access denied: Agent profile not linked.');
        }
        effectiveAgentId = user.agentId;
      }
    } else if (propertyId && propertyId !== 'all') {
      effectivePropertyId = parseInt(propertyId, 10);
    }

    let sql = `
      SELECT r.*, p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, ag.name as agent_name
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      WHERE 1=1
    `;
    const params = [];

    if (role === 'AGENT') {
      sql += ' AND r.agent_id = ?';
      params.push(effectiveAgentId || 1);
    }
    if (effectivePropertyId) {
      sql += ' AND r.property_id = ?';
      params.push(effectivePropertyId);
    }
    if (fromDate) {
      sql += ' AND r.check_in_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND r.check_in_date <= ?';
      params.push(toDate);
    }

    sql += ' ORDER BY r.check_in_date DESC;';
    return pool.query(sql, params);
  }

  /**
   * 2. Financial Summary Report Data
   * Reconciled with FinancialService.getOverview:
   * - Booked revenue & outstanding receivables calculated strictly on active (non-cancelled) reservations.
   * - Outstanding receivables = Math.max(0, totalBookedRevenue - paidOnReservations).
   * - Cash revenue reflects authoritative transaction ledger (parent non-refunded collections).
   * - Expenses reflect authoritative approved operational disbursements.
   */
  static async getFinancialReport({ propertyId, fromDate, toDate, user = null } = {}) {
    let effectivePropertyId = null;
    if (user) {
      effectivePropertyId = this.resolveEffectivePropertyScope(user, propertyId);
    } else if (propertyId && propertyId !== 'all') {
      effectivePropertyId = parseInt(propertyId, 10);
    }

    const reservations = await this.getReservationsReport({
      propertyId: effectivePropertyId,
      fromDate,
      toDate,
      user,
    });

    // Reconciled definition:
    // Only active reservations (non-cancelled) represent true booked revenue and legitimate receivables
    const activeReservations = reservations.filter((r) => r.status !== 'CANCELLED');
    const totalBookedRevenue = activeReservations.reduce((acc, r) => acc + parseFloat(r.total_amount || 0), 0);
    const paidOnReservations = activeReservations.reduce((acc, r) => acc + parseFloat(r.paid_amount || 0), 0);
    const rawTotalOutstanding = Math.round((totalBookedRevenue - paidOnReservations) * 100) / 100;
    const totalOutstanding = Math.max(0, rawTotalOutstanding);

    // 1. Authoritative transaction ledger revenue
    let paySql = `
      SELECT 
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL AND pt.amount > 0 AND pt.status IN ('SUCCESS', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN pt.amount ELSE 0 END), 0) as gross_collected,
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL THEN COALESCE(pt.refund_amount, 0) ELSE 0 END), 0) as total_refunded
      FROM payment_transactions pt
      JOIN reservations r ON r.id = pt.reservation_id
      WHERE 1=1
    `;
    const payParams = [];
    if (effectivePropertyId) {
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

    // Anomaly Detection: inspect unlinked negative refund rows
    let orphanSql = `
      SELECT COUNT(pt.id) as orphan_count, COALESCE(SUM(pt.amount), 0) as orphan_total
      FROM payment_transactions pt
      JOIN reservations r ON r.id = pt.reservation_id
      WHERE pt.parent_transaction_id IS NULL AND pt.amount < 0
    `;
    const orphanParams = [];
    if (effectivePropertyId) {
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

    if (rawTotalOutstanding < 0) {
      anomalies.push({
        code: 'NEGATIVE_RECEIVABLES',
        severity: 'MEDIUM',
        message: `Computed receivables (₦${rawTotalOutstanding.toLocaleString()}) are negative. Payments recorded on reservations exceed booked total. Display value constrained to ₦0.00.`,
        affectedMetric: 'totalOutstanding',
        rawValue: rawTotalOutstanding,
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

    // 2. Authoritative approved operational expenses
    let expSql = `
      SELECT COALESCE(SUM(amount), 0) as total_expenses 
      FROM expenses 
      WHERE status = 'APPROVED'
    `;
    const expParams = [];
    if (effectivePropertyId) {
      expSql += ' AND property_id = ?';
      expParams.push(effectivePropertyId);
    }
    if (fromDate) {
      expSql += ' AND expense_date >= ?';
      expParams.push(fromDate);
    }
    if (toDate) {
      expSql += ' AND expense_date <= ?';
      expParams.push(toDate);
    }
    const [expRows] = await pool.query(expSql, expParams);
    const approvedExpenses = parseFloat(expRows?.total_expenses || 0);

    const netProfit = Math.round((netRevenue - approvedExpenses) * 100) / 100;
    const profitMargin = netRevenue > 0 ? Math.round((netProfit / netRevenue) * 10000) / 100 : 0;

    // 3. Category breakdown
    let catSql = `
      SELECT 
        category,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(id) as count
      FROM expenses
      WHERE status = 'APPROVED'
    `;
    const catParams = [];
    if (effectivePropertyId) {
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

    // 4. Monthly trends
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
    if (effectivePropertyId) {
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
    if (effectivePropertyId) {
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
    if (effectivePropertyId) {
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

    return {
      summary: {
        totalRevenue: Math.round(totalBookedRevenue * 100) / 100,
        grossCollected: Math.round(grossCollected * 100) / 100,
        totalRefunded: Math.round(totalRefunded * 100) / 100,
        netRevenue: Math.round(netRevenue * 100) / 100,
        rawNetRevenue,
        totalCollected: Math.round(netRevenue * 100) / 100,
        totalOutstanding,
        rawTotalOutstanding,
        totalExpenses: Math.round(approvedExpenses * 100) / 100,
        netProfit,
        profitMargin,
        reservationCount: activeReservations.length,
        totalReservationsCount: reservations.length,
      },
      reservations,
      categoryBreakdown,
      monthlyTrends,
      anomalies,
      hasAnomaly: anomalies.length > 0,
      reconciliationStatus: anomalies.length > 0 ? 'ANOMALIES_DETECTED' : 'RECONCILED',
    };
  }

  /**
   * 3. Payment Transactions Report Data
   */
  static async getPaymentsReport({ propertyId, fromDate, toDate, status, user = null } = {}) {
    let effectivePropertyId = null;
    if (user) {
      effectivePropertyId = this.resolveEffectivePropertyScope(user, propertyId);
    } else if (propertyId && propertyId !== 'all') {
      effectivePropertyId = parseInt(propertyId, 10);
    }

    let sql = `
      SELECT 
        pt.id,
        pt.transaction_reference,
        pt.amount,
        pt.currency,
        pt.payment_method,
        pt.status,
        pt.paid_at,
        pt.refund_amount,
        pt.refund_reason,
        r.reservation_code,
        r.tenant_name,
        p.name AS property_name
      FROM payment_transactions pt
      JOIN reservations r ON pt.reservation_id = r.id
      JOIN properties p ON r.property_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (effectivePropertyId) {
      sql += ' AND r.property_id = ?';
      params.push(effectivePropertyId);
    }
    if (status) {
      sql += ' AND pt.status = ?';
      params.push(status);
    }
    if (fromDate) {
      sql += ' AND DATE(pt.paid_at) >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND DATE(pt.paid_at) <= ?';
      params.push(toDate);
    }

    sql += ' ORDER BY pt.paid_at DESC';
    return pool.query(sql, params);
  }

  /**
   * 4. Expenses Report Data
   */
  static async getExpensesReport({ propertyId, category, status, fromDate, toDate, user = null } = {}) {
    let effectivePropertyId = null;
    if (user) {
      effectivePropertyId = this.resolveEffectivePropertyScope(user, propertyId);
    } else if (propertyId && propertyId !== 'all') {
      effectivePropertyId = parseInt(propertyId, 10);
    }

    let sql = `
      SELECT 
        e.id,
        e.expense_code,
        e.category,
        e.amount,
        e.currency,
        e.description,
        e.vendor_payee,
        e.payment_method,
        e.status,
        e.expense_date,
        p.name AS property_name,
        u_rec.name AS recorded_by_name,
        u_app.name AS approved_by_name
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      LEFT JOIN users u_rec ON e.created_by_id = u_rec.id
      LEFT JOIN users u_app ON e.approved_by_id = u_app.id
      WHERE 1=1
    `;
    const params = [];

    if (effectivePropertyId) {
      sql += ' AND e.property_id = ?';
      params.push(effectivePropertyId);
    }
    if (category) {
      sql += ' AND e.category = ?';
      params.push(category);
    }
    if (status) {
      sql += ' AND e.status = ?';
      params.push(status);
    }
    if (fromDate) {
      sql += ' AND e.expense_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND e.expense_date <= ?';
      params.push(toDate);
    }

    sql += ' ORDER BY e.expense_date DESC';
    return pool.query(sql, params);
  }

  /**
   * 5. Agents Directory & Performance Report Data
   */
  static async getAgentsReport({ propertyId, status, user = null } = {}) {
    let effectivePropertyId = null;
    if (user) {
      effectivePropertyId = this.resolveEffectivePropertyScope(user, propertyId);
    } else if (propertyId && propertyId !== 'all') {
      effectivePropertyId = parseInt(propertyId, 10);
    }

    let sql = `
      SELECT 
        a.id,
        a.name,
        a.agency_name,
        a.email,
        a.phone,
        a.commission_rate,
        a.commission_type,
        a.status,
        a.bank_name,
        a.account_number,
        a.account_name,
        p.name AS property_name,
        COALESCE(r_stats.total_bookings, 0) AS total_bookings,
        COALESCE(r_stats.total_volume, 0.00) AS total_volume,
        COALESCE(c_stats.total_commission, 0.00) AS total_commission
      FROM agents a
      LEFT JOIN properties p ON a.property_id = p.id
      LEFT JOIN (
        SELECT agent_id, COUNT(id) AS total_bookings, SUM(total_amount) AS total_volume
        FROM reservations WHERE agent_id IS NOT NULL AND status != 'CANCELLED'
        GROUP BY agent_id
      ) r_stats ON r_stats.agent_id = a.id
      LEFT JOIN (
        SELECT agent_id, SUM(commission_amount) AS total_commission
        FROM commissions WHERE status = 'PAID'
        GROUP BY agent_id
      ) c_stats ON c_stats.agent_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (effectivePropertyId) {
      sql += ' AND a.property_id = ?';
      params.push(effectivePropertyId);
    }
    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY a.name ASC';
    return pool.query(sql, params);
  }

  /**
   * 6. Commissions Ledger Report Data
   */
  static async getCommissionsReport({ agentId, propertyId, status, fromDate, toDate, user = null } = {}) {
    let effectivePropertyId = null;
    let effectiveAgentId = agentId;

    if (user) {
      effectivePropertyId = this.resolveEffectivePropertyScope(user, propertyId);
      const role = (user.role || '').toUpperCase();
      if (role === 'AGENT') {
        if (!user.agentId) {
          throw new ForbiddenError('Access denied: Agent profile not linked.');
        }
        if (agentId && parseInt(agentId, 10) !== parseInt(user.agentId, 10)) {
          throw new ForbiddenError('Access denied: You cannot view commissions for other agents.');
        }
        effectiveAgentId = user.agentId;
      }
    } else if (propertyId && propertyId !== 'all') {
      effectivePropertyId = parseInt(propertyId, 10);
    }

    let sql = `
      SELECT 
        c.id,
        c.commission_code,
        c.booking_amount,
        c.commission_rate,
        c.commission_type,
        c.commission_amount,
        c.currency,
        c.status,
        c.payment_reference,
        c.payment_method,
        c.paid_at,
        c.created_at,
        a.name AS agent_name,
        a.agency_name,
        r.reservation_code,
        p.name AS property_name
      FROM commissions c
      JOIN agents a ON c.agent_id = a.id
      JOIN reservations r ON c.reservation_id = r.id
      JOIN properties p ON c.property_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (effectiveAgentId) {
      sql += ' AND c.agent_id = ?';
      params.push(effectiveAgentId);
    }
    if (effectivePropertyId) {
      sql += ' AND c.property_id = ?';
      params.push(effectivePropertyId);
    }
    if (status) {
      sql += ' AND c.status = ?';
      params.push(status);
    }
    if (fromDate) {
      sql += ' AND DATE(c.created_at) >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND DATE(c.created_at) <= ?';
      params.push(toDate);
    }

    sql += ' ORDER BY c.created_at DESC';
    return pool.query(sql, params);
  }

  /**
   * 7. Maintenance Log Report Data
   */
  static async getMaintenanceReport({ propertyId, status, priority, category, fromDate, toDate, user = null } = {}) {
    let effectivePropertyId = null;
    if (user) {
      effectivePropertyId = this.resolveEffectivePropertyScope(user, propertyId);
    } else if (propertyId && propertyId !== 'all') {
      effectivePropertyId = parseInt(propertyId, 10);
    }

    let sql = `
      SELECT 
        m.id,
        m.issue_code,
        m.issue_title,
        m.category,
        m.priority,
        m.status,
        m.estimated_cost,
        m.actual_cost,
        m.blocking_unit,
        m.assigned_to,
        m.created_at,
        m.resolved_at,
        p.name AS property_name,
        a.unit_number
      FROM maintenance_requests m
      JOIN properties p ON m.property_id = p.id
      LEFT JOIN apartments a ON m.apartment_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (effectivePropertyId) {
      sql += ' AND m.property_id = ?';
      params.push(effectivePropertyId);
    }
    if (status) {
      sql += ' AND m.status = ?';
      params.push(status);
    }
    if (priority) {
      sql += ' AND m.priority = ?';
      params.push(priority);
    }
    if (category) {
      sql += ' AND m.category = ?';
      params.push(category);
    }
    if (fromDate) {
      sql += ' AND DATE(m.created_at) >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND DATE(m.created_at) <= ?';
      params.push(toDate);
    }

    sql += ' ORDER BY m.created_at DESC';
    return pool.query(sql, params);
  }

  /**
   * 8. Unit Inspections Report Data
   */
  static async getInspectionsReport({ propertyId, status, type, fromDate, toDate, user = null } = {}) {
    let effectivePropertyId = null;
    if (user) {
      effectivePropertyId = this.resolveEffectivePropertyScope(user, propertyId);
    } else if (propertyId && propertyId !== 'all') {
      effectivePropertyId = parseInt(propertyId, 10);
    }

    let sql = `
      SELECT 
        i.id,
        i.inspection_code,
        i.inspection_type,
        i.condition_rating,
        i.status,
        i.inspector_name,
        i.created_at,
        p.name AS property_name,
        a.unit_number
      FROM inspections i
      JOIN properties p ON i.property_id = p.id
      JOIN apartments a ON i.apartment_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (effectivePropertyId) {
      sql += ' AND i.property_id = ?';
      params.push(effectivePropertyId);
    }
    if (status) {
      sql += ' AND i.status = ?';
      params.push(status);
    }
    if (type) {
      sql += ' AND i.inspection_type = ?';
      params.push(type);
    }
    if (fromDate) {
      sql += ' AND DATE(i.created_at) >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND DATE(i.created_at) <= ?';
      params.push(toDate);
    }

    sql += ' ORDER BY i.created_at DESC';
    return pool.query(sql, params);
  }

  /**
   * Generate Executive Financial PDF Document stream
   */
  static generateFinancialPDF(financialData, propertyName = 'All Properties') {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const { defaultFont, boldFont } = this.getFonts();

    // Header styling
    doc
      .fillColor('#c25e2e')
      .fontSize(22)
      .font(boldFont)
      .text('BFA APARTMENTS MANAGEMENT SYSTEM', 50, 50);

    doc
      .fillColor('#555f6b')
      .fontSize(10)
      .font(defaultFont)
      .text(`Executive Financial Summary Report • Scoped: ${propertyName}`, 50, 78)
      .text(`Generated: ${new Date().toISOString()}`, 50, 92);

    doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#c25e2e').lineWidth(2).stroke();

    // Summary Box
    doc.rect(50, 125, 495, 90).fillAndStroke('#f4f5f7', '#d0d5dd');

    const s = financialData.summary;
    doc
      .fillColor('#1a1d21')
      .fontSize(11)
      .font(boldFont)
      .text('KEY FINANCIAL METRICS (NGN / ₦)', 65, 140);

    doc
      .font(defaultFont)
      .fontSize(10)
      .fillColor('#333942')
      .text(`Total Booked Value: ${formatNaira(s.totalRevenue)}`, 65, 160)
      .text(`Total Collected: ${formatNaira(s.totalCollected)}`, 65, 175)
      .text(`Total Outstanding: ${formatNaira(s.totalOutstanding)}`, 65, 190)
      .text(`Operational Expenses: ${formatNaira(s.totalExpenses)}`, 280, 160)
      .text(`Net Operating Profit: ${formatNaira(s.netProfit)}`, 280, 175)
      .text(`Total Stays (1 Night Policy): ${s.reservationCount}`, 280, 190);

    // Reservations Detail Table Header
    doc
      .fillColor('#1a1d21')
      .fontSize(12)
      .font(boldFont)
      .text('Authoritative Booking Audit Trail', 50, 240);

    let y = 265;
    doc.rect(50, y, 495, 20).fill('#242830');
    doc
      .fillColor('#ffffff')
      .fontSize(9)
      .font(boldFont)
      .text('CODE', 55, y + 5)
      .text('PROPERTY', 140, y + 5)
      .text('TENANT', 240, y + 5)
      .text('CHECK-IN', 350, y + 5)
      .text('AMOUNT (₦)', 420, y + 5)
      .text('STATUS', 495, y + 5);

    y += 20;

    doc.font(defaultFont).fontSize(8);
    (financialData.reservations || []).slice(0, 20).forEach((r, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      doc.rect(50, y, 495, 18).fill(bg);
      doc
        .fillColor('#22262c')
        .text(r.reservation_code, 55, y + 4)
        .text((r.property_name || '').substring(0, 18), 140, y + 4)
        .text((r.tenant_name || '').substring(0, 20), 240, y + 4)
        .text(r.check_in_date, 350, y + 4)
        .text(formatNaira(r.total_amount), 420, y + 4)
        .text(r.status, 495, y + 4);

      y += 18;
    });

    // Footer
    doc
      .fontSize(8)
      .fillColor('#8c96a3')
      .text(
        'BFA Property Management Platform • Non-Negotiable 1-Night Reservation Standard Applied',
        50,
        780,
        { align: 'center', width: 495 }
      );

    doc.end();
    return doc;
  }

  /**
   * Generate Commissions Statement PDF
   */
  static generateCommissionsPDF(commissions, filterName = 'All Agents') {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const { defaultFont, boldFont } = this.getFonts();

    doc
      .fillColor('#c25e2e')
      .fontSize(22)
      .font(boldFont)
      .text('BFA APARTMENTS MANAGEMENT SYSTEM', 50, 50);

    doc
      .fillColor('#555f6b')
      .fontSize(10)
      .font(defaultFont)
      .text(`Agent Commissions Statement • ${filterName}`, 50, 78)
      .text(`Generated: ${new Date().toISOString()}`, 50, 92);

    doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#c25e2e').lineWidth(2).stroke();

    const totalCommissions = commissions.reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0);
    const paidCommissions = commissions.filter(c => c.status === 'PAID').reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0);
    const pendingCommissions = commissions.filter(c => ['PENDING', 'CALCULATED', 'APPROVED'].includes(c.status)).reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0);

    // Summary box
    doc.rect(50, 125, 495, 60).fillAndStroke('#f4f5f7', '#d0d5dd');
    doc.fillColor('#1a1d21').fontSize(10).font(boldFont).text('COMMISSION SUMMARY', 65, 135);
    doc.font(defaultFont).fontSize(9).fillColor('#333942')
      .text(`Total Generated: ${formatNaira(totalCommissions)}`, 65, 155)
      .text(`Paid: ${formatNaira(paidCommissions)}`, 230, 155)
      .text(`Pending / Approved: ${formatNaira(pendingCommissions)}`, 380, 155);

    let y = 205;
    doc.rect(50, y, 495, 20).fill('#242830');
    doc.fillColor('#ffffff').fontSize(9).font(boldFont)
      .text('CODE', 55, y + 5)
      .text('AGENT', 140, y + 5)
      .text('RESERVATION', 250, y + 5)
      .text('RATE', 350, y + 5)
      .text('COMMISSION (₦)', 410, y + 5)
      .text('STATUS', 495, y + 5);

    y += 20;
    doc.font(defaultFont).fontSize(8);
    (commissions || []).slice(0, 22).forEach((c, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      doc.rect(50, y, 495, 18).fill(bg);
      doc.fillColor('#22262c')
        .text(c.commission_code, 55, y + 4)
        .text((c.agent_name || '').substring(0, 18), 140, y + 4)
        .text(c.reservation_code || '', 250, y + 4)
        .text(`${c.commission_rate}${c.commission_type === 'PERCENTAGE' ? '%' : ''}`, 350, y + 4)
        .text(formatNaira(c.commission_amount), 410, y + 4)
        .text(c.status, 495, y + 4);
      y += 18;
    });

    doc.end();
    return doc;
  }
}

module.exports = ReportsService;
