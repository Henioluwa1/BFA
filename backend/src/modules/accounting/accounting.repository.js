const pool = require('../../db/pool');
const { toMinorUnits, toDecimalNumber } = require('./accounting.math');

class AccountingRepository {
  /* =========================================================================
   * 1. CHART OF ACCOUNTS
   * ========================================================================= */

  static async findAllAccounts({ type, isActive, isPostingAllowed, search } = {}, conn = pool) {
    let sql = `
      SELECT 
        a.id,
        a.account_code,
        a.account_name,
        a.account_type,
        a.account_subtype,
        a.normal_balance,
        a.is_active,
        a.is_posting_allowed,
        a.parent_account_id,
        a.property_id,
        a.description,
        a.created_at,
        a.updated_at,
        p.account_code AS parent_code,
        p.account_name AS parent_name,
        COALESCE(gl.total_debit, 0) AS total_debit,
        COALESCE(gl.total_credit, 0) AS total_credit,
        CASE 
          WHEN a.normal_balance = 'DEBIT' THEN (COALESCE(gl.total_debit, 0) - COALESCE(gl.total_credit, 0))
          ELSE (COALESCE(gl.total_credit, 0) - COALESCE(gl.total_debit, 0))
        END AS current_balance
      FROM chart_of_accounts a
      LEFT JOIN chart_of_accounts p ON a.parent_account_id = p.id
      LEFT JOIN (
        SELECT 
          account_id,
          SUM(debit) AS total_debit,
          SUM(credit) AS total_credit
        FROM general_ledger_entries
        GROUP BY account_id
      ) gl ON a.id = gl.account_id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      sql += ' AND a.account_type = ?';
      params.push(type.toUpperCase());
    }

    if (isActive !== undefined && isActive !== null && isActive !== '') {
      sql += ' AND a.is_active = ?';
      params.push(isActive === 'true' || isActive === true || isActive === 1 ? 1 : 0);
    }

    if (isPostingAllowed !== undefined && isPostingAllowed !== null && isPostingAllowed !== '') {
      sql += ' AND a.is_posting_allowed = ?';
      params.push(isPostingAllowed === 'true' || isPostingAllowed === true || isPostingAllowed === 1 ? 1 : 0);
    }

    if (search) {
      sql += ' AND (a.account_code LIKE ? OR a.account_name LIKE ? OR a.description LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    sql += ' ORDER BY a.account_code ASC';

    if (conn === pool) {
      return pool.query(sql, params);
    }
    const [rows] = await conn.query(sql, params);
    return rows;
  }

  static async findAccountById(id, conn = pool) {
    const sql = `
      SELECT 
        a.id,
        a.account_code,
        a.account_name,
        a.account_type,
        a.account_subtype,
        a.normal_balance,
        a.is_active,
        a.is_posting_allowed,
        a.parent_account_id,
        a.property_id,
        a.description,
        a.created_at,
        a.updated_at,
        p.account_code AS parent_code,
        p.account_name AS parent_name
      FROM chart_of_accounts a
      LEFT JOIN chart_of_accounts p ON a.parent_account_id = p.id
      WHERE a.id = ?
    `;
    const rows = conn === pool ? await pool.query(sql, [id]) : (await conn.query(sql, [id]))[0];
    return rows[0] || null;
  }

  static async findAccountByCode(code, conn = pool) {
    const sql = 'SELECT * FROM chart_of_accounts WHERE account_code = ?';
    const rows = conn === pool ? await pool.query(sql, [code]) : (await conn.query(sql, [code]))[0];
    return rows[0] || null;
  }

  static async createAccount(accountData, conn = pool) {
    const {
      account_code,
      account_name,
      account_type,
      account_subtype = null,
      normal_balance,
      description = null,
      parent_account_id = null,
      property_id = null,
      is_active = 1,
      is_posting_allowed = 1,
    } = accountData;

    const sql = `
      INSERT INTO chart_of_accounts
      (account_code, account_name, account_type, account_subtype, normal_balance, description, parent_account_id, property_id, is_active, is_posting_allowed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      account_code,
      account_name,
      account_type,
      account_subtype,
      normal_balance,
      description,
      parent_account_id || null,
      property_id || null,
      is_active ? 1 : 0,
      is_posting_allowed ? 1 : 0,
    ];

    if (conn === pool) {
      const result = await pool.query(sql, params);
      return this.findAccountById(result.insertId, pool);
    }
    const [result] = await conn.query(sql, params);
    return this.findAccountById(result.insertId, conn);
  }

  static async updateAccount(id, accountData, conn = pool) {
    const {
      account_name,
      account_subtype,
      description,
      parent_account_id,
      is_active,
      is_posting_allowed,
    } = accountData;

    const fields = [];
    const params = [];

    if (account_name !== undefined) {
      fields.push('account_name = ?');
      params.push(account_name);
    }
    if (account_subtype !== undefined) {
      fields.push('account_subtype = ?');
      params.push(account_subtype);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      params.push(description);
    }
    if (parent_account_id !== undefined) {
      fields.push('parent_account_id = ?');
      params.push(parent_account_id || null);
    }
    if (is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    if (is_posting_allowed !== undefined) {
      fields.push('is_posting_allowed = ?');
      params.push(is_posting_allowed ? 1 : 0);
    }

    if (fields.length === 0) {
      return this.findAccountById(id, conn);
    }

    params.push(id);
    const sql = `UPDATE chart_of_accounts SET ${fields.join(', ')} WHERE id = ?`;

    if (conn === pool) {
      await pool.query(sql, params);
    } else {
      await conn.query(sql, params);
    }

    return this.findAccountById(id, conn);
  }

  static async countAccountLines(accountId, conn = pool) {
    const sql = 'SELECT COUNT(*) AS total FROM journal_lines WHERE account_id = ?';
    const rows = conn === pool ? await pool.query(sql, [accountId]) : (await conn.query(sql, [accountId]))[0];
    return Number(rows[0]?.total || 0);
  }

  /* =========================================================================
   * 2. ACCOUNTING PERIODS
   * ========================================================================= */

  static async findAllPeriods({ status } = {}, conn = pool) {
    let sql = 'SELECT * FROM accounting_periods WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status.toUpperCase());
    }

    sql += ' ORDER BY start_date DESC';

    if (conn === pool) {
      return pool.query(sql, params);
    }
    const [rows] = await conn.query(sql, params);
    return rows;
  }

  static async findPeriodById(id, conn = pool) {
    const sql = 'SELECT * FROM accounting_periods WHERE id = ?';
    const rows = conn === pool ? await pool.query(sql, [id]) : (await conn.query(sql, [id]))[0];
    return rows[0] || null;
  }

  static async findPeriodByName(name, conn = pool) {
    const sql = 'SELECT * FROM accounting_periods WHERE period_name = ?';
    const rows = conn === pool ? await pool.query(sql, [name]) : (await conn.query(sql, [name]))[0];
    return rows[0] || null;
  }

  static async findActivePeriodForDate(dateStr, conn = pool) {
    const sql = `
      SELECT * 
      FROM accounting_periods 
      WHERE ? BETWEEN start_date AND end_date
      ORDER BY id DESC
      LIMIT 1
    `;
    const rows = conn === pool ? await pool.query(sql, [dateStr]) : (await conn.query(sql, [dateStr]))[0];
    return rows[0] || null;
  }

  static async createPeriod(data, conn = pool) {
    const { period_name, fiscal_year, start_date, end_date, status = 'OPEN' } = data;
    const sql = `
      INSERT INTO accounting_periods 
      (period_name, fiscal_year, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = [period_name, fiscal_year, start_date, end_date, status];
    if (conn === pool) {
      const res = await pool.query(sql, params);
      return this.findPeriodById(res.insertId, pool);
    }
    const [res] = await conn.query(sql, params);
    return this.findPeriodById(res.insertId, conn);
  }

  static async updatePeriod(id, data, conn = pool) {
    const fields = [];
    const params = [];

    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(val);
    }

    if (fields.length === 0) return this.findPeriodById(id, conn);

    params.push(id);
    const sql = `UPDATE accounting_periods SET ${fields.join(', ')} WHERE id = ?`;

    if (conn === pool) {
      await pool.query(sql, params);
    } else {
      await conn.query(sql, params);
    }
    return this.findPeriodById(id, conn);
  }

  static async countUnpostedJournalsInPeriod(periodId, conn = pool) {
    const sql = `
      SELECT COUNT(*) AS total 
      FROM journal_entries 
      WHERE accounting_period_id = ? AND status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED')
    `;
    const rows = conn === pool ? await pool.query(sql, [periodId]) : (await conn.query(sql, [periodId]))[0];
    return Number(rows[0]?.total || 0);
  }

  /* =========================================================================
   * 3. JOURNAL ENTRIES & LINES
   * ========================================================================= */

  static async generateJournalNumber(conn = pool) {
    const year = new Date().getFullYear();
    const prefix = `JNL-${year}-`;
    const sql = `
      SELECT journal_number 
      FROM journal_entries 
      WHERE journal_number LIKE ? 
      ORDER BY id DESC 
      LIMIT 1
    `;
    const rows = conn === pool ? await pool.query(sql, [`${prefix}%`]) : (await conn.query(sql, [`${prefix}%`]))[0];
    let nextNum = 1;
    if (rows && rows.length > 0 && rows[0].journal_number) {
      const parts = rows[0].journal_number.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextNum = lastSeq + 1;
    }
    return `${prefix}${String(nextNum).padStart(6, '0')}`;
  }

  static async findJournalById(id, conn = pool, forUpdate = false) {
    let sql = `
      SELECT 
        j.*,
        p.period_name,
        p.status AS period_status,
        u_create.name AS creator_name,
        u_create.email AS creator_email,
        u_appr.name AS approver_name,
        u_post.name AS poster_name,
        rj.journal_number AS reversed_by_journal_number,
        oj.journal_number AS original_journal_number
      FROM journal_entries j
      LEFT JOIN accounting_periods p ON j.accounting_period_id = p.id
      LEFT JOIN users u_create ON j.created_by_id = u_create.id
      LEFT JOIN users u_appr ON j.approved_by_id = u_appr.id
      LEFT JOIN users u_post ON j.posted_by_id = u_post.id
      LEFT JOIN journal_entries rj ON j.reversed_by_journal_id = rj.id
      LEFT JOIN journal_entries oj ON j.reversal_of_journal_id = oj.id
      WHERE j.id = ?
    `;
    if (forUpdate) {
      sql += ' FOR UPDATE';
    }

    const rows = conn === pool ? await pool.query(sql, [id]) : (await conn.query(sql, [id]))[0];
    if (!rows || rows.length === 0) return null;

    const journal = rows[0];
    journal.lines = await this.findJournalLines(journal.id, conn);
    return journal;
  }

  static async findJournalByIdempotencyKey(key, conn = pool) {
    if (!key) return null;
    const sql = 'SELECT id FROM journal_entries WHERE idempotency_key = ? LIMIT 1';
    const rows = conn === pool ? await pool.query(sql, [key]) : (await conn.query(sql, [key]))[0];
    if (!rows || rows.length === 0) return null;
    return this.findJournalById(rows[0].id, conn);
  }

  static async findJournalLines(journalId, conn = pool) {
    const sql = `
      SELECT 
        l.*,
        a.account_code,
        a.account_name,
        a.account_type,
        a.normal_balance,
        prop.name AS property_name
      FROM journal_lines l
      INNER JOIN chart_of_accounts a ON l.account_id = a.id
      LEFT JOIN properties prop ON l.property_id = prop.id
      WHERE l.journal_entry_id = ?
      ORDER BY l.line_number ASC
    `;
    const rows = conn === pool ? await pool.query(sql, [journalId]) : (await conn.query(sql, [journalId]))[0];
    return rows;
  }

  static async findAllJournals({
    periodId,
    status,
    sourceType,
    propertyId,
    fromDate,
    toDate,
    search,
    page = 1,
    limit = 20,
  } = {}, conn = pool) {
    const offset = (Number(page) - 1) * Number(limit);
    let countSql = `
      SELECT COUNT(DISTINCT j.id) AS total
      FROM journal_entries j
      LEFT JOIN journal_lines jl ON j.id = jl.journal_entry_id
      WHERE 1=1
    `;
    let sql = `
      SELECT 
        j.*,
        p.period_name,
        u_create.name AS creator_name,
        u_appr.name AS approver_name,
        u_post.name AS poster_name,
        COUNT(jl.id) AS line_count
      FROM journal_entries j
      LEFT JOIN accounting_periods p ON j.accounting_period_id = p.id
      LEFT JOIN users u_create ON j.created_by_id = u_create.id
      LEFT JOIN users u_appr ON j.approved_by_id = u_appr.id
      LEFT JOIN users u_post ON j.posted_by_id = u_post.id
      LEFT JOIN journal_lines jl ON j.id = jl.journal_entry_id
      WHERE 1=1
    `;

    const whereConditions = [];
    const params = [];

    if (periodId) {
      whereConditions.push('j.accounting_period_id = ?');
      params.push(periodId);
    }
    if (status) {
      whereConditions.push('j.status = ?');
      params.push(status.toUpperCase());
    }
    if (sourceType) {
      whereConditions.push('j.source_type = ?');
      params.push(sourceType.toUpperCase());
    }
    if (propertyId) {
      whereConditions.push('jl.property_id = ?');
      params.push(propertyId);
    }
    if (fromDate) {
      whereConditions.push('j.entry_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      whereConditions.push('j.entry_date <= ?');
      params.push(toDate);
    }
    if (search) {
      whereConditions.push('(j.journal_number LIKE ? OR j.description LIKE ?)');
      const s = `%${search.trim()}%`;
      params.push(s, s);
    }

    if (whereConditions.length > 0) {
      const cond = ` AND ${whereConditions.join(' AND ')}`;
      countSql += cond;
      sql += cond;
    }

    sql += ' GROUP BY j.id ORDER BY j.entry_date DESC, j.id DESC LIMIT ? OFFSET ?';

    const countRows = conn === pool ? await pool.query(countSql, params) : (await conn.query(countSql, params))[0];
    const total = Number(countRows[0]?.total || 0);

    const queryParams = [...params, Number(limit), Number(offset)];
    const rows = conn === pool ? await pool.query(sql, queryParams) : (await conn.query(sql, queryParams))[0];

    return {
      data: rows,
      total,
      page: Number(page),
      limit: Number(limit),
    };
  }

  static async createJournalEntry(headerData, linesData, conn) {
    const {
      journal_number,
      entry_date,
      accounting_period_id,
      description,
      source_type = 'MANUAL',
      source_id = null,
      idempotency_key = null,
      status = 'DRAFT',
      created_by_id,
      total_debit,
      total_credit,
      reversal_of_journal_id = null,
    } = headerData;

    let calculatedDebitCents = 0n;
    let calculatedCreditCents = 0n;
    if (Array.isArray(linesData)) {
      for (const line of linesData) {
        calculatedDebitCents += toMinorUnits(line.debit || 0);
        calculatedCreditCents += toMinorUnits(line.credit || 0);
      }
    }
    const finalDebit = linesData && linesData.length > 0 ? toDecimalNumber(calculatedDebitCents) : (total_debit || 0.0);
    const finalCredit = linesData && linesData.length > 0 ? toDecimalNumber(calculatedCreditCents) : (total_credit || 0.0);

    const headerSql = `
      INSERT INTO journal_entries
      (journal_number, entry_date, accounting_period_id, description, source_type, source_id, 
       idempotency_key, status, created_by_id, total_debit, total_credit, reversal_of_journal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [headerResult] = await conn.query(headerSql, [
      journal_number,
      entry_date,
      accounting_period_id,
      description,
      source_type,
      source_id,
      idempotency_key,
      status,
      created_by_id,
      finalDebit,
      finalCredit,
      reversal_of_journal_id,
    ]);

    const journalId = headerResult.insertId;

    // Insert lines
    const lineSql = `
      INSERT INTO journal_lines
      (journal_entry_id, line_number, account_id, property_id, debit, credit, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    for (let i = 0; i < linesData.length; i++) {
      const line = linesData[i];
      await conn.query(lineSql, [
        journalId,
        i + 1,
        line.account_id,
        line.property_id || null,
        line.debit || 0.00,
        line.credit || 0.00,
        line.description || null,
      ]);
    }

    return this.findJournalById(journalId, conn);
  }

  static async updateDraftJournal(id, headerData, linesData, conn) {
    const {
      entry_date,
      accounting_period_id,
      description,
      total_debit,
      total_credit,
    } = headerData;

    const updateSql = `
      UPDATE journal_entries
      SET entry_date = ?, accounting_period_id = ?, description = ?, total_debit = ?, total_credit = ?
      WHERE id = ? AND status = 'DRAFT'
    `;
    await conn.query(updateSql, [entry_date, accounting_period_id, description, total_debit, total_credit, id]);

    // Replace lines
    await conn.query('DELETE FROM journal_lines WHERE journal_entry_id = ?', [id]);

    const lineSql = `
      INSERT INTO journal_lines
      (journal_entry_id, line_number, account_id, property_id, debit, credit, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    for (let i = 0; i < linesData.length; i++) {
      const line = linesData[i];
      await conn.query(lineSql, [
        id,
        i + 1,
        line.account_id,
        line.property_id || null,
        line.debit || 0.00,
        line.credit || 0.00,
        line.description || null,
      ]);
    }

    return this.findJournalById(id, conn);
  }

  static async updateJournalStatus(id, updateData, conn) {
    const fields = [];
    const params = [];

    for (const [key, val] of Object.entries(updateData)) {
      fields.push(`${key} = ?`);
      params.push(val);
    }

    params.push(id);
    const sql = `UPDATE journal_entries SET ${fields.join(', ')} WHERE id = ?`;
    await conn.query(sql, params);
    return this.findJournalById(id, conn);
  }

  /* =========================================================================
   * 4. GENERAL LEDGER ENTRIES
   * ========================================================================= */

  static async insertGeneralLedgerEntries(entries, conn) {
    const sql = `
      INSERT INTO general_ledger_entries
      (journal_entry_id, journal_line_id, account_id, property_id, posting_date, accounting_period_id, debit, credit, net_balance_impact, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    for (const entry of entries) {
      await conn.query(sql, [
        entry.journal_entry_id,
        entry.journal_line_id,
        entry.account_id,
        entry.property_id || null,
        entry.posting_date,
        entry.accounting_period_id,
        entry.debit || 0.00,
        entry.credit || 0.00,
        entry.net_balance_impact || 0.00,
        entry.description || null,
      ]);
    }
  }

  static async findAllGeneralLedgerEntries({
    accountId,
    propertyId,
    periodId,
    journalEntryId,
    journalId,
    fromDate,
    toDate,
    page = 1,
    limit = 50,
  } = {}, conn = pool) {
    const offset = (Number(page) - 1) * Number(limit);
    let countSql = 'SELECT COUNT(*) AS total FROM general_ledger_entries gl WHERE 1=1';
    let sql = `
      SELECT 
        gl.*,
        a.account_code,
        a.account_name,
        a.account_type,
        a.normal_balance,
        p.period_name,
        j.journal_number,
        j.source_type,
        prop.name AS property_name
      FROM general_ledger_entries gl
      INNER JOIN chart_of_accounts a ON gl.account_id = a.id
      INNER JOIN accounting_periods p ON gl.accounting_period_id = p.id
      INNER JOIN journal_entries j ON gl.journal_entry_id = j.id
      LEFT JOIN properties prop ON gl.property_id = prop.id
      WHERE 1=1
    `;

    const where = [];
    const params = [];

    if (accountId) {
      where.push('gl.account_id = ?');
      params.push(accountId);
    }
    if (propertyId) {
      where.push('gl.property_id = ?');
      params.push(propertyId);
    }
    if (periodId) {
      where.push('gl.accounting_period_id = ?');
      params.push(periodId);
    }
    if (journalEntryId || journalId) {
      where.push('gl.journal_entry_id = ?');
      params.push(journalEntryId || journalId);
    }
    if (fromDate) {
      where.push('gl.posting_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      where.push('gl.posting_date <= ?');
      params.push(toDate);
    }

    if (where.length > 0) {
      const clause = ` AND ${where.join(' AND ')}`;
      countSql += clause;
      sql += clause;
    }

    sql += ' ORDER BY gl.posting_date DESC, gl.id DESC LIMIT ? OFFSET ?';

    const countRows = conn === pool ? await pool.query(countSql, params) : (await conn.query(countSql, params))[0];
    const total = Number(countRows[0]?.total || 0);

    const queryParams = [...params, Number(limit), Number(offset)];
    const rows = conn === pool ? await pool.query(sql, queryParams) : (await conn.query(sql, queryParams))[0];

    return {
      data: rows,
      total,
      page: Number(page),
      limit: Number(limit),
    };
  }

  static async getTrialBalanceSummary({ periodId, propertyId, fromDate, toDate } = {}, conn = pool) {
    let joinConditions = '';
    const params = [];

    if (periodId) {
      joinConditions += ' AND gl.accounting_period_id = ?';
      params.push(periodId);
    }
    if (propertyId) {
      joinConditions += ' AND gl.property_id = ?';
      params.push(propertyId);
    }
    if (fromDate) {
      joinConditions += ' AND gl.posting_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      joinConditions += ' AND gl.posting_date <= ?';
      params.push(toDate);
    }

    const sql = `
      SELECT 
        a.id AS account_id,
        a.account_code,
        a.account_name,
        a.account_type,
        a.normal_balance,
        COALESCE(SUM(gl.debit), 0) AS total_debit,
        COALESCE(SUM(gl.credit), 0) AS total_credit
      FROM chart_of_accounts a
      LEFT JOIN general_ledger_entries gl ON a.id = gl.account_id ${joinConditions}
      WHERE a.is_active = 1
      GROUP BY a.id
      HAVING total_debit > 0 OR total_credit > 0
      ORDER BY a.account_code ASC
    `;
    const rows = conn === pool ? await pool.query(sql, params) : (await conn.query(sql, params))[0];

    let grandGrossDebit = 0n;
    let grandGrossCredit = 0n;
    let grandNetDebit = 0n;
    let grandNetCredit = 0n;

    const formattedAccounts = rows.map((row) => {
      const debitCents = toMinorUnits(row.total_debit, 'Debit');
      const creditCents = toMinorUnits(row.total_credit, 'Credit');

      grandGrossDebit += debitCents;
      grandGrossCredit += creditCents;

      let netDebitCents = 0n;
      let netCreditCents = 0n;
      let isAbnormal = false;

      if (debitCents > creditCents) {
        netDebitCents = debitCents - creditCents;
        if (row.normal_balance === 'CREDIT') {
          isAbnormal = true;
        }
      } else if (creditCents > debitCents) {
        netCreditCents = creditCents - debitCents;
        if (row.normal_balance === 'DEBIT') {
          isAbnormal = true;
        }
      }

      grandNetDebit += netDebitCents;
      grandNetCredit += netCreditCents;

      return {
        account_id: row.account_id,
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        normal_balance: row.normal_balance,
        total_debit: toDecimalNumber(debitCents),
        total_credit: toDecimalNumber(creditCents),
        net_debit_balance: toDecimalNumber(netDebitCents),
        net_credit_balance: toDecimalNumber(netCreditCents),
        is_abnormal: isAbnormal,
      };
    });

    const isBalanced = grandNetDebit === grandNetCredit && grandGrossDebit === grandGrossCredit;
    const netDifferenceCents = grandNetDebit >= grandNetCredit ? grandNetDebit - grandNetCredit : grandNetCredit - grandNetDebit;

    return {
      accounts: formattedAccounts,
      grandTotalDebit: toDecimalNumber(grandGrossDebit),
      grandTotalCredit: toDecimalNumber(grandGrossCredit),
      grandNetDebit: toDecimalNumber(grandNetDebit),
      grandNetCredit: toDecimalNumber(grandNetCredit),
      isBalanced,
      difference: toDecimalNumber(netDifferenceCents),
      filters: {
        periodId: periodId || null,
        propertyId: propertyId || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
    };
  }
}

module.exports = AccountingRepository;
