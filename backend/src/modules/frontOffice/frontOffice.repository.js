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
             u_staff.name as assigned_staff_name, u_staff.email as assigned_staff_email,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      LEFT JOIN guests g ON g.id = r.guest_id
      LEFT JOIN users u_staff ON u_staff.id = r.assigned_staff_id
      WHERE r.check_in_date = ?
        AND r.status IN ('CONFIRMED', 'PENDING', 'PENDING_APPROVAL')
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
             u_staff.name as assigned_staff_name, u_staff.email as assigned_staff_email,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      LEFT JOIN guests g ON g.id = r.guest_id
      LEFT JOIN users u_staff ON u_staff.id = r.assigned_staff_id
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
   * Get current in-house guests
   */
  static async getCurrentGuests({ propertyId, user } = {}) {
    let sql = `
      SELECT r.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, a.unit_type, a.status as unit_status,
             ag.name as agent_name,
             g.display_name as guest_name, g.phone as guest_phone,
             u_staff.name as assigned_staff_name, u_staff.email as assigned_staff_email,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      LEFT JOIN guests g ON g.id = r.guest_id
      LEFT JOIN users u_staff ON u_staff.id = r.assigned_staff_id
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
   * Get pending / incoming bookings awaiting front-desk approval & assignment
   */
  static async getPendingBookings({ propertyId, user } = {}) {
    let sql = `
      SELECT r.*,
             p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, a.unit_type, a.status as unit_status, a.rate_per_night,
             u_staff.name as assigned_staff_name, u_staff.email as assigned_staff_email,
             u_accepted.name as accepted_by_user_name,
             GREATEST(0, r.total_amount - r.paid_amount) as outstanding_balance
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN users u_staff ON u_staff.id = r.assigned_staff_id
      LEFT JOIN users u_accepted ON u_accepted.id = r.accepted_by_user_id
      WHERE r.status NOT IN ('CANCELLED', 'CHECKED_OUT', 'NO_SHOW')
    `;
    const params = [];

    if (['MANAGER', 'RECEPTIONIST', 'STAFF'].includes(user?.role) && user.propertyId) {
      sql += ' AND r.property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }

    sql += ' ORDER BY r.created_at DESC LIMIT 50;';
    return pool.query(sql, params);
  }

  /**
   * Get live operational activity feed for Managers & Admins
   */
  static async getLiveOperationalFeed({ propertyId, user, limit = 25 } = {}) {
    let sql = `
      SELECT ea.id, ea.activity_type, ea.description, ea.created_at, ea.metadata,
             e.employee_code, e.department,
             u.id as user_id, u.name as staff_name, u.role as staff_role,
             p.name as property_name
      FROM employee_activities ea
      JOIN employees e ON e.id = ea.employee_id
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN properties p ON p.id = ea.property_id
      WHERE ea.activity_type IN ('CLIENT_ACCEPTED', 'GUEST_CHECKED_IN', 'GUEST_CHECKED_OUT', 'RESERVATION_CREATED')
    `;
    const params = [];

    if (['MANAGER'].includes(user?.role) && user.propertyId) {
      sql += ' AND ea.property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND ea.property_id = ?';
      params.push(propertyId);
    }

    sql += ' ORDER BY ea.created_at DESC LIMIT ?;';
    params.push(Math.min(100, Math.max(1, parseInt(limit, 10) || 25)));

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
       WHERE check_in_date = ? AND status IN ('CONFIRMED', 'PENDING', 'PENDING_APPROVAL') ${propFilter}`,
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

    // 4. Pending unassigned bookings
    const [unassigned] = await pool.query(
      `SELECT COUNT(*) as count FROM reservations 
       WHERE assigned_staff_id IS NULL AND status IN ('PENDING', 'PENDING_APPROVAL', 'CONFIRMED') ${propFilter}`,
      propParams
    );

    // 5. Units operational counts
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
      pendingUnassigned: unassigned?.count || 0,
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
