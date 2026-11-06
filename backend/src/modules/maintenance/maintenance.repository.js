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
   * Update maintenance request with safe locking boundary (Stage 2.6A Hardening)
   * Enforces:
   *  - Direct, lightweight execution for non-blocking edits without acquiring locks
   *  - Apartment row lock acquisition BEFORE predicate changes for blocking mutations (CRITICAL / blocking_unit)
   *  - Ascending numeric ID locking order for apartment transfers (min -> max)
   *  - Reservation-first lock hierarchy when linked reservations exist
   *  - Re-evaluation of remaining active blocking tickets before clearing restrictions
   */
  static async update(id, data, conn = null) {
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
      'apartment_id',
      'reservation_id',
    ];

    const blockingSensitiveKeys = ['priority', 'blocking_unit', 'status', 'apartment_id', 'reservation_id'];
    const touchesBlockingState = Object.keys(data).some((key) => blockingSensitiveKeys.includes(key));

    // Fast-path: Pure non-blocking edits execute without acquiring mutex locks
    if (!touchesBlockingState) {
      const fields = [];
      const params = [];
      for (const [key, value] of Object.entries(data)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          params.push(value);
        }
      }
      if (fields.length === 0) return false;
      params.push(id);
      const sql = `UPDATE maintenance_requests SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
      const executor = conn || pool;
      const result = await executor.query(sql, params);
      return (result.affectedRows || result.changedRows || 0) >= 0;
    }

    // Blocking-sensitive path: Coordinate via transaction with hierarchical locks
    const executeInTx = async (txConn) => {
      // 1. Lock maintenance ticket row
      const [ticketRows] = await txConn.query(
        'SELECT id, property_id, apartment_id, reservation_id, priority, blocking_unit, status FROM maintenance_requests WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!ticketRows || ticketRows.length === 0) {
        return false;
      }
      const ticket = ticketRows[0];

      const oldAptId = ticket.apartment_id ? parseInt(ticket.apartment_id, 10) : null;
      const newAptId = data.apartment_id !== undefined ? (data.apartment_id ? parseInt(data.apartment_id, 10) : null) : oldAptId;

      const oldResId = ticket.reservation_id ? parseInt(ticket.reservation_id, 10) : null;
      const newResId = data.reservation_id !== undefined ? (data.reservation_id ? parseInt(data.reservation_id, 10) : null) : oldResId;

      // 2. Preserve reservation-first lock hierarchy
      const resIds = [...new Set([oldResId, newResId].filter(Boolean))].sort((a, b) => a - b);
      for (const rId of resIds) {
        await txConn.query('SELECT id FROM reservations WHERE id = ? FOR UPDATE', [rId]);
      }

      // 3. For apartment transfers or affected units, lock in strictly ascending ID order
      const aptIds = [...new Set([oldAptId, newAptId].filter(Boolean))].sort((a, b) => a - b);
      const lockedApts = {};
      for (const aId of aptIds) {
        const [aptRows] = await txConn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [aId]);
        if (aptRows && aptRows.length > 0) {
          lockedApts[aId] = aptRows[0];
        }
      }

      // 4. Update the maintenance ticket
      const fields = [];
      const params = [];
      for (const [key, value] of Object.entries(data)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          params.push(value);
        }
      }
      if (fields.length > 0) {
        params.push(id);
        await txConn.query(`UPDATE maintenance_requests SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
      }

      // 5. Synchronize operational and maintenance state across all affected apartments
      for (const aId of aptIds) {
        const apt = lockedApts[aId];
        if (!apt) continue;

        // Query remaining active blocking tickets on this apartment
        const [remRows] = await txConn.query(
          `SELECT COUNT(*) as count 
           FROM maintenance_requests 
           WHERE apartment_id = ? 
             AND status NOT IN ('RESOLVED', 'CANCELLED') 
             AND (blocking_unit = 1 OR priority = 'CRITICAL')`,
          [aId]
        );
        const blockingCount = parseInt(remRows[0]?.count || 0, 10);

        if (blockingCount > 0) {
          // Unit has active blocking maintenance
          if (apt.status === 'OCCUPIED') {
            await txConn.query(
              'UPDATE apartments SET maintenance_status = "UNDER_REPAIR", updated_at = NOW() WHERE id = ?',
              [aId]
            );
          } else {
            await txConn.query(
              'UPDATE apartments SET status = "MAINTENANCE", maintenance_status = "UNDER_REPAIR", updated_at = NOW() WHERE id = ?',
              [aId]
            );
          }
        } else {
          // Zero blocking tickets remain on this apartment: restore OPERATIONAL
          await txConn.query(
            'UPDATE apartments SET maintenance_status = "OPERATIONAL", updated_at = NOW() WHERE id = ?',
            [aId]
          );

          // Turnover evaluation if unit was in MAINTENANCE
          if (apt.status === 'MAINTENANCE') {
            const todayStr = new Date().toISOString().slice(0, 10);
            const [activeStays] = await txConn.query(
              `SELECT id FROM reservations 
               WHERE apartment_id = ? 
                 AND status = 'CHECKED_IN' 
                 AND check_in_date <= ? 
                 AND check_out_date > ? 
               LIMIT 1`,
              [aId, todayStr, todayStr]
            );
            if (activeStays && activeStays.length > 0) {
              await txConn.query('UPDATE apartments SET status = "OCCUPIED", updated_at = NOW() WHERE id = ?', [aId]);
            } else {
              const [blocked] = await txConn.query(
                `SELECT id FROM blocked_periods 
                 WHERE apartment_id = ? 
                   AND start_date <= ? 
                   AND end_date >= ? 
                 LIMIT 1`,
                [aId, todayStr, todayStr]
              );
              if (blocked && blocked.length > 0) {
                await txConn.query('UPDATE apartments SET status = "BLOCKED", updated_at = NOW() WHERE id = ?', [aId]);
              } else {
                await txConn.query(
                  'UPDATE apartments SET status = "CLEANING", housekeeping_status = "DIRTY", updated_at = NOW() WHERE id = ?',
                  [aId]
                );
              }
            }
          }
        }
      }

      return true;
    };

    if (conn) {
      return await executeInTx(conn);
    } else {
      return await pool.withTransaction(executeInTx);
    }
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
