const express = require('express');
const PropertiesController = require('./properties.controller');

const router = express.Router();

router.get('/', PropertiesController.getAll);
router.get('/:id', PropertiesController.getById);

module.exports = router;
