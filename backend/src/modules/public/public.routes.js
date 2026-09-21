const express = require('express');
const {
  getPublicProperties,
  getPublicApartments,
  checkAvailability,
  createPublicBooking,
} = require('./public.controller');

const router = express.Router();

router.get('/properties', getPublicProperties);
router.get('/apartments', getPublicApartments);
router.post('/check-availability', checkAvailability);
router.post('/booking', createPublicBooking);

module.exports = router;
