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

  /**
   * Profit & Loss Statement (Income Statement)
   * Accrual basis: Revenue (Credits - Debits) minus Expenses (Debits - Credits)
   */
  static async getIncomeStatement({ periodId, propertyId, fromDate, toDate } = {}, conn = pool) {
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
        a.account_subtype,
        COALESCE(SUM(gl.debit), 0) AS total_debit,
        COALESCE(SUM(gl.credit), 0) AS total_credit
      FROM chart_of_accounts a
      LEFT JOIN general_ledger_entries gl ON a.id = gl.account_id ${joinConditions}
      WHERE a.is_active = 1 AND a.account_type IN ('REVENUE', 'EXPENSE')
      GROUP BY a.id
      ORDER BY a.account_code ASC
    `;
    const rows = conn === pool ? await pool.query(sql, params) : (await conn.query(sql, params))[0];

    const revenueAccounts = [];
    const expenseAccounts = [];
    let totalRevenueCents = 0n;
    let totalExpenseCents = 0n;

    for (const row of rows) {
      const debitCents = toMinorUnits(row.total_debit, 'Debit');
      const creditCents = toMinorUnits(row.total_credit, 'Credit');

      if (row.account_type === 'REVENUE') {
        const netCents = creditCents - debitCents;
        totalRevenueCents += netCents;
        revenueAccounts.push({
          account_id: row.account_id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_subtype: row.account_subtype,
          total_credit: toDecimalNumber(creditCents),
          total_debit: toDecimalNumber(debitCents),
          net_amount: toDecimalNumber(netCents),
        });
      } else if (row.account_type === 'EXPENSE') {
        const netCents = debitCents - creditCents;
        totalExpenseCents += netCents;
        expenseAccounts.push({
          account_id: row.account_id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_subtype: row.account_subtype,
          total_debit: toDecimalNumber(debitCents),
          total_credit: toDecimalNumber(creditCents),
          net_amount: toDecimalNumber(netCents),
        });
      }
    }

    const netOperatingIncomeCents = totalRevenueCents - totalExpenseCents;

    return {
      reportName: 'Profit & Loss Statement (Income Statement)',
      basis: 'Accrual Accounting (Double-Entry General Ledger)',
      filters: {
        periodId: periodId || null,
        propertyId: propertyId || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
      revenues: {
        accounts: revenueAccounts,
        totalRevenue: toDecimalNumber(totalRevenueCents),
      },
      expenses: {
        accounts: expenseAccounts,
        totalExpenses: toDecimalNumber(totalExpenseCents),
      },
      netOperatingIncome: toDecimalNumber(netOperatingIncomeCents),
      isProfitable: netOperatingIncomeCents >= 0n,
    };
  }

  /**
   * Balance Sheet Statement
   * As-of date basis: Assets = Liabilities + Equity
   */
  static async getBalanceSheet({ asOfDate, periodId, propertyId } = {}, conn = pool) {
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
    const targetDate = asOfDate || new Date().toISOString().slice(0, 10);
    joinConditions += ' AND gl.posting_date <= ?';
    params.push(targetDate);

    const sql = `
      SELECT 
        a.id AS account_id,
        a.account_code,
        a.account_name,
        a.account_type,
        a.account_subtype,
        a.normal_balance,
        COALESCE(SUM(gl.debit), 0) AS total_debit,
        COALESCE(SUM(gl.credit), 0) AS total_credit
      FROM chart_of_accounts a
      LEFT JOIN general_ledger_entries gl ON a.id = gl.account_id ${joinConditions}
      WHERE a.is_active = 1
      GROUP BY a.id
      ORDER BY a.account_code ASC
    `;
    const rows = conn === pool ? await pool.query(sql, params) : (await conn.query(sql, params))[0];

    const assets = [];
    const liabilities = [];
    const equityAccounts = [];
    let totalAssetsCents = 0n;
    let totalLiabilitiesCents = 0n;
    let baseEquityCents = 0n;
    let cumulativeRevenueCents = 0n;
    let cumulativeExpenseCents = 0n;

    for (const row of rows) {
      const debitCents = toMinorUnits(row.total_debit, 'Debit');
      const creditCents = toMinorUnits(row.total_credit, 'Credit');

      if (row.account_type === 'ASSET') {
        const netCents = debitCents - creditCents;
        totalAssetsCents += netCents;
        assets.push({
          account_id: row.account_id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_subtype: row.account_subtype,
          balance: toDecimalNumber(netCents),
        });
      } else if (row.account_type === 'LIABILITY') {
        const netCents = creditCents - debitCents;
        totalLiabilitiesCents += netCents;
        liabilities.push({
          account_id: row.account_id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_subtype: row.account_subtype,
          balance: toDecimalNumber(netCents),
        });
      } else if (row.account_type === 'EQUITY') {
        const netCents = creditCents - debitCents;
        baseEquityCents += netCents;
        equityAccounts.push({
          account_id: row.account_id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_subtype: row.account_subtype,
          balance: toDecimalNumber(netCents),
        });
      } else if (row.account_type === 'REVENUE') {
        cumulativeRevenueCents += (creditCents - debitCents);
      } else if (row.account_type === 'EXPENSE') {
        cumulativeExpenseCents += (debitCents - creditCents);
      }
    }

    const currentPeriodEarningsCents = cumulativeRevenueCents - cumulativeExpenseCents;
    const totalEquityCents = baseEquityCents + currentPeriodEarningsCents;
    const totalLiabilitiesAndEquityCents = totalLiabilitiesCents + totalEquityCents;

    const discrepancyCents = totalAssetsCents - totalLiabilitiesAndEquityCents;
    const isBalanced = discrepancyCents === 0n;

    return {
      reportName: 'Balance Sheet Statement',
      basis: 'Accrual Accounting as of Date',
      asOfDate: targetDate,
      filters: {
        asOfDate: targetDate,
        propertyId: propertyId || null,
        periodId: periodId || null,
      },
      assets: {
        accounts: assets,
        totalAssets: toDecimalNumber(totalAssetsCents),
      },
      liabilities: {
        accounts: liabilities,
        totalLiabilities: toDecimalNumber(totalLiabilitiesCents),
      },
      equity: {
        accounts: equityAccounts,
        baseEquity: toDecimalNumber(baseEquityCents),
        currentPeriodEarnings: toDecimalNumber(currentPeriodEarningsCents),
        totalEquity: toDecimalNumber(totalEquityCents),
      },
      totalLiabilitiesAndEquity: toDecimalNumber(totalLiabilitiesAndEquityCents),
      isBalanced,
      discrepancy: toDecimalNumber(discrepancyCents >= 0n ? discrepancyCents : -discrepancyCents),
    };
  }

  /**
   * Cash Flow Statement (Direct/Operating Cash Basis)
   * Tracks receipts and disbursements through cash & bank accounts (1010, 1020)
   */
  static async getCashFlowStatement({ fromDate, toDate, propertyId } = {}, conn = pool) {
    const from = fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = toDate || new Date().toISOString().slice(0, 10);

    const cashRows = conn === pool
      ? await pool.query("SELECT id FROM chart_of_accounts WHERE account_code IN ('1010', '1020') AND is_active = 1")
      : (await conn.query("SELECT id FROM chart_of_accounts WHERE account_code IN ('1010', '1020') AND is_active = 1"))[0];

    const cashAccountIds = (cashRows || []).map((a) => a.id);
    if (cashAccountIds.length === 0) {
      throw new Error('Cash accounts (1010, 1020) not configured in Chart of Accounts.');
    }

    let propCondition = '';
    const propParams = [];
    if (propertyId) {
      propCondition = ' AND gl.property_id = ?';
      propParams.push(propertyId);
    }

    // 1. Beginning Cash Balance (prior to fromDate)
    const begSql = `
      SELECT COALESCE(SUM(gl.debit) - SUM(gl.credit), 0) AS beg_balance
      FROM general_ledger_entries gl
      WHERE gl.account_id IN (?) AND gl.posting_date < ? ${propCondition}
    `;
    const begRows = conn === pool
      ? await pool.query(begSql, [cashAccountIds, from, ...propParams])
      : (await conn.query(begSql, [cashAccountIds, from, ...propParams]))[0];
    const beginningCashCents = toMinorUnits(begRows[0]?.beg_balance || 0, 'BeginningCash');

    // 2. Operating Inflows and Outflows within period
    const periodSql = `
      SELECT 
        COALESCE(je.source_type, 'MANUAL') AS source_type,
        COALESCE(SUM(gl.debit), 0) AS total_inflow,
        COALESCE(SUM(gl.credit), 0) AS total_outflow
      FROM general_ledger_entries gl
      JOIN journal_entries je ON gl.journal_entry_id = je.id
      WHERE gl.account_id IN (?) AND gl.posting_date >= ? AND gl.posting_date <= ? ${propCondition}
      GROUP BY COALESCE(je.source_type, 'MANUAL')
    `;
    const periodRows = conn === pool
      ? await pool.query(periodSql, [cashAccountIds, from, to, ...propParams])
      : (await conn.query(periodSql, [cashAccountIds, from, to, ...propParams]))[0];

    const inflows = [];
    const outflows = [];
    let totalInflowCents = 0n;
    let totalOutflowCents = 0n;

    for (const r of periodRows) {
      const infCents = toMinorUnits(r.total_inflow, 'Inflow');
      const outCents = toMinorUnits(r.total_outflow, 'Outflow');

      if (infCents > 0n) {
        totalInflowCents += infCents;
        inflows.push({
          sourceType: r.source_type,
          description: r.source_type === 'PAYMENT' ? 'Guest Accommodation & Booking Receipts' : `${r.source_type} Collections`,
          amount: toDecimalNumber(infCents),
        });
      }
      if (outCents > 0n) {
        totalOutflowCents += outCents;
        outflows.push({
          sourceType: r.source_type,
          description: r.source_type === 'REFUND' ? 'Guest Caution Deposit & Booking Refunds' : `${r.source_type} Disbursements`,
          amount: toDecimalNumber(outCents),
        });
      }
    }

    const netCashFlowCents = totalInflowCents - totalOutflowCents;
    const endingCashCents = beginningCashCents + netCashFlowCents;

    return {
      reportName: 'Statement of Cash Flows',
      basis: 'Direct Operating Cash & Bank Movements (Accounts 1010 & 1020)',
      filters: {
        fromDate: from,
        toDate: to,
        propertyId: propertyId || null,
      },
      beginningCashBalance: toDecimalNumber(beginningCashCents),
      operatingActivities: {
        inflows,
        totalInflows: toDecimalNumber(totalInflowCents),
        outflows,
        totalOutflows: toDecimalNumber(totalOutflowCents),
        netCashFlow: toDecimalNumber(netCashFlowCents),
      },
      endingCashBalance: toDecimalNumber(endingCashCents),
    };
  }

  /**
   * Accounts Receivable & Outstanding Balances Report
   * Subledger Guest Folio Reconciliation (Account 1200)
   */
  static async getReceivablesReport({ propertyId, fromDate, toDate } = {}, conn = pool) {
    let sql = `
      SELECT 
        r.id AS reservation_id,
        r.reservation_code,
        r.property_id,
        p.name AS property_name,
        r.apartment_id,
        a.unit_number,
        r.tenant_name,
        r.tenant_email,
        r.tenant_phone,
        r.check_in_date,
        r.check_out_date,
        r.status AS reservation_status,
        r.payment_status,
        r.total_amount,
        r.paid_amount,
        (r.total_amount - r.paid_amount) AS outstanding_balance,
        DATEDIFF(CURRENT_DATE, r.check_out_date) AS days_overdue
      FROM reservations r
      JOIN properties p ON r.property_id = p.id
      JOIN apartments a ON r.apartment_id = a.id
      WHERE r.status != 'CANCELLED' AND (r.total_amount - r.paid_amount) > 0
    `;
    const params = [];

    if (propertyId) {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }
    if (fromDate) {
      sql += ' AND r.check_in_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND r.check_in_date <= ?';
      params.push(toDate);
    }
    sql += ' ORDER BY outstanding_balance DESC, r.check_in_date ASC';

    const rows = conn === pool ? await pool.query(sql, params) : (await conn.query(sql, params))[0];

    let totalBilledCents = 0n;
    let totalCollectedCents = 0n;
    let totalOutstandingCents = 0n;

    const items = rows.map((r) => {
      const billedCents = toMinorUnits(r.total_amount, 'TotalAmount');
      const paidCents = toMinorUnits(r.paid_amount, 'PaidAmount');
      const balanceCents = billedCents - paidCents;

      totalBilledCents += billedCents;
      totalCollectedCents += paidCents;
      totalOutstandingCents += balanceCents;

      return {
        reservationId: r.reservation_id,
        reservationCode: r.reservation_code,
        propertyName: r.property_name,
        unitNumber: r.unit_number,
        tenantName: r.tenant_name,
        tenantPhone: r.tenant_phone,
        checkInDate: r.check_in_date,
        checkOutDate: r.check_out_date,
        totalAmount: toDecimalNumber(billedCents),
        paidAmount: toDecimalNumber(paidCents),
        outstandingBalance: toDecimalNumber(balanceCents),
        daysOverdue: Math.max(0, parseInt(r.days_overdue || 0, 10)),
        paymentStatus: r.payment_status,
      };
    });

    return {
      reportName: 'Accounts Receivable & Outstanding Balances Report',
      basis: 'Subledger Guest Folio Reconciliation (Account 1200)',
      filters: {
        propertyId: propertyId || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
      summary: {
        totalBilled: toDecimalNumber(totalBilledCents),
        totalCollected: toDecimalNumber(totalCollectedCents),
        totalOutstanding: toDecimalNumber(totalOutstandingCents),
        debtorCount: items.length,
      },
      receivables: items,
    };
  }

  /**
   * Refunds & Payment Reconciliation Report
   */
  static async getRefundsReconciliationReport({ propertyId, fromDate, toDate } = {}, conn = pool) {
    let sql = `
      SELECT 
        pt.id AS transaction_id,
        pt.transaction_reference,
        pt.reservation_id,
        r.reservation_code,
        r.property_id,
        p.name AS property_name,
        pt.amount,
        pt.refund_amount,
        pt.refund_reason,
        pt.status AS transaction_status,
        pt.payment_method,
        pt.paid_at,
        pt.refunded_at
      FROM payment_transactions pt
      JOIN reservations r ON pt.reservation_id = r.id
      JOIN properties p ON r.property_id = p.id
      WHERE (pt.status IN ('REFUNDED', 'PARTIALLY_REFUNDED') OR pt.refund_amount > 0)
    `;
    const params = [];

    if (propertyId) {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }
    if (fromDate) {
      sql += ' AND pt.refunded_at >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND pt.refunded_at <= ?';
      params.push(toDate);
    }
    sql += ' ORDER BY pt.refunded_at DESC, pt.id DESC';

    const rows = conn === pool ? await pool.query(sql, params) : (await conn.query(sql, params))[0];

    let totalOriginalAmountCents = 0n;
    let totalRefundedCents = 0n;

    const items = rows.map((r) => {
      const origCents = toMinorUnits(r.amount, 'Amount');
      const refCents = toMinorUnits(r.refund_amount, 'RefundAmount');

      totalOriginalAmountCents += origCents;
      totalRefundedCents += refCents;

      return {
        transactionId: r.transaction_id,
        transactionReference: r.transaction_reference,
        reservationCode: r.reservation_code,
        propertyName: r.property_name,
        originalAmount: toDecimalNumber(origCents),
        refundAmount: toDecimalNumber(refCents),
        netRetained: toDecimalNumber(origCents - refCents),
        refundReason: r.refund_reason,
        paymentMethod: r.payment_method,
        status: r.transaction_status,
        refundedAt: r.refunded_at,
      };
    });

    return {
      reportName: 'Refunds & Payment Reconciliation Report',
      basis: 'Subledger Payment Transactions Reconciled with General Ledger',
      filters: {
        propertyId: propertyId || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
      summary: {
        totalOriginalAmount: toDecimalNumber(totalOriginalAmountCents),
        totalRefunded: toDecimalNumber(totalRefundedCents),
        netRetained: toDecimalNumber(totalOriginalAmountCents - totalRefundedCents),
        refundCount: items.length,
      },
      refunds: items,
    };
  }
}

module.exports = AccountingRepository;
