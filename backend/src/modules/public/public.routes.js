const express = require('express');
const {
  getPublicProperties,
  getPublicPropertyDetail,
  getPublicRoomTypes,
  getPublicApartments,
  checkAvailability,
  getPublicQuote,
  getPublicPaymentConfig,
  uploadPaymentProof,
  createPublicBooking,
  trackBooking,
  cancelPublicBooking,
  requestRoomChange,
  getPublicAnnouncements,
} = require('./public.controller');
const BookingAuthController = require('../bookingAuth/bookingAuth.controller');
const { bookingLimiter } = require('../../core/security/security');

const router = express.Router();

router.get('/properties', getPublicProperties);
router.get('/properties/:id', getPublicPropertyDetail);
router.get('/properties/:id/room-types', getPublicRoomTypes);
router.get('/apartments', getPublicApartments);
router.post('/check-availability', checkAvailability);
router.post('/quote', bookingLimiter, getPublicQuote);
router.get('/payment-config', getPublicPaymentConfig);
router.post('/upload-proof', bookingLimiter, uploadPaymentProof);
router.post('/booking', bookingLimiter, createPublicBooking);
router.post('/booking-tracking/lookup', bookingLimiter, trackBooking);
router.post('/booking-tracking/cancel', bookingLimiter, cancelPublicBooking);
router.post('/booking-tracking/change-room', bookingLimiter, requestRoomChange);
router.get('/announcements', getPublicAnnouncements);
router.post('/booking-lookup', bookingLimiter, BookingAuthController.verifyBooking);

module.exports = router;
