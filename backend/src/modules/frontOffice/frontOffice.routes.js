const express = require('express');
const FrontOfficeController = require('./frontOffice.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

// Front Desk Operational Roles (STAFF excluded from front desk transactions)
const frontOfficeRoles = ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST'];
const frontOfficeViewRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST'];
const managementRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER'];

// Operational views
router.get('/arrivals', requireRoles(...frontOfficeViewRoles), FrontOfficeController.getArrivals);
router.get('/departures', requireRoles(...frontOfficeViewRoles), FrontOfficeController.getDepartures);
router.get('/current-guests', requireRoles(...frontOfficeViewRoles), FrontOfficeController.getCurrentGuests);
router.get('/pending-bookings', requireRoles(...frontOfficeViewRoles), FrontOfficeController.getPendingBookings);
router.get('/stats', requireRoles(...frontOfficeViewRoles), FrontOfficeController.getStats);

// Live operational feed (for Managers & Admins to observe operations in real time)
router.get('/live-feed', requireRoles(...managementRoles), FrontOfficeController.getLiveOperationalFeed);

// Front-desk client assignment & approval (STAFF strictly excluded)
router.post('/claim', requireRoles(...frontOfficeRoles), FrontOfficeController.claimReservation);
router.post('/reservations/:id/claim', requireRoles(...frontOfficeRoles), FrontOfficeController.claimReservation);
router.post('/reservations/:id/approve', requireRoles(...frontOfficeRoles), FrontOfficeController.approveReservation);
router.post('/reservations/:id/decline', requireRoles(...frontOfficeRoles), FrontOfficeController.declineReservation);
router.get('/reservations/:id/payment-proof', requireRoles(...frontOfficeRoles), FrontOfficeController.getPaymentProof);
router.post('/reservations/:id/accept', requireRoles(...frontOfficeRoles), FrontOfficeController.acceptReservation);

// Guest lifecycle transitions (STAFF strictly excluded)
router.post('/reservations/:id/check-in', requireRoles(...frontOfficeRoles), FrontOfficeController.checkIn);
router.post('/reservations/:id/check-out', requireRoles(...frontOfficeRoles), FrontOfficeController.checkOut);
router.post('/reservations/:id/no-show', requireRoles(...frontOfficeRoles), FrontOfficeController.noShow);

module.exports = router;
