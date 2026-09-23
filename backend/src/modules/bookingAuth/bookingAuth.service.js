const crypto = require('crypto');
const pool = require('../../db/pool');
const { ValidationError, NotFoundError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');

class BookingAuthService {
  /**
   * Generate an unpredictable, collision-resistant booking authentication code
   */
  static generateAuthCode() {
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `BFA-AUTH-${randomHex}`;
  }

  /**
   * Register a new booking authentication code for a confirmed reservation
   */
  static async registerBookingAuth({ reservationId, guestEmail, guestPhone, expiresAt = null }, conn = null) {
    const executor = conn || pool;
    let authCode = this.generateAuthCode();
    let collision = true;
    let attempts = 0;

    while (collision && attempts < 5) {
      const existing = await executor.query('SELECT id FROM booking_authentications WHERE auth_code = ?', [authCode]);
      const rows = existing[0] && Array.isArray(existing[0]) ? existing[0] : existing;
      if (!rows || rows.length === 0) {
        collision = false;
      } else {
        authCode = this.generateAuthCode();
        attempts++;
      }
    }

    await executor.query(
      `INSERT INTO booking_authentications (reservation_id, auth_code, guest_email, guest_phone, status, expires_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?)
       ON DUPLICATE KEY UPDATE auth_code = VALUES(auth_code), guest_email = VALUES(guest_email), guest_phone = VALUES(guest_phone), status = 'ACTIVE'`,
      [reservationId, authCode, guestEmail.toLowerCase().trim(), guestPhone.trim(), expiresAt]
    );

    return authCode;
  }

  /**
   * Authenticate and lookup a reservation using Booking Authentication Code + Guest Verification
   */
  static async verifyAndLookup({ authCode, guestEmail = null, guestPhone = null, req = null }) {
    if (!authCode || !authCode.trim()) {
      throw new ValidationError('Booking Authentication Code is required.');
    }

    const cleanCode = authCode.trim().toUpperCase();

    let sql = `
      SELECT 
        ba.auth_code,
        ba.status as auth_status,
        ba.created_at as auth_issued_at,
        r.id as reservation_id,
        r.reservation_code,
        r.tenant_name as guest_name,
        r.tenant_email as guest_email,
        r.tenant_phone as guest_phone,
        r.check_in_date,
        r.check_out_date,
        r.nights,
        r.total_amount,
        r.paid_amount,
        r.status as reservation_status,
        r.payment_status,
        r.payment_method,
        p.name as property_name,
        p.code as property_code,
        p.address as property_address,
        p.city as property_city,
        a.unit_number,
        a.unit_name,
        a.unit_type
      FROM booking_authentications ba
      JOIN reservations r ON ba.reservation_id = r.id
      JOIN properties p ON r.property_id = p.id
      JOIN apartments a ON r.apartment_id = a.id
      WHERE ba.auth_code = ? AND ba.status = 'ACTIVE'
    `;
    const params = [cleanCode];

    // Optional verification verification (if email or phone is passed, strictly verify)
    if (guestEmail) {
      sql += ' AND LOWER(ba.guest_email) = ?';
      params.push(guestEmail.toLowerCase().trim());
    }
    if (guestPhone) {
      sql += ' AND ba.guest_phone = ?';
      params.push(guestPhone.trim());
    }

    const rows = await pool.query(sql, params);
    if (rows.length === 0) {
      await auditService.record({
        req,
        actorRole: 'PUBLIC_GUEST',
        action: 'BOOKING_AUTH_FAILED',
        entityType: 'booking_authentication',
        entityId: cleanCode,
        newValues: { attemptedCode: cleanCode, guestEmail, guestPhone },
      });
      throw new NotFoundError(
        'No valid active reservation found matching the provided Booking Authentication Code and credentials.'
      );
    }

    const b = rows[0];

    await auditService.record({
      req,
      actorRole: 'PUBLIC_GUEST',
      actorEmail: b.guest_email,
      action: 'BOOKING_AUTH_VERIFIED',
      entityType: 'booking_authentication',
      entityId: cleanCode,
      newValues: { reservationCode: b.reservation_code, authCode: cleanCode },
    });

    const outstandingBalance = Math.max(0, parseFloat(b.total_amount) - parseFloat(b.paid_amount || 0));

    return {
      authCode: b.auth_code,
      reservationCode: b.reservation_code,
      guestName: b.guest_name,
      guestEmail: b.guest_email,
      guestPhone: b.guest_phone,
      propertyName: b.property_name,
      propertyAddress: `${b.property_address}, ${b.property_city}`,
      unitNumber: b.unit_number,
      unitName: b.unit_name,
      unitType: b.unit_type,
      checkInDate: b.check_in_date,
      checkOutDate: b.check_out_date,
      nights: b.nights,
      totalAmount: parseFloat(b.total_amount),
      paidAmount: parseFloat(b.paid_amount || 0),
      outstandingBalance,
      reservationStatus: b.reservation_status,
      paymentStatus: b.payment_status,
      paymentMethod: b.payment_method,
      issuedAt: b.auth_issued_at,
      importantInstructions: [
        'Check-in starts at 14:00 (2:00 PM) on the arrival date.',
        'Standard check-out is by 11:00 AM on the departure date.',
        'BFA strict 1-night maximum booking policy applies.',
        'Present this Booking Authentication Code upon arrival for instant key handover.',
        b.payment_status !== 'PAYMENT_SUCCESS'
          ? `Outstanding balance of ₦${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} is due upon arrival.`
          : 'Reservation is fully paid in advance.',
      ],
    };
  }
}

module.exports = BookingAuthService;
