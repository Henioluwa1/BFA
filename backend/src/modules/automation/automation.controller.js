const AutomationGateway = require('./automationGateway');
const AssistantService = require('./assistant/assistant.service');

class AutomationController {
  /**
   * GET /api/v1/automation/actions
   * List actions visible and authorized for the authenticated user
   */
  static async listActions(req, res, next) {
    try {
      const actions = AutomationGateway.listActions({ user: req.user });
      res.status(200).json({
        success: true,
        data: actions,
        meta: {
          total: actions.length,
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/automation/execute
   * Propose or directly execute an action
   */
  static async execute(req, res, next) {
    try {
      const { actionId, parameters, idempotencyKey } = req.body || {};
      const result = await AutomationGateway.proposeOrExecute({
        actionId,
        params: parameters,
        user: req.user,
        idempotencyKey,
        req,
      });

      // 200 OK for direct execution or pending confirmation proposal
      res.status(200).json({
        success: true,
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

  /**
   * POST /api/v1/automation/confirm
   * Authorize and execute a pending single-use confirmation token
   */
  static async confirm(req, res, next) {
    try {
      const { confirmationToken } = req.body || {};
      const result = await AutomationGateway.confirmExecution({
        confirmationToken,
        user: req.user,
        req,
      });

      res.status(200).json({
        success: true,
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
  /**
   * POST /api/v1/automation/cancel
   * Reject / cancel a pending confirmation
   */
  static async cancel(req, res, next) {
    try {
      const { confirmationToken, reason } = req.body || {};
      const result = await AutomationGateway.cancelConfirmation({
        confirmationToken,
        user: req.user,
        reason,
        req,
      });

      res.status(200).json({
        success: true,
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

  /**
   * POST /api/v1/automation/assistant/chat
   * Conversational natural language assistant interface
   */
  static async chatWithAssistant(req, res, next) {
    try {
      const { message, propertyId, conversationHistory } = req.body || {};
      const result = await AssistantService.processMessage({
        message,
        user: req.user,
        propertyId,
        conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
        req,
      });

      res.status(200).json({
        success: true,
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
}

module.exports = AutomationController;
