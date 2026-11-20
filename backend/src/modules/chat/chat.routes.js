const express = require('express');
const ChatController = require('./chat.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Base protection: All chat endpoints require authentication and active operational role
const ALLOWED_CHAT_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'OPERATIONS_MANAGER',
  'OWNER',
  'RECEPTIONIST',
  'STAFF',
];

router.use(requireAuth);
router.use(requireRoles(...ALLOWED_CHAT_ROLES));

// 1. Staff contacts discovery & total unread count
router.get('/contacts', ChatController.getContacts);
router.get('/unread-count', ChatController.getUnreadCount);

// 2. Conversation threads management
router.get('/threads', ChatController.getThreads);
router.get('/threads/:id', ChatController.getThreadById);
router.post('/threads/direct', ChatController.createDirectThread);
router.post('/threads/group', ChatController.createGroupThread);

// Property team channels (Admin / Manager)
router.post(
  '/threads/channel',
  requireRoles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER'),
  ChatController.createPropertyChannel
);

// System broadcasts (Super Admin / Admin only)
router.post('/threads/broadcast', requireRoles('SUPER_ADMIN', 'ADMIN'), ChatController.createSystemBroadcast);

// 3. Thread participants management
router.get('/threads/:id/participants', ChatController.getThreadParticipants);
router.post('/threads/:id/participants', ChatController.addParticipants);
router.delete('/threads/:id/participants/:userId', ChatController.removeParticipant);

// 4. Message history & message operations
router.get('/threads/:id/history', ChatController.getThreadHistory);
router.post('/threads/:id/messages', ChatController.sendMessage);
router.post('/threads/:id/read', ChatController.markAsRead);
router.delete('/messages/:id', ChatController.deleteMessage);

// 5. Secure authenticated attachment retrieval and download streaming
router.get('/threads/:id/attachments/:attachmentId', ChatController.getAttachment);
router.get('/threads/:id/attachments/:attachmentId/download', ChatController.downloadAttachment);

// 6. Context entity link preview resolution
router.get('/context-preview', ChatController.getContextPreview);

// 7. Retention policy governance (Admin only)
router.get('/retention', requireRoles('SUPER_ADMIN', 'ADMIN'), ChatController.getRetention);
router.put('/retention', requireRoles('SUPER_ADMIN', 'ADMIN'), ChatController.updateRetention);

module.exports = router;
