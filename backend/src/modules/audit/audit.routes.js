const express = require('express');
const AuditController = require('./audit.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Only Admin, Manager, and Owner may access audit logs (Section 10)
router.get('/', requireRoles('ADMIN', 'MANAGER', 'OWNER'), AuditController.getLogs);

module.exports = router;
