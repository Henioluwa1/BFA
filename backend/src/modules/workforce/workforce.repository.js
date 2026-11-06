const pool = require('../../db/pool');

class WorkforceRepository {
  // ─── Shift Templates ───────────────────────────────────────────────
  static async createTemplate(data) {
    const sql = `
      INSERT INTO shift_templates 
        (property_id, department, name, start_time, end_time, break_minutes, required_staff_count, color_code, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.property_id || null,
      data.department || 'OPERATIONS',
      data.name,
      data.start_time,
      data.end_time,
      data.break_minutes || 60,
      data.required_staff_count || 1,
      data.color_code || '#2563eb',
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
    ];
    const res = await pool.query(sql, params);
    return res.insertId;
  }

  static async listTemplates(propertyId = null) {
    let sql = 'SELECT * FROM shift_templates WHERE is_active = 1';
    const params = [];
    if (propertyId) {
      sql += ' AND (property_id = ? OR property_id IS NULL)';
      params.push(propertyId);
    }
    sql += ' ORDER BY name ASC';
    return pool.query(sql, params);
  }

  static async getTemplateById(id) {
    const rows = await pool.query('SELECT * FROM shift_templates WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async updateTemplate(id, data) {
    const fields = [];
    const params = [];
    const allowed = ['name', 'department', 'start_time', 'end_time', 'break_minutes', 'required_staff_count', 'color_code', 'is_active'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }
    if (fields.length === 0) return;
    params.push(id);
    await pool.query(`UPDATE shift_templates SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  static async deleteTemplate(id) {
    await pool.query('UPDATE shift_templates SET is_active = 0 WHERE id = ?', [id]);
  }

  // ─── Rosters ────────────────────────────────────────────────────────
  static async createRoster(data) {
    const sql = `
      INSERT INTO rosters 
        (roster_code, property_id, title, start_date, end_date, status, notes, created_by_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.roster_code,
      data.property_id,
      data.title,
      data.start_date,
      data.end_date,
      data.status || 'DRAFT',
      data.notes || null,
      data.created_by_id,
    ];
    const res = await pool.query(sql, params);
    return res.insertId;
  }

  static async listRosters({ propertyId = null, status = null, startDate = null, endDate = null }) {
    let sql = `
      SELECT r.*, p.name AS property_name, p.code AS property_code,
             u.name AS created_by_name, pub.name AS published_by_name,
             (SELECT COUNT(*) FROM shifts s WHERE s.roster_id = r.id) AS total_shifts_count,
             (SELECT COUNT(*) FROM shifts s WHERE s.roster_id = r.id AND s.employee_id IS NOT NULL) AS assigned_shifts_count
      FROM rosters r
      JOIN properties p ON r.property_id = p.id
      JOIN users u ON r.created_by_id = u.id
      LEFT JOIN users pub ON r.published_by_id = pub.id
      WHERE 1=1
    `;
    const params = [];
    if (propertyId) {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }
    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }
    if (startDate) {
      sql += ' AND r.end_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND r.start_date <= ?';
      params.push(endDate);
    }
    sql += ' ORDER BY r.start_date DESC, r.id DESC';
    return pool.query(sql, params);
  }

  static async getRosterById(id) {
    const sql = `
      SELECT r.*, p.name AS property_name, p.code AS property_code,
             u.name AS created_by_name, pub.name AS published_by_name
      FROM rosters r
      JOIN properties p ON r.property_id = p.id
      JOIN users u ON r.created_by_id = u.id
      LEFT JOIN users pub ON r.published_by_id = pub.id
      WHERE r.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  static async updateRoster(id, data) {
    const fields = [];
    const params = [];
    const allowed = ['title', 'start_date', 'end_date', 'status', 'notes', 'published_by_id', 'published_at'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }
    if (fields.length === 0) return;
    params.push(id);
    await pool.query(`UPDATE rosters SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  // ─── Shifts ─────────────────────────────────────────────────────────
  static async createShift(data) {
    const sql = `
      INSERT INTO shifts 
        (roster_id, property_id, department, employee_id, template_id, shift_date, start_time, end_time, break_minutes, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.roster_id,
      data.property_id,
      data.department || 'OPERATIONS',
      data.employee_id || null,
      data.template_id || null,
      data.shift_date,
      data.start_time,
      data.end_time,
      data.break_minutes || 60,
      data.status || 'SCHEDULED',
      data.notes || null,
    ];
    const res = await pool.query(sql, params);
    return res.insertId;
  }

  static async bulkCreateShifts(shifts) {
    if (!shifts || shifts.length === 0) return [];
    const createdIds = [];
    for (const s of shifts) {
      const id = await this.createShift(s);
      createdIds.push(id);
    }
    return createdIds;
  }

  static async listShifts({ rosterId = null, propertyId = null, employeeId = null, startDate = null, endDate = null, department = null }) {
    let sql = `
      SELECT s.*, 
             e.full_name AS employee_name, e.employee_code, e.job_title, e.email AS employee_email,
             p.name AS property_name, p.code AS property_code,
             st.name AS template_name, st.color_code,
             r.title AS roster_title, r.status AS roster_status
      FROM shifts s
      JOIN properties p ON s.property_id = p.id
      JOIN rosters r ON s.roster_id = r.id
      LEFT JOIN employees e ON s.employee_id = e.id
      LEFT JOIN shift_templates st ON s.template_id = st.id
      WHERE 1=1
    `;
    const params = [];
    if (rosterId) {
      sql += ' AND s.roster_id = ?';
      params.push(rosterId);
    }
    if (propertyId) {
      sql += ' AND s.property_id = ?';
      params.push(propertyId);
    }
    if (employeeId) {
      sql += ' AND s.employee_id = ?';
      params.push(employeeId);
    }
    if (startDate) {
      sql += ' AND s.shift_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND s.shift_date <= ?';
      params.push(endDate);
    }
    if (department) {
      sql += ' AND s.department = ?';
      params.push(department);
    }
    sql += ' ORDER BY s.shift_date ASC, s.start_time ASC, s.id ASC';
    return pool.query(sql, params);
  }

  static async getShiftById(id) {
    const sql = `
      SELECT s.*, 
             e.full_name AS employee_name, e.employee_code, e.job_title, e.email AS employee_email,
             p.name AS property_name, p.code AS property_code,
             st.name AS template_name, st.color_code,
             r.title AS roster_title, r.status AS roster_status
      FROM shifts s
      JOIN properties p ON s.property_id = p.id
      JOIN rosters r ON s.roster_id = r.id
      LEFT JOIN employees e ON s.employee_id = e.id
      LEFT JOIN shift_templates st ON s.template_id = st.id
      WHERE s.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  static async updateShift(id, data) {
    const fields = [];
    const params = [];
    const allowed = ['employee_id', 'department', 'template_id', 'shift_date', 'start_time', 'end_time', 'break_minutes', 'status', 'notes'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }
    if (fields.length === 0) return;
    params.push(id);
    await pool.query(`UPDATE shifts SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  static async deleteShift(id) {
    await pool.query('DELETE FROM shifts WHERE id = ?', [id]);
  }

  static async findConflictingShifts(employeeId, shiftDate, startTime, endTime, excludeShiftId = null) {
    let sql = `
      SELECT s.*, st.name AS template_name, p.name AS property_name
      FROM shifts s
      LEFT JOIN shift_templates st ON s.template_id = st.id
      LEFT JOIN properties p ON s.property_id = p.id
      WHERE s.employee_id = ?
        AND s.shift_date = ?
        AND s.status NOT IN ('CANCELLED', 'SWAPPED')
        AND (
          (s.start_time <= ? AND s.end_time > ?) OR
          (s.start_time < ? AND s.end_time >= ?) OR
          (s.start_time >= ? AND s.end_time <= ?)
        )
    `;
    const params = [employeeId, shiftDate, startTime, startTime, endTime, endTime, startTime, endTime];
    if (excludeShiftId) {
      sql += ' AND s.id != ?';
      params.push(excludeShiftId);
    }
    return pool.query(sql, params);
  }

  static async getEmployeeWeeklyHours(employeeId, startDate, endDate) {
    const sql = `
      SELECT SUM(
        TIME_TO_SEC(TIMEDIFF(end_time, start_time)) / 3600 - (break_minutes / 60)
      ) AS total_hours
      FROM shifts
      WHERE employee_id = ?
        AND shift_date BETWEEN ? AND ?
        AND status NOT IN ('CANCELLED')
    `;
    const rows = await pool.query(sql, [employeeId, startDate, endDate]);
    return parseFloat(rows[0]?.total_hours || 0);
  }

  // ─── Employee Availability ──────────────────────────────────────────
  static async setAvailability(data) {
    const sql = `
      INSERT INTO employee_availability 
        (employee_id, date, availability_status, preferred_shift_id, notes)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        availability_status = VALUES(availability_status),
        preferred_shift_id = VALUES(preferred_shift_id),
        notes = VALUES(notes),
        updated_at = CURRENT_TIMESTAMP
    `;
    const params = [
      data.employee_id,
      data.date,
      data.availability_status || 'AVAILABLE',
      data.preferred_shift_id || null,
      data.notes || null,
    ];
    await pool.query(sql, params);
  }

  static async getAvailability({ employeeId = null, propertyId = null, startDate = null, endDate = null }) {
    let sql = `
      SELECT ea.*, e.full_name AS employee_name, e.employee_code, e.property_id,
             st.name AS preferred_shift_name
      FROM employee_availability ea
      JOIN employees e ON ea.employee_id = e.id
      LEFT JOIN shift_templates st ON ea.preferred_shift_id = st.id
      WHERE 1=1
    `;
    const params = [];
    if (employeeId) {
      sql += ' AND ea.employee_id = ?';
      params.push(employeeId);
    }
    if (propertyId) {
      sql += ' AND e.property_id = ?';
      params.push(propertyId);
    }
    if (startDate) {
      sql += ' AND ea.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND ea.date <= ?';
      params.push(endDate);
    }
    sql += ' ORDER BY ea.date ASC, e.full_name ASC';
    return pool.query(sql, params);
  }

  static async deleteAvailability(employeeId, date) {
    await pool.query('DELETE FROM employee_availability WHERE employee_id = ? AND date = ?', [employeeId, date]);
  }

  // ─── Shift Swap Requests ────────────────────────────────────────────
  static async createSwapRequest(data) {
    const sql = `
      INSERT INTO shift_swap_requests 
        (shift_id, requesting_employee_id, target_employee_id, target_shift_id, reason, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `;
    const params = [
      data.shift_id,
      data.requesting_employee_id,
      data.target_employee_id || null,
      data.target_shift_id || null,
      data.reason,
    ];
    const res = await pool.query(sql, params);
    return res.insertId;
  }

  static async listSwapRequests({ propertyId = null, employeeId = null, status = null }) {
    let sql = `
      SELECT ssr.*, 
             s.shift_date, s.start_time, s.end_time, s.department, s.property_id,
             p.name AS property_name,
             req_e.full_name AS requesting_employee_name, req_e.employee_code AS requesting_employee_code,
             tgt_e.full_name AS target_employee_name, tgt_e.employee_code AS target_employee_code,
             rev.name AS reviewer_name
      FROM shift_swap_requests ssr
      JOIN shifts s ON ssr.shift_id = s.id
      JOIN properties p ON s.property_id = p.id
      JOIN employees req_e ON ssr.requesting_employee_id = req_e.id
      LEFT JOIN employees tgt_e ON ssr.target_employee_id = tgt_e.id
      LEFT JOIN users rev ON ssr.reviewed_by_id = rev.id
      WHERE 1=1
    `;
    const params = [];
    if (propertyId) {
      sql += ' AND s.property_id = ?';
      params.push(propertyId);
    }
    if (employeeId) {
      sql += ' AND (ssr.requesting_employee_id = ? OR ssr.target_employee_id = ?)';
      params.push(employeeId, employeeId);
    }
    if (status) {
      sql += ' AND ssr.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY ssr.created_at DESC';
    return pool.query(sql, params);
  }

  static async getSwapRequestById(id) {
    const sql = `
      SELECT ssr.*, 
             s.shift_date, s.start_time, s.end_time, s.department, s.property_id,
             s.employee_id AS current_shift_employee_id,
             p.name AS property_name,
             req_e.full_name AS requesting_employee_name,
             tgt_e.full_name AS target_employee_name
      FROM shift_swap_requests ssr
      JOIN shifts s ON ssr.shift_id = s.id
      JOIN properties p ON s.property_id = p.id
      JOIN employees req_e ON ssr.requesting_employee_id = req_e.id
      LEFT JOIN employees tgt_e ON ssr.target_employee_id = tgt_e.id
      WHERE ssr.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  static async updateSwapStatus(id, { status, reviewed_by_id, review_notes }) {
    await pool.query(
      `UPDATE shift_swap_requests 
       SET status = ?, reviewed_by_id = ?, review_notes = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, reviewed_by_id, review_notes || null, id]
    );
  }

  // ─── Attendance Records ─────────────────────────────────────────────
  static async createAttendance(data) {
    const sql = `
      INSERT INTO attendance_records 
        (employee_id, property_id, shift_id, work_date, clock_in_time, clock_out_time, clock_in_method, 
         location_lat, location_lng, attendance_status, scheduled_hours, actual_hours, overtime_hours,
         total_break_minutes, is_verified, verified_by_id, verified_at, verification_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.employee_id,
      data.property_id,
      data.shift_id || null,
      data.work_date,
      data.clock_in_time,
      data.clock_out_time || null,
      data.clock_in_method || 'WEB',
      data.location_lat || null,
      data.location_lng || null,
      data.attendance_status || 'PRESENT',
      data.scheduled_hours || 8.00,
      data.actual_hours || 0.00,
      data.overtime_hours || 0.00,
      data.total_break_minutes || 0,
      data.is_verified != null ? data.is_verified : 1,
      data.verified_by_id || null,
      data.verified_at || null,
      data.verification_notes || null,
    ];
    const res = await pool.query(sql, params);
    return res.insertId;
  }

  static async getTodayActiveAttendance(employeeId, workDate) {
    const sql = `
      SELECT * FROM attendance_records 
      WHERE employee_id = ? AND work_date = ? AND clock_out_time IS NULL
      ORDER BY id DESC LIMIT 1
    `;
    const rows = await pool.query(sql, [employeeId, workDate]);
    return rows[0] || null;
  }

  static async getAttendanceById(id) {
    const sql = `
      SELECT ar.*, e.full_name AS employee_name, e.employee_code, e.job_title,
             p.name AS property_name, p.code AS property_code,
             s.start_time AS scheduled_start, s.end_time AS scheduled_end
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      JOIN properties p ON ar.property_id = p.id
      LEFT JOIN shifts s ON ar.shift_id = s.id
      WHERE ar.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  static async updateAttendance(id, data) {
    const fields = [];
    const params = [];
    const allowed = [
      'clock_out_time', 'break_start_time', 'break_end_time', 'total_break_minutes',
      'scheduled_hours', 'actual_hours', 'overtime_hours', 'attendance_status',
      'verification_notes', 'is_verified', 'verified_by_id', 'verified_at'
    ];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }
    if (fields.length === 0) return;
    params.push(id);
    await pool.query(`UPDATE attendance_records SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  static async listAttendance({ propertyId = null, employeeId = null, startDate = null, endDate = null, status = null }) {
    let sql = `
      SELECT ar.*, 
             e.full_name AS employee_name, e.employee_code, e.job_title, e.department,
             p.name AS property_name, p.code AS property_code,
             ver.name AS verified_by_name
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      JOIN properties p ON ar.property_id = p.id
      LEFT JOIN users ver ON ar.verified_by_id = ver.id
      WHERE 1=1
    `;
    const params = [];
    if (propertyId) {
      sql += ' AND ar.property_id = ?';
      params.push(propertyId);
    }
    if (employeeId) {
      sql += ' AND ar.employee_id = ?';
      params.push(employeeId);
    }
    if (startDate) {
      sql += ' AND ar.work_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND ar.work_date <= ?';
      params.push(endDate);
    }
    if (status) {
      sql += ' AND ar.attendance_status = ?';
      params.push(status);
    }
    sql += ' ORDER BY ar.work_date DESC, ar.clock_in_time DESC';
    return pool.query(sql, params);
  }

  // ─── Attendance Corrections ─────────────────────────────────────────
  static async createAttendanceCorrection(data) {
    const sql = `
      INSERT INTO attendance_corrections 
        (attendance_record_id, employee_id, requested_clock_in, requested_clock_out, reason, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `;
    const params = [
      data.attendance_record_id,
      data.employee_id,
      data.requested_clock_in,
      data.requested_clock_out,
      data.reason,
    ];
    const res = await pool.query(sql, params);
    return res.insertId;
  }

  static async listAttendanceCorrections({ propertyId = null, employeeId = null, status = null }) {
    let sql = `
      SELECT ac.*, 
             ar.work_date, ar.clock_in_time AS original_clock_in, ar.clock_out_time AS original_clock_out,
             ar.property_id, p.name AS property_name,
             e.full_name AS employee_name, e.employee_code,
             rev.name AS reviewer_name
      FROM attendance_corrections ac
      JOIN attendance_records ar ON ac.attendance_record_id = ar.id
      JOIN properties p ON ar.property_id = p.id
      JOIN employees e ON ac.employee_id = e.id
      LEFT JOIN users rev ON ac.reviewed_by_id = rev.id
      WHERE 1=1
    `;
    const params = [];
    if (propertyId) {
      sql += ' AND ar.property_id = ?';
      params.push(propertyId);
    }
    if (employeeId) {
      sql += ' AND ac.employee_id = ?';
      params.push(employeeId);
    }
    if (status) {
      sql += ' AND ac.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY ac.created_at DESC';
    return pool.query(sql, params);
  }

  static async getAttendanceCorrectionById(id) {
    const sql = `
      SELECT ac.*, 
             ar.property_id, ar.work_date, ar.clock_in_time AS original_clock_in, ar.clock_out_time AS original_clock_out,
             ar.scheduled_hours,
             e.full_name AS employee_name, e.employee_code
      FROM attendance_corrections ac
      JOIN attendance_records ar ON ac.attendance_record_id = ar.id
      JOIN employees e ON ac.employee_id = e.id
      WHERE ac.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  static async updateCorrectionStatus(id, { status, reviewed_by_id, review_notes }) {
    await pool.query(
      `UPDATE attendance_corrections 
       SET status = ?, reviewed_by_id = ?, review_notes = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, reviewed_by_id, review_notes || null, id]
    );
  }

  // ─── Leave Categories & Management ──────────────────────────────────
  static async listLeaveCategories() {
    return pool.query('SELECT * FROM leave_categories WHERE is_active = 1 ORDER BY name ASC');
  }

  static async getLeaveCategoryById(id) {
    const rows = await pool.query('SELECT * FROM leave_categories WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async createLeaveRequest(data) {
    const sql = `
      INSERT INTO leave_requests 
        (request_code, employee_id, property_id, leave_category_id, start_date, end_date, total_days, reason, document_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.request_code,
      data.employee_id,
      data.property_id,
      data.leave_category_id,
      data.start_date,
      data.end_date,
      data.total_days || 1,
      data.reason,
      data.document_url || null,
      data.status || 'PENDING_MANAGER',
    ];
    const res = await pool.query(sql, params);
    return res.insertId;
  }

  static async listLeaveRequests({ propertyId = null, employeeId = null, status = null, startDate = null, endDate = null }) {
    let sql = `
      SELECT lr.*, 
             e.full_name AS employee_name, e.employee_code, e.job_title, e.department,
             p.name AS property_name, p.code AS property_code,
             lc.name AS category_name, lc.code AS category_code, lc.is_paid,
             mgr.name AS manager_name, adm.name AS admin_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN properties p ON lr.property_id = p.id
      JOIN leave_categories lc ON lr.leave_category_id = lc.id
      LEFT JOIN users mgr ON lr.manager_reviewed_by_id = mgr.id
      LEFT JOIN users adm ON lr.admin_reviewed_by_id = adm.id
      WHERE 1=1
    `;
    const params = [];
    if (propertyId) {
      sql += ' AND lr.property_id = ?';
      params.push(propertyId);
    }
    if (employeeId) {
      sql += ' AND lr.employee_id = ?';
      params.push(employeeId);
    }
    if (status) {
      sql += ' AND lr.status = ?';
      params.push(status);
    }
    if (startDate) {
      sql += ' AND lr.end_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND lr.start_date <= ?';
      params.push(endDate);
    }
    sql += ' ORDER BY lr.created_at DESC';
    return pool.query(sql, params);
  }

  static async getLeaveRequestById(id) {
    const sql = `
      SELECT lr.*, 
             e.full_name AS employee_name, e.employee_code, e.job_title, e.department,
             p.name AS property_name,
             lc.name AS category_name, lc.code AS category_code, lc.is_paid
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN properties p ON lr.property_id = p.id
      JOIN leave_categories lc ON lr.leave_category_id = lc.id
      WHERE lr.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  static async updateLeaveRequest(id, data) {
    const fields = [];
    const params = [];
    const allowed = [
      'status', 'manager_reviewed_by_id', 'manager_decision', 'manager_notes', 'manager_reviewed_at',
      'admin_reviewed_by_id', 'admin_decision', 'admin_notes', 'admin_reviewed_at'
    ];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }
    if (fields.length === 0) return;
    params.push(id);
    await pool.query(`UPDATE leave_requests SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  static async getLeaveBalances(employeeId, year = new Date().getFullYear()) {
    const sql = `
      SELECT lc.id AS leave_category_id, lc.code AS category_code, lc.name AS category_name, lc.is_paid,
             COALESCE(lb.total_allocated, lc.default_days_per_year) AS total_allocated,
             COALESCE(lb.used_days, 0) AS used_days,
             COALESCE(lb.pending_days, 0) AS pending_days,
             COALESCE(lb.remaining_days, lc.default_days_per_year) AS remaining_days
      FROM leave_categories lc
      LEFT JOIN leave_balances lb ON lc.id = lb.leave_category_id AND lb.employee_id = ? AND lb.year = ?
      WHERE lc.is_active = 1
      ORDER BY lc.name ASC
    `;
    return pool.query(sql, [employeeId, year]);
  }

  static async updateLeaveBalance(employeeId, categoryId, year, { usedDaysDelta = 0, pendingDaysDelta = 0 }) {
    // Ensure record exists
    const category = await this.getLeaveCategoryById(categoryId);
    const defaultAllocated = category?.default_days_per_year || 14;

    const sql = `
      INSERT INTO leave_balances 
        (employee_id, leave_category_id, year, total_allocated, used_days, pending_days, remaining_days)
      VALUES (?, ?, ?, ?, GREATEST(0, ?), GREATEST(0, ?), GREATEST(0, ? - ?))
      ON DUPLICATE KEY UPDATE 
        used_days = GREATEST(0, used_days + VALUES(used_days)),
        pending_days = GREATEST(0, pending_days + VALUES(pending_days)),
        remaining_days = GREATEST(0, total_allocated - (used_days + VALUES(used_days)))
    `;
    await pool.query(sql, [
      employeeId, categoryId, year, defaultAllocated,
      usedDaysDelta, pendingDaysDelta, defaultAllocated, usedDaysDelta
    ]);
  }

  static async findConflictingLeave(employeeId, startDate, endDate) {
    const sql = `
      SELECT * FROM leave_requests 
      WHERE employee_id = ?
        AND status = 'APPROVED'
        AND start_date <= ? AND end_date >= ?
    `;
    return pool.query(sql, [employeeId, endDate, startDate]);
  }

  // ─── Payroll-Ready Timesheet Aggregation ────────────────────────────
  static async getTimesheetSummary({ propertyId = null, department = null, startDate, endDate, employeeId = null }) {
    let sql = `
      SELECT 
        e.id AS employee_id, e.employee_code, e.full_name AS employee_name, 
        e.department, e.job_title,
        p.id AS property_id, p.name AS property_name, p.code AS property_code,
        COUNT(DISTINCT ar.id) AS days_present,
        COALESCE(SUM(ar.scheduled_hours), 0.00) AS total_scheduled_hours,
        COALESCE(SUM(ar.actual_hours), 0.00) AS total_actual_hours,
        COALESCE(SUM(ar.overtime_hours), 0.00) AS total_overtime_hours,
        COALESCE(SUM(CASE WHEN ar.attendance_status = 'LATE' THEN 1 ELSE 0 END), 0) AS late_arrivals_count,
        COALESCE(SUM(CASE WHEN ar.attendance_status = 'EARLY_DEPARTURE' THEN 1 ELSE 0 END), 0) AS early_departures_count,
        (
          SELECT COALESCE(SUM(lr.total_days), 0)
          FROM leave_requests lr
          WHERE lr.employee_id = e.id 
            AND lr.status = 'APPROVED'
            AND lr.start_date <= ? AND lr.end_date >= ?
        ) AS approved_leave_days
      FROM employees e
      JOIN properties p ON e.property_id = p.id
      LEFT JOIN attendance_records ar ON e.id = ar.employee_id 
        AND ar.work_date BETWEEN ? AND ?
      WHERE e.employment_status = 'ACTIVE'
    `;
    const params = [endDate, startDate, startDate, endDate];

    if (propertyId) {
      sql += ' AND e.property_id = ?';
      params.push(propertyId);
    }
    if (department) {
      sql += ' AND e.department = ?';
      params.push(department);
    }
    if (employeeId) {
      sql += ' AND e.id = ?';
      params.push(employeeId);
    }

    sql += ' GROUP BY e.id, p.id ORDER BY p.name ASC, e.full_name ASC';
    return pool.query(sql, params);
  }

  // ─── Attendance Policies ───────────────────────────────────────────────
  static async getAttendancePolicy(propertyId = null) {
    if (propertyId) {
      const rows = await pool.query('SELECT * FROM attendance_policies WHERE property_id = ?', [propertyId]);
      if (rows.length > 0) return rows[0];
    }
    const globals = await pool.query('SELECT * FROM attendance_policies WHERE property_id IS NULL');
    return globals.length > 0 ? globals[0] : null;
  }

  static async upsertAttendancePolicy(propertyId, data) {
    const existing = await pool.query('SELECT id FROM attendance_policies WHERE property_id <=> ?', [propertyId]);
    if (existing.length > 0) {
      const fields = [];
      const values = [];
      for (const [key, val] of Object.entries(data)) {
        fields.push(`\`${key}\` = ?`);
        values.push(val);
      }
      values.push(existing[0].id);
      await pool.query(`UPDATE attendance_policies SET ${fields.join(', ')} WHERE id = ?`, values);
      return this.getAttendancePolicy(propertyId);
    } else {
      const keys = ['property_id', ...Object.keys(data)];
      const placeholders = keys.map(() => '?').join(', ');
      const values = [propertyId, ...Object.values(data)];
      await pool.query(`INSERT INTO attendance_policies (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`, values);
      return this.getAttendancePolicy(propertyId);
    }
  }

  // ─── Property Kiosks ───────────────────────────────────────────────────
  static async createKiosk(data) {
    const sql = `
      INSERT INTO property_kiosks (property_id, kiosk_name, kiosk_code, kiosk_secret_hash, status, registered_by_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const result = await pool.query(sql, [
      data.property_id,
      data.kiosk_name,
      data.kiosk_code,
      data.kiosk_secret_hash,
      data.status || 'ACTIVE',
      data.registered_by_id,
    ]);
    return result.insertId;
  }

  static async listKiosks(propertyId = null) {
    let sql = `
      SELECT k.id, k.property_id, k.kiosk_name, k.kiosk_code, k.status, k.registered_by_id,
             k.last_heartbeat_at, k.created_at, k.updated_at,
             p.name AS property_name, p.code AS property_code, u.name AS registered_by_name
      FROM property_kiosks k
      JOIN properties p ON k.property_id = p.id
      JOIN users u ON k.registered_by_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (propertyId) {
      sql += ' AND k.property_id = ?';
      params.push(propertyId);
    }
    sql += ' ORDER BY k.created_at DESC';
    return pool.query(sql, params);
  }

  static async getKioskByCode(kioskCode) {
    const rows = await pool.query('SELECT * FROM property_kiosks WHERE kiosk_code = ?', [kioskCode]);
    return rows.length > 0 ? rows[0] : null;
  }

  static async getKioskById(id) {
    const sql = `
      SELECT k.id, k.property_id, k.kiosk_name, k.kiosk_code, k.status, k.registered_by_id,
             k.last_heartbeat_at, k.created_at, k.updated_at,
             p.name AS property_name, p.code AS property_code, u.name AS registered_by_name
      FROM property_kiosks k
      JOIN properties p ON k.property_id = p.id
      JOIN users u ON k.registered_by_id = u.id
      WHERE k.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  static async updateKiosk(id, data) {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(data)) {
      fields.push(`\`${key}\` = ?`);
      values.push(val);
    }
    values.push(id);
    await pool.query(`UPDATE property_kiosks SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.getKioskById(id);
  }
}

module.exports = WorkforceRepository;

