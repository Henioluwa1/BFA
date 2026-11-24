/**
 * Automated Verification Test Suite for Central Operations, Directives, Operations Memos & Chat Integration
 * Run via: node src/scripts/testCentralOperationsAndMemos.cjs
 */

const pool = require('../db/pool');
const CentralOperationsService = require('../modules/workforce/centralOperations.service');
const ChatService = require('../modules/chat/chat.service');

async function runTests() {
  console.log('================================================================');
  console.log('BFA CENTRAL OPERATIONS & MEMOS TEST SUITE: Starting Verification');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ [PASS]: ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL]: ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Fetch test users across key roles
    const [adminUser] = await pool.query("SELECT * FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN') AND status = 'ACTIVE' LIMIT 1;");
    const [ownerUser] = await pool.query("SELECT * FROM users WHERE role = 'OWNER' AND status = 'ACTIVE' LIMIT 1;");
    const [managerUser] = await pool.query("SELECT * FROM users WHERE role IN ('MANAGER', 'OPERATIONS_MANAGER') AND status = 'ACTIVE' LIMIT 1;");
    const [staffUser] = await pool.query("SELECT * FROM users WHERE role = 'STAFF' AND status = 'ACTIVE' LIMIT 1;");
    const [receptionistUser] = await pool.query("SELECT * FROM users WHERE role = 'RECEPTIONIST' AND status = 'ACTIVE' LIMIT 1;");
    const [property] = await pool.query("SELECT * FROM properties LIMIT 1;");

    console.log(`[INFO] Loaded test personas: Admin=${adminUser?.email}, Owner=${ownerUser?.email}, Manager=${managerUser?.email}, Staff=${staffUser?.email}, Property=${property?.name}`);

    // TEST 1: Routing Matrix — Owner attempting direct general staff broadcast must FAIL
    try {
      await CentralOperationsService.createOperation(ownerUser, {
        title: 'Unauthorized Owner Staff Broadcast',
        subject: 'General Cleaning Order',
        purpose: 'Direct staff management',
        operational_instructions: 'Clean all hallways now',
        target_audience_type: 'PROPERTY_STAFF',
        property_id: property.id,
      });
      assert(false, 'Routing Matrix: Owner direct staff broadcast should be blocked');
    } catch (err) {
      assert(err.message.includes('Routing Matrix Violation'), 'Routing Matrix: Owner direct staff broadcast correctly blocked');
    }

    // TEST 2: Routing Matrix — Owner directive to Manager must SUCCEED
    let ownerOp;
    try {
      ownerOp = await CentralOperationsService.createOperation(ownerUser, {
        title: 'Q4 Operational Revenue & Occupancy Directives',
        category: 'MANAGEMENT_COMMUNICATION',
        priority: 'IMPORTANT',
        subject: 'Quarterly Executive Directives for Operational Managers',
        purpose: 'Ensure occupancy targets of 85% are maintained across prime locations.',
        operational_instructions: 'Review property audit schedules, verify all preventative maintenance is logged, and enforce shift punctuality.',
        target_audience_type: 'SPECIFIC_USER',
        recipient_user_ids: [managerUser.id],
        property_id: property.id,
      });
      assert(ownerOp && ownerOp.operation_code.startsWith('OPS-'), `Owner Management Directive issued successfully (${ownerOp.operation_code})`);
      assert(ownerOp.memo_reference.startsWith('MEMO-'), `Operations Memo generated (${ownerOp.memo_reference})`);
      assert(ownerOp.recipients.length === 1 && ownerOp.recipients[0].user_id === managerUser.id, 'Recipient correctly mapped to Manager');
    } catch (err) {
      assert(false, `Owner Management Directive failed: ${err.message}`);
    }

    // TEST 3: Strict Owner-Only Group Rule & Owner Property Directive
    let adminOp;
    try {
      // 3a. Admin attempting group operation must be blocked
      try {
        await CentralOperationsService.createOperation(adminUser, {
          title: 'Unauthorized Admin Group Broadcast',
          target_audience_type: 'PROPERTY_ALL',
          property_id: property.id,
          subject: 'Test',
          purpose: 'Test',
          operational_instructions: 'Test',
        });
        assert(false, 'Non-Owner group operation should be blocked');
      } catch (err) {
        assert(err.message.includes('Only the Owner role is authorized'), 'Admin group operation correctly blocked by governance rule');
      }

      // 3b. Owner issues Company-Wide Property Directive
      adminOp = await CentralOperationsService.createOperation(ownerUser, {
        title: 'Festive Season Front Desk & Security Operations Standard',
        category: 'FRONT_OFFICE_RECEPTION',
        priority: 'URGENT',
        subject: 'Mandatory Customer Identification and Log Protocol',
        purpose: 'Strengthen front-desk compliance and guest verification protocols during peak holiday influx.',
        operational_instructions: '1. Request government ID for all check-ins.\n2. Log visitor vehicle plates.\n3. Escort unregistered visitors to lounge.',
        expected_outcome: 'Zero security breaches and 100% guest log compliance.',
        responsibility_definition: 'Front Office Receptionists on duty.',
        reporting_requirements: 'Daily digital shift handovers before 21:00.',
        target_audience_type: 'PROPERTY_ALL',
        property_id: property.id,
        deadline_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      });
      assert(adminOp && adminOp.operation_code.startsWith('OPS-'), `Owner Property Directive issued (${adminOp.operation_code})`);
      assert(adminOp.recipients.length > 0, `Multi-recipient audience populated (${adminOp.recipients.length} recipients)`);
      assert(adminOp.chat_thread_id !== null, `Linked Staff Chat channel assigned (Thread #${adminOp.chat_thread_id})`);
    } catch (err) {
      assert(false, `Owner Property Operation creation failed: ${err.message}`);
    }

    // TEST 4: Manager Operations Initiation (Property Scoped)
    let managerOp;
    try {
      managerOp = await CentralOperationsService.createOperation(managerUser, {
        title: 'Deep Sanitization of HVAC and Electrical Distribution',
        category: 'MAINTENANCE_INSPECTION',
        priority: 'CRITICAL',
        subject: 'Scheduled HVAC Maintenance and Power Circuit Isolation',
        purpose: 'Prevent overheating of central inverter modules and replace air filters.',
        operational_instructions: 'Isolate circuit breaker A3, sanitize filter panels with antimicrobial agent, and record multimeter readings.',
        target_audience_type: 'SPECIFIC_USER',
        recipient_user_ids: [staffUser.id],
        property_id: property.id,
      });
      assert(managerOp && managerOp.priority === 'CRITICAL', `Manager Critical Operation created (${managerOp.operation_code})`);
    } catch (err) {
      assert(false, `Manager Operation creation failed: ${err.message}`);
    }

    // TEST 5: Recipient Acknowledges Receipt
    try {
      const ackOp = await CentralOperationsService.acknowledgeOperation(
        managerUser,
        ownerOp.id,
        'Understood and noted. Will implement quarterly review immediately.'
      );
      assert(ackOp.status === 'ACKNOWLEDGED', `Operation status transitioned to ACKNOWLEDGED after recipient sign-off`);
      const targetRecipient = ackOp.recipients.find(r => r.user_id === managerUser.id);
      assert(targetRecipient && targetRecipient.acknowledged_at !== null, 'Recipient acknowledgement timestamp recorded');
    } catch (err) {
      assert(false, `Acknowledge operation failed: ${err.message}`);
    }

    // TEST 6: Clarification Request and Response Workflow
    try {
      const clarOp = await CentralOperationsService.requestClarification(staffUser, managerOp.id, {
        questionText: 'Do we need to notify guests on Floor 3 before isolating circuit breaker A3?',
      });
      assert(clarOp.status === 'AWAITING_CLARIFICATION', 'Operation status transitioned to AWAITING_CLARIFICATION');

      const respOp = await CentralOperationsService.respondClarification(managerUser, managerOp.id, {
        responseText: 'Yes, distribute guest notices at least 2 hours before breaker isolation.',
      });
      assert(respOp.status === 'IN_PROGRESS', 'Operation status transitioned to IN_PROGRESS upon manager response');
    } catch (err) {
      assert(false, `Clarification workflow failed: ${err.message}`);
    }

    // TEST 7: Blocker Reporting Workflow
    try {
      const blockOp = await CentralOperationsService.reportBlocker(staffUser, managerOp.id, {
        category: 'MATERIALS',
        details: 'Antimicrobial filter cleaning spray is out of stock in maintenance store.',
      });
      assert(blockOp.status === 'BLOCKED', 'Operation status updated to BLOCKED upon blocker report');
    } catch (err) {
      assert(false, `Blocker reporting failed: ${err.message}`);
    }

    // TEST 8: Progress Logging
    try {
      const progOp = await CentralOperationsService.updateProgress(staffUser, managerOp.id, {
        progressNotes: 'New cleaning spray received from central depot. Inverter isolation 50% complete.',
        status: 'IN_PROGRESS',
      });
      assert(progOp.status === 'IN_PROGRESS', 'Operation progress successfully updated');
    } catch (err) {
      assert(false, `Progress update failed: ${err.message}`);
    }

    // TEST 9: Spawning Linked Operational Task
    try {
      const task = await CentralOperationsService.createLinkedTask(managerUser, managerOp.id, {
        assigned_to_id: staffUser.id,
        title: 'Filter Replacement for Unit 102 & Unit 104',
        description: 'Complete replacement of secondary particulate filters.',
        task_category: 'MAINTENANCE',
      });
      assert(task && task.central_operation_id === managerOp.id, `Task linked to operation (${task.task_code})`);
    } catch (err) {
      assert(false, `Linked task creation failed: ${err.message}`);
    }

    // TEST 10: Versioned Operation Amendment (Generates Memo v2)
    try {
      const amendedOp = await CentralOperationsService.amendOperation(managerUser, managerOp.id, {
        amendment_reason: 'Updated scope to include Unit 201 circuit breaker inspection.',
        operational_instructions: 'Isolate circuit breaker A3, sanitize filter panels, and inspect Unit 201 sub-panel.',
      });
      assert(amendedOp.memo_version === 2, `Operations Memo successfully versioned to v${amendedOp.memo_version}`);
      assert(amendedOp.memos.length >= 2, 'Memo history preserves both v1 and v2 records');
    } catch (err) {
      assert(false, `Operation amendment failed: ${err.message}`);
    }

    // TEST 11: Completion Submission and Managerial Review
    try {
      const submitOp = await CentralOperationsService.submitCompletion(staffUser, managerOp.id, {
        completionNotes: 'All HVAC panels sanitized, Unit 201 sub-panel verified, inverter operating within normal thermal thresholds.',
      });
      assert(submitOp.status === 'SUBMITTED_FOR_REVIEW' || submitOp.status === 'AWAITING_REVIEW', 'Operation status transitioned to SUBMITTED_FOR_REVIEW');

      const reviewedOp = await CentralOperationsService.reviewOperation(managerUser, managerOp.id, {
        decision: 'APPROVED',
        reviewNotes: 'Verified on-site. Work done to executive standard.',
      });
      assert(reviewedOp.status === 'COMPLETED', 'Operation officially marked COMPLETED by manager');
    } catch (err) {
      assert(false, `Completion review failed: ${err.message}`);
    }

    // TEST 12: Cancellation Workflow
    try {
      const cancelOp = await CentralOperationsService.cancelOperation(adminUser, adminOp.id, {
        cancellation_reason: 'Protocol superseded by new corporate group directives.',
      });
      assert(cancelOp.status === 'CANCELLED', 'Operation successfully CANCELLED');
    } catch (err) {
      assert(false, `Cancellation failed: ${err.message}`);
    }

    // TEST 13: Operations PDF Retrieval
    try {
      const pdfData = await CentralOperationsService.getMemoPdfBuffer(managerUser, ownerOp.latest_memo_id);
      assert(pdfData && pdfData.buffer && pdfData.buffer.length > 500, `PDF generated and retrieved from storage (${pdfData.buffer.length} bytes)`);
    } catch (err) {
      assert(false, `Memo PDF generation/retrieval failed: ${err.message}`);
    }

    // TEST 14: Central Operations 5 Views Retrieval
    try {
      const initiatedByMe = await CentralOperationsService.listOperations(ownerUser, { view: 'initiatedByMe' });
      assert(Array.isArray(initiatedByMe) && initiatedByMe.length > 0, `View 'initiatedByMe' returns operations (${initiatedByMe.length} found)`);

      const assignedToMe = await CentralOperationsService.listOperations(managerUser, { view: 'assignedToMe' });
      assert(Array.isArray(assignedToMe) && assignedToMe.length > 0, `View 'assignedToMe' returns operations (${assignedToMe.length} found)`);

      const supervising = await CentralOperationsService.listOperations(adminUser, { view: 'supervising' });
      assert(Array.isArray(supervising) && supervising.length > 0, `View 'supervising' returns operations (${supervising.length} found)`);

      const archived = await CentralOperationsService.listOperations(adminUser, { view: 'archived' });
      assert(Array.isArray(archived) && archived.length > 0, `View 'archived' returns completed/cancelled operations (${archived.length} found)`);
    } catch (err) {
      assert(false, `Operations view query failed: ${err.message}`);
    }

    // TEST 15: Chat Context Preview Resolver for OPERATION and MEMO
    try {
      const opPreview = await ChatService.getContextPreview(adminUser, { type: 'OPERATION', id: ownerOp.id });
      assert(opPreview && opPreview.entityType === 'OPERATION' && opPreview.code === ownerOp.operation_code, 'Chat context preview resolves OPERATION correctly');

      const memoPreview = await ChatService.getContextPreview(adminUser, { type: 'MEMO', id: ownerOp.latest_memo_id });
      assert(memoPreview && memoPreview.entityType === 'MEMO' && memoPreview.code === ownerOp.memo_reference, 'Chat context preview resolves MEMO correctly');
    } catch (err) {
      assert(false, `Chat context preview resolver failed: ${err.message}`);
    }

  } catch (globalErr) {
    console.error('Fatal test error:', globalErr);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`TEST SUITE COMPLETED: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
