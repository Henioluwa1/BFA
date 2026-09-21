const db = require('../../db/pool');
const { ValidationError, NotFoundError, ConflictError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');

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

// 3. Check Availability (Strict 1-Night Duration)
async function checkAvailability(req, res, next) {
  try {
    const { apartmentId, checkInDate } = req.body;
    if (!apartmentId || !checkInDate) {
      throw new ValidationError('apartmentId and checkInDate are required.');
    }

    const checkIn = new Date(checkInDate);
    if (isNaN(checkIn.getTime())) {
      throw new ValidationError('Invalid checkInDate format. Use YYYY-MM-DD.');
    }

    // Automatically calculate 1-night checkout date
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + 1);
    const checkInStr = checkIn.toISOString().split('T')[0];
    const checkOutStr = checkOut.toISOString().split('T')[0];

    // Fetch apartment info
    const units = await db.query(
      'SELECT a.*, p.name as property_name FROM apartments a JOIN properties p ON a.property_id = p.id WHERE a.id = ?',
      [apartmentId]
    );
    if (units.length === 0) {
      throw new NotFoundError(`Apartment #${apartmentId} not found.`);
    }
    const unit = units[0];

    // Check conflict
    const conflicts = await db.query(
      `SELECT id FROM reservations 
       WHERE apartment_id = ? 
         AND status NOT IN ('CANCELLED') 
         AND (check_in_date < ? AND check_out_date > ?)`,
      [apartmentId, checkOutStr, checkInStr]
    );

    const isAvailable = conflicts.length === 0 && unit.status === 'AVAILABLE';

    res.status(200).json({
      success: true,
      message: isAvailable ? 'Apartment is available for booking.' : 'Apartment is reserved for selected date.',
      data: {
        isAvailable,
        apartmentId: unit.id,
        unitName: unit.unit_name,
        unitNumber: unit.unit_number,
        propertyName: unit.property_name,
        ratePerNight: parseFloat(unit.rate_per_night),
        checkInDate: checkInStr,
        checkOutDate: checkOutStr,
        nights: 1,
        totalAmount: parseFloat(unit.rate_per_night),
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 4. Public Online Booking Submission
async function createPublicBooking(req, res, next) {
  try {
    const { apartmentId, guestName, guestEmail, guestPhone, checkInDate } = req.body;

    if (!apartmentId || !guestName || !guestEmail || !guestPhone || !checkInDate) {
      throw new ValidationError('All booking fields are required (apartmentId, guestName, guestEmail, guestPhone, checkInDate).');
    }

    const checkIn = new Date(checkInDate);
    if (isNaN(checkIn.getTime())) {
      throw new ValidationError('Invalid checkInDate. Expected format YYYY-MM-DD.');
    }

    // Strictly enforce 1-night rule
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + 1);
    const checkInStr = checkIn.toISOString().split('T')[0];
    const checkOutStr = checkOut.toISOString().split('T')[0];

    const units = await db.query(
      'SELECT a.*, p.id as prop_id, p.name as property_name FROM apartments a JOIN properties p ON a.property_id = p.id WHERE a.id = ?',
      [apartmentId]
    );
    if (units.length === 0) {
      throw new NotFoundError(`Apartment #${apartmentId} not found.`);
    }
    const unit = units[0];

    // Check double-booking conflict
    const conflicts = await db.query(
      `SELECT id FROM reservations 
       WHERE apartment_id = ? 
         AND status NOT IN ('CANCELLED') 
         AND (check_in_date < ? AND check_out_date > ?)`,
      [apartmentId, checkOutStr, checkInStr]
    );

    if (conflicts.length > 0) {
      throw new ConflictError('This apartment is already booked for the selected 1-night date.');
    }

    const reservationCode = `BFA-PUB-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const totalAmount = parseFloat(unit.rate_per_night);

    const result = await db.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0.00, 'CONFIRMED')`,
      [reservationCode, unit.prop_id, unit.id, guestName.trim(), guestEmail.trim(), guestPhone.trim(), checkInStr, checkOutStr, totalAmount]
    );

    await auditService.record({
      actorId: null,
      actorEmail: guestEmail.trim(),
      actorRole: 'PUBLIC_GUEST',
      action: 'PUBLIC_RESERVATION_CREATE',
      entityType: 'reservation',
      entityId: String(result.insertId),
      newValues: {
        reservationCode,
        propertyId: unit.prop_id,
        apartmentId: unit.id,
        checkInDate: checkInStr,
        checkOutDate: checkOutStr,
        totalAmount,
      },
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      success: true,
      message: 'Reservation created successfully! Your booking is confirmed.',
      data: {
        id: result.insertId,
        reservationCode,
        guestName,
        guestEmail,
        propertyName: unit.property_name,
        unitName: unit.unit_name,
        unitNumber: unit.unit_number,
        checkInDate: checkInStr,
        checkOutDate: checkOutStr,
        nights: 1,
        totalAmount,
        status: 'CONFIRMED',
      },
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
};
