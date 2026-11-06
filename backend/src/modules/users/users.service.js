const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');
const auditService = require('../../core/audit/audit.service');
const { ValidationError, ForbiddenError, NotFoundError, ConflictError } = require('../../core/errors/apiError');
const { getRolePermissions } = require('../auth/auth.service');

const SYSTEM_ROLES = [
  {
    role: 'SUPER_ADMIN',
    name: 'Super Admin',
    desc: 'Technical platform administrator. System diagnostics, technical configuration, and security control.',
    color: 'danger',
  },
  {
    role: 'OWNER',
    name: 'Property Owner (Sovereign)',
    desc: 'Executive business oversight, portfolio performance, financial statements, and dual-review publication approvals.',
    color: 'success',
  },
  {
    role: 'ADMIN',
    name: 'System Admin',
    desc: 'Full operational administration. Manages staff accounts, property rates, dual-review approvals, and operational records.',
    color: 'primary',
  },
  {
    role: 'OPERATIONS_MANAGER',
    name: 'Operations Manager',
    desc: 'Property-level operational supervision. Manages assigned apartments, staff, workforce rosters, attendance, leave approvals, readiness, and property content submissions.',
    color: 'info',
  },
  {
    role: 'RECEPTIONIST',
    name: 'Reception / Front Desk',
    desc: 'Guest arrivals, departures, check-in/out, front desk claim desk, and payment receipt recording.',
    color: 'neutral',
  },
  {
    role: 'STAFF',
    name: 'Operations & Staff',
    desc: 'Housekeeping status updates, unit inspections, maintenance ticket execution, and turnaround operations.',
    color: 'warning',
  },
  {
    role: 'AGENT',
    name: 'Third-Party Booking Agent',
    desc: 'External booking partner. Restricted strictly to self-attributable reservations and commission payouts.',
    color: 'neutral',
  },
];

class UsersService {
  /**
   * List users with property filtering and permission scoping
   */
  static async listUsers(query = {}, caller = null) {
    let sql = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.property_id, 
        u.agent_id, 
        u.status, 
        u.last_login_at, 
        u.created_at,
        p.name AS property_name,
        p.code AS property_code
      FROM users u
      LEFT JOIN properties p ON u.property_id = p.id
      WHERE 1=1
    `;
    const params = [];

    // Property isolation: if caller is property-scoped and not super-admin/owner/admin
    if (caller && caller.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((caller.role || '').toUpperCase())) {
      sql += ' AND (u.property_id = ? OR u.property_id IS NULL)';
      params.push(caller.propertyId);
    } else if (query.propertyId && query.propertyId !== 'all') {
      sql += ' AND u.property_id = ?';
      params.push(query.propertyId);
    }

    if (query.role && query.role !== 'ALL') {
      sql += ' AND u.role = ?';
      params.push(query.role.toUpperCase());
    }

    if (query.status && query.status !== 'ALL') {
      sql += ' AND u.status = ?';
      params.push(query.status.toUpperCase());
    }

    if (query.search && query.search.trim()) {
      const q = `%${query.search.trim()}%`;
      sql += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      params.push(q, q);
    }

    sql += ' ORDER BY u.id ASC';

    const users = await pool.query(sql, params);
    return users.map(u => ({
      ...u,
      permissions: getRolePermissions(u.role),
    }));
  }

  /**
   * Get single user by ID
   */
  static async getUserById(id) {
    const rows = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.property_id, u.status, u.created_at, p.name as property_name
       FROM users u
       LEFT JOIN properties p ON u.property_id = p.id
       WHERE u.id = ? LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundError(`User #${id} not found.`);
    }
    const user = rows[0];
    return {
      ...user,
      permissions: getRolePermissions(user.role),
    };
  }

  /**
   * Create new user with RBAC rules and single-owner constraint
   */
  static async createUser(data, caller = null, req = null) {
    const { name, email, password, role = 'STAFF', property_id = null, status = 'ACTIVE' } = data;

    if (!name || !name.trim()) {
      throw new ValidationError('Full name is required.');
    }
    if (!email || !email.trim()) {
      throw new ValidationError('Email address is required.');
    }
    if (!password || password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters long.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const rawRole = role.toUpperCase();
    const cleanRole = rawRole === 'MANAGER' ? 'OPERATIONS_MANAGER' : rawRole;

    // Check email uniqueness
    const existing = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
    if (existing.length > 0) {
      throw new ConflictError(`User with email '${cleanEmail}' already exists.`);
    }

    // Single-Owner Governance Rule: Only ONE Owner allowed in the entire system
    if (cleanRole === 'OWNER') {
      const ownerRows = await pool.query("SELECT id, name FROM users WHERE role = 'OWNER' LIMIT 1");
      if (ownerRows.length > 0) {
        throw new ConflictError(`Single-Owner Rule Violation: Owner account already assigned to ${ownerRows[0].name} (#${ownerRows[0].id}).`);
      }
    }

    // Role elevation safety: Only SUPER_ADMIN can create another SUPER_ADMIN, ADMIN, or OWNER
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(cleanRole) && caller && caller.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only Super Admin is authorized to grant administrative or owner authority.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, property_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), cleanEmail, passwordHash, cleanRole, property_id || null, status]
    );

    const created = await this.getUserById(result.insertId);

    // Audit log
    await auditService.log({
      actorId: caller?.id || null,
      actorEmail: caller?.email || 'system',
      actorRole: caller?.role || 'ADMIN',
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: String(created.id),
      newValues: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        property_id: created.property_id,
        status: created.status,
      },
      requestId: req?.id,
      ipAddress: req?.ip,
      userAgent: req?.get ? req.get('user-agent') : null,
    });

    return created;
  }

  /**
   * Update existing user
   */
  static async updateUser(id, data, caller = null, req = null) {
    const existing = await this.getUserById(id);

    // Non-negotiable Admin protection: Admin account cannot be deactivated or downgraded by Manager or Owner
    if (existing.role === 'ADMIN' || existing.role === 'SUPER_ADMIN' || existing.role === 'OWNER') {
      if (caller && !['SUPER_ADMIN'].includes(caller.role) && caller.id !== existing.id) {
        throw new ForbiddenError('Administrative and Owner accounts can only be managed by Super Admin.');
      }
      if (data.status && data.status !== 'ACTIVE' && existing.id === 1) {
        throw new ForbiddenError('Primary Super Admin account cannot be deactivated.');
      }
    }

    let cleanRole = data.role ? data.role.toUpperCase() : existing.role;
    if (cleanRole === 'MANAGER') cleanRole = 'OPERATIONS_MANAGER';

    // Self-elevation / self-role change protection
    if (caller && parseInt(caller.id, 10) === parseInt(id, 10) && data.role && cleanRole !== existing.role) {
      throw new ForbiddenError('Users are not permitted to change their own role.');
    }

    // Role elevation safety: Only SUPER_ADMIN can grant administrative or owner roles
    if (data.role && cleanRole !== existing.role) {
      if (['SUPER_ADMIN', 'ADMIN'].includes(cleanRole) && caller && caller.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Only Super Admin is authorized to grant administrative authority.');
      }
      if (cleanRole === 'OWNER' && caller && caller.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Only Super Admin is authorized to appoint an Owner account.');
      }
    }

    // Single-Owner Governance Rule check if role is changing to OWNER
    if (cleanRole === 'OWNER' && existing.role !== 'OWNER') {
      const ownerRows = await pool.query("SELECT id, name FROM users WHERE role = 'OWNER' AND id != ? LIMIT 1", [id]);
      if (ownerRows.length > 0) {
        throw new ConflictError(`Single-Owner Rule Violation: Another Owner (${ownerRows[0].name}) is already assigned.`);
      }
    }

    const updates = [];
    const params = [];

    if (data.name && data.name.trim()) {
      updates.push('name = ?');
      params.push(data.name.trim());
    }

    if (data.email && data.email.trim()) {
      const cleanEmail = data.email.trim().toLowerCase();
      if (cleanEmail !== existing.email) {
        const dup = await pool.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [cleanEmail, id]);
        if (dup.length > 0) {
          throw new ConflictError(`Email '${cleanEmail}' is already in use.`);
        }
        updates.push('email = ?');
        params.push(cleanEmail);
      }
    }

    if (data.role) {
      updates.push('role = ?');
      params.push(cleanRole);
    }

    if (data.property_id !== undefined) {
      updates.push('property_id = ?');
      params.push(data.property_id ? parseInt(data.property_id, 10) : null);
    }

    if (data.status) {
      updates.push('status = ?');
      params.push(data.status.toUpperCase());
    }

    if (data.password && data.password.length >= 6) {
      const passwordHash = await bcrypt.hash(data.password, 10);
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }

    if (updates.length > 0) {
      params.push(id);
      await pool.query(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
    }

    const updated = await this.getUserById(id);

    // Audit log
    await auditService.log({
      actorId: caller?.id || null,
      actorEmail: caller?.email || 'system',
      actorRole: caller?.role || 'ADMIN',
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: String(id),
      oldValues: { role: existing.role, status: existing.status, property_id: existing.property_id },
      newValues: { role: updated.role, status: updated.status, property_id: updated.property_id },
      requestId: req?.id,
      ipAddress: req?.ip,
      userAgent: req?.get ? req.get('user-agent') : null,
    });

    return updated;
  }

  /**
   * Return roles and their capabilities
   */
  static getRoles() {
    return SYSTEM_ROLES.map((r) => ({
      ...r,
      capabilities: getRolePermissions(r.role),
    }));
  }
}

module.exports = UsersService;
