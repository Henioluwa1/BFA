const pool = require('../../db/pool');

class ApartmentsRepository {
  /**
   * Find all units matching filters
   */
  static async findAll({ propertyId, status, unitType, search, user, page, pageSize } = {}) {
    let sql = `
      SELECT a.*, p.name as property_name, p.code as property_code, p.status as property_status
      FROM apartments a
      JOIN properties p ON p.id = a.property_id
      WHERE 1=1
    `;
    const params = [];

    // Server-side property scope enforcement
    if (user && ['MANAGER', 'RECEPTIONIST', 'STAFF'].includes(user.role) && user.propertyId) {
      sql += ' AND a.property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND a.property_id = ?';
      params.push(propertyId);
    }

    if (status && status !== 'ALL') {
      sql += ' AND a.status = ?';
      params.push(status);
    }

    if (unitType && unitType !== 'ALL') {
      sql += ' AND a.unit_type = ?';
      params.push(unitType);
    }

    if (search && search.trim()) {
      sql += ' AND (a.unit_number LIKE ? OR a.unit_name LIKE ? OR a.unit_type LIKE ? OR p.name LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY a.property_id ASC, a.unit_number ASC';

    if (page && pageSize) {
      const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
      const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    return pool.query(sql, params);
  }

  /**
   * Find single unit by ID with enriched property info
   */
  static async findById(id) {
    const sql = `
      SELECT a.*, p.name as property_name, p.code as property_code, p.status as property_status,
             p.address as property_address, p.city as property_city
      FROM apartments a
      JOIN properties p ON p.id = a.property_id
      WHERE a.id = ?;
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Find unit by property ID and unit number (unique key check)
   */
  static async findByPropertyAndUnitNumber(propertyId, unitNumber) {
    const sql = `
      SELECT a.* 
      FROM apartments a 
      WHERE a.property_id = ? AND a.unit_number = ?;
    `;
    const rows = await pool.query(sql, [propertyId, String(unitNumber).trim()]);
    return rows[0] || null;
  }

  /**
   * Create new apartment unit
   */
  static async create(data) {
    const sql = `
      INSERT INTO apartments (
        property_id, unit_number, unit_name, unit_type, floor,
        capacity, bedroom_count, bathroom_count, rate_per_night,
        status, amenities, notes, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.property_id,
      String(data.unit_number).trim(),
      data.unit_name.trim(),
      data.unit_type || 'Deluxe Studio',
      data.floor || null,
      data.capacity || 2,
      data.bedroom_count || 1,
      data.bathroom_count || 1,
      data.rate_per_night || 150.00,
      data.status || 'AVAILABLE',
      data.amenities ? JSON.stringify(data.amenities) : null,
      data.notes || null,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      data.created_by || null,
    ];

    const result = await pool.query(sql, params);
    return result.insertId;
  }

  /**
   * Update apartment unit
   */
  static async update(id, data) {
    const fields = [];
    const params = [];

    const allowed = [
      'property_id', 'unit_number', 'unit_name', 'unit_type', 'floor',
      'capacity', 'bedroom_count', 'bathroom_count', 'rate_per_night',
      'status', 'amenities', 'notes', 'is_active', 'updated_by'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(key === 'amenities' && data[key] ? JSON.stringify(data[key]) : data[key]);
      }
    }

    if (fields.length === 0) return false;

    params.push(id);
    const sql = `UPDATE apartments SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(sql, params);
    return true;
  }

  /**
   * Update unit operational status
   */
  static async updateStatus(id, status, updatedBy = null) {
    const sql = 'UPDATE apartments SET status = ?, updated_by = ? WHERE id = ?';
    await pool.query(sql, [status, updatedBy, id]);
    return true;
  }

  /**
   * Fetch current and upcoming reservations for unit
   */
  static async getUnitReservations(apartmentId) {
    const sql = `
      SELECT r.*, p.name as property_name, ag.name as agent_name
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      WHERE r.apartment_id = ?
      ORDER BY r.check_in_date DESC
      LIMIT 20;
    `;
    return pool.query(sql, [apartmentId]);
  }

  /**
   * Authoritative Availability Check
   * A unit is available if:
   * 1. Property is ACTIVE
   * 2. Unit is active and not in maintenance/blocked/out_of_service
   * 3. No active reservation exists for the check_in_date
   * 4. No active blocked period covers the requested date
   */
  static async checkAvailability(apartmentId, checkInDate) {
    // 1. Check unit & property status
    const unit = await this.findById(apartmentId);
    if (!unit) return { isAvailable: false, reason: 'Apartment unit not found.' };

    if (unit.property_status !== 'ACTIVE') {
      return { isAvailable: false, reason: `Property '${unit.property_name}' is currently ${unit.property_status}.` };
    }

    if (!unit.is_active) {
      return { isAvailable: false, reason: 'Apartment unit is currently deactivated.' };
    }

    const unbookableOperationalStatuses = ['MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE'];
    if (unbookableOperationalStatuses.includes(unit.status)) {
      return { isAvailable: false, reason: `Unit is currently in ${unit.status} status and unavailable for booking.` };
    }

    // 2. Check conflicting active reservations for the date
    const [resConflict] = await pool.query(
      `SELECT id, reservation_code, status 
       FROM reservations 
       WHERE apartment_id = ? 
         AND check_in_date = ? 
         AND status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING')`,
      [apartmentId, checkInDate]
    );

    if (resConflict) {
      return {
        isAvailable: false,
        reason: `Unit is already reserved on ${checkInDate} (Reservation #${resConflict.reservation_code}).`,
      };
    }

    // 3. Check blocked periods
    const [blockConflict] = await pool.query(
      `SELECT id, reason 
       FROM blocked_periods 
       WHERE apartment_id = ? 
         AND ? >= start_date AND ? <= end_date`,
      [apartmentId, checkInDate, checkInDate]
    );

    if (blockConflict) {
      return {
        isAvailable: false,
        reason: `Unit is blocked for maintenance: ${blockConflict.reason}.`,
      };
    }

    return {
      isAvailable: true,
      unitId: unit.id,
      unitNumber: unit.unit_number,
      unitName: unit.unit_name,
      propertyId: unit.property_id,
      propertyName: unit.property_name,
      ratePerNight: unit.rate_per_night,
      checkInDate,
    };
  }

  /**
   * Add operational blocked period
   */
  static async addBlockedPeriod({ propertyId, apartmentId, startDate, endDate, reason, blockedById }) {
    const result = await pool.query(
      `INSERT INTO blocked_periods (property_id, apartment_id, start_date, end_date, reason, blocked_by_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [propertyId, apartmentId, startDate, endDate, reason, blockedById]
    );
    return result.insertId;
  }

  /**
   * Get blocked periods for unit
   */
  static async getBlockedPeriods(apartmentId) {
    return pool.query(
      `SELECT bp.*, u.full_name as blocked_by_name
       FROM blocked_periods bp
       LEFT JOIN users u ON u.id = bp.blocked_by_id
       WHERE bp.apartment_id = ?
       ORDER BY bp.start_date DESC`,
      [apartmentId]
    );
  }

  /**
   * Find blocked period by ID
   */
  static async findBlockedPeriodById(blockId) {
    const [row] = await pool.query(
      `SELECT bp.*, a.property_id
       FROM blocked_periods bp
       JOIN apartments a ON a.id = bp.apartment_id
       WHERE bp.id = ?`,
      [blockId]
    );
    return row || null;
  }

  /**
   * Delete blocked period
   */
  static async deleteBlockedPeriod(blockId) {
    const result = await pool.query(`DELETE FROM blocked_periods WHERE id = ?`, [blockId]);
    return result.affectedRows > 0;
  }
}

module.exports = ApartmentsRepository;
