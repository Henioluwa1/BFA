const express = require('express');
const PaymentsController = require('./payments.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Get supported payment gateways
router.get('/gateways', PaymentsController.getGateways);

// Process payment (can be called publicly or internally)
router.post('/process', PaymentsController.processPayment);

// Get single payment transaction by ID
router.get('/:id', requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'), PaymentsController.getById);

// List payment transactions (Manager, Admin, Owner, Super Admin)
router.get(
  '/',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  PaymentsController.getPayments
);

// Refund / Reversal transaction (Manager, Admin, Owner, Super Admin)
router.post(
  '/:id/refund',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  PaymentsController.refund
);

module.exports = router;
