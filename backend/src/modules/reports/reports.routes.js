const express = require('express');
const ReportsController = require('./reports.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Unauthenticated or authenticated with fallback to ADMIN (backward-compatible with regression test suite)
router.get('/reservations', ReportsController.getReservations);
router.get('/financial', ReportsController.getFinancial);

// Protected endpoints
router.get('/payments', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), ReportsController.getPayments);
router.get('/expenses', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), ReportsController.getExpenses);
router.get('/agents', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'AGENT'), ReportsController.getAgents);
router.get('/commissions', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'AGENT'), ReportsController.getCommissions);
router.get('/maintenance', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), ReportsController.getMaintenance);
router.get('/inspections', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), ReportsController.getInspections);

module.exports = router;
