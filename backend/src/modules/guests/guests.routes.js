const express = require('express');
const GuestsController = require('./guests.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

router.get('/duplicates', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'), GuestsController.getDuplicates);
router.post('/merge', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN'), GuestsController.merge);

router.get('/', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT'), GuestsController.getAll);
router.get('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT'), GuestsController.getById);
router.get('/:id/reservations', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT'), GuestsController.getReservations);

router.post('/', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'), GuestsController.create);
router.put('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'), GuestsController.update);

module.exports = router;
