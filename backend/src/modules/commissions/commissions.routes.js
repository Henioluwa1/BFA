const express = require('express');
const CommissionsController = require('./commissions.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

router.get('/', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT'), CommissionsController.getAll);
router.get('/summary', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT'), CommissionsController.getSummary);
router.get('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT'), CommissionsController.getById);

router.post('/calculate', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), CommissionsController.calculate);
router.patch('/:id/approve', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), CommissionsController.approve);
router.post('/:id/payout', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), CommissionsController.payout);
router.patch('/:id/payout', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), CommissionsController.payout);
router.patch('/:id/void', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), CommissionsController.voidCommission);

module.exports = router;
