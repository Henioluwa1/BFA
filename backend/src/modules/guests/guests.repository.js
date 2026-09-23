const pool = require('../../db/pool');

class GuestsRepository {
  /**
   * List guests with search, status filtering, and reservation metrics
   */
  static async findAll({ search, status, page, pageSize, user } = {}) {
    let sql = `
      SELECT g.*,
             COUNT(DISTINCT r.id) as total_reservations,
             SUM(CASE WHEN r.status IN ('CONFIRMED', 'CHECKED_IN') THEN 1 ELSE 0 END) as active_reservations,
             MAX(r.check_in_date) as last_stay_date
      FROM guests g
      LEFT JOIN reservations r ON (r.guest_id = g.id OR r.tenant_email = g.email)
      WHERE 1=1
    `;
    const params = [];

    // Agent isolation: if user is AGENT, only return guests who have booked with this agent
    if (user?.role === 'AGENT') {
      sql += ' AND r.agent_id = ?';
      params.push(user.agentId || -1);
    }

    if (status && status !== 'ALL') {
      sql += ' AND g.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      sql += ` AND (
        g.display_name LIKE ? OR
        g.email LIKE ? OR
        g.phone LIKE ? OR
        g.identification_number LIKE ? OR
        r.reservation_code LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    sql += ' GROUP BY g.id ORDER BY g.created_at DESC';

    if (page && pageSize) {
      const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
      const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    return pool.query(sql, params);
  }

  /**
   * Find guest by ID with full profile & reservation history
   */
  static async findById(id) {
    const guestSql = 'SELECT * FROM guests WHERE id = ?';
    const guestRows = await pool.query(guestSql, [id]);
    if (!guestRows || guestRows.length === 0) return null;

    const guest = guestRows[0];

    // Fetch reservation history
    const resSql = `
      SELECT r.id, r.reservation_code, r.check_in_date, r.check_out_date,
             r.status, r.source, r.total_amount, r.paid_amount,
             p.name as property_name, a.unit_number, a.unit_type,
             ba.auth_code
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN booking_authentications ba ON ba.reservation_id = r.id
      WHERE r.guest_id = ? OR r.tenant_email = ?
      ORDER BY r.check_in_date DESC;
    `;
    guest.reservations = await pool.query(resSql, [id, guest.email]);
    return guest;
  }

  /**
   * Find by email
   */
  static async findByEmail(email) {
    const sql = 'SELECT * FROM guests WHERE email = ?';
    const rows = await pool.query(sql, [email.trim().toLowerCase()]);
    return rows[0] || null;
  }

  /**
   * Find by phone
   */
  static async findByPhone(phone) {
    const sql = 'SELECT * FROM guests WHERE phone = ?';
    const rows = await pool.query(sql, [phone.trim()]);
    return rows[0] || null;
  }

  /**
   * Create new guest profile
   */
  static async create(data, conn = null) {
    const executor = conn || pool;
    const sql = `
      INSERT INTO guests (
        first_name, last_name, display_name, email, phone,
        address, city, country, nationality, identification_type,
        identification_number, emergency_contact_name, emergency_contact_phone,
        notes, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.first_name.trim(),
      data.last_name.trim(),
      data.display_name.trim(),
      data.email.trim().toLowerCase(),
      data.phone.trim(),
      data.address || null,
      data.city || 'Lagos',
      data.country || 'Nigeria',
      data.nationality || 'Nigerian',
      data.identification_type || null,
      data.identification_number || null,
      data.emergency_contact_name || null,
      data.emergency_contact_phone || null,
      data.notes || null,
      data.status || 'ACTIVE',
      data.created_by || null,
    ];

    const result = await executor.query(sql, params);
    return result.insertId || result[0]?.insertId;
  }

  /**
   * Update guest profile
   */
  static async update(id, data, conn = null) {
    const executor = conn || pool;
    const fields = [];
    const params = [];

    const allowed = [
      'first_name', 'last_name', 'display_name', 'email', 'phone',
      'address', 'city', 'country', 'nationality', 'identification_type',
      'identification_number', 'emergency_contact_name', 'emergency_contact_phone',
      'notes', 'status'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(key === 'email' ? data[key].trim().toLowerCase() : data[key]);
      }
    }

    if (fields.length === 0) return false;

    params.push(id);
    const sql = `UPDATE guests SET ${fields.join(', ')} WHERE id = ?`;
    await executor.query(sql, params);
    return true;
  }

  /**
   * Identify duplicate guests by matching email or phone
   */
  static async findDuplicates() {
    const sql = `
      SELECT g1.id as primary_id, g1.display_name as primary_name, g1.email as primary_email, g1.phone as primary_phone,
             g2.id as duplicate_id, g2.display_name as duplicate_name, g2.email as duplicate_email, g2.phone as duplicate_phone,
             'EMAIL_MATCH' as match_type
      FROM guests g1
      JOIN guests g2 ON g1.email = g2.email AND g1.id < g2.id
      UNION
      SELECT g1.id as primary_id, g1.display_name as primary_name, g1.email as primary_email, g1.phone as primary_phone,
             g2.id as duplicate_id, g2.display_name as duplicate_name, g2.email as duplicate_email, g2.phone as duplicate_phone,
             'PHONE_MATCH' as match_type
      FROM guests g1
      JOIN guests g2 ON g1.phone = g2.phone AND g1.id < g2.id AND g1.email != g2.email;
    `;
    return pool.query(sql);
  }

  /**
   * Merge duplicate guest into primary guest record
   */
  static async mergeGuests(primaryId, duplicateId, actorId) {
    return pool.withTransaction(async (conn) => {
      // 1. Move reservations
      await conn.query('UPDATE reservations SET guest_id = ? WHERE guest_id = ?', [primaryId, duplicateId]);
      // 2. Move inspections
      await conn.query('UPDATE inspections SET guest_id = ? WHERE guest_id = ?', [primaryId, duplicateId]);
      // 3. Mark duplicate guest as merged in notes
      await conn.query(
        'UPDATE guests SET notes = CONCAT(COALESCE(notes, ""), " [Merged into Guest #", ?, " by user #", ?, "]"), status = "BLOCKED" WHERE id = ?',
        [primaryId, actorId || 1, duplicateId]
      );
      return true;
    });
  }
}

module.exports = GuestsRepository;
