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
   * Get pending incoming bookings awaiting front-desk assignment and approval
   */
  static async getPendingBookings(query, req = null) {
    return FrontOfficeRepository.getPendingBookings({
      propertyId: query.propertyId,
      user: req?.user,
    });
  }

  /**
   * Get unclaimed incoming bookings for global booking alert modal
   */
  static async getUnclaimedBookings(query = {}, req = null) {
    return FrontOfficeRepository.getUnclaimedBookings({
      propertyId: query.propertyId,
      user: req?.user,
    });
  }

  /**
   * Get live operational activity feed for Managers and Admins
   */
  static async getLiveOperationalFeed(query, req = null) {
    return FrontOfficeRepository.getLiveOperationalFeed({
      propertyId: query.propertyId,
      user: req?.user,
      limit: query.limit || 25,
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
   * Accept client and approve booking at front desk
   * Concurrency-guarded: One client cannot be assigned to two front desk staffs
   */
  static async acceptReservation(reservationId, req = null) {
    return ReservationsService.acceptReservation(reservationId, req);
  }

  /**
   * Atomic Claim: Front-desk receptionist claims incoming booking
   */
  static async claimReservation(reservationId, req = null) {
    return ReservationsService.claimReservation(reservationId, req);
  }

  /**
   * Payment Verification & Final Approval by Front Desk
   */
  static async approveReservation(reservationId, req = null) {
    return ReservationsService.approveReservation(reservationId, req);
  }

  /**
   * Decline Reservation with structured reason
   */
  static async declineReservation(reservationId, data = {}, req = null) {
    return ReservationsService.declineReservation(reservationId, data, req);
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

  /**
   * Scoped search by guest full name or booking number
   */
  static async searchBookings(query, req = null) {
    return FrontOfficeRepository.searchBookings({
      q: query.q || query.search || '',
      propertyId: query.propertyId,
      user: req?.user,
    });
  }

  /**
   * Manager/Admin: Reassign a booking to another active receptionist, preserving history
   */
  static async reassignReservation(reservationId, { newReceptionistId, reason }, req = null) {
    const pool = require('../../db/pool');
    const AuditService = require('../../core/audit/audit.service');
    const { BadRequestError, NotFoundError } = require('../../core/errors/apiError');

    if (!newReceptionistId) {
      throw new BadRequestError('Target receptionist ID is required for reassignment.');
    }

    return pool.withTransaction(async (conn) => {
      const [resRows] = await conn.query('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [reservationId]);
      if (!resRows || resRows.length === 0) throw new NotFoundError(`Reservation #${reservationId} not found.`);
      const reservation = resRows[0];

      ReservationsService.validatePropertyScope(req?.user, reservation.property_id);

      const [targetRows] = await conn.query(
        "SELECT id, name, role, property_id, status FROM users WHERE id = ? AND status = 'ACTIVE' LIMIT 1",
        [newReceptionistId]
      );
      if (!targetRows || targetRows.length === 0) {
        throw new NotFoundError('Target receptionist not found or not active.');
      }
      const target = targetRows[0];

      await conn.query(
        'UPDATE reservations SET assigned_staff_id = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
        [target.id, req?.user?.id || null, reservation.id]
      );

      await conn.query(
        'UPDATE reservation_staff_assignments SET is_active = FALSE, ended_at = NOW() WHERE reservation_id = ? AND is_active = TRUE',
        [reservation.id]
      );
      await conn.query(
        `INSERT INTO reservation_staff_assignments (
           reservation_id, property_id, assigned_receptionist_id, assigned_by_id,
           assignment_type, service_status, is_active, claimed_at
         ) VALUES (?, ?, ?, ?, 'MANAGER_REASSIGNMENT', 'CLAIMED', TRUE, NOW())`,
        [reservation.id, reservation.property_id, target.id, req?.user?.id || target.id]
      );

      await AuditService.record({
        req,
        action: 'BOOKING_REASSIGNED',
        entityType: 'reservation',
        entityId: String(reservation.id),
        oldValues: { assigned_staff_id: reservation.assigned_staff_id },
        newValues: { assigned_staff_id: target.id, reason: reason || 'Manager reassignment' },
      });

      return { reservationId: reservation.id, assignedStaffId: target.id, assignedStaffName: target.name };
    });
  }
}

module.exports = FrontOfficeService;
