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

const ELIGIBLE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'OPERATIONS_MANAGER',
  'OWNER',
  'RECEPTIONIST',
  'STAFF',
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
   * Create group thread with multiple staff participants
   */
  static async createGroupThread(creatorUser, { title, participantIds }) {
    this.assertEligibleRole(creatorUser.role);
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

    return group;
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
   * Mark messages as read (monotonically)
   */
  static async markAsRead(user, threadId, messageId) {
    this.assertEligibleRole(user.role);
    return ChatRepository.updateReadWatermark(threadId, user.id, messageId);
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
}

module.exports = ChatService;
