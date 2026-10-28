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
        p.state,
        p.country,
        p.description,
        p.amenities,
        p.check_in_time,
        p.check_out_time,
        p.status,
        COUNT(a.id) AS total_units,
        COUNT(CASE WHEN a.status = 'AVAILABLE' AND a.is_active = 1 THEN a.id END) AS available_units,
        MIN(a.rate_per_night) AS starting_rate
      FROM properties p
      LEFT JOIN apartments a ON p.id = a.property_id
      WHERE p.status = 'ACTIVE'
      GROUP BY p.id
      ORDER BY p.id ASC
    `);

    const scrubbedRows = rows.map((row) => ({
      ...row,
      amenities: typeof row.amenities === 'string' ? (() => {
        try { return JSON.parse(row.amenities); } catch { return []; }
      })() : (row.amenities || []),
    }));

    res.status(200).json({
      success: true,
      message: 'Active public properties retrieved.',
      data: scrubbedRows,
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
    const includeAll = req.query.includeAll === 'true' || req.query.all === 'true';
    const statusFilter = req.query.status;

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
        a.floor,
        a.capacity,
        a.bedroom_count,
        a.bathroom_count,
        a.amenities,
        a.status
      FROM apartments a
      JOIN properties p ON a.property_id = p.id
      WHERE p.status = 'ACTIVE'
    `;
    const params = [];

    if (statusFilter) {
      sql += ' AND a.status = ?';
      params.push(statusFilter);
    } else if (!includeAll) {
      sql += " AND a.status = 'AVAILABLE'";
    }

    if (propertyId) {
      sql += ' AND a.property_id = ?';
      params.push(propertyId);
    }
    sql += ' ORDER BY a.rate_per_night ASC, a.unit_number ASC';

    const rows = await db.query(sql, params);

    const scrubbedRows = rows.map((row) => ({
      ...row,
      amenities: typeof row.amenities === 'string' ? (() => {
        try { return JSON.parse(row.amenities); } catch { return []; }
      })() : (row.amenities || []),
    }));

    res.status(200).json({
      success: true,
      message: 'Available apartments retrieved.',
      data: scrubbedRows,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 2b. Public Property Detail & Room Types Showcase
async function getPublicPropertyDetail(req, res, next) {
  try {
    const propertyId = parseInt(req.params.id, 10);
    if (!propertyId || isNaN(propertyId)) {
      throw new ValidationError('A valid numeric property ID is required.');
    }

    const propRows = await db.query(
      `SELECT 
        p.id, 
        p.name, 
        p.code, 
        p.address, 
        p.city, 
        p.state,
        p.country,
        p.description,
        p.contact_phone,
        p.contact_email,
        p.amenities,
        p.check_in_time,
        p.check_out_time,
        p.status
      FROM properties p 
      WHERE p.id = ? AND p.status = 'ACTIVE'`,
      [propertyId]
    );

    if (propRows.length === 0) {
      throw new NotFoundError('Property not found or is currently not active for public booking.');
    }

    const property = {
      ...propRows[0],
      amenities: typeof propRows[0].amenities === 'string' ? (() => {
        try { return JSON.parse(propRows[0].amenities); } catch { return []; }
      })() : (propRows[0].amenities || []),
    };

    const unitRows = await db.query(
      `SELECT 
        a.id, 
        a.property_id, 
        a.unit_number, 
        a.unit_name, 
        a.unit_type, 
        a.rate_per_night,
        a.floor,
        a.capacity,
        a.bedroom_count,
        a.bathroom_count,
        a.amenities,
        a.status
      FROM apartments a
      WHERE a.property_id = ? AND a.is_active = 1
      ORDER BY a.rate_per_night ASC, a.unit_number ASC`,
      [propertyId]
    );

    const units = unitRows.map((u) => ({
      ...u,
      amenities: typeof u.amenities === 'string' ? (() => {
        try { return JSON.parse(u.amenities); } catch { return []; }
      })() : (u.amenities || []),
    }));

    // Group units into Room Types
    const roomTypeMap = new Map();
    for (const unit of units) {
      const typeKey = unit.unit_type || 'Standard Suite';
      if (!roomTypeMap.has(typeKey)) {
        roomTypeMap.set(typeKey, {
          unitType: typeKey,
          startingRate: parseFloat(unit.rate_per_night) || 0,
          capacity: unit.capacity || 2,
          bedroomCount: unit.bedroom_count || 1,
          bathroomCount: unit.bathroom_count || 1,
          amenities: Array.isArray(unit.amenities) && unit.amenities.length > 0 ? unit.amenities : property.amenities,
          totalUnits: 0,
          availableUnits: 0,
          unitIds: [],
          units: [],
        });
      }
      const roomType = roomTypeMap.get(typeKey);
      roomType.totalUnits += 1;
      if (unit.status === 'AVAILABLE') {
        roomType.availableUnits += 1;
      }
      const unitRate = parseFloat(unit.rate_per_night) || 0;
      if (unitRate < roomType.startingRate || roomType.startingRate === 0) {
        roomType.startingRate = unitRate;
      }
      roomType.unitIds.push(unit.id);
      roomType.units.push(unit);
    }

    const roomTypes = Array.from(roomTypeMap.values());

    res.status(200).json({
      success: true,
      message: 'Property detail and room types retrieved.',
      data: {
        property,
        roomTypes,
        units,
        totalUnits: units.length,
        availableUnits: units.filter((u) => u.status === 'AVAILABLE').length,
        startingRate: roomTypes.length > 0 ? Math.min(...roomTypes.map((rt) => rt.startingRate)) : 0,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 2c. Public Property Room Types Listing
async function getPublicRoomTypes(req, res, next) {
  try {
    const propertyId = parseInt(req.params.id, 10);
    if (!propertyId || isNaN(propertyId)) {
      throw new ValidationError('A valid numeric property ID is required.');
    }

    const propRows = await db.query(
      'SELECT id, name, code, city, amenities FROM properties WHERE id = ? AND status = "ACTIVE"',
      [propertyId]
    );
    if (propRows.length === 0) {
      throw new NotFoundError('Property not found or is currently not active.');
    }

    const property = propRows[0];
    const defaultAmenities = typeof property.amenities === 'string' ? (() => {
      try { return JSON.parse(property.amenities); } catch { return []; }
    })() : (property.amenities || []);

    const unitRows = await db.query(
      `SELECT 
        a.id, 
        a.property_id, 
        a.unit_number, 
        a.unit_name, 
        a.unit_type, 
        a.rate_per_night,
        a.floor,
        a.capacity,
        a.bedroom_count,
        a.bathroom_count,
        a.amenities,
        a.status
      FROM apartments a
      WHERE a.property_id = ? AND a.is_active = 1
      ORDER BY a.rate_per_night ASC, a.unit_number ASC`,
      [propertyId]
    );

    const roomTypeMap = new Map();
    for (const unit of unitRows) {
      const typeKey = unit.unit_type || 'Standard Suite';
      if (!roomTypeMap.has(typeKey)) {
        const parsedAmn = typeof unit.amenities === 'string' ? (() => {
          try { return JSON.parse(unit.amenities); } catch { return defaultAmenities; }
        })() : (unit.amenities || defaultAmenities);

        roomTypeMap.set(typeKey, {
          unitType: typeKey,
          startingRate: parseFloat(unit.rate_per_night) || 0,
          capacity: unit.capacity || 2,
          bedroomCount: unit.bedroom_count || 1,
          bathroomCount: unit.bathroom_count || 1,
          amenities: parsedAmn,
          totalUnits: 0,
          availableUnits: 0,
          sampleUnitId: unit.id,
          unitNumbers: [],
        });
      }
      const roomType = roomTypeMap.get(typeKey);
      roomType.totalUnits += 1;
      if (unit.status === 'AVAILABLE') {
        roomType.availableUnits += 1;
      }
      const unitRate = parseFloat(unit.rate_per_night) || 0;
      if (unitRate < roomType.startingRate || roomType.startingRate === 0) {
        roomType.startingRate = unitRate;
      }
      roomType.unitNumbers.push(unit.unit_number);
    }

    res.status(200).json({
      success: true,
      message: 'Room types for property retrieved.',
      data: Array.from(roomTypeMap.values()),
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
        check_out_date: req.body.checkOutDate || req.body.check_out_date,
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
  getPublicPropertyDetail,
  getPublicRoomTypes,
  checkAvailability,
  createPublicBooking,
  getPublicAnnouncements,
};
