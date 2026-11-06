const express = require('express');
const FinancialController = require('./financial.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

const allowedRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];

// Overview & High-level KPIs
router.get('/overview', requireRoles(...allowedRoles), FinancialController.getOverview);

// General / Subledger Entries
router.get('/ledger', requireRoles(...allowedRoles), FinancialController.getLedger);

// Authoritative Double-Entry Financial Statements
router.get('/income-statement', requireRoles(...allowedRoles), FinancialController.getIncomeStatement);
router.get('/balance-sheet', requireRoles(...allowedRoles), FinancialController.getBalanceSheet);
router.get('/cash-flow', requireRoles(...allowedRoles), FinancialController.getCashFlowStatement);
router.get('/receivables', requireRoles(...allowedRoles), FinancialController.getReceivables);
router.get('/refunds-reconciliation', requireRoles(...allowedRoles), FinancialController.getRefundsReconciliation);

module.exports = router;
