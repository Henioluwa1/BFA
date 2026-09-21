const pool = require('../../db/pool');

class ReservationsRepository {
  static async findAll({ propertyId, status, agentId } = {}) {
    let sql = `
      SELECT r.*, p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, ag.name as agent_name
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      WHERE 1=1
    `;
    const params = [];

    if (propertyId && propertyId !== 'all') {
      sql += ' AND r.property_id = ?';
      params.push(propertyId);
    }
    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }
    if (agentId) {
      sql += ' AND r.agent_id = ?';
      params.push(agentId);
    }

    sql += ' ORDER BY r.check_in_date DESC;';
    return pool.query(sql, params);
  }

  static async findById(id) {
    const sql = `
      SELECT r.*, p.name as property_name, p.code as property_code,
             a.unit_number, a.unit_name, ag.name as agent_name
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      JOIN apartments a ON a.id = r.apartment_id
      LEFT JOIN agents ag ON ag.id = r.agent_id
      WHERE r.id = ?;
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  static async checkAvailability(apartmentId, checkInDate) {
    const sql = `
      SELECT id, reservation_code, status 
      FROM reservations 
      WHERE apartment_id = ? 
        AND check_in_date = ? 
        AND status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING');
    `;
    const rows = await pool.query(sql, [apartmentId, checkInDate]);
    return rows.length === 0;
  }

  static async create(reservationData) {
    const sql = `
      INSERT INTO reservations (
        reservation_code, property_id, apartment_id, tenant_name, 
        tenant_email, tenant_phone, agent_id, check_in_date, 
        check_out_date, nights, total_amount, paid_amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      reservationData.reservation_code,
      reservationData.property_id,
      reservationData.apartment_id,
      reservationData.tenant_name,
      reservationData.tenant_email,
      reservationData.tenant_phone,
      reservationData.agent_id || null,
      reservationData.check_in_date,
      reservationData.check_out_date,
      reservationData.nights,
      reservationData.total_amount,
      reservationData.paid_amount || 0.00,
      reservationData.status || 'CONFIRMED',
    ];

    const result = await pool.query(sql, params);
    return result.insertId;
  }
}

module.exports = ReservationsRepository;
