const AccountingService = require('./accounting.service');
const ApiResponse = require('../../utils/apiResponse');

class AccountingController {
  /* =========================================================================
   * CHART OF ACCOUNTS
   * ========================================================================= */
  static async listAccounts(req, res, next) {
    try {
      const accounts = await AccountingService.listAccounts(req.query);
      return ApiResponse.success(res, {
        message: 'Chart of accounts retrieved successfully',
        data: accounts,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAccountById(req, res, next) {
    try {
      const account = await AccountingService.getAccountById(req.params.id);
      return ApiResponse.success(res, {
        message: 'Account details retrieved successfully',
        data: account,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createAccount(req, res, next) {
    try {
      const account = await AccountingService.createAccount(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Account created successfully',
        data: account,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateAccount(req, res, next) {
    try {
      const account = await AccountingService.updateAccount(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Account updated successfully',
        data: account,
      });
    } catch (err) {
      next(err);
    }
  }

  /* =========================================================================
   * ACCOUNTING PERIODS
   * ========================================================================= */
  static async listPeriods(req, res, next) {
    try {
      const periods = await AccountingService.listPeriods(req.query);
      return ApiResponse.success(res, {
        message: 'Accounting periods retrieved successfully',
        data: periods,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPeriodById(req, res, next) {
    try {
      const period = await AccountingService.getPeriodById(req.params.id);
      return ApiResponse.success(res, {
        message: 'Accounting period retrieved successfully',
        data: period,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createPeriod(req, res, next) {
    try {
      const period = await AccountingService.createPeriod(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Accounting period created successfully',
        data: period,
      });
    } catch (err) {
      next(err);
    }
  }

  static async closePeriod(req, res, next) {
    try {
      const period = await AccountingService.closePeriod(req.params.id, req.user, req);
      return ApiResponse.success(res, {
        message: 'Accounting period closed successfully',
        data: period,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reopenPeriod(req, res, next) {
    try {
      const period = await AccountingService.reopenPeriod(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Accounting period reopened successfully',
        data: period,
      });
    } catch (err) {
      next(err);
    }
  }

  /* =========================================================================
   * JOURNAL ENTRIES
   * ========================================================================= */
  static async listJournals(req, res, next) {
    try {
      const result = await AccountingService.listJournals(req.query, req.user);
      return ApiResponse.paginated(res, {
        message: 'Journal entries retrieved successfully',
        data: result.data,
        page: result.page,
        limit: result.limit,
        total: result.total,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getJournalById(req, res, next) {
    try {
      const journal = await AccountingService.getJournalById(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Journal entry details retrieved successfully',
        data: journal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createJournal(req, res, next) {
    try {
      const journal = await AccountingService.createJournal(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Journal entry created successfully',
        data: journal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateDraftJournal(req, res, next) {
    try {
      const journal = await AccountingService.updateDraftJournal(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Draft journal entry updated successfully',
        data: journal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async submitJournal(req, res, next) {
    try {
      const journal = await AccountingService.submitJournal(req.params.id, req.user, req);
      return ApiResponse.success(res, {
        message: 'Journal entry submitted for approval',
        data: journal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async approveJournal(req, res, next) {
    try {
      const journal = await AccountingService.approveJournal(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Journal entry approved successfully',
        data: journal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async rejectJournal(req, res, next) {
    try {
      const journal = await AccountingService.rejectJournal(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Journal entry rejected',
        data: journal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async postJournal(req, res, next) {
    try {
      const journal = await AccountingService.postJournal(req.params.id, req.user, req);
      return ApiResponse.success(res, {
        message: 'Journal entry posted to General Ledger successfully',
        data: journal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reverseJournal(req, res, next) {
    try {
      const result = await AccountingService.reverseJournal(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Journal entry reversed successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /* =========================================================================
   * GENERAL LEDGER & TRIAL BALANCE
   * ========================================================================= */
  static async listLedger(req, res, next) {
    try {
      const result = await AccountingService.listLedgerEntries(req.query, req.user);
      return ApiResponse.paginated(res, {
        message: 'General Ledger entries retrieved successfully',
        data: result.data,
        page: result.page,
        limit: result.limit,
        total: result.total,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getTrialBalanceSummary(req, res, next) {
    try {
      const summary = await AccountingService.getTrialBalanceSummary(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Trial balance summary retrieved successfully',
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }

  /* =========================================================================
   * SUBLEDGER POSTING BRIDGES & AUTOMATED POSTING
   * ========================================================================= */
  static async runNightAudit(req, res, next) {
    try {
      const PostingBridgeService = require('./postingBridge.service');
      const results = await PostingBridgeService.runNightAudit({
        serviceDate: req.body?.service_date || req.body?.date,
        propertyId: req.body?.property_id,
        user: req.user,
        req,
      });
      return ApiResponse.success(res, {
        message: 'Night audit executed successfully',
        data: results,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listPostingRecords(req, res, next) {
    try {
      const PostingBridgeService = require('./postingBridge.service');
      const result = await PostingBridgeService.listPostingRecords(req.query, req.user);
      return ApiResponse.paginated(res, {
        message: 'Subledger posting records retrieved successfully',
        data: result.data,
        page: result.page,
        limit: result.limit,
        total: result.total,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listPostingExceptions(req, res, next) {
    try {
      const PostingBridgeService = require('./postingBridge.service');
      const result = await PostingBridgeService.listExceptions(req.query, req.user);
      return ApiResponse.paginated(res, {
        message: 'Posting exceptions retrieved successfully',
        data: result.data,
        page: result.page,
        limit: result.limit,
        total: result.total,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async resolvePostingException(req, res, next) {
    try {
      const PostingBridgeService = require('./postingBridge.service');
      const result = await PostingBridgeService.resolveException(
        req.params.id,
        {
          action: req.body?.action || 'RETRY',
          notes: req.body?.notes || req.body?.resolution_notes || '',
        },
        req.user,
        req
      );
      return ApiResponse.success(res, {
        message: result.message,
        data: result.data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async retryPostingRecord(req, res, next) {
    try {
      const PostingBridgeService = require('./postingBridge.service');
      const PostingBridgeRepository = require('./postingBridge.repository');
      const record = await PostingBridgeRepository.findPostingRecordById(req.params.id);
      if (!record) {
        return res.status(404).json({ success: false, error: { message: `Posting record #${req.params.id} not found.` } });
      }

      let result = null;
      if (record.source_module === 'PAYMENTS' && record.source_event_type === 'PAYMENT_COLLECTED') {
        result = await PostingBridgeService.postPayment(record.source_entity_id, { user: req.user, req });
      } else if (record.source_module === 'PAYMENTS' && record.source_event_type === 'PAYMENT_REFUNDED') {
        result = await PostingBridgeService.postRefund(record.source_entity_id, { user: req.user, req });
      } else if (record.source_module === 'RESERVATIONS') {
        result = await PostingBridgeService.postRevenueRecognition({
          reservationId: record.source_entity_id,
          serviceDate: record.service_date,
          propertyId: record.property_id,
          user: req.user,
          req,
        });
      } else if (record.source_module === 'EXPENSES') {
        result = await PostingBridgeService.postExpense(record.source_entity_id, { user: req.user, req });
      }

      return ApiResponse.success(res, {
        message: 'Posting record retried successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reconcileSubledger(req, res, next) {
    try {
      const PostingBridgeService = require('./postingBridge.service');
      const reconciliation = await PostingBridgeService.reconcile(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Subledger reconciliation completed',
        data: reconciliation,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listAccountMappings(req, res, next) {
    try {
      const PostingBridgeService = require('./postingBridge.service');
      const mappings = await PostingBridgeService.listAccountMappings();
      return ApiResponse.success(res, {
        message: 'Operational account mappings retrieved successfully',
        data: mappings,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateAccountMapping(req, res, next) {
    try {
      const PostingBridgeService = require('./postingBridge.service');
      const updated = await PostingBridgeService.updateAccountMapping(
        req.params.key,
        req.body?.account_id,
        req.user,
        req
      );
      return ApiResponse.success(res, {
        message: 'Account mapping updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AccountingController;
