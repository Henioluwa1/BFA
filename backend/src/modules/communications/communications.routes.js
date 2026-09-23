const express = require('express');
const CommunicationsController = require('./communications.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// List communications
router.get(
  '/',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'STAFF'),
  CommunicationsController.list
);

// Templates
router.get('/templates', requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'), CommunicationsController.listTemplates);
router.post('/templates', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), CommunicationsController.createTemplate);

// Communication CRUD and Workflow
router.post(
  '/',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  CommunicationsController.create
);

router.get(
  '/:id',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'STAFF'),
  CommunicationsController.getById
);

router.post(
  '/:id/submit',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  CommunicationsController.submit
);

router.post(
  '/:id/approve',
  requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'),
  CommunicationsController.approve
);

router.post(
  '/:id/reject',
  requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'),
  CommunicationsController.reject
);

router.post(
  '/:id/send',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  CommunicationsController.send
);

module.exports = router;
