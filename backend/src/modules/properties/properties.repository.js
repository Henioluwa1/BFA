const pool = require('../../db/pool');

class PropertiesRepository {
  /**
   * Find all properties with real-time unit & reservation statistics
   */
  static async findAll({ search, status, user } = {}) {
    let sql = `
      SELECT p.*,
             COUNT(DISTINCT a.id) as total_units,
             COUNT(DISTINCT a.id) as unit_count,
             COUNT(DISTINCT CASE WHEN a.status = 'AVAILABLE' AND a.is_active = 1 THEN a.id END) as available_units,
             COUNT(DISTINCT CASE WHEN a.status = 'OCCUPIED' THEN a.id END) as occupied_units,
             COUNT(DISTINCT CASE WHEN a.status IN ('MAINTENANCE', 'DIRTY', 'OUT_OF_SERVICE', 'BLOCKED') THEN a.id END) as maintenance_units,
             COUNT(DISTINCT CASE WHEN r.status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING') AND r.check_in_date >= CURRENT_DATE() THEN r.id END) as active_reservations
      FROM properties p
      LEFT JOIN apartments a ON a.property_id = p.id
      LEFT JOIN reservations r ON r.property_id = p.id
      WHERE 1=1
    `;
    const params = [];

    // Server-side property scope enforcement
    if (user && ['MANAGER', 'RECEPTIONIST', 'STAFF'].includes(user.role) && user.propertyId) {
      sql += ' AND p.id = ?';
      params.push(user.propertyId);
    }

    if (status && status !== 'ALL') {
      sql += ' AND p.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      sql += ' AND (p.name LIKE ? OR p.code LIKE ? OR p.city LIKE ? OR p.address LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ' GROUP BY p.id ORDER BY p.id ASC;';
    return pool.query(sql, params);
  }

  /**
   * Find property by ID with aggregated real-time statistics
   */
  static async findById(id) {
    const sql = `
      SELECT p.*,
             COUNT(DISTINCT a.id) as total_units,
             COUNT(DISTINCT a.id) as unit_count,
             COUNT(DISTINCT CASE WHEN a.status = 'AVAILABLE' AND a.is_active = 1 THEN a.id END) as available_units,
             COUNT(DISTINCT CASE WHEN a.status = 'OCCUPIED' THEN a.id END) as occupied_units,
             COUNT(DISTINCT CASE WHEN a.status IN ('MAINTENANCE', 'DIRTY', 'OUT_OF_SERVICE', 'BLOCKED') THEN a.id END) as maintenance_units,
             COUNT(DISTINCT CASE WHEN r.status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING') AND r.check_in_date >= CURRENT_DATE() THEN r.id END) as active_reservations
      FROM properties p
      LEFT JOIN apartments a ON a.property_id = p.id
      LEFT JOIN reservations r ON r.property_id = p.id
      WHERE p.id = ?
      GROUP BY p.id;
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Find property by unique code
   */
  static async findByCode(code) {
    const rows = await pool.query('SELECT * FROM properties WHERE code = ?', [code]);
    return rows[0] || null;
  }

  /**
   * Create a new property
   */
  static async create(data) {
    const sql = `
      INSERT INTO properties (
        name, code, address, city, state, country, description,
        contact_phone, contact_email, status, operational_status,
        check_in_time, check_out_time, amenities, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.name.trim(),
      data.code.trim().toUpperCase(),
      data.address.trim(),
      data.city || 'Lagos',
      data.state || 'Lagos',
      data.country || 'Nigeria',
      data.description || null,
      data.contact_phone || null,
      data.contact_email || null,
      data.status || 'ACTIVE',
      data.operational_status || 'OPERATIONAL',
      data.check_in_time || '14:00',
      data.check_out_time || '11:00',
      data.amenities ? JSON.stringify(data.amenities) : null,
      data.notes || null,
      data.created_by || null,
    ];

    const result = await pool.query(sql, params);
    return result.insertId;
  }

  /**
   * Update property
   */
  static async update(id, data) {
    const fields = [];
    const params = [];

    const allowed = [
      'name', 'address', 'city', 'state', 'country', 'description',
      'contact_phone', 'contact_email', 'status', 'operational_status',
      'check_in_time', 'check_out_time', 'amenities', 'notes', 'is_archived', 'updated_by'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(key === 'amenities' && data[key] ? JSON.stringify(data[key]) : data[key]);
      }
    }

    if (fields.length === 0) return false;

    params.push(id);
    const sql = `UPDATE properties SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(sql, params);
    return true;
  }

  /**
   * Get active upcoming reservations count for a property
   */
  static async getActiveReservationsCount(propertyId) {
    const [row] = await pool.query(
      `SELECT COUNT(*) as cnt 
       FROM reservations 
       WHERE property_id = ? 
         AND check_in_date >= CURRENT_DATE() 
         AND status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING')`,
      [propertyId]
    );
    return parseInt(row?.cnt || 0, 10);
  }

  /**
   * Get all units belonging to a property
   */
  static async getApartmentsByPropertyId(propertyId) {
    const sql = `
      SELECT a.*, p.name as property_name, p.code as property_code
      FROM apartments a
      JOIN properties p ON p.id = a.property_id
      WHERE a.property_id = ?
      ORDER BY a.unit_number ASC;
    `;
    return pool.query(sql, [propertyId]);
  }
}

module.exports = PropertiesRepository;
