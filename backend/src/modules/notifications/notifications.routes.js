const express = require('express');
const NotificationsController = require('./notifications.controller');
const { requireAuth } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

router.get('/', NotificationsController.getMyNotifications);
router.get('/unread-count', NotificationsController.getUnreadCount);
router.put('/:id/read', NotificationsController.markRead);
router.patch('/:id/read', NotificationsController.markRead);
router.post('/read-all', NotificationsController.markAllRead);

module.exports = router;
