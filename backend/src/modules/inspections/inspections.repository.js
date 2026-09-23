const pool = require('../../db/pool');

class InspectionsRepository {
  /**
   * List all inspections with filtering and entity joins
   */
  static async findAll({
    propertyId,
    apartmentId,
    reservationId,
    status,
    inspectionType,
    fromDate,
    toDate,
    search,
    page,
    pageSize,
    user,
  } = {}) {
    let sql = `
      SELECT i.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, a.unit_type,
             r.reservation_code, r.check_in_date, r.check_out_date,
             g.display_name as guest_name, g.phone as guest_phone,
             u.name as inspector_name, u.email as inspector_email
      FROM inspections i
      JOIN properties p ON p.id = i.property_id
      JOIN apartments a ON a.id = i.apartment_id
      LEFT JOIN reservations r ON r.id = i.reservation_id
      LEFT JOIN guests g ON g.id = i.guest_id
      JOIN users u ON u.id = i.inspector_id
      WHERE 1=1
    `;
    const params = [];

    // Role-based property scoping
    if (user) {
      const role = (user.role || '').toUpperCase();
      if (['MANAGER', 'STAFF'].includes(role) && user.propertyId) {
        sql += ' AND i.property_id = ?';
        params.push(user.propertyId);
      }
    }

    if (propertyId && propertyId !== 'all') {
      sql += ' AND i.property_id = ?';
      params.push(propertyId);
    }

    if (apartmentId) {
      sql += ' AND i.apartment_id = ?';
      params.push(apartmentId);
    }

    if (reservationId) {
      sql += ' AND i.reservation_id = ?';
      params.push(reservationId);
    }

    if (status && status !== 'ALL') {
      sql += ' AND i.status = ?';
      params.push(status);
    }

    if (inspectionType && inspectionType !== 'ALL') {
      sql += ' AND i.inspection_type = ?';
      params.push(inspectionType);
    }

    if (fromDate) {
      sql += ' AND i.scheduled_date >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      sql += ' AND i.scheduled_date <= ?';
      params.push(toDate);
    }

    if (search && search.trim()) {
      sql += ` AND (
        i.inspection_code LIKE ? OR
        a.unit_number LIKE ? OR
        p.name LIKE ? OR
        g.display_name LIKE ? OR
        r.reservation_code LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    sql += ' ORDER BY i.scheduled_date DESC, i.id DESC';

    if (page && pageSize) {
      const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
      const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    return pool.query(sql, params);
  }

  /**
   * Find inspection by ID with full relations
   */
  static async findById(id) {
    const sql = `
      SELECT i.*,
             p.name as property_name, p.code as property_code, p.address as property_address,
             a.unit_number, a.unit_name, a.unit_type,
             r.reservation_code, r.check_in_date, r.check_out_date,
             g.display_name as guest_name, g.phone as guest_phone, g.email as guest_email,
             u.name as inspector_name, u.email as inspector_email
      FROM inspections i
      JOIN properties p ON p.id = i.property_id
      JOIN apartments a ON a.id = i.apartment_id
      LEFT JOIN reservations r ON r.id = i.reservation_id
      LEFT JOIN guests g ON g.id = i.guest_id
      JOIN users u ON u.id = i.inspector_id
      WHERE i.id = ?;
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Create inspection record
   */
  static async create(data, conn = null) {
    const executor = conn || pool;
    const sql = `
      INSERT INTO inspections (
        inspection_code, reservation_id, guest_id, property_id, apartment_id,
        inspector_id, inspection_type, condition_rating, damage_items, missing_items,
        notes, evidence, status, scheduled_date, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.inspection_code,
      data.reservation_id || null,
      data.guest_id || null,
      data.property_id,
      data.apartment_id,
      data.inspector_id,
      data.inspection_type || 'CHECKOUT',
      data.condition_rating || 'GOOD',
      data.damage_items ? JSON.stringify(data.damage_items) : null,
      data.missing_items ? JSON.stringify(data.missing_items) : null,
      data.notes || null,
      data.evidence ? JSON.stringify(data.evidence) : null,
      data.status || 'DRAFT',
      data.scheduled_date,
      data.created_by || null,
    ];

    const result = await executor.query(sql, params);
    return result.insertId || result[0]?.insertId;
  }

  /**
   * Update inspection
   */
  static async update(id, data, conn = null) {
    const executor = conn || pool;
    const fields = [];
    const params = [];

    const allowed = [
      'inspector_id', 'inspection_type', 'condition_rating', 'damage_items',
      'missing_items', 'notes', 'evidence', 'status', 'scheduled_date',
      'completed_at', 'updated_by'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        if (['damage_items', 'missing_items', 'evidence'].includes(key) && typeof data[key] === 'object') {
          params.push(JSON.stringify(data[key]));
        } else {
          params.push(data[key]);
        }
      }
    }

    if (fields.length === 0) return false;

    params.push(id);
    const sql = `UPDATE inspections SET ${fields.join(', ')} WHERE id = ?`;
    await executor.query(sql, params);
    return true;
  }
}

module.exports = InspectionsRepository;
