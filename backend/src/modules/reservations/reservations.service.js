const pool = require('../../db/pool');
const ReservationsRepository = require('./reservations.repository');
const ApartmentsRepository = require('../apartments/apartments.repository');
const PropertiesRepository = require('../properties/properties.repository');
const BookingAuthService = require('../bookingAuth/bookingAuth.service');
const AuditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const EmployeeActivitiesService = require('../employees/employeeActivities.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError, BadRequestError } = require('../../core/errors/apiError');
const logger = require('../../utils/logger');
const { broadcastOperationalEvent } = require('../../core/socket/socketEmitter');
const EmployeesRepository = require('../employees/employees.repository');

/**
 * Deadlock retry helper with jitter for high-concurrency reservation operations
 */
async function executeWithDeadlockRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if ((err.code === 'ER_LOCK_DEADLOCK' || err.errno === 1213) && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 50) + 25 * attempt;
        await new Promise((resolve) => setTimeout(resolve, jitter));
        continue;
      }
      throw err;
    }
  }
}

class ReservationsService {
  /**
   * Validate the mandatory BFA One-Night Rule
   * Every reservation is strictly one night: check_out_date = check_in_date + 1 day
   */
  static validateOneNightStay(checkInDateStr, checkOutDateStr) {
    if (!checkInDateStr) {
      throw new ValidationError('check_in_date is required in YYYY-MM-DD format.');
    }

    if (checkInDateStr instanceof Date) {
      checkInDateStr = checkInDateStr.toISOString().split('T')[0];
    } else if (typeof checkInDateStr === 'string' && checkInDateStr.includes('T')) {
      checkInDateStr = checkInDateStr.split('T')[0];
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

    if (checkOutDateStr instanceof Date) {
      checkOutDateStr = checkOutDateStr.toISOString().split('T')[0];
    } else if (typeof checkOutDateStr === 'string' && checkOutDateStr.includes('T')) {
      checkOutDateStr = checkOutDateStr.split('T')[0];
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
   * Validate user's property scope (Fail-Closed)
   * Enforces property isolation for OPERATIONS_MANAGER, MANAGER, RECEPTIONIST, and STAFF.
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return true; // Unauthenticated public requests (e.g., online guest bookings)
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return true; // Portfolio-wide authorized roles
    }
    if (['OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(role)) {
      if (!user.propertyId) {
        throw new ForbiddenError('Access denied: User is not assigned to any property.');
      }
      const userPropId = parseInt(user.propertyId, 10);
      if (isNaN(userPropId)) {
        throw new ForbiddenError('Access denied: Invalid property assignment.');
      }
      if (!propertyId) {
        throw new ForbiddenError('Access denied: Target reservation has no valid property assignment.');
      }
      if (propertyId !== 'all' && userPropId !== parseInt(propertyId, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization for this property.');
      }
      return true;
    }
    if (role === 'AGENT') {
      return true; // Agents are isolated by agentId in dedicated service checks
    }
    throw new ForbiddenError(`Access denied: Role '${role}' is not authorized for this reservation operation.`);
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

      // Validate that provided property_id matches apartment's actual property
      if (data.property_id && parseInt(data.property_id, 10) !== parseInt(apartment.property_id, 10)) {
        throw new ValidationError(
          `Data Integrity Violation: Apartment unit #${data.apartment_id} does not belong to Property #${data.property_id}.`
        );
      }

      // 3. Property scope authorization
      this.validatePropertyScope(req?.user, apartment.property_id);

      // 4. Agent isolation & attribution validation
      let agentId = data.agent_id || null;
      if (req?.user?.role === 'AGENT') {
        if (!req.user.agentId) {
          throw new ForbiddenError('Agent user account is not linked to any active agent profile.');
        }
        if (data.agent_id && parseInt(data.agent_id, 10) !== parseInt(req.user.agentId, 10)) {
          throw new ForbiddenError('Agents are strictly isolated to their own bookings.');
        }
        agentId = req.user.agentId;
      }

      if (agentId) {
        const [agentRows] = await conn.query('SELECT id, name, status, property_id FROM agents WHERE id = ?', [agentId]);
        if (!agentRows || agentRows.length === 0) {
          throw new NotFoundError(`Agent #${agentId} not found.`);
        }
        const agent = agentRows[0];
        if (agent.status !== 'ACTIVE') {
          throw new ValidationError(`Agent '${agent.name}' is currently ${agent.status} and cannot be assigned new bookings.`);
        }
        if (agent.property_id && parseInt(agent.property_id, 10) !== parseInt(apartment.property_id, 10)) {
          throw new ValidationError(`Agent '${agent.name}' is authorized for Property #${agent.property_id}, not Property #${apartment.property_id}.`);
        }
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

      // 10. Financial calculations & Authoritative Quote verification
      const ratePerNight = parseFloat(apartment.rate_per_night);
      let calculatedTotal = ratePerNight;
      let priceSnapshot = null;

      const quoteToken = data.quoteToken || data.quote_token;
      if (quoteToken) {
        const PricingService = require('../pricing/pricing.service');
        const verifiedQuote = PricingService.verifyQuoteToken(quoteToken);
        if (verifiedQuote.apartmentId !== apartment.id) {
          throw new ValidationError('Quote token does not match the requested apartment.');
        }
        if (verifiedQuote.checkInDate !== checkInDate) {
          throw new ValidationError('Quote token does not match the requested check-in date.');
        }
        calculatedTotal = verifiedQuote.totalAmount;
        priceSnapshot = verifiedQuote.breakdown || verifiedQuote;
      }

      const totalAmount = priceSnapshot ? calculatedTotal : (data.total_amount ? parseFloat(data.total_amount) : ratePerNight);
      const paidAmount = data.paid_amount !== undefined ? parseFloat(data.paid_amount) : 0.00;
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
        confirmation_token: data.confirmation_token || null,
        property_id: apartment.property_id,
        apartment_id: apartment.id,
        guest_id: guestId,
        tenant_name: tenantName,
        tenant_email: tenantEmail,
        tenant_phone: tenantPhone,
        agent_id: agentId,
        source: data.source || (agentId ? 'AGENT' : (req?.user ? 'DIRECT' : 'ONLINE')),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        nights: 1,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        status: initialStatus,
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        special_requests: data.special_requests || null,
        notes: JSON.stringify({
          userNotes: data.notes || '',
          price_snapshot: priceSnapshot || {
            baseRate: ratePerNight,
            totalAmount: totalAmount,
            capturedAt: new Date().toISOString(),
          },
        }),
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

      // 13b. Automatically calculate commission if booked via Agent
      if (agentId) {
        try {
          const CommissionsService = require('../commissions/commissions.service');
          await CommissionsService.calculateCommissionForReservation(reservationId, { agentId }, req, conn);
        } catch (comErr) {
          logger.warn('Failed to auto-calculate agent commission during reservation creation:', { error: comErr.message });
        }
      }

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

      // Employee activity logging
      if (req?.user?.id) {
        EmployeeActivitiesService.recordUserActivity(req.user.id, {
          property_id: apartment.property_id,
          activity_type: 'RESERVATION_CREATED',
          activity_category: 'RESERVATION',
          related_entity_type: 'reservation',
          related_entity_id: reservationId,
          description: `Created reservation ${reservationCode} for ${newReservationData.tenant_name}`,
          metadata: { reservation_code: reservationCode, total: totalAmount }
        }).catch(() => {});
      }

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

    const createdReservation = await ReservationsRepository.findById(reservationId);
    try {
      broadcastOperationalEvent('frontdesk:new_booking', {
        id: reservationId,
        reservationCode: createdReservation?.reservation_code,
        tenantName: createdReservation?.tenant_name,
        tenantEmail: createdReservation?.tenant_email,
        tenantPhone: createdReservation?.tenant_phone,
        propertyId: createdReservation?.property_id,
        propertyName: createdReservation?.property_name,
        apartmentId: createdReservation?.apartment_id,
        unitNumber: createdReservation?.unit_number,
        unitName: createdReservation?.unit_name,
        checkInDate: createdReservation?.check_in_date,
        checkOutDate: createdReservation?.check_out_date,
        totalAmount: createdReservation?.total_amount,
        status: createdReservation?.status,
        paymentStatus: createdReservation?.payment_status,
        assignedStaffId: createdReservation?.assigned_staff_id || null,
        createdAt: createdReservation?.created_at,
      }, {
        propertyId: createdReservation?.property_id,
      });
    } catch (bcErr) {
      logger.warn('Failed to broadcast new booking event:', { error: bcErr.message });
    }
    return createdReservation;
  }

  /**
   * Update reservation details (with ascending-ID multi-apartment locking & availability re-check)
   */
  static async updateReservation(id, data, req = null) {
    let postCommitData = null;

    await executeWithDeadlockRetry(async () => {
      await pool.withTransaction(async (conn) => {
        // Priority 1: Acquire exclusive row lock on reservation first
        const [resRows] = await conn.query('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [id]);
        if (!resRows || resRows.length === 0) {
          throw new NotFoundError(`Reservation #${id} not found.`);
        }
        const existing = resRows[0];

        // Property scope check
        this.validatePropertyScope(req?.user, existing.property_id);

        // Agent isolation
        if (req?.user?.role === 'AGENT' && existing.agent_id !== req.user.agentId) {
          throw new ForbiddenError('Access denied: You are not authorized to update this reservation.');
        }

        const updateData = {};
        const sourceAptId = existing.apartment_id;
        const targetAptId = data.apartment_id ? parseInt(data.apartment_id, 10) : sourceAptId;
        const targetCheckIn = data.check_in_date || existing.check_in_date;
        const targetCheckOut = data.check_out_date || existing.check_out_date;
        const isUnitTransfer = targetAptId !== sourceAptId;
        const isDateChange = (data.check_in_date && data.check_in_date !== existing.check_in_date) ||
                             (data.check_out_date && data.check_out_date !== existing.check_out_date);

        if (isUnitTransfer || isDateChange) {
          // Enforce 1-night stay on updated dates
          const { checkInDate, checkOutDate } = this.validateOneNightStay(targetCheckIn, targetCheckOut);
          updateData.check_in_date = checkInDate;
          updateData.check_out_date = checkOutDate;
          updateData.apartment_id = targetAptId;

          if (isUnitTransfer) {
            // Ascending ID order: min(source, target) then max(source, target)
            const firstAptId = Math.min(sourceAptId, targetAptId);
            const secondAptId = Math.max(sourceAptId, targetAptId);

            const [firstRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [firstAptId]);
            const [secondRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [secondAptId]);

            const aptMap = {
              [firstAptId]: firstRows[0],
              [secondAptId]: secondRows[0],
            };

            const sourceUnit = aptMap[sourceAptId];
            const targetUnit = aptMap[targetAptId];

            if (!targetUnit) {
              throw new NotFoundError(`Destination unit #${targetAptId} not found.`);
            }
            updateData.property_id = targetUnit.property_id;

            // Validate target unit operational readiness
            if (['MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE'].includes(targetUnit.status)) {
              throw new ConflictError(
                `Cannot transfer reservation: Destination unit '${targetUnit.unit_name}' is currently in ${targetUnit.status} state.`
              );
            }
            if (targetUnit.status === 'OCCUPIED') {
              throw new ConflictError(
                `Cannot transfer reservation: Destination unit '${targetUnit.unit_name}' is currently OCCUPIED.`
              );
            }

            // Check blocking maintenance on destination unit
            const [blkMaint] = await conn.query(
              `SELECT id, issue_code, priority FROM maintenance_requests 
               WHERE apartment_id = ? 
                 AND status NOT IN ('RESOLVED', 'CANCELLED') 
                 AND (blocking_unit = 1 OR priority = 'CRITICAL') 
               LIMIT 1`,
              [targetAptId]
            );
            if (blkMaint && blkMaint.length > 0) {
              throw new ConflictError(
                `Cannot transfer reservation: Destination unit '${targetUnit.unit_name}' has an active blocking maintenance request (#${blkMaint[0].issue_code || blkMaint[0].id}).`
              );
            }

            // Check availability of destination unit
            const [overlapping] = await conn.query(
              `SELECT id, reservation_code FROM reservations 
               WHERE apartment_id = ? 
                 AND id != ? 
                 AND status IN ('CONFIRMED', 'CHECKED_IN') 
                 AND check_in_date < ? 
                 AND check_out_date > ? 
               LIMIT 1`,
              [targetAptId, id, checkOutDate, checkInDate]
            );
            if (overlapping && overlapping.length > 0) {
              throw new ConflictError(
                `Cannot transfer reservation: Destination unit '${targetUnit.unit_name}' is already booked (#${overlapping[0].reservation_code}) for ${checkInDate}.`
              );
            }

            // If reservation is currently in-house (CHECKED_IN), migrate unit occupancy states
            if (existing.status === 'CHECKED_IN') {
              await conn.query('UPDATE apartments SET status = "DIRTY", housekeeping_status = "DIRTY", updated_at = NOW() WHERE id = ?', [sourceAptId]);
              await conn.query('UPDATE apartments SET status = "OCCUPIED", updated_at = NOW() WHERE id = ?', [targetAptId]);
            }
          } else {
            // isDateChange on same apartment
            const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [sourceAptId]);
            if (!aptRows || aptRows.length === 0) {
              throw new NotFoundError(`Unit #${sourceAptId} not found.`);
            }
            const apt = aptRows[0];

            // Check availability on current apartment for new dates excluding self
            const [overlapping] = await conn.query(
              `SELECT id, reservation_code FROM reservations 
               WHERE apartment_id = ? 
                 AND id != ? 
                 AND status IN ('CONFIRMED', 'CHECKED_IN') 
                 AND check_in_date < ? 
                 AND check_out_date > ? 
               LIMIT 1`,
              [sourceAptId, id, checkOutDate, checkInDate]
            );
            if (overlapping && overlapping.length > 0) {
              throw new ConflictError(
                `Cannot update reservation: Unit '${apt.unit_name}' is already booked (#${overlapping[0].reservation_code}) for ${checkInDate}.`
              );
            }
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
        updateData.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

        await ReservationsRepository.update(id, updateData, conn);

        postCommitData = {
          id,
          oldValues: {
            checkIn: existing.check_in_date,
            unitId: existing.apartment_id,
            total: existing.total_amount,
          },
          newValues: updateData,
          user: req?.user,
        };
      });
    });

    if (postCommitData) {
      await AuditService.record({
        req,
        action: 'RESERVATION_UPDATED',
        entityType: 'reservation',
        entityId: postCommitData.id,
        oldValues: postCommitData.oldValues,
        newValues: postCommitData.newValues,
      }).catch((err) => logger.warn('Update reservation audit failed:', { error: err.message }));
    }

    return ReservationsRepository.findById(id);
  }

  /**
   * Confirm a PENDING reservation (Atomic & Concurrency-Guarded)
   */
  static async confirmReservation(id, req = null) {
    let postCommitData = null;

    await executeWithDeadlockRetry(async () => {
      await pool.withTransaction(async (conn) => {
        // Priority 1: Acquire exclusive row lock on reservation
        const [resRows] = await conn.query('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [id]);
        if (!resRows || resRows.length === 0) {
          throw new NotFoundError(`Reservation #${id} not found.`);
        }
        const reservation = resRows[0];

        this.validatePropertyScope(req?.user, reservation.property_id);

        if (reservation.status !== 'PENDING') {
          throw new ValidationError(
            `Cannot confirm reservation: Current status is '${reservation.status}'. Only PENDING reservations can be confirmed.`
          );
        }

        // Priority 2: Acquire exclusive row lock on apartment
        const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [reservation.apartment_id]);
        if (!aptRows || aptRows.length === 0) {
          throw new NotFoundError(`Assigned unit #${reservation.apartment_id} not found.`);
        }
        const apt = aptRows[0];

        // Check unit operational status
        if (['MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE'].includes(apt.status)) {
          throw new ConflictError(
            `Cannot confirm reservation: Unit '${apt.unit_name}' is currently in ${apt.status} state.`
          );
        }

        // Check date conflict with other confirmed or checked-in reservations
        const [overlapping] = await conn.query(
          `SELECT id, reservation_code FROM reservations 
           WHERE apartment_id = ? 
             AND id != ? 
             AND status IN ('CONFIRMED', 'CHECKED_IN') 
             AND check_in_date < ? 
             AND check_out_date > ? 
           LIMIT 1`,
          [reservation.apartment_id, id, reservation.check_out_date, reservation.check_in_date]
        );
        if (overlapping && overlapping.length > 0) {
          throw new ConflictError(
            `Cannot confirm reservation: Unit '${apt.unit_name}' has a conflicting active reservation (#${overlapping[0].reservation_code}) for the requested period.`
          );
        }

        // Check active blocking maintenance
        const [blockingMaint] = await conn.query(
          `SELECT id, issue_code, priority FROM maintenance_requests 
           WHERE apartment_id = ? 
             AND status NOT IN ('RESOLVED', 'CANCELLED') 
             AND (blocking_unit = 1 OR priority = 'CRITICAL') 
           LIMIT 1`,
          [apt.id]
        );
        if (blockingMaint && blockingMaint.length > 0) {
          throw new ConflictError(
            `Cannot confirm reservation: Unit '${apt.unit_name}' has an active blocking maintenance request (#${blockingMaint[0].issue_code || blockingMaint[0].id}).`
          );
        }

        await conn.query(
          `UPDATE reservations 
           SET status = 'CONFIRMED', 
               updated_by = ?,
               updated_at = NOW() 
           WHERE id = ?`,
          [req?.user?.id || null, id]
        );

        await ReservationsRepository.recordStatusHistory(
          {
            reservationId: id,
            fromStatus: 'PENDING',
            toStatus: 'CONFIRMED',
            actorId: req?.user?.id || null,
            actorRole: req?.user?.role || 'STAFF',
            notes: 'Reservation confirmed by staff/admin with verified availability',
          },
          conn
        );

        postCommitData = {
          id,
          propertyId: reservation.property_id,
          guestEmail: reservation.tenant_email,
          guestPhone: reservation.tenant_phone,
          userId: req?.user?.id || null,
          userRole: req?.user?.role || 'STAFF',
          userEmail: req?.user?.email || null,
        };
      });
    });

    if (postCommitData) {
      // Ensure booking auth code is active
      await BookingAuthService.registerBookingAuth({
        reservationId: postCommitData.id,
        guestEmail: postCommitData.guestEmail,
        guestPhone: postCommitData.guestPhone,
      }).catch((err) => logger.warn('Booking auth registration failed:', { error: err.message }));

      await AuditService.record({
        req,
        actorId: postCommitData.userId,
        actorEmail: postCommitData.userEmail,
        actorRole: postCommitData.userRole,
        action: 'RESERVATION_CONFIRMED',
        entityType: 'reservation',
        entityId: String(postCommitData.id),
        newValues: { status: 'CONFIRMED' },
      }).catch((err) => logger.warn('Reservation confirmation audit failed:', { error: err.message }));
    }

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

    // Agent ownership check: Agents can ONLY cancel their own attributed reservations
    if (req?.user?.role === 'AGENT') {
      if (!req.user.agentId) {
        throw new ForbiddenError('Agent user account is not linked to any active agent profile.');
      }
      if (!reservation.agent_id || parseInt(reservation.agent_id, 10) !== parseInt(req.user.agentId, 10)) {
        throw new ForbiddenError('Access denied: Agents are strictly isolated to their own bookings and cannot cancel other reservations.');
      }
    }

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

    // Reconcile associated agent commission
    try {
      const CommissionsService = require('../commissions/commissions.service');
      await CommissionsService.reconcileCancellationOrRefund(id);
    } catch (comErr) {
      logger.warn('Failed to reconcile commission upon reservation cancellation:', { error: comErr.message });
    }

    return ReservationsRepository.findById(id);
  }

  /**
   * Check In Guest (Atomic & Serialized with Complete 5-Part Apartment Readiness Invariant)
   * Allowed from: CONFIRMED
   * Enforces:
   *  1. apartments.status IN ('AVAILABLE', 'READY') [fail-closed on unknown]
   *  2. housekeeping_status = 'INSPECTED_READY'
   *  3. maintenance_status = 'OPERATIONAL'
   *  4. Zero active blocking maintenance requests (blocking_unit = 1 OR priority = 'CRITICAL')
   *  5. Zero overlapping active stays (status = 'CHECKED_IN')
   * Updates reservation to CHECKED_IN and apartment operational status to OCCUPIED
   */
  static async checkInReservation(id, req = null) {
    let postCommitData = null;

    await executeWithDeadlockRetry(async () => {
      await pool.withTransaction(async (conn) => {
        // Priority 1: Exclusive row lock on reservation
        const [resRows] = await conn.query('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [id]);
        if (!resRows || resRows.length === 0) {
          throw new NotFoundError(`Reservation #${id} not found.`);
        }
        const reservation = resRows[0];

        // Validate Property Scope
        this.validatePropertyScope(req?.user, reservation.property_id);

        // Validate Reservation Status
        if (reservation.status === 'CHECKED_IN') {
          throw new ConflictError(`Cannot check in: Reservation #${id} is already checked in.`);
        }
        if (reservation.status !== 'CONFIRMED') {
          throw new ValidationError(
            `Cannot check in: Reservation status is '${reservation.status}'. Only CONFIRMED reservations can be checked in.`
          );
        }

        // Priority 2: Exclusive row lock on apartment unit
        const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [reservation.apartment_id]);
        if (!aptRows || aptRows.length === 0) {
          throw new NotFoundError(`Assigned apartment unit #${reservation.apartment_id} not found.`);
        }
        const apt = aptRows[0];

        // Invariant Condition 1: Explicit Occupancy Allowlist ['AVAILABLE', 'READY']
        const ALLOWED_OCCUPANCY_STATUSES = ['AVAILABLE', 'READY'];
        if (apt.status === 'OCCUPIED') {
          throw new ConflictError(
            `Cannot check in: Unit '${apt.unit_name}' is currently OCCUPIED by another guest.`
          );
        }
        if (apt.status === 'MAINTENANCE') {
          throw new ConflictError(
            `Cannot check in: Unit '${apt.unit_name}' is currently in MAINTENANCE status.`
          );
        }
        if (['BLOCKED', 'OUT_OF_SERVICE'].includes(apt.status)) {
          throw new ConflictError(
            `Cannot check in: Unit '${apt.unit_name}' is currently in ${apt.status} state.`
          );
        }
        if (!ALLOWED_OCCUPANCY_STATUSES.includes(apt.status)) {
          throw new ValidationError(
            `Cannot check in: Unit '${apt.unit_name}' has invalid occupancy status '${apt.status}'. Check-in is only permitted for units with status 'AVAILABLE' or 'READY'.`
          );
        }

        // Invariant Condition 2: Housekeeping Status = 'INSPECTED_READY'
        if (apt.housekeeping_status !== 'INSPECTED_READY') {
          throw new ValidationError(
            `Cannot check in: Unit '${apt.unit_name}' housekeeping status is '${apt.housekeeping_status}'. Unit must be 'INSPECTED_READY' before guest check-in.`
          );
        }

        // Invariant Condition 3: Maintenance Status = 'OPERATIONAL'
        if (apt.maintenance_status !== 'OPERATIONAL') {
          throw new ConflictError(
            `Cannot check in: Unit '${apt.unit_name}' maintenance status is '${apt.maintenance_status}'. Unit must be 'OPERATIONAL' before guest check-in.`
          );
        }

        // Invariant Condition 4: Zero Active Blocking Maintenance Tickets (blocking_unit = 1 OR priority = 'CRITICAL')
        const [blockingMaint] = await conn.query(
          `SELECT id, issue_code, priority, blocking_unit 
           FROM maintenance_requests 
           WHERE apartment_id = ? 
             AND status NOT IN ('RESOLVED', 'CANCELLED') 
             AND (blocking_unit = 1 OR priority = 'CRITICAL') 
           LIMIT 1 LOCK IN SHARE MODE`,
          [apt.id]
        );
        if (blockingMaint && blockingMaint.length > 0) {
          const blk = blockingMaint[0];
          throw new ConflictError(
            `Cannot check in: Unit '${apt.unit_name}' has an active blocking maintenance request (${blk.issue_code || '#' + blk.id}, priority: ${blk.priority}).`
          );
        }

        // Invariant Condition 5: Zero Overlapping Active Stays (status = 'CHECKED_IN')
        const [overlappingStays] = await conn.query(
          `SELECT id, reservation_code, check_in_date, check_out_date 
           FROM reservations 
           WHERE apartment_id = ? 
             AND id != ? 
             AND status = 'CHECKED_IN' 
             AND (
               (check_in_date < ? AND check_out_date > ?)
               OR (check_in_date <= CURDATE() AND check_out_date > CURDATE())
             )
           LIMIT 1 LOCK IN SHARE MODE`,
          [apt.id, id, reservation.check_out_date, reservation.check_in_date]
        );
        if (overlappingStays && overlappingStays.length > 0) {
          const ov = overlappingStays[0];
          throw new ConflictError(
            `Cannot check in: Unit '${apt.unit_name}' currently has an active in-house stay (Reservation #${ov.reservation_code || ov.id}) from ${ov.check_in_date} to ${ov.check_out_date}.`
          );
        }

        const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // State Transitions:
        // 1. Update reservation status to CHECKED_IN
        await conn.query(
          `UPDATE reservations 
           SET status = 'CHECKED_IN', 
               checked_in_at = ?, 
               updated_by = ?,
               updated_at = NOW() 
           WHERE id = ?`,
          [nowStr, req?.user?.id || null, id]
        );

        // 2. Transition apartment physical state to OCCUPIED
        await conn.query(
          `UPDATE apartments 
           SET status = 'OCCUPIED', 
               updated_at = NOW() 
           WHERE id = ?`,
          [apt.id]
        );

        // 3. Status history
        await ReservationsRepository.recordStatusHistory(
          {
            reservationId: id,
            fromStatus: 'CONFIRMED',
            toStatus: 'CHECKED_IN',
            actorId: req?.user?.id || null,
            actorRole: req?.user?.role || 'STAFF',
            notes: 'Guest checked in at front desk with verified 5-part readiness invariant',
          },
          conn
        );

        // Retrieve truthful committed state snapshot on the active connection before commit
        const committedSnapshot = await ReservationsRepository.findById(id, conn);

        postCommitData = {
          id,
          reservationCode: reservation.reservation_code,
          tenantName: reservation.tenant_name,
          propertyId: reservation.property_id,
          apartmentId: reservation.apartment_id,
          unitName: apt.unit_name,
          checkedInAt: nowStr,
          userId: req?.user?.id || null,
          userRole: req?.user?.role || 'STAFF',
          userEmail: req?.user?.email || null,
          committedSnapshot,
        };

        return id;
      });
    });

    // Post-Commit Safe Side Effects
    if (postCommitData) {
      await AuditService.record({
        req,
        actorId: postCommitData.userId,
        actorEmail: postCommitData.userEmail,
        actorRole: postCommitData.userRole,
        action: 'RESERVATION_CHECKED_IN',
        entityType: 'reservation',
        entityId: String(postCommitData.id),
        newValues: {
          status: 'CHECKED_IN',
          apartmentStatus: 'OCCUPIED',
          checkedInAt: postCommitData.checkedInAt,
        },
      }).catch((err) => logger.warn('Check-in audit log failed:', { error: err.message }));

      if (postCommitData.userId) {
        EmployeeActivitiesService.recordUserActivity(postCommitData.userId, {
          property_id: postCommitData.propertyId,
          activity_type: 'GUEST_CHECKED_IN',
          activity_category: 'FRONT_DESK',
          related_entity_type: 'reservation',
          related_entity_id: postCommitData.id,
          description: `Checked in guest ${postCommitData.tenantName} (${postCommitData.reservationCode}) to Unit ${postCommitData.unitName}`,
          metadata: { reservation_code: postCommitData.reservationCode, apartment_id: postCommitData.apartmentId }
        }).catch((err) => logger.warn('Check-in employee activity record failed:', { error: err.message }));
      }
    }

    // Post-commit retrieval with resilience against transient connection drops
    try {
      const freshRecord = await ReservationsRepository.findById(id);
      if (freshRecord) {
        return freshRecord;
      }
    } catch (retrievalErr) {
      logger.warn(`Post-commit reservation retrieval failed for reservation #${id}: ${retrievalErr.message}. Returning committed state snapshot.`);
    }

    if (postCommitData?.committedSnapshot) {
      return postCommitData.committedSnapshot;
    }

    return {
      id,
      reservation_code: postCommitData?.reservationCode,
      tenant_name: postCommitData?.tenantName,
      property_id: postCommitData?.propertyId,
      apartment_id: postCommitData?.apartmentId,
      unit_name: postCommitData?.unitName,
      checked_in_at: postCommitData?.checkedInAt,
      status: 'CHECKED_IN',
    };
  }

  /**
   * Check Out Guest
   * Allowed from: CHECKED_IN
   * Updates reservation to COMPLETED and apartment operational status to DIRTY (requiring housekeeping)
   */
  static async checkOutReservation(id, req = null) {
    let postCommitData = null;

    await executeWithDeadlockRetry(async () => {
      await pool.withTransaction(async (conn) => {
        // Priority 1: Acquire exclusive row lock on reservation
        const [resRows] = await conn.query('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [id]);
        if (!resRows || resRows.length === 0) {
          throw new NotFoundError(`Reservation #${id} not found.`);
        }
        const reservation = resRows[0];

        this.validatePropertyScope(req?.user, reservation.property_id);

        if (reservation.status !== 'CHECKED_IN') {
          throw new ValidationError(
            `Cannot check out: Reservation status is '${reservation.status}'. Only CHECKED_IN reservations can be checked out.`
          );
        }

        // Priority 2: Acquire exclusive row lock on apartment
        const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [reservation.apartment_id]);
        const apt = aptRows && aptRows.length > 0 ? aptRows[0] : null;

        const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // 1. Update reservation status
        await conn.query(
          `UPDATE reservations 
           SET status = 'COMPLETED', 
               checked_out_at = ?, 
               updated_by = ?,
               updated_at = NOW() 
           WHERE id = ?`,
          [nowStr, req?.user?.id || null, id]
        );

        // 2. Transition apartment status to DIRTY and housekeeping_status to DIRTY
        if (apt) {
          await conn.query(
            'UPDATE apartments SET status = "DIRTY", housekeeping_status = "DIRTY", updated_at = NOW() WHERE id = ?',
            [reservation.apartment_id]
          );
        }

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

        postCommitData = {
          id,
          apartmentId: reservation.apartment_id,
          propertyId: reservation.property_id,
          tenantName: reservation.tenant_name,
          reservationCode: reservation.reservation_code,
          checkedOutAt: nowStr,
          userId: req?.user?.id || null,
          userRole: req?.user?.role || 'STAFF',
          userEmail: req?.user?.email || null,
        };
      });
    });

    if (postCommitData) {
      await AuditService.record({
        req,
        actorId: postCommitData.userId,
        actorEmail: postCommitData.userEmail,
        actorRole: postCommitData.userRole,
        action: 'RESERVATION_CHECKED_OUT',
        entityType: 'reservation',
        entityId: String(postCommitData.id),
        newValues: {
          status: 'COMPLETED',
          apartmentStatus: 'DIRTY',
          checkedOutAt: postCommitData.checkedOutAt,
        },
      }).catch((err) => logger.warn('Check-out audit log failed:', { error: err.message }));

      if (postCommitData.userId) {
        EmployeeActivitiesService.recordUserActivity(postCommitData.userId, {
          property_id: postCommitData.propertyId,
          activity_type: 'GUEST_CHECKED_OUT',
          activity_category: 'FRONT_DESK',
          related_entity_type: 'reservation',
          related_entity_id: postCommitData.id,
          description: `Checked out guest ${postCommitData.tenantName} (${postCommitData.reservationCode})`,
          metadata: { reservation_code: postCommitData.reservationCode, apartment_id: postCommitData.apartmentId }
        }).catch((err) => logger.warn('Check-out employee activity record failed:', { error: err.message }));
      }
    }

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

  /**
   * Accept client and approve booking at front desk
   * Concurrency Guard: One client cannot be assigned to two front desk staff members
   * Unit Availability: Cannot be approved if unit is MAINTENANCE, BLOCKED, or has conflicting bookings
   * Staff Performance: Automatically attributes to the accepting staff member's performance evaluation
   */
  static async acceptReservation(reservationId, req = null) {
    const id = parseInt(reservationId, 10);
    const userId = req?.user?.id;
    if (!userId) {
      throw new ForbiddenError('Authentication required to accept reservations.');
    }

    return pool.withTransaction(async (conn) => {
      // 1. Fetch reservation with exclusive row lock
      const [resRows] = await conn.query('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [id]);
      if (!resRows || resRows.length === 0) {
        throw new NotFoundError(`Reservation #${id} not found.`);
      }
      const reservation = resRows[0];

      // 2. Validate Property Scope
      this.validatePropertyScope(req?.user, reservation.property_id);

      // 3. Strict Concurrency Lock: One client cannot be assigned to two front desk staffs
      if (reservation.assigned_staff_id && reservation.assigned_staff_id !== userId) {
        const [assignedStaffRows] = await conn.query('SELECT name FROM users WHERE id = ?', [reservation.assigned_staff_id]);
        const staffName = assignedStaffRows[0]?.name || `Staff #${reservation.assigned_staff_id}`;
        throw new ConflictError(
          `One client cannot be assigned to two front desk staffs. This reservation has already been accepted and assigned to ${staffName}.`
        );
      }

      // 4. Unit Availability Verification
      const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [reservation.apartment_id]);
      if (!aptRows || aptRows.length === 0) {
        throw new NotFoundError(`Assigned unit #${reservation.apartment_id} not found.`);
      }
      const apt = aptRows[0];

      if (['MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE'].includes(apt.status)) {
        throw new BadRequestError(
          `Unit is currently in ${apt.status} status and cannot be approved for check-in until released from maintenance.`
        );
      }

      // Check overlapping active reservations (excluding current)
      const [overlapping] = await conn.query(
        `SELECT id, reservation_code FROM reservations 
         WHERE apartment_id = ? 
           AND id != ? 
           AND status IN ('CONFIRMED', 'CHECKED_IN')
           AND check_in_date < ? 
           AND check_out_date > ? 
         LIMIT 1`,
        [reservation.apartment_id, id, reservation.check_out_date, reservation.check_in_date]
      );
      if (overlapping && overlapping.length > 0) {
        throw new ConflictError(
          `Unit '${apt.unit_name}' has a conflicting active reservation (#${overlapping[0].reservation_code}) for the requested period.`
        );
      }

      // 5. Atomic Assignment and Status Update
      const [updateResult] = await conn.query(
        `UPDATE reservations 
         SET assigned_staff_id = ?, 
             accepted_by_user_id = ?, 
             accepted_at = NOW(), 
             status = 'CONFIRMED',
             updated_by = ?
         WHERE id = ? AND (assigned_staff_id IS NULL OR assigned_staff_id = ?)`,
        [userId, userId, userId, id, userId]
      );

      if (updateResult.affectedRows === 0) {
        throw new ConflictError(
          'Concurrent assignment conflict detected: another staff member accepted this reservation simultaneously.'
        );
      }

      // 5b. Log immutable staff assignment audit record in reservation_staff_assignments
      await conn.query(
        'UPDATE reservation_staff_assignments SET is_active = 0, ended_at = NOW() WHERE reservation_id = ? AND is_active = 1',
        [id]
      );
      await conn.query(
        `INSERT INTO reservation_staff_assignments (
           reservation_id, property_id, assigned_receptionist_id, assigned_by_id, assignment_type, service_status, is_active, claimed_at
         ) VALUES (?, ?, ?, ?, 'INITIAL_CLAIM', 'CLAIMED', 1, NOW())`,
        [id, reservation.property_id, userId, userId]
      );

      // 6. Record Status History
      await ReservationsRepository.recordStatusHistory(
        {
          reservationId: id,
          fromStatus: reservation.status,
          toStatus: 'CONFIRMED',
          actorId: userId,
          actorRole: req?.user?.role || 'STAFF',
          notes: `Client accepted and booking approved by ${req?.user?.name || 'Staff'}`,
        },
        conn
      );

      // 7. Record Staff Activity for Employee Performance Evaluation
      const [empRows] = await conn.query('SELECT id, full_name FROM employees WHERE user_id = ?', [userId]);
      if (empRows && empRows.length > 0) {
        const empId = empRows[0].id;
        await conn.query(
          `INSERT INTO employee_activities (
             employee_id, property_id, activity_type, description, metadata, created_at
           ) VALUES (?, ?, 'CLIENT_ACCEPTED', ?, ?, NOW())`,
          [
            empId,
            reservation.property_id,
            `Front desk staff ${req?.user?.name || empRows[0].full_name} accepted client ${reservation.tenant_name} into the system (Unit ${apt.unit_number})`,
            JSON.stringify({
              reservationId: id,
              reservationCode: reservation.reservation_code,
              tenantName: reservation.tenant_name,
              unitNumber: apt.unit_number,
              totalAmount: reservation.total_amount,
            }),
          ]
        );
      }

      // 8. Record System Audit Log
      await AuditService.record({
        req,
        action: 'CLIENT_ACCEPTED',
        entityType: 'reservation',
        entityId: id,
        newValues: {
          assigned_staff_id: userId,
          accepted_by_user_id: userId,
          status: 'CONFIRMED',
        },
      });

      // 9. Real-time broadcast to front-desk consoles
      try {
        broadcastOperationalEvent('frontdesk:client_accepted', {
          reservationId: id,
          reservationCode: reservation.reservation_code,
          tenantName: reservation.tenant_name,
          assignedStaffId: userId,
          assignedStaffName: req?.user?.name || 'Front Desk Staff',
          unitNumber: apt.unit_number,
          status: 'CONFIRMED',
        });
      } catch (bcErr) {
        logger.warn(`Broadcast failed for client acceptance: ${bcErr.message}`);
      }

      return ReservationsRepository.findById(id, conn);
    });
  }

  /**
   * Concurrency-safe Claim: Front desk receptionist claims pending reservation
   */
  static async claimReservation(reservationId, req = null) {
    const id = parseInt(reservationId, 10);
    const userId = req?.user?.id;
    if (!userId) {
      throw new ForbiddenError('Authentication required to claim reservations.');
    }

    return pool.withTransaction(async (conn) => {
      const [resRows] = await conn.query('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [id]);
      if (!resRows || resRows.length === 0) {
        throw new NotFoundError(`Reservation #${id} not found.`);
      }
      const reservation = resRows[0];

      this.validatePropertyScope(req?.user, reservation.property_id);

      // Strict Concurrency Lock: Check if already claimed by someone else
      if (reservation.assigned_staff_id && reservation.assigned_staff_id !== userId) {
        const [assignedStaffRows] = await conn.query('SELECT name FROM users WHERE id = ?', [reservation.assigned_staff_id]);
        const staffName = assignedStaffRows[0]?.name || `Staff #${reservation.assigned_staff_id}`;
        throw new ConflictError(
          `One client cannot be assigned to two front desk staffs. This reservation has already been accepted and assigned to ${staffName}.`
        );
      }

      const newStatus = reservation.status === 'PENDING_REVIEW' ? 'CLAIMED' : reservation.status;

      await conn.query(
        `UPDATE reservations 
         SET assigned_staff_id = ?, 
             status = ?,
             updated_by = ?
         WHERE id = ? AND (assigned_staff_id IS NULL OR assigned_staff_id = ?)`,
        [userId, newStatus, userId, id, userId]
      );

      await conn.query(
        'UPDATE reservation_staff_assignments SET is_active = 0, ended_at = NOW() WHERE reservation_id = ? AND is_active = 1',
        [id]
      );
      await conn.query(
        `INSERT INTO reservation_staff_assignments (
           reservation_id, property_id, assigned_receptionist_id, assigned_by_id, assignment_type, service_status, is_active, claimed_at
         ) VALUES (?, ?, ?, ?, 'INITIAL_CLAIM', 'CLAIMED', 1, NOW())`,
        [id, reservation.property_id, userId, userId]
      );

      await ReservationsRepository.recordStatusHistory(
        {
          reservationId: id,
          fromStatus: reservation.status,
          toStatus: newStatus,
          actorId: userId,
          actorRole: req?.user?.role || 'STAFF',
          notes: `Reservation claimed by ${req?.user?.name || 'Receptionist'}`,
        },
        conn
      );

      const [empRows] = await conn.query('SELECT id, full_name FROM employees WHERE user_id = ?', [userId]);
      if (empRows && empRows.length > 0) {
        await conn.query(
          `INSERT INTO employee_activities (
             employee_id, property_id, activity_type, description, metadata, created_at
           ) VALUES (?, ?, 'CLIENT_CLAIMED', ?, ?, NOW())`,
          [
            empRows[0].id,
            reservation.property_id,
            `Front desk staff claimed booking ${reservation.reservation_code} for ${reservation.tenant_name}`,
            JSON.stringify({ reservationId: id, reservationCode: reservation.reservation_code }),
          ]
        );
      }

      await AuditService.record({
        req,
        action: 'CLIENT_CLAIMED',
        entityType: 'reservation',
        entityId: id,
        newValues: { assigned_staff_id: userId, status: newStatus },
      });

      return ReservationsRepository.findById(id, conn);
    });
  }

  /**
   * Payment Verification & Final Approval by Front Desk
   */
  static async approveReservation(reservationId, req = null) {
    const id = parseInt(reservationId, 10);
    const userId = req?.user?.id;
    if (!userId) {
      throw new ForbiddenError('Authentication required to approve reservations.');
    }

    return pool.withTransaction(async (conn) => {
      const [resRows] = await conn.query('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [id]);
      if (!resRows || resRows.length === 0) {
        throw new NotFoundError(`Reservation #${id} not found.`);
      }
      const reservation = resRows[0];

      this.validatePropertyScope(req?.user, reservation.property_id);

      const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = ? FOR UPDATE', [reservation.apartment_id]);
      if (!aptRows || aptRows.length === 0) {
        throw new NotFoundError(`Assigned unit #${reservation.apartment_id} not found.`);
      }
      const apt = aptRows[0];
      if (['MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE'].includes(apt.status)) {
        throw new BadRequestError(`Unit is currently in ${apt.status} status and cannot be approved.`);
      }

      const [overlapping] = await conn.query(
        `SELECT id, reservation_code FROM reservations 
         WHERE apartment_id = ? 
           AND id != ? 
           AND status IN ('CONFIRMED', 'CHECKED_IN')
           AND check_in_date < ? 
           AND check_out_date > ? 
         LIMIT 1`,
        [reservation.apartment_id, id, reservation.check_out_date, reservation.check_in_date]
      );
      if (overlapping && overlapping.length > 0) {
        throw new ConflictError(
          `Unit '${apt.unit_name}' has a conflicting active reservation (#${overlapping[0].reservation_code}).`
        );
      }

      await conn.query(
        `UPDATE reservations 
         SET assigned_staff_id = COALESCE(assigned_staff_id, ?), 
             accepted_by_user_id = ?, 
             accepted_at = NOW(), 
             status = 'CONFIRMED',
             payment_status = 'VERIFIED',
             paid_amount = total_amount,
             updated_by = ?
         WHERE id = ?`,
        [userId, userId, userId, id]
      );

      await conn.query(
        `UPDATE operational_evidence_attachments 
         SET verification_status = 'ACCEPTED',
             verified_by_id = ?,
             verified_at = NOW(),
             verification_notes = 'Verified against bank statement by Front Desk'
         WHERE reservation_id = ?`,
        [userId, id]
      );

      await conn.query(
        `UPDATE payment_receipts 
         SET verification_status = 'VERIFIED',
             payment_status = 'PAID',
             verified_by_id = ?,
             verified_at = NOW()
         WHERE reservation_id = ?`,
        [userId, id]
      );

      await conn.query(
        `UPDATE reservation_staff_assignments 
         SET service_status = 'SERVICE_IN_PROGRESS' 
         WHERE reservation_id = ? AND is_active = 1`,
        [id]
      );

      await ReservationsRepository.recordStatusHistory(
        {
          reservationId: id,
          fromStatus: reservation.status,
          toStatus: 'CONFIRMED',
          actorId: userId,
          actorRole: req?.user?.role || 'STAFF',
          notes: `Payment verified and reservation approved by ${req?.user?.name || 'Staff'}`,
        },
        conn
      );

      const [empRows] = await conn.query('SELECT id, full_name FROM employees WHERE user_id = ?', [userId]);
      if (empRows && empRows.length > 0) {
        await conn.query(
          `INSERT INTO employee_activities (
             employee_id, property_id, activity_type, description, metadata, created_at
           ) VALUES (?, ?, 'CLIENT_ACCEPTED', ?, ?, NOW())`,
          [
            empRows[0].id,
            reservation.property_id,
            `Front desk verified bank transfer and approved booking ${reservation.reservation_code}`,
            JSON.stringify({ reservationId: id, reservationCode: reservation.reservation_code, totalAmount: reservation.total_amount }),
          ]
        );
      }

      await AuditService.record({
        req,
        action: 'RESERVATION_APPROVED',
        entityType: 'reservation',
        entityId: id,
        newValues: { status: 'CONFIRMED', payment_status: 'VERIFIED', paid_amount: reservation.total_amount },
      });

      return ReservationsRepository.findById(id, conn);
    });
  }

  /**
   * Decline Reservation with structured reason
   */
  static async declineReservation(reservationId, { reason = 'TRANSFER_NOT_FOUND', notes = '' } = {}, req = null) {
    const id = parseInt(reservationId, 10);
    const userId = req?.user?.id;
    if (!userId) {
      throw new ForbiddenError('Authentication required to decline reservations.');
    }

    return pool.withTransaction(async (conn) => {
      const [resRows] = await conn.query('SELECT * FROM reservations WHERE id = ? FOR UPDATE', [id]);
      if (!resRows || resRows.length === 0) {
        throw new NotFoundError(`Reservation #${id} not found.`);
      }
      const reservation = resRows[0];

      this.validatePropertyScope(req?.user, reservation.property_id);

      const fullDeclineReason = notes ? `${reason}: ${notes}` : reason;

      await conn.query(
        `UPDATE reservations 
         SET status = 'DECLINED',
             payment_status = 'REJECTED',
             decline_reason = ?,
             declined_at = NOW(),
             declined_by_user_id = ?,
             updated_by = ?
         WHERE id = ?`,
        [fullDeclineReason, userId, userId, id]
      );

      await conn.query(
        `UPDATE operational_evidence_attachments 
         SET verification_status = 'REJECTED',
             verified_by_id = ?,
             verified_at = NOW(),
             verification_notes = ?
         WHERE reservation_id = ?`,
        [userId, fullDeclineReason, id]
      );

      await conn.query(
        `UPDATE reservation_staff_assignments 
         SET service_status = 'CANCELLED',
             ended_at = NOW(),
             is_active = 0,
             reassignment_reason = ?
         WHERE reservation_id = ? AND is_active = 1`,
        [fullDeclineReason, id]
      );

      await ReservationsRepository.recordStatusHistory(
        {
          reservationId: id,
          fromStatus: reservation.status,
          toStatus: 'DECLINED',
          actorId: userId,
          actorRole: req?.user?.role || 'STAFF',
          notes: `Reservation declined: ${fullDeclineReason}`,
        },
        conn
      );

      await AuditService.record({
        req,
        action: 'RESERVATION_DECLINED',
        entityType: 'reservation',
        entityId: id,
        newValues: { status: 'DECLINED', payment_status: 'REJECTED', declineReason: fullDeclineReason },
      });

      return ReservationsRepository.findById(id, conn);
    });
  }

}

module.exports = ReservationsService;
