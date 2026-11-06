const express = require('express');
const MaintenanceController = require('./maintenance.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

const operationalRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'RECEPTIONIST'];
const managementRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];
const workerRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

router.get('/stats', requireRoles(...operationalRoles), MaintenanceController.getStats);
router.get('/eligible-technicians', requireRoles(...managementRoles), MaintenanceController.getEligibleTechnicians);
router.get('/', requireRoles(...operationalRoles), MaintenanceController.getAll);
router.get('/:id', requireRoles(...operationalRoles), MaintenanceController.getById);

router.post('/', requireRoles(...operationalRoles), MaintenanceController.create);
router.post('/:id/assign', requireRoles(...managementRoles), MaintenanceController.assign);
router.post('/:id/start', requireRoles(...workerRoles), MaintenanceController.start);
router.post('/:id/resolve', requireRoles(...workerRoles), MaintenanceController.resolve);
router.post('/:id/cancel', requireRoles(...managementRoles), MaintenanceController.cancel);

// Evidence collection and streaming routes (Package C)
router.post('/:id/evidence', requireRoles(...workerRoles), MaintenanceController.uploadEvidence);
router.get('/:id/evidence', requireRoles(...operationalRoles), MaintenanceController.listEvidence);
router.get('/:id/evidence/:evidenceId/stream', requireRoles(...operationalRoles), MaintenanceController.streamEvidence);
router.get('/:id/evidence/:evidenceId', requireRoles(...operationalRoles), MaintenanceController.streamEvidence);
router.delete('/:id/evidence/:evidenceId', requireRoles(...managementRoles), MaintenanceController.deleteEvidence);

// Hardened Work Order Deletion (Package D - Admin only)
router.delete('/:id', requireRoles('SUPER_ADMIN', 'ADMIN'), MaintenanceController.delete);

module.exports = router;
