const express = require('express');
const ReportsController = require('./reports.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

const ALL_OPERATIONAL_ROLES = [
  'SUPER_ADMIN',
  'OWNER',
  'ADMIN',
  'OPERATIONS_MANAGER',
  'MANAGER',
  'RECEPTIONIST',
  'STAFF',
];

const MANAGEMENT_ROLES = [
  'SUPER_ADMIN',
  'OWNER',
  'ADMIN',
  'OPERATIONS_MANAGER',
  'MANAGER',
];

// ─── Central Operational Reporting Engine ──────────────────────────────
router.get('/operational/daily', requireAuth, requireRoles(...ALL_OPERATIONAL_ROLES), ReportsController.getOperationalDaily);
router.get('/operational/monthly', requireAuth, requireRoles(...ALL_OPERATIONAL_ROLES), ReportsController.getOperationalMonthly);
router.get('/operational/pdf', requireAuth, requireRoles(...ALL_OPERATIONAL_ROLES), ReportsController.downloadOperationalPdf);
router.post('/operational/finalize', requireAuth, requireRoles(...MANAGEMENT_ROLES), ReportsController.finalizeOperationalSnapshot);
router.post('/operational/requests', requireAuth, requireRoles(...MANAGEMENT_ROLES), ReportsController.requestOperationalReport);
router.get('/operational/requests', requireAuth, requireRoles(...ALL_OPERATIONAL_ROLES), ReportsController.listOperationalReportRequests);

// ─── Existing Module Reports (Preserved with backward compatibility) ───
router.get('/reservations', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT'), ReportsController.getReservations);
router.get('/financial', requireAuth, requireRoles(...MANAGEMENT_ROLES), ReportsController.getFinancial);
router.get('/payments', requireAuth, requireRoles(...MANAGEMENT_ROLES), ReportsController.getPayments);
router.get('/expenses', requireAuth, requireRoles(...MANAGEMENT_ROLES), ReportsController.getExpenses);
router.get('/agents', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'AGENT'), ReportsController.getAgents);
router.get('/commissions', requireAuth, requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'AGENT'), ReportsController.getCommissions);
router.get('/maintenance', requireAuth, requireRoles(...MANAGEMENT_ROLES), ReportsController.getMaintenance);
router.get('/inspections', requireAuth, requireRoles(...MANAGEMENT_ROLES), ReportsController.getInspections);

module.exports = router;
