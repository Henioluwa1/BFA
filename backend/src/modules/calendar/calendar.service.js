const CalendarRepository = require('./calendar.repository');
const { ValidationError, ForbiddenError } = require('../../core/errors/apiError');

class CalendarService {
  /**
   * Get calendar events
   */
  static async getCalendarEvents(query, req = null) {
    let fromDate = query.fromDate || query.start;
    let toDate = query.toDate || query.end;

    // Default to current month +/- 15 days if dates not provided
    if (!fromDate || !toDate) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      fromDate = fromDate || firstDay.toISOString().split('T')[0];
      toDate = toDate || lastDay.toISOString().split('T')[0];
    }

    // Property scope check
    if (req?.user?.role === 'MANAGER' && req.user.propertyId) {
      if (query.propertyId && query.propertyId !== 'all' && parseInt(query.propertyId, 10) !== parseInt(req.user.propertyId, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization for this property.');
      }
    }

    return CalendarRepository.getEvents({
      propertyId: query.propertyId,
      apartmentId: query.apartmentId,
      status: query.status,
      agentId: query.agentId,
      fromDate,
      toDate,
      user: req?.user,
    });
  }

  /**
   * Get unit availability timeline
   */
  static async getTimeline(query, req = null) {
    let startDate = query.startDate || query.fromDate;
    let endDate = query.endDate || query.toDate;

    if (!startDate || !endDate) {
      const now = new Date();
      startDate = startDate || new Date(now.setDate(now.getDate() - 2)).toISOString().split('T')[0];
      endDate = endDate || new Date(now.setDate(now.getDate() + 14)).toISOString().split('T')[0];
    }

    return CalendarRepository.getUnitTimeline({
      propertyId: query.propertyId,
      startDate,
      endDate,
      user: req?.user,
    });
  }
}

module.exports = CalendarService;
