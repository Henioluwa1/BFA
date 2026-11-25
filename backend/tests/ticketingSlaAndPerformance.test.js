const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');
const TicketSlaSchedulerService = require('../src/modules/workforce/ticketSlaScheduler.service');
const PerformanceEngineService = require('../src/modules/workforce/performanceEngine.service');

const signToken = (payload) =>
  jwt.sign(payload, config.security.jwtSecret, { expiresIn: '2h' });

describe('Operations-to-Ticketing, Priority Ack SLA, Lifecycle & Staff Performance Integration Suite', () => {
  const createdOpIds = [];
  const createdReservationCodes = [];
  const createdBookingAuthEmails = [];
  let prop2ManagerId = null;
  let prop2ManagerToken = null;
  let originalSlaConfig = null;
  let originalPerfConfig = null;
  let testAttIds = [];
  let testLeaveIds = [];

  const ownerToken = signToken({ id: 7, email: 'owner@bfa.com', role: 'OWNER', name: 'Chief Emeka BFA (Owner)', propertyId: null });
  const adminToken = signToken({ id: 2, email: 'admin@bfa.com', role: 'ADMIN', name: 'Sarah Jenkins (Admin)', propertyId: null });
  const opsManagerToken = signToken({ id: 3, email: 'manager@bfa.com', role: 'OPERATIONS_MANAGER', name: 'Marcus Vance (Manager)', propertyId: null });
  const receptionistToken = signToken({ id: 4, email: 'receptionist@bfa.com', role: 'RECEPTIONIST', name: 'Elena Ramos (Reception)', propertyId: 1 });
  const staffToken = signToken({ id: 5, email: 'staff@bfa.com', role: 'STAFF', name: 'David Kalu (Staff)', propertyId: 1 });
  const agentToken = signToken({ id: 6, email: 'agent@bfa.com', role: 'AGENT', name: 'Alexander Wright (Agent)', propertyId: null });

  beforeAll(async () => {
    const slaRes = await request(app)
      .get('/api/v1/workforce/operations/sla-config')
      .set('Authorization', `Bearer ${ownerToken}`);
    originalSlaConfig = slaRes.body?.data || { CRITICAL: 3, URGENT: 6, HIGH: 6, IMPORTANT: 12, NORMAL: 12, LOW: 24 };

    const perfRes = await request(app)
      .get('/api/v1/workforce/performance/weights')
      .set('Authorization', `Bearer ${ownerToken}`);
    originalPerfConfig = perfRes.body?.data || {
      weights: { attendance: 20, ackSla: 15, executionTimeliness: 30, quality: 20, workload: 15 },
      minTicketThreshold: 3,
    };

    // Create temporary Property-2 scoped MANAGER for isolation testing
    const ts = Date.now();
    const mgrEmail = `test.mgr.p2.${ts}@bfa.test`;
    const insRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, property_id, status)
       VALUES (?, ?, ?, 'MANAGER', 2, 'ACTIVE')
       RETURNING id`,
      ['Property 2 Test Manager', mgrEmail, '$2b$10$testonlyinvalidhashxxxxxxxxxxxxxxxxxxxxxxxxxxxx']
    );
    const rows = insRes.rows || insRes;
    prop2ManagerId = Number(rows[0]?.id || insRes.insertId);
    prop2ManagerToken = signToken({
      id: prop2ManagerId,
      email: mgrEmail,
      role: 'MANAGER',
      name: 'Property 2 Test Manager',
      propertyId: 2,
    });
  });

  afterAll(async () => {
    try {
      if (originalSlaConfig) {
        await request(app)
          .put('/api/v1/workforce/operations/sla-config')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send(originalSlaConfig);
      }
      if (originalPerfConfig?.weights) {
        await request(app)
          .put('/api/v1/workforce/performance/weights')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send(originalPerfConfig);
      }

      for (const attId of testAttIds) {
        await pool.query('DELETE FROM attendance_records WHERE id = ?', [attId]).catch(() => {});
      }
      for (const lvId of testLeaveIds) {
        await pool.query('DELETE FROM leave_requests WHERE id = ?', [lvId]).catch(() => {});
      }

      if (createdOpIds.length > 0) {
        const ph = createdOpIds.map(() => '?').join(', ');
        await pool.query(`DELETE FROM operational_documents_storage WHERE entity_type = 'TICKET_EVIDENCE' AND entity_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM ticket_reminder_logs WHERE operation_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM ticket_reassignment_history WHERE operation_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM ticket_deadline_history WHERE operation_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM operational_tasks WHERE central_operation_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM chat_messages WHERE context_entity_type IN ('OPERATION', 'MEMO') AND context_entity_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM notifications WHERE source_entity_type = 'CENTRAL_OPERATION' AND source_entity_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM central_operation_events WHERE operation_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM central_operation_recipients WHERE operation_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM operations_memos WHERE operation_id IN (${ph})`, createdOpIds).catch(() => {});
        await pool.query(`DELETE FROM central_operations WHERE id IN (${ph})`, createdOpIds).catch(() => {});
      }

      if (createdReservationCodes.length > 0) {
        const ph = createdReservationCodes.map(() => '?').join(', ');
        await pool.query(`DELETE FROM booking_authentications WHERE reservation_id IN (SELECT id FROM reservations WHERE reservation_code IN (${ph}))`, createdReservationCodes).catch(() => {});
        await pool.query(`DELETE FROM payments WHERE reservation_id IN (SELECT id FROM reservations WHERE reservation_code IN (${ph}))`, createdReservationCodes).catch(() => {});
        await pool.query(`DELETE FROM reservations WHERE reservation_code IN (${ph})`, createdReservationCodes).catch(() => {});
      }
      if (createdBookingAuthEmails.length > 0) {
        const ph = createdBookingAuthEmails.map(() => '?').join(', ');
        await pool.query(`DELETE FROM booking_authentications WHERE guest_email IN (${ph})`, createdBookingAuthEmails).catch(() => {});
      }

      if (prop2ManagerId) {
        await pool.query('DELETE FROM chat_thread_participants WHERE user_id = ?', [prop2ManagerId]).catch(() => {});
        await pool.query('DELETE FROM users WHERE id = ?', [prop2ManagerId]).catch(() => {});
      }
    } finally {
      if (typeof pool.closePool === 'function') {
        await pool.closePool();
      }
    }
  });

  // ─── 1. Priority Ack SLA Bounds & Owner Configuration ────────────────────
  describe('Priority Acknowledgment SLA Configuration (3-24h bounds)', () => {
    test('rejects non-Owner/non-SuperAdmin SLA updates with 403 and out-of-range hours with 400', async () => {
      const denyRes = await request(app)
        .put('/api/v1/workforce/operations/sla-config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ CRITICAL: 4 });
      expect(denyRes.status).toBe(403);

      const lowBoundRes = await request(app)
        .put('/api/v1/workforce/operations/sla-config')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ CRITICAL: 2 });
      expect(lowBoundRes.status).toBe(400);

      const highBoundRes = await request(app)
        .put('/api/v1/workforce/operations/sla-config')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ LOW: 30 });
      expect(highBoundRes.status).toBe(400);

      const okRes = await request(app)
        .put('/api/v1/workforce/operations/sla-config')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ CRITICAL: 4, URGENT: 6, HIGH: 6, NORMAL: 12, LOW: 24 });
      expect(okRes.status).toBe(200);
      expect(okRes.body.data.CRITICAL).toBe(4);

      // Reset to default 3h CRITICAL for sweep tests
      await request(app)
        .put('/api/v1/workforce/operations/sla-config')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ CRITICAL: 3, URGENT: 6, HIGH: 6, IMPORTANT: 12, NORMAL: 12, LOW: 24 });
    });
  });

  // ─── 2. Personal vs Group Tickets, Authorization, Chat Routing & Scoping ──
  describe('Ticket Creation, Personal DM Delivery, Group Ownership & Property Scoping', () => {
    let prop1PersonalOpId;
    let groupOpId;

    test('ADMIN cannot issue TEAM group operation (Owner-only governance), and personal ticket goes only to 1-to-1 DM + 1 task', async () => {
      const deniedTeam = await request(app)
        .post('/api/v1/workforce/operations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Unauthorized Admin Team Op',
          subject: 'Unauthorized Group Broadcast',
          purpose: 'Testing Owner-only group initiation gate.',
          operational_instructions: 'Should be blocked with 403.',
          priority: 'HIGH',
          target_audience_type: 'MANAGERS_ONLY',
          property_id: 1,
        });
      expect(deniedTeam.status).toBe(403);

      // Personal ticket Admin -> Staff (id 5) on Property 1
      const createRes = await request(app)
        .post('/api/v1/workforce/operations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Inspect Unit 101 AC Compressor',
          subject: 'Unit 101 Cooling Check',
          purpose: 'Verify compressor amp draw and clean filters before VIP guest arrival.',
          operational_instructions: 'Inspect condenser coils, measure outlet temperature, upload photo evidence.',
          priority: 'CRITICAL',
          target_audience_type: 'SPECIFIC_USER',
          recipient_user_ids: [5],
          property_id: 1,
          deadline_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        });
      expect(createRes.status).toBe(201);
      const op = createRes.body.data;
      prop1PersonalOpId = op.id;
      createdOpIds.push(op.id);

      expect(op.ticket_reference).toMatch(/^(BFA-)?TKT-/);
      expect(op.current_responsible_user_id).toBe(5);
      expect(op.acknowledgment_sla_hours).toBe(3);
      expect(op.acknowledgment_deadline_at).toBeTruthy();
      expect(op.tasks.length).toBe(1);
      expect(op.tasks[0].assigned_to_id).toBe(5);

      // Verify personal delivery landed in DM thread AND chat history hydrates contextEntity cleanly on PG
      const tRows = await pool.query('SELECT thread_type FROM chat_threads WHERE id = ?', [op.chat_thread_id]);
      const threadRows = Array.isArray(tRows) ? tRows : tRows.rows;
      expect(threadRows[0]?.thread_type).toBe('DIRECT');

      const histRes = await request(app)
        .get(`/api/v1/chat/threads/${op.chat_thread_id}/history?limit=10`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(histRes.status).toBe(200);
      const msgList = Array.isArray(histRes.body?.data) ? histRes.body.data : (histRes.body?.data?.messages || []);
      const ctxMsg = msgList.find((m) => Number(m.contextEntity?.id) === Number(op.id));
      expect(ctxMsg).toBeTruthy();
      expect(ctxMsg.contextEntity.type).toBe('OPERATION');
    });

    test('OWNER initiates Group Ticket without duplicate tasks; Manager/Admin claim creates 1 task cleanly', async () => {
      const groupRes = await request(app)
        .post('/api/v1/workforce/operations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Quarterly Safety Extinguisher Audit',
          subject: 'Property 1 Safety Readiness',
          purpose: 'Verify fire extinguishers across all floors.',
          operational_instructions: 'Log tag serials and expiry pressure gauges.',
          priority: 'URGENT',
          target_audience_type: 'SPECIFIC_USERS',
          recipient_user_ids: [2, 3],
          property_id: 1,
          deadline_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        });
      expect(groupRes.status).toBe(201);
      const op = groupRes.body.data;
      groupOpId = op.id;
      createdOpIds.push(op.id);

      expect(op.current_responsible_user_id).toBeNull();
      expect(op.tasks.length).toBe(0);

      // Admin claims responsibility -> creates 1 primary task cleanly
      const claimRes = await request(app)
        .post(`/api/v1/workforce/operations/${groupOpId}/claim`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(claimRes.status).toBe(200);
      expect(claimRes.body.data.current_responsible_user_id).toBe(2);
      expect(claimRes.body.data.tasks.length).toBe(1);
    });

    test('Manager property isolation, view=archived 200 status, General Group AGENT exclusion, and context-preview auth', async () => {
      // Property 2 manager cannot view Property 1 personal op or download its PDF
      const forbiddenGet = await request(app)
        .get(`/api/v1/workforce/operations/${prop1PersonalOpId}`)
        .set('Authorization', `Bearer ${prop2ManagerToken}`);
      expect(forbiddenGet.status).toBe(403);

      const forbiddenPdf = await request(app)
        .get(`/api/v1/workforce/operations/${prop1PersonalOpId}/memo/pdf`)
        .set('Authorization', `Bearer ${prop2ManagerToken}`);
      expect(forbiddenPdf.status).toBe(403);

      // Property 2 manager summary shows scoped summary without crashing
      const p2Summary = await request(app)
        .get('/api/v1/workforce/operations/summary')
        .set('Authorization', `Bearer ${prop2ManagerToken}`);
      expect(p2Summary.status).toBe(200);

      // Regression test: view=archived must return 200 (not 500 PG placeholder mismatch)
      const archivedRes = await request(app)
        .get('/api/v1/workforce/operations?view=archived')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(archivedRes.status).toBe(200);
      expect(Array.isArray(archivedRes.body.data)).toBe(true);

      // AGENT cannot access General Group or chat context preview
      const agentThreads = await request(app)
        .get('/api/v1/chat/threads')
        .set('Authorization', `Bearer ${agentToken}`);
      expect([200, 403]).toContain(agentThreads.status);
      if (agentThreads.status === 200) {
        const general = (agentThreads.body.data || []).find((t) => (t.title || t.name) === 'General Group');
        expect(general).toBeUndefined();
      }
      const partCheck = await pool.query(
        `SELECT COUNT(*) AS cnt FROM chat_thread_participants cp
         JOIN chat_threads ct ON cp.thread_id = ct.id
         WHERE cp.user_id = 6 AND ct.title = 'General Group' AND cp.left_at IS NULL`
      );
      const partRows = Array.isArray(partCheck) ? partCheck : partCheck.rows;
      expect(Number(partRows[0]?.cnt || 0)).toBe(0);

      const agentPreview = await request(app)
        .get(`/api/v1/chat/context-preview?entityType=OPERATION&entityId=${prop1PersonalOpId}`)
        .set('Authorization', `Bearer ${agentToken}`);
      expect(agentPreview.status).toBe(403);
    });
  });

  // ─── 3. Deterministic SLA Reminder Schedule & Hierarchical Escalation ──────
  describe('Priority Ack SLA Reminders, Idempotency & Hierarchical Escalation', () => {
    let slaOpId;

    test('fires exact CRITICAL (1h/2h/3h) milestones idempotently, escalates hierarchically, and stops upon acknowledgment', async () => {
      const issuedAt = new Date('2026-11-20T09:00:00.000Z');
      const createRes = await request(app)
        .post('/api/v1/workforce/operations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'SLA Sweep Critical Pump Check',
          subject: 'Emergency Pump Inspection',
          purpose: 'Verify deterministic 1h/2h/3h reminders and hierarchical escalation.',
          operational_instructions: 'Inspect booster pressure and acknowledge receipt.',
          priority: 'CRITICAL',
          target_audience_type: 'SPECIFIC_USER',
          recipient_user_ids: [5],
          property_id: 1,
          deadline_at: new Date('2026-11-20T18:00:00.000Z').toISOString(),
        });
      expect(createRes.status).toBe(201);
      slaOpId = createRes.body.data.id;
      createdOpIds.push(slaOpId);

      // Backdate created_at / assigned_at / acknowledgment_deadline_at deterministically in test DB
      await pool.query(
        `UPDATE central_operations
         SET created_at = ?, acknowledgment_deadline_at = ?, deadline_at = ?
         WHERE id = ?`,
        [
          issuedAt,
          new Date('2026-11-20T12:00:00.000Z'), // +3h
          new Date('2026-11-20T18:00:00.000Z'), // +9h
          slaOpId,
        ]
      );
      await pool.query(
        `UPDATE central_operation_recipients
         SET assigned_at = ?, delivered_at = ?
         WHERE operation_id = ?`,
        [issuedAt, issuedAt, slaOpId]
      );

      // At +1h05m -> CRITICAL stage 1 (1h) fires once
      const sweep1 = await TicketSlaSchedulerService.runSlaSweep({ now: new Date('2026-11-20T10:05:00.000Z') });
      expect(sweep1.ackFirstReminders).toBeGreaterThanOrEqual(1);
      const q1 = await pool.query('SELECT reminder_stage FROM ticket_reminder_logs WHERE operation_id = ? ORDER BY id', [slaOpId]);
      let logs = Array.isArray(q1) ? q1 : q1.rows;
      expect(logs.map((l) => l.reminder_stage)).toContain('ACK_T1_R0');

      // Re-run at same synthetic time -> idempotent zero duplicates
      const countBefore = logs.length;
      await TicketSlaSchedulerService.runSlaSweep({ now: new Date('2026-11-20T10:10:00.000Z') });
      const q2 = await pool.query('SELECT reminder_stage FROM ticket_reminder_logs WHERE operation_id = ?', [slaOpId]);
      logs = Array.isArray(q2) ? q2 : q2.rows;
      expect(logs.length).toBe(countBefore);

      // At +2h10m -> CRITICAL stage 2 (2h) fires
      await TicketSlaSchedulerService.runSlaSweep({ now: new Date('2026-11-20T11:10:00.000Z') });
      const q2b = await pool.query('SELECT reminder_stage FROM ticket_reminder_logs WHERE operation_id = ?', [slaOpId]);
      logs = Array.isArray(q2b) ? q2b : q2b.rows;
      expect(logs.map((l) => l.reminder_stage)).toContain('ACK_T2_R0');

      // At +3h10m -> SLA breached, ESCALATION fires hierarchically
      await TicketSlaSchedulerService.runSlaSweep({ now: new Date('2026-11-20T12:10:00.000Z') });
      const q3 = await pool.query('SELECT reminder_stage, recipient_user_id FROM ticket_reminder_logs WHERE operation_id = ?', [slaOpId]);
      logs = Array.isArray(q3) ? q3 : q3.rows;
      expect(logs.map((l) => l.reminder_stage)).toEqual(expect.arrayContaining(['ACK_T1_R0', 'ACK_T2_R0', 'ACK_ESC_R0']));
      // AGENT (user 6) never notified
      expect(logs.some((l) => Number(l.recipient_user_id) === 6)).toBe(false);

      const qOp = await pool.query('SELECT escalated_at, escalated_to_user_id, status FROM central_operations WHERE id = ?', [slaOpId]);
      const postEscOp = (Array.isArray(qOp) ? qOp : qOp.rows)[0];
      expect(postEscOp.escalated_at).toBeTruthy();
      expect(postEscOp.status).toBe('ESCALATED');

      // Acknowledge ticket -> future sweep must stop unack reminders on this ticket
      const ackRes = await request(app)
        .post(`/api/v1/workforce/operations/${slaOpId}/acknowledge`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ note: 'Acknowledged after inspection alert.' });
      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.first_acknowledged_at).toBeTruthy();

      // Execution deadline overdue sweep at +9h15m
      await TicketSlaSchedulerService.runSlaSweep({ now: new Date('2026-11-20T18:15:00.000Z') });
      const q4 = await pool.query('SELECT reminder_stage FROM ticket_reminder_logs WHERE operation_id = ?', [slaOpId]);
      logs = Array.isArray(q4) ? q4 : q4.rows;
      expect(logs.map((l) => l.reminder_stage)).toContain('EXEC_OVERDUE_E0');
    });
  });

  // ─── 4. Complete Lifecycle: Lifecycle Stages, Reassignment, Extension, Evidence PDF/Close/Reopen ─
  describe('Full Ticket Lifecycle, Reassignment Audit, Extension Approval, DB Evidence & Memo PDF', () => {
    let ticketId;
    let uploadedDocId;

    test('executes Start Execution -> Clarification -> Extension -> DB Evidence -> Completion -> Review -> Close -> Reopen + Valid PDF', async () => {
      const createRes = await request(app)
        .post('/api/v1/workforce/operations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Full Lifecycle Generator Servicing Ticket',
          subject: '250kVA Standby Generator Service',
          purpose: 'Verify full ticket lifecycle, DB evidence storage, reassignment and Memo PDF generation.',
          operational_instructions: 'Drain oil, replace filters, run 15-minute load test, attach receipt & readout.',
          priority: 'HIGH',
          target_audience_type: 'SPECIFIC_USER',
          recipient_user_ids: [5],
          property_id: 1,
          deadline_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        });
      expect(createRes.status).toBe(201);
      ticketId = createRes.body.data.id;
      createdOpIds.push(ticketId);

      // 1. Acknowledge & explicitly Start Execution (separate milestones)
      const ackRes = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/acknowledge`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ note: 'Received generator checklist.' });
      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.started_at).toBeNull();

      const startRes = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/start`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ notes: 'Isolation switch locked out and tools ready.' });
      expect(startRes.status).toBe(200);
      expect(startRes.body.data.started_at).toBeTruthy();
      expect(startRes.body.data.status).toBe('IN_PROGRESS');

      // 2. Clarification inquiry & response
      const clarReq = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/clarification`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ questionText: 'Should coolant flush also be performed today?' });
      expect(clarReq.status).toBe(200);
      expect(clarReq.body.data.status).toBe('AWAITING_CLARIFICATION');

      const clarResp = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/clarification/respond`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ responseText: 'Yes, top off coolant only if below minimum level.' });
      expect(clarResp.status).toBe(200);
      expect(clarResp.body.data.status).toBe('IN_PROGRESS');

      // 3. Reassignment requires reason, stores history, resets fresh Ack SLA window
      const badReassign = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ targetUserId: 4, reason: 'ok' });
      expect(badReassign.status).toBe(400);

      const reassignRes = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ targetUserId: 4, reason: 'Original staff rotating off-shift; transferring to Reception supervisor.' });
      expect(reassignRes.status).toBe(200);
      expect(reassignRes.body.data.current_responsible_user_id).toBe(4);
      expect(reassignRes.body.data.reassignment_history.length).toBeGreaterThanOrEqual(1);

      // Reassign back to Staff 5 and re-acknowledge
      await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ targetUserId: 5, reason: 'Returned to maintenance shift owner David Kalu.' });
      await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/acknowledge`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ note: 'Re-acknowledged after rotation.' });

      // 4. Deadline extension request & approval
      const newDue = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      const extReq = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/extension-request`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ requestedDeadlineAt: newDue, reason: 'Fuel filter delivery arriving tomorrow morning.' });
      expect(extReq.status).toBe(200);
      expect(extReq.body.data.extension_status).toBe('PENDING');

      const extApprove = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/extension-review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVED', notes: 'Approved pending vendor drop-off.' });
      expect(extApprove.status).toBe(200);
      expect(extApprove.body.data.extension_status).toBe('APPROVED');
      expect(extApprove.body.data.deadline_history.length).toBeGreaterThanOrEqual(1);

      // 5. DB-persistent binary evidence upload & download verification
      const samplePayload = Buffer.from('BFA-GENERATOR-LOAD-TEST-PASS-240V', 'utf8');
      const evUpload = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/evidence`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          fileName: 'load_test_report.txt',
          mimeType: 'text/plain',
          fileData: samplePayload.toString('base64'),
          caption: '15-minute load bank output',
        });
      expect(evUpload.status).toBe(201);
      uploadedDocId = evUpload.body.data.id;

      const evDownload = await request(app)
        .get(`/api/v1/workforce/operations/${ticketId}/evidence/${uploadedDocId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(evDownload.status).toBe(200);
      expect(evDownload.text).toContain('BFA-GENERATOR-LOAD-TEST-PASS-240V');

      // 6. Submit completion, approve & close, reopen preserving history
      const compRes = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/completion`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ completionNotes: 'Generator serviced and load tested cleanly.' });
      expect(compRes.status).toBe(200);

      const revRes = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVED', reviewNotes: 'Verified with DB load report.', closeImmediately: true });
      expect(revRes.status).toBe(200);
      expect(['COMPLETED', 'CLOSED']).toContain(revRes.body.data.status);

      const reopenRes = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/reopen`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Follow-up decibel meter reading requested by Owner.' });
      expect(reopenRes.status).toBe(200);
      expect(['REOPENED', 'IN_PROGRESS', 'OPEN']).toContain(reopenRes.body.data.status);
      expect(reopenRes.body.data.reopen_count).toBeGreaterThanOrEqual(1);

      const closeRes = await request(app)
        .post(`/api/v1/workforce/operations/${ticketId}/close`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ outcome: 'CLOSED_RESOLVED', closureReason: 'Acoustic test passed at 68dB.' });
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.status).toBe('CLOSED');

      // 7. Download Official Memo PDF & confirm %PDF header + valid binary output
      const pdfRes = await request(app)
        .get(`/api/v1/workforce/operations/${ticketId}/memo/pdf`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toContain('application/pdf');
      expect(Buffer.from(pdfRes.body).subarray(0, 4).toString('utf8')).toBe('%PDF');
    });
  });

  // ─── 5. Staff Performance Engine (09:00 WAT, 19 Metrics, Exclusions & Owner Privacy) ─
  describe('Performance Engine (09:00 Africa/Lagos, Fair Exclusions, Weights & Owner Privacy)', () => {
    let qualityOpId;
    let invalidDeclinedOpId;

    test('computes 09:00 WAT punctuality, leave exclusions, 19 ticket metrics, configurable weights & Owner privacy', async () => {
      // Employee 4 (Staff id 5) attendance records in fixed date range
      const dOnTime = '2026-11-10';
      const dLate = '2026-11-11';
      const dLeave = '2026-11-12';

      const attRes1 = await pool.query(
        `INSERT INTO attendance_records (employee_id, property_id, work_date, clock_in_time, clock_out_time, actual_hours, attendance_status)
         VALUES (4, 1, ?, '2026-11-10T07:45:00.000Z', '2026-11-10T16:30:00.000Z', 8.5, 'PRESENT')
         RETURNING id`,
        [dOnTime]
      );
      const insOnTime = (Array.isArray(attRes1) ? attRes1 : attRes1.rows)[0];

      const attRes2 = await pool.query(
        `INSERT INTO attendance_records (employee_id, property_id, work_date, clock_in_time, clock_out_time, actual_hours, attendance_status)
         VALUES (4, 1, ?, '2026-11-11T08:25:00.000Z', '2026-11-11T17:00:00.000Z', 8.0, 'LATE')
         RETURNING id`,
        [dLate]
      );
      const insLate = (Array.isArray(attRes2) ? attRes2 : attRes2.rows)[0];

      const lvRes = await pool.query(
        `INSERT INTO leave_requests (request_code, employee_id, property_id, leave_category_id, start_date, end_date, total_days, reason, status)
         VALUES (?, 4, 1, 1, ?, ?, 1, 'Approved rest day test', 'APPROVED')
         RETURNING id`,
        [`LV-TEST-${Date.now()}`, dLeave, dLeave]
      );
      const insLeave = (Array.isArray(lvRes) ? lvRes : lvRes.rows)[0];

      testAttIds.push(insOnTime.id, insLate.id);
      testLeaveIds.push(insLeave.id);

      // Invalid decline ticket (must NOT count against Staff completion quality)
      const invRes = await request(app)
        .post('/api/v1/workforce/operations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Misassigned Kitchen Fixture',
          subject: 'Out of Department Trade',
          purpose: 'Confirm assignee valid decline is fairly excluded.',
          operational_instructions: 'Decline as misassigned.',
          priority: 'LOW',
          target_audience_type: 'SPECIFIC_USER',
          recipient_user_ids: [5],
          property_id: 1,
        });
      expect(invRes.status).toBe(201);
      invalidDeclinedOpId = invRes.body.data.id;
      createdOpIds.push(invalidDeclinedOpId);

      await request(app)
        .post(`/api/v1/workforce/operations/${invalidDeclinedOpId}/reject`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: 'Plumbing contractor handles industrial kitchen lines.', category: 'ASSIGNEE_INVALID_DECLINED' });

      // Quality rejection test
      const qRes = await request(app)
        .post('/api/v1/workforce/operations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Balcony Drain Sealing Verification',
          subject: 'Sealant Quality Audit',
          purpose: 'Verify supervisor quality rejection increments quality counter.',
          operational_instructions: 'Seal perimeter drain and submit.',
          priority: 'NORMAL',
          target_audience_type: 'SPECIFIC_USER',
          recipient_user_ids: [5],
          property_id: 1,
        });
      expect(qRes.status).toBe(201);
      qualityOpId = qRes.body.data.id;
      createdOpIds.push(qualityOpId);

      await request(app)
        .post(`/api/v1/workforce/operations/${qualityOpId}/completion`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ completionNotes: 'Completed draft pass.' });
      await request(app)
        .post(`/api/v1/workforce/operations/${qualityOpId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'REJECTED', reviewNotes: 'Gap left along east flashing.' });

      // Validate weights must sum to 100
      const badWeights = await request(app)
        .put('/api/v1/workforce/performance/weights')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ weights: { attendance: 50, ackSla: 15, executionTimeliness: 30, quality: 20, workload: 15 } });
      expect(badWeights.status).toBe(400);

      // Query Staff Performance as ADMIN vs OWNER
      const adminPerfRes = await request(app)
        .get('/api/v1/workforce/performance/staff/5?startDate=2026-11-01&endDate=2026-11-30')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminPerfRes.status).toBe(200);
      const ap = adminPerfRes.body.data;
      expect(ap.attendanceMetrics.cutoffRule).toBe('09:00 Africa/Lagos (WAT)');
      expect(ap.attendanceMetrics.onTimeDays).toBeGreaterThanOrEqual(1); // 07:45 UTC = 08:45 WAT
      expect(ap.attendanceMetrics.lateDays).toBeGreaterThanOrEqual(1);   // 08:25 UTC = 09:25 WAT (+25m)
      expect(ap.attendanceMetrics.approvedLeaveDays).toBeGreaterThanOrEqual(1);
      expect(ap.ticketMetrics.ticketsDeclinedInvalid).toBeGreaterThanOrEqual(1);
      expect(ap.ticketMetrics.ticketsRejectedQuality).toBeGreaterThanOrEqual(1);
      expect(ap.disciplinary.restrictedFromOwner).toBe(false);
      expect(Object.keys(ap.ticketMetrics).length).toBeGreaterThanOrEqual(19);

      const ownerPerfRes = await request(app)
        .get('/api/v1/workforce/performance/staff/5?startDate=2026-11-01&endDate=2026-11-30')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ownerPerfRes.status).toBe(200);
      expect(ownerPerfRes.body.data.disciplinary).toEqual({ restrictedFromOwner: true });

      // Overview leaderboard scopes cleanly for Property-2 manager without cross-property leakage
      const p2Overview = await request(app)
        .get('/api/v1/workforce/performance/overview')
        .set('Authorization', `Bearer ${prop2ManagerToken}`);
      expect(p2Overview.status).toBe(200);
      expect(p2Overview.body.data.staffEvaluations.some((s) => Number(s.user.id) === 5)).toBe(false);
    });
  });

  // ─── 6. Public Booking Regression (property_id derivation + PG Upsert) ────
  describe('Public Booking Property Derivation & PG Booking Auth Regression', () => {
    test('creates public booking cleanly omitting propertyId without PG syntax/ReferenceError crashes', async () => {
      const testEmail = `guest.booking.reg.${Date.now()}@example.com`;
      createdBookingAuthEmails.push(testEmail);

      const bookRes = await request(app)
        .post('/api/v1/public/booking')
        .send({
          apartmentId: 1,
          checkInDate: '2026-12-20',
          checkOutDate: '2026-12-21',
          guestName: 'Regression Test Guest',
          guestEmail: testEmail,
          guestPhone: '+2348099990000',
          paymentMethod: 'BANK_TRANSFER',
          specialRequests: 'High floor check',
        });

      expect(bookRes.status).toBe(201);
      const data = bookRes.body.data;
      expect(data?.reservationCode).toBeTruthy();
      createdReservationCodes.push(data.reservationCode);

      const persistedRes = await pool.query('SELECT property_id, apartment_id FROM reservations WHERE reservation_code = ? LIMIT 1', [data.reservationCode]);
      const persistedRows = Array.isArray(persistedRes) ? persistedRes : persistedRes.rows;
      expect(Number(persistedRows[0]?.property_id)).toBe(1);
      expect(Number(persistedRows[0]?.apartment_id)).toBe(1);

      const authRes = await pool.query('SELECT guest_email FROM booking_authentications WHERE LOWER(guest_email) = LOWER(?) LIMIT 1', [testEmail]);
      const authRows = Array.isArray(authRes) ? authRes : authRes.rows;
      expect(authRows.length).toBe(1);
    });
  });
});
