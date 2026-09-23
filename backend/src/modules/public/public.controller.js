const db = require('../../db/pool');
const { ValidationError, NotFoundError, ConflictError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');
const AccessControlService = require('../../core/access/accessControl.service');
const BookingAuthService = require('../bookingAuth/bookingAuth.service');
const PaymentsService = require('../payments/payments.service');
const NotificationsService = require('../notifications/notifications.service');
const ReservationsService = require('../reservations/reservations.service');
const ReservationsRepository = require('../reservations/reservations.repository');

// 1. Public Properties Showcase
async function getPublicProperties(req, res, next) {
  try {
    const rows = await db.query(`
      SELECT 
        p.id, 
        p.name, 
        p.code, 
        p.address, 
        p.city, 
        p.status,
        COUNT(a.id) AS total_units,
        MIN(a.rate_per_night) AS starting_rate
      FROM properties p
      LEFT JOIN apartments a ON p.id = a.property_id
      WHERE p.status = 'ACTIVE'
      GROUP BY p.id
      ORDER BY p.id ASC
    `);

    res.status(200).json({
      success: true,
      message: 'Active public properties retrieved.',
      data: rows,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 2. Public Available Apartments
async function getPublicApartments(req, res, next) {
  try {
    const propertyId = req.query.propertyId ? parseInt(req.query.propertyId, 10) : null;
    let sql = `
      SELECT 
        a.id, 
        a.property_id, 
        p.name AS property_name, 
        p.city,
        a.unit_number, 
        a.unit_name, 
        a.unit_type, 
        a.rate_per_night,
        a.status
      FROM apartments a
      JOIN properties p ON a.property_id = p.id
      WHERE a.status = 'AVAILABLE' AND p.status = 'ACTIVE'
    `;
    const params = [];
    if (propertyId) {
      sql += ' AND a.property_id = ?';
      params.push(propertyId);
    }
    sql += ' ORDER BY a.rate_per_night ASC';

    const rows = await db.query(sql, params);

    res.status(200).json({
      success: true,
      message: 'Available apartments retrieved.',
      data: rows,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 3. Check Availability (Delegates to authoritative centralized ReservationsService)
async function checkAvailability(req, res, next) {
  try {
    const { apartmentId, checkInDate } = req.body;
    if (!apartmentId || !checkInDate) {
      throw new ValidationError('apartmentId and checkInDate are required.');
    }

    const availability = await ReservationsService.checkAvailability({
      apartmentId: parseInt(apartmentId, 10),
      checkInDate,
    });

    if (!availability.isAvailable) {
      return res.status(200).json({
        success: true,
        message: availability.reason,
        data: {
          isAvailable: false,
          reason: availability.reason,
          apartmentId: availability.apartment?.id,
          unitName: availability.apartment?.unit_name,
          unitNumber: availability.apartment?.unit_number,
          propertyName: availability.apartment?.property_name,
          ratePerNight: parseFloat(availability.apartment?.rate_per_night || 0),
        },
        meta: { timestamp: new Date().toISOString(), requestId: req.id },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Apartment is available for booking.',
      data: {
        isAvailable: true,
        apartmentId: availability.apartment.id,
        unitName: availability.apartment.unit_name,
        unitNumber: availability.apartment.unit_number,
        propertyName: availability.apartment.property_name,
        ratePerNight: availability.ratePerNight,
        checkInDate: availability.checkInDate,
        checkOutDate: availability.checkOutDate,
        nights: 1,
        totalAmount: availability.totalAmount,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 4. Public Online Booking Submission (Delegates to authoritative centralized ReservationsService)
async function createPublicBooking(req, res, next) {
  try {
    const {
      apartmentId,
      guestName,
      guestEmail,
      guestPhone,
      checkInDate,
      paymentOption = 'PAY_ONLINE',
      paymentMethod = 'CARD',
    } = req.body;

    if (!apartmentId || !guestName || !guestEmail || !guestPhone || !checkInDate) {
      throw new ValidationError('All booking fields are required (apartmentId, guestName, guestEmail, guestPhone, checkInDate).');
    }

    // Validate payment option capability
    const isPayAtProperty = paymentOption === 'PAY_AT_PROPERTY';
    if (isPayAtProperty) {
      const capCheck = await AccessControlService.canAccess(null, 'PAY_AT_PROPERTY');
      if (!capCheck.allowed) {
        throw new ValidationError(`Pay at Property is currently disabled by management (${capCheck.reason}). Please select Pay Online.`);
      }
    } else {
      const capCheck = await AccessControlService.canAccess(null, 'ONLINE_PAYMENT');
      if (!capCheck.allowed) {
        throw new ValidationError(`Online payment is currently disabled (${capCheck.reason}).`);
      }
    }

    const finalPaymentMethod = isPayAtProperty ? 'PAY_AT_PROPERTY' : (paymentMethod || 'CARD');

    // Create reservation via central authoritative reservation engine (concurrency-safe transaction)
    const reservation = await ReservationsService.createReservation(
      {
        apartment_id: parseInt(apartmentId, 10),
        tenant_name: guestName,
        tenant_email: guestEmail,
        tenant_phone: guestPhone,
        check_in_date: checkInDate,
        source: 'ONLINE',
        payment_method: finalPaymentMethod,
        payment_status: isPayAtProperty ? 'PAYMENT_PENDING' : 'PAYMENT_SUCCESS',
        paid_amount: isPayAtProperty ? 0.00 : undefined,
      },
      req
    );

    // Authoritative payment transaction processing
    await PaymentsService.processPayment({
      reservationId: reservation.id,
      paymentMethod: finalPaymentMethod,
      amount: reservation.total_amount,
      currency: 'NGN',
      provider: isPayAtProperty ? 'OFFLINE_COUNTER' : 'MOCK_GATEWAY',
      req,
    });

    if (!isPayAtProperty) {
      await ReservationsRepository.update(reservation.id, {
        paid_amount: reservation.total_amount,
        payment_status: 'PAYMENT_SUCCESS',
      });
    }

    const outstandingBalance = isPayAtProperty ? parseFloat(reservation.total_amount) : 0.00;
    const paidAmount = isPayAtProperty ? 0.00 : parseFloat(reservation.total_amount);

    // Return scrubbed public response
    return res.status(201).json({
      success: true,
      message: 'Reservation created successfully! Your booking is confirmed.',
      data: {
        id: reservation.id,
        reservationCode: reservation.reservation_code,
        authCode: reservation.auth_code,
        guestName: reservation.tenant_name,
        guestEmail: reservation.tenant_email,
        propertyName: reservation.property_name,
        unitName: reservation.unit_name,
        unitNumber: reservation.unit_number,
        checkInDate: reservation.check_in_date,
        checkOutDate: reservation.check_out_date,
        nights: 1,
        totalAmount: parseFloat(reservation.total_amount),
        paidAmount,
        outstandingBalance,
        status: reservation.status,
        paymentStatus: isPayAtProperty ? 'PAYMENT_PENDING' : 'PAYMENT_SUCCESS',
        paymentMethod: finalPaymentMethod,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 5. Public Announcements
async function getPublicAnnouncements(req, res, next) {
  try {
    const { location = 'PUBLIC_LANDING', propertyId } = req.query;
    const data = await NotificationsService.getActiveAnnouncements({
      displayLocation: location,
      propertyId,
    });
    res.status(200).json({
      success: true,
      message: 'Active public announcements retrieved.',
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPublicProperties,
  getPublicApartments,
  checkAvailability,
  createPublicBooking,
  getPublicAnnouncements,
};
