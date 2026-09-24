const express = require('express');
const SystemController = require('./system.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.get('/info', SystemController.getInfo);
router.get('/settings', requireRoles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'MANAGER'), SystemController.getSettings);
router.put('/settings', requireRoles('ADMIN', 'SUPER_ADMIN'), SystemController.updateSettings);

module.exports = router;
