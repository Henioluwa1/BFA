const pool = require('../../db/pool');

class ReservationsRepository {
  /**
   * Find all reservations matching criteria with server-side pagination & scoping
   */
  static async findAll({
    propertyId,
    apartmentId,
    status,
    search,
    source,
    agentId,
    fromDate,
    toDate,
    paymentStatus,
    page,
    pageSize,
    user,
  } = {}) {
    let sql = `
      SELECT r.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, a.unit_type,
             ag.name as agent_name,
             ba.auth_code,
             g.display_name as guest_display_name, g.status as guest_status,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      LEFT JOIN booking_authentications ba ON ba.reservation_id = r.id
      LEFT JOIN guests g ON g.id = r.guest_id
      WHERE 1=1
    `;
    const params = [];

    // 1. Role-based server-side security scoping
    if (user) {
      const role = (user.role || '').toUpperCase();
      if (['MANAGER', 'RECEPTIONIST', 'STAFF'].includes(role) && user.propertyId) {
        sql += ' AND r.property_id = ?';
        params.push(user.propertyId);
      }
      if (role === 'AGENT') {
        sql += ' AND r.agent_id = ?';
        params.push(user.agentId || -1); // Strict agent isolation
      }
    }

    // 2. Query filters
    if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }

    if (apartmentId) {
      sql += ' AND r.apartment_id = ?';
      params.push(apartmentId);
    }

    if (status && status !== 'ALL') {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    if (source && source !== 'ALL') {
      sql += ' AND r.source = ?';
      params.push(source);
    }

    if (agentId) {
      sql += ' AND r.agent_id = ?';
      params.push(agentId);
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      sql += ' AND r.payment_status = ?';
      params.push(paymentStatus);
    }

    if (fromDate) {
      sql += ' AND r.check_in_date >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      sql += ' AND r.check_in_date <= ?';
      params.push(toDate);
    }

    if (search && search.trim()) {
      sql += ` AND (
        r.reservation_code LIKE ? OR
        r.tenant_name LIKE ? OR
        r.tenant_email LIKE ? OR
        r.tenant_phone LIKE ? OR
        a.unit_number LIKE ? OR
        p.name LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term, term);
    }

    sql += ' ORDER BY r.check_in_date DESC, r.id DESC';

    if (page && pageSize) {
      const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
      const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    return pool.query(sql, params);
  }

  /**
   * Find reservation by ID with full entity joins
   */
  static async findById(id, conn = null) {
    const sql = `
      SELECT r.*,
             p.name as property_name, p.code as property_code, p.address as property_address,
             a.unit_number, a.unit_name, a.unit_type, a.rate_per_night,
             ag.name as agent_name, ag.email as agent_email,
             ba.auth_code,
             g.display_name as guest_display_name, g.status as guest_status,
             g.identification_type as guest_id_type, g.identification_number as guest_id_number,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      LEFT JOIN booking_authentications ba ON ba.reservation_id = r.id
      LEFT JOIN guests g ON g.id = r.guest_id
      WHERE r.id = ?;
    `;
    if (conn) {
      const [rows] = await conn.query(sql, [id]);
      return rows[0] || null;
    }
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Find reservation by reservation code
   */
  static async findByCode(code) {
    const sql = `
      SELECT r.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name,
             ba.auth_code
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN booking_authentications ba ON ba.reservation_id = r.id
      WHERE r.reservation_code = ?;
    `;
    const rows = await pool.query(sql, [code]);
    return rows[0] || null;
  }

  /**
   * Concurrency-safe availability check with exclusive row-level locking
   */
  static async checkAvailabilityWithLock(conn, apartmentId, checkInDate, excludeReservationId = null) {
    let sql = `
      SELECT id, reservation_code, status 
      FROM reservations 
      WHERE apartment_id = ? 
        AND check_in_date = ? 
        AND status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING')
    `;
    const params = [apartmentId, checkInDate];

    if (excludeReservationId) {
      sql += ' AND id != ?';
      params.push(excludeReservationId);
    }

    sql += ' FOR UPDATE;';

    const [rows] = await conn.query(sql, params);
    return rows.length === 0;
  }

  /**
   * Standard availability check
   */
  static async checkAvailability(apartmentId, checkInDate, excludeReservationId = null) {
    let sql = `
      SELECT id, reservation_code, status 
      FROM reservations 
      WHERE apartment_id = ? 
        AND check_in_date = ? 
        AND status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING')
    `;
    const params = [apartmentId, checkInDate];

    if (excludeReservationId) {
      sql += ' AND id != ?';
      params.push(excludeReservationId);
    }

    const rows = await pool.query(sql, params);
    return rows.length === 0;
  }

  /**
   * Insert reservation
   */
  static async create(data, conn = null) {
    const executor = conn || pool;
    const sql = `
      INSERT INTO reservations (
        reservation_code, confirmation_token, property_id, apartment_id, guest_id, tenant_name,
        tenant_email, tenant_phone, agent_id, source, check_in_date,
        check_out_date, nights, total_amount, paid_amount, status,
        payment_status, payment_method, special_requests, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.reservation_code,
      data.confirmation_token || null,
      data.property_id,
      data.apartment_id,
      data.guest_id || null,
      data.tenant_name.trim(),
      data.tenant_email.trim().toLowerCase(),
      data.tenant_phone.trim(),
      data.agent_id || null,
      data.source || 'DIRECT',
      data.check_in_date,
      data.check_out_date,
      data.nights || 1,
      data.total_amount,
      data.paid_amount || 0.00,
      data.status || 'CONFIRMED',
      data.payment_status || 'PAYMENT_PENDING',
      data.payment_method || 'PAY_AT_PROPERTY',
      data.special_requests || null,
      data.notes || null,
      data.created_by || null,
    ];

    const result = await executor.query(sql, params);
    return result.insertId || result[0]?.insertId;
  }

  /**
   * Update reservation details
   */
  static async update(id, data, conn = null) {
    const executor = conn || pool;
    const fields = [];
    const params = [];

    const allowed = [
      'property_id', 'apartment_id', 'guest_id', 'tenant_name', 'tenant_email', 'tenant_phone',
      'agent_id', 'source', 'check_in_date', 'check_out_date', 'nights',
      'total_amount', 'paid_amount', 'status', 'payment_status', 'payment_method',
      'special_requests', 'notes', 'cancellation_reason', 'cancelled_at',
      'checked_in_at', 'checked_out_at', 'updated_by'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return false;

    params.push(id);
    const sql = `UPDATE reservations SET ${fields.join(', ')} WHERE id = ?`;
    await executor.query(sql, params);
    return true;
  }

  /**
   * Record status history
   */
  static async recordStatusHistory({ reservationId, fromStatus, toStatus, actorId, actorRole, notes }, conn = null) {
    const executor = conn || pool;
    const sql = `
      INSERT INTO reservation_status_history (
        reservation_id, from_status, to_status, actor_id, actor_role, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    await executor.query(sql, [
      reservationId,
      fromStatus,
      toStatus,
      actorId || null,
      actorRole || null,
      notes || null,
    ]);
  }

  /**
   * Get lifecycle status history for reservation
   */
  static async getStatusHistory(reservationId) {
    const sql = `
      SELECT h.*, u.name as actor_name 
      FROM reservation_status_history h
      LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.reservation_id = ?
      ORDER BY h.created_at ASC
    `;
    return pool.query(sql, [reservationId]);
  }
}

module.exports = ReservationsRepository;
