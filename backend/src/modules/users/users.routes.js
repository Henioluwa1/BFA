const express = require('express');
const UsersController = require('./users.controller');
const { requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

// Role details accessible to authenticated staff
router.get('/roles', requireRoles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'), UsersController.getRoles);

// User administration
router.get('/', requireRoles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'), UsersController.listUsers);
router.post('/', requireRoles('SUPER_ADMIN', 'ADMIN'), UsersController.createUser);
router.get('/:id', requireRoles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'), UsersController.getUserById);
router.put('/:id', requireRoles('SUPER_ADMIN', 'ADMIN'), UsersController.updateUser);

module.exports = router;
