const ReservationsRepository = require('./reservations.repository');
const ApartmentsRepository = require('../apartments/apartments.repository');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ConflictError, NotFoundError } = require('../../core/errors/apiError');

class ReservationsService {
  /**
   * Validate the mandatory BFA One-Night Maximum Rule
   * check_out_date MUST be exactly check_in_date + 1 day
   */
  static validateOneNightStay(checkInDateStr, checkOutDateStr) {
    if (!checkInDateStr || !checkOutDateStr) {
      throw new ValidationError('Both check_in_date and check_out_date are required in YYYY-MM-DD format.');
    }

    const checkIn = new Date(checkInDateStr + 'T00:00:00Z');
    const checkOut = new Date(checkOutDateStr + 'T00:00:00Z');

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      throw new ValidationError('Invalid date format provided. Expected format is YYYY-MM-DD.');
    }

    const diffMs = checkOut.getTime() - checkIn.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      throw new ValidationError(
        'Invalid reservation dates: Check-out must be after check-in (same-day and zero-night stays are prohibited).'
      );
    }

    // MANDATORY SECTION 16: An apartment/unit may be booked for ONE NIGHT ONLY.
    if (diffDays > 1) {
      throw new ValidationError(
        `BFA Business Rule Violation: Reservations are strictly limited to a maximum of 1 night. Requested duration: ${diffDays} nights.`
      );
    }

    return { nights: 1 };
  }

  /**
   * Create a new reservation with double-booking prevention and audit trail
   */
  static async createReservation(data, req = null) {
    // 1. Enforce the One-Night Maximum Stay Rule
    ReservationsService.validateOneNightStay(data.check_in_date, data.check_out_date);

    // 2. Validate apartment exists
    const apartment = await ApartmentsRepository.findById(data.apartment_id);
    if (!apartment) {
      throw new NotFoundError(`Apartment unit #${data.apartment_id} not found.`);
    }

    // 3. Double-Booking Prevention: Check unit availability for requested check-in date
    const isAvailable = await ReservationsRepository.checkAvailability(data.apartment_id, data.check_in_date);
    if (!isAvailable) {
      throw new ConflictError(
        `Apartment unit '${apartment.unit_name}' is already booked or unavailable for ${data.check_in_date}. Double booking is strictly prohibited.`
      );
    }

    // 4. Generate unique reservation code
    const reservationCode = `RES-${apartment.property_code || 'BFA'}-${Date.now().toString().slice(-6)}`;

    // Calculate total
    const totalAmount = data.total_amount || apartment.rate_per_night;

    const newReservationData = {
      reservation_code: reservationCode,
      property_id: apartment.property_id,
      apartment_id: apartment.id,
      tenant_name: data.tenant_name,
      tenant_email: data.tenant_email,
      tenant_phone: data.tenant_phone,
      agent_id: data.agent_id || req?.user?.agentId || null,
      check_in_date: data.check_in_date,
      check_out_date: data.check_out_date,
      nights: 1,
      total_amount: totalAmount,
      paid_amount: data.paid_amount || 0.00,
      status: 'CONFIRMED',
    };

    const insertedId = await ReservationsRepository.create(newReservationData);
    const createdReservation = await ReservationsRepository.findById(insertedId);

    // 5. Record Audit Event
    await AuditService.record({
      req,
      action: 'RESERVATION_CREATED',
      entityType: 'reservation',
      entityId: insertedId,
      newValues: {
        code: reservationCode,
        tenant: data.tenant_name,
        propertyId: apartment.property_id,
        apartmentId: apartment.id,
        dates: `${data.check_in_date} -> ${data.check_out_date}`,
        nights: 1,
        total: totalAmount,
      },
    });

    return createdReservation;
  }
}

module.exports = ReservationsService;
