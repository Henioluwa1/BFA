const express = require('express');
const AnalyticsController = require('./analytics.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

router.get('/overview', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT'), AnalyticsController.getOverview);
router.get('/reservations', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'AGENT'), AnalyticsController.getReservations);
router.get('/apartments', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), AnalyticsController.getApartments);
router.get('/agents', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'AGENT'), AnalyticsController.getAgents);
router.get('/operations', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), AnalyticsController.getOperations);

module.exports = router;
