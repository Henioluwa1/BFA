const ChatRepository = require('./chat.repository');
const pool = require('../../db/pool');
const AuditService = require('../../core/audit/audit.service');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');

const ELIGIBLE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF'];

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
  static async getThreadHistory(threadId, user, { before = null, limit = 30 } = {}) {
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
    contextEntityType = null,
    contextEntityId = null,
  }) {
    this.assertEligibleRole(user.role);

    // Validate context entity scope if context link provided
    if (contextEntityType && contextEntityId) {
      await this.verifyContextScope(user, contextEntityType, contextEntityId);
    }

    const message = await ChatRepository.persistMessage({
      threadId,
      senderId: user.id,
      senderRole: user.role,
      clientTempId,
      messageType,
      content,
      contextEntityType,
      contextEntityId,
    });

    return message;
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
    const isGlobal = ['SUPER_ADMIN', 'ADMIN'].includes(userRole) || (userRole === 'MANAGER' && !userPropId);

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

      default:
        throw new BadRequestError(`Unsupported context entity type: '${entityType}'.`);
    }
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
