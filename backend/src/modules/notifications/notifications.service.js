const pool = require('../../db/pool');
const { ValidationError, NotFoundError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');

class NotificationsService {
  /**
   * Get notifications for an authenticated user
   */
  static async getUserNotifications({ user, isRead, category, page = 1, pageSize = 50 } = {}) {
    let sql = `
      SELECT n.* 
      FROM notifications n
      WHERE (n.recipient_id = ? OR n.recipient_role = ? OR (n.recipient_id IS NULL AND n.recipient_role IS NULL))
    `;
    const params = [user.id, user.role];

    if (isRead !== undefined && isRead !== null && isRead !== 'ALL') {
      sql += ' AND n.is_read = ?';
      params.push(isRead === 'true' || isRead === true ? 1 : 0);
    }
    if (category && category !== 'ALL') {
      sql += ' AND n.category = ?';
      params.push(category);
    }

    sql += ' ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?';
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
    params.push(limit, offset);

    const items = await pool.query(sql, params);

    // Unread count
    const [countRow] = await pool.query(
      `SELECT COUNT(*) as unread_count 
       FROM notifications 
       WHERE (recipient_id = ? OR recipient_role = ? OR (recipient_id IS NULL AND recipient_role IS NULL))
         AND is_read = 0`,
      [user.id, user.role]
    );

    return {
      notifications: items,
      unreadCount: parseInt(countRow?.unread_count || 0, 10),
    };
  }

  /**
   * Mark a single notification as read
   */
  static async markAsRead(id, user) {
    const rows = await pool.query('SELECT * FROM notifications WHERE id = ?', [id]);
    if (rows.length === 0) throw new NotFoundError(`Notification #${id} not found.`);

    await pool.query('UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    return { success: true, message: `Notification #${id} marked as read.`, id: parseInt(id, 10), isRead: true };
  }

  /**
   * Get unread count for user
   */
  static async getUnreadCount(user) {
    const [countRow] = await pool.query(
      `SELECT COUNT(*) as unread_count 
       FROM notifications 
       WHERE (recipient_id = ? OR recipient_role = ? OR (recipient_id IS NULL AND recipient_role IS NULL))
         AND is_read = 0`,
      [user.id, user.role]
    );
    return { unreadCount: parseInt(countRow?.unread_count || 0, 10) };
  }

  /**
   * Mark all notifications as read for the user
   */
  static async markAllAsRead(user) {
    await pool.query(
      `UPDATE notifications 
       SET is_read = 1, read_at = CURRENT_TIMESTAMP 
       WHERE (recipient_id = ? OR recipient_role = ? OR (recipient_id IS NULL AND recipient_role IS NULL))
         AND is_read = 0`,
      [user.id, user.role]
    );
    return { success: true, message: 'All notifications marked as read.' };
  }

  /**
   * Create a system notification
   */
  static async dispatchNotification({
    recipientId = null,
    recipientRole = null,
    propertyId = null,
    title,
    message,
    category = 'SYSTEM',
    priority = 'MEDIUM',
    sourceEntityType = null,
    sourceEntityId = null,
    linkUrl = null,
    channel = 'IN_APP',
  }) {
    let normalizedPriority = 'MEDIUM';
    if (typeof priority === 'string' && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority.toUpperCase())) {
      normalizedPriority = priority.toUpperCase();
    } else if (typeof priority === 'number') {
      normalizedPriority = priority >= 10 ? 'HIGH' : priority >= 5 ? 'MEDIUM' : 'LOW';
    }

    const result = await pool.query(
      `INSERT INTO notifications 
       (recipient_id, recipient_role, property_id, title, message, category, priority, source_entity_type, source_entity_id, link_url, channel)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipientId,
        recipientRole,
        propertyId,
        title.trim(),
        message.trim(),
        category,
        normalizedPriority,
        sourceEntityType,
        sourceEntityId ? String(sourceEntityId) : null,
        linkUrl,
        channel,
      ]
    );
    return result.insertId;
  }

  /**
   * Send notification (Service wrapper for tests & modules)
   */
  static async sendNotification({
    userId = null,
    recipientId = null,
    role = null,
    recipientRole = null,
    propertyId = null,
    title,
    message,
    category = 'SYSTEM',
    priority = 'MEDIUM',
    sourceEntityType = null,
    sourceEntityId = null,
    linkUrl = null,
    channel = 'IN_APP',
  }) {
    const targetUserId = userId || recipientId || null;
    const targetRole = role || recipientRole || null;
    const insertId = await this.dispatchNotification({
      recipientId: targetUserId,
      recipientRole: targetRole,
      propertyId,
      title,
      message,
      category,
      priority,
      sourceEntityType,
      sourceEntityId,
      linkUrl,
      channel,
    });
    return {
      id: insertId,
      userId: targetUserId,
      role: targetRole,
      title,
      message,
      category,
      priority,
    };
  }

  /**
   * Get public / portal announcements active for a display location
   */
  static async getActiveAnnouncements({ displayLocation = 'PUBLIC_LANDING', propertyId = null } = {}) {
    let sql = `
      SELECT a.*, p.name as property_name 
      FROM public_announcements a
      LEFT JOIN properties p ON a.property_id = p.id
      WHERE a.is_active = 1 
        AND a.start_date <= CURRENT_DATE() 
        AND a.end_date >= CURRENT_DATE()
    `;
    const params = [];

    if (displayLocation && displayLocation !== 'ALL') {
      sql += ' AND (a.display_location = ? OR a.display_location = "ALL")';
      params.push(displayLocation);
    }
    if (propertyId && propertyId !== 'all') {
      sql += ' AND (a.property_id = ? OR a.property_id IS NULL)';
      params.push(propertyId);
    }

    sql += ' ORDER BY a.priority DESC, a.created_at DESC';
    return pool.query(sql, params);
  }

  /**
   * List all announcements for administrative management
   */
  static async listAllAnnouncements() {
    return pool.query(
      `SELECT a.*, p.name as property_name, u.name as created_by_name 
       FROM public_announcements a 
       LEFT JOIN properties p ON a.property_id = p.id 
       LEFT JOIN users u ON a.created_by_id = u.id 
       ORDER BY a.created_at DESC`
    );
  }

  /**
   * Create public / portal announcement
   */
  static async createAnnouncement({
    title,
    message,
    priority = 'MEDIUM',
    propertyId = null,
    displayLocation = 'PUBLIC_LANDING',
    startDate,
    endDate,
    user,
    req = null,
  }) {
    if (!title || !message || !startDate || !endDate) {
      throw new ValidationError('Title, message, startDate, and endDate are required.');
    }

    let normalizedPriority = 'MEDIUM';
    if (typeof priority === 'string' && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority.toUpperCase())) {
      normalizedPriority = priority.toUpperCase();
    } else if (typeof priority === 'number') {
      normalizedPriority = priority >= 10 ? 'HIGH' : priority >= 5 ? 'MEDIUM' : 'LOW';
    }

    const result = await pool.query(
      `INSERT INTO public_announcements 
       (title, message, priority, property_id, display_location, start_date, end_date, is_active, created_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        title.trim(),
        message.trim(),
        normalizedPriority,
        propertyId && propertyId !== 'all' ? propertyId : null,
        displayLocation,
        startDate,
        endDate,
        user.id,
      ]
    );

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PUBLIC_ANNOUNCEMENT_CREATED',
      entityType: 'announcement',
      entityId: String(result.insertId),
      newValues: { title, displayLocation, startDate, endDate },
    });

    return {
      success: true,
      id: result.insertId,
      announcementId: result.insertId,
      title: title.trim(),
      message: message.trim(),
      priority: normalizedPriority,
      displayLocation,
      startDate,
      endDate,
    };
  }

  /**
   * Toggle announcement active state
   */
  static async toggleAnnouncement(id, isActive, user, req = null) {
    await pool.query('UPDATE public_announcements SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);

    await auditService.record({
      req,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: isActive ? 'PUBLIC_ANNOUNCEMENT_ACTIVATED' : 'PUBLIC_ANNOUNCEMENT_DEACTIVATED',
      entityType: 'announcement',
      entityId: String(id),
    });

    return { success: true, message: `Announcement #${id} status updated.` };
  }
}

module.exports = NotificationsService;
