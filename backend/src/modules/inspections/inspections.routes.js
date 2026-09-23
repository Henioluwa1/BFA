const express = require('express');
const InspectionsController = require('./inspections.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

const allowedRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

router.get('/', requireRoles(...allowedRoles), InspectionsController.getAll);
router.get('/:id', requireRoles(...allowedRoles), InspectionsController.getById);
router.post('/', requireRoles(...allowedRoles), InspectionsController.create);
router.put('/:id', requireRoles(...allowedRoles), InspectionsController.update);
router.post('/:id/complete', requireRoles(...allowedRoles), InspectionsController.complete);

module.exports = router;
