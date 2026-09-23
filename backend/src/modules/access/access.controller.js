const AccessControlService = require('../../core/access/accessControl.service');
const ApiResponse = require('../../utils/apiResponse');

class AccessController {
  static async getCapabilities(req, res, next) {
    try {
      const data = await AccessControlService.listCapabilities();
      return ApiResponse.success(res, {
        message: 'System capabilities retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateCapability(req, res, next) {
    try {
      const { capabilityName, isEnabled, reason } = req.body;
      const result = await AccessControlService.updateCapability({
        capabilityName,
        isEnabled,
        user: req.user,
        reason,
        req,
      });
      return ApiResponse.success(res, {
        statusCode: result.statusCode || 200,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async requestOverride(req, res, next) {
    try {
      const { capabilityName, reason } = req.body;
      const result = await AccessControlService.requestOverride({
        capabilityName,
        user: req.user,
        reason,
        req,
      });
      return ApiResponse.success(res, {
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getApprovalRequests(req, res, next) {
    try {
      const { status } = req.query;
      const data = await AccessControlService.listApprovalRequests({ status });
      return ApiResponse.success(res, {
        message: 'Approval requests retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reviewApproval(req, res, next) {
    try {
      const { requestId } = req.params;
      const { approved, action, reviewNotes } = req.body;
      const isApproved = approved !== undefined ? Boolean(approved) : action === 'APPROVE';
      const result = await AccessControlService.reviewApprovalRequest({
        requestId: parseInt(requestId, 10),
        approved: isApproved,
        user: req.user,
        reviewNotes,
        req,
      });
      return ApiResponse.success(res, {
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async forceOverride(req, res, next) {
    try {
      const { capabilityName, confirmation, reason, justification } = req.body;
      const result = await AccessControlService.forceSuperAdminOverride({
        capabilityName,
        confirmation,
        reason: reason || justification,
        user: req.user,
        req,
      });
      return ApiResponse.success(res, {
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getOverrides(req, res, next) {
    try {
      const data = await pool.query(`
        SELECT o.*, c.name as capability_name, u.name as applied_by_name, u.email as applied_by_email 
        FROM access_overrides o 
        JOIN capabilities c ON o.capability_id = c.id 
        JOIN users u ON o.applied_by_id = u.id 
        ORDER BY o.id DESC
      `);
      return ApiResponse.success(res, {
        message: 'Access overrides retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async checkCapability(req, res, next) {
    try {
      const { capabilityName } = req.params;
      const result = await AccessControlService.canAccess(req.user, capabilityName);
      return ApiResponse.success(res, {
        message: `Capability status for '${capabilityName}'`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AccessController;
