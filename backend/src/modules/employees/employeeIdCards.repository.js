const pool = require('../../db/pool');

class EmployeeIdCardsRepository {
  /**
   * Find cards with filtering
   */
  static async findAll({ employeeId, propertyId, status, page = 1, limit = 20, user = null } = {}) {
    let sql = `
      SELECT 
        c.*,
        e.full_name AS employee_name,
        e.employee_code,
        e.department,
        e.job_title,
        e.photo_url AS employee_photo_url,
        e.employment_status,
        p.name AS property_name,
        gu.name AS generated_by_name,
        ru.name AS revoked_by_name
      FROM employee_id_cards c
      JOIN employees e ON e.id = c.employee_id
      LEFT JOIN properties p ON p.id = c.property_id
      JOIN users gu ON gu.id = c.generated_by_id
      LEFT JOIN users ru ON ru.id = c.revoked_by_id
      WHERE 1=1
    `;
    const params = [];

    if (employeeId) {
      sql += ' AND c.employee_id = ?';
      params.push(employeeId);
    }

    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((user.role || '').toUpperCase())) {
      sql += ' AND (c.property_id = ? OR c.property_id IS NULL)';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND c.property_id = ?';
      params.push(propertyId);
    }

    if (status && status !== 'ALL') {
      sql += ' AND c.status = ?';
      params.push(status);
    }

    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS sub`;
    const [countRows] = await pool.query(countSql, params);
    const total = parseInt(countRows?.total || 0, 10);

    sql += ' ORDER BY c.id DESC';
    const numLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const numPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (numPage - 1) * numLimit;

    sql += ' LIMIT ? OFFSET ?';
    params.push(numLimit, offset);

    const rows = await pool.query(sql, params);

    return {
      cards: rows,
      pagination: {
        total,
        page: numPage,
        limit: numLimit,
        totalPages: Math.ceil(total / numLimit) || 1,
      },
    };
  }

  /**
   * Find single card by ID
   */
  static async findById(id) {
    const sql = `
      SELECT 
        c.*,
        e.full_name AS employee_name,
        e.employee_code,
        e.department,
        e.job_title,
        e.photo_url AS employee_photo_url,
        e.email AS employee_email,
        e.phone AS employee_phone,
        e.employment_status,
        p.name AS property_name,
        gu.name AS generated_by_name,
        ru.name AS revoked_by_name
      FROM employee_id_cards c
      JOIN employees e ON e.id = c.employee_id
      LEFT JOIN properties p ON p.id = c.property_id
      JOIN users gu ON gu.id = c.generated_by_id
      LEFT JOIN users ru ON ru.id = c.revoked_by_id
      WHERE c.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Find active card for employee
   */
  static async findActiveByEmployeeId(employeeId) {
    const sql = `
      SELECT c.*, e.full_name AS employee_name, e.employee_code, e.department, e.job_title, e.photo_url AS employee_photo_url
      FROM employee_id_cards c
      JOIN employees e ON e.id = c.employee_id
      WHERE c.employee_id = ? AND c.status = 'ACTIVE'
      ORDER BY c.id DESC LIMIT 1
    `;
    const rows = await pool.query(sql, [employeeId]);
    return rows[0] || null;
  }

  /**
   * Find all cards for an employee
   */
  static async findByEmployeeId(employeeId) {
    const sql = `
      SELECT c.*, e.full_name AS employee_name, e.full_name, e.employee_code, e.department, e.job_title, e.photo_url AS employee_photo_url
      FROM employee_id_cards c
      JOIN employees e ON e.id = c.employee_id
      WHERE c.employee_id = ?
      ORDER BY c.id DESC
    `;
    return pool.query(sql, [employeeId]);
  }

  /**
   * Find card by verification token (for QR verification)
   */
  static async findByVerificationToken(token) {
    const sql = `
      SELECT 
        c.card_number,
        c.status AS card_status,
        c.issued_at,
        c.expires_at,
        e.employee_code,
        e.full_name,
        e.full_name AS employee_name,
        e.job_title,
        e.department,
        e.employment_status,
        p.name AS property_name
      FROM employee_id_cards c
      JOIN employees e ON e.id = c.employee_id
      LEFT JOIN properties p ON p.id = c.property_id
      WHERE c.verification_token = ?
    `;
    const rows = await pool.query(sql, [token]);
    return rows[0] || null;
  }

  /**
   * Create ID card
   */
  static async create(data, conn = null) {
    const executor = conn || pool;
    const sql = `
      INSERT INTO employee_id_cards (
        card_number, employee_id, property_id, status,
        verification_token, issued_at, expires_at,
        generated_by_id, reissued_from_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.card_number,
      data.employee_id,
      data.property_id || null,
      data.status || 'ACTIVE',
      data.verification_token,
      data.issued_at,
      data.expires_at,
      data.generated_by_id,
      data.reissued_from_id || null,
    ];
    const res = await executor.query(sql, params);
    return res.insertId || res[0]?.insertId;
  }

  /**
   * Update ID card
   */
  static async update(id, data, conn = null) {
    const executor = conn || pool;
    const fields = [];
    const params = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      params.push(data.status);
    }
    if (data.revoked_by_id !== undefined) {
      fields.push('revoked_by_id = ?');
      params.push(data.revoked_by_id);
    }
    if (data.revoked_at !== undefined) {
      fields.push('revoked_at = ?');
      params.push(data.revoked_at);
    }
    if (data.revocation_reason !== undefined) {
      fields.push('revocation_reason = ?');
      params.push(data.revocation_reason);
    }

    if (fields.length === 0) return;

    const sql = `UPDATE employee_id_cards SET ${fields.join(', ')} WHERE id = ?`;
    params.push(id);
    await executor.query(sql, params);
  }
}

module.exports = EmployeeIdCardsRepository;
