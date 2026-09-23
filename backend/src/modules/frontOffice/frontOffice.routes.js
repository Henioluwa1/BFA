const express = require('express');
const FrontOfficeController = require('./frontOffice.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

const authorizedRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'];

router.get('/arrivals', requireRoles(...authorizedRoles), FrontOfficeController.getArrivals);
router.get('/departures', requireRoles(...authorizedRoles), FrontOfficeController.getDepartures);
router.get('/current-guests', requireRoles(...authorizedRoles), FrontOfficeController.getCurrentGuests);
router.get('/stats', requireRoles(...authorizedRoles), FrontOfficeController.getStats);

router.post('/reservations/:id/check-in', requireRoles(...authorizedRoles), FrontOfficeController.checkIn);
router.post('/reservations/:id/check-out', requireRoles(...authorizedRoles), FrontOfficeController.checkOut);
router.post('/reservations/:id/no-show', requireRoles(...authorizedRoles), FrontOfficeController.noShow);

module.exports = router;
