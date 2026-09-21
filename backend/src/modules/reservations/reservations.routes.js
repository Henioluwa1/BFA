const express = require('express');
const ReservationsController = require('./reservations.controller');

const router = express.Router();

router.get('/', ReservationsController.getAll);
router.get('/:id', ReservationsController.getById);
router.post('/', ReservationsController.create);

module.exports = router;
