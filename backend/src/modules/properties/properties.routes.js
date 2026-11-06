const express = require('express');
const PropertiesController = require('./properties.controller');
const PropertySubmissionsController = require('./propertySubmissions.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Dual-Review Property Governance & Submissions Routes
router.get('/submissions', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertySubmissionsController.list);
router.post('/submissions', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertySubmissionsController.create);
router.get('/submissions/:id', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertySubmissionsController.getById);
router.post('/submissions/:id/review', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertySubmissionsController.review);
router.post('/submissions/:id/publish', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertySubmissionsController.publish);

// Media Gallery Routes
router.post('/:id/media', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.uploadMedia);
router.get('/:id/media', PropertiesController.getMedia);
router.patch('/:id/media/:mediaId/cover', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.setCover);
router.put('/:id/media/reorder', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.reorderMedia);
router.patch('/:id/media/:mediaId/publish', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertiesController.publishMedia);
router.delete('/:id/media/:mediaId', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.deleteMedia);

router.get('/', PropertiesController.getAll);
router.get('/:id', PropertiesController.getById);
router.get('/:id/apartments', PropertiesController.getApartments);

// Administrative modification routes
router.post('/', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertiesController.create);
router.put('/:id', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertiesController.update);
router.patch('/:id/status', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertiesController.updateStatus);

module.exports = router;
