/**
 * Auth Context Middleware
 * Extracts authenticated user role, permissions, and identity from headers or token
 */
function authContext(req, res, next) {
  const roleHeader = req.headers['x-user-role'];
  const agentIdHeader = req.headers['x-agent-id'];

  // Default to Admin in development unless specified otherwise
  const role = roleHeader ? roleHeader.toUpperCase() : 'ADMIN';
  const agentId = agentIdHeader ? parseInt(agentIdHeader, 10) : (role === 'AGENT' ? 1 : null);

  req.user = {
    id: role === 'AGENT' ? 101 : 1,
    email: role === 'AGENT' ? 'agent@bfa.com' : 'admin@bfa.com',
    role,
    agentId,
  };

  next();
}

/**
 * Role authorization guard
 * @param  {...string} allowedRoles
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.role || 'GUEST';
    if (!allowedRoles.map((r) => r.toUpperCase()).includes(userRole.toUpperCase())) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Role '${userRole}' is not authorized to perform this action.`,
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
  requireRoles,
};
