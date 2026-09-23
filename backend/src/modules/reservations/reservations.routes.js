const express = require('express');
const ReservationsController = require('./reservations.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// List & Detail
router.get('/', ReservationsController.getAll);
router.get('/:id', ReservationsController.getById);
router.get('/:id/history', ReservationsController.getHistory);

// Create Reservation
router.post('/', ReservationsController.create);

// Update Reservation
router.put(
  '/:id',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'RECEPTIONIST'),
  ReservationsController.update
);

// Lifecycle Actions
router.post(
  '/:id/confirm',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'RECEPTIONIST'),
  ReservationsController.confirm
);

router.post(
  '/:id/cancel',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'RECEPTIONIST', 'STAFF', 'AGENT'),
  ReservationsController.cancel
);

router.post(
  '/:id/check-in',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'RECEPTIONIST', 'STAFF'),
  ReservationsController.checkIn
);

router.post(
  '/:id/check-out',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'RECEPTIONIST', 'STAFF'),
  ReservationsController.checkOut
);

router.post(
  '/:id/no-show',
  requireRoles('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'RECEPTIONIST'),
  ReservationsController.noShow
);

module.exports = router;
