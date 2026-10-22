const crypto = require('crypto');
const pool = require('../../db/pool');
const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');

const ELIGIBLE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF'];

/**
 * Pure helper to compute deterministic canonical SHA-256 hash for 1-to-1 direct messaging.
 * direct_hash = SHA256(LEAST(u1, u2) + ":" + GREATEST(u1, u2))
 */
function getCanonicalDirectHash(userIdA, userIdB) {
  const u1 = Math.min(Number(userIdA), Number(userIdB));
  const u2 = Math.max(Number(userIdA), Number(userIdB));
  return crypto.createHash('sha256').update(`${u1}:${u2}`).digest('hex');
}

/**
 * Check mutual operational scope intersection between two users per Section 7.1.2 of the specification:
 * - Both must have status = 'ACTIVE' and role in ELIGIBLE_ROLES.
 * - If either is SUPER_ADMIN or ADMIN -> GRANTED.
 * - If userA is MANAGER with property_id IS NULL (global manager) -> GRANTED.
 * - If both have property_id != NULL -> GRANTED iff userA.property_id === userB.property_id.
 * - Otherwise -> DENIED.
 */
function hasSharedScope(userA, userB) {
  if (!userA || !userB) return false;
  const roleA = (userA.role || '').toUpperCase();
  const roleB = (userB.role || '').toUpperCase();

  if (!ELIGIBLE_ROLES.includes(roleA) || !ELIGIBLE_ROLES.includes(roleB)) {
    return false;
  }
  if (userA.status !== 'ACTIVE' || userB.status !== 'ACTIVE') {
    return false;
  }

  // Global administrative roles have universal internal staff access
  if (['SUPER_ADMIN', 'ADMIN'].includes(roleA) || ['SUPER_ADMIN', 'ADMIN'].includes(roleB)) {
    return true;
  }

  // Global manager (property_id IS NULL) has universal staff access
  if (roleA === 'MANAGER' && !userA.property_id) {
    return true;
  }
  if (roleB === 'MANAGER' && !userB.property_id) {
    return true;
  }

  // Property-scoped staff must share the same property_id
  if (userA.property_id && userB.property_id) {
    return Number(userA.property_id) === Number(userB.property_id);
  }

  return false;
}

class ChatRepository {
  /**
   * Compute deterministic direct hash
   */
  static getDirectHash(userIdA, userIdB) {
    return getCanonicalDirectHash(userIdA, userIdB);
  }

  /**
   * Verify whether two users share operational scope
   */
  static checkSharedScope(userA, userB) {
    return hasSharedScope(userA, userB);
  }

  /**
   * Find eligible staff contacts sharing scope with current user
   */
  static async getEligibleStaff({ userId, role, propertyId, search = null }) {
    const userRole = (role || '').toUpperCase();
    if (!ELIGIBLE_ROLES.includes(userRole)) {
      throw new ForbiddenError(`Role '${userRole}' is not authorized to access internal chat.`);
    }

    // Load active staff members excluding caller
    let sql = `
      SELECT u.id, u.name, u.email, u.role, u.property_id AS propertyId, p.name AS propertyName
      FROM users u
      LEFT JOIN properties p ON u.property_id = p.id
      WHERE u.status = 'ACTIVE'
        AND u.role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF')
        AND u.id != ?
    `;
    const params = [userId];

    if (search && search.trim()) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    sql += ' ORDER BY u.name ASC';
    const rows = await pool.query(sql, params);

    const currentUser = { id: userId, role: userRole, property_id: propertyId, status: 'ACTIVE' };

    // Filter by shared scope intersection
    const filtered = rows.filter((candidate) => {
      return hasSharedScope(currentUser, {
        id: candidate.id,
        role: candidate.role,
        property_id: candidate.propertyId,
        status: 'ACTIVE',
      });
    });

    // Check for existing direct thread for each contact
    const enriched = await Promise.all(
      filtered.map(async (contact) => {
        const hash = getCanonicalDirectHash(userId, contact.id);
        const [threadRow] = await pool.query(
          'SELECT id FROM chat_threads WHERE thread_type = "DIRECT" AND direct_hash = ? LIMIT 1',
          [hash]
        );
        return {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          role: contact.role,
          propertyId: contact.propertyId,
          propertyName: contact.propertyName || 'Global Headquarters',
          existingThreadId: threadRow?.id || null,
        };
      })
    );

    return enriched;
  }

  /**
   * Find or create direct 1-to-1 thread transactionally.
   * Guarantees exact 2-participant invariant and handles participant reactivation.
   */
  static async findOrCreateDirectThread(creatorId, targetUserId) {
    const cId = Number(creatorId);
    const tId = Number(targetUserId);

    if (cId === tId) {
      throw new BadRequestError('Cannot create a direct chat thread with oneself.');
    }

    // Fetch both users to verify eligibility and shared scope
    const [creator] = await pool.query(
      'SELECT id, name, email, role, property_id, status FROM users WHERE id = ? LIMIT 1',
      [cId]
    );
    const [target] = await pool.query(
      'SELECT id, name, email, role, property_id, status FROM users WHERE id = ? LIMIT 1',
      [tId]
    );

    if (!creator || creator.status !== 'ACTIVE') {
      throw new UnauthorizedError('Initiating user account is inactive or not found.');
    }
    if (!target || target.status !== 'ACTIVE') {
      throw new NotFoundError('Target staff member is inactive or does not exist.');
    }

    if (!hasSharedScope(creator, target)) {
      throw new ForbiddenError(
        'Direct messaging denied: Staff members do not share property or operational scope.'
      );
    }

    const hash = getCanonicalDirectHash(cId, tId);

    return pool.withTransaction(async (conn) => {
      // 1. Check if thread already exists
      const [existingThreads] = await conn.query(
        'SELECT * FROM chat_threads WHERE thread_type = "DIRECT" AND direct_hash = ? FOR UPDATE',
        [hash]
      );

      let threadId;
      let thread;

      if (existingThreads.length > 0) {
        thread = existingThreads[0];
        threadId = thread.id;

        // Reactivate participants if left_at was set
        await conn.query(
          `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at, left_at)
           VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP, NULL)
           ON DUPLICATE KEY UPDATE joined_at = CURRENT_TIMESTAMP, left_at = NULL`,
          [threadId, cId]
        );
        await conn.query(
          `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at, left_at)
           VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP, NULL)
           ON DUPLICATE KEY UPDATE joined_at = CURRENT_TIMESTAMP, left_at = NULL`,
          [threadId, tId]
        );
      } else {
        // Create new direct thread
        const [insertThread] = await conn.query(
          `INSERT INTO chat_threads (thread_type, property_id, title, created_by, direct_hash, status)
           VALUES ('DIRECT', NULL, ?, ?, ?, 'ACTIVE')`,
          [`${creator.name} & ${target.name}`, cId, hash]
        );
        threadId = insertThread.insertId;

        // Transactionally enroll EXACTLY two participants
        await conn.query(
          `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
           VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP), (?, ?, 'MEMBER', CURRENT_TIMESTAMP)`,
          [threadId, cId, threadId, tId]
        );

        const [createdThreads] = await conn.query('SELECT * FROM chat_threads WHERE id = ?', [threadId]);
        thread = createdThreads[0];
      }

      // Fetch participants
      const [participants] = await conn.query(
        `SELECT p.id, p.user_id AS userId, p.role, p.last_read_message_id AS lastReadMessageId,
                u.name, u.email, u.role AS userRole, u.property_id AS propertyId
         FROM chat_thread_participants p
         JOIN users u ON p.user_id = u.id
         WHERE p.thread_id = ? AND p.left_at IS NULL`,
        [threadId]
      );

      return {
        ...thread,
        participants,
      };
    });
  }

  /**
   * Create property-scoped team channel (Admin / Manager only)
   */
  static async createPropertyChannel(creatorUser, propertyId, title) {
    const creatorRole = (creatorUser.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(creatorRole)) {
      throw new ForbiddenError('Only Administrators and Managers can create property team channels.');
    }

    const propId = Number(propertyId);
    if (!propId || isNaN(propId)) {
      throw new BadRequestError('A valid propertyId is required for team channels.');
    }

    // Property Managers can only create channels for their assigned property
    if (creatorRole === 'MANAGER' && creatorUser.propertyId && Number(creatorUser.propertyId) !== propId) {
      throw new ForbiddenError('Managers can only create channels for their assigned property.');
    }

    const [prop] = await pool.query('SELECT id, name FROM properties WHERE id = ? AND status = "ACTIVE"', [propId]);
    if (!prop) {
      throw new NotFoundError(`Property #${propId} not found or inactive.`);
    }

    const channelTitle = (title || `${prop.name} - Team Channel`).trim();

    return pool.withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO chat_threads (thread_type, property_id, title, created_by, status)
         VALUES ('PROPERTY_CHANNEL', ?, ?, ?, 'ACTIVE')`,
        [propId, channelTitle, creatorUser.id]
      );
      const threadId = result.insertId;

      // Enroll creator as ADMIN
      await conn.query(
        `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
         VALUES (?, ?, 'ADMIN', CURRENT_TIMESTAMP)`,
        [threadId, creatorUser.id]
      );

      // Auto-enroll active operational staff assigned to this property
      const [staffMembers] = await conn.query(
        `SELECT id FROM users
         WHERE property_id = ?
           AND status = 'ACTIVE'
           AND role IN ('MANAGER', 'RECEPTIONIST', 'STAFF')
           AND id != ?`,
        [propId, creatorUser.id]
      );

      for (const staff of staffMembers) {
        await conn.query(
          `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
           VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE left_at = NULL`,
          [threadId, staff.id]
        );
      }

      const [created] = await conn.query('SELECT * FROM chat_threads WHERE id = ?', [threadId]);
      return created[0];
    });
  }

  /**
   * Create system broadcast thread (SUPER_ADMIN and ADMIN only)
   */
  static async createSystemBroadcast(creatorUser, title, content) {
    const creatorRole = (creatorUser.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(creatorRole)) {
      throw new ForbiddenError('Only Super Administrators and Administrators can issue system broadcasts.');
    }

    const broadcastTitle = (title || 'System Operational Broadcast').trim();
    const cleanContent = (content || '').trim();
    if (!cleanContent) {
      throw new BadRequestError('Broadcast content cannot be empty.');
    }

    return pool.withTransaction(async (conn) => {
      const [tResult] = await conn.query(
        `INSERT INTO chat_threads (thread_type, property_id, title, created_by, status)
         VALUES ('SYSTEM_BROADCAST', NULL, ?, ?, 'ACTIVE')`,
        [broadcastTitle, creatorUser.id]
      );
      const threadId = tResult.insertId;

      // Creator enrolled as ADMIN
      await conn.query(
        `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
         VALUES (?, ?, 'ADMIN', CURRENT_TIMESTAMP)`,
        [threadId, creatorUser.id]
      );

      // Persist broadcast message
      const clientTempId = crypto.randomUUID();
      const [mResult] = await conn.query(
        `INSERT INTO chat_messages (thread_id, sender_id, client_temp_id, message_type, content)
         VALUES (?, ?, ?, 'SYSTEM_NOTICE', ?)`,
        [threadId, creatorUser.id, clientTempId, cleanContent]
      );
      const messageId = mResult.insertId;

      // Update thread last_message_at
      await conn.query('UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [threadId]);

      return {
        threadId,
        messageId,
        title: broadcastTitle,
        content: cleanContent,
        createdAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Retrieve all active conversation threads authorized for the user,
   * including unread counts and last message details.
   */
  static async getUserThreads(userId, role, propertyId) {
    const userRole = (role || '').toUpperCase();
    const uId = Number(userId);

    // Threads where user is participant, or property channel of user's property, or system broadcast
    const sql = `
      SELECT DISTINCT t.id, t.thread_type AS threadType, t.property_id AS propertyId,
             t.title, t.status, t.last_message_at AS lastMessageAt, t.created_at AS createdAt,
             p.last_read_message_id AS lastReadMessageId,
             prop.name AS propertyName
      FROM chat_threads t
      LEFT JOIN chat_thread_participants p ON t.id = p.thread_id AND p.user_id = ? AND p.left_at IS NULL
      LEFT JOIN properties prop ON t.property_id = prop.id
      WHERE t.status = 'ACTIVE'
        AND (
          p.id IS NOT NULL
          OR t.thread_type = 'SYSTEM_BROADCAST'
          OR (t.thread_type = 'PROPERTY_CHANNEL' AND t.property_id = ?)
          OR (t.thread_type = 'PROPERTY_CHANNEL' AND ? IN ('SUPER_ADMIN', 'ADMIN'))
        )
      ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
    `;

    const threads = await pool.query(sql, [uId, propertyId || null, userRole]);

    // Enrich each thread with unread count, last message, and other participant name if DIRECT
    const enriched = await Promise.all(
      threads.map(async (th) => {
        // Calculate authoritative unread count
        const [unreadRow] = await pool.query(
          `SELECT COUNT(*) AS unreadCount
           FROM chat_messages
           WHERE thread_id = ?
             AND id > COALESCE(?, 0)
             AND is_deleted = 0
             AND (sender_id IS NULL OR sender_id != ?)`,
          [th.id, th.lastReadMessageId || 0, uId]
        );

        // Fetch last message
        const [lastMsg] = await pool.query(
          `SELECT m.id, m.content, m.created_at AS createdAt, m.is_deleted AS isDeleted,
                  u.name AS senderName, u.role AS senderRole
           FROM chat_messages m
           LEFT JOIN users u ON m.sender_id = u.id
           WHERE m.thread_id = ?
           ORDER BY m.id DESC LIMIT 1`,
          [th.id]
        );

        let displayTitle = th.title;
        let otherParticipant = null;

        if (th.threadType === 'DIRECT') {
          const [other] = await pool.query(
            `SELECT u.id, u.name, u.email, u.role, u.property_id AS propertyId
             FROM chat_thread_participants p
             JOIN users u ON p.user_id = u.id
             WHERE p.thread_id = ? AND p.user_id != ? AND p.left_at IS NULL
             LIMIT 1`,
            [th.id, uId]
          );
          if (other) {
            displayTitle = other.name;
            otherParticipant = other;
          }
        }

        return {
          id: th.id,
          threadType: th.threadType,
          propertyId: th.propertyId,
          propertyName: th.propertyName || (th.propertyId ? `Property #${th.propertyId}` : null),
          title: displayTitle,
          unreadCount: parseInt(unreadRow?.unreadCount || 0, 10),
          lastReadMessageId: th.lastReadMessageId || null,
          otherParticipant,
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                content: lastMsg.isDeleted ? 'This message was deleted' : lastMsg.content,
                senderName: lastMsg.senderName,
                senderRole: lastMsg.senderRole,
                createdAt: lastMsg.createdAt,
              }
            : null,
        };
      })
    );

    return enriched;
  }

  /**
   * Get thread by ID and verify user authorization
   */
  static async getThreadById(threadId, userId, role, propertyId) {
    const tId = Number(threadId);
    const uId = Number(userId);
    const userRole = (role || '').toUpperCase();

    const [thread] = await pool.query('SELECT * FROM chat_threads WHERE id = ?', [tId]);
    if (!thread) {
      throw new NotFoundError(`Chat thread #${tId} not found.`);
    }

    // Check membership
    const [membership] = await pool.query(
      'SELECT * FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? AND left_at IS NULL',
      [tId, uId]
    );

    let isAuthorized = Boolean(membership);

    // If channel or broadcast, check if role or property allows joining
    if (!isAuthorized) {
      if (thread.thread_type === 'SYSTEM_BROADCAST' && ELIGIBLE_ROLES.includes(userRole)) {
        isAuthorized = true;
      } else if (
        thread.thread_type === 'PROPERTY_CHANNEL' &&
        (['SUPER_ADMIN', 'ADMIN'].includes(userRole) || (propertyId && Number(thread.property_id) === Number(propertyId)))
      ) {
        isAuthorized = true;
      }

      // If authorized, auto-enroll user into participants
      if (isAuthorized) {
        await pool.query(
          `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
           VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE left_at = NULL`,
          [tId, uId]
        );
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenError(`You are not authorized to access conversation thread #${tId}.`);
    }

    return thread;
  }

  /**
   * Fetch paginated message history with cursor-based pagination
   */
  static async getThreadHistory(threadId, userId, beforeCursor = null, limit = 30) {
    const tId = Number(threadId);
    const uId = Number(userId);
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));

    // Ensure user is authorized participant
    const [part] = await pool.query(
      'SELECT id, last_read_message_id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? AND left_at IS NULL',
      [tId, uId]
    );
    if (!part) {
      throw new ForbiddenError(`Access denied: You are not an active participant in thread #${tId}.`);
    }

    let sql = `
      SELECT m.id, m.thread_id AS threadId, m.sender_id AS senderId,
             m.client_temp_id AS clientTempId, m.message_type AS messageType,
             m.content, m.context_entity_type AS contextEntityType,
             m.context_entity_id AS contextEntityId, m.is_edited AS isEdited,
             m.is_deleted AS isDeleted, m.created_at AS createdAt,
             u.name AS senderName, u.role AS senderRole
      FROM chat_messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.thread_id = ?
    `;
    const params = [tId];

    if (beforeCursor && !isNaN(parseInt(beforeCursor, 10))) {
      sql += ' AND m.id < ?';
      params.push(parseInt(beforeCursor, 10));
    }

    sql += ' ORDER BY m.id DESC LIMIT ?';
    params.push(pageLimit + 1);

    const rows = await pool.query(sql, params);
    const hasMore = rows.length > pageLimit;
    const sliced = hasMore ? rows.slice(0, pageLimit) : rows;

    // Sanitize soft-deleted messages
    const formatted = sliced.map((msg) => ({
      id: msg.id,
      threadId: msg.threadId,
      sender: {
        id: msg.senderId,
        name: msg.senderName || 'System',
        role: msg.senderRole || 'STAFF',
      },
      messageType: msg.messageType,
      content: msg.isDeleted ? 'This message was deleted' : msg.content,
      contextEntity: msg.contextEntityType
        ? {
            type: msg.contextEntityType,
            id: msg.contextEntityId,
          }
        : null,
      isEdited: Boolean(msg.isEdited),
      isDeleted: Boolean(msg.isDeleted),
      createdAt: msg.createdAt,
    }));

    // Return in chronological order (ASC)
    formatted.reverse();

    return {
      messages: formatted,
      pagination: {
        limit: pageLimit,
        hasMore,
        oldestId: formatted.length > 0 ? formatted[0].id : null,
      },
    };
  }

  /**
   * Persist message transactionally with submission idempotency.
   * Enforces UNIQUE(thread_id, client_temp_id) without leaking data.
   */
  static async persistMessage({
    threadId,
    senderId,
    senderRole,
    clientTempId,
    messageType = 'TEXT',
    content,
    contextEntityType = null,
    contextEntityId = null,
  }) {
    const tId = Number(threadId);
    const sId = Number(senderId);

    // Verify sender is active participant in thread
    const [part] = await pool.query(
      'SELECT id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? AND left_at IS NULL',
      [tId, sId]
    );
    if (!part) {
      throw new ForbiddenError(`You are not an active participant in thread #${tId}.`);
    }

    const cleanContent = (content || '').trim();
    if (!cleanContent) {
      throw new BadRequestError('Message content cannot be empty.');
    }
    if (cleanContent.length > 2000) {
      throw new BadRequestError('Message content exceeds maximum allowed length of 2000 characters.');
    }

    const tempId = clientTempId ? String(clientTempId).trim() : crypto.randomUUID();

    return pool.withTransaction(async (conn) => {
      // 1. Check idempotency: does client_temp_id already exist in this thread?
      const [existing] = await conn.query(
        'SELECT * FROM chat_messages WHERE thread_id = ? AND client_temp_id = ? LIMIT 1',
        [tId, tempId]
      );

      if (existing.length > 0) {
        const prev = existing[0];
        // If same sender retry, return existing message idempotently
        if (Number(prev.sender_id) === sId) {
          const [sender] = await conn.query('SELECT name, role FROM users WHERE id = ?', [sId]);
          return {
            id: prev.id,
            threadId: prev.thread_id,
            clientTempId: prev.client_temp_id,
            senderId: prev.sender_id,
            senderName: sender?.name || 'Staff',
            senderRole: sender?.role || senderRole,
            messageType: prev.message_type,
            content: prev.content,
            contextEntityType: prev.context_entity_type,
            contextEntityId: prev.context_entity_id,
            isEdited: Boolean(prev.is_edited),
            isDeleted: Boolean(prev.is_deleted),
            createdAt: prev.created_at,
            idempotentReplay: true,
          };
        } else {
          // Different sender tried to use existing clientTempId
          throw new ConflictError('Duplicate client_temp_id detected for another participant.');
        }
      }

      // 2. Insert new message
      const [result] = await conn.query(
        `INSERT INTO chat_messages (
           thread_id, sender_id, client_temp_id, message_type, content,
           context_entity_type, context_entity_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tId, sId, tempId, messageType, cleanContent, contextEntityType || null, contextEntityId || null]
      );
      const messageId = result.insertId;

      // 3. Update thread last_message_at
      await conn.query('UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [tId]);

      // 4. Update sender's read watermark to this message
      await conn.query(
        `UPDATE chat_thread_participants
         SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?),
             last_read_at = CURRENT_TIMESTAMP
         WHERE thread_id = ? AND user_id = ?`,
        [messageId, tId, sId]
      );

      // 5. For DIRECT thread, insert message delivery receipt for other participant
      const [threadRow] = await conn.query('SELECT thread_type FROM chat_threads WHERE id = ?', [tId]);
      if (threadRow && threadRow.thread_type === 'DIRECT') {
        const [other] = await conn.query(
          'SELECT user_id FROM chat_thread_participants WHERE thread_id = ? AND user_id != ? AND left_at IS NULL LIMIT 1',
          [tId, sId]
        );
        if (other) {
          await conn.query(
            `INSERT INTO chat_message_receipts (message_id, user_id, status)
             VALUES (?, ?, 'SENT')
             ON DUPLICATE KEY UPDATE status = VALUES(status)`,
            [messageId, other.user_id]
          );
        }
      }

      const [sender] = await conn.query('SELECT name, role FROM users WHERE id = ?', [sId]);
      const [saved] = await conn.query('SELECT created_at FROM chat_messages WHERE id = ?', [messageId]);

      return {
        id: messageId,
        threadId: tId,
        clientTempId: tempId,
        senderId: sId,
        senderName: sender?.name || 'Staff',
        senderRole: sender?.role || senderRole,
        messageType,
        content: cleanContent,
        contextEntityType,
        contextEntityId,
        isEdited: false,
        isDeleted: false,
        createdAt: saved[0]?.created_at || new Date().toISOString(),
        idempotentReplay: false,
      };
    });
  }

  /**
   * Update read watermark monotonically and update direct-message receipts
   */
  static async updateReadWatermark(threadId, userId, messageId) {
    const tId = Number(threadId);
    const uId = Number(userId);
    const mId = Number(messageId);

    // Verify message exists and belongs to the thread
    const [msg] = await pool.query('SELECT id, thread_id FROM chat_messages WHERE id = ? LIMIT 1', [mId]);
    if (!msg) {
      throw new NotFoundError(`Message #${mId} does not exist.`);
    }
    if (Number(msg.thread_id) !== tId) {
      throw new BadRequestError(`Message #${mId} does not belong to thread #${tId}.`);
    }

    // Verify user is active participant
    const [part] = await pool.query(
      'SELECT id, last_read_message_id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? AND left_at IS NULL',
      [tId, uId]
    );
    if (!part) {
      throw new ForbiddenError(`You are not an active participant in thread #${tId}.`);
    }

    return pool.withTransaction(async (conn) => {
      // Update monotonic watermark
      await conn.query(
        `UPDATE chat_thread_participants
         SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?),
             last_read_at = CURRENT_TIMESTAMP
         WHERE thread_id = ? AND user_id = ?`,
        [mId, tId, uId]
      );

      // If DIRECT thread, update receipt status to READ
      await conn.query(
        `UPDATE chat_message_receipts
         SET status = 'READ', read_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND message_id <= ? AND status != 'READ'`,
        [uId, mId]
      );

      return {
        success: true,
        threadId: tId,
        userId: uId,
        lastReadMessageId: mId,
      };
    });
  }

  /**
   * Soft-delete message (Sender or Moderator)
   */
  static async softDeleteMessage(messageId, userId, userRole) {
    const mId = Number(messageId);
    const uId = Number(userId);
    const role = (userRole || '').toUpperCase();

    const [msg] = await pool.query('SELECT * FROM chat_messages WHERE id = ?', [mId]);
    if (!msg) {
      throw new NotFoundError(`Message #${mId} not found.`);
    }

    const isAuthor = Number(msg.sender_id) === uId;
    const isModerator = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role);

    if (!isAuthor && !isModerator) {
      throw new ForbiddenError('You are not authorized to delete or moderate this message.');
    }

    await pool.query(
      `UPDATE chat_messages
       SET is_deleted = 1, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [uId, mId]
    );

    return {
      id: mId,
      threadId: msg.thread_id,
      isDeleted: true,
      deletedBy: uId,
    };
  }

  /**
   * Retention Policy Queries (Admin Only)
   */
  static async getRetentionPolicy(propertyId = null) {
    const propId = propertyId ? Number(propertyId) : null;
    let sql = 'SELECT * FROM chat_retention_policies WHERE property_id <=> ? LIMIT 1';
    let [policy] = await pool.query(sql, [propId]);

    if (!policy) {
      // Fallback to global default (property_id IS NULL)
      [policy] = await pool.query('SELECT * FROM chat_retention_policies WHERE property_id IS NULL LIMIT 1');
    }

    return policy || { retention_days: 0, archival_mode: 'INDEFINITE_ACTIVE', is_active: 1 };
  }

  static async updateRetentionPolicy(propertyId, retentionDays, updatedBy) {
    const days = Math.max(0, parseInt(retentionDays, 10) || 0);
    const propId = propertyId ? Number(propertyId) : null;

    await pool.query(
      `INSERT INTO chat_retention_policies (property_id, retention_days, archival_mode, is_active, updated_by)
       VALUES (?, ?, 'INDEFINITE_ACTIVE', 1, ?)
       ON DUPLICATE KEY UPDATE retention_days = VALUES(retention_days), updated_by = VALUES(updated_by)`,
      [propId, days, updatedBy]
    );

    return ChatRepository.getRetentionPolicy(propId);
  }
}

module.exports = ChatRepository;
