const express = require('express');
const ContactController = require('./contact.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Public routes (no auth required)
router.post('/submit', ContactController.submitInquiry);
router.post('/lookup', ContactController.lookupByAccessCode);
router.get('/inquiry/:token/detail', ContactController.getClientInquiryDetail);
router.post('/inquiry/:token/messages', ContactController.addClientMessage);
router.post('/inquiry/:token/feedback', ContactController.submitClientFeedback);

// Authenticated staff routes
router.use(requireAuth);
const staffViewRoles = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST', 'STAFF'];
const managementRoles = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST'];

router.get('/manage', requireRoles(...staffViewRoles), ContactController.listInquiries);
router.get('/manage/:id', requireRoles(...staffViewRoles), ContactController.getInquiryById);
router.post('/manage/:id/assign', requireRoles(...managementRoles), ContactController.assignInquiry);
router.post('/manage/:id/messages', requireRoles(...staffViewRoles), ContactController.addStaffMessage);
router.post('/manage/:id/close', requireRoles(...managementRoles), ContactController.closeInquiry);
router.post('/manage/:id/reopen', requireRoles('SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER'), ContactController.reopenInquiry);

module.exports = router;
