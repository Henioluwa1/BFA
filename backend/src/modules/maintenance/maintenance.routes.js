const express = require('express');
const MaintenanceController = require('./maintenance.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

const operationalRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'RECEPTIONIST'];
const managementRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];
const workerRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

router.get('/stats', requireRoles(...operationalRoles), MaintenanceController.getStats);
router.get('/', requireRoles(...operationalRoles), MaintenanceController.getAll);
router.get('/:id', requireRoles(...operationalRoles), MaintenanceController.getById);

router.post('/', requireRoles(...operationalRoles), MaintenanceController.create);
router.post('/:id/assign', requireRoles(...managementRoles), MaintenanceController.assign);
router.post('/:id/start', requireRoles(...workerRoles), MaintenanceController.start);
router.post('/:id/resolve', requireRoles(...workerRoles), MaintenanceController.resolve);
router.post('/:id/cancel', requireRoles(...managementRoles), MaintenanceController.cancel);

module.exports = router;
