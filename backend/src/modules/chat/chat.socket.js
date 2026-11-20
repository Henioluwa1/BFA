const jwt = require('jsonwebtoken');
const config = require('../../config');
const pool = require('../../db/pool');
const ChatService = require('./chat.service');
const ChatRepository = require('./chat.repository');
const logger = require('../../utils/logger');
const AuditService = require('../../core/audit/audit.service');

const ELIGIBLE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'OPERATIONS_MANAGER',
  'OWNER',
  'RECEPTIONIST',
  'STAFF',
];

// In-memory active presence tracking: userId -> Set of active socket IDs
const onlineUsers = new Map();

/**
 * Socket.IO Handshake Authentication Middleware
 * Authenticates cryptographically via Bearer JWT and enforces role and status boundaries.
 */
async function socketAuthMiddleware(socket, next) {
  try {
    const rawAuth = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    if (!rawAuth) {
      return next(new Error('AUTHENTICATION_REQUIRED'));
    }

    const token = String(rawAuth).replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return next(new Error('AUTHENTICATION_REQUIRED'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.security.jwtSecret);
    } catch (jwtErr) {
      logger.warn(`Socket handshake rejected: ${jwtErr.message}`, { ip: socket.handshake.address });
      return next(new Error('INVALID_TOKEN'));
    }

    const role = (decoded.role || '').toUpperCase();
    if (!ELIGIBLE_ROLES.includes(role)) {
      logger.warn(`Socket handshake rejected: Role '${role}' excluded from chat`, {
        userId: decoded.id,
        role,
      });
      return next(new Error('ROLE_NOT_AUTHORIZED_FOR_CHAT'));
    }

    // Verify user exists and is active in database
    const [user] = await pool.query(
      'SELECT id, name, email, role, property_id, status FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (!user || user.status !== 'ACTIVE') {
      logger.warn(`Socket handshake rejected: User ${decoded.id} is inactive or not found`);
      return next(new Error('USER_INACTIVE_OR_SUSPENDED'));
    }

    socket.data.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: (user.role || '').toUpperCase(),
      propertyId: user.property_id || null,
    };

    next();
  } catch (err) {
    logger.error('Unexpected error in socket authentication middleware:', { error: err.message });
    next(new Error('AUTHENTICATION_FAILED'));
  }
}

/**
 * Initialize and attach Chat Socket.IO event handlers
 */
function initializeChatSocket(io) {
  // 1. Attach Handshake Authentication Guard
  io.use(socketAuthMiddleware);

  // 2. Connection Lifecycle
  io.on('connection', (socket) => {
    const user = socket.data.user;
    logger.info(`[CHAT_SOCKET] User connected: ${user.name} (#${user.id}, ${user.role}) [Socket: ${socket.id}]`);

    // Track active presence
    const uId = Number(user.id);
    if (!onlineUsers.has(uId)) {
      onlineUsers.set(uId, new Set());
    }
    onlineUsers.get(uId).add(socket.id);

    // If this is user's first active connection, broadcast online status
    if (onlineUsers.get(uId).size === 1) {
      io.emit('presence:change', { userId: uId, status: 'ONLINE' });
    }

    // Auto-join user's personal room for direct notifications and sync
    const userRoom = `user:${user.id}`;
    socket.join(userRoom);

    // Auto-join property channel room if assigned to property
    if (user.propertyId) {
      socket.join(`channel:prop:${user.propertyId}`);
    }

    // Auto-join system broadcast channel for operational staff
    socket.join('channel:system:staff');

    // Role-specific broadcast isolation:
    // Only authenticated RECEPTIONIST role joins the urgent booking alert channel
    if (user.role === 'RECEPTIONIST') {
      socket.join('channel:receptionist:alerts');
      if (user.propertyId) {
        socket.join(`channel:receptionist:alerts:prop:${user.propertyId}`);
      }
      logger.info(`[SOCKET_AUTH] Receptionist #${user.id} subscribed exclusively to channel:receptionist:alerts`);
    }

    // Explicit subscription guard for receptionist alert channel
    socket.on('booking:subscribe_alerts', (data, ack) => {
      if (user.role !== 'RECEPTIONIST') {
        logger.warn(`[SOCKET_AUTH] Unauthorized subscription attempt to receptionist alerts by user #${user.id} (${user.role})`);
        if (typeof ack === 'function') {
          ack({ success: false, error: { code: 'FORBIDDEN', message: 'Only RECEPTIONIST role may subscribe to booking alerts.' } });
        }
        return;
      }
      socket.join('channel:receptionist:alerts');
      if (user.propertyId) {
        socket.join(`channel:receptionist:alerts:prop:${user.propertyId}`);
      }
      if (typeof ack === 'function') {
        ack({ success: true, data: { subscribed: true } });
      }
    });

    // ------------------------------------------------------------------------
    // Event: presence:get
    // Return list of all currently online user IDs
    // ------------------------------------------------------------------------
    socket.on('presence:get', (data, ack) => {
      const activeIds = Array.from(onlineUsers.keys());
      if (typeof ack === 'function') {
        ack({ success: true, data: activeIds });
      } else {
        socket.emit('presence:state', { onlineUserIds: activeIds });
      }
    });

    // ------------------------------------------------------------------------
    // Event: typing:start & typing:stop
    // Broadcast typing indicators to thread room
    // ------------------------------------------------------------------------
    socket.on('typing:start', (data) => {
      const threadId = parseInt(data?.threadId, 10);
      if (threadId) {
        socket.to(`thread:${threadId}`).emit('typing:status', {
          threadId,
          userId: user.id,
          userName: user.name,
          isTyping: true,
        });
      }
    });

    socket.on('typing:stop', (data) => {
      const threadId = parseInt(data?.threadId, 10);
      if (threadId) {
        socket.to(`thread:${threadId}`).emit('typing:status', {
          threadId,
          userId: user.id,
          userName: user.name,
          isTyping: false,
        });
      }
    });

    // ------------------------------------------------------------------------
    // Event: thread:join
    // Subscribes socket to active messages in a specific thread room
    // ------------------------------------------------------------------------
    socket.on('thread:join', async (data, ack) => {
      try {
        const threadId = parseInt(data?.threadId, 10);
        if (!threadId || isNaN(threadId)) {
          const errPayload = { code: 'ERR_INVALID_PAYLOAD', message: 'Valid threadId is required.' };
          if (typeof ack === 'function') ack({ success: false, error: errPayload });
          return;
        }

        // Verify authorization via repository
        await ChatRepository.getThreadById(threadId, user.id, user.role, user.propertyId);

        const room = `thread:${threadId}`;
        socket.join(room);

        if (typeof ack === 'function') {
          ack({ success: true, data: { threadId, joined: true } });
        }
      } catch (err) {
        logger.warn(`[CHAT_SOCKET] thread:join failed for user #${user.id}: ${err.message}`);
        if (typeof ack === 'function') {
          ack({
            success: false,
            error: {
              code: err.code || 'ERR_FORBIDDEN_ROOM',
              message: err.message || 'Unable to join thread.',
            },
          });
        }
      }
    });

    // ------------------------------------------------------------------------
    // Event: thread:leave
    // Unsubscribes socket from a thread room
    // ------------------------------------------------------------------------
    socket.on('thread:leave', (data, ack) => {
      const threadId = parseInt(data?.threadId, 10);
      if (threadId) {
        socket.leave(`thread:${threadId}`);
      }
      if (typeof ack === 'function') {
        ack({ success: true, data: { threadId, left: true } });
      }
    });

    // ------------------------------------------------------------------------
    // Event: message:send
    // Persists message to database BEFORE acknowledging or broadcasting
    // ------------------------------------------------------------------------
    socket.on('message:send', async (data, ack) => {
      try {
        const threadId = parseInt(data?.threadId, 10);
        if (!threadId || isNaN(threadId)) {
          const errPayload = { code: 'ERR_INVALID_PAYLOAD', message: 'Valid threadId is required.' };
          if (typeof ack === 'function') ack({ success: false, error: errPayload });
          return;
        }

        const savedMessage = await ChatService.sendMessage(user, {
          threadId,
          clientTempId: data.clientTempId,
          messageType: data.messageType || 'TEXT',
          content: data.content,
          contextEntityType: data.contextEntityType || null,
          contextEntityId: data.contextEntityId || null,
          attachment: data.attachment || null,
        });

        // 1. Send acknowledgement to sender
        if (typeof ack === 'function') {
          ack({ success: true, data: savedMessage });
        }

        // 2. Broadcast to thread room participants
        io.to(`thread:${threadId}`).emit('message:delivered', {
          threadId,
          message: savedMessage,
        });

        // 3. Push real-time notification to all participants' individual rooms for unread badges
        const participants = await ChatRepository.getThreadParticipants(threadId);
        for (const p of participants) {
          if (Number(p.userId) !== Number(user.id)) {
            io.to(`user:${p.userId}`).emit('message:new_incoming', {
              threadId,
              message: savedMessage,
            });
          }
        }
      } catch (err) {
        logger.error(`[CHAT_SOCKET] message:send error for user #${user.id}:`, { error: err.message });
        if (typeof ack === 'function') {
          ack({
            success: false,
            error: {
              code: err.code || 'ERR_SEND_FAILED',
              message: err.message || 'Failed to send message.',
            },
          });
        }
      }
    });

    // ------------------------------------------------------------------------
    // Event: message:read
    // Updates monotonic watermark and broadcasts receipt updates
    // ------------------------------------------------------------------------
    socket.on('message:read', async (data, ack) => {
      try {
        const threadId = parseInt(data?.threadId, 10);
        const messageId = parseInt(data?.messageId, 10);

        if (!threadId || !messageId) {
          const errPayload = { code: 'ERR_INVALID_PAYLOAD', message: 'Valid threadId and messageId are required.' };
          if (typeof ack === 'function') ack({ success: false, error: errPayload });
          return;
        }

        const result = await ChatService.markAsRead(user, threadId, messageId);

        if (typeof ack === 'function') {
          ack({ success: true, data: result });
        }

        // Broadcast receipt update to thread room
        io.to(`thread:${threadId}`).emit('message:receipt_updated', {
          threadId,
          userId: user.id,
          lastReadMessageId: messageId,
        });
      } catch (err) {
        logger.warn(`[CHAT_SOCKET] message:read error for user #${user.id}: ${err.message}`);
        if (typeof ack === 'function') {
          ack({
            success: false,
            error: {
              code: err.code || 'ERR_READ_FAILED',
              message: err.message || 'Failed to update read watermark.',
            },
          });
        }
      }
    });

    // ------------------------------------------------------------------------
    // Event: thread:sync
    // Synchronization on socket reconnect to catch missed messages
    // ------------------------------------------------------------------------
    socket.on('thread:sync', async (data, ack) => {
      try {
        const threadId = parseInt(data?.threadId, 10);
        const lastReceivedId = parseInt(data?.lastReceivedMessageId, 10) || 0;

        if (!threadId) {
          if (typeof ack === 'function') ack({ success: false, error: { message: 'threadId required' } });
          return;
        }

        const partRows = await pool.query(
          'SELECT id FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? AND left_at IS NULL',
          [threadId, user.id]
        );
        if (partRows.length === 0) {
          if (typeof ack === 'function') {
            ack({ success: false, error: { code: 'ERR_NOT_PARTICIPANT', message: 'Not authorized for thread' } });
          }
          return;
        }

        const missed = await pool.query(
          `SELECT m.id, m.thread_id AS threadId, m.sender_id AS senderId,
                  m.client_temp_id AS clientTempId, m.message_type AS messageType,
                  m.content, m.context_entity_type AS contextEntityType,
                  m.context_entity_id AS contextEntityId, m.created_at AS createdAt,
                  u.name AS senderName, u.role AS senderRole
           FROM chat_messages m
           LEFT JOIN users u ON m.sender_id = u.id
           WHERE m.thread_id = ? AND m.id > ? AND m.is_deleted = FALSE
           ORDER BY m.id ASC LIMIT 100`,
          [threadId, lastReceivedId]
        );

        if (typeof ack === 'function') {
          ack({
            success: true,
            data: {
              threadId,
              missedMessages: missed,
              count: missed.length,
            },
          });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ success: false, error: { message: err.message } });
        }
      }
    });

    // ------------------------------------------------------------------------
    // Event: unread:sync
    // Fetch aggregated unread counts across all user threads
    // ------------------------------------------------------------------------
    socket.on('unread:sync', async (data, ack) => {
      try {
        const threads = await ChatService.getThreads(user);
        const totalUnread = threads.reduce((acc, t) => acc + (t.unreadCount || 0), 0);
        const payload = {
          totalUnread,
          threads: threads.map((t) => ({ id: t.id, unreadCount: t.unreadCount })),
        };

        if (typeof ack === 'function') {
          ack({ success: true, data: payload });
        }
        socket.emit('unread:summary', payload);
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ success: false, error: { message: err.message } });
        }
      }
    });

    // Disconnect event
    socket.on('disconnect', (reason) => {
      logger.info(`[CHAT_SOCKET] User disconnected: #${user.id} (${user.name}) [Reason: ${reason}]`);

      // Update active presence map
      if (onlineUsers.has(uId)) {
        onlineUsers.get(uId).delete(socket.id);
        if (onlineUsers.get(uId).size === 0) {
          onlineUsers.delete(uId);
          io.emit('presence:change', { userId: uId, status: 'OFFLINE' });
        }
      }
    });
  });

  return io;
}

module.exports = {
  socketAuthMiddleware,
  initializeChatSocket,
};
