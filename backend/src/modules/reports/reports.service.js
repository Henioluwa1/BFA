const pool = require('../../db/pool');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { formatNaira } = require('../../utils/currency');

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
   * 1. Reservations Report Data
   */
  static async getReservationsReport({ propertyId, fromDate, toDate, userRole = 'ADMIN', agentId = null } = {}) {
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

    if (userRole === 'AGENT') {
      sql += ' AND r.agent_id = ?';
      params.push(agentId || 1);
    }
    if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
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
   */
  static async getFinancialReport({ propertyId, fromDate, toDate } = {}) {
    const reservations = await this.getReservationsReport({ propertyId, fromDate, toDate });
    const totalBookedRevenue = reservations.reduce((acc, r) => acc + parseFloat(r.total_amount || 0), 0);

    // 1. Authoritative transaction ledger revenue
    let paySql = `
      SELECT 
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL AND pt.status IN ('SUCCESS', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN pt.amount ELSE 0 END), 0) as gross_collected,
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL THEN COALESCE(pt.refund_amount, 0) ELSE 0 END), 0) as total_refunded
      FROM payment_transactions pt
      JOIN reservations r ON r.id = pt.reservation_id
      WHERE 1=1
    `;
    const payParams = [];
    if (propertyId && propertyId !== 'all') {
      paySql += ' AND r.property_id = ?';
      payParams.push(propertyId);
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

    // 2. Authoritative approved operational expenses
    let expSql = `
      SELECT COALESCE(SUM(amount), 0) as total_expenses 
      FROM expenses 
      WHERE status = 'APPROVED'
    `;
    const expParams = [];
    if (propertyId && propertyId !== 'all') {
      expSql += ' AND property_id = ?';
      expParams.push(propertyId);
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
    const totalOutstanding = Math.max(0, totalBookedRevenue - netRevenue);

    return {
      summary: {
        totalRevenue: Math.round(totalBookedRevenue * 100) / 100,
        grossCollected: Math.round(grossCollected * 100) / 100,
        totalRefunded: Math.round(totalRefunded * 100) / 100,
        netRevenue: Math.round(netRevenue * 100) / 100,
        totalCollected: Math.round(netRevenue * 100) / 100,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        totalExpenses: Math.round(approvedExpenses * 100) / 100,
        netProfit,
        profitMargin,
        reservationCount: reservations.length,
      },
      reservations,
    };
  }

  /**
   * 3. Payment Transactions Report Data
   */
  static async getPaymentsReport({ propertyId, fromDate, toDate, status } = {}) {
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

    if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
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
  static async getExpensesReport({ propertyId, category, status, fromDate, toDate } = {}) {
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

    if (propertyId && propertyId !== 'all') {
      sql += ' AND e.property_id = ?';
      params.push(propertyId);
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
  static async getAgentsReport({ propertyId, status } = {}) {
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

    if (propertyId && propertyId !== 'all') {
      sql += ' AND a.property_id = ?';
      params.push(propertyId);
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
  static async getCommissionsReport({ agentId, propertyId, status, fromDate, toDate } = {}) {
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

    if (agentId) {
      sql += ' AND c.agent_id = ?';
      params.push(agentId);
    }
    if (propertyId && propertyId !== 'all') {
      sql += ' AND c.property_id = ?';
      params.push(propertyId);
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
  static async getMaintenanceReport({ propertyId, status, priority, category, fromDate, toDate } = {}) {
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

    if (propertyId && propertyId !== 'all') {
      sql += ' AND m.property_id = ?';
      params.push(propertyId);
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
  static async getInspectionsReport({ propertyId, status, type, fromDate, toDate } = {}) {
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

    if (propertyId && propertyId !== 'all') {
      sql += ' AND i.property_id = ?';
      params.push(propertyId);
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
