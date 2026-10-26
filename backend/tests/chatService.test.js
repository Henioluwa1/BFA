const http = require('http');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');
const { initializeChatSocket } = require('../src/modules/chat/chat.socket');

describe('Phase 4 WP-4.2: Internal Chat Backend Service & Real-Time Engine', () => {
  let httpServer;
  let ioServer;
  let serverPort;
  let serverUrl;

  const password = 'Bfa2026!Secure';
  const tokens = {};
  const users = {};

  const roleCredentials = {
    SUPER_ADMIN: 'superadmin@bfa.com',
    ADMIN: 'admin@bfa.com',
    MANAGER: 'manager@bfa.com',
    RECEPTIONIST: 'receptionist@bfa.com',
    STAFF: 'staff@bfa.com',
    AGENT: 'agent@bfa.com',
    OWNER: 'owner@bfa.com',
  };

  const createdThreadIds = [];

  beforeAll(async () => {
    // 1. Authenticate all 7 roles and store tokens & user profiles
    for (const [role, email] of Object.entries(roleCredentials)) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });
      expect(res.status).toBe(200);
      tokens[role] = res.body.data.token;
      users[role] = res.body.data.user;
    }

    // Also fetch maintenance staff user (Property 2) for cross-property isolation tests
    const prop2StaffRows = await pool.query(
      "SELECT id, name, email, role, property_id FROM users WHERE email = 'maintenance@bfa.com' LIMIT 1"
    );
    users.MAINTENANCE_PROP2 = prop2StaffRows[0];
    const maintRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'maintenance@bfa.com', password });
    tokens.MAINTENANCE_PROP2 = maintRes.body.data.token;

    // 2. Start HTTP & Socket.IO server on ephemeral port
    httpServer = http.createServer(app);
    ioServer = new Server(httpServer, {
      path: '/api/v1/socket.io',
      cors: { origin: '*', credentials: true },
      transports: ['websocket', 'polling'],
    });
    initializeChatSocket(ioServer);

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        serverPort = httpServer.address().port;
        serverUrl = `http://localhost:${serverPort}`;
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    // Clean up created test threads, participants, and messages
    if (createdThreadIds.length > 0) {
      await pool.query('DELETE FROM chat_messages WHERE thread_id IN (?)', [createdThreadIds]);
      await pool.query('DELETE FROM chat_thread_participants WHERE thread_id IN (?)', [createdThreadIds]);
      await pool.query('DELETE FROM chat_threads WHERE id IN (?)', [createdThreadIds]);
    }

    // Close Socket.IO and HTTP server
    if (ioServer) {
      ioServer.close();
    }
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await pool.closePool();
  });

  // Helper to connect a test client socket returning a promise
  function connectSocketAsync(authToken) {
    return new Promise((resolve, reject) => {
      const client = ioClient(serverUrl, {
        path: '/api/v1/socket.io',
        auth: { token: authToken },
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
      });

      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => {
        client.disconnect();
        reject(err);
      });
    });
  }

  // ==========================================================================
  // 1. Socket.IO Handshake Authentication & Security Invariants
  // ==========================================================================
  describe('1. Socket.IO Handshake Authentication', () => {
    test('Handshake succeeds with valid operational staff token (RECEPTIONIST)', async () => {
      const client = await connectSocketAsync(tokens.RECEPTIONIST);
      expect(client.connected).toBe(true);
      client.disconnect();
    });

    test('Handshake REJECTED when token is missing', async () => {
      await expect(connectSocketAsync(null)).rejects.toThrow('AUTHENTICATION_REQUIRED');
    });

    test('Handshake REJECTED with invalid / forged JWT token', async () => {
      await expect(connectSocketAsync('invalid.jwt.token')).rejects.toThrow('INVALID_TOKEN');
    });

    test('Handshake REJECTED with expired JWT token', async () => {
      const expiredToken = jwt.sign(
        { id: 2, role: 'ADMIN', email: 'admin@bfa.com' },
        config.security.jwtSecret,
        { expiresIn: '-1s' }
      );
      await expect(connectSocketAsync(expiredToken)).rejects.toThrow('INVALID_TOKEN');
    });

    test('Handshake REJECTED for inactive / suspended staff account', async () => {
      const userRows = await pool.query('SELECT id, status FROM users WHERE email = "housekeeping@bfa.com"');
      const testUserId = userRows[0].id;
      const originalStatus = userRows[0].status;

      await pool.query('UPDATE users SET status = "INACTIVE" WHERE id = ?', [testUserId]);

      const inactiveToken = jwt.sign(
        { id: testUserId, role: 'STAFF', email: 'housekeeping@bfa.com' },
        config.security.jwtSecret,
        { expiresIn: '1h' }
      );

      await expect(connectSocketAsync(inactiveToken)).rejects.toThrow('USER_INACTIVE_OR_SUSPENDED');

      // Restore status
      await pool.query('UPDATE users SET status = ? WHERE id = ?', [originalStatus, testUserId]);
    });
  });

  // ==========================================================================
  // 2. Role Denial for Excluded Roles (AGENT, OWNER, etc.)
  // ==========================================================================
  describe('2. Role Denial for Excluded Roles (AGENT, OWNER, GUEST)', () => {
    test('AGENT role is strictly rejected at Socket handshake', async () => {
      await expect(connectSocketAsync(tokens.AGENT)).rejects.toThrow('ROLE_NOT_AUTHORIZED_FOR_CHAT');
    });

    test('OWNER role is strictly rejected at Socket handshake', async () => {
      await expect(connectSocketAsync(tokens.OWNER)).rejects.toThrow('ROLE_NOT_AUTHORIZED_FOR_CHAT');
    });

    test('AGENT role is denied access to REST chat endpoints (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/v1/chat/threads')
        .set('Authorization', `Bearer ${tokens.AGENT}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('OWNER role is denied access to REST chat contacts (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/v1/chat/contacts')
        .set('Authorization', `Bearer ${tokens.OWNER}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Unauthenticated caller is rejected with HTTP 401', async () => {
      const res = await request(app).get('/api/v1/chat/threads');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================================================
  // 3. Operational Scope & Cross-Property Direct Messaging Rules
  // ==========================================================================
  describe('3. Operational Scope & Cross-Property Direct Messaging Rules', () => {
    test('Same-property staff (STAFF prop 1 and RECEPTIONIST prop 1) CAN initiate direct chat', async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/direct')
        .set('Authorization', `Bearer ${tokens.STAFF}`)
        .send({ targetUserId: users.RECEPTIONIST.id });

      expect(res.status).toBe(201);
      expect(res.body.data.thread_type).toBe('DIRECT');
      expect(res.body.data.participants.length).toBe(2);
      createdThreadIds.push(res.body.data.id);
    });

    test('Cross-property staff (STAFF prop 1 and MAINTENANCE prop 2) are STRICTLY DENIED (HTTP 403)', async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/direct')
        .set('Authorization', `Bearer ${tokens.STAFF}`)
        .send({ targetUserId: users.MAINTENANCE_PROP2.id });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('do not share property or operational scope');
    });

    test('Global ADMIN CAN initiate direct chat with staff at any property', async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/direct')
        .set('Authorization', `Bearer ${tokens.ADMIN}`)
        .send({ targetUserId: users.MAINTENANCE_PROP2.id });

      expect(res.status).toBe(201);
      expect(res.body.data.thread_type).toBe('DIRECT');
      createdThreadIds.push(res.body.data.id);
    });

    test('Staff contacts discovery filters out out-of-scope staff', async () => {
      const res = await request(app)
        .get('/api/v1/chat/contacts')
        .set('Authorization', `Bearer ${tokens.STAFF}`); // Staff at Prop 1

      expect(res.status).toBe(200);
      const contacts = res.body.data;
      const contactIds = contacts.map((c) => c.id);

      // Should contain Prop 1 Receptionist and Global Admin
      expect(contactIds).toContain(users.RECEPTIONIST.id);
      expect(contactIds).toContain(users.ADMIN.id);

      // Should NOT contain Prop 2 Maintenance staff
      expect(contactIds).not.toContain(users.MAINTENANCE_PROP2.id);
    });
  });

  // ==========================================================================
  // 4. Exact Two-Participant Invariant for Direct Threads
  // ==========================================================================
  describe('4. Direct-Thread Deduplication & Exact Two-Participant Invariant', () => {
    let directThreadId;

    test('Exact 2 distinct participants enrolled transactionally on creation', async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/direct')
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`)
        .send({ targetUserId: users.MANAGER.id });

      expect(res.status).toBe(201);
      directThreadId = res.body.data.id;
      createdThreadIds.push(directThreadId);

      // Verify exact count in DB
      const countRows = await pool.query(
        'SELECT COUNT(*) as count FROM chat_thread_participants WHERE thread_id = ?',
        [directThreadId]
      );
      expect(countRows[0].count).toBe(2);
    });

    test('Subsequent creation request returns SAME thread (Idempotent deduplication via direct_hash)', async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/direct')
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ targetUserId: users.RECEPTIONIST.id });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(directThreadId);

      // Ensure no duplicate participant rows
      const countRows = await pool.query(
        'SELECT COUNT(*) as count FROM chat_thread_participants WHERE thread_id = ?',
        [directThreadId]
      );
      expect(countRows[0].count).toBe(2);
    });

    test('Reject self-direct chat attempt (targetUserId === creatorId)', async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/direct')
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`)
        .send({ targetUserId: users.RECEPTIONIST.id });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Cannot create a direct chat thread with oneself');
    });
  });

  // ==========================================================================
  // 5. Unauthorized Thread Discovery & Access Boundary
  // ==========================================================================
  describe('5. Thread Isolation & Unauthorized Access Prevention', () => {
    let privateThreadId;

    beforeAll(async () => {
      // Create a private direct thread between SUPER_ADMIN and ADMIN
      const res = await request(app)
        .post('/api/v1/chat/threads/direct')
        .set('Authorization', `Bearer ${tokens.SUPER_ADMIN}`)
        .send({ targetUserId: users.ADMIN.id });
      privateThreadId = res.body.data.id;
      createdThreadIds.push(privateThreadId);
    });

    test('Unauthorized staff cannot fetch details of thread they do not belong to (HTTP 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/chat/threads/${privateThreadId}`)
        .set('Authorization', `Bearer ${tokens.STAFF}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Unauthorized staff cannot fetch message history of foreign thread (HTTP 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/chat/threads/${privateThreadId}/history`)
        .set('Authorization', `Bearer ${tokens.STAFF}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Unauthorized staff cannot join foreign thread room via Socket.IO', async () => {
      const client = await connectSocketAsync(tokens.STAFF);
      const ack = await new Promise((resolve) => {
        client.emit('thread:join', { threadId: privateThreadId }, resolve);
      });
      expect(ack.success).toBe(false);
      expect(ack.error.code).toBe('FORBIDDEN');
      client.disconnect();
    });
  });

  // ==========================================================================
  // 6. Message Persistence & Delivery Acknowledgement
  // ==========================================================================
  describe('6. Message Persistence, Idempotency & Delivery Order', () => {
    let activeThreadId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/direct')
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ targetUserId: users.STAFF.id });
      activeThreadId = res.body.data.id;
      createdThreadIds.push(activeThreadId);
    });

    test('Server persists message to DB before acknowledging and broadcasting send', async () => {
      const senderClient = await connectSocketAsync(tokens.MANAGER);
      const receiverClient = await connectSocketAsync(tokens.STAFF);

      // Join receiver to thread room
      const joinAck = await new Promise((resolve) => {
        receiverClient.emit('thread:join', { threadId: activeThreadId }, resolve);
      });
      expect(joinAck.success).toBe(true);

      // Prepare promise for receiver to catch delivered message
      const deliveryPromise = new Promise((resolve) => {
        receiverClient.on('message:delivered', resolve);
      });

      // Sender sends message with ack
      const sendAck = await new Promise((resolve) => {
        senderClient.emit(
          'message:send',
          {
            threadId: activeThreadId,
            clientTempId: 'uuid-test-order-1',
            content: 'Please inspect Unit 102.',
          },
          resolve
        );
      });

      expect(sendAck.success).toBe(true);
      expect(sendAck.data.id).toBeDefined();

      const delivered = await deliveryPromise;
      expect(delivered.threadId).toBe(activeThreadId);
      expect(delivered.message.content).toBe('Please inspect Unit 102.');

      // Verify message is in DB
      const dbRows = await pool.query('SELECT * FROM chat_messages WHERE id = ?', [sendAck.data.id]);
      expect(dbRows.length).toBe(1);
      expect(dbRows[0].content).toBe('Please inspect Unit 102.');

      senderClient.disconnect();
      receiverClient.disconnect();
    });

    test('Server enforces sender identity from token, ignoring spoofed senderId / senderRole', async () => {
      const res = await request(app)
        .post(`/api/v1/chat/threads/${activeThreadId}/messages`)
        .set('Authorization', `Bearer ${tokens.STAFF}`)
        .send({
          clientTempId: 'uuid-spoof-test',
          content: 'Legitimate staff message',
          senderId: 1, // Attempted spoof as Super Admin
          senderRole: 'SUPER_ADMIN',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.senderId).toBe(users.STAFF.id);
      expect(res.body.data.senderRole).toBe('STAFF');
    });

    test('Idempotent retry: duplicate clientTempId returns existing message without duplicate row', async () => {
      const clientTempId = 'uuid-idempotency-key-001';

      // First submission
      const res1 = await request(app)
        .post(`/api/v1/chat/threads/${activeThreadId}/messages`)
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ clientTempId, content: 'Idempotency test message' });
      expect(res1.status).toBe(201);
      const firstMsgId = res1.body.data.id;

      // Duplicate submission by same sender
      const res2 = await request(app)
        .post(`/api/v1/chat/threads/${activeThreadId}/messages`)
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ clientTempId, content: 'Idempotency test message' });
      expect(res2.status).toBe(201);
      expect(res2.body.data.id).toBe(firstMsgId);
      expect(res2.body.data.idempotentReplay).toBe(true);

      // Verify DB row count for this temp ID is strictly 1
      const countRows = await pool.query(
        'SELECT COUNT(*) as cnt FROM chat_messages WHERE thread_id = ? AND client_temp_id = ?',
        [activeThreadId, clientTempId]
      );
      expect(countRows[0].cnt).toBe(1);
    });

    test('Client temp ID collision across different senders is REJECTED (HTTP 409 Conflict)', async () => {
      const clientTempId = 'shared-temp-id-attack';

      // Manager sends with this ID
      await request(app)
        .post(`/api/v1/chat/threads/${activeThreadId}/messages`)
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ clientTempId, content: 'Manager original' });

      // Staff tries to send with colliding temp ID
      const res = await request(app)
        .post(`/api/v1/chat/threads/${activeThreadId}/messages`)
        .set('Authorization', `Bearer ${tokens.STAFF}`)
        .send({ clientTempId, content: 'Staff collision attempt' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  // ==========================================================================
  // 7. Read-State Architecture & Monotonic Watermarks
  // ==========================================================================
  describe('7. Read-State Architecture & Monotonic Watermarks', () => {
    let testThreadId;
    let msg1Id;
    let msg2Id;
    let msg3Id;

    beforeAll(async () => {
      const tRes = await request(app)
        .post('/api/v1/chat/threads/direct')
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ targetUserId: users.RECEPTIONIST.id });
      testThreadId = tRes.body.data.id;
      createdThreadIds.push(testThreadId);

      // Manager sends 3 messages
      const m1 = await request(app)
        .post(`/api/v1/chat/threads/${testThreadId}/messages`)
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ content: 'Msg 1' });
      msg1Id = m1.body.data.id;

      const m2 = await request(app)
        .post(`/api/v1/chat/threads/${testThreadId}/messages`)
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ content: 'Msg 2' });
      msg2Id = m2.body.data.id;

      const m3 = await request(app)
        .post(`/api/v1/chat/threads/${testThreadId}/messages`)
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ content: 'Msg 3' });
      msg3Id = m3.body.data.id;
    });

    test('Cross-thread message ID read update is strictly REJECTED (HTTP 404)', async () => {
      const res = await request(app)
        .post(`/api/v1/chat/threads/${testThreadId}/read`)
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`)
        .send({ messageId: 9999999 });

      expect(res.status).toBe(404);
    });

    test('Monotonic watermark advances when reading newer message (msg2)', async () => {
      const res = await request(app)
        .post(`/api/v1/chat/threads/${testThreadId}/read`)
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`)
        .send({ messageId: msg2Id });

      expect(res.status).toBe(200);

      const part = await pool.query(
        'SELECT last_read_message_id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ?',
        [testThreadId, users.RECEPTIONIST.id]
      );
      expect(part[0].last_read_message_id).toBe(msg2Id);
    });

    test('Monotonic watermark DOES NOT REGRESS when older message (msg1) is acknowledged', async () => {
      const res = await request(app)
        .post(`/api/v1/chat/threads/${testThreadId}/read`)
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`)
        .send({ messageId: msg1Id });

      expect(res.status).toBe(200);

      // Watermark must remain at msg2Id, not regress to msg1Id
      const part = await pool.query(
        'SELECT last_read_message_id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ?',
        [testThreadId, users.RECEPTIONIST.id]
      );
      expect(part[0].last_read_message_id).toBe(msg2Id);
    });

    test('Unread count correctly reflects unread delta (1 remaining unread: msg3)', async () => {
      const res = await request(app)
        .get('/api/v1/chat/threads')
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`);

      expect(res.status).toBe(200);
      const targetThread = res.body.data.find((t) => t.id === testThreadId);
      expect(targetThread).toBeDefined();
      expect(targetThread.unreadCount).toBe(1);
    });
  });

  // ==========================================================================
  // 8. Participant Rejoining & Reconnection Synchronization
  // ==========================================================================
  describe('8. Participant Reactivation & Reconnect Synchronization', () => {
    let teamThreadId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/channel')
        .set('Authorization', `Bearer ${tokens.MANAGER}`)
        .send({ propertyId: 1, title: 'Operations Rejoin Test Channel' });
      teamThreadId = res.body.data.id;
      createdThreadIds.push(teamThreadId);
    });

    test('Participant departure soft-removes via left_at; rejoining reactivates without duplicate error', async () => {
      // 1. Soft-remove receptionist
      await pool.query(
        'UPDATE chat_thread_participants SET left_at = CURRENT_TIMESTAMP WHERE thread_id = ? AND user_id = ?',
        [teamThreadId, users.RECEPTIONIST.id]
      );

      // Verify left_at is set
      const partBefore = await pool.query(
        'SELECT left_at FROM chat_thread_participants WHERE thread_id = ? AND user_id = ?',
        [teamThreadId, users.RECEPTIONIST.id]
      );
      expect(partBefore[0].left_at).not.toBeNull();

      // 2. Receptionist visits thread again (auto-reactivate)
      const res = await request(app)
        .get(`/api/v1/chat/threads/${teamThreadId}`)
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`);
      expect(res.status).toBe(200);

      // Verify left_at is cleared and row count is strictly 1
      const partAfter = await pool.query(
        'SELECT id, left_at FROM chat_thread_participants WHERE thread_id = ? AND user_id = ?',
        [teamThreadId, users.RECEPTIONIST.id]
      );
      expect(partAfter.length).toBe(1);
      expect(partAfter[0].left_at).toBeNull();
    });

    test('thread:sync recovers missed messages since lastReceivedMessageId', async () => {
      const client = await connectSocketAsync(tokens.RECEPTIONIST);
      const syncAck = await new Promise((resolve) => {
        client.emit(
          'thread:sync',
          { threadId: teamThreadId, lastReceivedMessageId: 0 },
          resolve
        );
      });
      expect(syncAck.success).toBe(true);
      expect(Array.isArray(syncAck.data.missedMessages)).toBe(true);
      client.disconnect();
    });
  });

  // ==========================================================================
  // 9. System Broadcast Controls & Governance
  // ==========================================================================
  describe('9. System Broadcast Creation & Governance Controls', () => {
    test('SUPER_ADMIN can publish system broadcast', async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/broadcast')
        .set('Authorization', `Bearer ${tokens.SUPER_ADMIN}`)
        .send({
          title: 'Emergency Generator Maintenance Notice',
          content: 'Power will switch to backup generators from 2 AM to 4 AM.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.threadId).toBeDefined();
      createdThreadIds.push(res.body.data.threadId);
    });

    test('STAFF role CANNOT publish system broadcast (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/chat/threads/broadcast')
        .set('Authorization', `Bearer ${tokens.STAFF}`)
        .send({
          title: 'Unauthorized broadcast',
          content: 'This should be blocked',
        });

      expect(res.status).toBe(403);
    });

    test('RECEPTIONIST role can discover active broadcast in thread list', async () => {
      const res = await request(app)
        .get('/api/v1/chat/threads')
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`);

      expect(res.status).toBe(200);
      const broadcasts = res.body.data.filter((t) => t.threadType === 'SYSTEM_BROADCAST');
      expect(broadcasts.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 10. Context Entity Link Preview Resolution & Property Scoping
  // ==========================================================================
  describe('10. Contextual Record Previews & Scoping Controls', () => {
    test('Staff can preview reservation belonging to their assigned property', async () => {
      const resRows = await pool.query(
        'SELECT id, reservation_code FROM reservations WHERE property_id = 1 LIMIT 1'
      );
      if (resRows.length > 0) {
        const resId = resRows[0].id;
        const res = await request(app)
          .get(`/api/v1/chat/context-preview?type=RESERVATION&id=${resId}`)
          .set('Authorization', `Bearer ${tokens.STAFF}`); // Staff at Prop 1

        expect(res.status).toBe(200);
        expect(res.body.data.entityType).toBe('RESERVATION');
        expect(res.body.data.entityId).toBe(resId);
        expect(res.body.data.title).toContain('Reservation');
      }
    });

    test('Staff CANNOT preview reservation belonging to another property (HTTP 403)', async () => {
      const resRows = await pool.query(
        'SELECT id, reservation_code FROM reservations WHERE property_id = 2 LIMIT 1'
      );
      if (resRows.length > 0) {
        const resId = resRows[0].id;
        const res = await request(app)
          .get(`/api/v1/chat/context-preview?type=RESERVATION&id=${resId}`)
          .set('Authorization', `Bearer ${tokens.STAFF}`); // Staff at Prop 1

        expect(res.status).toBe(403);
        expect(res.body.error.message).toContain('another property is denied');
      }
    });
  });
});
