const express = require('express');
const AccountingController = require('./accounting.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');
const requireCapability = require('../../core/middleware/requireCapability');

const router = express.Router();

router.use(requireAuth);

const viewRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];
const postingViewRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'STAFF'];
const coaManageRoles = ['SUPER_ADMIN', 'ADMIN'];
const periodManageRoles = ['SUPER_ADMIN', 'ADMIN'];
const journalCreateRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];
const journalApprovalRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN'];
const journalPostingRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN'];
const journalReversalRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN'];

/* =========================================================================
 * 1. CHART OF ACCOUNTS
 * ========================================================================= */
router.get('/accounts', requireRoles(...viewRoles), AccountingController.listAccounts);
router.get('/accounts/:id', requireRoles(...viewRoles), AccountingController.getAccountById);
router.post(
  '/accounts',
  requireRoles(...coaManageRoles),
  requireCapability('ACCOUNTING_COA_MANAGE'),
  AccountingController.createAccount
);
router.put(
  '/accounts/:id',
  requireRoles(...coaManageRoles),
  requireCapability('ACCOUNTING_COA_MANAGE'),
  AccountingController.updateAccount
);

/* =========================================================================
 * 2. ACCOUNTING PERIODS
 * ========================================================================= */
router.get('/periods', requireRoles(...viewRoles), AccountingController.listPeriods);
router.get('/periods/:id', requireRoles(...viewRoles), AccountingController.getPeriodById);
router.post(
  '/periods',
  requireRoles(...periodManageRoles),
  requireCapability('ACCOUNTING_PERIOD_MANAGE'),
  AccountingController.createPeriod
);
router.post(
  '/periods/:id/close',
  requireRoles(...periodManageRoles),
  requireCapability('ACCOUNTING_PERIOD_MANAGE'),
  AccountingController.closePeriod
);
router.post(
  '/periods/:id/reopen',
  requireRoles(...periodManageRoles),
  requireCapability('ACCOUNTING_PERIOD_MANAGE'),
  AccountingController.reopenPeriod
);

/* =========================================================================
 * 3. JOURNAL ENTRIES
 * ========================================================================= */
router.get('/journals', requireRoles(...viewRoles), AccountingController.listJournals);
router.get('/journals/:id', requireRoles(...viewRoles), AccountingController.getJournalById);
router.post(
  '/journals',
  requireRoles(...journalCreateRoles),
  requireCapability('ACCOUNTING_JOURNAL_CREATE'),
  AccountingController.createJournal
);
router.put(
  '/journals/:id',
  requireRoles(...journalCreateRoles),
  requireCapability('ACCOUNTING_JOURNAL_CREATE'),
  AccountingController.updateDraftJournal
);
router.post(
  '/journals/:id/submit',
  requireRoles(...journalCreateRoles),
  requireCapability('ACCOUNTING_JOURNAL_CREATE'),
  AccountingController.submitJournal
);
router.post(
  '/journals/:id/approve',
  requireRoles(...journalApprovalRoles),
  requireCapability('ACCOUNTING_JOURNAL_APPROVE'),
  AccountingController.approveJournal
);
router.post(
  '/journals/:id/reject',
  requireRoles(...journalApprovalRoles),
  requireCapability('ACCOUNTING_JOURNAL_APPROVE'),
  AccountingController.rejectJournal
);
router.post(
  '/journals/:id/post',
  requireRoles(...journalPostingRoles),
  requireCapability('ACCOUNTING_JOURNAL_POST'),
  AccountingController.postJournal
);
router.post(
  '/journals/:id/reverse',
  requireRoles(...journalReversalRoles),
  requireCapability('ACCOUNTING_JOURNAL_REVERSE'),
  AccountingController.reverseJournal
);

/* =========================================================================
 * 4. GENERAL LEDGER & TRIAL BALANCE
 * ========================================================================= */
router.get('/ledger', requireRoles(...viewRoles), AccountingController.listLedger);
router.get('/trial-balance-summary', requireRoles(...viewRoles), AccountingController.getTrialBalanceSummary);

/* =========================================================================
 * 5. SUBLEDGER POSTING BRIDGES, OUTBOX & EXCEPTION RESOLUTION
 * ========================================================================= */
router.post(
  '/night-audit',
  requireRoles('SUPER_ADMIN', 'ADMIN'),
  requireCapability('ACCOUNTING_SUBLEDGER_POST'),
  AccountingController.runNightAudit
);

router.get('/posting-records', requireRoles(...postingViewRoles), AccountingController.listPostingRecords);
router.post(
  '/posting-records/:id/retry',
  requireRoles('SUPER_ADMIN', 'ADMIN'),
  requireCapability('ACCOUNTING_SUBLEDGER_POST'),
  AccountingController.retryPostingRecord
);

router.get('/posting-exceptions', requireRoles(...postingViewRoles), AccountingController.listPostingExceptions);
router.post(
  '/posting-exceptions/:id/resolve',
  requireRoles('SUPER_ADMIN', 'ADMIN'),
  requireCapability('ACCOUNTING_EXCEPTION_RESOLVE'),
  AccountingController.resolvePostingException
);

router.get('/reconcile', requireRoles(...viewRoles), AccountingController.reconcileSubledger);

router.get('/account-mappings', requireRoles(...viewRoles), AccountingController.listAccountMappings);
router.put(
  '/account-mappings/:key',
  requireRoles('SUPER_ADMIN', 'ADMIN'),
  requireCapability('ACCOUNTING_COA_MANAGE'),
  AccountingController.updateAccountMapping
);

module.exports = router;
