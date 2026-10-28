const pool = require('../../db/pool');
const AccountingRepository = require('./accounting.repository');
const AuditService = require('../../core/audit/audit.service');
const {
  toMinorUnits,
  fromMinorUnits,
  toDecimalNumber,
} = require('./accounting.math');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} = require('../../core/errors/apiError');

class AccountingService {
  /* =========================================================================
   * PROPERTY SCOPE VALIDATION
   * ========================================================================= */

  /**
   * Validates whether a user is authorized for the given propertyId.
   * - Corporate roles (SUPER_ADMIN, OWNER, ADMIN) can operate across all properties
   *   and are authorized to create company-level / unassigned entries (propertyId == null).
   * - Property-restricted roles (MANAGER, STAFF with an assigned propertyId) CANNOT
   *   create company-level entries (propertyId == null) or foreign-property entries.
   * @param {Object} user - Authenticated user context
   * @param {number|null} propertyId - Property ID to validate
   * @param {boolean} isDrafting - True if validating a line being created/updated
   */
  static validatePropertyScope(user, propertyId, isDrafting = false) {
    if (!user) return true;
    const role = (user.role || '').toUpperCase();

    // Corporate administrators have global property authority
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return true;
    }

    if (['MANAGER', 'STAFF'].includes(role) && user.propertyId) {
      if (propertyId === null || propertyId === undefined || propertyId === '') {
        if (isDrafting) {
          throw new ForbiddenError(
            'Access denied: Property-restricted users cannot create company-level or unassigned property entries. You must specify your authorized property.'
          );
        }
        return true;
      }
      if (parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
        throw new ForbiddenError(
          `Access denied: You do not have authorization for property #${propertyId}. Your authorized property is #${user.propertyId}.`
        );
      }
    }

    return true;
  }

  /**
   * Asserts that a journal does not leak across property boundaries for a property-restricted user.
   * If a journal contains lines outside the user's property (including company-level lines),
   * access is strictly denied.
   * @param {Object} user
   * @param {Object} journal
   * @param {string} actionDescription
   */
  static assertJournalPropertyAccess(user, journal, actionDescription = 'access') {
    if (!user) return;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return;
    }

    if (['MANAGER', 'STAFF'].includes(role) && user.propertyId) {
      const foreignOrCompanyLine = journal.lines.find(
        (l) => !l.property_id || parseInt(l.property_id, 10) !== parseInt(user.propertyId, 10)
      );
      if (foreignOrCompanyLine) {
        throw new ForbiddenError(
          `Access denied: You do not have authorization to ${actionDescription} this journal entry because it contains lines outside your authorized property #${user.propertyId}.`
        );
      }
    }
  }

  /* =========================================================================
   * 1. CHART OF ACCOUNTS
   * ========================================================================= */
  static async listAccounts(query) {
    return AccountingRepository.findAllAccounts(query);
  }

  static async getAccountById(id) {
    const account = await AccountingRepository.findAccountById(id);
    if (!account) {
      throw new NotFoundError(`Account #${id} not found.`);
    }
    return account;
  }

  static async createAccount(data, user, req) {
    const {
      account_code,
      code,
      account_name,
      name,
      account_type,
      type,
      account_subtype,
      subtype,
      normal_balance,
      description,
      parent_account_id,
      parent_id,
      is_active,
      is_posting_allowed,
      property_id,
    } = data;

    const finalCode = (account_code || code || '').trim();
    const finalName = (account_name || name || '').trim();
    const finalType = (account_type || type || '').trim().toUpperCase();
    const finalSubtype = (account_subtype || subtype || '').trim() || null;
    const finalParentId = parent_account_id || parent_id || null;

    if (!finalCode) {
      throw new ValidationError('Account code is required.');
    }
    if (!finalName) {
      throw new ValidationError('Account name is required.');
    }
    const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
    if (!validTypes.includes(finalType)) {
      throw new ValidationError(`Invalid account type '${finalType}'. Must be one of: ${validTypes.join(', ')}.`);
    }

    const cleanNormalBalance = String(normal_balance || '').toUpperCase();
    if (!['DEBIT', 'CREDIT'].includes(cleanNormalBalance)) {
      throw new ValidationError("Normal balance must be either 'DEBIT' or 'CREDIT'.");
    }

    const existing = await AccountingRepository.findAccountByCode(finalCode);
    if (existing) {
      throw new ConflictError(`Account code '${finalCode}' is already in use.`);
    }

    if (finalParentId) {
      const parent = await AccountingRepository.findAccountById(finalParentId);
      if (!parent) {
        throw new NotFoundError(`Parent account #${finalParentId} does not exist.`);
      }
      if (parent.account_type !== finalType) {
        throw new ValidationError(`Parent account type (${parent.account_type}) must match child account type (${finalType}).`);
      }
    }

    return pool.withTransaction(async (conn) => {
      const created = await AccountingRepository.createAccount(
        {
          account_code: finalCode,
          account_name: finalName,
          account_type: finalType,
          account_subtype: finalSubtype,
          normal_balance: cleanNormalBalance,
          description: description ? String(description).trim() : null,
          parent_account_id: finalParentId,
          property_id: property_id || null,
          is_active: is_active !== undefined ? is_active : 1,
          is_posting_allowed: is_posting_allowed !== undefined ? is_posting_allowed : 1,
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'CHART_OF_ACCOUNTS_CREATE',
        entityType: 'CHART_OF_ACCOUNTS',
        entityId: created.id,
        newValues: created,
        conn,
        throwOnError: true,
      });

      return created;
    });
  }

  static async updateAccount(id, data, user, req) {
    return pool.withTransaction(async (conn) => {
      const existing = await AccountingRepository.findAccountById(id, conn);
      if (!existing) {
        throw new NotFoundError(`Account #${id} not found.`);
      }

      const lineCount = await AccountingRepository.countAccountLines(id, conn);
      if (lineCount > 0 && data.is_posting_allowed === false) {
        throw new ValidationError('Cannot disable posting on an account that has existing transaction history.');
      }

      const updated = await AccountingRepository.updateAccount(
        id,
        {
          account_name: data.account_name || data.name,
          account_subtype: data.account_subtype || data.subtype,
          description: data.description,
          parent_account_id: data.parent_account_id || data.parent_id,
          is_active: data.is_active,
          is_posting_allowed: data.is_posting_allowed,
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'CHART_OF_ACCOUNTS_UPDATE',
        entityType: 'CHART_OF_ACCOUNTS',
        entityId: id,
        oldValues: existing,
        newValues: updated,
        conn,
        throwOnError: true,
      });

      return updated;
    });
  }

  /* =========================================================================
   * 2. ACCOUNTING PERIODS
   * ========================================================================= */
  static async listPeriods(query) {
    return AccountingRepository.findAllPeriods(query);
  }

  static async getPeriodById(id) {
    const period = await AccountingRepository.findPeriodById(id);
    if (!period) {
      throw new NotFoundError(`Accounting period #${id} not found.`);
    }
    return period;
  }

  static async createPeriod(data, user, req) {
    const { period_name, name, code, fiscal_year, start_date, end_date } = data;
    const finalName = (period_name || name || code || '').trim();

    if (!finalName || !fiscal_year || !start_date || !end_date) {
      throw new ValidationError('Missing required period fields: period_name, fiscal_year, start_date, end_date.');
    }

    if (new Date(start_date) > new Date(end_date)) {
      throw new ValidationError('Period start_date cannot be after end_date.');
    }

    const existingName = await AccountingRepository.findPeriodByName(finalName);
    if (existingName) {
      throw new ConflictError(`Accounting period '${finalName}' already exists.`);
    }

    return pool.withTransaction(async (conn) => {
      const created = await AccountingRepository.createPeriod(
        {
          period_name: finalName,
          fiscal_year: Number(fiscal_year),
          start_date,
          end_date,
          status: 'OPEN',
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'ACCOUNTING_PERIOD_CREATE',
        entityType: 'ACCOUNTING_PERIOD',
        entityId: created.id,
        newValues: created,
        conn,
        throwOnError: true,
      });

      return created;
    });
  }

  static async closePeriod(id, user, req) {
    return pool.withTransaction(async (conn) => {
      const period = await AccountingRepository.findPeriodById(id, conn);
      if (!period) {
        throw new NotFoundError(`Accounting period #${id} not found.`);
      }

      if (period.status === 'CLOSED' || period.status === 'LOCKED') {
        throw new ConflictError(`Accounting period #${id} (${period.period_name}) is already ${period.status}.`);
      }

      const unposted = await AccountingRepository.countUnpostedJournalsInPeriod(id, conn);
      if (unposted > 0) {
        throw new ValidationError(
          `Cannot close period '${period.period_name}': There are ${unposted} unposted or pending journal entries in this period.`
        );
      }

      const updated = await AccountingRepository.updatePeriod(
        id,
        {
          status: 'CLOSED',
          closed_by_id: user.id,
          closed_at: new Date(),
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'ACCOUNTING_PERIOD_CLOSE',
        entityType: 'ACCOUNTING_PERIOD',
        entityId: id,
        oldValues: period,
        newValues: updated,
        conn,
        throwOnError: true,
      });

      return updated;
    });
  }

  static async reopenPeriod(id, { reason }, user, req) {
    if (!reason || !String(reason).trim()) {
      throw new ValidationError('A detailed reason is required to reopen an accounting period.');
    }

    return pool.withTransaction(async (conn) => {
      const period = await AccountingRepository.findPeriodById(id, conn);
      if (!period) {
        throw new NotFoundError(`Accounting period #${id} not found.`);
      }

      if (period.status === 'OPEN') {
        throw new ConflictError(`Accounting period #${id} (${period.period_name}) is already OPEN.`);
      }

      const updated = await AccountingRepository.updatePeriod(
        id,
        {
          status: 'OPEN',
          reopened_by_id: user.id,
          reopened_at: new Date(),
          reopen_reason: String(reason).trim(),
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'ACCOUNTING_PERIOD_REOPEN',
        entityType: 'ACCOUNTING_PERIOD',
        entityId: id,
        oldValues: period,
        newValues: { ...updated, reopen_reason: reason },
        conn,
        throwOnError: true,
      });

      return updated;
    });
  }

  /* =========================================================================
   * 3. JOURNAL VALIDATION CORE (Exact Minor Units BigInt Math)
   * ========================================================================= */
  static async validateJournalLines(lines, user, conn = pool) {
    if (!Array.isArray(lines) || lines.length < 2) {
      throw new ValidationError('A journal entry must contain at least 2 lines.');
    }

    let totalDebitCents = 0n;
    let totalCreditCents = 0n;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineIndex = i + 1;

      if (!line.account_id) {
        throw new ValidationError(`Line #${lineIndex}: account_id is required.`);
      }

      const account = await AccountingRepository.findAccountById(line.account_id, conn);
      if (!account) {
        throw new NotFoundError(`Line #${lineIndex}: Account #${line.account_id} not found.`);
      }
      if (!account.is_active) {
        throw new ValidationError(`Line #${lineIndex}: Account '${account.account_code} - ${account.account_name}' is inactive.`);
      }
      if (!account.is_posting_allowed) {
        throw new ValidationError(
          `Line #${lineIndex}: Account '${account.account_code} - ${account.account_name}' is a summary account; direct posting is not allowed.`
        );
      }

      // Convert to exact minor units (BigInt cents/kobo) with precision validation
      const debitCents = toMinorUnits(line.debit || 0, `Line #${lineIndex} Debit`);
      const creditCents = toMinorUnits(line.credit || 0, `Line #${lineIndex} Credit`);

      if (debitCents < 0n || creditCents < 0n) {
        throw new ValidationError(`Line #${lineIndex}: Amounts cannot be negative.`);
      }

      if (debitCents === 0n && creditCents === 0n) {
        throw new ValidationError(`Line #${lineIndex}: Line must have either a positive debit or credit amount.`);
      }

      if (debitCents > 0n && creditCents > 0n) {
        throw new ValidationError(`Line #${lineIndex}: Line cannot have both debit and credit amounts.`);
      }

      // Strict Property Scoping:
      // If user is restricted to a property, line MUST belong to user's property (cannot be null or foreign)
      this.validatePropertyScope(user, line.property_id, true);

      totalDebitCents += debitCents;
      totalCreditCents += creditCents;
    }

    if (totalDebitCents !== totalCreditCents) {
      const diffCents = totalDebitCents >= totalCreditCents ? totalDebitCents - totalCreditCents : totalCreditCents - totalDebitCents;
      throw new ValidationError(
        `Journal entry is out of balance. Total Debits: ${fromMinorUnits(totalDebitCents)}, Total Credits: ${fromMinorUnits(
          totalCreditCents
        )}. Difference: ${fromMinorUnits(diffCents)}.`
      );
    }

    return {
      totalDebit: toDecimalNumber(totalDebitCents),
      totalCredit: toDecimalNumber(totalCreditCents),
      totalDebitCents,
      totalCreditCents,
    };
  }

  /* =========================================================================
   * 4. JOURNAL LIFECYCLE
   * ========================================================================= */
  static async listJournals(query, user) {
    const params = { ...query };
    if (['MANAGER', 'STAFF'].includes(user?.role?.toUpperCase()) && user.propertyId) {
      params.propertyId = user.propertyId;
    }
    return AccountingRepository.findAllJournals(params);
  }

  static async getJournalById(id, user) {
    const journal = await AccountingRepository.findJournalById(id);
    if (!journal) {
      throw new NotFoundError(`Journal entry #${id} not found.`);
    }

    // Enforce property boundary protection: prevents mixed or company journals leaking
    this.assertJournalPropertyAccess(user, journal, 'view');

    return journal;
  }

  static async createJournal(data, user, req) {
    const {
      entry_date,
      accounting_period_id,
      period_id,
      description,
      source_type = 'MANUAL',
      source_id = null,
      idempotency_key = null,
      lines = [],
    } = data;

    if (idempotency_key) {
      const existing = await AccountingRepository.findJournalByIdempotencyKey(idempotency_key);
      if (existing) {
        return existing;
      }
    }

    if (!entry_date) {
      throw new ValidationError('entry_date is required.');
    }
    if (!description || !String(description).trim()) {
      throw new ValidationError('description is required.');
    }

    return pool.withTransaction(async (conn) => {
      let resolvedPeriodId = accounting_period_id || period_id;
      let period = null;

      if (resolvedPeriodId) {
        period = await AccountingRepository.findPeriodById(resolvedPeriodId, conn);
      } else {
        period = await AccountingRepository.findActivePeriodForDate(entry_date, conn);
        if (period) resolvedPeriodId = period.id;
      }

      if (!period) {
        throw new ValidationError(`No accounting period found covering entry date ${entry_date}.`);
      }

      if (period.status !== 'OPEN') {
        throw new ValidationError(`Cannot record journal in ${period.status} accounting period '${period.period_name}'.`);
      }

      const { totalDebit, totalCredit } = await this.validateJournalLines(lines, user, conn);

      const journalNumber = await AccountingRepository.generateJournalNumber(conn);

      const created = await AccountingRepository.createJournalEntry(
        {
          journal_number: journalNumber,
          entry_date,
          accounting_period_id: resolvedPeriodId,
          description: description.trim(),
          source_type: String(source_type).toUpperCase(),
          source_id,
          idempotency_key,
          status: 'DRAFT',
          created_by_id: user.id,
          total_debit: totalDebit,
          total_credit: totalCredit,
        },
        lines,
        conn
      );

      await AuditService.record({
        req,
        action: 'JOURNAL_ENTRY_CREATE',
        entityType: 'JOURNAL_ENTRY',
        entityId: created.id,
        newValues: { id: created.id, journal_number: created.journal_number, total_debit: totalDebit },
        conn,
        throwOnError: true,
      });

      return created;
    });
  }

  static async updateDraftJournal(id, data, user, req) {
    return pool.withTransaction(async (conn) => {
      const journal = await AccountingRepository.findJournalById(id, conn, true);
      if (!journal) {
        throw new NotFoundError(`Journal entry #${id} not found.`);
      }

      this.assertJournalPropertyAccess(user, journal, 'modify');

      if (journal.status !== 'DRAFT') {
        throw new ConflictError(`Cannot edit journal #${id} in '${journal.status}' status. Only DRAFT journals can be edited.`);
      }

      const {
        entry_date = journal.entry_date,
        accounting_period_id = journal.accounting_period_id,
        period_id,
        description = journal.description,
        lines = journal.lines,
      } = data;

      const targetPeriodId = period_id || accounting_period_id;
      const period = await AccountingRepository.findPeriodById(targetPeriodId, conn);
      if (!period || period.status !== 'OPEN') {
        throw new ValidationError('Target accounting period is not OPEN.');
      }

      const { totalDebit, totalCredit } = await this.validateJournalLines(lines, user, conn);

      const updated = await AccountingRepository.updateDraftJournal(
        id,
        {
          entry_date,
          accounting_period_id: targetPeriodId,
          description: description.trim(),
          total_debit: totalDebit,
          total_credit: totalCredit,
        },
        lines,
        conn
      );

      await AuditService.record({
        req,
        action: 'JOURNAL_ENTRY_UPDATE',
        entityType: 'JOURNAL_ENTRY',
        entityId: id,
        oldValues: { status: journal.status, total: journal.total_debit },
        newValues: { status: updated.status, total: totalDebit },
        conn,
        throwOnError: true,
      });

      return updated;
    });
  }

  static async submitJournal(id, user, req) {
    return pool.withTransaction(async (conn) => {
      const journal = await AccountingRepository.findJournalById(id, conn, true);
      if (!journal) {
        throw new NotFoundError(`Journal entry #${id} not found.`);
      }

      this.assertJournalPropertyAccess(user, journal, 'submit');

      if (journal.status !== 'DRAFT') {
        throw new ConflictError(`Cannot submit journal #${id}: current status is '${journal.status}', expected 'DRAFT'.`);
      }

      const period = await AccountingRepository.findPeriodById(journal.accounting_period_id, conn);
      if (!period || period.status !== 'OPEN') {
        throw new ValidationError(`Accounting period '${period?.period_name}' is no longer OPEN.`);
      }

      await this.validateJournalLines(journal.lines, user, conn);

      const updated = await AccountingRepository.updateJournalStatus(
        id,
        {
          status: 'PENDING_APPROVAL',
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'JOURNAL_ENTRY_SUBMIT',
        entityType: 'JOURNAL_ENTRY',
        entityId: id,
        oldValues: { status: 'DRAFT' },
        newValues: { status: 'PENDING_APPROVAL' },
        conn,
        throwOnError: true,
      });

      return updated;
    });
  }

  static async approveJournal(id, { approval_notes }, user, req) {
    return pool.withTransaction(async (conn) => {
      const journal = await AccountingRepository.findJournalById(id, conn, true);
      if (!journal) {
        throw new NotFoundError(`Journal entry #${id} not found.`);
      }

      this.assertJournalPropertyAccess(user, journal, 'approve');

      if (journal.status !== 'PENDING_APPROVAL') {
        throw new ConflictError(`Cannot approve journal #${id}: status is '${journal.status}', expected 'PENDING_APPROVAL'.`);
      }

      // Maker-Checker Independent Dual Control Enforcement
      if (journal.source_type === 'MANUAL' && parseInt(journal.created_by_id, 10) === parseInt(user.id, 10)) {
        throw new ForbiddenError(
          'Maker-checker violation: The creator of a manual journal cannot approve it. An independent reviewer is required.'
        );
      }

      const updated = await AccountingRepository.updateJournalStatus(
        id,
        {
          status: 'APPROVED',
          approved_by_id: user.id,
          approved_at: new Date(),
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'JOURNAL_ENTRY_APPROVE',
        entityType: 'JOURNAL_ENTRY',
        entityId: id,
        oldValues: { status: 'PENDING_APPROVAL' },
        newValues: { status: 'APPROVED', approver_id: user.id, notes: approval_notes },
        conn,
        throwOnError: true,
      });

      return updated;
    });
  }

  static async rejectJournal(id, { rejection_reason }, user, req) {
    if (!rejection_reason || !String(rejection_reason).trim()) {
      throw new ValidationError('A detailed rejection reason is required.');
    }

    return pool.withTransaction(async (conn) => {
      const journal = await AccountingRepository.findJournalById(id, conn, true);
      if (!journal) {
        throw new NotFoundError(`Journal entry #${id} not found.`);
      }

      this.assertJournalPropertyAccess(user, journal, 'reject');

      if (journal.status !== 'PENDING_APPROVAL') {
        throw new ConflictError(`Cannot reject journal #${id}: status is '${journal.status}', expected 'PENDING_APPROVAL'.`);
      }

      const updated = await AccountingRepository.updateJournalStatus(
        id,
        {
          status: 'REJECTED',
          rejected_by_id: user.id,
          rejected_at: new Date(),
          rejection_reason: String(rejection_reason).trim(),
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'JOURNAL_ENTRY_REJECT',
        entityType: 'JOURNAL_ENTRY',
        entityId: id,
        oldValues: { status: 'PENDING_APPROVAL' },
        newValues: { status: 'REJECTED', reason: rejection_reason },
        conn,
        throwOnError: true,
      });

      return updated;
    });
  }

  static async postJournal(id, user, req) {
    return pool.withTransaction(async (conn) => {
      const journal = await AccountingRepository.findJournalById(id, conn, true);
      if (!journal) {
        throw new NotFoundError(`Journal entry #${id} not found.`);
      }

      this.assertJournalPropertyAccess(user, journal, 'post');

      if (journal.status !== 'APPROVED') {
        throw new ConflictError(`Cannot post journal #${id}: status is '${journal.status}', expected 'APPROVED'.`);
      }

      const period = await AccountingRepository.findPeriodById(journal.accounting_period_id, conn);
      if (!period || period.status !== 'OPEN') {
        throw new ValidationError(
          `Cannot post journal: Accounting period '${period?.period_name}' is ${period?.status}. Ordinary posting to closed periods is forbidden.`
        );
      }

      const { totalDebit, totalCredit } = await this.validateJournalLines(journal.lines, user, conn);

      // Generate General Ledger postings with exact minor unit net impact
      const glEntries = [];
      for (const l of journal.lines) {
        const account = await AccountingRepository.findAccountById(l.account_id, conn);
        const debitCents = toMinorUnits(l.debit);
        const creditCents = toMinorUnits(l.credit);
        const netImpactCents = account?.normal_balance === 'DEBIT' ? debitCents - creditCents : creditCents - debitCents;

        glEntries.push({
          journal_entry_id: journal.id,
          journal_line_id: l.id,
          account_id: l.account_id,
          property_id: l.property_id || null,
          posting_date: journal.entry_date,
          accounting_period_id: journal.accounting_period_id,
          debit: l.debit,
          credit: l.credit,
          net_balance_impact: toDecimalNumber(netImpactCents),
          description: l.description || journal.description,
        });
      }

      await AccountingRepository.insertGeneralLedgerEntries(glEntries, conn);

      const updated = await AccountingRepository.updateJournalStatus(
        id,
        {
          status: 'POSTED',
          posted_by_id: user.id,
          posted_at: new Date(),
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'JOURNAL_ENTRY_POST',
        entityType: 'JOURNAL_ENTRY',
        entityId: id,
        oldValues: { status: 'APPROVED' },
        newValues: { status: 'POSTED', poster_id: user.id, total: totalDebit },
        conn,
        throwOnError: true,
      });

      return updated;
    });
  }

  static async reverseJournal(id, { reversal_reason, conn: externalConn = null } = {}, user, req) {
    if (!reversal_reason || !String(reversal_reason).trim()) {
      throw new ValidationError('A detailed reversal reason is required.');
    }

    const action = async (conn) => {
      const original = await AccountingRepository.findJournalById(id, conn, true);
      if (!original) {
        throw new NotFoundError(`Journal entry #${id} not found.`);
      }

      this.assertJournalPropertyAccess(user, original, 'reverse');

      if (original.status !== 'POSTED') {
        throw new ConflictError(`Cannot reverse journal #${id}: status is '${original.status}', expected 'POSTED'.`);
      }

      if (original.is_reversed) {
        throw new ConflictError(`Journal #${id} has already been reversed by journal #${original.reversed_by_journal_id}.`);
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const activePeriod = await AccountingRepository.findActivePeriodForDate(todayStr, conn);
      if (!activePeriod || activePeriod.status !== 'OPEN') {
        throw new ValidationError('Cannot reverse journal: No open accounting period found for today.');
      }

      // Inverted lines: debit becomes credit, credit becomes debit
      const reversedLines = original.lines.map((l) => ({
        account_id: l.account_id,
        property_id: l.property_id,
        debit: l.credit,
        credit: l.debit,
        description: `Reversal of ${original.journal_number}: ${l.description || original.description}`,
      }));

      const reversalJournalNumber = await AccountingRepository.generateJournalNumber(conn);

      const reversingJournal = await AccountingRepository.createJournalEntry(
        {
          journal_number: reversalJournalNumber,
          entry_date: todayStr,
          accounting_period_id: activePeriod.id,
          description: `REVERSAL of ${original.journal_number} - ${reversal_reason.trim()}`,
          source_type: 'ADJUSTMENT',
          source_id: String(original.id),
          status: 'POSTED',
          created_by_id: user.id,
          total_debit: original.total_credit,
          total_credit: original.total_debit,
          reversal_of_journal_id: original.id,
        },
        reversedLines,
        conn
      );

      await AccountingRepository.updateJournalStatus(
        reversingJournal.id,
        {
          approved_by_id: user.id,
          approved_at: new Date(),
          posted_by_id: user.id,
          posted_at: new Date(),
        },
        conn
      );

      const glEntries = [];
      for (const l of reversingJournal.lines) {
        const account = await AccountingRepository.findAccountById(l.account_id, conn);
        const debitCents = toMinorUnits(l.debit);
        const creditCents = toMinorUnits(l.credit);
        const netImpactCents = account?.normal_balance === 'DEBIT' ? debitCents - creditCents : creditCents - debitCents;

        glEntries.push({
          journal_entry_id: reversingJournal.id,
          journal_line_id: l.id,
          account_id: l.account_id,
          property_id: l.property_id || null,
          posting_date: todayStr,
          accounting_period_id: activePeriod.id,
          debit: l.debit,
          credit: l.credit,
          net_balance_impact: toDecimalNumber(netImpactCents),
          description: l.description,
        });
      }

      await AccountingRepository.insertGeneralLedgerEntries(glEntries, conn);

      await AccountingRepository.updateJournalStatus(
        original.id,
        {
          is_reversed: 1,
          reversed_by_journal_id: reversingJournal.id,
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'JOURNAL_ENTRY_REVERSE',
        entityType: 'JOURNAL_ENTRY',
        entityId: original.id,
        oldValues: { is_reversed: 0 },
        newValues: {
          is_reversed: 1,
          reversed_by_journal_id: reversingJournal.id,
          reversal_journal_number: reversingJournal.journal_number,
          reason: reversal_reason,
        },
        conn,
        throwOnError: true,
      });

      return {
        originalJournal: await AccountingRepository.findJournalById(original.id, conn),
        reversingJournal: await AccountingRepository.findJournalById(reversingJournal.id, conn),
      };
    };

    if (externalConn) {
      return action(externalConn);
    }
    return pool.withTransaction(action);
  }

  /* =========================================================================
   * 5. GENERAL LEDGER & TRIAL BALANCE
   * ========================================================================= */
  static async listLedgerEntries(query, user) {
    const params = { ...query };
    if (['MANAGER', 'STAFF'].includes(user?.role?.toUpperCase()) && user.propertyId) {
      params.propertyId = user.propertyId;
    }
    return AccountingRepository.findAllGeneralLedgerEntries(params);
  }

  static async getTrialBalanceSummary(query = {}, user = null) {
    const params = { ...query };
    if (['MANAGER', 'STAFF'].includes(user?.role?.toUpperCase()) && user.propertyId) {
      params.propertyId = user.propertyId;
    }
    return AccountingRepository.getTrialBalanceSummary(params);
  }
}

module.exports = AccountingService;
