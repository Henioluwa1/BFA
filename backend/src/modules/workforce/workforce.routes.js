const express = require('express');
const router = express.Router();
const WorkforceController = require('./workforce.controller');
const { requireAuth, requireRoles } = require('../../core/middleware/authContext');

const MANAGEMENT_ROLES = ['ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'OWNER'];
const ALL_STAFF_ROLES = ['ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'OWNER', 'STAFF', 'RECEPTIONIST'];

// ─── Shift Templates ───────────────────────────────────────────────────
router.get('/templates', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.listTemplates);
router.post('/templates', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.createTemplate);

// ─── Rosters & Planning ────────────────────────────────────────────────
router.get('/rosters', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.listRosters);
router.post('/rosters', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.createRoster);
router.get('/rosters/:id', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.getRosterById);
router.post('/rosters/:id/publish', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.publishRoster);

// ─── Shifts ────────────────────────────────────────────────────────────
router.get('/shifts', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listShifts);
router.post('/shifts', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.scheduleShift);
router.put('/shifts/:id', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.updateShift);
router.delete('/shifts/:id', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.deleteShift);

// ─── Employee Availability ─────────────────────────────────────────────
router.post('/availability', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.submitAvailability);
router.get('/availability', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.getAvailability);

// ─── Shift Swaps ───────────────────────────────────────────────────────
router.post('/swaps', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.requestSwap);
router.get('/swaps', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listSwaps);
router.patch('/swaps/:id/review', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.reviewSwap);

// ─── Attendance & Time Tracking (ALL Methods) ──────────────────────────
// 1. Mobile & Web Authenticated Clock-In / Clock-Out / Breaks
router.post('/attendance/clock-in', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.clockIn);
router.post('/attendance/clock-out', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.clockOut);
router.post('/attendance/break-start', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.startBreak);
router.post('/attendance/break-end', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.endBreak);
router.get('/attendance', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listAttendance);

// 2. Property Kiosk Terminal Punch (Authenticated by Kiosk Key & Employee PIN/Identifier)
router.post('/attendance/kiosk-clock', WorkforceController.kioskClock);

// 3. Manager-Assisted Attendance & Exception Verification
router.post('/attendance/manual', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.recordManualAttendance);
router.patch('/attendance/:id/verify', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.verifyAttendance);

// 4. Attendance Policies
router.get('/attendance/policies/:propertyId?', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.getPolicy);
router.put('/attendance/policies/:propertyId?', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.updatePolicy);

// 5. Property Kiosk Terminal Administration
router.post('/kiosks', requireAuth, requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), WorkforceController.registerKiosk);
router.get('/kiosks', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.listKiosks);
router.patch('/kiosks/:id/status', requireAuth, requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), WorkforceController.updateKioskStatus);
router.post('/kiosks/:id/rotate-secret', requireAuth, requireRoles('ADMIN', 'OWNER', 'SUPER_ADMIN'), WorkforceController.rotateKioskSecret);

// ─── Attendance Corrections (Maker-Checker Workflow) ───────────────────
router.post('/attendance/corrections', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.requestAttendanceCorrection);
router.get('/attendance/corrections', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listAttendanceCorrections);
router.patch('/attendance/corrections/:id/review', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.reviewAttendanceCorrection);

// ─── Delegated Leave Management (Stage 1 Manager / Stage 2 Admin) ───────
router.get('/leave/categories', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listLeaveCategories);
router.get('/leave/balances/:employeeId?', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.getLeaveBalances);
router.post('/leave/requests', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.submitLeave);
router.get('/leave/requests', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.listLeaveRequests);
router.patch('/leave/requests/:id/review', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.reviewLeave);
router.patch('/leave/requests/:id/escalate', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.escalateLeave);

// ─── Payroll-Ready Timesheets ──────────────────────────────────────────
router.get('/timesheets', requireAuth, requireRoles(...ALL_STAFF_ROLES), WorkforceController.getTimesheets);
router.get('/timesheets/export', requireAuth, requireRoles(...MANAGEMENT_ROLES), WorkforceController.exportTimesheets);

module.exports = router;
