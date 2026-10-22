const pool = require('../../db/pool');
const {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  NotFoundError,
} = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');
const AccessControlService = require('../../core/access/accessControl.service');
const { registry } = require('./actions');
const ConfirmationService = require('./confirmationService');

class AutomationGateway {
  /**
   * Main entrypoint: Propose or immediately execute an automation action
   */
  static async proposeOrExecute({ actionId, params = {}, user, idempotencyKey = null, req = null }) {
    // 1. Require valid authenticated identity
    if (!user || !user.id) {
      throw new UnauthorizedError('Authentication is required to perform automation actions.');
    }

    // 2. Lookup registered action (Explicit Deny-by-Default)
    const action = registry.get(actionId);

    // 3. Obtain role from trusted server-side authentication
    const userRole = (user.role || '').toUpperCase();
    const isSuperAdmin = userRole === 'SUPER_ADMIN';

    // 4. Enforce permitted roles
    if (!isSuperAdmin && !action.permittedRoles.includes(userRole)) {
      await auditService.record({
        req,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: userRole,
        action: 'AUTOMATION_ACTION_DENIED',
        entityType: 'automation_action',
        entityId: action.actionId,
        newValues: {
          reason: `Role '${userRole}' is not permitted to perform '${action.actionId}'.`,
          permittedRoles: action.permittedRoles,
        },
      });
      throw new ForbiddenError(
        `Access denied: Role '${userRole}' is not authorized to execute automation action '${action.actionId}'.`
      );
    }

    // 5. Enforce capability policy if action defines requiredCapability
    if (action.requiredCapability) {
      const capCheck = await AccessControlService.canAccess(user, action.requiredCapability);
      if (!capCheck.allowed) {
        await auditService.record({
          req,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: userRole,
          action: 'AUTOMATION_CAPABILITY_DENIED',
          entityType: 'automation_action',
          entityId: action.actionId,
          newValues: {
            capability: action.requiredCapability,
            reason: capCheck.reason,
          },
        });
        throw new ForbiddenError(
          `Access denied: Capability '${action.requiredCapability}' is restricted (${capCheck.reason || 'disabled'}).`
        );
      }
    }

    // 6. Validate input parameters against strict Zod schema
    let parsedParams;
    try {
      parsedParams = action.inputSchema.parse(params || {});
    } catch (err) {
      const issues = err.errors ? err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') : err.message;
      await auditService.record({
        req,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: userRole,
        action: 'AUTOMATION_VALIDATION_FAILED',
        entityType: 'automation_action',
        entityId: action.actionId,
        newValues: {
          validationError: issues,
          rawParams: params,
        },
      });
      throw new ValidationError(`Parameter validation failed for '${action.actionId}': ${issues}`);
    }

    // 7. Enforce server-side property isolation (never trust client property overrides for scoped roles)
    if (['OWNER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(userRole) && user.propertyId) {
      if (parsedParams.propertyId && parseInt(parsedParams.propertyId, 10) !== parseInt(user.propertyId, 10)) {
        await auditService.record({
          req,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: userRole,
          action: 'AUTOMATION_CROSS_PROPERTY_BLOCKED',
          entityType: 'automation_action',
          entityId: action.actionId,
          newValues: {
            userPropertyId: user.propertyId,
            requestedPropertyId: parsedParams.propertyId,
          },
        });
        throw new ForbiddenError(
          'Access denied: You are not authorized to query or operate across property boundaries.'
        );
      }
    }

    // 8. Pre-validation hook (e.g. apartment existence, live booking availability)
    let preValidateInfo = null;
    if (typeof action.preValidate === 'function') {
      try {
        preValidateInfo = await action.preValidate({ params: parsedParams, user, req });
      } catch (err) {
        await auditService.record({
          req,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: userRole,
          action: 'AUTOMATION_PREVALIDATE_FAILED',
          entityType: 'automation_action',
          entityId: action.actionId,
          newValues: { error: err.message, params: parsedParams },
        });
        throw err;
      }
    }

    // 9. Idempotency check for write proposals
    if (idempotencyKey) {
      const existing = await pool.query(
        'SELECT * FROM automation_confirmations WHERE idempotency_key = ? AND user_id = ? AND action_id = ? LIMIT 1',
        [idempotencyKey, user.id, action.actionId]
      );
      if (existing.length > 0) {
        const conf = existing[0];
        if (conf.status === 'PENDING') {
          return {
            executed: false,
            confirmationRequired: true,
            isIdempotentReplay: true,
            confirmation: {
              confirmationId: conf.id,
              confirmationToken: conf.confirmation_token,
              actionId: conf.action_id,
              summary: conf.summary,
              requiresDualApproval: Boolean(conf.requires_dual_approval),
              expiresAt: conf.expires_at,
            },
          };
        }
        if (conf.status === 'EXECUTED') {
          throw new ConflictError('Duplicate request: An operation with this idempotencyKey has already been executed.');
        }
      }
    }

    // 10. Confirmation Requirement Check
    if (action.requiresConfirmation) {
      const propertyId = preValidateInfo?.propertyId || parsedParams.propertyId || user.propertyId || null;
      const recordId = preValidateInfo?.recordId || parsedParams.apartmentId || parsedParams.reservationId || null;

      const conf = await ConfirmationService.createConfirmation({
        action,
        user,
        params: parsedParams,
        propertyId,
        recordId,
        idempotencyKey,
        requiresDualApproval: action.requiresDualApproval,
        req,
      });

      return {
        executed: false,
        confirmationRequired: true,
        confirmation: conf,
      };
    }

    // 11. Direct Execution for Safe Actions
    const timeoutMs = action.timeoutMs || 5000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Action '${action.actionId}' execution timed out after ${timeoutMs}ms.`)), timeoutMs)
    );

    try {
      const execPromise = action.execute({
        params: parsedParams,
        user,
        context: { req, preValidateInfo },
      });

      const rawResult = await Promise.race([execPromise, timeoutPromise]);
      const formattedResult = action.formatResult ? action.formatResult(rawResult) : rawResult;

      await auditService.record({
        req,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: userRole,
        action: 'AUTOMATION_ACTION_EXECUTED',
        entityType: 'automation_action',
        entityId: action.actionId,
        newValues: {
          actionId: action.actionId,
          params: parsedParams,
          direct: true,
        },
      });

      return {
        executed: true,
        actionId: action.actionId,
        result: formattedResult,
      };
    } catch (err) {
      await auditService.record({
        req,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: userRole,
        action: 'AUTOMATION_ACTION_FAILED',
        entityType: 'automation_action',
        entityId: action.actionId,
        newValues: { error: err.message, params: parsedParams },
      });
      throw err;
    }
  }

  /**
   * Confirm and execute a pending consequential action
   */
  static async confirmExecution({ confirmationToken, user, req = null }) {
    if (!user || !user.id) {
      throw new UnauthorizedError('Authentication is required to confirm automation actions.');
    }

    // 1. Validate token, expiry, and user binding (throws on tamper/mismatch/dual-approval breach)
    const conf = await ConfirmationService.validateAndGetPending(confirmationToken, user);

    // If confirmation was recovered from a previous interrupted execution, return existing result
    if (conf.recovered && conf.recoveredResult) {
      return {
        executed: true,
        actionId: conf.action_id,
        confirmationToken,
        isRecoveredReplay: true,
        result: {
          reservationId: conf.recoveredResult.id,
          reservationCode: conf.recoveredResult.reservation_code,
          guestName: conf.recoveredResult.tenant_name,
          checkInDate: conf.recoveredResult.check_in_date,
          checkOutDate: conf.recoveredResult.check_out_date,
          nights: conf.recoveredResult.nights || 1,
          totalAmount: parseFloat(conf.recoveredResult.total_amount),
          status: conf.recoveredResult.status,
        },
      };
    }

    // 2. Fetch action definition
    const action = registry.get(conf.action_id);

    // 3. Re-verify user authorization at confirmation time (protection against role revocation between proposal and confirmation)
    const userRole = (user.role || '').toUpperCase();
    const isSuperAdmin = userRole === 'SUPER_ADMIN';

    if (!isSuperAdmin && !action.permittedRoles.includes(userRole)) {
      throw new ForbiddenError(
        `Authorization revoked: Role '${userRole}' is no longer permitted to confirm action '${action.actionId}'.`
      );
    }

    if (action.requiredCapability) {
      const capCheck = await AccessControlService.canAccess(user, action.requiredCapability);
      if (!capCheck.allowed) {
        throw new ForbiddenError(
          `Capability revoked: '${action.requiredCapability}' is restricted (${capCheck.reason || 'disabled'}).`
        );
      }
    }

    // 4. Re-verify property scope at confirmation time
    if (['OWNER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(userRole) && user.propertyId) {
      if (conf.property_id && parseInt(conf.property_id, 10) !== parseInt(user.propertyId, 10)) {
        throw new ForbiddenError(
          'Cross-property violation: You are not authorized to confirm actions for another property.'
        );
      }
    }

    // 5. ATOMIC CONSUMPTION: Atomically transition status from PENDING to CONFIRMED (in-flight)
    const claimed = await ConfirmationService.atomicClaimPending({
      confirmationId: conf.id,
      approverUser: user,
      req,
    });
    if (!claimed) {
      const current = await pool.query('SELECT status FROM automation_confirmations WHERE id = ?', [conf.id]);
      const currentStatus = current[0]?.status || 'UNKNOWN';
      throw new ConflictError(
        `Concurrent execution conflict: This confirmation token is already ${currentStatus.toLowerCase()} or expired.`
      );
    }

    // 6. Execute action with hash-verified parameters
    const timeoutMs = action.timeoutMs || 10000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Action '${action.actionId}' execution timed out after ${timeoutMs}ms.`)), timeoutMs)
    );

    try {
      const execPromise = action.execute({
        params: conf.parsedParams,
        user,
        context: { req, confirmation: conf },
      });

      const rawResult = await Promise.race([execPromise, timeoutPromise]);
      const formattedResult = action.formatResult ? action.formatResult(rawResult) : rawResult;

      // 7. Transition status from CONFIRMED to EXECUTED upon genuine success
      const recordId = rawResult?.reservationId || rawResult?.id || null;
      await ConfirmationService.markExecuted({
        confirmationId: conf.id,
        recordId,
        approverUser: user,
        req,
      });

      // 8. Record successful execution in audit trail
      const maskedToken = `${confirmationToken.substring(0, 12)}...`;

      await auditService.record({
        req,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: userRole,
        action: 'AUTOMATION_ACTION_EXECUTED',
        entityType: 'automation_action',
        entityId: action.actionId,
        newValues: {
          actionId: action.actionId,
          confirmationToken: maskedToken,
          params: conf.parsedParams,
          recordId,
          executedViaConfirmation: true,
        },
      });

      return {
        executed: true,
        actionId: action.actionId,
        confirmationToken,
        result: formattedResult,
      };
    } catch (err) {
      // 9. Void confirmation upon execution failure: transition CONFIRMED -> REJECTED
      await ConfirmationService.markFailed({
        confirmationId: conf.id,
        reason: err.message,
        approverUser: user,
        req,
      }).catch(() => {});

      await auditService.record({
        req,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: userRole,
        action: 'AUTOMATION_ACTION_FAILED',
        entityType: 'automation_action',
        entityId: action.actionId,
        newValues: {
          confirmationToken: `${confirmationToken.substring(0, 12)}...`,
          error: err.message,
          params: conf.parsedParams,
        },
      });
      throw err;
    }
  }

  /**
   * Cancel a pending confirmation
   */
  static async cancelConfirmation({ confirmationToken, user, reason, req = null }) {
    if (!user || !user.id) {
      throw new UnauthorizedError('Authentication is required to cancel confirmations.');
    }
    return ConfirmationService.cancelConfirmation({
      token: confirmationToken,
      user,
      reason,
      req,
    });
  }

  /**
   * List actions accessible to the current authenticated caller
   */
  static listActions({ user }) {
    return registry.listForUser(user);
  }
}

module.exports = AutomationGateway;
