const pool = require('../../db/pool');

class EmployeesRepository {
  /**
   * Find all employees with filtering, searching, and property scoping
   */
  static async findAll({ propertyId, department, status, search, page = 1, limit = 20, user = null } = {}) {
    let sql = `
      SELECT 
        e.*,
        e.employee_code AS staff_code,
        p.name AS property_name,
        p.code AS property_code,
        m.full_name AS manager_name,
        u.role AS user_role,
        u.status AS user_status,
        ep.date_of_birth,
        ep.gender,
        ep.address,
        ep.city,
        ep.state,
        ep.emergency_contact_name,
        ep.emergency_contact_phone,
        ep.emergency_contact_relation,
        ep.qualifications,
        ep.skills,
        ep.bio_notes,
        (SELECT c.status FROM employee_id_cards c WHERE c.employee_id = e.id AND c.status = 'ACTIVE' LIMIT 1) AS active_id_card_status,
        (SELECT c.card_number FROM employee_id_cards c WHERE c.employee_id = e.id AND c.status = 'ACTIVE' LIMIT 1) AS active_id_card_number,
        (SELECT ev.manager_overall_score FROM employee_evaluations ev WHERE ev.employee_id = e.id AND ev.status = 'FINALIZED' ORDER BY ev.period_end DESC LIMIT 1) AS latest_evaluation_score,
        (SELECT ev.status FROM employee_evaluations ev WHERE ev.employee_id = e.id ORDER BY ev.id DESC LIMIT 1) AS latest_evaluation_status
      FROM employees e
      LEFT JOIN properties p ON p.id = e.property_id
      LEFT JOIN employees m ON m.id = e.manager_id
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
      WHERE 1=1
    `;

    const params = [];

    // Property scoping
    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((user.role || '').toUpperCase())) {
      sql += ' AND (e.property_id = ? OR e.property_id IS NULL)';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND e.property_id = ?';
      params.push(propertyId);
    }

    if (department && department !== 'ALL') {
      sql += ' AND e.department = ?';
      params.push(department);
    }

    if (status && status !== 'ALL') {
      sql += ' AND e.employment_status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ' AND (e.full_name LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.employee_code LIKE ? OR e.job_title LIKE ?)';
      params.push(q, q, q, q, q);
    }

    // Count query
    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS subquery`;
    const [countRows] = await pool.query(countSql, params);
    const total = parseInt(countRows?.total || 0, 10);

    // Ordering and pagination
    sql += ' ORDER BY e.id ASC';
    const numLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const numPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (numPage - 1) * numLimit;

    sql += ' LIMIT ? OFFSET ?';
    params.push(numLimit, offset);

    const employees = await pool.query(sql, params);

    return {
      employees,
      pagination: {
        total,
        page: numPage,
        limit: numLimit,
        totalPages: Math.ceil(total / numLimit) || 1,
      },
    };
  }

  /**
   * Find employee by ID with full profile
   */
  static async findById(id) {
    const sql = `
      SELECT 
        e.*,
        e.employee_code AS staff_code,
        p.name AS property_name,
        p.code AS property_code,
        m.full_name AS manager_name,
        u.role AS user_role,
        u.email AS user_email,
        u.status AS user_status,
        ep.date_of_birth,
        ep.gender,
        ep.address,
        ep.city,
        ep.state,
        ep.postal_code,
        ep.emergency_contact_name,
        ep.emergency_contact_phone,
        ep.emergency_contact_relation,
        ep.qualifications,
        ep.skills,
        ep.bio_notes,
        (SELECT c.status FROM employee_id_cards c WHERE c.employee_id = e.id AND c.status = 'ACTIVE' LIMIT 1) AS active_id_card_status,
        (SELECT c.card_number FROM employee_id_cards c WHERE c.employee_id = e.id AND c.status = 'ACTIVE' LIMIT 1) AS active_id_card_number,
        (SELECT c.id FROM employee_id_cards c WHERE c.employee_id = e.id AND c.status = 'ACTIVE' LIMIT 1) AS active_id_card_id,
        (SELECT ev.manager_overall_score FROM employee_evaluations ev WHERE ev.employee_id = e.id AND ev.status = 'FINALIZED' ORDER BY ev.period_end DESC LIMIT 1) AS latest_evaluation_score
      FROM employees e
      LEFT JOIN properties p ON p.id = e.property_id
      LEFT JOIN employees m ON m.id = e.manager_id
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
      WHERE e.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Find employee by user_id
   */
  static async findByUserId(userId) {
    const sql = `
      SELECT e.*, p.name AS property_name
      FROM employees e
      LEFT JOIN properties p ON p.id = e.property_id
      WHERE e.user_id = ?
    `;
    const rows = await pool.query(sql, [userId]);
    return rows[0] || null;
  }

  /**
   * Find employee by employee code
   */
  static async findByCode(code) {
    const sql = 'SELECT * FROM employees WHERE employee_code = ?';
    const rows = await pool.query(sql, [code]);
    return rows[0] || null;
  }

  /**
   * Find employee by email
   */
  static async findByEmail(email) {
    const sql = 'SELECT * FROM employees WHERE LOWER(email) = LOWER(?)';
    const rows = await pool.query(sql, [email]);
    return rows[0] || null;
  }

  /**
   * Create employee record
   */
  static async create(data, conn = null) {
    const executor = conn || pool;
    const fullName = `${data.first_name.trim()} ${data.last_name.trim()}`;
    const sql = `
      INSERT INTO employees (
        employee_code, user_id, property_id, manager_id,
        first_name, last_name, full_name, email, phone,
        photo_url, department, job_title, employment_type,
        employment_status, hire_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.employee_code,
      data.user_id || null,
      data.property_id || null,
      data.manager_id || null,
      data.first_name.trim(),
      data.last_name.trim(),
      fullName,
      data.email.trim().toLowerCase(),
      data.phone.trim(),
      data.photo_url || null,
      data.department || 'OPERATIONS',
      data.job_title.trim(),
      data.employment_type || 'FULL_TIME',
      data.employment_status || 'ACTIVE',
      data.hire_date || new Date().toISOString().slice(0, 10),
    ];
    const result = await executor.query(sql, params);
    return result.insertId || result[0]?.insertId;
  }

  /**
   * Update employee record
   */
  static async update(id, data, conn = null) {
    const executor = conn || pool;
    const fields = [];
    const params = [];

    if (data.first_name !== undefined || data.last_name !== undefined) {
      if (data.first_name !== undefined) {
        fields.push('first_name = ?');
        params.push(data.first_name.trim());
      }
      if (data.last_name !== undefined) {
        fields.push('last_name = ?');
        params.push(data.last_name.trim());
      }
      if (data.full_name) {
        fields.push('full_name = ?');
        params.push(data.full_name);
      }
    }

    if (data.email !== undefined) {
      fields.push('email = ?');
      params.push(data.email.trim().toLowerCase());
    }
    if (data.phone !== undefined) {
      fields.push('phone = ?');
      params.push(data.phone.trim());
    }
    if (data.property_id !== undefined) {
      fields.push('property_id = ?');
      params.push(data.property_id || null);
    }
    if (data.manager_id !== undefined) {
      fields.push('manager_id = ?');
      params.push(data.manager_id || null);
    }
    if (data.user_id !== undefined) {
      fields.push('user_id = ?');
      params.push(data.user_id || null);
    }
    if (data.department !== undefined) {
      fields.push('department = ?');
      params.push(data.department);
    }
    if (data.job_title !== undefined) {
      fields.push('job_title = ?');
      params.push(data.job_title.trim());
    }
    if (data.employment_type !== undefined) {
      fields.push('employment_type = ?');
      params.push(data.employment_type);
    }
    if (data.employment_status !== undefined) {
      fields.push('employment_status = ?');
      params.push(data.employment_status);
    }
    if (data.photo_url !== undefined) {
      fields.push('photo_url = ?');
      params.push(data.photo_url || null);
    }
    if (data.hire_date !== undefined) {
      fields.push('hire_date = ?');
      params.push(data.hire_date);
    }
    if (data.termination_date !== undefined) {
      fields.push('termination_date = ?');
      params.push(data.termination_date || null);
    }

    if (fields.length === 0) return;

    const sql = `UPDATE employees SET ${fields.join(', ')} WHERE id = ?`;
    params.push(id);
    await executor.query(sql, params);
  }

  /**
   * Upsert profile data
   */
  static async upsertProfile(employeeId, data, conn = null) {
    const executor = conn || pool;
    const sql = `
      INSERT INTO employee_profiles (
        employee_id, date_of_birth, gender, address, city, state, postal_code,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
        qualifications, skills, bio_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        date_of_birth = VALUES(date_of_birth),
        gender = VALUES(gender),
        address = VALUES(address),
        city = VALUES(city),
        state = VALUES(state),
        postal_code = VALUES(postal_code),
        emergency_contact_name = VALUES(emergency_contact_name),
        emergency_contact_phone = VALUES(emergency_contact_phone),
        emergency_contact_relation = VALUES(emergency_contact_relation),
        qualifications = VALUES(qualifications),
        skills = VALUES(skills),
        bio_notes = VALUES(bio_notes)
    `;
    const params = [
      employeeId,
      data.date_of_birth || null,
      data.gender || null,
      data.address || null,
      data.city || null,
      data.state || null,
      data.postal_code || null,
      data.emergency_contact_name || null,
      data.emergency_contact_phone || null,
      data.emergency_contact_relation || null,
      data.qualifications || null,
      data.skills || null,
      data.bio_notes || null,
    ];
    await executor.query(sql, params);
  }

  /**
   * Get employee directory high-level summary KPIs
   */
  static async getStats({ propertyId, user } = {}) {
    let sql = 'SELECT * FROM employees WHERE 1=1';
    const params = [];

    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((user.role || '').toUpperCase())) {
      sql += ' AND (property_id = ? OR property_id IS NULL)';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND property_id = ?';
      params.push(propertyId);
    }

    const rows = await pool.query(sql, params);

    const totalEmployees = rows.length;
    const activeEmployees = rows.filter((r) => r.employment_status === 'ACTIVE').length;
    const onLeaveEmployees = rows.filter((r) => r.employment_status === 'ON_LEAVE').length;
    const suspendedEmployees = rows.filter((r) => r.employment_status === 'SUSPENDED').length;
    const terminatedEmployees = rows.filter((r) => r.employment_status === 'TERMINATED').length;

    // By department
    const byDepartment = {};
    rows.forEach((r) => {
      byDepartment[r.department] = (byDepartment[r.department] || 0) + 1;
    });

    return {
      totalEmployees,
      activeEmployees,
      onLeaveEmployees,
      suspendedEmployees,
      terminatedEmployees,
      byDepartment,
    };
  }

  /**
   * Delete employee
   */
  static async delete(id, conn = null) {
    const executor = conn || pool;
    await executor.query('DELETE FROM employees WHERE id = ?', [id]);
  }
}

module.exports = EmployeesRepository;
