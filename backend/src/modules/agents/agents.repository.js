const pool = require('../../db/pool');

class AgentsRepository {
  /**
   * Find all agents with filtering and aggregated stats
   */
  static async findAll({ search, status, propertyId, user, page = 1, pageSize = 50 } = {}) {
    let sql = `
      SELECT 
        a.id,
        a.name,
        a.agency_name,
        a.email,
        a.phone,
        a.commission_rate,
        a.commission_type,
        a.property_id,
        a.bank_name,
        a.account_number,
        a.account_name,
        a.notes,
        a.status,
        a.created_at,
        a.updated_at,
        p.name AS property_name,
        COALESCE(res_stats.total_reservations, 0) AS total_reservations,
        COALESCE(res_stats.active_reservations, 0) AS active_reservations,
        COALESCE(res_stats.total_booking_volume, 0.00) AS total_booking_volume,
        COALESCE(com_stats.total_commission_earned, 0.00) AS total_commission_earned,
        COALESCE(com_stats.pending_commission, 0.00) AS pending_commission,
        COALESCE(com_stats.paid_commission, 0.00) AS paid_commission
      FROM agents a
      LEFT JOIN properties p ON a.property_id = p.id
      LEFT JOIN (
        SELECT 
          agent_id,
          COUNT(id) AS total_reservations,
          SUM(CASE WHEN status IN ('CONFIRMED', 'CHECKED_IN') THEN 1 ELSE 0 END) AS active_reservations,
          SUM(CASE WHEN status != 'CANCELLED' THEN total_amount ELSE 0 END) AS total_booking_volume
        FROM reservations
        WHERE agent_id IS NOT NULL
        GROUP BY agent_id
      ) res_stats ON res_stats.agent_id = a.id
      LEFT JOIN (
        SELECT 
          agent_id,
          SUM(CASE WHEN status IN ('APPROVED', 'PAID') THEN commission_amount ELSE 0 END) AS total_commission_earned,
          SUM(CASE WHEN status IN ('PENDING', 'CALCULATED') THEN commission_amount ELSE 0 END) AS pending_commission,
          SUM(CASE WHEN status = 'PAID' THEN commission_amount ELSE 0 END) AS paid_commission
        FROM commissions
        GROUP BY agent_id
      ) com_stats ON com_stats.agent_id = a.id
      WHERE 1=1
    `;

    const params = [];

    // Role isolation: if agent, only see self
    if (user && user.role === 'AGENT') {
      sql += ' AND a.id = ?';
      params.push(user.agentId);
    } else if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      // Property scoping
      sql += ' AND (a.property_id = ? OR a.property_id IS NULL)';
      params.push(user.propertyId);
    }

    if (propertyId) {
      sql += ' AND a.property_id = ?';
      params.push(propertyId);
    }

    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (a.name LIKE ? OR a.agency_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    // Total count query
    const countSql = `SELECT COUNT(*) AS count FROM (${sql}) AS count_query`;
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult[0]?.count || 0, 10);

    // Pagination
    sql += ' ORDER BY a.name ASC';
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedPageSize = Math.max(1, parseInt(pageSize, 10) || 50);
    const offset = (parsedPage - 1) * parsedPageSize;

    sql += ' LIMIT ? OFFSET ?';
    params.push(parsedPageSize, offset);

    const rows = await pool.query(sql, params);

    return {
      agents: rows,
      pagination: {
        page: parsedPage,
        pageSize: parsedPageSize,
        total,
        totalPages: Math.ceil(total / parsedPageSize) || 1,
      },
    };
  }

  /**
   * Find agent by ID with aggregated details
   */
  static async findById(id) {
    const sql = `
      SELECT 
        a.id,
        a.name,
        a.agency_name,
        a.email,
        a.phone,
        a.commission_rate,
        a.commission_type,
        a.property_id,
        a.bank_name,
        a.account_number,
        a.account_name,
        a.notes,
        a.status,
        a.created_at,
        a.updated_at,
        p.name AS property_name,
        COALESCE(res_stats.total_reservations, 0) AS total_reservations,
        COALESCE(res_stats.active_reservations, 0) AS active_reservations,
        COALESCE(res_stats.total_booking_volume, 0.00) AS total_booking_volume,
        COALESCE(com_stats.total_commission_earned, 0.00) AS total_commission_earned,
        COALESCE(com_stats.pending_commission, 0.00) AS pending_commission,
        COALESCE(com_stats.paid_commission, 0.00) AS paid_commission
      FROM agents a
      LEFT JOIN properties p ON a.property_id = p.id
      LEFT JOIN (
        SELECT 
          agent_id,
          COUNT(id) AS total_reservations,
          SUM(CASE WHEN status IN ('CONFIRMED', 'CHECKED_IN') THEN 1 ELSE 0 END) AS active_reservations,
          SUM(CASE WHEN status != 'CANCELLED' THEN total_amount ELSE 0 END) AS total_booking_volume
        FROM reservations
        WHERE agent_id = ?
        GROUP BY agent_id
      ) res_stats ON res_stats.agent_id = a.id
      LEFT JOIN (
        SELECT 
          agent_id,
          SUM(CASE WHEN status IN ('APPROVED', 'PAID') THEN commission_amount ELSE 0 END) AS total_commission_earned,
          SUM(CASE WHEN status IN ('PENDING', 'CALCULATED') THEN commission_amount ELSE 0 END) AS pending_commission,
          SUM(CASE WHEN status = 'PAID' THEN commission_amount ELSE 0 END) AS paid_commission
        FROM commissions
        WHERE agent_id = ?
        GROUP BY agent_id
      ) com_stats ON com_stats.agent_id = a.id
      WHERE a.id = ?
    `;

    const rows = await pool.query(sql, [id, id, id]);
    return rows[0] || null;
  }

  /**
   * Find agent by email
   */
  static async findByEmail(email) {
    const rows = await pool.query('SELECT * FROM agents WHERE email = ?', [email]);
    return rows[0] || null;
  }

  /**
   * Create new agent
   */
  static async create(data) {
    const sql = `
      INSERT INTO agents (
        name, agency_name, email, phone, commission_rate, commission_type,
        property_id, bank_name, account_number, account_name, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      data.name,
      data.agency_name || null,
      data.email,
      data.phone,
      data.commission_rate || 10.00,
      data.commission_type || 'PERCENTAGE',
      data.property_id || null,
      data.bank_name || null,
      data.account_number || null,
      data.account_name || null,
      data.notes || null,
      data.status || 'ACTIVE',
    ];

    const result = await pool.query(sql, params);
    return result.insertId;
  }

  /**
   * Update agent details
   */
  static async update(id, data) {
    const fields = [];
    const params = [];

    const allowed = [
      'name', 'agency_name', 'email', 'phone', 'commission_rate',
      'commission_type', 'property_id', 'bank_name', 'account_number',
      'account_name', 'notes', 'status'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return;

    params.push(id);
    const sql = `UPDATE agents SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(sql, params);
  }

  /**
   * Get distinct clients referred by agent
   */
  static async getClients(agentId) {
    const sql = `
      SELECT 
        COALESCE(g.id, 0) AS guest_id,
        COALESCE(g.display_name, r.tenant_name) AS client_name,
        COALESCE(g.email, r.tenant_email) AS email,
        COALESCE(g.phone, r.tenant_phone) AS phone,
        COUNT(r.id) AS total_bookings,
        SUM(CASE WHEN r.status != 'CANCELLED' THEN r.total_amount ELSE 0 END) AS total_spent,
        MAX(r.check_in_date) AS last_booking_date
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      WHERE r.agent_id = ?
      GROUP BY guest_id, client_name, email, phone
      ORDER BY last_booking_date DESC
    `;

    return pool.query(sql, [agentId]);
  }

  /**
   * Get agent detailed performance analytics
   */
  static async getPerformance(agentId) {
    const sql = `
      SELECT 
        COUNT(r.id) AS total_bookings,
        SUM(CASE WHEN r.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_stays,
        SUM(CASE WHEN r.status IN ('CONFIRMED', 'CHECKED_IN') THEN 1 ELSE 0 END) AS active_stays,
        SUM(CASE WHEN r.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_stays,
        COALESCE(SUM(CASE WHEN r.status != 'CANCELLED' THEN r.total_amount ELSE 0 END), 0.00) AS total_booking_volume,
        COALESCE(AVG(CASE WHEN r.status != 'CANCELLED' THEN r.total_amount ELSE NULL END), 0.00) AS average_booking_value,
        COALESCE(SUM(c.commission_amount), 0.00) AS total_commission_generated,
        COALESCE(SUM(CASE WHEN c.status = 'PAID' THEN c.commission_amount ELSE 0 END), 0.00) AS total_commission_paid,
        COALESCE(SUM(CASE WHEN c.status IN ('PENDING', 'CALCULATED') THEN c.commission_amount ELSE 0 END), 0.00) AS pending_commission,
        COALESCE(SUM(CASE WHEN c.status = 'APPROVED' THEN c.commission_amount ELSE 0 END), 0.00) AS approved_unpaid_commission
      FROM reservations r
      LEFT JOIN commissions c ON c.reservation_id = r.id AND c.agent_id = r.agent_id
      WHERE r.agent_id = ?
    `;

    const summaryRows = await pool.query(sql, [agentId]);
    const summary = summaryRows[0] || {};

    const total = parseInt(summary.total_bookings || 0, 10);
    const cancelled = parseInt(summary.cancelled_stays || 0, 10);
    summary.cancellation_rate = total > 0 ? Number(((cancelled / total) * 100).toFixed(2)) : 0;

    // Monthly breakdown (last 6 months)
    const monthlySql = `
      SELECT 
        DATE_FORMAT(r.created_at, '%Y-%m') AS month,
        COUNT(r.id) AS booking_count,
        COALESCE(SUM(CASE WHEN r.status != 'CANCELLED' THEN r.total_amount ELSE 0 END), 0.00) AS booking_volume,
        COALESCE(SUM(c.commission_amount), 0.00) AS commission_earned
      FROM reservations r
      LEFT JOIN commissions c ON c.reservation_id = r.id AND c.agent_id = r.agent_id
      WHERE r.agent_id = ?
        AND r.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `;

    const monthlyBreakdown = await pool.query(monthlySql, [agentId]);

    return {
      summary,
      monthlyBreakdown,
    };
  }
}

module.exports = AgentsRepository;
