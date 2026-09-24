const pool = require('../../db/pool');

class EmployeeActivitiesRepository {
  /**
   * Record a new employee activity
   */
  static async create({
    employeeId,
    propertyId = null,
    activityType,
    activityCategory = 'GENERAL',
    description,
    relatedEntityType = null,
    relatedEntityId = null,
    status = 'SUCCESS',
    metadata = null,
  }, conn = null) {
    const executor = conn || pool;
    const sql = `
      INSERT INTO employee_activities (
        employee_id, property_id, activity_type, activity_category,
        description, related_entity_type, related_entity_id, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const metaJson = metadata ? JSON.stringify(metadata) : null;
    const params = [
      employeeId,
      propertyId,
      activityType,
      activityCategory,
      description,
      relatedEntityType,
      relatedEntityId ? String(relatedEntityId) : null,
      status,
      metaJson,
    ];
    const res = await executor.query(sql, params);
    const insertId = res.insertId || res[0]?.insertId;
    return this.findById(insertId, conn);
  }

  /**
   * Find single activity by ID
   */
  static async findById(id, conn = null) {
    const executor = conn || pool;
    const sql = `
      SELECT 
        ea.*,
        e.full_name AS employee_name,
        e.employee_code,
        e.job_title,
        e.department
      FROM employee_activities ea
      JOIN employees e ON e.id = ea.employee_id
      WHERE ea.id = ?
    `;
    const rows = await executor.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Find activities with filtering and scoping
   */
  static async findAll({
    employeeId,
    propertyId,
    activityType,
    activityCategory,
    fromDate,
    toDate,
    page = 1,
    limit = 25,
    user = null,
  } = {}) {
    let whereClause = ' WHERE 1=1';
    const params = [];

    if (employeeId) {
      whereClause += ' AND ea.employee_id = ?';
      params.push(employeeId);
    }

    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((user.role || '').toUpperCase())) {
      whereClause += ' AND (ea.property_id = ? OR ea.property_id IS NULL)';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      whereClause += ' AND ea.property_id = ?';
      params.push(propertyId);
    }

    if (activityType) {
      whereClause += ' AND ea.activity_type = ?';
      params.push(activityType);
    }

    if (activityCategory && activityCategory !== 'ALL') {
      whereClause += ' AND ea.activity_category = ?';
      params.push(activityCategory);
    }

    if (fromDate) {
      whereClause += ' AND DATE(ea.created_at) >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      whereClause += ' AND DATE(ea.created_at) <= ?';
      params.push(toDate);
    }

    // Count
    const countSql = `SELECT COUNT(ea.id) AS total FROM employee_activities ea ${whereClause}`;
    const countRows = await pool.query(countSql, [...params]);
    const total = parseInt(countRows[0]?.total || 0, 10);

    // Main query
    let sql = `
      SELECT 
        ea.*,
        e.full_name AS employee_name,
        e.employee_code,
        e.job_title,
        e.department,
        p.name AS property_name
      FROM employee_activities ea
      JOIN employees e ON e.id = ea.employee_id
      LEFT JOIN properties p ON p.id = ea.property_id
      ${whereClause}
      ORDER BY ea.created_at DESC, ea.id DESC
    `;

    const numLimit = Math.max(1, Math.min(parseInt(limit, 10) || 25, 100));
    const numPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (numPage - 1) * numLimit;

    sql += ' LIMIT ? OFFSET ?';
    const queryParams = [...params, numLimit, offset];

    const rows = await pool.query(sql, queryParams);

    return {
      activities: rows,
      pagination: {
        total,
        page: numPage,
        limit: numLimit,
        totalPages: Math.ceil(total / numLimit) || 1,
      },
    };
  }

  /**
   * Get activity summary and category distribution
   */
  static async getSummary({ employeeId, propertyId, fromDate, toDate } = {}) {
    let sql = `
      SELECT 
        activity_category,
        COUNT(id) AS count
      FROM employee_activities
      WHERE 1=1
    `;
    const params = [];

    if (employeeId) {
      sql += ' AND employee_id = ?';
      params.push(employeeId);
    }
    if (propertyId && propertyId !== 'all') {
      sql += ' AND property_id = ?';
      params.push(propertyId);
    }
    if (fromDate) {
      sql += ' AND DATE(created_at) >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND DATE(created_at) <= ?';
      params.push(toDate);
    }

    sql += ' GROUP BY activity_category ORDER BY count DESC';

    const rows = await pool.query(sql, params);
    const totalActivities = rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

    const byCategory = {
      FRONT_DESK: 0,
      HOUSEKEEPING: 0,
      MAINTENANCE: 0,
      FINANCE: 0,
      SECURITY: 0,
      GENERAL: 0,
      PROFILE: 0,
    };
    rows.forEach((r) => {
      byCategory[r.activity_category] = parseInt(r.count, 10);
    });

    return {
      totalActivities,
      byCategory,
      ...byCategory,
    };
  }
}

module.exports = EmployeeActivitiesRepository;
