const express = require('express');
const ApartmentsController = require('./apartments.controller');

const router = express.Router();

router.get('/', ApartmentsController.getAll);
router.get('/:id', ApartmentsController.getById);

module.exports = router;
