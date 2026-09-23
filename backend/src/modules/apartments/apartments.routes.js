const express = require('express');
const ApartmentsController = require('./apartments.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.get('/', ApartmentsController.getAll);
router.get('/:id', ApartmentsController.getById);
router.get('/:id/availability', ApartmentsController.checkAvailability);

// Unit modifications
router.post(
  '/',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  ApartmentsController.create
);
router.put(
  '/:id',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'),
  ApartmentsController.update
);
router.patch(
  '/:id/status',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'STAFF', 'RECEPTIONIST'),
  ApartmentsController.updateStatus
);

module.exports = router;
