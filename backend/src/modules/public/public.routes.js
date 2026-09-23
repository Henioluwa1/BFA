const express = require('express');
const {
  getPublicProperties,
  getPublicApartments,
  checkAvailability,
  createPublicBooking,
  getPublicAnnouncements,
} = require('./public.controller');
const BookingAuthController = require('../bookingAuth/bookingAuth.controller');

const router = express.Router();

router.get('/properties', getPublicProperties);
router.get('/apartments', getPublicApartments);
router.post('/check-availability', checkAvailability);
router.post('/booking', createPublicBooking);
router.get('/announcements', getPublicAnnouncements);
router.post('/booking-lookup', BookingAuthController.verifyBooking);

module.exports = router;

