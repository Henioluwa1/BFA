const pool = require('../../db/pool');

class PropertiesRepository {
  static async findAll() {
    const sql = `
      SELECT p.*, COUNT(a.id) as unit_count
      FROM properties p
      LEFT JOIN apartments a ON a.property_id = p.id
      GROUP BY p.id
      ORDER BY p.id ASC;
    `;
    return pool.query(sql);
  }

  static async findById(id) {
    const sql = `
      SELECT p.*, COUNT(a.id) as unit_count
      FROM properties p
      LEFT JOIN apartments a ON a.property_id = p.id
      WHERE p.id = ?
      GROUP BY p.id;
    `;
    const rows = await pool.query(sql, [id]);
    return rows[0] || null;
  }
}

module.exports = PropertiesRepository;
