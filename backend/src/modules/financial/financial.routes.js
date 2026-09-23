const express = require('express');
const FinancialController = require('./financial.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

const allowedRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];

router.get('/overview', requireRoles(...allowedRoles), FinancialController.getOverview);
router.get('/ledger', requireRoles(...allowedRoles), FinancialController.getLedger);

module.exports = router;
