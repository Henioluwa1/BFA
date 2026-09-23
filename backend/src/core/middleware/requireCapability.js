const AccessControlService = require('../access/accessControl.service');

/**
 * Middleware that guards an endpoint based on dynamic capability policy
 * @param {string} capabilityName
 */
function requireCapability(capabilityName) {
  return async (req, res, next) => {
    try {
      const result = await AccessControlService.canAccess(req.user, capabilityName);
      if (!result.allowed) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'CAPABILITY_RESTRICTED',
            message: result.reason || `Access denied: Capability '${capabilityName}' is currently restricted.`,
            capability: capabilityName,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.id,
          },
        });
      }
      req.capability = result.capability;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireCapability;
