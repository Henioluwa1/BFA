const pool = require('../../db/pool');

class SearchService {
  /**
   * Execute authorized multi-entity categorized search
   */
  static async search({ query, propertyId = null, type = null, userRole = 'ADMIN', agentId = null, limit = 10 }) {
    if (!query || query.trim().length === 0) {
      return {
        query: '',
        totalResults: 0,
        categories: {
          properties: [],
          apartments: [],
          reservations: [],
          maintenance: [],
          agents: [],
        },
      };
    }

    const cleanQuery = `%${query.trim()}%`;
    const searchLimit = Math.min(parseInt(limit, 10) || 10, 50);

    const categories = {
      properties: [],
      apartments: [],
      reservations: [],
      maintenance: [],
      agents: [],
      guests: [],
      inspections: [],
    };

    // 1. Properties Search (Hidden from Agent role if restricted, visible to all operational staff)
    if (!type || type === 'properties') {
      let propSql = `
        SELECT id, name, code, address, city, status, 'property' as entity_type
        FROM properties
        WHERE (name LIKE ? OR code LIKE ? OR address LIKE ?)
      `;
      const propParams = [cleanQuery, cleanQuery, cleanQuery];
      if (propertyId && propertyId !== 'all') {
        propSql += ' AND id = ?';
        propParams.push(propertyId);
      }
      propSql += ' LIMIT ?';
      propParams.push(searchLimit);

      categories.properties = await pool.query(propSql, propParams);
    }

    // 2. Apartments / Units Search
    if (!type || type === 'apartments') {
      let aptSql = `
        SELECT a.id, a.unit_number, a.unit_name, a.unit_type, a.status, a.rate_per_night,
               p.name as property_name, p.code as property_code, 'apartment' as entity_type
        FROM apartments a
        JOIN properties p ON p.id = a.property_id
        WHERE (a.unit_number LIKE ? OR a.unit_name LIKE ?)
      `;
      const aptParams = [cleanQuery, cleanQuery];
      if (propertyId && propertyId !== 'all') {
        aptSql += ' AND a.property_id = ?';
        aptParams.push(propertyId);
      }
      aptSql += ' LIMIT ?';
      aptParams.push(searchLimit);

      categories.apartments = await pool.query(aptSql, aptParams);
    }

    // 3. Reservations Search (Strict Agent isolation enforced)
    if (!type || type === 'reservations') {
      let resSql = `
        SELECT r.id, r.reservation_code, r.tenant_name, r.tenant_email, r.tenant_phone,
               r.check_in_date, r.check_out_date, r.nights, r.total_amount, r.status,
               p.name as property_name, a.unit_number, 'reservation' as entity_type
        FROM reservations r
        JOIN properties p ON p.id = r.property_id
        JOIN apartments a ON a.id = r.apartment_id
        WHERE (r.reservation_code LIKE ? OR r.tenant_name LIKE ? OR r.tenant_email LIKE ? OR r.tenant_phone LIKE ?)
      `;
      const resParams = [cleanQuery, cleanQuery, cleanQuery, cleanQuery];

      // Agent isolation: Agent can only search their own reservations
      if (userRole === 'AGENT') {
        resSql += ' AND r.agent_id = ?';
        resParams.push(agentId || 1);
      }

      if (propertyId && propertyId !== 'all') {
        resSql += ' AND r.property_id = ?';
        resParams.push(propertyId);
      }
      resSql += ' LIMIT ?';
      resParams.push(searchLimit);

      categories.reservations = await pool.query(resSql, resParams);
    }

    // 4. Maintenance Search (Hidden from Agent role)
    if ((!type || type === 'maintenance') && userRole !== 'AGENT') {
      let mntSql = `
        SELECT m.id, m.issue_code, m.issue_title, m.description, m.priority, m.status,
               p.name as property_name, a.unit_number, 'maintenance' as entity_type
        FROM maintenance_requests m
        JOIN properties p ON p.id = m.property_id
        JOIN apartments a ON a.id = m.apartment_id
        WHERE (m.issue_code LIKE ? OR m.issue_title LIKE ? OR m.description LIKE ?)
      `;
      const mntParams = [cleanQuery, cleanQuery, cleanQuery];
      if (propertyId && propertyId !== 'all') {
        mntSql += ' AND m.property_id = ?';
        mntParams.push(propertyId);
      }
      mntSql += ' LIMIT ?';
      mntParams.push(searchLimit);

      categories.maintenance = await pool.query(mntSql, mntParams);
    }

    // 5. Agents Search (Only visible to Admin, Manager, Owner)
    if ((!type || type === 'agents') && ['ADMIN', 'MANAGER', 'OWNER'].includes(userRole)) {
      const agtSql = `
        SELECT id, name, email, phone, commission_rate, status, 'agent' as entity_type
        FROM agents
        WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?)
        LIMIT ?;
      `;
      categories.agents = await pool.query(agtSql, [cleanQuery, cleanQuery, cleanQuery, searchLimit]);
    }

    // 6. Guests Search
    if (!type || type === 'guests') {
      let guestSql = `
        SELECT id, display_name, email, phone, status, 'guest' as entity_type
        FROM guests
        WHERE (display_name LIKE ? OR email LIKE ? OR phone LIKE ?)
        LIMIT ?;
      `;
      categories.guests = await pool.query(guestSql, [cleanQuery, cleanQuery, cleanQuery, searchLimit]);
    }

    // 7. Inspections Search
    if (!type || type === 'inspections') {
      let inspSql = `
        SELECT i.id, i.inspection_code, i.inspection_type, i.condition_rating, i.status,
               p.name as property_name, a.unit_number, 'inspection' as entity_type
        FROM inspections i
        JOIN properties p ON p.id = i.property_id
        JOIN apartments a ON a.id = i.apartment_id
        WHERE (i.inspection_code LIKE ? OR a.unit_number LIKE ? OR p.name LIKE ?)
      `;
      const inspParams = [cleanQuery, cleanQuery, cleanQuery];
      if (propertyId && propertyId !== 'all') {
        inspSql += ' AND i.property_id = ?';
        inspParams.push(propertyId);
      }
      inspSql += ' LIMIT ?';
      inspParams.push(searchLimit);
      categories.inspections = await pool.query(inspSql, inspParams);
    }

    const totalResults =
      categories.properties.length +
      categories.apartments.length +
      categories.reservations.length +
      categories.maintenance.length +
      categories.agents.length +
      (categories.guests ? categories.guests.length : 0) +
      (categories.inspections ? categories.inspections.length : 0);

    return {
      query: query.trim(),
      totalResults,
      categories,
    };
  }
}

module.exports = SearchService;
