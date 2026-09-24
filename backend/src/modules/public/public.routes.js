const express = require('express');
const {
  getPublicProperties,
  getPublicApartments,
  checkAvailability,
  createPublicBooking,
  getPublicAnnouncements,
} = require('./public.controller');
const BookingAuthController = require('../bookingAuth/bookingAuth.controller');
const { bookingLimiter } = require('../../core/security/security');

const router = express.Router();

router.get('/properties', getPublicProperties);
router.get('/apartments', getPublicApartments);
router.post('/check-availability', checkAvailability);
router.post('/booking', bookingLimiter, createPublicBooking);
router.get('/announcements', getPublicAnnouncements);
router.post('/booking-lookup', bookingLimiter, BookingAuthController.verifyBooking);

module.exports = router;

