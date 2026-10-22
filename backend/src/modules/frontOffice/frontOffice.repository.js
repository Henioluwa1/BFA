const pool = require('../../db/pool');

class FrontOfficeRepository {
  /**
   * Get arrivals for specified date (default today)
   */
  static async getArrivals({ propertyId, date, user } = {}) {
    let sql = `
      SELECT r.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, a.unit_type, a.status as unit_status,
             ag.name as agent_name,
             g.display_name as guest_name, g.phone as guest_phone, g.email as guest_email,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      LEFT JOIN guests g ON g.id = r.guest_id
      WHERE r.check_in_date = ?
        AND r.status IN ('CONFIRMED', 'PENDING')
    `;
    const params = [date];

    if (['MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'].includes(user?.role) && user.propertyId) {
      sql += ' AND r.property_id = ?';
      params.push(user.propertyId);
    }
    if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }

    sql += ' ORDER BY a.unit_number ASC;';
    return pool.query(sql, params);
  }

  /**
   * Get departures for specified date (default today)
   */
  static async getDepartures({ propertyId, date, user } = {}) {
    let sql = `
      SELECT r.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, a.unit_type, a.status as unit_status,
             ag.name as agent_name,
             g.display_name as guest_name, g.phone as guest_phone,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      LEFT JOIN guests g ON g.id = r.guest_id
      WHERE r.check_out_date = ?
        AND r.status = 'CHECKED_IN'
    `;
    const params = [date];

    if (['MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'].includes(user?.role) && user.propertyId) {
      sql += ' AND r.property_id = ?';
      params.push(user.propertyId);
    }
    if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }

    sql += ' ORDER BY a.unit_number ASC;';
    return pool.query(sql, params);
  }

  /**
   * Get current in-house guests (strictly status = CHECKED_IN)
   */
  static async getCurrentGuests({ propertyId, user } = {}) {
    let sql = `
      SELECT r.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, a.unit_type, a.status as unit_status,
             ag.name as agent_name,
             g.display_name as guest_name, g.phone as guest_phone, g.email as guest_email,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      LEFT JOIN guests g ON g.id = r.guest_id
      WHERE r.status = 'CHECKED_IN'
    `;
    const params = [];

    if (['MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'].includes(user?.role) && user.propertyId) {
      sql += ' AND r.property_id = ?';
      params.push(user.propertyId);
    }
    if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }

    sql += ' ORDER BY r.checked_in_at DESC;';
    return pool.query(sql, params);
  }

  /**
   * Get operational statistics
   */
  static async getOperationalStats({ propertyId, date, user } = {}) {
    let propFilter = '';
    let propParams = [];
    if (['MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'].includes(user?.role) && user.propertyId) {
      propFilter = 'AND property_id = ?';
      propParams = [user.propertyId];
    } else if (propertyId && propertyId !== 'all') {
      propFilter = 'AND property_id = ?';
      propParams = [propertyId];
    }

    // 1. Today's arrivals count
    const [arr] = await pool.query(
      `SELECT COUNT(*) as count FROM reservations 
       WHERE check_in_date = ? AND status IN ('CONFIRMED', 'PENDING') ${propFilter}`,
      [date, ...propParams]
    );

    // 2. Today's departures count
    const [dep] = await pool.query(
      `SELECT COUNT(*) as count FROM reservations 
       WHERE check_out_date = ? AND status = 'CHECKED_IN' ${propFilter}`,
      [date, ...propParams]
    );

    // 3. Current in-house guests count
    const [inHouse] = await pool.query(
      `SELECT COUNT(*) as count FROM reservations 
       WHERE status = 'CHECKED_IN' ${propFilter}`,
      propParams
    );

    // 4. Units operational counts
    const [units] = await pool.query(
      `SELECT 
         COUNT(*) as total_units,
         SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_units,
         SUM(CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END) as occupied_units,
         SUM(CASE WHEN status = 'DIRTY' THEN 1 ELSE 0 END) as dirty_units,
         SUM(CASE WHEN status = 'CLEANING' THEN 1 ELSE 0 END) as cleaning_units,
         SUM(CASE WHEN status = 'MAINTENANCE' THEN 1 ELSE 0 END) as maintenance_units
       FROM apartments 
       WHERE is_active = 1 ${propFilter}`,
      propParams
    );

    return {
      date,
      todaysArrivals: arr?.count || 0,
      todaysDepartures: dep?.count || 0,
      inHouseGuests: inHouse?.count || 0,
      totalUnits: units?.total_units || 0,
      availableUnits: units?.available_units || 0,
      occupiedUnits: units?.occupied_units || 0,
      dirtyUnits: units?.dirty_units || 0,
      cleaningUnits: units?.cleaning_units || 0,
      maintenanceUnits: units?.maintenance_units || 0,
    };
  }
}

module.exports = FrontOfficeRepository;
