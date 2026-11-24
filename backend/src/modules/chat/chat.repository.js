const crypto = require('crypto');
const path = require('path');
const pool = require('../../db/pool');
const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');

const ELIGIBLE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'OPERATIONS_MANAGER',
  'OWNER',
  'RECEPTIONIST',
  'STAFF',
];

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
 * Check mutual operational scope intersection between two users:
 * - Both must have status = 'ACTIVE' and role in ELIGIBLE_ROLES.
 * - If either is SUPER_ADMIN, ADMIN, or OWNER -> GRANTED.
 * - If userA or userB is global manager -> GRANTED.
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

  // Global administrative & executive roles have universal internal staff access
  if (
    ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(roleA) ||
    ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(roleB)
  ) {
    return true;
  }

  // Global manager (property_id IS NULL) has universal staff access
  if (['MANAGER', 'OPERATIONS_MANAGER'].includes(roleA) && !userA.property_id) {
    return true;
  }
  if (['MANAGER', 'OPERATIONS_MANAGER'].includes(roleB) && !userB.property_id) {
    return true;
  }

  // Property-scoped staff must share the same property_id
  if (userA.property_id && userB.property_id) {
    return Number(userA.property_id) === Number(userB.property_id);
  }

  // If one is property-less manager/staff within the organization
  if (['MANAGER', 'OPERATIONS_MANAGER'].includes(roleA) || ['MANAGER', 'OPERATIONS_MANAGER'].includes(roleB)) {
    return true;
  }

  return false;
}

class ChatRepository {
  static getDirectHash(userIdA, userIdB) {
    return getCanonicalDirectHash(userIdA, userIdB);
  }

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

    const placeholders = ELIGIBLE_ROLES.map(() => '?').join(', ');
    let sql = `
      SELECT u.id, u.name, u.email, u.role, u.property_id AS propertyId, p.name AS propertyName
      FROM users u
      LEFT JOIN properties p ON u.property_id = p.id
      WHERE u.status = 'ACTIVE'
        AND u.role IN (${placeholders})
        AND u.id != ?
    `;
    const params = [...ELIGIBLE_ROLES, userId];

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
          "SELECT id FROM chat_threads WHERE thread_type = 'DIRECT' AND direct_hash = ? LIMIT 1",
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
   */
  static async findOrCreateDirectThread(creatorId, targetUserId) {
    const cId = Number(creatorId);
    const tId = Number(targetUserId);

    if (cId === tId) {
      throw new BadRequestError('Cannot create a direct chat thread with oneself.');
    }

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
      throw new ForbiddenError('Direct messaging denied: Staff members do not share property or operational scope.');
    }

    const hash = getCanonicalDirectHash(cId, tId);

    return pool.withTransaction(async (conn) => {
      const [existingThreads] = await conn.query(
        "SELECT * FROM chat_threads WHERE thread_type = 'DIRECT' AND direct_hash = ? FOR UPDATE",
        [hash]
      );

      let threadId;
      let thread;

      if (existingThreads.length > 0) {
        thread = existingThreads[0];
        threadId = thread.id;

        // Reactivate participants if left_at was set
        if (pool.isPostgres()) {
          await conn.query(
            `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at, left_at)
             VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP, NULL)
             ON CONFLICT (thread_id, user_id) DO UPDATE SET left_at = NULL, joined_at = CURRENT_TIMESTAMP`,
            [threadId, cId]
          );
          await conn.query(
            `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at, left_at)
             VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP, NULL)
             ON CONFLICT (thread_id, user_id) DO UPDATE SET left_at = NULL, joined_at = CURRENT_TIMESTAMP`,
            [threadId, tId]
          );
        } else {
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
        }
      } else {
        const [insertThread] = await conn.query(
          `INSERT INTO chat_threads (thread_type, property_id, title, created_by, direct_hash, status)
           VALUES ('DIRECT', NULL, ?, ?, ?, 'ACTIVE')`,
          [`${creator.name} & ${target.name}`, cId, hash]
        );
        threadId = insertThread.insertId;

        await conn.query(
          `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
           VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP), (?, ?, 'MEMBER', CURRENT_TIMESTAMP)`,
          [threadId, cId, threadId, tId]
        );

        const [createdThreads] = await conn.query('SELECT * FROM chat_threads WHERE id = ?', [threadId]);
        thread = createdThreads[0];
      }

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
   * Create group conversation thread
   */
  static async createGroupThread(creatorUser, title, participantIds = []) {
    const cleanTitle = (title || '').trim();
    if (!cleanTitle || cleanTitle.length < 2) {
      throw new BadRequestError('Group title must be at least 2 characters long.');
    }
    if (cleanTitle.length > 150) {
      throw new BadRequestError('Group title cannot exceed 150 characters.');
    }

    const cId = Number(creatorUser.id);
    const uniqueIds = Array.from(
      new Set((participantIds || []).map((id) => Number(id)).filter((id) => id > 0 && id !== cId))
    );

    if (uniqueIds.length === 0) {
      throw new BadRequestError('At least one additional staff member must be added to the group.');
    }

    const placeholders = uniqueIds.map(() => '?').join(', ');
    const members = await pool.query(
      `SELECT id, name, role, email FROM users WHERE id IN (${placeholders}) AND status = 'ACTIVE'`,
      uniqueIds
    );

    if (members.length !== uniqueIds.length) {
      throw new BadRequestError('One or more selected staff members are inactive or invalid.');
    }

    return pool.withTransaction(async (conn) => {
      const [tResult] = await conn.query(
        `INSERT INTO chat_threads (thread_type, property_id, title, created_by, status)
         VALUES ('GROUP', ?, ?, ?, 'ACTIVE')`,
        [creatorUser.propertyId || null, cleanTitle, cId]
      );
      const threadId = tResult.insertId;

      // Creator enrolled as ADMIN
      await conn.query(
        `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
         VALUES (?, ?, 'ADMIN', CURRENT_TIMESTAMP)`,
        [threadId, cId]
      );

      // Members enrolled
      for (const m of members) {
        await conn.query(
          `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
           VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP)`,
          [threadId, m.id]
        );
      }

      // Initial system notice
      const tempId = crypto.randomUUID();
      const noticeContent = `${creatorUser.name} created the group "${cleanTitle}" with ${members.length + 1} members.`;
      await conn.query(
        `INSERT INTO chat_messages (thread_id, sender_id, client_temp_id, message_type, content)
         VALUES (?, ?, ?, 'SYSTEM_NOTICE', ?)`,
        [threadId, cId, tempId, noticeContent]
      );

      await conn.query('UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [threadId]);

      const [created] = await conn.query('SELECT * FROM chat_threads WHERE id = ?', [threadId]);
      return {
        ...created[0],
        title: cleanTitle,
        threadType: 'GROUP',
        participants: [
          { userId: cId, name: creatorUser.name, role: 'ADMIN' },
          ...members.map((m) => ({ userId: m.id, name: m.name, role: 'MEMBER' })),
        ],
      };
    });
  }

  /**
   * Get thread participants
   */
  static async getThreadParticipants(threadId) {
    const tId = Number(threadId);
    const sql = `
      SELECT p.id, p.thread_id AS threadId, p.user_id AS userId, p.role AS participantRole,
             p.joined_at AS joinedAt, u.name, u.email, u.role AS userRole,
             u.property_id AS propertyId, prop.name AS propertyName
      FROM chat_thread_participants p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN properties prop ON u.property_id = prop.id
      WHERE p.thread_id = ? AND p.left_at IS NULL
      ORDER BY p.role ASC, u.name ASC
    `;
    return pool.query(sql, [tId]);
  }

  /**
   * Add participants to thread
   */
  static async addParticipants(threadId, userIds = [], requestingUser) {
    const tId = Number(threadId);
    const cleanIds = Array.from(new Set((userIds || []).map((id) => Number(id)).filter((id) => id > 0)));
    if (cleanIds.length === 0) {
      throw new BadRequestError('No valid user IDs provided.');
    }

    const placeholders = cleanIds.map(() => '?').join(', ');
    const members = await pool.query(
      `SELECT id, name FROM users WHERE id IN (${placeholders}) AND status = 'ACTIVE'`,
      cleanIds
    );

    return pool.withTransaction(async (conn) => {
      for (const m of members) {
        if (pool.isPostgres()) {
          await conn.query(
            `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at, left_at)
             VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP, NULL)
             ON CONFLICT (thread_id, user_id) DO UPDATE SET left_at = NULL, joined_at = CURRENT_TIMESTAMP`,
            [tId, m.id]
          );
        } else {
          await conn.query(
            `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at, left_at)
             VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP, NULL)
             ON DUPLICATE KEY UPDATE left_at = NULL, joined_at = CURRENT_TIMESTAMP`,
            [tId, m.id]
          );
        }

        // System notice for each joined member
        const tempId = crypto.randomUUID();
        await conn.query(
          `INSERT INTO chat_messages (thread_id, sender_id, client_temp_id, message_type, content)
           VALUES (?, ?, ?, 'SYSTEM_NOTICE', ?)`,
          [tId, requestingUser.id, tempId, `${requestingUser.name} added ${m.name} to the conversation.`]
        );
      }

      await conn.query('UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [tId]);
      return { success: true, addedCount: members.length };
    });
  }

  /**
   * Remove participant from thread or leave group
   */
  static async removeParticipant(threadId, targetUserId, requestingUser) {
    const tId = Number(threadId);
    const targetId = Number(targetUserId);
    const reqId = Number(requestingUser.id);
    const reqRole = (requestingUser.role || '').toUpperCase();

    if (targetId !== reqId && !['SUPER_ADMIN', 'ADMIN'].includes(reqRole)) {
      const [part] = await pool.query(
        'SELECT role FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? AND left_at IS NULL',
        [tId, reqId]
      );
      if (!part || part.role !== 'ADMIN') {
        throw new ForbiddenError('Only group administrators can remove other participants.');
      }
    }

    const [target] = await pool.query('SELECT name FROM users WHERE id = ?', [targetId]);

    return pool.withTransaction(async (conn) => {
      await conn.query(
        'UPDATE chat_thread_participants SET left_at = CURRENT_TIMESTAMP WHERE thread_id = ? AND user_id = ?',
        [tId, targetId]
      );

      const notice = targetId === reqId
        ? `${requestingUser.name} left the group.`
        : `${requestingUser.name} removed ${target?.name || 'a member'} from the group.`;

      const tempId = crypto.randomUUID();
      await conn.query(
        `INSERT INTO chat_messages (thread_id, sender_id, client_temp_id, message_type, content)
         VALUES (?, ?, ?, 'SYSTEM_NOTICE', ?)`,
        [tId, reqId, tempId, notice]
      );

      await conn.query('UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [tId]);
      return { success: true, threadId: tId, userId: targetId };
    });
  }

  /**
   * Create property-scoped team channel
   */
  static async createPropertyChannel(creatorUser, propertyId, title) {
    const creatorRole = (creatorUser.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER'].includes(creatorRole)) {
      throw new ForbiddenError('Only Administrators and Managers can create property team channels.');
    }

    const pId = Number(propertyId);
    if (!pId || isNaN(pId)) {
      throw new BadRequestError('Valid propertyId is required.');
    }

    const channelTitle = (title || 'Property Team Channel').trim();

    return pool.withTransaction(async (conn) => {
      const [pResult] = await conn.query('SELECT name FROM properties WHERE id = ?', [pId]);
      if (!pResult) {
        throw new NotFoundError(`Property #${pId} not found.`);
      }

      const [insertChannel] = await conn.query(
        `INSERT INTO chat_threads (thread_type, property_id, title, created_by, status)
         VALUES ('PROPERTY_CHANNEL', ?, ?, ?, 'ACTIVE')`,
        [pId, channelTitle, creatorUser.id]
      );
      const threadId = insertChannel.insertId;

      await conn.query(
        `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
         VALUES (?, ?, 'ADMIN', CURRENT_TIMESTAMP)`,
        [threadId, creatorUser.id]
      );

      const [propertyStaff] = await conn.query(
        `SELECT id FROM users WHERE property_id = ? AND status = 'ACTIVE' AND id != ?`,
        [pId, creatorUser.id]
      );

      for (const staff of propertyStaff) {
        if (pool.isPostgres()) {
          await conn.query(
            `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at, left_at)
             VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP, NULL)
             ON CONFLICT (thread_id, user_id) DO UPDATE SET left_at = NULL`,
            [threadId, staff.id]
          );
        } else {
          await conn.query(
            `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at, left_at)
             VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP, NULL)
             ON DUPLICATE KEY UPDATE left_at = NULL`,
            [threadId, staff.id]
          );
        }
      }

      const [created] = await conn.query('SELECT * FROM chat_threads WHERE id = ?', [threadId]);
      return created[0];
    });
  }

  /**
   * Create system broadcast thread
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

      await conn.query(
        `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
         VALUES (?, ?, 'ADMIN', CURRENT_TIMESTAMP)`,
        [threadId, creatorUser.id]
      );

      const clientTempId = crypto.randomUUID();
      const [mResult] = await conn.query(
        `INSERT INTO chat_messages (thread_id, sender_id, client_temp_id, message_type, content)
         VALUES (?, ?, ?, 'SYSTEM_NOTICE', ?)`,
        [threadId, creatorUser.id, clientTempId, cleanContent]
      );
      const messageId = mResult.insertId;

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
   * Retrieve all active conversation threads authorized for the user
   */
  static async getUserThreads(userId, role, propertyId) {
    const userRole = (role || '').toUpperCase();
    const uId = Number(userId);

    const sql = `
      SELECT DISTINCT t.id, t.thread_type, t.property_id,
             t.title, t.status, t.last_message_at, t.created_at,
             p.last_read_message_id,
             prop.name AS property_name,
             COALESCE(t.last_message_at, t.created_at) AS sort_key
      FROM chat_threads t
      LEFT JOIN chat_thread_participants p ON t.id = p.thread_id AND p.user_id = ? AND p.left_at IS NULL
      LEFT JOIN properties prop ON t.property_id = prop.id
      WHERE t.status = 'ACTIVE'
        AND (
          p.id IS NOT NULL
          OR t.thread_type = 'SYSTEM_BROADCAST'
          OR (t.thread_type = 'PROPERTY_CHANNEL' AND t.property_id = ?)
          OR (t.thread_type = 'PROPERTY_CHANNEL' AND ? IN ('SUPER_ADMIN', 'ADMIN', 'OWNER'))
        )
      ORDER BY sort_key DESC
    `;

    const threads = await pool.query(sql, [uId, propertyId || null, userRole]);

    const enriched = await Promise.all(
      threads.map(async (th) => {
        const thId = Number(th.id);
        const lastReadMsgId = Number(th.last_read_message_id || th.lastreadmessageid || th.lastReadMessageId || 0);
        const threadType = th.thread_type || th.threadtype || th.threadType;
        const propId = th.property_id || th.propertyid || th.propertyId;
        const propName = th.property_name || th.propertyname || th.propertyName;

        const [unreadRow] = await pool.query(
          `SELECT COUNT(*) AS unread_count
           FROM chat_messages
           WHERE thread_id = ?
             AND id > ?
             AND is_deleted = FALSE
             AND (sender_id IS NULL OR sender_id != ?)`,
          [thId, lastReadMsgId, uId]
        );

        const [lastMsg] = await pool.query(
          `SELECT m.id, m.content, m.message_type, m.created_at, m.is_deleted,
                  u.name AS sender_name, u.role AS sender_role
           FROM chat_messages m
           LEFT JOIN users u ON m.sender_id = u.id
           WHERE m.thread_id = ?
           ORDER BY m.id DESC LIMIT 1`,
          [thId]
        );

        const [pCountRow] = await pool.query(
          'SELECT COUNT(*) AS count FROM chat_thread_participants WHERE thread_id = ? AND left_at IS NULL',
          [thId]
        );

        let displayTitle = th.title;
        let otherParticipant = null;

        if (threadType === 'DIRECT') {
          const [other] = await pool.query(
            `SELECT u.id, u.name, u.email, u.role, u.property_id
             FROM chat_thread_participants p
             JOIN users u ON p.user_id = u.id
             WHERE p.thread_id = ? AND p.user_id != ? AND p.left_at IS NULL
             LIMIT 1`,
            [thId, uId]
          );
          if (other) {
            displayTitle = other.name;
            otherParticipant = {
              id: other.id,
              name: other.name,
              email: other.email,
              role: other.role,
              propertyId: other.property_id || other.propertyid || other.propertyId,
            };
          }
        }

        const lastMsgType = lastMsg?.message_type || lastMsg?.messagetype || lastMsg?.messageType;
        const isMsgDeleted = Boolean(lastMsg?.is_deleted || lastMsg?.isdeleted);
        let previewContent = lastMsg?.content;
        if (isMsgDeleted) {
          previewContent = 'This message was deleted';
        } else if (lastMsgType === 'IMAGE') {
          previewContent = '📷 Photo attachment';
        } else if (lastMsgType === 'DOCUMENT' || lastMsgType === 'FILE') {
          previewContent = `📎 ${lastMsg.content || 'Document'}`;
        }

        const unreadCount = parseInt(
          unreadRow?.unread_count || unreadRow?.unreadcount || unreadRow?.unreadCount || 0,
          10
        );

        return {
          id: thId,
          threadType,
          propertyId: propId,
          propertyName: propName || (propId ? `Property #${propId}` : null),
          title: displayTitle,
          unreadCount,
          lastReadMessageId: lastReadMsgId || null,
          participantsCount: parseInt(pCountRow?.count || 0, 10),
          otherParticipant,
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                content: previewContent,
                messageType: lastMsgType,
                senderName: lastMsg.sender_name || lastMsg.sendername || lastMsg.senderName,
                senderRole: lastMsg.sender_role || lastMsg.senderrole || lastMsg.senderRole,
                createdAt: lastMsg.created_at || lastMsg.createdat || lastMsg.createdAt,
              }
            : null,
        };
      })
    );

    return enriched;
  }

  /**
   * Get total unread count for user across all threads
   */
  static async getTotalUnreadCount(userId, role, propertyId) {
    const threads = await this.getUserThreads(userId, role, propertyId);
    return threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
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

    const [membership] = await pool.query(
      'SELECT * FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? AND left_at IS NULL',
      [tId, uId]
    );

    let isAuthorized = Boolean(membership);

    if (!isAuthorized) {
      if (thread.thread_type === 'SYSTEM_BROADCAST' && ELIGIBLE_ROLES.includes(userRole)) {
        isAuthorized = true;
      } else if (
        thread.thread_type === 'PROPERTY_CHANNEL' &&
        (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(userRole) ||
          (propertyId && Number(thread.property_id) === Number(propertyId)))
      ) {
        isAuthorized = true;
      }

      if (isAuthorized) {
        if (pool.isPostgres()) {
          await pool.query(
            `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at, left_at)
             VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP, NULL)
             ON CONFLICT (thread_id, user_id) DO UPDATE SET left_at = NULL`,
            [tId, uId]
          );
        } else {
          await pool.query(
            `INSERT INTO chat_thread_participants (thread_id, user_id, role, joined_at)
             VALUES (?, ?, 'MEMBER', CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE left_at = NULL`,
            [tId, uId]
          );
        }
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenError(`You are not authorized to access conversation thread #${tId}.`);
    }

    return thread;
  }

  /**
   * Fetch paginated message history with attachments
   */
  static async getThreadHistory(threadId, userId, beforeCursor = null, limit = 50) {
    const tId = Number(threadId);
    const uId = Number(userId);
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

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
             m.content, m.priority, m.context_entity_type AS contextEntityType,
             m.context_entity_id AS contextEntityId, m.is_edited AS isEdited,
             m.is_deleted AS isDeleted, m.created_at AS createdAt,
             u.name AS senderName, u.role AS senderRole,
             cma.acknowledged_at AS acknowledgedAt
      FROM chat_messages m
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN chat_message_acknowledgements cma ON cma.message_id = m.id AND cma.user_id = ?
      WHERE m.thread_id = ?
    `;
    const params = [uId, tId];

    if (beforeCursor && !isNaN(parseInt(beforeCursor, 10))) {
      sql += ' AND m.id < ?';
      params.push(parseInt(beforeCursor, 10));
    }

    sql += ' ORDER BY m.id DESC LIMIT ?';
    params.push(pageLimit + 1);

    const rows = await pool.query(sql, params);
    const hasMore = rows.length > pageLimit;
    const sliced = hasMore ? rows.slice(0, pageLimit) : rows;

    // Fetch attachments for these messages
    const msgIds = sliced.map((m) => m.id);
    let attachmentsMap = {};

    if (msgIds.length > 0) {
      const placeholders = msgIds.map(() => '?').join(', ');
      const attRows = await pool.query(
        `SELECT id, message_id, original_name, file_type, file_size
         FROM chat_attachments
         WHERE message_id IN (${placeholders})`,
        msgIds
      );

      attRows.forEach((att) => {
        const mId = Number(att.message_id || att.messageid || att.messageId);
        attachmentsMap[mId] = {
          id: att.id,
          originalName: att.original_name || att.originalname || att.originalName,
          fileType: att.file_type || att.filetype || att.fileType,
          fileSize: Number(att.file_size || att.filesize || att.fileSize || 0),
          url: `/api/v1/chat/threads/${tId}/attachments/${att.id}`,
          downloadUrl: `/api/v1/chat/threads/${tId}/attachments/${att.id}/download`,
        };
      });
    }

    const formatted = sliced.map((msg) => {
      const mId = Number(msg.id);
      const isMsgDeleted = Boolean(msg.is_deleted !== undefined ? msg.is_deleted : msg.isdeleted);
      const isMsgEdited = Boolean(msg.is_edited !== undefined ? msg.is_edited : msg.isedited);
      const msgType = msg.message_type || msg.messagetype || msg.messageType || 'TEXT';
      const senderName = msg.sendername || msg.senderName || msg.sender_name || 'System';
      const senderRole = msg.senderrole || msg.senderRole || msg.sender_role || 'STAFF';
      const senderId = Number(msg.sender_id || msg.senderid || msg.senderId || 0);

      return {
        id: mId,
        threadId: Number(msg.thread_id || msg.threadid || msg.threadId || tId),
        sender: {
          id: senderId,
          name: senderName,
          role: senderRole,
        },
        messageType: msgType,
        content: isMsgDeleted ? 'This message was deleted' : msg.content,
        attachment: attachmentsMap[mId] || null,
        contextEntity: msg.context_entity_type || msg.contextEntityType
          ? {
              type: msg.context_entity_type || msg.contextEntityType,
              id: msg.context_entity_id || msg.contextEntityId,
            }
          : null,
        isEdited: isMsgEdited,
        isDeleted: isMsgDeleted,
        priority: msg.priority || 'NORMAL',
        acknowledgedAt: msg.acknowledgedat || msg.acknowledgedAt || null,
        createdAt: msg.created_at || msg.createdat || msg.createdAt,
      };
    });

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
   * Persist message transactionally with submission idempotency and attachment support.
   */
  static async persistMessage({
    threadId,
    senderId,
    senderRole,
    clientTempId,
    messageType = 'TEXT',
    content,
    priority = 'NORMAL',
    contextEntityType = null,
    contextEntityId = null,
    attachment = null,
  }) {
    const tId = Number(threadId);
    const sId = Number(senderId);

    const [part] = await pool.query(
      'SELECT id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? AND left_at IS NULL',
      [tId, sId]
    );
    if (!part) {
      throw new ForbiddenError(`You are not an active participant in thread #${tId}.`);
    }

    let cleanContent = (content || '').trim();
    let computedMessageType = messageType;

    // Process attachment if present
    let attBuffer = null;
    let attMeta = null;

    if (attachment && attachment.originalName && attachment.fileData) {
      if (Buffer.isBuffer(attachment.fileData)) {
        attBuffer = attachment.fileData;
      } else if (typeof attachment.fileData === 'string') {
        const cleanBase64 = attachment.fileData.replace(/^data:[^;]+;base64,/, '');
        attBuffer = Buffer.from(cleanBase64, 'base64');
      }

      if (attBuffer && attBuffer.length > 0) {
        const mime = (attachment.fileType || 'application/octet-stream').toLowerCase();
        if (computedMessageType === 'TEXT') {
          computedMessageType = mime.startsWith('image/') ? 'IMAGE' : 'DOCUMENT';
        }
        if (!cleanContent) {
          cleanContent = attachment.originalName;
        }
        attMeta = {
          originalName: path.basename(attachment.originalName).substring(0, 255),
          fileType: mime.substring(0, 100),
          fileSize: attachment.fileSize || attBuffer.length,
          storageName: `${Date.now()}_${crypto.randomUUID()}_${path.basename(attachment.originalName)}`,
        };
      }
    }

    if (!cleanContent) {
      throw new BadRequestError('Message content cannot be empty.');
    }
    if (cleanContent.length > 2000) {
      throw new BadRequestError('Message content exceeds maximum allowed length of 2000 characters.');
    }

    const tempId = clientTempId ? String(clientTempId).trim() : crypto.randomUUID();

    return pool.withTransaction(async (conn) => {
      // 1. Idempotency check
      const [existing] = await conn.query(
        'SELECT * FROM chat_messages WHERE thread_id = ? AND client_temp_id = ? LIMIT 1',
        [tId, tempId]
      );

      if (existing.length > 0) {
        const prev = existing[0];
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
          throw new ConflictError('Duplicate client_temp_id detected for another participant.');
        }
      }

      // 2. Insert new message
      const [result] = await conn.query(
        `INSERT INTO chat_messages (
           thread_id, sender_id, client_temp_id, message_type, content,
           context_entity_type, context_entity_id, priority
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tId, sId, tempId, computedMessageType, cleanContent, contextEntityType || null, contextEntityId || null, priority || 'NORMAL']
      );
      const messageId = result.insertId;

      // Create acknowledgement records for all thread recipients if message is IMPORTANT or URGENT
      if (['IMPORTANT', 'URGENT'].includes(priority)) {
        const partsRes = await conn.query(
          'SELECT user_id FROM chat_thread_participants WHERE thread_id = ? AND user_id != ? AND left_at IS NULL',
          [tId, sId]
        );
        const parts = Array.isArray(partsRes[0]) ? partsRes[0] : (Array.isArray(partsRes) ? partsRes : []);
        for (const p of parts) {
          const uid = p.user_id || p.userid || p.userId;
          if (uid) {
            if (pool.isPostgres()) {
              await conn.query(
                'INSERT INTO chat_message_acknowledgements (message_id, user_id) VALUES (?, ?) ON CONFLICT (message_id, user_id) DO NOTHING',
                [messageId, uid]
              );
            } else {
              await conn.query(
                'INSERT IGNORE INTO chat_message_acknowledgements (message_id, user_id) VALUES (?, ?)',
                [messageId, uid]
              );
            }
          }
        }
      }

      // 3. Insert attachment binary if present
      let createdAttachment = null;
      if (attBuffer && attMeta) {
        const [attResult] = await conn.query(
          `INSERT INTO chat_attachments (
             message_id, thread_id, uploaded_by, original_name, storage_name,
             file_type, file_size, storage_driver, file_data
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DB_BLOB', ?)`,
          [
            messageId,
            tId,
            sId,
            attMeta.originalName,
            attMeta.storageName,
            attMeta.fileType,
            attMeta.fileSize,
            attBuffer,
          ]
        );
        const attachmentId = attResult.insertId;
        createdAttachment = {
          id: attachmentId,
          originalName: attMeta.originalName,
          fileType: attMeta.fileType,
          fileSize: attMeta.fileSize,
          url: `/api/v1/chat/threads/${tId}/attachments/${attachmentId}`,
          downloadUrl: `/api/v1/chat/threads/${tId}/attachments/${attachmentId}/download`,
        };
      }

      // 4. Update thread last_message_at
      await conn.query('UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [tId]);

      // 5. Update sender's read watermark
      await conn.query(
        `UPDATE chat_thread_participants
         SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?),
             last_read_at = CURRENT_TIMESTAMP
         WHERE thread_id = ? AND user_id = ?`,
        [messageId, tId, sId]
      );

      // 6. Direct receipts if DIRECT thread
      const [threadRow] = await conn.query('SELECT thread_type FROM chat_threads WHERE id = ?', [tId]);
      if (threadRow && threadRow.thread_type === 'DIRECT') {
        const [other] = await conn.query(
          'SELECT user_id FROM chat_thread_participants WHERE thread_id = ? AND user_id != ? AND left_at IS NULL LIMIT 1',
          [tId, sId]
        );
        if (other) {
          if (pool.isPostgres()) {
            await conn.query(
              `INSERT INTO chat_message_receipts (message_id, user_id, status)
               VALUES (?, ?, 'SENT')
               ON CONFLICT (message_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
              [messageId, other.user_id]
            );
          } else {
            await conn.query(
              `INSERT INTO chat_message_receipts (message_id, user_id, status)
               VALUES (?, ?, 'SENT')
               ON DUPLICATE KEY UPDATE status = VALUES(status)`,
              [messageId, other.user_id]
            );
          }
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
        messageType: computedMessageType,
        content: cleanContent,
        attachment: createdAttachment,
        contextEntityType,
        contextEntityId,
        priority: priority || 'NORMAL',
        isEdited: false,
        isDeleted: false,
        createdAt: saved[0]?.created_at || new Date().toISOString(),
        idempotentReplay: false,
      };
    });
  }

  /**
   * Retrieve attachment with binary data
   */
  static async getAttachment(threadId, attachmentId) {
    const tId = Number(threadId);
    const aId = Number(attachmentId);

    const [att] = await pool.query(
      'SELECT * FROM chat_attachments WHERE id = ? AND thread_id = ? LIMIT 1',
      [aId, tId]
    );

    if (!att) {
      throw new NotFoundError(`Attachment #${aId} not found in thread #${tId}.`);
    }

    return att;
  }

  /**
   * Update read watermark monotonically
   */
  static async updateReadWatermark(threadId, userId, messageId) {
    const tId = Number(threadId);
    const uId = Number(userId);
    const mId = Number(messageId);

    const [msg] = await pool.query('SELECT id, thread_id FROM chat_messages WHERE id = ? LIMIT 1', [mId]);
    if (!msg) {
      throw new NotFoundError(`Message #${mId} does not exist.`);
    }
    if (Number(msg.thread_id) !== tId) {
      throw new BadRequestError(`Message #${mId} does not belong to thread #${tId}.`);
    }

    const [part] = await pool.query(
      'SELECT id, last_read_message_id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? AND left_at IS NULL',
      [tId, uId]
    );
    if (!part) {
      throw new ForbiddenError(`You are not an active participant in thread #${tId}.`);
    }

    return pool.withTransaction(async (conn) => {
      await conn.query(
        `UPDATE chat_thread_participants
         SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?),
             last_read_at = CURRENT_TIMESTAMP
         WHERE thread_id = ? AND user_id = ?`,
        [mId, tId, uId]
      );

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
   * Soft-delete message
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
    const isModerator = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'OWNER'].includes(role);

    if (!isAuthor && !isModerator) {
      throw new ForbiddenError('You are not authorized to delete or moderate this message.');
    }

    await pool.query(
      `UPDATE chat_messages
       SET is_deleted = TRUE, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP
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
    let sql = 'SELECT * FROM chat_retention_policies WHERE property_id = ? LIMIT 1';
    let [policy] = await pool.query(sql, [propId]);

    if (!policy) {
      [policy] = await pool.query('SELECT * FROM chat_retention_policies WHERE property_id IS NULL LIMIT 1');
    }

    return policy || { retention_days: 0, archival_mode: 'INDEFINITE_ACTIVE', is_active: 1 };
  }

  static async updateRetentionPolicy(propertyId, retentionDays, updatedBy) {
    const days = Math.max(0, parseInt(retentionDays, 10) || 0);
    const propId = propertyId ? Number(propertyId) : null;

    if (pool.isPostgres()) {
      await pool.query(
        `INSERT INTO chat_retention_policies (property_id, retention_days, archival_mode, is_active, updated_by)
         VALUES (?, ?, 'INDEFINITE_ACTIVE', TRUE, ?)
         ON CONFLICT (property_id) DO UPDATE SET retention_days = EXCLUDED.retention_days, updated_by = EXCLUDED.updated_by`,
        [propId, days, updatedBy]
      );
    } else {
      await pool.query(
        `INSERT INTO chat_retention_policies (property_id, retention_days, archival_mode, is_active, updated_by)
         VALUES (?, ?, 'INDEFINITE_ACTIVE', 1, ?)
         ON DUPLICATE KEY UPDATE retention_days = VALUES(retention_days), updated_by = VALUES(updated_by)`,
        [propId, days, updatedBy]
      );
    }

    return ChatRepository.getRetentionPolicy(propId);
  }

  /**
   * Acknowledge an important message or circular
   */
  static async acknowledgeMessage(messageId, userId) {
    const mId = Number(messageId);
    const uId = Number(userId);

    const updateSql = `
      UPDATE chat_message_acknowledgements
      SET acknowledged_at = CURRENT_TIMESTAMP, viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP)
      WHERE message_id = ? AND user_id = ?
    `;
    await pool.query(updateSql, [mId, uId]);
    return { success: true, messageId: mId, acknowledgedAt: new Date().toISOString() };
  }

  /**
   * Get all unacknowledged important/urgent messages for user upon login
   */
  static async getPendingImportantMessages(userId) {
    const uId = Number(userId);
    const sql = `
      SELECT m.id, m.thread_id AS "threadId", m.content, m.priority,
             m.context_entity_type AS "contextEntityType", m.context_entity_id AS "contextEntityId",
             m.created_at AS "createdAt", u.name AS "senderName", u.role AS "senderRole",
             t.title AS "threadTitle", t.thread_type AS "threadType"
      FROM chat_message_acknowledgements cma
      JOIN chat_messages m ON cma.message_id = m.id
      JOIN chat_threads t ON m.thread_id = t.id
      JOIN users u ON m.sender_id = u.id
      WHERE cma.user_id = ? AND cma.acknowledged_at IS NULL
      ORDER BY m.id DESC;
    `;
    const rows = await pool.query(sql, [uId]);
    return rows || [];
  }

  /**
   * Create an Owner Circular broadcast to company or property staff
   */
  static async createOwnerCircular(ownerUser, { title, content, priority = 'IMPORTANT', propertyId = null }) {
    return pool.withTransaction(async (conn) => {
      const cleanTitle = (title || 'Executive Operational Circular').trim();
      const cleanContent = (content || '').trim();

      const [threadResult] = await conn.query(
        `INSERT INTO chat_threads (thread_type, property_id, title, created_by, status, last_message_at)
         VALUES ('OWNER_CIRCULAR', ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP)`,
        [propertyId || null, cleanTitle, ownerUser.id]
      );
      const threadId = threadResult.insertId;

      await conn.query(
        `INSERT INTO chat_thread_participants (thread_id, user_id, role, last_read_at)
         VALUES (?, ?, 'ADMIN', CURRENT_TIMESTAMP)`,
        [threadId, ownerUser.id]
      );

      let staffQuery = 'SELECT id FROM users WHERE id != ? AND role IN (\'ADMIN\', \'OPERATIONS_MANAGER\', \'MANAGER\', \'STAFF\', \'RECEPTIONIST\')';
      const staffParams = [ownerUser.id];
      if (propertyId) {
        staffQuery += ' AND property_id = ?';
        staffParams.push(propertyId);
      }
      const staffRes = await conn.query(staffQuery, staffParams);
      const staffList = Array.isArray(staffRes[0]) ? staffRes[0] : (Array.isArray(staffRes) ? staffRes : []);

      for (const s of staffList) {
        const uid = s.id;
        if (uid) {
          await conn.query(
            `INSERT INTO chat_thread_participants (thread_id, user_id, role)
             VALUES (?, ?, 'MEMBER')`,
            [threadId, uid]
          );
        }
      }

      const tempId = crypto.randomUUID();
      const [msgResult] = await conn.query(
        `INSERT INTO chat_messages (
           thread_id, sender_id, client_temp_id, message_type, content,
           priority, context_entity_type
         ) VALUES (?, ?, ?, 'TEXT', ?, ?, 'CIRCULAR')`,
        [threadId, ownerUser.id, tempId, cleanContent, priority]
      );
      const messageId = msgResult.insertId;

      for (const s of staffList) {
        const uid = s.id;
        if (uid) {
          if (pool.isPostgres()) {
            await conn.query(
              'INSERT INTO chat_message_acknowledgements (message_id, user_id) VALUES (?, ?) ON CONFLICT (message_id, user_id) DO NOTHING',
              [messageId, uid]
            );
          } else {
            await conn.query(
              'INSERT IGNORE INTO chat_message_acknowledgements (message_id, user_id) VALUES (?, ?)',
              [messageId, uid]
            );
          }
        }
      }

      return {
        threadId,
        messageId,
        title: cleanTitle,
        recipientsCount: (staffList || []).length,
        priority,
      };
    });
  }
}

module.exports = ChatRepository;
