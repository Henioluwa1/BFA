const pool = require('../../db/pool');

class CommissionsRepository {
  /**
   * Find all commissions with filtering, sorting, and pagination
   */
  static async findAll({
    agentId,
    reservationId,
    propertyId,
    status,
    fromDate,
    toDate,
    search,
    user,
    page = 1,
    pageSize = 50,
  } = {}) {
    let sql = `
      SELECT 
        c.id,
        c.commission_code,
        c.agent_id,
        c.reservation_id,
        c.property_id,
        c.booking_amount,
        c.commission_rate,
        c.commission_type,
        c.commission_amount,
        c.currency,
        c.status,
        c.calculated_at,
        c.approved_by_id,
        c.approved_at,
        c.paid_by_id,
        c.paid_at,
        c.payment_reference,
        c.payment_method,
        c.voided_by_id,
        c.voided_at,
        c.void_reason,
        c.notes,
        c.created_at,
        c.updated_at,
        a.name AS agent_name,
        a.agency_name,
        a.email AS agent_email,
        a.phone AS agent_phone,
        a.bank_name AS agent_bank_name,
        a.account_number AS agent_account_number,
        a.account_name AS agent_account_name,
        p.name AS property_name,
        r.reservation_code,
        r.tenant_name,
        r.check_in_date,
        r.check_out_date,
        r.status AS reservation_status,
        u_app.name AS approved_by_name,
        u_paid.name AS paid_by_name,
        u_void.name AS voided_by_name
      FROM commissions c
      JOIN agents a ON c.agent_id = a.id
      JOIN reservations r ON c.reservation_id = r.id
      JOIN properties p ON c.property_id = p.id
      LEFT JOIN users u_app ON c.approved_by_id = u_app.id
      LEFT JOIN users u_paid ON c.paid_by_id = u_paid.id
      LEFT JOIN users u_void ON c.voided_by_id = u_void.id
      WHERE 1=1
    `;

    const params = [];

    // Role-based scoping: AGENT can only see their own
    if (user && user.role === 'AGENT') {
      sql += ' AND c.agent_id = ?';
      params.push(user.agentId);
    } else if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      sql += ' AND c.property_id = ?';
      params.push(user.propertyId);
    }

    if (agentId) {
      sql += ' AND c.agent_id = ?';
      params.push(agentId);
    }

    if (reservationId) {
      sql += ' AND c.reservation_id = ?';
      params.push(reservationId);
    }

    if (propertyId) {
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

    if (search) {
      sql += ' AND (c.commission_code LIKE ? OR a.name LIKE ? OR a.agency_name LIKE ? OR r.reservation_code LIKE ? OR r.tenant_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    // Count
    const countSql = `SELECT COUNT(*) AS count FROM (${sql}) AS count_query`;
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult[0]?.count || 0, 10);

    // Sort & Paginate
    sql += ' ORDER BY c.created_at DESC';
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedPageSize = Math.max(1, parseInt(pageSize, 10) || 50);
    const offset = (parsedPage - 1) * parsedPageSize;

    sql += ' LIMIT ? OFFSET ?';
    params.push(parsedPageSize, offset);

    const rows = await pool.query(sql, params);

    return {
      commissions: rows,
      pagination: {
        page: parsedPage,
        pageSize: parsedPageSize,
        total,
        totalPages: Math.ceil(total / parsedPageSize) || 1,
      },
    };
  }

  /**
   * Find commission by ID
   */
  static async findById(id) {
    const sql = `
      SELECT 
        c.id,
        c.commission_code,
        c.agent_id,
        c.reservation_id,
        c.property_id,
        c.booking_amount,
        c.commission_rate,
        c.commission_type,
        c.commission_amount,
        c.currency,
        c.status,
        c.calculated_at,
        c.approved_by_id,
        c.approved_at,
        c.paid_by_id,
        c.paid_at,
        c.payment_reference,
        c.payment_method,
        c.voided_by_id,
        c.voided_at,
        c.void_reason,
        c.notes,
        c.created_at,
        c.updated_at,
        a.name AS agent_name,
        a.agency_name,
        a.email AS agent_email,
        a.phone AS agent_phone,
        a.bank_name AS agent_bank_name,
        a.account_number AS agent_account_number,
        a.account_name AS agent_account_name,
        p.name AS property_name,
        r.reservation_code,
        r.tenant_name,
        r.check_in_date,
        r.check_out_date,
        r.status AS reservation_status,
        u_app.name AS approved_by_name,
        u_paid.name AS paid_by_name,
        u_void.name AS voided_by_name
      FROM commissions c
      JOIN agents a ON c.agent_id = a.id
      JOIN reservations r ON c.reservation_id = r.id
      JOIN properties p ON c.property_id = p.id
      LEFT JOIN users u_app ON c.approved_by_id = u_app.id
      LEFT JOIN users u_paid ON c.paid_by_id = u_paid.id
      LEFT JOIN users u_void ON c.voided_by_id = u_void.id
      WHERE c.id = ?
    `;

    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Find commission by reservation ID
   */
  static async findByReservationId(reservationId) {
    const sql = 'SELECT * FROM commissions WHERE reservation_id = ?';
    const rows = await pool.query(sql, [reservationId]);
    return rows[0] || null;
  }

  /**
   * Find commission by agent and reservation
   */
  static async findByAgentAndReservation(agentId, reservationId) {
    const sql = 'SELECT * FROM commissions WHERE agent_id = ? AND reservation_id = ?';
    const rows = await pool.query(sql, [agentId, reservationId]);
    return rows[0] || null;
  }

  /**
   * Create commission record
   */
  static async create(data, conn = null) {
    const sql = `
      INSERT INTO commissions (
        commission_code, agent_id, reservation_id, property_id,
        booking_amount, commission_rate, commission_type, commission_amount,
        currency, status, calculated_at, approved_by_id, approved_at,
        paid_by_id, paid_at, payment_reference, payment_method, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      data.commission_code,
      data.agent_id,
      data.reservation_id,
      data.property_id,
      data.booking_amount,
      data.commission_rate,
      data.commission_type || 'PERCENTAGE',
      data.commission_amount,
      data.currency || 'NGN',
      data.status || 'PENDING',
      data.calculated_at || null,
      data.approved_by_id || null,
      data.approved_at || null,
      data.paid_by_id || null,
      data.paid_at || null,
      data.payment_reference || null,
      data.payment_method || null,
      data.notes || null,
    ];

    if (conn) {
      const [result] = await conn.query(sql, params);
      return result.insertId;
    }
    const result = await pool.query(sql, params);
    return result.insertId;
  }

  /**
   * Update commission record
   */
  static async update(id, data, conn = null) {
    const fields = [];
    const params = [];

    const allowed = [
      'booking_amount', 'commission_rate', 'commission_type', 'commission_amount',
      'status', 'calculated_at', 'approved_by_id', 'approved_at',
      'paid_by_id', 'paid_at', 'payment_reference', 'payment_method',
      'voided_by_id', 'voided_at', 'void_reason', 'notes'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return;

    params.push(id);
    const sql = `UPDATE commissions SET ${fields.join(', ')} WHERE id = ?`;
    if (conn) {
      await conn.query(sql, params);
    } else {
      await pool.query(sql, params);
    }
  }

  /**
   * Aggregated financial summary of commissions
   */
  static async getSummary({ agentId, propertyId, fromDate, toDate, user } = {}) {
    let sql = `
      SELECT 
        COUNT(c.id) AS total_count,
        COALESCE(SUM(c.commission_amount), 0.00) AS total_amount,
        COALESCE(SUM(CASE WHEN c.status IN ('PENDING', 'CALCULATED') THEN c.commission_amount ELSE 0 END), 0.00) AS pending_amount,
        SUM(CASE WHEN c.status IN ('PENDING', 'CALCULATED') THEN 1 ELSE 0 END) AS pending_count,
        COALESCE(SUM(CASE WHEN c.status = 'APPROVED' THEN c.commission_amount ELSE 0 END), 0.00) AS approved_amount,
        SUM(CASE WHEN c.status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
        COALESCE(SUM(CASE WHEN c.status = 'PAID' THEN c.commission_amount ELSE 0 END), 0.00) AS paid_amount,
        SUM(CASE WHEN c.status = 'PAID' THEN 1 ELSE 0 END) AS paid_count,
        COALESCE(SUM(CASE WHEN c.status = 'CANCELLED' THEN c.commission_amount ELSE 0 END), 0.00) AS cancelled_amount,
        COALESCE(SUM(CASE WHEN c.status = 'VOIDED' THEN c.commission_amount ELSE 0 END), 0.00) AS voided_amount
      FROM commissions c
      WHERE 1=1
    `;

    const params = [];

    if (user && user.role === 'AGENT') {
      sql += ' AND c.agent_id = ?';
      params.push(user.agentId);
    } else if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      sql += ' AND c.property_id = ?';
      params.push(user.propertyId);
    }

    if (agentId) {
      sql += ' AND c.agent_id = ?';
      params.push(agentId);
    }

    if (propertyId) {
      sql += ' AND c.property_id = ?';
      params.push(propertyId);
    }

    if (fromDate) {
      sql += ' AND DATE(c.created_at) >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      sql += ' AND DATE(c.created_at) <= ?';
      params.push(toDate);
    }

    const rows = await pool.query(sql, params);
    return rows[0] || {};
  }
}

module.exports = CommissionsRepository;
