const express = require('express');
const ExpensesController = require('./expenses.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const router = express.Router();

router.use(requireAuth);

const viewRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];
const manageRoles = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];

router.get('/stats', requireRoles(...viewRoles), ExpensesController.getStats);
router.get('/', requireRoles(...viewRoles), ExpensesController.getAll);
router.get('/:id', requireRoles(...viewRoles), ExpensesController.getById);

router.post('/', requireRoles(...manageRoles), ExpensesController.create);
router.put('/:id', requireRoles(...manageRoles), ExpensesController.update);
router.post('/:id/approve', requireRoles(...manageRoles), ExpensesController.approve);
router.post('/:id/void', requireRoles(...manageRoles), ExpensesController.void);

module.exports = router;
