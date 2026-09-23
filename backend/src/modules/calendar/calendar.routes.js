const express = require('express');
const CalendarController = require('./calendar.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

router.get('/', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT'), CalendarController.getEvents);
router.get('/availability', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'), CalendarController.getTimeline);

module.exports = router;
