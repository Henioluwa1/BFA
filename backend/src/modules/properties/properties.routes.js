const express = require('express');
const PropertiesController = require('./properties.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.get('/', PropertiesController.getAll);
router.get('/:id', PropertiesController.getById);
router.get('/:id/apartments', PropertiesController.getApartments);

// Administrative modification routes
router.post('/', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertiesController.create);
router.put('/:id', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertiesController.update);
router.patch('/:id/status', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertiesController.updateStatus);

module.exports = router;
