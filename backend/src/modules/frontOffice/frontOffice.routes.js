const express = require('express');
const FrontOfficeController = require('./frontOffice.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

const staffAndAdminRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF'];
const managementRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];

// Operational views
router.get('/arrivals', requireRoles(...staffAndAdminRoles), FrontOfficeController.getArrivals);
router.get('/departures', requireRoles(...staffAndAdminRoles), FrontOfficeController.getDepartures);
router.get('/current-guests', requireRoles(...staffAndAdminRoles), FrontOfficeController.getCurrentGuests);
router.get('/pending-bookings', requireRoles(...staffAndAdminRoles), FrontOfficeController.getPendingBookings);
router.get('/stats', requireRoles(...staffAndAdminRoles), FrontOfficeController.getStats);

// Live operational feed (for Managers & Admins to observe operations in real time)
router.get('/live-feed', requireRoles(...managementRoles), FrontOfficeController.getLiveOperationalFeed);

// Front-desk client assignment & approval
router.post('/reservations/:id/accept', requireRoles(...staffAndAdminRoles), FrontOfficeController.acceptReservation);

// Guest lifecycle transitions
router.post('/reservations/:id/check-in', requireRoles(...staffAndAdminRoles), FrontOfficeController.checkIn);
router.post('/reservations/:id/check-out', requireRoles(...staffAndAdminRoles), FrontOfficeController.checkOut);
router.post('/reservations/:id/no-show', requireRoles(...staffAndAdminRoles), FrontOfficeController.noShow);

module.exports = router;
