const express = require('express');
const SystemController = require('./system.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// General system information
router.get('/info', SystemController.getInfo);

// Operations Control Center & System Governance
router.get('/operations/overview', requireRoles('SUPER_ADMIN'), SystemController.getOperationsOverview);
router.get('/operations/migrations', requireRoles('SUPER_ADMIN'), SystemController.getMigrationCatalog);
router.put('/operations/modules/:id/toggle', requireRoles('SUPER_ADMIN'), SystemController.toggleModule);
router.post('/operations/backup', requireRoles('SUPER_ADMIN'), SystemController.createBackup);

// Operational Settings
router.get('/settings', requireRoles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'MANAGER'), SystemController.getSettings);
router.put('/settings', requireRoles('ADMIN', 'SUPER_ADMIN'), SystemController.updateSettings);

module.exports = router;
