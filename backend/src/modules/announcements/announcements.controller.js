const NotificationsService = require('../notifications/notifications.service');
const ApiResponse = require('../../utils/apiResponse');

class AnnouncementsController {
  static async getActive(req, res, next) {
    try {
      const { location, propertyId } = req.query;
      const data = await NotificationsService.getActiveAnnouncements({
        displayLocation: location,
        propertyId,
      });
      return ApiResponse.success(res, {
        message: 'Active announcements retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listAll(req, res, next) {
    try {
      const data = await NotificationsService.listAllAnnouncements();
      return ApiResponse.success(res, {
        message: 'All announcements retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const result = await NotificationsService.createAnnouncement({
        ...req.body,
        user: req.user,
        req,
      });
      return ApiResponse.created(res, {
        message: 'Announcement created successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async toggle(req, res, next) {
    try {
      const { isActive } = req.body;
      const result = await NotificationsService.toggleAnnouncement(
        req.params.id,
        Boolean(isActive),
        req.user,
        req
      );
      return ApiResponse.success(res, {
        message: 'Announcement updated successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AnnouncementsController;
