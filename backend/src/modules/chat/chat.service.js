const ChatRepository = require('./chat.repository');
const pool = require('../../db/pool');
const AuditService = require('../../core/audit/audit.service');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');
const { validateDocumentOrImageUpload } = require('../../utils/fileSignatureValidator');
const { getIO } = require('../../core/socket/socketEmitter');

const ELIGIBLE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'OPERATIONS_MANAGER',
  'OWNER',
  'RECEPTIONIST',
  'STAFF',
];

const GROUP_CREATION_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'OWNER',
  'OPERATIONS_MANAGER',
  'MANAGER',
];

class ChatService {
  /**
   * Ensure user has an eligible operational role
   */
  static assertEligibleRole(role) {
    const userRole = (role || '').toUpperCase();
    if (!ELIGIBLE_ROLES.includes(userRole)) {
      throw new ForbiddenError(`Role '${userRole}' is strictly excluded from internal chat.`);
    }
  }

  /**
   * Get eligible staff contacts sharing scope
   */
  static async getContacts(user, search = null) {
    this.assertEligibleRole(user.role);
    return ChatRepository.getEligibleStaff({
      userId: user.id,
      role: user.role,
      propertyId: user.propertyId,
      search,
    });
  }

  /**
   * Get total unread count for user across all threads
   */
  static async getUnreadCount(user) {
    this.assertEligibleRole(user.role);
    return ChatRepository.getTotalUnreadCount(user.id, user.role, user.propertyId);
  }

  /**
   * Get all active threads for the user
   */
  static async getThreads(user) {
    this.assertEligibleRole(user.role);
    return ChatRepository.getUserThreads(user.id, user.role, user.propertyId);
  }

  /**
   * Get thread by ID with security verification
   */
  static async getThreadById(threadId, user) {
    this.assertEligibleRole(user.role);
    return ChatRepository.getThreadById(threadId, user.id, user.role, user.propertyId);
  }

  /**
   * Find or create direct 1-to-1 thread
   */
  static async findOrCreateDirectThread(creatorUser, targetUserId) {
    this.assertEligibleRole(creatorUser.role);
    const thread = await ChatRepository.findOrCreateDirectThread(creatorUser.id, targetUserId);
    return thread;
  }

  /**
   * Create group thread with multiple staff participants (Manager/Owner/Admin/Super Admin only)
   */
  static async createGroupThread(creatorUser, { title, participantIds }) {
    this.assertEligibleRole(creatorUser.role);
    const roleUpper = String(creatorUser.role || '').toUpperCase();
    if (!GROUP_CREATION_ROLES.includes(roleUpper)) {
      throw new ForbiddenError('Only Managers, Operations Managers, Owners, and Admins are authorized to create group chats.');
    }

    // Organizational/property scope check for property-scoped Managers
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(roleUpper) && creatorUser.propertyId) {
      const cleanIds = Array.from(
        new Set((participantIds || []).map((id) => Number(id)).filter((id) => id > 0 && id !== Number(creatorUser.id)))
      );
      if (cleanIds.length > 0) {
        const placeholders = cleanIds.map(() => '?').join(', ');
        const candidates = await pool.query(
          `SELECT id, role, property_id FROM users WHERE id IN (${placeholders})`,
          cleanIds
        );
        const outOfScope = candidates.filter((c) => {
          const cRole = String(c.role || '').toUpperCase();
          if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(cRole)) return false;
          return c.property_id && Number(c.property_id) !== Number(creatorUser.propertyId);
        });
        if (outOfScope.length > 0) {
          throw new ForbiddenError('Managers can only add staff within their authorized property or global executive scope.');
        }
      }
    }

    const group = await ChatRepository.createGroupThread(creatorUser, title, participantIds);

    await AuditService.record({
      actorId: creatorUser.id,
      actorEmail: creatorUser.email,
      actorRole: creatorUser.role,
      action: 'CHAT_GROUP_CREATED',
      entityType: 'chat_thread',
      entityId: String(group.id),
      newValues: { title: group.title, threadType: 'GROUP' },
    });

    const io = getIO();
    if (io && Array.isArray(group.participants)) {
      for (const p of group.participants) {
        io.to(`user:${p.userId}`).emit('thread:created', { thread: group });
      }
    }

    return group;
  }

  /**
   * Soft-delete / archive group thread and notify active participants in real time
   */
  static async deleteGroupThread(threadId, user, reason = null) {
    this.assertEligibleRole(user.role);
    const deleted = await ChatRepository.deleteGroupThread(threadId, user, reason);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'CHAT_GROUP_DELETED',
      entityType: 'chat_thread',
      entityId: String(deleted.id),
      newValues: {
        title: deleted.title,
        status: deleted.status,
        deletedBy: user.id,
        deletedAt: deleted.deletedAt,
        reason: reason || null,
      },
    });

    const io = getIO();
    if (io) {
      const payload = {
        threadId: deleted.id,
        title: deleted.title,
        deletedBy: deleted.deletedBy,
        deletedByName: deleted.deletedByName,
        deletedAt: deleted.deletedAt,
      };
      io.to(`thread:${deleted.id}`).emit('thread:deleted', payload);
      for (const uid of deleted.participantUserIds || []) {
        io.to(`user:${uid}`).emit('thread:deleted', payload);
      }
    }

    return deleted;
  }

  /**
   * Get thread participants list
   */
  static async getThreadParticipants(threadId, user) {
    this.assertEligibleRole(user.role);
    await this.getThreadById(threadId, user);
    return ChatRepository.getThreadParticipants(threadId);
  }

  /**
   * Add participants to group thread
   */
  static async addParticipants(threadId, user, userIds) {
    this.assertEligibleRole(user.role);
    await this.getThreadById(threadId, user);
    return ChatRepository.addParticipants(threadId, userIds, user);
  }

  /**
   * Remove participant from group thread
   */
  static async removeParticipant(threadId, user, targetUserId) {
    this.assertEligibleRole(user.role);
    await this.getThreadById(threadId, user);
    return ChatRepository.removeParticipant(threadId, targetUserId, user);
  }

  /**
   * Create property team channel
   */
  static async createPropertyChannel(creatorUser, { propertyId, title }) {
    this.assertEligibleRole(creatorUser.role);
    const channel = await ChatRepository.createPropertyChannel(creatorUser, propertyId, title);

    await AuditService.record({
      actorId: creatorUser.id,
      actorEmail: creatorUser.email,
      actorRole: creatorUser.role,
      action: 'CHAT_CHANNEL_CREATED',
      entityType: 'chat_thread',
      entityId: String(channel.id),
      newValues: { title: channel.title, propertyId: channel.property_id, threadType: channel.thread_type },
    });

    return channel;
  }

  /**
   * Create system broadcast
   */
  static async createSystemBroadcast(creatorUser, { title, content }) {
    this.assertEligibleRole(creatorUser.role);
    const broadcast = await ChatRepository.createSystemBroadcast(creatorUser, title, content);

    await AuditService.record({
      actorId: creatorUser.id,
      actorEmail: creatorUser.email,
      actorRole: creatorUser.role,
      action: 'CHAT_SYSTEM_BROADCAST_CREATED',
      entityType: 'chat_thread',
      entityId: String(broadcast.threadId),
      newValues: { title: broadcast.title, messageId: broadcast.messageId },
    });

    return broadcast;
  }

  /**
   * Get paginated message history
   */
  static async getThreadHistory(threadId, user, { before = null, limit = 50 } = {}) {
    this.assertEligibleRole(user.role);
    return ChatRepository.getThreadHistory(threadId, user.id, before, limit);
  }

  /**
   * Send / persist message (HTTP or Socket.IO)
   */
  static async sendMessage(user, {
    threadId,
    clientTempId,
    messageType = 'TEXT',
    content,
    priority = 'NORMAL',
    contextEntityType = null,
    contextEntityId = null,
    attachment = null,
  }) {
    this.assertEligibleRole(user.role);

    // Validate context entity scope if context link provided
    if (contextEntityType && contextEntityId) {
      await this.verifyContextScope(user, contextEntityType, contextEntityId);
    }

    // Validate attachment payload & magic bytes if provided (blocks Upload2Shell PS/EPS/SVG/executables)
    let sanitizedAttachment = attachment;
    if (attachment) {
      if (!attachment.originalName || !attachment.fileData) {
        throw new BadRequestError('Invalid attachment: originalName and fileData are required.');
      }
      const MAX_SIZE = 15 * 1024 * 1024; // 15MB limit
      if (attachment.fileSize && attachment.fileSize > MAX_SIZE) {
        throw new BadRequestError('Attachment exceeds maximum allowed size of 15MB.');
      }
      const validated = validateDocumentOrImageUpload({
        fileData: attachment.fileData,
        fileType: attachment.fileType || 'application/octet-stream',
        fileName: attachment.originalName,
        maxSizeBytes: MAX_SIZE,
        label: 'Chat attachment',
      });
      sanitizedAttachment = {
        ...attachment,
        fileData: validated.buffer,
        fileType: validated.mimeType,
        fileSize: validated.buffer.length,
      };
    }

    const message = await ChatRepository.persistMessage({
      threadId,
      senderId: user.id,
      senderRole: user.role,
      clientTempId,
      messageType,
      content,
      priority,
      contextEntityType,
      contextEntityId,
      attachment: sanitizedAttachment,
    });

    return message;
  }

  /**
   * Retrieve attachment with access check
   */
  static async getAttachment(threadId, attachmentId, user) {
    this.assertEligibleRole(user.role);
    await this.getThreadById(threadId, user);
    return ChatRepository.getAttachment(threadId, attachmentId);
  }

  /**
   * Mark messages as read (monotonically) and broadcast real-time receipt update
   */
  static async markAsRead(user, threadId, messageId) {
    this.assertEligibleRole(user.role);
    const result = await ChatRepository.updateReadWatermark(threadId, user.id, messageId);

    const io = getIO();
    if (io) {
      io.to(`thread:${Number(threadId)}`).emit('message:receipt_updated', {
        threadId: Number(threadId),
        userId: Number(user.id),
        readerName: result.readerName,
        readerRole: result.readerRole,
        readerPhotoUrl: result.readerPhotoUrl,
        lastReadMessageId: Number(messageId),
        readAt: result.readAt,
      });
    }

    return result;
  }

  /**
   * Get detailed readers list for a message
   */
  static async getMessageReaders(messageId, user) {
    this.assertEligibleRole(user.role);
    return ChatRepository.getMessageReaders(messageId, user);
  }

  /**
   * Moderate / Soft-delete message
   */
  static async deleteMessage(user, messageId) {
    this.assertEligibleRole(user.role);
    const deleted = await ChatRepository.softDeleteMessage(messageId, user.id, user.role);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'CHAT_MESSAGE_MODERATED',
      entityType: 'chat_message',
      entityId: String(messageId),
      newValues: { isDeleted: true },
    });

    return deleted;
  }

  /**
   * Resolve authorized contextual preview card data
   */
  static async getContextPreview(user, { type, id }) {
    this.assertEligibleRole(user.role);

    if (!type || !id) {
      throw new BadRequestError('Both type and id query parameters are required.');
    }

    const entityType = String(type).toUpperCase();
    const entityId = parseInt(id, 10);
    if (isNaN(entityId)) {
      throw new BadRequestError('Invalid entity id provided.');
    }

    return this.resolveContextPreview(user, entityType, entityId);
  }

  /**
   * Verify caller has permission to view the referenced context record
   */
  static async verifyContextScope(user, entityType, entityId) {
    const preview = await this.resolveContextPreview(user, entityType, entityId);
    return preview;
  }

  /**
   * Internal resolver for context previews with strict property scoping
   */
  static async resolveContextPreview(user, entityType, entityId) {
    const userRole = (user.role || '').toUpperCase();
    const userPropId = user.propertyId ? Number(user.propertyId) : null;
    const isGlobal =
      ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(userRole) ||
      (['MANAGER', 'OPERATIONS_MANAGER'].includes(userRole) && !userPropId);

    switch (entityType) {
      case 'PROPERTY': {
        const [prop] = await pool.query('SELECT id, name, code, city, status FROM properties WHERE id = ?', [entityId]);
        if (!prop) throw new NotFoundError(`Property #${entityId} not found.`);
        if (!isGlobal && userPropId && userPropId !== prop.id) {
          throw new ForbiddenError('Access to property record in another property is denied.');
        }
        return {
          entityType: 'PROPERTY',
          entityId: prop.id,
          title: prop.name,
          subtitle: `${prop.code} • ${prop.city}`,
          status: prop.status,
          badgeColor: prop.status === 'ACTIVE' ? 'success' : 'neutral',
          deepLink: `/app/properties?id=${prop.id}`,
        };
      }

      case 'APARTMENT': {
        const [apt] = await pool.query(
          `SELECT a.id, a.unit_number, a.unit_name, a.unit_type, a.status, a.property_id, p.name AS property_name
           FROM apartments a
           JOIN properties p ON a.property_id = p.id
           WHERE a.id = ?`,
          [entityId]
        );
        if (!apt) throw new NotFoundError(`Apartment unit #${entityId} not found.`);
        if (!isGlobal && userPropId && userPropId !== apt.property_id) {
          throw new ForbiddenError('Access to apartment in another property is denied.');
        }
        return {
          entityType: 'APARTMENT',
          entityId: apt.id,
          title: `Unit ${apt.unit_number} - ${apt.unit_name}`,
          subtitle: `${apt.property_name} • ${apt.unit_type}`,
          status: apt.status,
          badgeColor: apt.status === 'AVAILABLE' ? 'success' : apt.status === 'OCCUPIED' ? 'primary' : 'warning',
          deepLink: `/app/apartments?search=${apt.unit_number}`,
        };
      }

      case 'RESERVATION': {
        const [res] = await pool.query(
          `SELECT r.id, r.reservation_code, r.tenant_name AS guest_name, r.check_in_date, r.check_out_date,
                  r.status, r.property_id, p.name AS property_name, a.unit_number
           FROM reservations r
           JOIN properties p ON r.property_id = p.id
           LEFT JOIN apartments a ON r.apartment_id = a.id
           WHERE r.id = ?`,
          [entityId]
        );
        if (!res) throw new NotFoundError(`Reservation #${entityId} not found.`);
        if (!isGlobal && userPropId && userPropId !== res.property_id) {
          throw new ForbiddenError('Access to reservation record in another property is denied.');
        }
        return {
          entityType: 'RESERVATION',
          entityId: res.id,
          title: `Reservation #${res.reservation_code || res.id}`,
          subtitle: `Guest: ${res.guest_name} • Unit ${res.unit_number || 'N/A'}`,
          status: res.status,
          badgeColor: res.status === 'CONFIRMED' || res.status === 'CHECKED_IN' ? 'success' : 'neutral',
          deepLink: `/app/reservations?search=${res.reservation_code || res.id}`,
        };
      }

      case 'MAINTENANCE': {
        const [maint] = await pool.query(
          `SELECT m.id, m.title, m.priority, m.status, m.property_id, p.name AS property_name
           FROM maintenance_orders m
           JOIN properties p ON m.property_id = p.id
           WHERE m.id = ?`,
          [entityId]
        );
        if (!maint) throw new NotFoundError(`Maintenance order #${entityId} not found.`);
        if (!isGlobal && userPropId && userPropId !== maint.property_id) {
          throw new ForbiddenError('Access to maintenance ticket in another property is denied.');
        }
        return {
          entityType: 'MAINTENANCE',
          entityId: maint.id,
          title: `Maintenance #${maint.id}: ${maint.title}`,
          subtitle: `${maint.property_name} • Priority: ${maint.priority}`,
          status: maint.status,
          badgeColor: maint.priority === 'CRITICAL' ? 'danger' : 'warning',
          deepLink: `/app/maintenance?id=${maint.id}`,
        };
      }

      case 'INSPECTION': {
        const [insp] = await pool.query(
          `SELECT i.id, i.inspection_type, i.status, i.property_id, p.name AS property_name
           FROM inspection_orders i
           JOIN properties p ON i.property_id = p.id
           WHERE i.id = ?`,
          [entityId]
        );
        if (!insp) throw new NotFoundError(`Inspection order #${entityId} not found.`);
        if (!isGlobal && userPropId && userPropId !== insp.property_id) {
          throw new ForbiddenError('Access to inspection record in another property is denied.');
        }
        return {
          entityType: 'INSPECTION',
          entityId: insp.id,
          title: `Inspection #${insp.id} (${insp.inspection_type})`,
          subtitle: `${insp.property_name}`,
          status: insp.status,
          badgeColor: insp.status === 'COMPLETED' ? 'success' : 'info',
          deepLink: `/app/inspections?id=${insp.id}`,
        };
      }

      case 'GUEST': {
        const [guest] = await pool.query(
          'SELECT id, full_name, email, phone, status FROM guest_profiles WHERE id = ?',
          [entityId]
        );
        if (!guest) throw new NotFoundError(`Guest profile #${entityId} not found.`);
        if (!isGlobal) {
          if (!['MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST'].includes(userRole)) {
            throw new ForbiddenError('Access denied: Guest PII preview is restricted to authorized hospitality management and front-desk staff.');
          }
          if (userPropId) {
            const [resMatch] = await pool.query(
              'SELECT id FROM reservations WHERE guest_id = ? AND property_id = ? LIMIT 1',
              [entityId, userPropId]
            );
            if (!resMatch) {
              throw new ForbiddenError('Access to guest profile outside your assigned property scope is denied.');
            }
          }
        }
        return {
          entityType: 'GUEST',
          entityId: guest.id,
          title: `Guest: ${guest.full_name}`,
          subtitle: `${guest.email} • ${guest.phone || 'No phone'}`,
          status: guest.status || 'ACTIVE',
          badgeColor: 'primary',
          deepLink: `/app/guests?search=${encodeURIComponent(guest.email)}`,
        };
      }

      case 'ROSTER_ASSIGNMENT': {
        const [asg] = await pool.query(
          `SELECT rpa.id, rpa.assignment_code, rpa.duty_category, rpa.status, rpa.property_id, rpa.staff_user_id, rpa.assigned_by_id, p.name AS property_name
           FROM roster_property_assignments rpa
           JOIN properties p ON rpa.property_id = p.id
           WHERE rpa.id = ?`,
          [entityId]
        );
        if (!asg) throw new NotFoundError(`Assignment #${entityId} not found.`);
        const canViewAsg =
          isGlobal ||
          Number(asg.staff_user_id) === Number(user.id) ||
          Number(asg.assigned_by_id) === Number(user.id) ||
          (['MANAGER', 'OPERATIONS_MANAGER'].includes(userRole) && (!userPropId || userPropId === Number(asg.property_id)));
        if (!canViewAsg) {
          throw new ForbiddenError('Access to another staff member or property roster assignment is denied.');
        }
        return {
          entityType: 'ROSTER_ASSIGNMENT',
          entityId: asg.id,
          title: `Assignment: ${asg.assignment_code}`,
          subtitle: `${asg.duty_category} • ${asg.property_name}`,
          status: asg.status,
          badgeColor: asg.status === 'ACCEPTED' ? 'success' : asg.status === 'REJECTED' ? 'danger' : 'primary',
          deepLink: `/app/workforce?tab=assignments&id=${asg.id}`,
        };
      }

      case 'TASK': {
        const [task] = await pool.query(
          `SELECT ot.id, ot.task_code, ot.title, ot.status, ot.property_id, ot.assigned_to_id, ot.assigned_by_id, p.name AS property_name
           FROM operational_tasks ot
           JOIN properties p ON ot.property_id = p.id
           WHERE ot.id = ?`,
          [entityId]
        );
        if (!task) throw new NotFoundError(`Task #${entityId} not found.`);
        const canViewTask =
          isGlobal ||
          Number(task.assigned_to_id) === Number(user.id) ||
          Number(task.assigned_by_id) === Number(user.id) ||
          (['MANAGER', 'OPERATIONS_MANAGER'].includes(userRole) && (!userPropId || userPropId === Number(task.property_id)));
        if (!canViewTask) {
          throw new ForbiddenError('Access to operational task outside your assignment or property scope is denied.');
        }
        return {
          entityType: 'TASK',
          entityId: task.id,
          title: `Task: ${task.title}`,
          subtitle: `${task.task_code} • ${task.property_name}`,
          status: task.status,
          badgeColor: task.status === 'COMPLETED' ? 'success' : task.status === 'BLOCKED' ? 'danger' : 'primary',
          deepLink: `/app/workforce?tab=tasks&id=${task.id}`,
        };
      }

      case 'DIRECTIVE': {
        const [dir] = await pool.query(
          'SELECT id, directive_code, title, priority, status, property_id, initiated_by_admin_id, assigned_manager_id FROM operational_directives WHERE id = ?',
          [entityId]
        );
        if (!dir) throw new NotFoundError(`Directive #${entityId} not found.`);
        const canViewDir =
          isGlobal ||
          Number(dir.initiated_by_admin_id) === Number(user.id) ||
          Number(dir.assigned_manager_id) === Number(user.id) ||
          (['MANAGER', 'OPERATIONS_MANAGER'].includes(userRole) && dir.property_id && userPropId === Number(dir.property_id));
        if (!canViewDir) {
          throw new ForbiddenError('Access to operational directive outside your scope is denied.');
        }
        return {
          entityType: 'DIRECTIVE',
          entityId: dir.id,
          title: `Directive: ${dir.title}`,
          subtitle: `${dir.directive_code} • Priority: ${dir.priority}`,
          status: dir.status,
          badgeColor: dir.status === 'COMPLETED' ? 'success' : 'primary',
          deepLink: `/app/operations?tab=directives&id=${dir.id}`,
        };
      }

      case 'QUERY': {
        if (userRole === 'OWNER') {
          throw new ForbiddenError('Disciplinary notices are strictly excluded from executive Owner access.');
        }
        const [qry] = await pool.query(
          'SELECT id, query_code, subject, status, response_deadline_at, property_id, staff_user_id, issued_by_id FROM disciplinary_queries WHERE id = ?',
          [entityId]
        );
        if (!qry) throw new NotFoundError(`Query #${entityId} not found.`);
        const canViewQuery =
          ['SUPER_ADMIN', 'ADMIN'].includes(userRole) ||
          Number(qry.staff_user_id) === Number(user.id) ||
          Number(qry.issued_by_id) === Number(user.id) ||
          (['MANAGER', 'OPERATIONS_MANAGER'].includes(userRole) && (!userPropId || userPropId === Number(qry.property_id)));
        if (!canViewQuery) {
          throw new ForbiddenError('Access to confidential disciplinary record is denied.');
        }
        return {
          entityType: 'QUERY',
          entityId: qry.id,
          title: `Notice: ${qry.subject}`,
          subtitle: `${qry.query_code} • Due: ${new Date(qry.response_deadline_at).toLocaleDateString()}`,
          status: qry.status,
          badgeColor: 'warning',
          deepLink: `/app/performance?tab=queries&id=${qry.id}`,
        };
      }

      case 'OPERATION': {
        const [op] = await pool.query(
          `SELECT co.id, co.operation_code, co.ticket_reference, co.title, co.category, co.priority, co.status,
                  co.deadline_at, co.acknowledgment_deadline_at, co.acknowledgment_sla_hours,
                  co.property_id, co.initiated_by_user_id, co.supervisor_user_id, co.current_responsible_user_id,
                  p.name AS property_name, om.memo_reference, om.id AS memo_id
           FROM central_operations co
           LEFT JOIN properties p ON co.property_id = p.id
           LEFT JOIN operations_memos om ON co.latest_memo_id = om.id
           WHERE co.id = ?`,
          [entityId]
        );
        if (!op) throw new NotFoundError(`Operation #${entityId} not found.`);

        if (!['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(userRole)) {
          const isDirectParty =
            Number(op.initiated_by_user_id) === Number(user.id) ||
            Number(op.supervisor_user_id) === Number(user.id) ||
            Number(op.current_responsible_user_id) === Number(user.id);
          const [recipMatch] = await pool.query(
            'SELECT 1 AS ok FROM central_operation_recipients WHERE operation_id = ? AND user_id = ? LIMIT 1',
            [op.id, user.id]
          );
          const isPropMgr =
            ['MANAGER', 'OPERATIONS_MANAGER'].includes(userRole) &&
            op.property_id &&
            userPropId === Number(op.property_id);
          if (!isDirectParty && !recipMatch && !isPropMgr) {
            throw new ForbiddenError('Access to this operational ticket preview is denied.');
          }
        }

        const refCode = op.ticket_reference || op.operation_code;
        return {
          entityType: 'OPERATION',
          entityId: op.id,
          code: op.operation_code,
          ticketReference: refCode,
          title: `Ticket: ${op.title}`,
          subtitle: `${refCode} • ${(op.category || '').replace(/_/g, ' ')} • ${op.property_name || 'Corporate'}`,
          status: op.status,
          priority: op.priority,
          memoReference: op.memo_reference,
          memoId: op.memo_id,
          deadlineAt: op.deadline_at,
          acknowledgmentDeadlineAt: op.acknowledgment_deadline_at,
          acknowledgmentSlaHours: op.acknowledgment_sla_hours,
          badgeColor: op.priority === 'CRITICAL' ? 'danger' : ['URGENT', 'HIGH'].includes(op.priority) ? 'warning' : 'primary',
          deepLink: `/app/operations?id=${op.id}`,
        };
      }

      case 'MEMO': {
        const [memo] = await pool.query(
          `SELECT om.id, om.memo_reference, om.title, om.category, om.priority, om.version_number,
                  co.id AS operation_id, co.operation_code, co.ticket_reference, co.status,
                  co.property_id, co.initiated_by_user_id, co.supervisor_user_id, co.current_responsible_user_id
           FROM operations_memos om
           JOIN central_operations co ON om.operation_id = co.id
           WHERE om.id = ?`,
          [entityId]
        );
        if (!memo) throw new NotFoundError(`Operations Memo #${entityId} not found.`);

        if (!['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(userRole)) {
          const isDirectParty =
            Number(memo.initiated_by_user_id) === Number(user.id) ||
            Number(memo.supervisor_user_id) === Number(user.id) ||
            Number(memo.current_responsible_user_id) === Number(user.id);
          const [recipMatch] = await pool.query(
            'SELECT 1 AS ok FROM central_operation_recipients WHERE operation_id = ? AND user_id = ? LIMIT 1',
            [memo.operation_id, user.id]
          );
          const isPropMgr =
            ['MANAGER', 'OPERATIONS_MANAGER'].includes(userRole) &&
            memo.property_id &&
            userPropId === Number(memo.property_id);
          if (!isDirectParty && !recipMatch && !isPropMgr) {
            throw new ForbiddenError('Access to this memorandum preview is denied.');
          }
        }

        return {
          entityType: 'MEMO',
          entityId: memo.id,
          code: memo.memo_reference,
          title: `Memo: ${memo.title}`,
          subtitle: `${memo.memo_reference} (v${memo.version_number}) • Ticket: ${memo.ticket_reference || memo.operation_code}`,
          status: memo.status,
          priority: memo.priority,
          operationId: memo.operation_id,
          badgeColor: memo.priority === 'CRITICAL' ? 'danger' : ['URGENT', 'HIGH'].includes(memo.priority) ? 'warning' : 'primary',
          deepLink: `/app/operations?id=${memo.operation_id}`,
          pdfUrl: `/api/v1/workforce/operations/memos/${memo.id}/pdf`,
        };
      }

      default:
        throw new BadRequestError(`Unsupported context entity type: '${entityType}'.`);
    }
  }

  /**
   * Acknowledge an important message or circular
   */
  static async acknowledgeMessage(user, messageId) {
    this.assertEligibleRole(user.role);
    return ChatRepository.acknowledgeMessage(messageId, user.id);
  }

  /**
   * Get pending important messages/circulars for the logged in user
   */
  static async getPendingImportantMessages(user) {
    this.assertEligibleRole(user.role);
    return ChatRepository.getPendingImportantMessages(user.id);
  }

  /**
   * Broadcast Owner Circular to company staff
   */
  static async broadcastOwnerCircular(ownerUser, payload) {
    const role = (ownerUser.role || '').toUpperCase();
    if (!['OWNER', 'SUPER_ADMIN', 'ADMIN'].includes(role)) {
      throw new ForbiddenError('Only the Owner or Executive Admin can issue internal circulars.');
    }
    return ChatRepository.createOwnerCircular(ownerUser, payload);
  }

  /**
   * Retention Policy Management (Admin Only)
   */
  static async getRetentionPolicy(user, propertyId = null) {
    const role = (user.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      throw new ForbiddenError('Only Administrators can view retention governance policies.');
    }
    return ChatRepository.getRetentionPolicy(propertyId);
  }

  static async updateRetentionPolicy(user, { propertyId = null, retentionDays = 0 }) {
    const role = (user.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      throw new ForbiddenError('Only Administrators can modify retention governance policies.');
    }

    const updated = await ChatRepository.updateRetentionPolicy(propertyId, retentionDays, user.id);

    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'CHAT_RETENTION_POLICY_CHANGED',
      entityType: 'chat_retention_policy',
      entityId: String(updated.id || 1),
      newValues: { propertyId, retentionDays },
    });

    return updated;
  }

  /**
   * Publish an idempotent system-generated chat event message & broadcast in real time
   */
  static async publishSystemEventMessage({
    threadId,
    actorUser,
    eventType,
    eventReferenceId,
    content,
    contextEntityType = null,
    contextEntityId = null,
    deepLinkUrl = null,
    metadata = null,
    priority = 'HIGH',
  }) {
    const saved = await ChatRepository.persistMessage({
      threadId,
      senderId: actorUser.id,
      senderRole: actorUser.role,
      clientTempId: eventReferenceId ? `evt:${threadId}:${eventReferenceId}` : undefined,
      messageType: 'SYSTEM_EVENT',
      content,
      priority,
      contextEntityType,
      contextEntityId,
      eventType,
      eventReferenceId,
      deepLinkUrl,
      metadata,
    });

    if (!saved.idempotentReplay) {
      const io = getIO();
      if (io) {
        io.to(`thread:${threadId}`).emit('message:delivered', { threadId, message: saved });
        const participants = await ChatRepository.getThreadParticipants(threadId);
        for (const p of participants) {
          if (Number(p.userId) !== Number(actorUser.id)) {
            io.to(`user:${p.userId}`).emit('message:new_incoming', { threadId, message: saved });
          }
        }
      }
    }

    return saved;
  }

  /**
   * Notify the authorized Management Group (Manager, Owner, Admin, Ops Manager) on property/apartment submission events
   */
  static async notifyManagementGroupOnSubmission({
    submission,
    propertyName,
    apartmentName = null,
    submittedByUser,
    eventType = 'SUBMITTED',
    proposedRate = null,
  }) {
    const recipientRows = await pool.query(
      `SELECT id, name, role, property_id
       FROM users
       WHERE status = 'ACTIVE'
         AND (
           role IN ('OWNER', 'ADMIN', 'SUPER_ADMIN')
           OR (role IN ('OPERATIONS_MANAGER', 'MANAGER') AND (property_id IS NULL OR property_id = ?))
         )`,
      [submission.property_id]
    );

    const recipientIds = Array.from(
      new Set([
        ...recipientRows.map((r) => Number(r.id)),
        Number(submittedByUser.id),
      ])
    ).filter((id) => id > 0);

    const groupThread = await ChatRepository.findOrCreateManagementGroupThread(submittedByUser, recipientIds);
    const existingParts = await ChatRepository.getThreadParticipants(groupThread.id);
    const existingIds = new Set(existingParts.map((p) => Number(p.userId)));
    const missingIds = recipientIds.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      try {
        await ChatRepository.addParticipants(groupThread.id, missingIds, submittedByUser);
      } catch (_) {}
    }

    const isApt = submission.entity_type === 'APARTMENT';
    const subject = isApt
      ? `${propertyName} — ${apartmentName || 'Apartment Unit'}`
      : propertyName;
    const evtKey = String(eventType || 'SUBMITTED').toUpperCase();
    const eventReferenceId = `SUBMISSION:${submission.id}:${evtKey}`;
    const deepLinkUrl = `/app/approvals?submission=${submission.id}`;

    let heading = isApt
      ? 'NEW APARTMENT SUBMITTED — APPROVAL REQUIRED'
      : 'NEW PROPERTY SUBMITTED — APPROVAL REQUIRED';
    let bodyText =
      'A new apartment has been submitted for review. Please open the apartment approval details to inspect the information, review the proposed rate, and take the required action.';

    if (evtKey === 'APPROVED') {
      heading = `${isApt ? 'APARTMENT' : 'PROPERTY'} SUBMISSION APPROVED`;
      bodyText = `Both Owner and Operations Manager have approved ${subject}. Ready for authorized publication.`;
    } else if (evtKey === 'PUBLISHED') {
      heading = `${isApt ? 'APARTMENT' : 'PROPERTY'} PUBLISHED TO PUBLIC WEBSITE`;
      bodyText = `${subject} is now published and live for public booking.`;
    } else if (evtKey === 'CHANGES_REQUESTED') {
      heading = `CHANGES REQUESTED — ${subject}`;
      bodyText = `Reviewer requested changes on ${subject}. Please review the feedback and update the submission.`;
    } else if (evtKey === 'REJECTED') {
      heading = `SUBMISSION REJECTED — ${subject}`;
      bodyText = `Submission ${submission.submission_code} for ${subject} was rejected.`;
    } else if (!isApt) {
      bodyText = 'A new property submission is awaiting Owner and Operations Manager review.';
    }

    const content = [
      heading,
      bodyText,
      `Subject: ${subject}`,
      `Submitted By: ${submittedByUser.name || 'Portal Manager'}`,
      `Status: ${submission.status}`,
      proposedRate != null ? `Proposed Rate: NGN ${Number(proposedRate).toLocaleString('en-NG')}/night` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return this.publishSystemEventMessage({
      threadId: groupThread.id,
      actorUser: submittedByUser,
      eventType: `SUBMISSION_${evtKey}`,
      eventReferenceId,
      content,
      contextEntityType: isApt ? 'APARTMENT_SUBMISSION' : 'PROPERTY_SUBMISSION',
      contextEntityId: Number(submission.id),
      deepLinkUrl,
      priority: 'HIGH',
      metadata: {
        heading,
        submissionId: Number(submission.id),
        submissionCode: submission.submission_code,
        entityType: submission.entity_type,
        propertyId: Number(submission.property_id),
        propertyName,
        apartmentId: submission.apartment_id ? Number(submission.apartment_id) : null,
        apartmentName: apartmentName || null,
        submittedByName: submittedByUser.name || 'Portal Manager',
        submittedAt: submission.submitted_at || new Date().toISOString(),
        approvalStatus: submission.status,
        proposedRate: proposedRate != null ? Number(proposedRate) : null,
        actionLabel: isApt ? 'VIEW APARTMENT DETAILS' : 'VIEW PROPERTY DETAILS',
        deepLinkUrl,
      },
    });
  }

  /**
   * Synchronize read receipt for a system event message and its corresponding notification
   */
  static async syncEventReadState(user, { eventReferenceId = null, submissionId = null, messageId = null } = {}) {
    this.assertEligibleRole(user.role);

    let messages = [];
    if (messageId) {
      messages = await pool.query('SELECT id, thread_id, context_entity_id FROM chat_messages WHERE id = ? LIMIT 1', [Number(messageId)]);
    } else if (eventReferenceId) {
      messages = await pool.query('SELECT id, thread_id, context_entity_id FROM chat_messages WHERE event_reference_id = ?', [String(eventReferenceId)]);
    } else if (submissionId) {
      messages = await pool.query(
        "SELECT id, thread_id, context_entity_id FROM chat_messages WHERE context_entity_type IN ('APARTMENT_SUBMISSION', 'PROPERTY_SUBMISSION') AND context_entity_id = ?",
        [Number(submissionId)]
      );
    }

    const syncedMessages = [];
    for (const m of messages) {
      try {
        const res = await this.markAsRead(user, m.thread_id, m.id);
        syncedMessages.push(res);
      } catch (_) {}
    }

    const targetSubId = submissionId || messages[0]?.context_entity_id || null;
    if (targetSubId) {
      await pool.query(
        `UPDATE notifications
         SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE recipient_id = ?
           AND source_entity_type = 'property_submission'
           AND source_entity_id = ?
           AND is_read = FALSE`,
        [user.id, String(targetSubId)]
      ).catch(() => {});
    }

    return {
      syncedCount: syncedMessages.length,
      syncedMessages,
      submissionId: targetSubId ? Number(targetSubId) : null,
    };
  }

  /**
   * Submit authorized reviewer feedback / change request in chat linked to an apartment/property submission
   * (Never approves or publishes the submission!)
   */
  static async sendSubmissionFeedback(user, { submissionId, threadId = null, replyToMessageId = null, feedbackType = 'GENERAL_FEEDBACK', content }) {
    this.assertEligibleRole(user.role);
    const roleUpper = String(user.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(roleUpper)) {
      throw new ForbiddenError('Only authorized management reviewers can submit submission feedback.');
    }

    const subId = parseInt(submissionId, 10);
    if (!subId || isNaN(subId)) {
      throw new BadRequestError('Valid submissionId is required.');
    }
    const cleanText = String(content || '').trim();
    if (!cleanText) {
      throw new BadRequestError('Feedback content is required.');
    }

    const validFeedbackTypes = ['GENERAL_FEEDBACK', 'REQUEST_CHANGES', 'APPROVAL_CLARIFICATION', 'REJECTION_EXPLANATION'];
    const normFeedbackType = validFeedbackTypes.includes(String(feedbackType || '').toUpperCase())
      ? String(feedbackType).toUpperCase()
      : 'GENERAL_FEEDBACK';

    const subRows = await pool.query(
      `SELECT ps.*, p.name AS property_name, a.unit_name AS apartment_name
       FROM property_submissions ps
       JOIN properties p ON ps.property_id = p.id
       LEFT JOIN apartments a ON ps.apartment_id = a.id
       WHERE ps.id = ? LIMIT 1`,
      [subId]
    );
    if (!subRows || subRows.length === 0) {
      throw new NotFoundError(`Submission #${subId} does not exist.`);
    }
    const sub = subRows[0];

    let targetThreadId = threadId ? parseInt(threadId, 10) : null;
    if (!targetThreadId) {
      const msgRows = await pool.query(
        "SELECT id, thread_id FROM chat_messages WHERE context_entity_type IN ('APARTMENT_SUBMISSION', 'PROPERTY_SUBMISSION') AND context_entity_id = ? ORDER BY id DESC LIMIT 1",
        [subId]
      );
      if (msgRows && msgRows[0]) {
        targetThreadId = Number(msgRows[0].thread_id);
        if (!replyToMessageId) replyToMessageId = Number(msgRows[0].id);
      } else {
        const group = await ChatRepository.findOrCreateManagementGroupThread(user, [Number(sub.submitted_by_id)]);
        targetThreadId = Number(group.id);
      }
    }

    const isApt = sub.entity_type === 'APARTMENT';
    const deepLinkUrl = `/app/approvals?submission=${subId}`;
    const saved = await ChatRepository.persistMessage({
      threadId: targetThreadId,
      senderId: user.id,
      senderRole: user.role,
      messageType: 'FEEDBACK',
      content: cleanText,
      priority: normFeedbackType === 'REQUEST_CHANGES' ? 'HIGH' : 'NORMAL',
      contextEntityType: isApt ? 'APARTMENT_SUBMISSION' : 'PROPERTY_SUBMISSION',
      contextEntityId: subId,
      deepLinkUrl,
      replyToMessageId,
      feedbackType: normFeedbackType,
      metadata: {
        submissionId: subId,
        submissionCode: sub.submission_code,
        feedbackType: normFeedbackType,
        propertyName: sub.property_name,
        apartmentName: sub.apartment_name || null,
        deepLinkUrl,
      },
    });

    await pool.query(
      `INSERT INTO property_review_comments (
         submission_id, property_id, author_id, author_role, target_type, target_id, comment_type, content
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subId,
        sub.property_id,
        user.id,
        roleUpper,
        sub.entity_type || 'PROPERTY',
        sub.apartment_id || sub.property_id,
        normFeedbackType === 'REQUEST_CHANGES' ? 'CORRECTION_REQUIRED' : 'APPROVAL_NOTE',
        cleanText,
      ]
    ).catch(() => {});

    const io = getIO();
    if (io) {
      io.to(`thread:${targetThreadId}`).emit('message:delivered', { threadId: targetThreadId, message: saved });
      const parts = await ChatRepository.getThreadParticipants(targetThreadId);
      for (const p of parts) {
        if (Number(p.userId) !== Number(user.id)) {
          io.to(`user:${p.userId}`).emit('message:new_incoming', { threadId: targetThreadId, message: saved });
        }
      }
    }

    if (sub.submitted_by_id && Number(sub.submitted_by_id) !== Number(user.id)) {
      const NotificationsService = require('../notifications/notifications.service');
      await NotificationsService.dispatchNotification({
        recipientId: sub.submitted_by_id,
        title: `CHAT FEEDBACK (${normFeedbackType.replace(/_/g, ' ')}): ${sub.submission_code}`,
        message: `${user.name || roleUpper}: ${cleanText.slice(0, 180)}`,
        category: 'APPROVAL',
        priority: normFeedbackType === 'REQUEST_CHANGES' ? 'HIGH' : 'NORMAL',
        sourceEntityType: 'property_submission',
        sourceEntityId: String(subId),
        linkUrl: deepLinkUrl,
      }).catch(() => {});
    }

    return saved;
  }
}

module.exports = ChatService;
