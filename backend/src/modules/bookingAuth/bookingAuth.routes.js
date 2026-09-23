const express = require('express');
const BookingAuthController = require('./bookingAuth.controller');

const router = express.Router();

// Public booking authentication verification endpoints
router.post('/verify', BookingAuthController.verifyBooking);
router.get('/lookup', BookingAuthController.lookupByQuery);

module.exports = router;
