const AnalyticsRepository = require('./analytics.repository');

class AnalyticsService {
  static async getOverview(query, req = null) {
    return AnalyticsRepository.getOverview({
      ...query,
      user: req?.user,
    });
  }

  static async getReservations(query, req = null) {
    return AnalyticsRepository.getReservations({
      ...query,
      user: req?.user,
    });
  }

  static async getApartments(query, req = null) {
    return AnalyticsRepository.getApartments({
      ...query,
      user: req?.user,
    });
  }

  static async getAgents(query, req = null) {
    return AnalyticsRepository.getAgents({
      ...query,
      user: req?.user,
    });
  }

  static async getOperations(query, req = null) {
    return AnalyticsRepository.getOperations({
      ...query,
      user: req?.user,
    });
  }
}

module.exports = AnalyticsService;
