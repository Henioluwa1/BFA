const express = require('express');
const ReportsController = require('./reports.controller');

const router = express.Router();

router.get('/reservations', ReportsController.getReservations);
router.get('/financial', ReportsController.getFinancial);

module.exports = router;
