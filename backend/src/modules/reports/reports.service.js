const pool = require('../../db/pool');
const PDFDocument = require('pdfkit');
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
    const bodyLines = rows.map((row) =>
      headers.map((h) => escapeField(h.getter ? h.getter(row) : row[h.key])).join(',')
    );

    return [headerLine, ...bodyLines].join('\r\n');
  }

  /**
   * Reservations Report Data
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
   * Financial Summary Report Data
   */
  static async getFinancialReport({ propertyId, fromDate, toDate } = {}) {
    const reservations = await this.getReservationsReport({ propertyId, fromDate, toDate });

    const totalRevenue = reservations.reduce((acc, r) => acc + parseFloat(r.total_amount || 0), 0);
    const totalCollected = reservations.reduce((acc, r) => acc + parseFloat(r.paid_amount || 0), 0);
    const totalOutstanding = totalRevenue - totalCollected;

    // Operational expenses: approved expenses + unlinked maintenance costs
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

    // Unlinked maintenance costs (maintenance records not tracked in expenses table)
    let mntSql = `
      SELECT COALESCE(SUM(cost), 0) as total_maintenance 
      FROM maintenance_requests 
      WHERE (id NOT IN (SELECT maintenance_id FROM expenses WHERE maintenance_id IS NOT NULL))
    `;
    const mntParams = [];
    if (propertyId && propertyId !== 'all') {
      mntSql += ' AND property_id = ?';
      mntParams.push(propertyId);
    }
    const [mntRows] = await pool.query(mntSql, mntParams);
    const unlinkedMaintenanceExpenses = parseFloat(mntRows?.total_maintenance || 0);

    const totalExpenses = approvedExpenses + unlinkedMaintenanceExpenses;
    const netProfit = totalCollected - totalExpenses;

    return {
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCollected: Math.round(totalCollected * 100) / 100,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        reservationCount: reservations.length,
      },
      reservations,
    };
  }

  /**
   * Generate Executive Financial PDF Document stream
   */
  static generateFinancialPDF(financialData, propertyName = 'All Properties') {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    const fs = require('fs');
    const hasArial = fs.existsSync('C:/Windows/Fonts/arial.ttf');
    const defaultFont = hasArial ? 'C:/Windows/Fonts/arial.ttf' : 'Helvetica';
    const boldFont = hasArial ? 'C:/Windows/Fonts/arialbd.ttf' : 'Helvetica-Bold';

    // Header styling in Grey and Rust Orange aesthetic
    doc
      .fillColor('#c25e2e')
      .fontSize(22)
      .font(fs.existsSync('C:/Windows/Fonts/arialbd.ttf') ? 'C:/Windows/Fonts/arialbd.ttf' : 'Helvetica-Bold')
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
      .font(fs.existsSync('C:/Windows/Fonts/arialbd.ttf') ? 'C:/Windows/Fonts/arialbd.ttf' : 'Helvetica-Bold')
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
      .font(fs.existsSync('C:/Windows/Fonts/arialbd.ttf') ? 'C:/Windows/Fonts/arialbd.ttf' : 'Helvetica-Bold')
      .text('Authoritative Booking Audit Trail', 50, 240);

    let y = 265;
    doc.rect(50, y, 495, 20).fill('#242830');
    doc
      .fillColor('#ffffff')
      .fontSize(9)
      .font(fs.existsSync('C:/Windows/Fonts/arialbd.ttf') ? 'C:/Windows/Fonts/arialbd.ttf' : 'Helvetica-Bold')
      .text('CODE', 55, y + 5)
      .text('PROPERTY', 140, y + 5)
      .text('TENANT', 240, y + 5)
      .text('CHECK-IN', 350, y + 5)
      .text('AMOUNT (₦)', 420, y + 5)
      .text('STATUS', 495, y + 5);

    y += 20;

    doc.font(defaultFont).fontSize(8);
    financialData.reservations.slice(0, 15).forEach((r, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      doc.rect(50, y, 495, 18).fill(bg);
      doc
        .fillColor('#22262c')
        .text(r.reservation_code, 55, y + 4)
        .text(r.property_name.substring(0, 18), 140, y + 4)
        .text(r.tenant_name.substring(0, 20), 240, y + 4)
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
}

module.exports = ReportsService;
