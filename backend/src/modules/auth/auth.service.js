const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../db/pool');
const config = require('../../config');
const { UnauthorizedError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'properties:read', 'properties:write',
    'apartments:read', 'apartments:write',
    'reservations:read', 'reservations:write',
    'reports:read', 'reports:export',
    'audit:read',
    'team:read', 'team:write',
    'settings:read', 'settings:write',
    'financial:read',
  ],
  MANAGER: [
    'properties:read',
    'apartments:read', 'apartments:write',
    'reservations:read', 'reservations:write',
    'maintenance:read', 'maintenance:write',
    'reports:read', 'reports:export',
    'financial:read',
  ],
  RECEPTIONIST: [
    'apartments:read',
    'reservations:read', 'reservations:write',
    'calendar:read',
    'check_in_out:write',
  ],
  STAFF: [
    'apartments:read', 'apartments:status_update',
    'maintenance:read', 'maintenance:write',
    'inspections:read', 'inspections:write',
  ],
  AGENT: [
    'agent_reservations:read', 'agent_reservations:write',
    'commissions:read',
  ],
  OWNER: [
    'properties:read',
    'apartments:read',
    'financial:read',
    'analytics:read',
    'reports:read', 'reports:export',
    'audit:read',
  ],
};

function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role?.toUpperCase()] || [];
}

async function login({ email, password, ipAddress, userAgent, requestId }) {
  if (!email || !password) {
    throw new UnauthorizedError('Email and password are required.');
  }

  const rows = await db.query(
    'SELECT id, name, email, password_hash, role, property_id, agent_id, status FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase().trim()]
  );

  if (!rows || rows.length === 0) {
    await auditService.log({
      actorEmail: email ? email.toLowerCase().trim() : 'unknown',
      actorRole: 'ANONYMOUS',
      action: 'USER_LOGIN_FAILED',
      entityType: 'user',
      entityId: null,
      newValues: { reason: 'User not found', attemptedAt: new Date().toISOString() },
      requestId,
      ipAddress,
      userAgent,
    });
    throw new UnauthorizedError('Invalid credentials.');
  }

  const user = rows[0];

  if (user.status !== 'ACTIVE') {
    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'USER_LOGIN_FAILED',
      entityType: 'user',
      entityId: String(user.id),
      newValues: { reason: `Account is ${user.status}`, attemptedAt: new Date().toISOString() },
      requestId,
      ipAddress,
      userAgent,
    });
    throw new UnauthorizedError(`Account is ${user.status.toLowerCase()}. Please contact an administrator.`);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'USER_LOGIN_FAILED',
      entityType: 'user',
      entityId: String(user.id),
      newValues: { reason: 'Incorrect password', attemptedAt: new Date().toISOString() },
      requestId,
      ipAddress,
      userAgent,
    });
    throw new UnauthorizedError('Invalid credentials.');
  }

  // Update last login timestamp asynchronously
  db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]).catch(() => {});

  const tokenPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    propertyId: user.property_id,
    agentId: user.agent_id,
  };

  const token = jwt.sign(tokenPayload, config.security.jwtSecret, {
    expiresIn: config.security.jwtExpiresIn,
  });

  // Correlate login with immutable audit trail
  await auditService.log({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'USER_LOGIN',
    entityType: 'user',
    entityId: String(user.id),
    newValues: { loginTime: new Date().toISOString() },
    requestId,
    ipAddress,
    userAgent,
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      propertyId: user.property_id,
      agentId: user.agent_id,
      permissions: getRolePermissions(user.role),
    },
  };
}

function verifyToken(token) {
  return jwt.verify(token, config.security.jwtSecret);
}

module.exports = {
  login,
  verifyToken,
  getRolePermissions,
  ROLE_PERMISSIONS,
};
