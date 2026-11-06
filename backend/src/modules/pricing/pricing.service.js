const crypto = require('crypto');
const pool = require('../../db/pool');
const config = require('../../config');
const { ValidationError, NotFoundError, ConflictError } = require('../../core/errors/apiError');

class PricingService {
  /**
   * Helper: Validate and normalize 1-night stay rule
   */
  static validateOneNightStay(checkInDate, checkOutDate) {
    if (!checkInDate) {
      throw new ValidationError('checkInDate is required.');
    }

    const inDate = new Date(checkInDate);
    if (isNaN(inDate.getTime())) {
      throw new ValidationError(`Invalid checkInDate format: '${checkInDate}'. Expected YYYY-MM-DD.`);
    }

    const calculatedOut = new Date(inDate.getTime() + 24 * 60 * 60 * 1000);
    const validIn = inDate.toISOString().slice(0, 10);
    const validOut = calculatedOut.toISOString().slice(0, 10);

    if (checkOutDate) {
      const outDate = new Date(checkOutDate);
      if (isNaN(outDate.getTime())) {
        throw new ValidationError(`Invalid checkOutDate format: '${checkOutDate}'.`);
      }
      const diffMs = outDate.getTime() - inDate.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays !== 1) {
        throw new ValidationError(
          `BFA Apartments strictly enforce a 1-night maximum stay per reservation (requested: ${diffDays} nights). Check-out must be ${validOut}.`
        );
      }
    }

    return { checkInDate: validIn, checkOutDate: validOut };
  }

  /**
   * Authoritative server-side price quote generator
   * Computes rate, verifies unit & operational constraints, and produces a 15-minute HMAC token
   */
  static async generateQuote({ apartmentId, checkInDate, checkOutDate, guests, propertyId, tierCode }, conn = pool) {
    if (!apartmentId) {
      throw new ValidationError('apartmentId is required to generate a quote.');
    }

    const aptId = parseInt(apartmentId, 10);
    if (isNaN(aptId)) {
      throw new ValidationError('apartmentId must be a valid number.');
    }

    const { checkInDate: validIn, checkOutDate: validOut } = this.validateOneNightStay(checkInDate, checkOutDate);

    // 1. Fetch apartment & property
    const aptQuery = `
      SELECT 
        a.id,
        a.property_id,
        a.unit_number,
        a.unit_name,
        a.unit_type,
        a.rate_per_night,
        a.capacity,
        a.status AS unit_status,
        a.is_active,
        p.name AS property_name,
        p.code AS property_code,
        p.status AS property_status
      FROM apartments a
      JOIN properties p ON a.property_id = p.id
      WHERE a.id = ?
    `;
    const aptRows = conn === pool ? await pool.query(aptQuery, [aptId]) : (await conn.query(aptQuery, [aptId]))[0];

    if (!aptRows || aptRows.length === 0) {
      throw new NotFoundError(`Apartment #${aptId} not found.`);
    }

    const apartment = aptRows[0];

    // Validate property match if supplied
    if (propertyId && parseInt(propertyId, 10) !== parseInt(apartment.property_id, 10)) {
      throw new ValidationError(`Apartment #${aptId} belongs to Property #${apartment.property_id}, not #${propertyId}.`);
    }

    // Operational checks
    if (apartment.property_status !== 'ACTIVE') {
      throw new ConflictError(`Property '${apartment.property_name}' is currently ${apartment.property_status}.`);
    }
    if (apartment.is_active === 0 || ['MAINTENANCE', 'OUT_OF_SERVICE', 'BLOCKED'].includes(apartment.unit_status)) {
      throw new ConflictError(`Unit '${apartment.unit_name}' (${apartment.unit_number}) is currently unavailable (${apartment.unit_status}).`);
    }

    // Check capacity if guests provided
    if (guests && parseInt(guests, 10) > apartment.capacity) {
      throw new ValidationError(`Guest count (${guests}) exceeds unit maximum capacity of ${apartment.capacity}.`);
    }

    // Check blocked periods
    const blockQuery = `
      SELECT id, reason FROM blocked_periods
      WHERE apartment_id = ? AND start_date <= ? AND end_date >= ?
    `;
    const blockRows = conn === pool ? await pool.query(blockQuery, [aptId, validIn, validIn]) : (await conn.query(blockQuery, [aptId, validIn, validIn]))[0];
    if (blockRows.length > 0) {
      throw new ConflictError(`Apartment is unavailable on ${validIn}: ${blockRows[0].reason || 'Operational block'}.`);
    }

    // Check active conflicting reservations
    const resQuery = `
      SELECT id FROM reservations
      WHERE apartment_id = ?
        AND check_in_date = ?
        AND status NOT IN ('CANCELLED')
    `;
    const conflictRows = conn === pool ? await pool.query(resQuery, [aptId, validIn]) : (await conn.query(resQuery, [aptId, validIn]))[0];
    if (conflictRows.length > 0) {
      throw new ConflictError(`Apartment #${apartment.unit_number} is already booked for ${validIn}.`);
    }

    // Authoritative calculation
    const baseRate = parseFloat(apartment.rate_per_night);
    const nights = 1;
    const subtotal = Math.round(baseRate * nights * 100) / 100;
    const cautionDeposit = 0.00; // Configurable per property or apartment
    const totalAmount = Math.round((subtotal + cautionDeposit) * 100) / 100;
    const currency = 'NGN';

    // Quote validity: 15 minutes (900 seconds)
    const expiresAt = Date.now() + 15 * 60 * 1000;

    const payload = {
      apartmentId: apartment.id,
      propertyId: apartment.property_id,
      checkInDate: validIn,
      checkOutDate: validOut,
      nights,
      baseRate,
      subtotal,
      cautionDeposit,
      totalAmount,
      currency,
      expiresAt,
    };

    // Cryptographic signature
    const rawString = `${payload.apartmentId}|${payload.propertyId}|${payload.checkInDate}|${payload.checkOutDate}|${payload.totalAmount.toFixed(2)}|${payload.expiresAt}`;
    const signature = crypto.createHmac('sha256', config.security.jwtSecret).update(rawString).digest('hex');

    const quoteToken = Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');

    return {
      quoteToken,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInSeconds: 900,
      breakdown: {
        baseRate,
        nights,
        subtotal,
        cautionDeposit,
        totalAmount,
        currency,
      },
      apartment: {
        id: apartment.id,
        unitNumber: apartment.unit_number,
        unitName: apartment.unit_name,
        unitType: apartment.unit_type,
        propertyId: apartment.property_id,
        propertyName: apartment.property_name,
      },
    };
  }

  /**
   * Verify cryptographic quote token and check expiration
   */
  static verifyQuoteToken(quoteToken) {
    if (!quoteToken || typeof quoteToken !== 'string') {
      throw new ValidationError('quoteToken must be a valid non-empty string.');
    }

    let parsed;
    try {
      const decoded = Buffer.from(quoteToken, 'base64url').toString('utf8');
      parsed = JSON.parse(decoded);
    } catch {
      throw new ValidationError('Malformed quoteToken format.');
    }

    const { payload, signature } = parsed || {};
    if (!payload || !signature) {
      throw new ValidationError('Invalid quoteToken structure.');
    }

    const { apartmentId, propertyId, checkInDate, checkOutDate, totalAmount, expiresAt } = payload;
    if (!apartmentId || !checkInDate || !checkOutDate || totalAmount === undefined || !expiresAt) {
      throw new ValidationError('Incomplete payload in quoteToken.');
    }

    // Verify HMAC
    const rawString = `${apartmentId}|${propertyId}|${checkInDate}|${checkOutDate}|${Number(totalAmount).toFixed(2)}|${expiresAt}`;
    const expectedSig = crypto.createHmac('sha256', config.security.jwtSecret).update(rawString).digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new ValidationError('Cryptographic verification failed: quoteToken signature is invalid or has been tampered with.');
    }

    // Check expiration
    if (Date.now() > expiresAt) {
      throw new ValidationError('The price quote token has expired (validity is 15 minutes). Please obtain a fresh price quote.');
    }

    return payload;
  }
}

module.exports = PricingService;
