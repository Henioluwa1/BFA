const express = require('express');
const PaymentsController = require('./payments.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Get supported payment gateways
router.get('/gateways', PaymentsController.getGateways);

// Process payment (Direct recording restricted strictly to corporate administrators)
router.post('/process', requireAuth, requireRoles('SUPER_ADMIN', 'ADMIN'), PaymentsController.processPayment);

// Get single payment transaction by ID
router.get('/:id', requireAuth, requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'), PaymentsController.getById);

// List payment transactions (Manager, Admin, Owner, Super Admin)
router.get(
  '/',
  requireAuth,
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  PaymentsController.getPayments
);

// Refund / Reversal transaction (Corporate Governance: Admin and Owner only — Super Admin blocked from business cash outflows)
router.post(
  '/:id/refund',
  requireAuth,
  requireRoles('OWNER', 'ADMIN'),
  PaymentsController.refund
);

module.exports = router;
