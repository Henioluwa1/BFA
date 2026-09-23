const NotificationsService = require('./notifications.service');
const ApiResponse = require('../../utils/apiResponse');

class NotificationsController {
  static async getMyNotifications(req, res, next) {
    try {
      const { isRead, category, page, pageSize } = req.query;
      const data = await NotificationsService.getUserNotifications({
        user: req.user,
        isRead,
        category,
        page,
        pageSize,
      });
      return ApiResponse.success(res, {
        message: 'Notifications retrieved.',
        data: data.notifications,
        unreadCount: data.unreadCount,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getUnreadCount(req, res, next) {
    try {
      const data = await NotificationsService.getUnreadCount(req.user);
      return ApiResponse.success(res, {
        message: 'Unread count retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async markRead(req, res, next) {
    try {
      const result = await NotificationsService.markAsRead(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async markAllRead(req, res, next) {
    try {
      const result = await NotificationsService.markAllAsRead(req.user);
      return ApiResponse.success(res, {
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = NotificationsController;
