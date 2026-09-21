const jwt = require('jsonwebtoken');
const config = require('../../config');
const logger = require('../logging/logger');

/**
 * Auth Context Middleware
 * Authenticates user cryptographically via Bearer token.
 * Strictly IGNORES any client-submitted X-User-Role header as a security boundary.
 */
function authContext(req, res, next) {
  const authHeader = req.headers.authorization;
  req.user = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    try {
      const decoded = jwt.verify(token, config.security.jwtSecret);
      req.user = {
        id: decoded.id,
        name: decoded.name,
        email: decoded.email,
        role: decoded.role ? decoded.role.toUpperCase() : 'STAFF',
        propertyId: decoded.propertyId || null,
        agentId: decoded.agentId || null,
      };
    } catch (err) {
      // Invalid / expired token
      logger.warn(`Invalid or expired token received: ${err.message}`, {
        requestId: req.id,
        ip: req.ip,
      });
      req.user = null;
    }
  }

  next();
}

/**
 * Authentication Guard Middleware
 * Rejects unauthenticated requests with HTTP 401
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication is required to access this resource.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    });
  }
  next();
}

/**
 * Role Authorization Guard Middleware
 * Rejects unauthorized roles with HTTP 403.
 * SUPER_ADMIN is granted system-level access to all admin-level routes.
 * @param {...string} allowedRoles
 */
function requireRoles(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required to perform this action.',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    }

    const userRole = (req.user.role || 'GUEST').toUpperCase();
    const isAuthorized =
      userRole === 'SUPER_ADMIN' || normalizedAllowed.includes(userRole);

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Role '${userRole}' is not authorized to access this resource.`,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    }

    next();
  };
}

module.exports = {
  authContext,
  requireAuth,
  requireRoles,
};
