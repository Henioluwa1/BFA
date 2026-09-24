const express = require('express');
const router = express.Router();
const EmployeesController = require('./employees.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'];

// 1. Public QR Verification Route (Gate 11.13)
router.get('/verify-id-card/:token', EmployeesController.verifyIdCardToken);

// 2. Authenticated Self-Service Routes (Gate 11.14)
router.get('/me/profile', requireAuth, EmployeesController.getMyProfile);
router.put('/me/profile', requireAuth, EmployeesController.updateMyProfile);
router.get('/me/performance', requireAuth, EmployeesController.getMyPerformance);
router.get('/me/activities', requireAuth, EmployeesController.getMyActivities);
router.get('/me/evaluations', requireAuth, EmployeesController.getMyEvaluations);
router.get('/me/id-card', requireAuth, EmployeesController.getMyIdCard);

// 3. Evaluation Criteria Templates
router.get('/evaluation-criteria', requireAuth, EmployeesController.getCriteria);

// 4. Global Evaluations Collection
router.get('/evaluations', requireAuth, EmployeesController.getEvaluations);
router.post('/evaluations', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.createEvaluation);
router.get('/evaluations/:evalId', requireAuth, EmployeesController.getEvaluationById);
router.put('/evaluations/:evalId', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.updateEvaluation);
router.put('/evaluations/:evalId/submit', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.submitEvaluation);
router.patch('/evaluations/:evalId/submit', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.submitEvaluation);
router.put('/evaluations/:evalId/finalize', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.finalizeEvaluation);
router.patch('/evaluations/:evalId/finalize', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.finalizeEvaluation);

// 5. Global ID Cards Collection
router.get('/id-cards', requireAuth, EmployeesController.getIdCards);
router.post('/id-cards/generate', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.generateIdCard);
router.get('/id-cards/:cardId', requireAuth, EmployeesController.getIdCardById);
router.put('/id-cards/:cardId/reissue', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.reissueIdCard);
router.post('/id-cards/:cardId/reissue', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.reissueIdCard);
router.patch('/id-cards/:cardId/reissue', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.reissueIdCard);
router.put('/id-cards/:cardId/revoke', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.revokeIdCard);
router.patch('/id-cards/:cardId/revoke', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.revokeIdCard);
router.get('/id-cards/:cardId/pdf', requireAuth, EmployeesController.downloadIdCardPDF);

// 6. Global Activities Collection
router.get('/activities/summary', requireAuth, EmployeesController.getActivitySummary);
router.get('/activities', requireAuth, EmployeesController.getActivities);

// 7. Directory Stats
router.get('/stats', requireAuth, EmployeesController.getStats);

// 8. Individual Employee Records & Nested Sub-resources
router.get('/', requireAuth, EmployeesController.getAll);
router.post('/', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.create);
router.get('/:id', requireAuth, EmployeesController.getById);
router.put('/:id', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.update);
router.put('/:id/status', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.updateStatus);
router.patch('/:id/status', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.updateStatus);
router.post('/:id/photo', requireAuth, EmployeesController.uploadPhoto);
router.get('/:id/photo', EmployeesController.getPhoto); // Publicly streamable / embeddable photo

router.get('/:id/performance', requireAuth, EmployeesController.getPerformance);

router.get('/:id/activities', requireAuth, EmployeesController.getActivities);
router.post('/:id/activities', requireAuth, EmployeesController.logActivity);

router.get('/:id/evaluations', requireAuth, EmployeesController.getEvaluations);
router.post('/:id/evaluations', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.createEvaluation);
router.get('/:id/evaluations/:evalId', requireAuth, EmployeesController.getEvaluationById);
router.put('/:id/evaluations/:evalId', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.updateEvaluation);
router.put('/:id/evaluations/:evalId/submit', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.submitEvaluation);
router.patch('/:id/evaluations/:evalId/submit', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.submitEvaluation);
router.put('/:id/evaluations/:evalId/finalize', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.finalizeEvaluation);
router.patch('/:id/evaluations/:evalId/finalize', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.finalizeEvaluation);

router.get('/:id/id-card', requireAuth, EmployeesController.getActiveIdCard);
router.post('/:id/id-card', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.generateIdCard);
router.get('/:id/id-card/pdf', requireAuth, EmployeesController.downloadIdCardPDF);
router.post('/:id/id-card/reissue', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.reissueIdCard);
router.patch('/:id/id-card/reissue', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.reissueIdCard);
router.put('/:id/id-card/:cardId/revoke', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.revokeIdCard);
router.patch('/:id/id-card/:cardId/revoke', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.revokeIdCard);
router.put('/:id/id-card/:cardId/reissue', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.reissueIdCard);
router.patch('/:id/id-card/:cardId/reissue', requireAuth, requireRoles(...ADMIN_ROLES), EmployeesController.reissueIdCard);

module.exports = router;
