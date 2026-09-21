const authService = require('./auth.service');
const auditService = require('../../core/audit/audit.service');

async function handleLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = req.id;

    const result = await authService.login({
      email,
      password,
      ipAddress,
      userAgent,
      requestId,
    });

    res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function handleGetMe(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token required.',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Current authenticated session.',
      data: {
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          propertyId: req.user.propertyId,
          agentId: req.user.agentId,
          permissions: authService.getRolePermissions(req.user.role),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function handleLogout(req, res, next) {
  try {
    if (req.user) {
      await auditService.log({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'USER_LOGOUT',
        entityType: 'user',
        entityId: String(req.user.id),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
      data: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleLogin,
  handleGetMe,
  handleLogout,
};
