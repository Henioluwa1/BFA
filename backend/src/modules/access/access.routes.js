const express = require('express');
const AccessController = require('./access.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Public / operational capability check
router.get('/check/:capabilityName', AccessController.checkCapability);

// Protected capability management
router.get(
  '/capabilities',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  AccessController.getCapabilities
);

router.post(
  '/capabilities/update',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  AccessController.updateCapability
);

router.post(
  '/overrides/request',
  requireRoles('SUPER_ADMIN'),
  AccessController.requestOverride
);

router.get(
  '/approvals',
  requireRoles('OWNER', 'SUPER_ADMIN'),
  AccessController.getApprovalRequests
);

router.post(
  '/approvals/:requestId/review',
  requireRoles('OWNER', 'SUPER_ADMIN'),
  AccessController.reviewApproval
);

router.post(
  '/overrides/force',
  requireRoles('SUPER_ADMIN'),
  AccessController.forceOverride
);

router.get(
  '/overrides',
  requireRoles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'ADMIN'),
  AccessController.getOverrides
);

module.exports = router;
