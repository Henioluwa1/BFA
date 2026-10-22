const pool = require('../src/db/pool');

describe('Phase 4 WP-4.1: Internal Chat Foundation & Database Schema Validation Suite', () => {
  let testThreadId = null;
  let testMessageId = null;
  const testUserId1 = 1; // Super Admin (seeded in 004)
  const testUserId2 = 2; // Admin (seeded in 004)
  const testUserId3 = 4; // Receptionist (seeded in 004)

  beforeAll(async () => {
    // Verify database connectivity
    await pool.query('SELECT 1;');
  });

  afterAll(async () => {
    // Clean up test data in reverse foreign-key order
    if (testMessageId) {
      await pool.query('DELETE FROM chat_message_receipts WHERE message_id = ?', [testMessageId]);
      await pool.query('DELETE FROM chat_messages WHERE id = ?', [testMessageId]);
    }
    if (testThreadId) {
      await pool.query('DELETE FROM chat_messages WHERE thread_id = ?', [testThreadId]);
      await pool.query('DELETE FROM chat_thread_participants WHERE thread_id = ?', [testThreadId]);
      await pool.query('DELETE FROM chat_threads WHERE id = ?', [testThreadId]);
    }
    await pool.query("DELETE FROM chat_threads WHERE direct_hash LIKE 'test-hash-%'");
    await pool.query('DELETE FROM chat_retention_policies WHERE property_id = 9999');
    await pool.closePool();
  });

  describe('1. Migration Discovery and Table Existence', () => {
    it('verifies 018_create_internal_chat_tables.sql is registered in schema_migrations', async () => {
      const rows = await pool.query(
        "SELECT migration_name, batch, executed_at FROM schema_migrations WHERE migration_name = '018_create_internal_chat_tables.sql';"
      );
      expect(rows.length).toBe(1);
      expect(rows[0].migration_name).toBe('018_create_internal_chat_tables.sql');
    });

    it('verifies all 5 chat tables exist with InnoDB engine and utf8mb4 collation', async () => {
      const expectedTables = [
        'chat_threads',
        'chat_thread_participants',
        'chat_messages',
        'chat_message_receipts',
        'chat_retention_policies',
      ];

      for (const table of expectedTables) {
        const rows = await pool.query(
          `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION 
           FROM information_schema.TABLES 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?;`,
          [table]
        );
        expect(rows.length).toBe(1);
        expect(rows[0].ENGINE.toUpperCase()).toBe('INNODB');
        expect(rows[0].TABLE_COLLATION).toMatch(/^utf8mb4/);
      }
    });
  });

  describe('2. Direct-Thread Deduplication & Uniqueness Constraints', () => {
    it('successfully creates a direct chat thread with a deterministic direct_hash', async () => {
      const directHash = `test-hash-${Date.now()}`;
      const res = await pool.query(
        `INSERT INTO chat_threads (thread_type, property_id, title, created_by, direct_hash, status)
         VALUES ('DIRECT', 1, 'Test Direct Conversation', ?, ?, 'ACTIVE');`,
        [testUserId1, directHash]
      );
      expect(res.insertId).toBeGreaterThan(0);
      testThreadId = res.insertId;
    });

    it('strictly REJECTS duplicate thread creation with identical direct_hash (uq_direct_hash)', async () => {
      // Fetch hash of the created thread
      const [thread] = await pool.query('SELECT direct_hash FROM chat_threads WHERE id = ?', [testThreadId]);
      
      let duplicateError = null;
      try {
        await pool.query(
          `INSERT INTO chat_threads (thread_type, property_id, title, created_by, direct_hash, status)
           VALUES ('DIRECT', 1, 'Duplicate Direct Thread', ?, ?, 'ACTIVE');`,
          [testUserId2, thread.direct_hash]
        );
      } catch (err) {
        duplicateError = err;
      }

      expect(duplicateError).not.toBeNull();
      expect(duplicateError.code).toBe('ER_DUP_ENTRY');
      expect(duplicateError.message).toMatch(/direct_hash/i);
    });
  });

  describe('3. Thread Participant Membership & Uniqueness Constraints', () => {
    it('enforces participant membership insertion', async () => {
      const res1 = await pool.query(
        `INSERT INTO chat_thread_participants (thread_id, user_id, role, last_read_message_id)
         VALUES (?, ?, 'ADMIN', NULL);`,
        [testThreadId, testUserId1]
      );
      expect(res1.insertId).toBeGreaterThan(0);

      const res2 = await pool.query(
        `INSERT INTO chat_thread_participants (thread_id, user_id, role, last_read_message_id)
         VALUES (?, ?, 'MEMBER', NULL);`,
        [testThreadId, testUserId2]
      );
      expect(res2.insertId).toBeGreaterThan(0);
    });

    it('strictly REJECTS duplicate membership for the same user in the same thread (uq_thread_user)', async () => {
      let duplicateUserError = null;
      try {
        await pool.query(
          `INSERT INTO chat_thread_participants (thread_id, user_id, role)
           VALUES (?, ?, 'MEMBER');`,
          [testThreadId, testUserId1]
        );
      } catch (err) {
        duplicateUserError = err;
      }

      expect(duplicateUserError).not.toBeNull();
      expect(duplicateUserError.code).toBe('ER_DUP_ENTRY');
      expect(duplicateUserError.message).toMatch(/uq_thread_user/i);
    });

    it('supports soft-removal via left_at timestamp without deleting participant record', async () => {
      await pool.query(
        'UPDATE chat_thread_participants SET left_at = CURRENT_TIMESTAMP WHERE thread_id = ? AND user_id = ?;',
        [testThreadId, testUserId2]
      );

      const activeMembers = await pool.query(
        'SELECT user_id FROM chat_thread_participants WHERE thread_id = ? AND left_at IS NULL;',
        [testThreadId]
      );
      expect(activeMembers.length).toBe(1);
      expect(activeMembers[0].user_id).toBe(testUserId1);

      // Re-activate member for subsequent tests
      await pool.query(
        'UPDATE chat_thread_participants SET left_at = NULL WHERE thread_id = ? AND user_id = ?;',
        [testThreadId, testUserId2]
      );
    });
  });

  describe('4. Message Persistence & Submission Idempotency', () => {
    const clientTempId = `client-uuid-${Date.now()}`;

    it('persists message with client_temp_id and timestamps', async () => {
      const res = await pool.query(
        `INSERT INTO chat_messages (thread_id, sender_id, client_temp_id, message_type, content, context_entity_type, context_entity_id)
         VALUES (?, ?, ?, 'TEXT', 'Foundation verification message.', 'RESERVATION', 1001);`,
        [testThreadId, testUserId1, clientTempId]
      );
      expect(res.insertId).toBeGreaterThan(0);
      testMessageId = res.insertId;

      const [msg] = await pool.query('SELECT * FROM chat_messages WHERE id = ?;', [testMessageId]);
      expect(msg.content).toBe('Foundation verification message.');
      expect(msg.context_entity_type).toBe('RESERVATION');
      expect(msg.context_entity_id).toBe(1001);
      expect(msg.is_deleted).toBe(0);
    });

    it('strictly REJECTS duplicate message submission with identical client_temp_id (uq_thread_client_temp)', async () => {
      let dupMessageError = null;
      try {
        await pool.query(
          `INSERT INTO chat_messages (thread_id, sender_id, client_temp_id, message_type, content)
           VALUES (?, ?, ?, 'TEXT', 'Duplicate retry message content.');`,
          [testThreadId, testUserId1, clientTempId]
        );
      } catch (err) {
        dupMessageError = err;
      }

      expect(dupMessageError).not.toBeNull();
      expect(dupMessageError.code).toBe('ER_DUP_ENTRY');
      expect(dupMessageError.message).toMatch(/uq_thread_client_temp/i);
    });
  });

  describe('5. Read-State Architecture & Monotonic Watermark Calculation', () => {
    it('updates read watermark using GREATEST to guarantee monotonic progression', async () => {
      // Step 1: Initial watermark update to message ID 10
      await pool.query(
        `UPDATE chat_thread_participants 
         SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?),
             last_read_at = CURRENT_TIMESTAMP
         WHERE thread_id = ? AND user_id = ?;`,
        [10, testThreadId, testUserId1]
      );

      let [p1] = await pool.query(
        'SELECT last_read_message_id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ?;',
        [testThreadId, testUserId1]
      );
      expect(p1.last_read_message_id).toBe(10);

      // Step 2: Forward progression to message ID 25
      await pool.query(
        `UPDATE chat_thread_participants 
         SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?),
             last_read_at = CURRENT_TIMESTAMP
         WHERE thread_id = ? AND user_id = ?;`,
        [25, testThreadId, testUserId1]
      );

      let [p2] = await pool.query(
        'SELECT last_read_message_id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ?;',
        [testThreadId, testUserId1]
      );
      expect(p2.last_read_message_id).toBe(25);

      // Step 3: Out-of-order delayed packet with older message ID 15 should NOT regress watermark
      await pool.query(
        `UPDATE chat_thread_participants 
         SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?),
             last_read_at = CURRENT_TIMESTAMP
         WHERE thread_id = ? AND user_id = ?;`,
        [15, testThreadId, testUserId1]
      );

      let [p3] = await pool.query(
        'SELECT last_read_message_id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ?;',
        [testThreadId, testUserId1]
      );
      expect(p3.last_read_message_id).toBe(25); // Watermark remained at 25!
    });

    it('calculates unread message count instantaneously using index-accelerated watermark range', async () => {
      // Reset user2's watermark to 0
      await pool.query(
        'UPDATE chat_thread_participants SET last_read_message_id = 0 WHERE thread_id = ? AND user_id = ?;',
        [testThreadId, testUserId2]
      );

      // Query unread count for user2
      const [unreadResult] = await pool.query(
        `SELECT COUNT(*) AS unread_count 
         FROM chat_messages m
         JOIN chat_thread_participants p ON m.thread_id = p.thread_id AND p.user_id = ?
         WHERE m.thread_id = ? 
           AND m.id > COALESCE(p.last_read_message_id, 0)
           AND m.is_deleted = 0;`,
        [testUserId2, testThreadId]
      );

      expect(parseInt(unreadResult.unread_count, 10)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('6. Message Receipts Uniqueness (1-to-1 DMs)', () => {
    it('creates message delivery receipt record', async () => {
      const res = await pool.query(
        `INSERT INTO chat_message_receipts (message_id, user_id, status)
         VALUES (?, ?, 'DELIVERED');`,
        [testMessageId, testUserId2]
      );
      expect(res.insertId).toBeGreaterThan(0);
    });

    it('strictly REJECTS duplicate receipt for same message and user (uq_msg_user_receipt)', async () => {
      let dupReceiptError = null;
      try {
        await pool.query(
          `INSERT INTO chat_message_receipts (message_id, user_id, status)
           VALUES (?, ?, 'READ');`,
          [testMessageId, testUserId2]
        );
      } catch (err) {
        dupReceiptError = err;
      }

      expect(dupReceiptError).not.toBeNull();
      expect(dupReceiptError.code).toBe('ER_DUP_ENTRY');
      expect(dupReceiptError.message).toMatch(/uq_msg_user_receipt/i);
    });
  });

  describe('7. Retention Governance Policy & Indefinite Safeguards', () => {
    it('verifies baseline global retention policy is seeded with retention_days = 0 (indefinite)', async () => {
      const rows = await pool.query(
        'SELECT * FROM chat_retention_policies WHERE property_id IS NULL;'
      );
      expect(rows.length).toBe(1);
      expect(rows[0].retention_days).toBe(0);
      expect(rows[0].archival_mode).toBe('INDEFINITE_ACTIVE');
      expect(rows[0].is_active).toBe(1);
    });

    it('enforces property_id uniqueness in chat_retention_policies', async () => {
      // Insert property-specific policy for property 1
      await pool.query(
        `INSERT IGNORE INTO chat_retention_policies (property_id, retention_days, archival_mode, is_active, updated_by)
         VALUES (1, 0, 'INDEFINITE_ACTIVE', 1, 1);`
      );

      let dupPolicyError = null;
      try {
        await pool.query(
          `INSERT INTO chat_retention_policies (property_id, retention_days, archival_mode, is_active, updated_by)
           VALUES (1, 30, 'SOFT_ARCHIVE', 1, 1);`
        );
      } catch (err) {
        dupPolicyError = err;
      }

      expect(dupPolicyError).not.toBeNull();
      expect(dupPolicyError.code).toBe('ER_DUP_ENTRY');

      // Clean up property 1 policy
      await pool.query('DELETE FROM chat_retention_policies WHERE property_id = 1;');
    });

    it('verifies foreign key restriction prevents accidental deletion of thread with active messages (ON DELETE RESTRICT)', async () => {
      let deleteError = null;
      try {
        await pool.query('DELETE FROM chat_threads WHERE id = ?;', [testThreadId]);
      } catch (err) {
        deleteError = err;
      }

      expect(deleteError).not.toBeNull();
      expect(deleteError.code).toBe('ER_ROW_IS_REFERENCED_2');
    });
  });
});
