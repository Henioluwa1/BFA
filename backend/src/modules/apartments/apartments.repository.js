const pool = require('../../db/pool');

class ApartmentsRepository {
  static async findAll({ propertyId, status } = {}) {
    let sql = `
      SELECT a.*, p.name as property_name, p.code as property_code
      FROM apartments a
      JOIN properties p ON p.id = a.property_id
      WHERE 1=1
    `;
    const params = [];

    if (propertyId && propertyId !== 'all') {
      sql += ' AND a.property_id = ?';
      params.push(propertyId);
    }
    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY a.property_id ASC, a.unit_number ASC;';
    return pool.query(sql, params);
  }

  static async findById(id) {
    const sql = `
      SELECT a.*, p.name as property_name, p.code as property_code
      FROM apartments a
      JOIN properties p ON p.id = a.property_id
      WHERE a.id = ?;
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }
}

module.exports = ApartmentsRepository;
