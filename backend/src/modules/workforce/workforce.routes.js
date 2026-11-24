const express = require('express');
const router = express.Router();
const WorkforceController = require('./workforce.controller');
const OperationsWorkforceController = require('./operationsWorkforce.controller');
const CentralOperationsController = require('./centralOperations.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const MANAGEMENT_ROLES = ['ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'OWNER'];
const ALL_STAFF_ROLES = ['ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'OWNER', 'STAFF', 'RECEPTIONIST'];

// ─── Operational Roster & Property Assignments ─────────────────────────
router.post('/assignments', requireAuth, requireRoles(...MANAGEMENT_ROLES), OperationsWorkforceController.createAssignment);
router.get('/assignments', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.listAssignments);
router.get('/assignments/:id', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.getAssignmentById);
router.patch('/assignments/:id/status', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.updateAssignmentStatus);
router.get('/assignments/:id/pdf', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.downloadAssignmentPdf);

// ─── Operational Tasks & Blockers ──────────────────────────────────────
router.post('/tasks', requireAuth, requireRoles(...MANAGEMENT_ROLES), OperationsWorkforceController.createTask);
router.get('/tasks', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.listTasks);
router.get('/tasks/:id', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.getTaskById);
router.patch('/tasks/:id/progress', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.updateTaskProgress);
router.post('/tasks/:id/blockers', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.reportBlocker);
router.patch('/blockers/:blockerId/resolve', requireAuth, requireRoles(...MANAGEMENT_ROLES), OperationsWorkforceController.resolveBlocker);
router.patch('/tasks/:id/review', requireAuth, requireRoles(...MANAGEMENT_ROLES), OperationsWorkforceController.reviewTask);

// ─── Disciplinary Queries & Show-Cause Notices (Owner barred) ──────────
// STRICT GOVERNANCE: Owner is strictly excluded from disciplinary queries
const DISCIPLINARY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'STAFF', 'RECEPTIONIST'];
router.post('/disciplinary/queries', requireAuth, requireRoles('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER'), OperationsWorkforceController.issueQuery);
router.get('/disciplinary/queries', requireAuth, requireRoles(...DISCIPLINARY_ROLES), OperationsWorkforceController.listQueries);
router.get('/disciplinary/queries/:id', requireAuth, requireRoles(...DISCIPLINARY_ROLES), OperationsWorkforceController.getQueryById);
router.post('/disciplinary/queries/:id/respond', requireAuth, requireRoles(...DISCIPLINARY_ROLES), OperationsWorkforceController.submitQueryResponse);
router.patch('/disciplinary/queries/:id/conclude', requireAuth, requireRoles('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER'), OperationsWorkforceController.concludeQuery);
router.patch('/disciplinary/queries/:id/sanction-review', requireAuth, requireRoles('SUPER_ADMIN', 'ADMIN'), OperationsWorkforceController.sanctionReview);

// ─── Performance Improvement Plans (PIPs) & Recognitions (Owner barred) 
router.post('/disciplinary/pips', requireAuth, requireRoles('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER'), OperationsWorkforceController.createPip);
router.get('/disciplinary/pips', requireAuth, requireRoles(...DISCIPLINARY_ROLES), OperationsWorkforceController.listPips);
router.patch('/disciplinary/pips/:id', requireAuth, requireRoles('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER'), OperationsWorkforceController.updatePip);

// ─── Admin Operational Directives & Manager Plans ──────────────────────
router.post('/directives', requireAuth, requireRoles('SUPER_ADMIN', 'ADMIN'), OperationsWorkforceController.createDirective);
router.get('/directives', requireAuth, requireRoles(...MANAGEMENT_ROLES), OperationsWorkforceController.listDirectives);
router.get('/directives/:id', requireAuth, requireRoles(...MANAGEMENT_ROLES), OperationsWorkforceController.getDirectiveById);
router.post('/directives/:id/plan', requireAuth, requireRoles(...MANAGEMENT_ROLES), OperationsWorkforceController.submitDirectiveExecutionPlan);
router.patch('/directives/:id/status', requireAuth, requireRoles('SUPER_ADMIN', 'ADMIN'), OperationsWorkforceController.updateDirectiveStatus);

// ─── Central Operations, Directives, Operations Memos & Workflows ─────
router.post('/operations', requireAuth, requireRoles(...MANAGEMENT_ROLES, 'SUPER_ADMIN'), CentralOperationsController.createOperation);
router.get('/operations', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.listOperations);
router.get('/operations/summary', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.getOperationsSummary);
router.get('/operations/memos/:memoId/pdf', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.downloadMemoPdf);
router.get('/operations/:id/memo/pdf', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.downloadMemoPdf);
router.get('/operations/:id', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.getOperationById);
router.post('/operations/:id/claim', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.claimOperation);
router.post('/operations/:id/assign', requireAuth, requireRoles(...MANAGEMENT_ROLES, 'SUPER_ADMIN'), CentralOperationsController.assignOperation);
router.post('/operations/:id/acknowledge', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.acknowledgeOperation);
router.post('/operations/:id/clarification', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.requestClarification);
router.post('/operations/:id/clarification/respond', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.respondClarification);
router.post('/operations/:id/blockers', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.reportBlocker);
router.post('/operations/:id/progress', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.updateProgress);
router.post('/operations/:id/tasks', requireAuth, requireRoles(...MANAGEMENT_ROLES, 'SUPER_ADMIN'), CentralOperationsController.createLinkedTask);
router.post('/operations/:id/completion', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.submitCompletion);
router.post('/operations/:id/review', requireAuth, requireRoles(...MANAGEMENT_ROLES, 'SUPER_ADMIN'), CentralOperationsController.reviewOperation);
router.post('/operations/:id/amend', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.amendOperation);
router.post('/operations/:id/cancel', requireAuth, requireRoles(...ALL_STAFF_ROLES, 'SUPER_ADMIN'), CentralOperationsController.cancelOperation);

// ─── Staff-Submitted Operational Reports ───────────────────────────────
router.post('/staff-reports', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.submitStaffReport);
router.get('/staff-reports', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.listStaffReports);
router.get('/staff-reports/:id', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.getStaffReportById);
router.patch('/staff-reports/:id/review', requireAuth, requireRoles(...MANAGEMENT_ROLES), OperationsWorkforceController.reviewStaffReport);

// ─── Evidence-Based Performance Engine ─────────────────────────────────
router.get('/performance/personal', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.getPersonalPerformance);
router.get('/performance/staff/:userId', requireAuth, requireRoles(...ALL_STAFF_ROLES), OperationsWorkforceController.getStaffPerformance);
router.get('/performance/overview', requireAuth, requireRoles(...MANAGEMENT_ROLES), OperationsWorkforceController.getWorkforcePerformanceOverview);

// ─── Existing Shift Templates ──────────────────────────────────────────
router.get('/templates', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.listTemplates);
router.post('/templates', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.createTemplate);

// ─── Existing Rosters & Planning ───────────────────────────────────────
router.get('/rosters', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.listRosters);
router.post('/rosters', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.createRoster);
router.get('/rosters/:id', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.getRosterById);
router.post('/rosters/:id/publish', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.publishRoster);

// ─── Existing Shifts ───────────────────────────────────────────────────
router.get('/shifts', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listShifts);
router.post('/shifts', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.scheduleShift);
router.put('/shifts/:id', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.updateShift);
router.delete('/shifts/:id', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.deleteShift);

// ─── Existing Availability & Swaps ─────────────────────────────────────
router.post('/availability', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.submitAvailability);
router.get('/availability', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.getAvailability);
router.post('/swaps', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.requestSwap);
router.get('/swaps', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listSwaps);
router.patch('/swaps/:id/review', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.reviewSwap);

// ─── Existing Attendance & Time Tracking ───────────────────────────────
router.post('/attendance/clock-in', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.clockIn);
router.post('/attendance/clock-out', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.clockOut);
router.post('/attendance/break-start', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.startBreak);
router.post('/attendance/break-end', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.endBreak);
router.get('/attendance', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listAttendance);
router.post('/attendance/kiosk-clock', WorkforceController.kioskClock);
router.post('/attendance/manual', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.recordManualAttendance);
router.patch('/attendance/:id/verify', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.verifyAttendance);
router.get('/attendance/policies/:propertyId?', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.getPolicy);
router.put('/attendance/policies/:propertyId?', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.updatePolicy);

// ─── Kiosks ────────────────────────────────────────────────────────────
router.post('/kiosks', requireAuth, requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), WorkforceController.registerKiosk);
router.get('/kiosks', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.listKiosks);
router.patch('/kiosks/:id/status', requireAuth, requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), WorkforceController.updateKioskStatus);
router.post('/kiosks/:id/rotate-secret', requireAuth, requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), WorkforceController.rotateKioskSecret);

// ─── Attendance Corrections & Leave ────────────────────────────────────
router.post('/attendance/corrections', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.requestAttendanceCorrection);
router.get('/attendance/corrections', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listAttendanceCorrections);
router.patch('/attendance/corrections/:id/review', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.reviewAttendanceCorrection);
router.get('/leave/categories', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listLeaveCategories);
router.get('/leave/balances/:employeeId?', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.getLeaveBalances);
router.post('/leave/requests', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.submitLeave);
router.get('/leave/requests', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listLeaveRequests);
router.patch('/leave/requests/:id/review', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.reviewLeave);
router.patch('/leave/requests/:id/escalate', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.escalateLeave);

// ─── Timesheets ────────────────────────────────────────────────────────
router.get('/timesheets', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.getTimesheets);
router.get('/timesheets/export', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.exportTimesheets);

module.exports = router;
