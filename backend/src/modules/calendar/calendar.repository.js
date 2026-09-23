const pool = require('../../db/pool');

class CalendarRepository {
  /**
   * Fetch calendar events (Reservations + Blocked Periods) for date range
   */
  static async getEvents({ propertyId, apartmentId, status, agentId, fromDate, toDate, user } = {}) {
    const events = [];

    // 1. Fetch Reservations
    let resSql = `
      SELECT r.id, r.reservation_code, r.check_in_date, r.check_out_date, r.status,
             r.source, r.total_amount, r.paid_amount, r.tenant_name, r.tenant_phone,
             p.id as property_id, p.name as property_name, p.code as property_code,
             a.id as apartment_id, a.unit_number, a.unit_name, a.unit_type,
             ag.name as agent_name, ba.auth_code,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      LEFT JOIN booking_authentications ba ON ba.reservation_id = r.id
      WHERE 1=1
    `;
    const resParams = [];

    // Role-based property scope
    if (user) {
      const role = (user.role || '').toUpperCase();
      if (['MANAGER', 'RECEPTIONIST', 'STAFF'].includes(role) && user.propertyId) {
        resSql += ' AND r.property_id = ?';
        resParams.push(user.propertyId);
      }
      if (role === 'AGENT') {
        resSql += ' AND r.agent_id = ?';
        resParams.push(user.agentId || -1); // Strict agent isolation
      }
    }

    if (propertyId && propertyId !== 'all') {
      resSql += ' AND r.property_id = ?';
      resParams.push(propertyId);
    }

    if (apartmentId) {
      resSql += ' AND r.apartment_id = ?';
      resParams.push(apartmentId);
    }

    if (status && status !== 'ALL') {
      resSql += ' AND r.status = ?';
      resParams.push(status);
    }

    if (agentId) {
      resSql += ' AND r.agent_id = ?';
      resParams.push(agentId);
    }

    if (fromDate) {
      resSql += ' AND r.check_out_date >= ?';
      resParams.push(fromDate);
    }

    if (toDate) {
      resSql += ' AND r.check_in_date <= ?';
      resParams.push(toDate);
    }

    resSql += ' ORDER BY r.check_in_date ASC;';
    const reservationRows = await pool.query(resSql, resParams);

    for (const r of reservationRows) {
      events.push({
        id: `res-${r.id}`,
        eventId: r.id,
        type: 'RESERVATION',
        title: `Unit ${r.unit_number}: ${r.tenant_name} (${r.status})`,
        start: r.check_in_date,
        end: r.check_out_date,
        status: r.status,
        reservationCode: r.reservation_code,
        authCode: r.auth_code,
        propertyId: r.property_id,
        propertyName: r.property_name,
        apartmentId: r.apartment_id,
        unitNumber: r.unit_number,
        unitName: r.unit_name,
        unitType: r.unit_type,
        tenantName: r.tenant_name,
        tenantPhone: r.tenant_phone,
        totalAmount: r.total_amount,
        paidAmount: r.paid_amount,
        outstandingBalance: r.outstanding_balance,
        source: r.source,
        agentName: r.agent_name,
      });
    }

    // 2. Fetch Blocked Periods (if user is not restricted agent)
    if (user?.role !== 'AGENT') {
      let blockSql = `
        SELECT bp.id, bp.start_date, bp.end_date, bp.reason,
               p.id as property_id, p.name as property_name,
               a.id as apartment_id, a.unit_number, a.unit_name
        FROM blocked_periods bp
        JOIN properties p ON p.id = bp.property_id
        JOIN apartments a ON a.id = bp.apartment_id
        WHERE 1=1
      `;
      const blockParams = [];

      if (propertyId && propertyId !== 'all') {
        blockSql += ' AND bp.property_id = ?';
        blockParams.push(propertyId);
      }
      if (apartmentId) {
        blockSql += ' AND bp.apartment_id = ?';
        blockParams.push(apartmentId);
      }
      if (fromDate) {
        blockSql += ' AND bp.end_date >= ?';
        blockParams.push(fromDate);
      }
      if (toDate) {
        blockSql += ' AND bp.start_date <= ?';
        blockParams.push(toDate);
      }

      blockSql += ' ORDER BY bp.start_date ASC;';
      const blockedRows = await pool.query(blockSql, blockParams);

      for (const b of blockedRows) {
        events.push({
          id: `block-${b.id}`,
          eventId: b.id,
          type: 'BLOCKED',
          title: `Unit ${b.unit_number}: Blocked (${b.reason})`,
          start: b.start_date,
          end: b.end_date,
          status: 'BLOCKED',
          reason: b.reason,
          propertyId: b.property_id,
          propertyName: b.property_name,
          apartmentId: b.apartment_id,
          unitNumber: b.unit_number,
          unitName: b.unit_name,
        });
      }
    }

    return events;
  }

  /**
   * Fetch timeline unit occupancy grid for date range
   */
  static async getUnitTimeline({ propertyId, startDate, endDate, user } = {}) {
    let aptSql = `
      SELECT a.id, a.property_id, a.unit_number, a.unit_name, a.unit_type, a.status, a.rate_per_night,
             p.name as property_name, p.code as property_code
      FROM apartments a
      JOIN properties p ON p.id = a.property_id
      WHERE a.is_active = 1
    `;
    const aptParams = [];

    if (propertyId && propertyId !== 'all') {
      aptSql += ' AND a.property_id = ?';
      aptParams.push(propertyId);
    }
    if (user?.role === 'MANAGER' && user.propertyId) {
      aptSql += ' AND a.property_id = ?';
      aptParams.push(user.propertyId);
    }

    aptSql += ' ORDER BY a.property_id ASC, a.unit_number ASC;';
    const apartments = await pool.query(aptSql, aptParams);

    // Fetch active reservations in range
    let resSql = `
      SELECT r.id, r.apartment_id, r.check_in_date, r.check_out_date, r.status,
             r.reservation_code, r.tenant_name, ba.auth_code
      FROM reservations r
      LEFT JOIN booking_authentications ba ON ba.reservation_id = r.id
      WHERE r.status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING')
        AND r.check_out_date >= ?
        AND r.check_in_date <= ?
    `;
    const resRows = await pool.query(resSql, [startDate, endDate]);

    // Fetch blocked periods in range
    let blockSql = `
      SELECT bp.id, bp.apartment_id, bp.start_date, bp.end_date, bp.reason
      FROM blocked_periods bp
      WHERE bp.end_date >= ? AND bp.start_date <= ?
    `;
    const blockRows = await pool.query(blockSql, [startDate, endDate]);

    return {
      apartments,
      reservations: resRows,
      blockedPeriods: blockRows,
      startDate,
      endDate,
    };
  }
}

module.exports = CalendarRepository;
