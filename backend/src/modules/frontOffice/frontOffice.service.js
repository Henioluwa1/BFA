const FrontOfficeRepository = require('./frontOffice.repository');
const ReservationsService = require('../reservations/reservations.service');
const { ForbiddenError } = require('../../core/errors/apiError');

class FrontOfficeService {
  /**
   * Get arrivals
   */
  static async getArrivals(query, req = null) {
    const date = query.date || new Date().toISOString().split('T')[0];
    return FrontOfficeRepository.getArrivals({
      propertyId: query.propertyId,
      date,
      user: req?.user,
    });
  }

  /**
   * Get departures
   */
  static async getDepartures(query, req = null) {
    const date = query.date || new Date().toISOString().split('T')[0];
    return FrontOfficeRepository.getDepartures({
      propertyId: query.propertyId,
      date,
      user: req?.user,
    });
  }

  /**
   * Get current in-house guests
   */
  static async getCurrentGuests(query, req = null) {
    return FrontOfficeRepository.getCurrentGuests({
      propertyId: query.propertyId,
      user: req?.user,
    });
  }

  /**
   * Get front-office operational stats
   */
  static async getOperationalStats(query, req = null) {
    const date = query.date || new Date().toISOString().split('T')[0];
    return FrontOfficeRepository.getOperationalStats({
      propertyId: query.propertyId,
      date,
      user: req?.user,
    });
  }

  /**
   * Perform quick front-office check-in (delegates to central ReservationsService)
   */
  static async quickCheckIn(reservationId, req = null) {
    return ReservationsService.checkInReservation(reservationId, req);
  }

  /**
   * Perform quick front-office check-out (delegates to central ReservationsService)
   */
  static async quickCheckOut(reservationId, req = null) {
    return ReservationsService.checkOutReservation(reservationId, req);
  }

  /**
   * Perform quick front-office no-show (delegates to central ReservationsService)
   */
  static async quickNoShow(reservationId, data, req = null) {
    return ReservationsService.noShowReservation(reservationId, data, req);
  }
}

module.exports = FrontOfficeService;
