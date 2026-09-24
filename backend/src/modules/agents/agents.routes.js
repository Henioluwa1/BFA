const express = require('express');
const AgentsController = require('./agents.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

router.get('/', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT'), AgentsController.getAll);
router.get('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT'), AgentsController.getById);
router.get('/:id/clients', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'AGENT'), AgentsController.getClients);
router.get('/:id/performance', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'AGENT'), AgentsController.getPerformance);

router.post('/', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), AgentsController.create);
router.put('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), AgentsController.update);
router.patch('/:id/status', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), AgentsController.updateStatus);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN'), AgentsController.remove);

module.exports = router;
