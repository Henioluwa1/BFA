const pool = require('../../db/pool');

class ExpensesRepository {
  /**
   * Find expenses with filtering and pagination
   */
  static async findAll({
    propertyId,
    apartmentId,
    category,
    status,
    fromDate,
    toDate,
    search,
    page = 1,
    pageSize = 50,
    user,
  } = {}) {
    let sql = `
      SELECT e.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name,
             cb.name as created_by_name,
             ab.name as approved_by_name,
             vb.name as voided_by_name,
             m.issue_code as maintenance_code
      FROM expenses e
      JOIN properties p ON p.id = e.property_id
      LEFT JOIN apartments a ON a.id = e.apartment_id
      LEFT JOIN users cb ON cb.id = e.created_by_id
      LEFT JOIN users ab ON ab.id = e.approved_by_id
      LEFT JOIN users vb ON vb.id = e.voided_by_id
      LEFT JOIN maintenance_requests m ON m.id = e.maintenance_id
      WHERE 1=1
    `;
    const params = [];

    // Property scoping
    if (user?.role === 'MANAGER' && user.propertyId) {
      sql += ' AND e.property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND e.property_id = ?';
      params.push(propertyId);
    }

    if (apartmentId) {
      sql += ' AND e.apartment_id = ?';
      params.push(apartmentId);
    }

    if (category && category !== 'ALL') {
      sql += ' AND e.category = ?';
      params.push(category);
    }

    if (status && status !== 'ALL') {
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

    if (search && search.trim()) {
      sql += ` AND (
        e.expense_code LIKE ? OR
        e.description LIKE ? OR
        e.vendor_payee LIKE ? OR
        p.name LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY e.expense_date DESC, e.id DESC';

    if (page && pageSize) {
      const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
      const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    return pool.query(sql, params);
  }

  /**
   * Find single expense record by ID
   */
  static async findById(id) {
    const sql = `
      SELECT e.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name,
             cb.name as created_by_name,
             ab.name as approved_by_name,
             vb.name as voided_by_name,
             m.issue_code as maintenance_code
      FROM expenses e
      JOIN properties p ON p.id = e.property_id
      LEFT JOIN apartments a ON a.id = e.apartment_id
      LEFT JOIN users cb ON cb.id = e.created_by_id
      LEFT JOIN users ab ON ab.id = e.approved_by_id
      LEFT JOIN users vb ON vb.id = e.voided_by_id
      LEFT JOIN maintenance_requests m ON m.id = e.maintenance_id
      WHERE e.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Create new expense
   */
  static async create(data) {
    const sql = `
      INSERT INTO expenses
      (expense_code, property_id, apartment_id, maintenance_id, category, description, amount, currency, expense_date, vendor_payee, payment_method, status, created_by_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.expense_code,
      data.property_id,
      data.apartment_id || null,
      data.maintenance_id || null,
      data.category || 'MAINTENANCE',
      data.description,
      data.amount,
      data.currency || 'NGN',
      data.expense_date,
      data.vendor_payee || null,
      data.payment_method || 'BANK_TRANSFER',
      data.status || 'RECORDED',
      data.created_by_id || null,
      data.notes || null,
    ];
    const result = await pool.query(sql, params);
    return result.insertId;
  }

  /**
   * Update expense
   */
  static async update(id, data) {
    const fields = [];
    const params = [];

    const allowed = [
      'category',
      'description',
      'amount',
      'currency',
      'expense_date',
      'vendor_payee',
      'payment_method',
      'status',
      'approved_by_id',
      'approved_at',
      'voided_by_id',
      'voided_at',
      'void_reason',
      'notes',
    ];

    for (const [k, v] of Object.entries(data)) {
      if (allowed.includes(k)) {
        fields.push(`${k} = ?`);
        params.push(v);
      }
    }

    if (fields.length === 0) return false;
    params.push(id);

    const sql = `UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`;
    const result = await pool.query(sql, params);
    return result.affectedRows > 0;
  }

  /**
   * Get expense metrics & summaries
   */
  static async getStats({ propertyId, fromDate, toDate, user } = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (user?.role === 'MANAGER' && user.propertyId) {
      whereClause += ' AND property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      whereClause += ' AND property_id = ?';
      params.push(propertyId);
    }

    if (fromDate) {
      whereClause += ' AND expense_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      whereClause += ' AND expense_date <= ?';
      params.push(toDate);
    }

    const [sums] = await pool.query(
      `SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN status != 'VOIDED' THEN amount ELSE 0 END) as total_active_amount,
        SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END) as approved_amount,
        SUM(CASE WHEN status = 'RECORDED' THEN amount ELSE 0 END) as pending_approval_amount,
        SUM(CASE WHEN status = 'VOIDED' THEN amount ELSE 0 END) as voided_amount,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'RECORDED' THEN 1 ELSE 0 END) as pending_approval_count,
        SUM(CASE WHEN status = 'VOIDED' THEN 1 ELSE 0 END) as voided_count
       FROM expenses ${whereClause}`,
      params
    );

    const categoryBreakdown = await pool.query(
      `SELECT category, COUNT(*) as count,
              SUM(CASE WHEN status != 'VOIDED' THEN amount ELSE 0 END) as total_amount
       FROM expenses ${whereClause}
       GROUP BY category ORDER BY total_amount DESC`,
      params
    );

    const propertyBreakdown = await pool.query(
      `SELECT e.property_id, p.name as property_name, COUNT(*) as count,
              SUM(CASE WHEN e.status != 'VOIDED' THEN e.amount ELSE 0 END) as total_amount
       FROM expenses e
       JOIN properties p ON p.id = e.property_id
       ${whereClause}
       GROUP BY e.property_id, p.name ORDER BY total_amount DESC`,
      params
    );

    return {
      overview: {
        totalCount: parseInt(sums?.total_count || 0, 10),
        totalActiveAmount: parseFloat(sums?.total_active_amount || 0),
        approvedAmount: parseFloat(sums?.approved_amount || 0),
        pendingApprovalAmount: parseFloat(sums?.pending_approval_amount || 0),
        voidedAmount: parseFloat(sums?.voided_amount || 0),
        approvedCount: parseInt(sums?.approved_count || 0, 10),
        pendingApprovalCount: parseInt(sums?.pending_approval_count || 0, 10),
        voidedCount: parseInt(sums?.voided_count || 0, 10),
      },
      byCategory: categoryBreakdown,
      byProperty: propertyBreakdown,
    };
  }
}

module.exports = ExpensesRepository;
