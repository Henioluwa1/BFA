const pool = require('../../db/pool');

/**
 * IdentityResolverService
 * 
 * Provides safe, verified resolution between application users (users table)
 * and workforce staff members (employees table).
 * 
 * Binding Policy: DEC-2.5B-01 (Option A)
 * - Never assumes users.id === employees.id
 * - Corporate email acts solely as an identity candidate signal
 * - Never fabricates employment records or automatically links identities
 */
class IdentityResolverService {
  /**
   * Resolve employee record linked to a given user ID or user object
   * @param {number|object} userOrId
   * @returns {Promise<object|null>}
   */
  static async resolveEmployeeFromUser(userOrId) {
    const userId = typeof userOrId === 'object' && userOrId !== null ? userOrId.id : parseInt(userOrId, 10);
    if (!userId || isNaN(userId)) return null;

    const rows = await pool.query(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.full_name, e.email,
              e.phone, e.department, e.job_title, e.employment_type, e.employment_status,
              e.property_id, e.user_id, p.name AS property_name
       FROM employees e
       LEFT JOIN properties p ON p.id = e.property_id
       WHERE e.user_id = ?
       LIMIT 1`,
      [userId]
    );

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Resolve user record linked to a given employee ID or employee object
   * @param {number|object} employeeOrId
   * @returns {Promise<object|null>}
   */
  static async resolveUserFromEmployee(employeeOrId) {
    const employeeId = typeof employeeOrId === 'object' && employeeOrId !== null ? employeeOrId.id : parseInt(employeeOrId, 10);
    if (!employeeId || isNaN(employeeId)) return null;

    const rows = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.property_id
       FROM users u
       JOIN employees e ON e.user_id = u.id
       WHERE e.id = ?
       LIMIT 1`,
      [employeeId]
    );

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Identify unlinked candidates matching by corporate email
   * (Candidate discovery only - does NOT establish identity or link)
   * @param {string} email
   * @returns {Promise<object>}
   */
  static async findEmailCandidates(email) {
    if (!email || !email.trim()) {
      return { matchingUsers: [], matchingEmployees: [] };
    }
    const cleanEmail = email.trim().toLowerCase();

    const users = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.property_id
       FROM users u
       WHERE LOWER(u.email) = ? AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)`,
      [cleanEmail]
    );

    const employees = await pool.query(
      `SELECT e.id, e.employee_code, e.full_name, e.email, e.department, e.job_title, e.employment_status
       FROM employees e
       WHERE LOWER(e.email) = ? AND e.user_id IS NULL`,
      [cleanEmail]
    );

    return {
      matchingUsers: users,
      matchingEmployees: employees,
    };
  }
}

module.exports = IdentityResolverService;

