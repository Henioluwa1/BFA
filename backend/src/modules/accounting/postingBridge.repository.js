const pool = require('../../db/pool');

class PostingBridgeRepository {
  /* =========================================================================
   * 1. ACCOUNT MAPPINGS
   * ========================================================================= */

  static async findMapping(mappingKey, conn = pool) {
    const sql = `
      SELECT 
        m.id,
        m.mapping_key,
        m.event_type,
        m.category,
        m.account_id,
        m.description,
        m.is_active,
        a.account_code,
        a.account_name,
        a.account_type,
        a.account_subtype,
        a.normal_balance,
        a.is_active AS account_is_active,
        a.is_posting_allowed
      FROM accounting_account_mappings m
      JOIN chart_of_accounts a ON m.account_id = a.id
      WHERE m.mapping_key = ?
    `;
    const rows = conn === pool ? await pool.query(sql, [mappingKey]) : (await conn.query(sql, [mappingKey]))[0];
    return rows[0] || null;
  }

  static async findAllMappings(conn = pool) {
    const sql = `
      SELECT 
        m.id,
        m.mapping_key,
        m.event_type,
        m.category,
        m.account_id,
        m.description,
        m.is_active,
        m.created_at,
        m.updated_at,
        a.account_code,
        a.account_name,
        a.account_type,
        a.account_subtype,
        a.normal_balance,
        a.is_active AS account_is_active,
        a.is_posting_allowed
      FROM accounting_account_mappings m
      JOIN chart_of_accounts a ON m.account_id = a.id
      ORDER BY m.event_type ASC, m.mapping_key ASC
    `;
    if (conn === pool) {
      return pool.query(sql);
    }
    const [rows] = await conn.query(sql);
    return rows;
  }

  static async updateMapping(mappingKey, accountId, conn = pool) {
    const sql = `
      UPDATE accounting_account_mappings
      SET account_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE mapping_key = ?
    `;
    if (conn === pool) {
      await pool.query(sql, [accountId, mappingKey]);
    } else {
      await conn.query(sql, [accountId, mappingKey]);
    }
    return this.findMapping(mappingKey, conn);
  }

  /* =========================================================================
   * 2. SUBLEDGER POSTING RECORDS
   * ========================================================================= */

  static async findPostingRecordByIdempotencyKey(key, conn = pool) {
    const sql = 'SELECT * FROM accounting_subledger_posting_records WHERE idempotency_key = ?';
    const rows = conn === pool ? await pool.query(sql, [key]) : (await conn.query(sql, [key]))[0];
    return rows[0] || null;
  }

  static async findPostingRecordById(id, conn = pool) {
    const sql = `
      SELECT r.*, j.journal_number, j.status AS journal_status
      FROM accounting_subledger_posting_records r
      LEFT JOIN journal_entries j ON r.journal_entry_id = j.id
      WHERE r.id = ?
    `;
    const rows = conn === pool ? await pool.query(sql, [id]) : (await conn.query(sql, [id]))[0];
    return rows[0] || null;
  }

  static async createPostingRecord(data, conn = pool) {
    const {
      source_module,
      source_entity_type,
      source_entity_id,
      source_event_type,
      posting_purpose = 'PRIMARY',
      idempotency_key,
      journal_entry_id = null,
      accounting_period_id = null,
      property_id = null,
      status = 'PENDING',
      amount = 0.0,
      currency = 'NGN',
      service_date = null,
      last_error = null,
      error_type = null,
    } = data;

    const sql = `
      INSERT INTO accounting_subledger_posting_records
      (source_module, source_entity_type, source_entity_id, source_event_type, posting_purpose, idempotency_key,
       journal_entry_id, accounting_period_id, property_id, status, amount, currency, service_date, last_error, error_type, attempt_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `;
    const params = [
      source_module,
      source_entity_type,
      String(source_entity_id),
      source_event_type,
      posting_purpose,
      idempotency_key,
      journal_entry_id,
      accounting_period_id,
      property_id,
      status,
      amount,
      currency,
      service_date,
      last_error,
      error_type,
    ];

    if (conn === pool) {
      const result = await pool.query(sql, params);
      return this.findPostingRecordById(result.insertId, pool);
    }
    const [result] = await conn.query(sql, params);
    return this.findPostingRecordById(result.insertId, conn);
  }

  static async updatePostingRecord(id, updates, conn = pool) {
    const allowed = [
      'journal_entry_id',
      'accounting_period_id',
      'status',
      'attempt_count',
      'last_error',
      'error_type',
      'reconciled_at',
    ];
    const fields = [];
    const params = [];

    for (const [k, v] of Object.entries(updates)) {
      if (allowed.includes(k)) {
        fields.push(`${k} = ?`);
        params.push(v);
      }
    }

    if (fields.length === 0) return this.findPostingRecordById(id, conn);

    params.push(id);
    const sql = `UPDATE accounting_subledger_posting_records SET ${fields.join(', ')} WHERE id = ?`;

    if (conn === pool) {
      await pool.query(sql, params);
    } else {
      await conn.query(sql, params);
    }
    return this.findPostingRecordById(id, conn);
  }

  static async listPostingRecords({ sourceModule, status, propertyId, fromDate, toDate, page = 1, limit = 50 } = {}, conn = pool) {
    let sql = `
      SELECT r.*, j.journal_number, j.status AS journal_status
      FROM accounting_subledger_posting_records r
      LEFT JOIN journal_entries j ON r.journal_entry_id = j.id
      WHERE 1=1
    `;
    let countSql = 'SELECT COUNT(*) as total FROM accounting_subledger_posting_records r WHERE 1=1';
    const params = [];

    if (sourceModule) {
      const clause = ' AND r.source_module = ?';
      sql += clause;
      countSql += clause;
      params.push(sourceModule.toUpperCase());
    }

    if (status) {
      const clause = ' AND r.status = ?';
      sql += clause;
      countSql += clause;
      params.push(status.toUpperCase());
    }

    if (propertyId) {
      const clause = ' AND r.property_id = ?';
      sql += clause;
      countSql += clause;
      params.push(propertyId);
    }

    if (fromDate) {
      const clause = ' AND r.created_at >= ?';
      sql += clause;
      countSql += clause;
      params.push(`${fromDate} 00:00:00`);
    }

    if (toDate) {
      const clause = ' AND r.created_at <= ?';
      sql += clause;
      countSql += clause;
      params.push(`${toDate} 23:59:59`);
    }

    const countRows = conn === pool ? await pool.query(countSql, params) : (await conn.query(countSql, params))[0];
    const total = Number(countRows[0]?.total || 0);

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (safePage - 1) * safeLimit;

    sql += ' ORDER BY r.id DESC LIMIT ? OFFSET ?';
    const queryParams = [...params, safeLimit, offset];

    const rows = conn === pool ? await pool.query(sql, queryParams) : (await conn.query(sql, queryParams))[0];

    return {
      data: rows,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  /* =========================================================================
   * 3. POSTING EXCEPTIONS
   * ========================================================================= */

  static async createException(data, conn = pool) {
    const {
      posting_record_id = null,
      property_id = null,
      source_module,
      source_entity_id,
      exception_code,
      exception_message,
      status = 'OPEN',
    } = data;

    const sql = `
      INSERT INTO accounting_posting_exceptions
      (posting_record_id, property_id, source_module, source_entity_id, exception_code, exception_message, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      posting_record_id,
      property_id,
      source_module,
      String(source_entity_id),
      exception_code,
      exception_message,
      status,
    ];

    if (conn === pool) {
      const result = await pool.query(sql, params);
      return this.findExceptionById(result.insertId, pool);
    }
    const [result] = await conn.query(sql, params);
    return this.findExceptionById(result.insertId, conn);
  }

  static async findExceptionById(id, conn = pool) {
    const sql = `
      SELECT e.*, r.idempotency_key, r.amount, r.service_date, COALESCE(e.property_id, r.property_id) AS property_id, u.name AS resolved_by_name
      FROM accounting_posting_exceptions e
      LEFT JOIN accounting_subledger_posting_records r ON e.posting_record_id = r.id
      LEFT JOIN users u ON e.resolved_by_id = u.id
      WHERE e.id = ?
    `;
    const rows = conn === pool ? await pool.query(sql, [id]) : (await conn.query(sql, [id]))[0];
    return rows[0] || null;
  }

  static async updateException(id, updates, conn = pool) {
    const allowed = ['status', 'resolution_notes', 'resolved_by_id', 'resolved_at'];
    const fields = [];
    const params = [];

    for (const [k, v] of Object.entries(updates)) {
      if (allowed.includes(k)) {
        fields.push(`${k} = ?`);
        params.push(v);
      }
    }

    if (fields.length === 0) return this.findExceptionById(id, conn);

    params.push(id);
    const sql = `UPDATE accounting_posting_exceptions SET ${fields.join(', ')} WHERE id = ?`;

    if (conn === pool) {
      await pool.query(sql, params);
    } else {
      await conn.query(sql, params);
    }
    return this.findExceptionById(id, conn);
  }

  static async listExceptions({ status = 'OPEN', sourceModule, propertyId, page = 1, limit = 50 } = {}, conn = pool) {
    let sql = `
      SELECT e.*, r.idempotency_key, r.amount, r.service_date, COALESCE(e.property_id, r.property_id) AS property_id, u.name AS resolved_by_name
      FROM accounting_posting_exceptions e
      LEFT JOIN accounting_subledger_posting_records r ON e.posting_record_id = r.id
      LEFT JOIN users u ON e.resolved_by_id = u.id
      WHERE 1=1
    `;
    let countSql = `
      SELECT COUNT(*) as total 
      FROM accounting_posting_exceptions e 
      LEFT JOIN accounting_subledger_posting_records r ON e.posting_record_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'ALL') {
      const clause = ' AND e.status = ?';
      sql += clause;
      countSql += clause;
      params.push(status.toUpperCase());
    }

    if (sourceModule) {
      const clause = ' AND e.source_module = ?';
      sql += clause;
      countSql += clause;
      params.push(sourceModule.toUpperCase());
    }

    if (propertyId) {
      const clause = ' AND (e.property_id = ? OR (e.property_id IS NULL AND r.property_id = ?))';
      sql += clause;
      countSql += clause;
      params.push(propertyId, propertyId);
    }

    const countRows = conn === pool ? await pool.query(countSql, params) : (await conn.query(countSql, params))[0];
    const total = Number(countRows[0]?.total || 0);

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (safePage - 1) * safeLimit;

    sql += ' ORDER BY e.id DESC LIMIT ? OFFSET ?';
    const queryParams = [...params, safeLimit, offset];

    const rows = conn === pool ? await pool.query(sql, queryParams) : (await conn.query(sql, queryParams))[0];

    return {
      data: rows,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  /* =========================================================================
   * 4. RECONCILIATION
   * ========================================================================= */

  static async reconcileSubledger({ fromDate, toDate, propertyId } = {}, conn = pool) {
    // 1. Reconcile Payments
    let paySql = `
      SELECT 
        COUNT(pt.id) AS operational_count,
        COALESCE(SUM(pt.amount), 0) AS operational_amount
      FROM payment_transactions pt
      JOIN reservations r ON pt.reservation_id = r.id
      WHERE pt.status = 'SUCCESS'
    `;
    const payParams = [];
    if (propertyId) {
      paySql += ' AND r.property_id = ?';
      payParams.push(propertyId);
    }
    if (fromDate) {
      paySql += ' AND DATE(pt.paid_at) >= ?';
      payParams.push(fromDate);
    }
    if (toDate) {
      paySql += ' AND DATE(pt.paid_at) <= ?';
      payParams.push(toDate);
    }

    const [payOperational] = conn === pool ? await pool.query(paySql, payParams) : (await conn.query(paySql, payParams))[0];

    // Posted Payments in Subledger Records
    let postPaySql = `
      SELECT 
        COUNT(id) AS posted_count,
        COALESCE(SUM(amount), 0) AS posted_amount
      FROM accounting_subledger_posting_records
      WHERE source_module = 'PAYMENTS' AND source_event_type = 'PAYMENT_COLLECTED' AND status = 'POSTED'
    `;
    const postPayParams = [];
    if (propertyId) {
      postPaySql += ' AND property_id = ?';
      postPayParams.push(propertyId);
    }
    if (fromDate) {
      postPaySql += ' AND DATE(created_at) >= ?';
      postPayParams.push(fromDate);
    }
    if (toDate) {
      postPaySql += ' AND DATE(created_at) <= ?';
      postPayParams.push(toDate);
    }

    const [payPosted] = conn === pool ? await pool.query(postPaySql, postPayParams) : (await conn.query(postPaySql, postPayParams))[0];

    // 2. Reconcile Expenses
    let expSql = `
      SELECT 
        COUNT(id) AS operational_count,
        COALESCE(SUM(amount), 0) AS operational_amount
      FROM expenses
      WHERE status = 'APPROVED'
    `;
    const expParams = [];
    if (propertyId) {
      expSql += ' AND property_id = ?';
      expParams.push(propertyId);
    }
    if (fromDate) {
      expSql += ' AND expense_date >= ?';
      expParams.push(fromDate);
    }
    if (toDate) {
      expSql += ' AND expense_date <= ?';
      expParams.push(toDate);
    }

    const [expOperational] = conn === pool ? await pool.query(expSql, expParams) : (await conn.query(expSql, expParams))[0];

    // Posted Expenses in Subledger Records
    let postExpSql = `
      SELECT 
        COUNT(id) AS posted_count,
        COALESCE(SUM(amount), 0) AS posted_amount
      FROM accounting_subledger_posting_records
      WHERE source_module = 'EXPENSES' AND source_event_type = 'EXPENSE_APPROVED' AND status = 'POSTED'
    `;
    const postExpParams = [];
    if (propertyId) {
      postExpSql += ' AND property_id = ?';
      postExpParams.push(propertyId);
    }
    if (fromDate) {
      postExpSql += ' AND DATE(created_at) >= ?';
      postExpParams.push(fromDate);
    }
    if (toDate) {
      postExpSql += ' AND DATE(created_at) <= ?';
      postExpParams.push(toDate);
    }

    const [expPosted] = conn === pool ? await pool.query(postExpSql, postExpParams) : (await conn.query(postExpSql, postExpParams))[0];

    // Unposted / Pending / Failed counts
    const [exceptionSummary] = conn === pool
      ? await pool.query('SELECT COUNT(*) AS open_exceptions FROM accounting_posting_exceptions WHERE status = "OPEN"')
      : (await conn.query('SELECT COUNT(*) AS open_exceptions FROM accounting_posting_exceptions WHERE status = "OPEN"'))[0];

    return {
      payments: {
        operationalCount: Number(payOperational?.operational_count || 0),
        operationalAmount: Number(payOperational?.operational_amount || 0),
        postedCount: Number(payPosted?.posted_count || 0),
        postedAmount: Number(payPosted?.posted_amount || 0),
        countDifference: Number(payOperational?.operational_count || 0) - Number(payPosted?.posted_count || 0),
        amountDifference: Number(payOperational?.operational_amount || 0) - Number(payPosted?.posted_amount || 0),
      },
      expenses: {
        operationalCount: Number(expOperational?.operational_count || 0),
        operationalAmount: Number(expOperational?.operational_amount || 0),
        postedCount: Number(expPosted?.posted_count || 0),
        postedAmount: Number(expPosted?.posted_amount || 0),
        countDifference: Number(expOperational?.operational_count || 0) - Number(expPosted?.posted_count || 0),
        amountDifference: Number(expOperational?.operational_amount || 0) - Number(expPosted?.posted_amount || 0),
      },
      openExceptionsCount: Number(exceptionSummary?.open_exceptions || 0),
      isReconciled:
        Number(payOperational?.operational_count || 0) === Number(payPosted?.posted_count || 0) &&
        Number(expOperational?.operational_count || 0) === Number(expPosted?.posted_count || 0),
      filters: {
        fromDate: fromDate || null,
        toDate: toDate || null,
        propertyId: propertyId || null,
      },
    };
  }
}

module.exports = PostingBridgeRepository;
