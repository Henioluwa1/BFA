/**
 * Automated Verification Script for Workforce Operations, Disciplinary Management,
 * Central Reporting Engine, and Priority Chat Communications.
 */

const pool = require('../db/pool');
const RosterAssignmentService = require('../modules/workforce/rosterAssignment.service');
const TaskOperationsService = require('../modules/workforce/taskOperations.service');
const DisciplinaryAndPipService = require('../modules/workforce/disciplinaryAndPip.service');
const DirectivesService = require('../modules/workforce/directives.service');
const StaffReportsService = require('../modules/workforce/staffReports.service');
const PerformanceEngineService = require('../modules/workforce/performanceEngine.service');
const CentralReportingService = require('../modules/reports/centralReporting.service');
const ChatService = require('../modules/chat/chat.service');

async function runTests() {
  console.log('================================================================');
  console.log('BFA WORKFORCE OPERATIONS, ROSTER, REPORTING & CHAT TEST SUITE');
  console.log('================================================================');

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      testPassed++;
    } else {
      console.error(`[FAIL] ${message}`);
      testFailed++;
    }
  }

  try {
    // 1. Identify test users
    const users = await pool.query('SELECT id, name, email, role, property_id FROM users;');
    const adminUser = users.find(u => u.role === 'ADMIN');
    const managerUser = users.find(u => u.role === 'OPERATIONS_MANAGER' || u.role === 'MANAGER');
    const staffUser = users.find(u => u.role === 'STAFF');
    const receptionistUser = users.find(u => u.role === 'RECEPTIONIST');
    const ownerUser = users.find(u => u.role === 'OWNER');

    const props = await pool.query('SELECT id, name FROM properties LIMIT 2;');
    const property = props[0];

    assert(adminUser && managerUser && staffUser && ownerUser && property, 'Core system test users and properties exist');

    // Clean up any previous test runs for staffUser
    await pool.query('DELETE FROM task_blockers WHERE reported_by_id = $1;', [staffUser.id]);
    await pool.query('DELETE FROM operational_tasks WHERE assigned_to_id = $1;', [staffUser.id]);
    await pool.query('DELETE FROM disciplinary_queries WHERE staff_user_id = $1;', [staffUser.id]);
    await pool.query('DELETE FROM performance_improvement_plans WHERE staff_user_id = $1;', [staffUser.id]);
    await pool.query('DELETE FROM staff_operational_reports WHERE staff_user_id = $1;', [staffUser.id]);
    await pool.query('DELETE FROM roster_property_assignments WHERE staff_user_id = $1 OR staff_user_id = $2;', [staffUser.id, receptionistUser.id]);

    console.log('\n--- 1. Testing Roster Property Assignments ---');
    const asgData = {
      staff_user_id: staffUser.id,
      property_id: property.id,
      classification: 'GENERAL_STAFF',
      duty_category: 'Apartment Readiness & Sanitization',
      start_date: '2026-11-25',
      end_date: '2026-11-30',
      start_time: '08:00:00',
      end_time: '17:00:00',
      priority: 'IMPORTANT',
      instructions: 'Complete full inspection and sanitization of vacant units prior to VIP check-ins.',
    };

    const asg = await RosterAssignmentService.createAssignment(managerUser, asgData);
    assert(asg && asg.assignment_code.startsWith('ASG-'), `Assignment created with reference: ${asg.assignment_code}`);
    assert(asg.status === 'SENT', `Initial status is SENT`);

    // Staff views assignment
    const viewedAsg = await RosterAssignmentService.getAssignmentById(staffUser, asg.id);
    assert(viewedAsg.status === 'VIEWED', `Status transitioned to VIEWED upon staff open`);

    // Staff accepts assignment
    const acceptedAsg = await RosterAssignmentService.updateAssignmentStatus(staffUser, asg.id, 'ACCEPTED');
    assert(acceptedAsg.status === 'ACCEPTED', `Staff successfully accepted assignment`);

    // PDF notice generation
    const pdfBuf = await RosterAssignmentService.generateAssignmentNoticePdf(staffUser, asg.id);
    assert(Buffer.isBuffer(pdfBuf) && pdfBuf.length > 500, `Assignment Notice PDF generated (${pdfBuf.length} bytes)`);

    // Admin Emergency Direct Override
    const overrideData = {
      staff_user_id: receptionistUser.id,
      property_id: property.id,
      classification: 'RECEPTIONIST',
      duty_category: 'Front Desk Coverage',
      start_date: '2026-12-01',
      end_date: '2026-12-05',
      priority: 'URGENT',
      instructions: 'Emergency front office desk coverage due to high occupancy.',
      is_admin_override: true,
      override_reason: 'Emergency company-wide front desk reinforcement authorized by Admin.',
    };
    const overrideAsg = await RosterAssignmentService.createAssignment(adminUser, overrideData);
    assert(overrideAsg && overrideAsg.is_admin_override, 'Admin emergency override assignment created');

    console.log('\n--- 2. Testing Operational Tasks & Blockers ---');
    const taskData = {
      property_id: property.id,
      assigned_to_id: staffUser.id,
      assignment_id: asg.id,
      title: 'Inspect HVAC and Electrical fittings in Suite 402',
      description: 'Check coolant levels, electrical sockets, and replace air filter.',
      expected_outcome: 'HVAC cooling efficiently below 20C with zero electrical faults.',
      task_category: 'MAINTENANCE',
      priority: 'IMPORTANT',
      due_date: new Date(Date.now() + 86400000).toISOString(),
    };

    const task = await TaskOperationsService.createTask(managerUser, taskData);
    assert(task && task.task_code.startsWith('TSK-'), `Operational task created with code: ${task.task_code}`);

    // Staff starts task
    await TaskOperationsService.updateTaskProgress(staffUser, task.id, { status: 'IN_PROGRESS' });
    const inProgTask = await TaskOperationsService.getTaskById(staffUser, task.id);
    assert(inProgTask.status === 'IN_PROGRESS', 'Task marked IN_PROGRESS by staff');

    // Staff reports a blocker
    const blocker = await TaskOperationsService.reportBlocker(staffUser, task.id, {
      category: 'MATERIALS',
      description: 'Replacement 24-inch air filters are out of stock in the facility store.',
    });
    assert(blocker && blocker.status === 'OPEN', 'Blocker reported successfully');

    const blockedTask = await TaskOperationsService.getTaskById(staffUser, task.id);
    assert(blockedTask.status === 'BLOCKED', 'Task automatically transitioned to BLOCKED');

    // Manager resolves blocker
    await TaskOperationsService.resolveBlocker(managerUser, blocker.id, {
      resolution_notes: 'Procured 10 replacement filters from local vendor; delivered to store.',
    });
    const resumedTask = await TaskOperationsService.getTaskById(staffUser, task.id);
    assert(resumedTask.status === 'IN_PROGRESS', 'Task resumed to IN_PROGRESS upon blocker resolution');

    // Staff completes task
    await TaskOperationsService.updateTaskProgress(staffUser, task.id, {
      status: 'COMPLETED',
      materials_used: '1x 24-inch filter, 200ml R410A coolant',
      completion_notes: 'Replaced filter and topped coolant. System test passed.',
    });

    // Manager reviews task
    const reviewedTask = await TaskOperationsService.reviewTask(managerUser, task.id, {
      review_status: 'ACCEPTED',
      review_notes: 'Work verified and approved.',
    });
    assert(reviewedTask.status === 'COMPLETED' && reviewedTask.review_status === 'ACCEPTED', 'Task review finalized');

    console.log('\n--- 3. Testing Disciplinary Management & PIPs ---');
    const queryData = {
      staff_user_id: staffUser.id,
      property_id: property.id,
      linked_task_id: task.id,
      subject: 'Clarification regarding delay on morning maintenance log',
      allegation_details: 'Routine daily inspection check-in was logged 45 minutes past standard schedule.',
      evidence_summary: 'Attendance audit records and digital kiosk punch mismatch.',
      response_deadline_at: new Date(Date.now() + 172800000).toISOString(),
    };

    const query = await DisciplinaryAndPipService.issueQuery(managerUser, queryData);
    assert(query && query.query_code.startsWith('QRY-'), `Disciplinary query issued: ${query.query_code}`);

    // Staff responds to query
    const respondedQuery = await DisciplinaryAndPipService.submitQueryResponse(staffUser, query.id, {
      staff_response: 'Delay occurred due to an emergency guest assistance call at Building B front gate.',
    });
    assert(respondedQuery.status === 'RESPONDED', 'Staff response recorded');

    // Manager concludes query with guidance
    const concludedQuery = await DisciplinaryAndPipService.concludeQuery(managerUser, query.id, {
      outcome_decision: 'COACHING_GUIDANCE',
      outcome_notes: 'Explanation noted. Advised to notify supervisor immediately upon unexpected delays.',
      manager_assessment: 'Valid justification supported by front gate guest log.',
    });
    assert(concludedQuery.outcome_decision === 'COACHING_GUIDANCE', 'Query concluded with coaching guidance');

    // VERIFY OWNER RESTRICTION (Owner CANNOT access disciplinary queries)
    let ownerBlocked = false;
    try {
      await DisciplinaryAndPipService.listQueries(ownerUser);
    } catch (err) {
      if (err.statusCode === 403 || err.message.includes('Owner')) {
        ownerBlocked = true;
      }
    }
    assert(ownerBlocked, 'Owner is strictly barred from individual employee disciplinary records (Fail-closed 403)');

    // Create PIP / Positive Recognition
    const pip = await DisciplinaryAndPipService.createPip(managerUser, {
      staff_user_id: staffUser.id,
      property_id: property.id,
      concerns_summary: 'Target turnaround for apartment readiness',
      improvement_objectives: 'Maintain average readiness turnaround under 2 hours',
      coaching_training_plan: 'Weekly 1-on-1 operational coaching with Senior Facilities Manager',
      start_date: '2026-11-21',
      review_date: '2026-12-21',
      is_positive_recognition: false,
    });
    assert(pip && pip.pip_code.startsWith('PIP-'), `PIP established: ${pip.pip_code}`);

    console.log('\n--- 4. Testing Admin Directives & Manager Plans ---');
    const directive = await DirectivesService.createDirective(adminUser, {
      title: 'Company-Wide Holiday Readiness & Preventive Maintenance',
      description: 'Comprehensive audit of all electrical, plumbing, and backup generators across all units.',
      target_outcome: 'Zero downtime during high-occupancy festive season.',
      priority: 'IMPORTANT',
      property_id: property.id,
      assigned_manager_id: managerUser.id,
      deadline_date: '2026-12-15',
    });
    assert(directive && directive.directive_code.startsWith('DIR-'), `Directive created: ${directive.directive_code}`);

    // Manager submits plan
    const updatedDir = await DirectivesService.submitExecutionPlan(managerUser, directive.id, {
      manager_execution_plan: 'Schedule 2 technicians per building across 5 days with daily checklist sign-offs.',
    });
    assert(updatedDir.status === 'IN_PROGRESS', 'Manager submitted plan; directive marked IN_PROGRESS');

    console.log('\n--- 5. Testing Staff Operational Reports ---');
    const staffRep = await StaffReportsService.submitReport(staffUser, {
      property_id: property.id,
      assignment_id: asg.id,
      task_id: task.id,
      report_type: 'DAILY_ACTIVITY',
      summary: 'Completed HVAC filter replacements in 4 units.',
      details: 'All 4 units tested and operating at nominal power consumption. No guest complaints.',
      materials_used: '4x air filters, electrical tape',
    });
    assert(staffRep && staffRep.report_code.startsWith('SREP-'), `Staff report submitted: ${staffRep.report_code}`);

    // Manager reviews staff report
    const reviewedRep = await StaffReportsService.reviewStaffReport(managerUser, staffRep.id, {
      status: 'FINALISED',
      manager_feedback: 'Excellent work and thorough documentation.',
    });
    assert(reviewedRep.status === 'FINALISED', 'Staff report reviewed and finalised by Manager');

    console.log('\n--- 6. Testing Central Reporting Engine ---');
    const dailyReport = await CentralReportingService.getDailyReport(adminUser);
    assert(dailyReport && dailyReport.summary, 'Central Reporting Engine generated daily report');
    assert(dailyReport.timezone.includes('Africa/Lagos'), 'Reporting engine uses Africa/Lagos timezone');

    // Finalize report snapshot in ledger
    const snapshot = await CentralReportingService.finalizeReportSnapshot(adminUser, {
      reporting_period_type: 'DAILY',
      reporting_date: '2026-11-21',
      role_target: 'ADMIN',
      title: 'Consolidated Daily Operations Report',
      content_snapshot: dailyReport,
    });
    assert(snapshot && snapshot.report_reference.startsWith('REP-'), `Snapshot finalized in ledger: ${snapshot.report_reference}`);

    // Multi-page PDF generation
    const reportPdf = await CentralReportingService.generateReportPdf(dailyReport, 'CONSOLIDATED DAILY OPERATIONS REPORT');
    assert(Buffer.isBuffer(reportPdf) && reportPdf.length > 500, `Multi-page Report PDF generated (${reportPdf.length} bytes)`);

    console.log('\n--- 7. Testing Performance Analytics Engine ---');
    const staffPerf = await PerformanceEngineService.getStaffPerformance(staffUser, staffUser.id);
    assert(staffPerf && staffPerf.overallScore !== undefined, `Staff performance score computed: ${staffPerf.overallScore}/100`);

    const workforceOverview = await PerformanceEngineService.getWorkforceOverview(managerUser, { property_id: property.id });
    assert(workforceOverview && workforceOverview.totalStaffAssessed >= 0, 'Workforce overview computed');

    console.log('\n--- 8. Testing Priority Chat & Circulars ---');
    const pendingNotices = await ChatService.getPendingImportantMessages(staffUser);
    assert(Array.isArray(pendingNotices), `Pending important notices retrieved: ${pendingNotices.length}`);

    // Owner broadcasts an internal circular
    const circular = await ChatService.broadcastOwnerCircular(ownerUser, {
      title: 'Executive End-of-Year Operational Briefing',
      content: 'All staff are commended for maintaining 98% apartment readiness. Please review holiday shift schedules.',
      priority: 'IMPORTANT',
    });
    assert(circular && circular.threadId, `Owner circular broadcast created (recipients: ${circular.recipientsCount})`);

    console.log('\n================================================================');
    console.log(`TEST SUITE RESULTS: ${testPassed} PASSED, ${testFailed} FAILED`);
    console.log('================================================================');

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal Test Exception:', err);
    process.exit(1);
  } finally {
    await pool.closePool();
  }
}

runTests();
