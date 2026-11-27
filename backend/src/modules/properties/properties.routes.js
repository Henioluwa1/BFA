const express = require('express');
const PropertiesController = require('./properties.controller');
const PropertySubmissionsController = require('./propertySubmissions.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Dual-Review Property & Apartment Governance & Submissions Routes
router.get('/submissions', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertySubmissionsController.list);
router.post('/submissions', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertySubmissionsController.create);
router.get('/submissions/:id', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertySubmissionsController.getById);
router.get('/submissions/:id/document', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertySubmissionsController.getDocument);
router.get('/submissions/:id/pdf', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertySubmissionsController.downloadPdf);
router.post('/submissions/:id/review', requireRoles('OWNER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'), PropertySubmissionsController.review);
router.post('/submissions/:id/publish', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'), PropertySubmissionsController.publish);

// Media Gallery Routes
router.post('/:id/media', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.uploadMedia);
router.get('/:id/media', PropertiesController.getMedia);
router.patch('/:id/media/:mediaId/cover', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.setCover);
router.put('/:id/media/reorder', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.reorderMedia);
router.patch('/:id/media/:mediaId/publish', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertiesController.publishMedia);
router.delete('/:id/media/:mediaId', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.deleteMedia);

router.get('/', PropertiesController.getAll);
router.get('/:id', PropertiesController.getById);
router.get('/:id/hierarchy', PropertiesController.getHierarchy);
router.get('/:id/apartments', PropertiesController.getApartments);

// Dynamic Building Amenities Routes (Max 7)
router.post('/:id/amenities', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.createAmenities);
router.get('/:id/amenities', PropertiesController.getAmenities);

// Operational creation and modification routes
router.post('/', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.create);
router.put('/:id', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.update);
router.patch('/:id/status', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.updateStatus);
router.post('/:id/submit-approval', requireRoles('ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'), PropertiesController.submitForApproval);
router.delete('/:id', requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), PropertiesController.archiveOrDelete);

module.exports = router;
