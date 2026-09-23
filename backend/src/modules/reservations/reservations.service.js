const pool = require('../../db/pool');
const ReservationsRepository = require('./reservations.repository');
const ApartmentsRepository = require('../apartments/apartments.repository');
const PropertiesRepository = require('../properties/properties.repository');
const BookingAuthService = require('../bookingAuth/bookingAuth.service');
const AuditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');
const logger = require('../../utils/logger');

class ReservationsService {
  /**
   * Validate the mandatory BFA One-Night Rule
   * Every reservation is strictly one night: check_out_date = check_in_date + 1 day
   */
  static validateOneNightStay(checkInDateStr, checkOutDateStr) {
    if (!checkInDateStr) {
      throw new ValidationError('check_in_date is required in YYYY-MM-DD format.');
    }

    const checkIn = new Date(checkInDateStr + 'T00:00:00Z');
    if (isNaN(checkIn.getTime())) {
      throw new ValidationError('Invalid check_in_date format. Expected YYYY-MM-DD.');
    }

    // Auto-calculate check-out date if not provided
    if (!checkOutDateStr) {
      const autoOut = new Date(checkIn);
      autoOut.setUTCDate(autoOut.getUTCDate() + 1);
      checkOutDateStr = autoOut.toISOString().split('T')[0];
    }

    const checkOut = new Date(checkOutDateStr + 'T00:00:00Z');
    if (isNaN(checkOut.getTime())) {
      throw new ValidationError('Invalid check_out_date format. Expected YYYY-MM-DD.');
    }

    const diffMs = checkOut.getTime() - checkIn.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      throw new ValidationError(
        'Invalid reservation dates: Check-out must be after check-in (same-day and zero-night stays are prohibited).'
      );
    }

    if (diffDays > 1) {
      throw new ValidationError(
        `BFA Business Rule Violation: Reservations are strictly limited to a maximum of 1 night. Requested duration: ${diffDays} nights.`
      );
    }

    return {
      checkInDate: checkInDateStr,
      checkOutDate: checkOutDateStr,
      nights: 1,
    };
  }

  /**
   * Validate user's property scope
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return true;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return true;
    }
    if (['MANAGER', 'RECEPTIONIST', 'STAFF'].includes(role) && user.propertyId) {
      if (parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization for this property.');
      }
    }
    return true;
  }

  /**
   * Authoritative Availability Check
   * Considers:
   * 1. Existing active reservations (CONFIRMED, CHECKED_IN, PENDING)
   * 2. Apartment operational status (MAINTENANCE, OUT_OF_SERVICE, BLOCKED)
   * 3. Property operational status (ACTIVE)
   * 4. Blocked periods
   */
  static async checkAvailability({ apartmentId, checkInDate, excludeReservationId = null }) {
    if (!apartmentId || !checkInDate) {
      throw new ValidationError('apartmentId and checkInDate are required.');
    }

    const { checkInDate: validIn, checkOutDate: validOut } = this.validateOneNightStay(checkInDate);

    // 1. Fetch apartment & property details
    const apartment = await ApartmentsRepository.findById(apartmentId);
    if (!apartment) {
      throw new NotFoundError(`Apartment unit #${apartmentId} not found.`);
    }

    // 2. Verify property status
    if (apartment.property_status !== 'ACTIVE') {
      return {
        isAvailable: false,
        reason: `Property '${apartment.property_name}' is currently ${apartment.property_status}. Booking is not permitted.`,
        apartment,
      };
    }

    // 3. Verify apartment operational status
    const blockedStatuses = ['MAINTENANCE', 'OUT_OF_SERVICE', 'BLOCKED'];
    if (blockedStatuses.includes(apartment.status) || apartment.is_active === 0) {
      return {
        isAvailable: false,
        reason: `Apartment '${apartment.unit_name}' is currently ${apartment.status}. Booking is not permitted.`,
        apartment,
      };
    }

    // 4. Verify blocked periods
    const blockedRows = await pool.query(
      `SELECT id, reason FROM blocked_periods 
       WHERE apartment_id = ? 
         AND start_date <= ? 
         AND end_date >= ?`,
      [apartmentId, validIn, validIn]
    );
    if (blockedRows.length > 0) {
      return {
        isAvailable: false,
        reason: `Apartment is under maintenance or blocked: ${blockedRows[0].reason || 'Operational block'}.`,
        apartment,
      };
    }

    // 5. Verify conflicting active reservations
    const isConflictFree = await ReservationsRepository.checkAvailability(apartmentId, validIn, excludeReservationId);
    if (!isConflictFree) {
      return {
        isAvailable: false,
        reason: `Apartment is already reserved for ${validIn}.`,
        apartment,
      };
    }

    return {
      isAvailable: true,
      reason: 'Unit is available for the requested date.',
      apartment,
      checkInDate: validIn,
      checkOutDate: validOut,
      ratePerNight: parseFloat(apartment.rate_per_night),
      totalAmount: parseFloat(apartment.rate_per_night),
      nights: 1,
    };
  }

  /**
   * Concurrency-safe, Transactional Reservation Creation
   * Used by internal staff, admin, receptionists, managers, agents, and public booking.
   */
  static async createReservation(data, req = null) {
    const reservationId = await pool.withTransaction(async (conn) => {
      // 1. Validate mandatory 1-night stay
      const { checkInDate, checkOutDate } = this.validateOneNightStay(data.check_in_date, data.check_out_date);

      // 2. Fetch and lock unit with exclusive row lock to serialize concurrent bookings
      const [aptRows] = await conn.query(
        `SELECT a.*, p.name as property_name, p.status as property_status, p.code as property_code 
         FROM apartments a 
         JOIN properties p ON p.id = a.property_id 
         WHERE a.id = ? FOR UPDATE`,
        [data.apartment_id]
      );
      if (!aptRows || aptRows.length === 0) {
        throw new NotFoundError(`Apartment unit #${data.apartment_id} not found.`);
      }
      const apartment = aptRows[0];

      // 3. Property scope authorization
      this.validatePropertyScope(req?.user, apartment.property_id);

      // 4. Agent isolation: if user is AGENT, force their assigned agentId
      let agentId = data.agent_id || null;
      if (req?.user?.role === 'AGENT') {
        agentId = req.user.agentId || 1;
      }

      // 5. Property operational check
      if (apartment.property_status !== 'ACTIVE') {
        throw new ConflictError(
          `Cannot create reservation: Property '${apartment.property_name}' is currently ${apartment.property_status}.`
        );
      }

      // 6. Unit operational check
      const blockedStatuses = ['MAINTENANCE', 'OUT_OF_SERVICE', 'BLOCKED'];
      if (blockedStatuses.includes(apartment.status) || apartment.is_active === 0) {
        throw new ConflictError(
          `Cannot create reservation: Unit '${apartment.unit_name}' is currently in ${apartment.status} state.`
        );
      }

      // 7. Check blocked periods with conn
      const [blockedRows] = await conn.query(
        `SELECT id, reason FROM blocked_periods 
         WHERE apartment_id = ? 
           AND start_date <= ? 
           AND end_date >= ?`,
        [apartment.id, checkInDate, checkInDate]
      );
      if (blockedRows.length > 0) {
        throw new ConflictError(
          `Unit is blocked for maintenance or operational reasons: ${blockedRows[0].reason || 'Blocked period'}`
        );
      }

      // 8. DOUBLE-BOOKING PREVENTION (Row-Level Locking on Active Conflicting Reservations)
      const isAvailable = await ReservationsRepository.checkAvailabilityWithLock(conn, apartment.id, checkInDate);
      if (!isAvailable) {
        throw new ConflictError(
          `Double-booking conflict: Unit '${apartment.unit_name}' (${apartment.unit_number}) is already reserved for ${checkInDate}.`
        );
      }

      // 9. Generate unique, collision-resistant confirmation code
      const reservationCode = `BFA-${apartment.property_code || 'RES'}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

      // 10. Financial calculations
      const ratePerNight = parseFloat(apartment.rate_per_night);
      const totalAmount = data.total_amount ? parseFloat(data.total_amount) : ratePerNight;
      const paidAmount = data.paid_amount ? parseFloat(data.paid_amount) : 0.00;
      const initialStatus = data.status || 'CONFIRMED';
      const paymentStatus = data.payment_status || (paidAmount >= totalAmount ? 'PAYMENT_SUCCESS' : 'PAYMENT_PENDING');
      const paymentMethod = data.payment_method || 'PAY_AT_PROPERTY';

      // 10b. Authoritative Guest Profile Linkage & Resolution
      let guestId = data.guest_id || null;
      const tenantEmail = (data.tenant_email || data.guest_email || '').trim().toLowerCase();
      const tenantPhone = (data.tenant_phone || data.guest_phone || '').trim();
      const tenantName = (data.tenant_name || data.guest_name || 'Guest').trim();

      if (!guestId && tenantEmail) {
        const [existingGuests] = await conn.query('SELECT id FROM guests WHERE email = ?', [tenantEmail]);
        if (existingGuests && existingGuests.length > 0) {
          guestId = existingGuests[0].id;
        } else {
          const parts = tenantName.split(' ');
          const firstName = parts[0] || 'Guest';
          const lastName = parts.slice(1).join(' ') || 'Tenant';
          const [newGuest] = await conn.query(
            `INSERT INTO guests (first_name, last_name, display_name, email, phone, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [firstName, lastName, tenantName, tenantEmail, tenantPhone, req?.user?.id || null]
          );
          guestId = newGuest.insertId;
        }
      }

      // 11. Insert reservation record within transaction
      const newReservationData = {
        reservation_code: reservationCode,
        property_id: apartment.property_id,
        apartment_id: apartment.id,
        guest_id: guestId,
        tenant_name: tenantName,
        tenant_email: tenantEmail,
        tenant_phone: tenantPhone,
        agent_id: agentId,
        source: data.source || (req?.user ? 'DIRECT' : 'ONLINE'),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        nights: 1,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        status: initialStatus,
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        special_requests: data.special_requests || null,
        notes: data.notes || null,
        created_by: req?.user?.id || null,
      };

      if (!newReservationData.tenant_name || !newReservationData.tenant_email || !newReservationData.tenant_phone) {
        throw new ValidationError('Tenant/guest name, email, and phone number are required.');
      }

      const reservationId = await ReservationsRepository.create(newReservationData, conn);

      // 12. Record initial status history
      await ReservationsRepository.recordStatusHistory(
        {
          reservationId,
          fromStatus: null,
          toStatus: initialStatus,
          actorId: req?.user?.id || null,
          actorRole: req?.user?.role || 'PUBLIC_GUEST',
          notes: 'Reservation created in system',
        },
        conn
      );

      // 13. Register Booking Authentication Code
      const authCode = await BookingAuthService.registerBookingAuth(
        {
          reservationId,
          guestEmail: newReservationData.tenant_email,
          guestPhone: newReservationData.tenant_phone,
        },
        conn
      );

      // 14. Audit log event
      await AuditService.record({
        req,
        actorId: req?.user?.id || null,
        actorRole: req?.user?.role || 'PUBLIC_GUEST',
        actorEmail: req?.user?.email || newReservationData.tenant_email,
        action: 'RESERVATION_CREATED',
        entityType: 'reservation',
        entityId: reservationId,
        newValues: {
          code: reservationCode,
          authCode,
          propertyId: apartment.property_id,
          apartmentId: apartment.id,
          unitNumber: apartment.unit_number,
          tenant: newReservationData.tenant_name,
          dates: `${checkInDate} -> ${checkOutDate}`,
          total: totalAmount,
          paid: paidAmount,
          status: initialStatus,
          paymentStatus,
        },
      });

      // 15. Notifications dispatch (non-blocking)
      try {
        await NotificationsService.dispatchNotification({
          recipientRole: 'STAFF',
          propertyId: apartment.property_id,
          title: `Reservation Confirmed: ${reservationCode}`,
          message: `Dear ${newReservationData.tenant_name}, your reservation at ${apartment.property_name} (Unit ${apartment.unit_number}) for ${checkInDate} is confirmed. Booking Auth Code: ${authCode}`,
          category: 'RESERVATION',
          priority: 'HIGH',
          sourceEntityType: 'reservation',
          sourceEntityId: reservationId,
        });
      } catch (notifErr) {
        logger.warn('Failed to dispatch reservation notification:', { error: notifErr.message });
      }

      return reservationId;
    });

    return await ReservationsRepository.findById(reservationId);
  }

  /**
   * Update reservation details (with transactional availability re-check if date/unit changed)
   */
  static async updateReservation(id, data, req = null) {
    await pool.withTransaction(async (conn) => {
      const existing = await ReservationsRepository.findById(id);
      if (!existing) {
        throw new NotFoundError(`Reservation #${id} not found.`);
      }

      // Property scope check
      this.validatePropertyScope(req?.user, existing.property_id);

      // Agent isolation
      if (req?.user?.role === 'AGENT' && existing.agent_id !== req.user.agentId) {
        throw new ForbiddenError('Access denied: You are not authorized to update this reservation.');
      }

      const updateData = {};
      let recheckAvailability = false;
      const targetApartmentId = data.apartment_id ? parseInt(data.apartment_id, 10) : existing.apartment_id;
      const targetCheckIn = data.check_in_date || existing.check_in_date;

      if (data.check_in_date && data.check_in_date !== existing.check_in_date) {
        recheckAvailability = true;
      }
      if (data.apartment_id && parseInt(data.apartment_id, 10) !== existing.apartment_id) {
        recheckAvailability = true;
      }

      if (recheckAvailability) {
        // Enforce 1-night stay on updated dates
        const { checkInDate, checkOutDate } = this.validateOneNightStay(targetCheckIn, data.check_out_date);
        updateData.check_in_date = checkInDate;
        updateData.check_out_date = checkOutDate;
        updateData.apartment_id = targetApartmentId;

        // Verify target unit exists
        const targetUnit = await ApartmentsRepository.findById(targetApartmentId);
        if (!targetUnit) {
          throw new NotFoundError(`Target unit #${targetApartmentId} not found.`);
        }
        updateData.property_id = targetUnit.property_id;

        // Concurrency lock check excluding current reservation
        const isFree = await ReservationsRepository.checkAvailabilityWithLock(conn, targetApartmentId, checkInDate, id);
        if (!isFree) {
          throw new ConflictError(
            `Cannot update reservation: Unit '${targetUnit.unit_name}' is already booked for ${checkInDate}.`
          );
        }
      }

      if (data.tenant_name) updateData.tenant_name = data.tenant_name.trim();
      if (data.tenant_email) updateData.tenant_email = data.tenant_email.trim().toLowerCase();
      if (data.tenant_phone) updateData.tenant_phone = data.tenant_phone.trim();
      if (data.special_requests !== undefined) updateData.special_requests = data.special_requests;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.total_amount !== undefined) updateData.total_amount = parseFloat(data.total_amount);
      if (data.paid_amount !== undefined) updateData.paid_amount = parseFloat(data.paid_amount);
      if (data.payment_status !== undefined) updateData.payment_status = data.payment_status;
      if (data.payment_method !== undefined) updateData.payment_method = data.payment_method;
      updateData.updated_by = req?.user?.id || null;

      await ReservationsRepository.update(id, updateData, conn);

      // Audit log
      await AuditService.record({
        req,
        action: 'RESERVATION_UPDATED',
        entityType: 'reservation',
        entityId: id,
        oldValues: {
          checkIn: existing.check_in_date,
          unitId: existing.apartment_id,
          total: existing.total_amount,
        },
        newValues: updateData,
      });
    });

    return ReservationsRepository.findById(id);
  }

  /**
   * Confirm a PENDING reservation
   */
  static async confirmReservation(id, req = null) {
    const reservation = await ReservationsRepository.findById(id);
    if (!reservation) {
      throw new NotFoundError(`Reservation #${id} not found.`);
    }

    this.validatePropertyScope(req?.user, reservation.property_id);

    if (reservation.status !== 'PENDING') {
      throw new ValidationError(
        `Cannot confirm reservation: Current status is '${reservation.status}'. Only PENDING reservations can be confirmed.`
      );
    }

    await ReservationsRepository.update(id, {
      status: 'CONFIRMED',
      updated_by: req?.user?.id || null,
    });

    await ReservationsRepository.recordStatusHistory({
      reservationId: id,
      fromStatus: 'PENDING',
      toStatus: 'CONFIRMED',
      actorId: req?.user?.id || null,
      actorRole: req?.user?.role || 'STAFF',
      notes: 'Reservation confirmed by staff/admin',
    });

    // Ensure booking auth code is active
    await BookingAuthService.registerBookingAuth({
      reservationId: id,
      guestEmail: reservation.tenant_email,
      guestPhone: reservation.tenant_phone,
    });

    await AuditService.record({
      req,
      action: 'RESERVATION_CONFIRMED',
      entityType: 'reservation',
      entityId: id,
      newValues: { status: 'CONFIRMED' },
    });

    return ReservationsRepository.findById(id);
  }

  /**
   * Cancel an active reservation (PENDING or CONFIRMED)
   */
  static async cancelReservation(id, { reason = 'Cancelled by guest/management' } = {}, req = null) {
    const reservation = await ReservationsRepository.findById(id);
    if (!reservation) {
      throw new NotFoundError(`Reservation #${id} not found.`);
    }

    this.validatePropertyScope(req?.user, reservation.property_id);

    if (['COMPLETED', 'CANCELLED'].includes(reservation.status)) {
      throw new ValidationError(`Cannot cancel reservation: Current status is already '${reservation.status}'.`);
    }

    if (reservation.status === 'CHECKED_IN') {
      throw new ValidationError('Cannot cancel a reservation that has already checked in. Please use Check-Out.');
    }

    const fromStatus = reservation.status;
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await ReservationsRepository.update(id, {
      status: 'CANCELLED',
      cancellation_reason: reason,
      cancelled_at: nowStr,
      updated_by: req?.user?.id || null,
    });

    await ReservationsRepository.recordStatusHistory({
      reservationId: id,
      fromStatus,
      toStatus: 'CANCELLED',
      actorId: req?.user?.id || null,
      actorRole: req?.user?.role || 'STAFF',
      notes: reason,
    });

    await AuditService.record({
      req,
      action: 'RESERVATION_CANCELLED',
      entityType: 'reservation',
      entityId: id,
      oldValues: { status: fromStatus },
      newValues: { status: 'CANCELLED', reason },
    });

    return ReservationsRepository.findById(id);
  }

  /**
   * Check In Guest
   * Allowed from: CONFIRMED
   * Updates reservation to CHECKED_IN and apartment operational status to OCCUPIED
   */
  static async checkInReservation(id, req = null) {
    await pool.withTransaction(async (conn) => {
      const reservation = await ReservationsRepository.findById(id);
      if (!reservation) {
        throw new NotFoundError(`Reservation #${id} not found.`);
      }

      this.validatePropertyScope(req?.user, reservation.property_id);

      if (reservation.status !== 'CONFIRMED') {
        throw new ValidationError(
          `Cannot check in: Reservation status is '${reservation.status}'. Only CONFIRMED reservations can be checked in.`
        );
      }

      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // 1. Update reservation status
      await ReservationsRepository.update(
        id,
        {
          status: 'CHECKED_IN',
          checked_in_at: nowStr,
          updated_by: req?.user?.id || null,
        },
        conn
      );

      // 2. Transition apartment physical state to OCCUPIED
      await conn.query('UPDATE apartments SET status = "OCCUPIED" WHERE id = ?', [reservation.apartment_id]);

      // 3. Status history
      await ReservationsRepository.recordStatusHistory(
        {
          reservationId: id,
          fromStatus: 'CONFIRMED',
          toStatus: 'CHECKED_IN',
          actorId: req?.user?.id || null,
          actorRole: req?.user?.role || 'STAFF',
          notes: 'Guest checked in at front desk',
        },
        conn
      );

      // 4. Audit
      await AuditService.record({
        req,
        action: 'RESERVATION_CHECKED_IN',
        entityType: 'reservation',
        entityId: id,
        newValues: {
          status: 'CHECKED_IN',
          apartmentStatus: 'OCCUPIED',
          checkedInAt: nowStr,
        },
      });

      return id;
    });

    return ReservationsRepository.findById(id);
  }

  /**
   * Check Out Guest
   * Allowed from: CHECKED_IN
   * Updates reservation to COMPLETED and apartment operational status to DIRTY (requiring housekeeping)
   */
  static async checkOutReservation(id, req = null) {
    await pool.withTransaction(async (conn) => {
      const reservation = await ReservationsRepository.findById(id);
      if (!reservation) {
        throw new NotFoundError(`Reservation #${id} not found.`);
      }

      this.validatePropertyScope(req?.user, reservation.property_id);

      if (reservation.status !== 'CHECKED_IN') {
        throw new ValidationError(
          `Cannot check out: Reservation status is '${reservation.status}'. Only CHECKED_IN reservations can be checked out.`
        );
      }

      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // 1. Update reservation status
      await ReservationsRepository.update(
        id,
        {
          status: 'COMPLETED',
          checked_out_at: nowStr,
          updated_by: req?.user?.id || null,
        },
        conn
      );

      // 2. Section 29 Operational Workflow: Unit transitions to DIRTY for cleaning
      await conn.query('UPDATE apartments SET status = "DIRTY" WHERE id = ?', [reservation.apartment_id]);

      // 3. Status history
      await ReservationsRepository.recordStatusHistory(
        {
          reservationId: id,
          fromStatus: 'CHECKED_IN',
          toStatus: 'COMPLETED',
          actorId: req?.user?.id || null,
          actorRole: req?.user?.role || 'STAFF',
          notes: 'Guest checked out. Unit marked DIRTY for housekeeping.',
        },
        conn
      );

      // 4. Audit
      await AuditService.record({
        req,
        action: 'RESERVATION_CHECKED_OUT',
        entityType: 'reservation',
        entityId: id,
        newValues: {
          status: 'COMPLETED',
          apartmentStatus: 'DIRTY',
          checkedOutAt: nowStr,
        },
      });

      return id;
    });

    return ReservationsRepository.findById(id);
  }

  /**
   * Mark as No-Show
   * Allowed from: CONFIRMED
   */
  static async noShowReservation(id, { reason = 'Guest did not arrive for scheduled 1-night stay' } = {}, req = null) {
    const reservation = await ReservationsRepository.findById(id);
    if (!reservation) {
      throw new NotFoundError(`Reservation #${id} not found.`);
    }

    this.validatePropertyScope(req?.user, reservation.property_id);

    if (reservation.status !== 'CONFIRMED') {
      throw new ValidationError(
        `Cannot mark as No-Show: Current status is '${reservation.status}'. Only CONFIRMED reservations can be marked NO_SHOW.`
      );
    }

    await ReservationsRepository.update(id, {
      status: 'NO_SHOW',
      notes: reason,
      updated_by: req?.user?.id || null,
    });

    await ReservationsRepository.recordStatusHistory({
      reservationId: id,
      fromStatus: 'CONFIRMED',
      toStatus: 'NO_SHOW',
      actorId: req?.user?.id || null,
      actorRole: req?.user?.role || 'STAFF',
      notes: reason,
    });

    await AuditService.record({
      req,
      action: 'RESERVATION_NO_SHOW',
      entityType: 'reservation',
      entityId: id,
      newValues: { status: 'NO_SHOW', reason },
    });

    return ReservationsRepository.findById(id);
  }
}

module.exports = ReservationsService;
