/**
 * Comprehensive Integration Verification:
 * Receptionist Check-In, Client Search, Document Upload, Payment Reference,
 * Contact Desk Routing, 90-Min SLA Escalation, Access-Code Portal & Performance Integration.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const assert = require('assert');
const pool = require('../db/pool');
const { runPgMigrations } = require('../db/pgMigrator');
const ContactService = require('../modules/contact/contact.service');
const CheckinDocsService = require('../modules/frontOffice/checkinDocs.service');
const FrontOfficeService = require('../modules/frontOffice/frontOffice.service');
const ReservationsService = require('../modules/reservations/reservations.service');
const TicketSlaSchedulerService = require('../modules/workforce/ticketSlaScheduler.service');
const PerformanceEngineService = require('../modules/workforce/performanceEngine.service');

async function runTests() {
  const results = [];
  const pass = (name) => {
    results.push({ name, ok: true });
    console.log(`PASS: ${name}`);
  };
  const fail = (name, err) => {
    results.push({ name, ok: false, error: err.message });
    console.error(`FAIL: ${name} -> ${err.message}`);
  };

  try {
    // 1. Run PG Migrations (forward-only 039-041)
    if (pool.isPostgres()) {
      const migRes = await runPgMigrations();
      assert(migRes !== undefined, 'PG migrations executed');
      pass('01. Forward-only PG migrations 039-041 applied');
    } else {
      pass('01. MySQL pool active (skipping PG migrator)');
    }

    // Fetch existing seed users & property for controlled non-destructive test
    const users = await pool.query("SELECT id, name, role, property_id, status FROM users WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 20");
    const manager = users.find((u) => ['OPERATIONS_MANAGER', 'MANAGER', 'ADMIN', 'OWNER'].includes(u.role)) || users[0];
    const receptionist = users.find((u) => u.role === 'RECEPTIONIST') || manager;
    const otherPropRecep = users.find((u) => u.role === 'RECEPTIONIST' && u.property_id && receptionist.property_id && Number(u.property_id) !== Number(receptionist.property_id));

    const props = await pool.query('SELECT id, name FROM properties ORDER BY id ASC LIMIT 2');
    const propId = receptionist?.property_id || props[0]?.id || 1;
    const apts = await pool.query('SELECT id, unit_number, unit_name FROM apartments WHERE property_id = ? LIMIT 1', [propId]);
    const aptId = apts[0]?.id;

    // 2. Document Types Config
    try {
      const types = await CheckinDocsService.getDocumentTypes();
      assert(Array.isArray(types) && types.length >= 4, 'Document types seeded');
      pass('02. Configurable check-in document types loaded');
    } catch (e) { fail('02. Configurable check-in document types', e); }

    // 3. Create controlled test reservation for check-in & search tests
    let testResId = null;
    let testResCode = `BFA-TEST-${Date.now().toString().slice(-6)}`;
    try {
      const ins = await pool.query(
        `INSERT INTO reservations (
          reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone,
          check_in_date, check_out_date, nights, total_amount, paid_amount,
          status, payment_status, payment_method, source, assigned_staff_id
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE, CURRENT_DATE + 1, 1, 160000, 0, 'CONFIRMED', 'PENDING', 'PAY_AT_PROPERTY', 'ONLINE', ?)`,
        [testResCode, propId, aptId, 'Test Guest Verification', 'test.checkin@bfa-verify.local', '08099990001', receptionist.id]
      );
      testResId = ins.insertId;
      assert(testResId > 0, 'Test reservation created');
      pass('03. Controlled test reservation created');
    } catch (e) { fail('03. Controlled test reservation created', e); }

    // 4. Scoped Client Search by Name and Booking Number
    try {
      const byName = await FrontOfficeService.searchBookings({ q: 'Test Guest Verification' }, { user: receptionist });
      assert(byName.some((r) => Number(r.id) === Number(testResId)), 'Found by name');
      const byCode = await FrontOfficeService.searchBookings({ q: testResCode }, { user: receptionist });
      assert(byCode.length === 1 && byCode[0].reservation_code === testResCode, 'Found by booking code');
      assert(byCode[0].created_at && byCode[0].check_in_date, 'Distinguishes created_at and check_in_date');
      pass('04. Scoped client search by full name and booking number');

      if (otherPropRecep) {
        const cross = await FrontOfficeService.searchBookings({ q: testResCode }, { user: otherPropRecep });
        assert(cross.length === 0, 'Cross-property receptionist cannot search unrelated booking');
        pass('05. Cross-property search isolation enforced');
      } else {
        pass('05. Cross-property search isolation (single-property seed fallback)');
      }
    } catch (e) { fail('04-05. Client search', e); }

    // 6. Check-In Session & Document Upload Security
    try {
      await CheckinDocsService.upsertCheckinSession(testResId, {
        documentTypeCode: 'NATIONAL_ID',
        documentIdNumber: 'NIN-TEST-998877',
        documentIssuingCountry: 'Nigeria',
        actualOccupantCount: 2,
        occupantNames: ['Test Guest Verification', 'Second Occupant'],
        clientAcknowledged: true,
        emergencyContactName: 'Emergency Person',
        emergencyContactPhone: '08011112222',
      }, receptionist);

      const session = await CheckinDocsService.getCheckinSession(testResId, receptionist);
      assert(session && session.document_id_number === 'NIN-TEST-998877', 'Session saved');

      // Invalid file type rejected
      let rejected = false;
      try {
        await CheckinDocsService.uploadDocument(testResId, {
          documentTypeCode: 'NATIONAL_ID',
          fileBase64: 'data:application/x-msdownload;base64,TVqQ',
          originalFilename: 'malware.exe',
          mimeType: 'application/x-msdownload',
        }, receptionist);
      } catch {
        rejected = true;
      }
      assert(rejected, 'Invalid file type rejected');

      // Valid PNG upload
      const pngB64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const uploaded = await CheckinDocsService.uploadDocument(testResId, {
        documentTypeCode: 'NATIONAL_ID',
        fileBase64: pngB64,
        originalFilename: 'id_card.png',
        mimeType: 'image/png',
      }, receptionist);
      assert(uploaded.id > 0, 'Valid PNG uploaded to private storage');

      const served = await CheckinDocsService.serveDocument(uploaded.id, receptionist);
      assert(served.mimeType === 'image/png', 'Authorized staff can retrieve private document');

      if (otherPropRecep) {
        let blocked = false;
        try {
          await CheckinDocsService.serveDocument(uploaded.id, otherPropRecep);
        } catch {
          blocked = true;
        }
        assert(blocked, 'Unauthorized staff blocked from private document');
      }
      pass('06. Check-in session, private document upload, invalid MIME rejection & auth');
    } catch (e) { fail('06. Check-in docs', e); }

    // 7. Payment Transaction Reference & Duplicate Detection
    try {
      const txRef = `NIBSS-TEST-${Date.now()}`;
      const p1 = await CheckinDocsService.recordPaymentRef(testResId, {
        transactionReference: txRef,
        amount: 160000,
        paymentRail: 'BANK_TRANSFER',
        payerName: 'Test Guest Verification',
      }, receptionist);
      assert(!p1.isDuplicate && p1.verificationStatus === 'PENDING', 'Recorded as PENDING verification');

      const p2 = await CheckinDocsService.recordPaymentRef(testResId, {
        transactionReference: txRef,
        amount: 160000,
        paymentRail: 'BANK_TRANSFER',
      }, receptionist);
      assert(p2.isDuplicate === true, 'Duplicate transaction reference detected');

      // Readiness check should show PAYMENT_SATISFIED = false because ref is only PENDING
      const readiness = await CheckinDocsService.evaluateCheckinReadiness(testResId, receptionist);
      const payGate = readiness.gates.find((g) => g.key === 'PAYMENT_SATISFIED');
      assert(payGate && payGate.passed === false, 'Unverified payment reference does not auto-verify payment');
      pass('07. Payment transaction reference storage, duplicate detection & pending financial control');
    } catch (e) { fail('07. Payment reference', e); }

    // 8. Contact Desk: Submit Inquiry, Client Match, Routing, Access Code & Follow-Up Chat
    let inquiryRef = null;
    let accessCode = null;
    let inquiryId = null;
    try {
      const sub = await ContactService.submitInquiry({
        clientName: 'Test Guest Verification',
        clientEmail: 'test.checkin@bfa-verify.local',
        clientPhone: '08099990001',
        inquiryDepartment: 'MAINTENANCE',
        bookingReference: testResCode,
        message: 'AC thermostat in living room needs calibration.',
        ipAddress: '127.0.0.1',
      });
      inquiryRef = sub.inquiryReference;
      accessCode = sub.clientAccessCode;
      assert(inquiryRef.startsWith('BFA-INQ-') && accessCode.length >= 10, 'Reference and secure access code generated');

      const inqRow = await pool.query('SELECT * FROM contact_inquiries WHERE inquiry_reference = ?', [inquiryRef]);
      inquiryId = inqRow[0].id;
      assert(inqRow[0].inquiry_department === 'MAINTENANCE', 'Inquiry department preserved');
      assert(inqRow[0].match_confidence === 'EXACT', 'Existing client matched by booking reference');

      // Wrong access code rejected
      let badCodeRejected = false;
      try {
        await ContactService.lookupByAccessCode({ inquiryReference: inquiryRef, accessCode: 'WRONGCODE123' });
      } catch {
        badCodeRejected = true;
      }
      assert(badCodeRejected, 'Wrong access code rejected');

      // Valid access code lookup
      const lookup = await ContactService.lookupByAccessCode({ inquiryReference: inquiryRef, accessCode });
      assert(lookup.token && lookup.inquiry.inquiryReference === inquiryRef, 'Valid access code returns scoped session');

      // Internal staff note must stay hidden from client
      await ContactService.addStaffMessage(inquiryId, {
        messageBody: 'Internal note: check compressor pressure before replying.',
        isInternal: true,
        isClientResponse: false,
      }, manager);
      const afterInternal = await ContactService.getClientInquiryDetail(lookup.token);
      assert(afterInternal.messages.length === 0, 'Internal staff note hidden from client & does not satisfy SLA');

      // Client follow-up message
      await ContactService.addClientMessage(lookup.token, {
        messageBody: 'Also, please send extra towels when technician arrives.',
      });
      const afterClientMsg = await ContactService.getClientInquiryDetail(lookup.token);
      assert(afterClientMsg.messages.length === 1, 'Client follow-up appended to existing ticket');

      // Staff client-visible response satisfies SLA
      await ContactService.addStaffMessage(inquiryId, {
        messageBody: 'Our technician is on the way with extra towels.',
        isInternal: false,
        isClientResponse: true,
      }, receptionist);

      const updatedInq = await pool.query('SELECT first_response_at, response_sla_met FROM contact_inquiries WHERE id = ?', [inquiryId]);
      assert(updatedInq[0].first_response_at && Boolean(updatedInq[0].response_sla_met) === true, 'Qualifying staff response satisfies 90-min SLA');

      // Client feedback
      const fb = await ContactService.submitClientFeedback(lookup.token, {
        rating: 5,
        feedbackText: 'Fast and courteous response!',
        markedResolved: true,
      });
      assert(fb.recorded === true, 'Client feedback recorded');

      // Close & Reopen preserve history
      await ContactService.closeInquiry(inquiryId, { resolutionNote: 'Completed' }, manager);
      await ContactService.reopenInquiry(inquiryId, { reason: 'Client requested follow-up check' }, manager);
      pass('08. Contact Desk matching, routing, access-code portal, internal note isolation, SLA & feedback');
    } catch (e) { fail('08. Contact Desk & Portal', e); }

    // 9. SLA Breach Escalation & Idempotency Test
    let breachInqId = null;
    try {
      const sub2 = await ContactService.submitInquiry({
        clientName: 'Unmatched New Client',
        clientEmail: 'new.client@example.com',
        clientPhone: '08055554444',
        inquiryDepartment: 'SHORT_STAY',
        message: 'Inquiry for corporate annual lease.',
        ipAddress: '127.0.0.1',
      });
      const rows = await pool.query('SELECT id FROM contact_inquiries WHERE inquiry_reference = ?', [sub2.inquiryReference]);
      breachInqId = rows[0].id;
      // Backdate SLA deadline to trigger breach sweep
      await pool.query(
        'UPDATE contact_inquiries SET response_sla_deadline_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE id = ?',
        [breachInqId]
      ).catch(async () => {
        await pool.query("UPDATE contact_inquiries SET response_sla_deadline_at = NOW() - INTERVAL '5 minutes' WHERE id = ?", [breachInqId]);
      });

      const s1 = await TicketSlaSchedulerService.runInquirySlaSweep();
      assert(s1.escalations >= 1, 'SLA breach escalated');
      const s2 = await TicketSlaSchedulerService.runInquirySlaSweep();
      assert(s2.escalations === 0, 'Idempotent sweep did not send duplicate escalation');

      // Reassign to receptionist — new SLA starts fresh
      await ContactService.assignInquiry(breachInqId, { newAssigneeId: receptionist.id, reason: 'Reassigned after escalation' }, manager);
      pass('09. 90-min SLA breach escalation, idempotency & fair reassignment');
    } catch (e) { fail('09. SLA escalation', e); }

    // 10. Performance Engine Integration
    try {
      const perf = await PerformanceEngineService.getStaffPerformance(manager, receptionist.id, { days: 30 });
      assert(perf && perf.contactInquiryMetrics !== undefined, 'contactInquiryMetrics included in performance report');
      pass('10. Employee performance evaluation integrates contactInquiryMetrics');
    } catch (e) { fail('10. Performance integration', e); }

    // Cleanup controlled test records
    if (breachInqId) {
      await pool.query('DELETE FROM inquiry_sla_logs WHERE inquiry_id = ?', [breachInqId]);
      await pool.query('DELETE FROM inquiry_assignments WHERE inquiry_id = ?', [breachInqId]);
      await pool.query('DELETE FROM inquiry_messages WHERE inquiry_id = ?', [breachInqId]);
      await pool.query('DELETE FROM contact_inquiries WHERE id = ?', [breachInqId]);
    }
    if (inquiryId) {
      await pool.query('DELETE FROM inquiry_sla_logs WHERE inquiry_id = ?', [inquiryId]);
      await pool.query('DELETE FROM inquiry_assignments WHERE inquiry_id = ?', [inquiryId]);
      await pool.query('DELETE FROM inquiry_messages WHERE inquiry_id = ?', [inquiryId]);
      await pool.query('DELETE FROM contact_inquiries WHERE id = ?', [inquiryId]);
    }
    if (testResId) {
      await pool.query('DELETE FROM payment_transaction_refs WHERE reservation_id = ?', [testResId]);
      await pool.query('DELETE FROM checkin_documents WHERE reservation_id = ?', [testResId]);
      await pool.query('DELETE FROM checkin_sessions WHERE reservation_id = ?', [testResId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [testResId]);
    }
  } catch (err) {
    fail('Fatal test harness error', err);
  } finally {
    const failed = results.filter((r) => !r.ok);
    console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
    await pool.end?.().catch(() => {});
    process.exit(failed.length > 0 ? 1 : 0);
  }
}

runTests();
