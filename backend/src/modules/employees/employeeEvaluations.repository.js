const pool = require('../../db/pool');

class EmployeeEvaluationsRepository {
  /**
   * Get all active evaluation criteria
   */
  static async getCriteria() {
    const sql = 'SELECT * FROM employee_evaluation_criteria WHERE is_active = 1 ORDER BY display_order ASC, id ASC';
    return pool.query(sql);
  }

  /**
   * Find all evaluations with filtering
   */
  static async findAll({ employeeId, propertyId, status, page = 1, limit = 20, user = null } = {}) {
    let sql = `
      SELECT 
        ev.*,
        e.full_name AS employee_name,
        e.employee_code,
        e.department,
        e.job_title,
        p.name AS property_name,
        u.name AS evaluator_name,
        fu.name AS finalized_by_name
      FROM employee_evaluations ev
      JOIN employees e ON e.id = ev.employee_id
      LEFT JOIN properties p ON p.id = ev.property_id
      JOIN users u ON u.id = ev.evaluator_id
      LEFT JOIN users fu ON fu.id = ev.finalized_by_id
      WHERE 1=1
    `;
    const params = [];

    if (employeeId) {
      sql += ' AND ev.employee_id = ?';
      params.push(employeeId);
    }

    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((user.role || '').toUpperCase())) {
      sql += ' AND (ev.property_id = ? OR ev.property_id IS NULL)';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND ev.property_id = ?';
      params.push(propertyId);
    }

    if (status && status !== 'ALL') {
      sql += ' AND ev.status = ?';
      params.push(status);
    }

    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS sub`;
    const [countRows] = await pool.query(countSql, params);
    const total = parseInt(countRows?.total || 0, 10);

    sql += ' ORDER BY ev.period_end DESC, ev.id DESC';
    const numLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const numPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (numPage - 1) * numLimit;

    sql += ' LIMIT ? OFFSET ?';
    params.push(numLimit, offset);

    const rows = await pool.query(sql, params);

    return {
      evaluations: rows,
      pagination: {
        total,
        page: numPage,
        limit: numLimit,
        totalPages: Math.ceil(total / numLimit) || 1,
      },
    };
  }

  /**
   * Find single evaluation by ID with criteria scores
   */
  static async findById(id) {
    const sql = `
      SELECT 
        ev.*,
        e.full_name AS employee_name,
        e.employee_code,
        e.department,
        e.job_title,
        e.email AS employee_email,
        e.photo_url AS employee_photo_url,
        p.name AS property_name,
        u.name AS evaluator_name,
        u.email AS evaluator_email,
        fu.name AS finalized_by_name
      FROM employee_evaluations ev
      JOIN employees e ON e.id = ev.employee_id
      LEFT JOIN properties p ON p.id = ev.property_id
      JOIN users u ON u.id = ev.evaluator_id
      LEFT JOIN users fu ON fu.id = ev.finalized_by_id
      WHERE ev.id = ?
    `;
    const rows = await pool.query(sql, [id]);
    if (rows.length === 0) return null;

    const evaluation = rows[0];

    // Fetch dimension scores
    const scoresSql = `
      SELECT 
        es.*,
        c.code AS criterion_code,
        c.name AS criterion_name,
        c.category AS criterion_category,
        c.weight,
        c.max_score,
        c.display_order
      FROM employee_evaluation_scores es
      JOIN employee_evaluation_criteria c ON c.id = es.criterion_id
      WHERE es.evaluation_id = ?
      ORDER BY c.display_order ASC, c.id ASC
    `;
    const scores = await pool.query(scoresSql, [id]);
    evaluation.scores = scores;
    evaluation.average_score = evaluation.manager_overall_score != null ? parseFloat(evaluation.manager_overall_score) : null;
    evaluation.manager_overall_score = evaluation.average_score;

    return evaluation;
  }

  /**
   * Find by code
   */
  static async findByCode(code) {
    const sql = 'SELECT * FROM employee_evaluations WHERE evaluation_code = ?';
    const rows = await pool.query(sql, [code]);
    return rows[0] || null;
  }

  /**
   * Check for duplicate evaluation in period
   */
  static async findExistingInPeriod(employeeId, periodStart, periodEnd) {
    const sql = `
      SELECT id, evaluation_code, status 
      FROM employee_evaluations 
      WHERE employee_id = ? 
        AND period_start = ? 
        AND period_end = ? 
      LIMIT 1
    `;
    const rows = await pool.query(sql, [employeeId, periodStart, periodEnd]);
    return rows[0] || null;
  }

  /**
   * Create evaluation header
   */
  static async create(data, conn = null) {
    const executor = conn || pool;
    const sql = `
      INSERT INTO employee_evaluations (
        evaluation_code, employee_id, evaluator_id, property_id,
        period_start, period_end, evaluation_period_label, status,
        system_metrics_snapshot, manager_overall_score, strengths,
        areas_for_improvement, evaluator_comments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.evaluation_code,
      data.employee_id,
      data.evaluator_id,
      data.property_id || null,
      data.period_start,
      data.period_end,
      data.evaluation_period_label,
      data.status || 'DRAFT',
      data.system_metrics_snapshot ? JSON.stringify(data.system_metrics_snapshot) : null,
      data.manager_overall_score || null,
      data.strengths || null,
      data.areas_for_improvement || null,
      data.evaluator_comments || null,
    ];
    const res = await executor.query(sql, params);
    return res.insertId || res[0]?.insertId;
  }

  /**
   * Update evaluation header
   */
  static async update(id, data, conn = null) {
    const executor = conn || pool;
    const fields = [];
    const params = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      params.push(data.status);
    }
    if (data.manager_overall_score !== undefined) {
      fields.push('manager_overall_score = ?');
      params.push(data.manager_overall_score);
    }
    if (data.system_metrics_snapshot !== undefined) {
      fields.push('system_metrics_snapshot = ?');
      params.push(JSON.stringify(data.system_metrics_snapshot));
    }
    if (data.strengths !== undefined) {
      fields.push('strengths = ?');
      params.push(data.strengths);
    }
    if (data.areas_for_improvement !== undefined) {
      fields.push('areas_for_improvement = ?');
      params.push(data.areas_for_improvement);
    }
    if (data.evaluator_comments !== undefined) {
      fields.push('evaluator_comments = ?');
      params.push(data.evaluator_comments);
    }
    if (data.employee_acknowledgement_comments !== undefined) {
      fields.push('employee_acknowledgement_comments = ?');
      params.push(data.employee_acknowledgement_comments);
    }
    if (data.acknowledged_at !== undefined) {
      fields.push('acknowledged_at = ?');
      params.push(data.acknowledged_at);
    }
    if (data.submitted_at !== undefined) {
      fields.push('submitted_at = ?');
      params.push(data.submitted_at);
    }
    if (data.finalized_by_id !== undefined) {
      fields.push('finalized_by_id = ?');
      params.push(data.finalized_by_id);
    }
    if (data.finalized_at !== undefined) {
      fields.push('finalized_at = ?');
      params.push(data.finalized_at);
    }

    if (fields.length === 0) return;

    const sql = `UPDATE employee_evaluations SET ${fields.join(', ')} WHERE id = ?`;
    params.push(id);
    await executor.query(sql, params);
  }

  /**
   * Save / Upsert score rows
   */
  static async saveScores(evaluationId, scores = [], conn = null) {
    const executor = conn || pool;
    for (const s of scores) {
      const criterionId = s.criterion_id || s.criteria_id;
      if (!criterionId) continue;
      const sql = `
        INSERT INTO employee_evaluation_scores (
          evaluation_id, criterion_id, score, comments
        ) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          score = VALUES(score),
          comments = VALUES(comments)
      `;
      await executor.query(sql, [
        evaluationId,
        criterionId,
        parseFloat(s.score) || 0,
        s.comments || null,
      ]);
    }
  }
}

module.exports = EmployeeEvaluationsRepository;
