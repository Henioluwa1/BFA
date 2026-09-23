const express = require('express');
const AnnouncementsController = require('./announcements.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Public active announcements
router.get('/active', AnnouncementsController.getActive);

// Management routes
router.get(
  '/',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  AnnouncementsController.listAll
);

router.post(
  '/',
  requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'),
  AnnouncementsController.create
);

router.patch(
  '/:id/toggle',
  requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'),
  AnnouncementsController.toggle
);

module.exports = router;
