const pool = require('../../db/pool');

class MaintenanceRepository {
  /**
   * Find maintenance requests with filtering and pagination
   */
  static async findAll({
    propertyId,
    apartmentId,
    status,
    priority,
    category,
    assignedToId,
    search,
    fromDate,
    toDate,
    page = 1,
    pageSize = 50,
    user,
  } = {}) {
    let sql = `
      SELECT m.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, a.status as apartment_status,
             rep.name as reported_by_name, rep.email as reported_by_email,
             asg.name as assigned_to_name, asg.email as assigned_to_email,
             r.reservation_code
      FROM maintenance_requests m
      JOIN properties p ON p.id = m.property_id
      LEFT JOIN apartments a ON a.id = m.apartment_id
      LEFT JOIN users rep ON rep.id = m.reported_by_id
      LEFT JOIN users asg ON asg.id = m.assigned_to_id
      LEFT JOIN reservations r ON r.id = m.reservation_id
      WHERE 1=1
    `;
    const params = [];

    // Property scope enforcement for property-assigned roles
    if (user?.role === 'MANAGER' && user.propertyId) {
      sql += ' AND m.property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND m.property_id = ?';
      params.push(propertyId);
    }

    if (apartmentId) {
      sql += ' AND m.apartment_id = ?';
      params.push(apartmentId);
    }

    if (status && status !== 'ALL') {
      sql += ' AND m.status = ?';
      params.push(status);
    }

    if (priority && priority !== 'ALL') {
      sql += ' AND m.priority = ?';
      params.push(priority);
    }

    if (category && category !== 'ALL') {
      sql += ' AND m.category = ?';
      params.push(category);
    }

    if (assignedToId) {
      sql += ' AND m.assigned_to_id = ?';
      params.push(assignedToId);
    }

    if (fromDate) {
      sql += ' AND DATE(m.created_at) >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      sql += ' AND DATE(m.created_at) <= ?';
      params.push(toDate);
    }

    if (search && search.trim()) {
      sql += ` AND (
        m.issue_code LIKE ? OR
        m.issue_title LIKE ? OR
        m.description LIKE ? OR
        p.name LIKE ? OR
        a.unit_number LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    sql += ` ORDER BY 
      CASE m.status 
        WHEN 'OPEN' THEN 1 
        WHEN 'IN_PROGRESS' THEN 2 
        WHEN 'RESOLVED' THEN 3 
        ELSE 4 
      END,
      FIELD(m.priority, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
      m.created_at DESC
    `;

    if (page && pageSize) {
      const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
      const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    return pool.query(sql, params);
  }

  /**
   * Find single maintenance record by ID
   */
  static async findById(id) {
    const sql = `
      SELECT m.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, a.status as apartment_status,
             rep.name as reported_by_name, rep.email as reported_by_email,
             asg.name as assigned_to_name, asg.email as assigned_to_email,
             r.reservation_code
      FROM maintenance_requests m
      JOIN properties p ON p.id = m.property_id
      LEFT JOIN apartments a ON a.id = m.apartment_id
      LEFT JOIN users rep ON rep.id = m.reported_by_id
      LEFT JOIN users asg ON asg.id = m.assigned_to_id
      LEFT JOIN reservations r ON r.id = m.reservation_id
      WHERE m.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Create new maintenance request
   */
  static async create(data) {
    const sql = `
      INSERT INTO maintenance_requests
      (issue_code, property_id, apartment_id, reservation_id, issue_title, description, category, priority, status, reported_by_id, assigned_to_id, assigned_to, estimated_cost, actual_cost, blocking_unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.issue_code,
      data.property_id,
      data.apartment_id || null,
      data.reservation_id || null,
      data.issue_title,
      data.description || null,
      data.category || 'GENERAL',
      data.priority || 'MEDIUM',
      data.status || 'OPEN',
      data.reported_by_id || null,
      data.assigned_to_id || null,
      data.assigned_to || null,
      data.estimated_cost || 0.00,
      data.actual_cost || 0.00,
      data.blocking_unit ? 1 : 0,
    ];
    const result = await pool.query(sql, params);
    return result.insertId;
  }

  /**
   * Update maintenance request
   */
  static async update(id, data) {
    const fields = [];
    const params = [];

    const allowedFields = [
      'issue_title',
      'description',
      'category',
      'priority',
      'status',
      'assigned_to_id',
      'assigned_to',
      'estimated_cost',
      'actual_cost',
      'started_at',
      'resolved_at',
      'resolution_notes',
      'blocking_unit',
    ];

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }

    if (fields.length === 0) return false;

    params.push(id);
    const sql = `UPDATE maintenance_requests SET ${fields.join(', ')} WHERE id = ?`;
    const result = await pool.query(sql, params);
    return result.affectedRows > 0;
  }

  /**
   * Get operational maintenance statistics
   */
  static async getStats({ propertyId, user } = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (user?.role === 'MANAGER' && user.propertyId) {
      whereClause += ' AND property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      whereClause += ' AND property_id = ?';
      params.push(propertyId);
    }

    const [counts] = await pool.query(
      `SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved_count,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN priority = 'CRITICAL' AND status IN ('OPEN', 'IN_PROGRESS') THEN 1 ELSE 0 END) as critical_open_count,
        SUM(actual_cost) as total_actual_cost,
        SUM(estimated_cost) as total_estimated_cost
       FROM maintenance_requests ${whereClause}`,
      params
    );

    const categoryBreakdown = await pool.query(
      `SELECT category, COUNT(*) as count, SUM(actual_cost) as total_cost
       FROM maintenance_requests ${whereClause}
       GROUP BY category ORDER BY count DESC`,
      params
    );

    const propertyBreakdown = await pool.query(
      `SELECT m.property_id, p.name as property_name, COUNT(*) as count,
              SUM(CASE WHEN m.status IN ('OPEN', 'IN_PROGRESS') THEN 1 ELSE 0 END) as active_count
       FROM maintenance_requests m
       JOIN properties p ON p.id = m.property_id
       ${whereClause}
       GROUP BY m.property_id, p.name ORDER BY count DESC`,
      params
    );

    return {
      overview: {
        total: parseInt(counts?.total_requests || 0, 10),
        open: parseInt(counts?.open_count || 0, 10),
        inProgress: parseInt(counts?.in_progress_count || 0, 10),
        resolved: parseInt(counts?.resolved_count || 0, 10),
        cancelled: parseInt(counts?.cancelled_count || 0, 10),
        criticalOpen: parseInt(counts?.critical_open_count || 0, 10),
        totalCost: parseFloat(counts?.total_actual_cost || 0),
        estimatedCost: parseFloat(counts?.total_estimated_cost || 0),
      },
      byCategory: categoryBreakdown,
      byProperty: propertyBreakdown,
    };
  }
}

module.exports = MaintenanceRepository;
