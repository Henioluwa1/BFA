const CalendarService = require('./calendar.service');

class CalendarController {
  static async getEvents(req, res, next) {
    try {
      const events = await CalendarService.getCalendarEvents(req.query, req);
      res.status(200).json({
        success: true,
        data: events,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getTimeline(req, res, next) {
    try {
      const timeline = await CalendarService.getTimeline(req.query, req);
      res.status(200).json({
        success: true,
        data: timeline,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CalendarController;
