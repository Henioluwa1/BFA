/**
 * Central Operations & Directives Controller
 * BFA Apartments Management System
 */

const CentralOperationsService = require('./centralOperations.service');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../utils/logger');

class CentralOperationsController {
  /**
   * Initiate new operation
   */
  static async createOperation(req, res, next) {
    try {
      const operation = await CentralOperationsService.createOperation(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'Central Operation and Memo successfully issued and dispatched.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List operations across 5 operational views with filters
   */
  static async listOperations(req, res, next) {
    try {
      const operations = await CentralOperationsService.listOperations(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Operations list retrieved successfully.',
        data: operations,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get single operation details with memos, recipients, linked tasks, and audit trail
   */
  static async getOperationById(req, res, next) {
    try {
      const operation = await CentralOperationsService.getOperationById(req.user, req.params.id);
      return ApiResponse.success(res, {
        message: 'Operation details retrieved successfully.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Recipient acknowledges receipt of operational memo
   */
  static async acknowledgeOperation(req, res, next) {
    try {
      const operation = await CentralOperationsService.acknowledgeOperation(req.user, req.params.id, req.body.note);
      return ApiResponse.success(res, {
        message: 'Operation receipt acknowledged successfully.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Request clarification
   */
  static async requestClarification(req, res, next) {
    try {
      const operation = await CentralOperationsService.requestClarification(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Clarification request logged and dispatched to linked channel.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Respond to clarification
   */
  static async respondClarification(req, res, next) {
    try {
      const operation = await CentralOperationsService.respondClarification(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Clarification response logged and dispatched to linked channel.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Report operational blocker
   */
  static async reportBlocker(req, res, next) {
    try {
      const operation = await CentralOperationsService.reportBlocker(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Operational blocker recorded and manager alerted.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update operational progress
   */
  static async updateProgress(req, res, next) {
    try {
      const operation = await CentralOperationsService.updateProgress(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Progress update recorded successfully.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Spawn linked task
   */
  static async createLinkedTask(req, res, next) {
    try {
      const task = await CentralOperationsService.createLinkedTask(req.user, req.params.id, req.body);
      return ApiResponse.created(res, {
        message: 'Operational task linked to operation successfully.',
        data: task,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Submit completion for review
   */
  static async submitCompletion(req, res, next) {
    try {
      const operation = await CentralOperationsService.submitCompletion(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Operational completion submitted for review.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Review operation (Approve or Reject/Revise)
   */
  static async reviewOperation(req, res, next) {
    try {
      const operation = await CentralOperationsService.reviewOperation(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Operational review concluded.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Amend operation & generate new memo version
   */
  static async amendOperation(req, res, next) {
    try {
      const operation = await CentralOperationsService.amendOperation(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Operational amendment saved and revised memo issued.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Cancel operation
   */
  static async cancelOperation(req, res, next) {
    try {
      const operation = await CentralOperationsService.cancelOperation(req.user, req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Operation formally cancelled and notice dispatched.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Claim / Accept responsibility for a group operation
   */
  static async claimOperation(req, res, next) {
    try {
      const operation = await CentralOperationsService.claimOperation(req.user, req.params.id);
      return ApiResponse.success(res, {
        message: 'Responsibility for operation successfully claimed.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Assign / Delegate responsibility to a specific user
   */
  static async assignOperation(req, res, next) {
    try {
      const { targetUserId, notes } = req.body;
      const operation = await CentralOperationsService.assignOperation(req.user, req.params.id, targetUserId, notes);
      return ApiResponse.success(res, {
        message: 'Operation responsibility successfully assigned.',
        data: operation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Authoritative real-time summary for reporting and dashboards
   */
  static async getOperationsSummary(req, res, next) {
    try {
      const summary = await CentralOperationsService.getOperationsSummary(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Operations summary metrics retrieved successfully.',
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Download / stream formal Operations Memo PDF
   */
  static async downloadMemoPdf(req, res, next) {
    try {
      const { buffer, fileName, mimeType } = await CentralOperationsService.getMemoPdfBuffer(
        req.user,
        req.params.memoId,
        req.params.id
      );

      const safeFileName = fileName && fileName.endsWith('.pdf') ? fileName : `${fileName || 'operations_memo'}.pdf`;
      const isInline = req.query.preview === 'true' || req.query.disposition === 'inline';
      res.setHeader('Content-Type', mimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${safeFileName}"`);
      res.setHeader('Content-Length', Buffer.byteLength(buffer));
      return res.end(buffer);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CentralOperationsController;
