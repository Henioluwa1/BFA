const express = require('express');
const ApartmentsController = require('./apartments.controller');
const InternalSpacesController = require('./internalSpaces.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

const MANAGER_ROLES = ['ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'OWNER', 'SUPER_ADMIN'];
const STAFF_ROLES = ['ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'OWNER', 'SUPER_ADMIN', 'STAFF', 'RECEPTIONIST'];

// Internal Spaces Routes (Level C in Property Hierarchy)
router.get('/:id/spaces', InternalSpacesController.list);
router.post('/:id/spaces', requireRoles(...MANAGER_ROLES), InternalSpacesController.create);
router.put('/spaces/:spaceId', requireRoles(...MANAGER_ROLES), InternalSpacesController.update);
router.delete('/spaces/:spaceId', requireRoles(...MANAGER_ROLES), InternalSpacesController.delete);
router.post('/spaces/:spaceId/media', requireRoles(...MANAGER_ROLES), InternalSpacesController.uploadMedia);
router.delete('/spaces/:spaceId/media/:mediaId', requireRoles(...MANAGER_ROLES), InternalSpacesController.deleteMedia);

router.get('/', ApartmentsController.getAll);
router.get('/:id', ApartmentsController.getById);
router.get('/:id/availability', ApartmentsController.checkAvailability);

// Apartment Media & Dynamic Amenities
router.post('/:id/media', requireRoles(...MANAGER_ROLES), ApartmentsController.uploadMedia);
router.get('/:id/media', ApartmentsController.getMedia);
router.post('/:id/amenities', requireRoles(...MANAGER_ROLES), ApartmentsController.createAmenities);
router.get('/:id/amenities', ApartmentsController.getAmenities);

// Unit modifications
router.post('/', requireRoles(...MANAGER_ROLES), ApartmentsController.create);
router.put('/:id', requireRoles(...MANAGER_ROLES), ApartmentsController.update);
router.patch('/:id/status', requireRoles(...STAFF_ROLES), ApartmentsController.updateStatus);
router.patch('/:id/readiness', requireRoles(...STAFF_ROLES), ApartmentsController.updateReadiness);

// Operational Blocked Periods
router.get('/:id/blocked-periods', requireRoles(...STAFF_ROLES), ApartmentsController.getBlockedPeriods);
router.post('/:id/blocked-periods', requireRoles(...MANAGER_ROLES), ApartmentsController.addBlockedPeriod);
router.delete('/:id/blocked-periods/:blockId', requireRoles(...MANAGER_ROLES), ApartmentsController.deleteBlockedPeriod);

module.exports = router;
