const { resolveIntent } = require('./intentResolver');
const { resolveWithAI } = require('./aiIntentProvider');
const actionRegistry = require('../actionRegistry');
const AutomationGateway = require('../automationGateway');

/**
 * Typed response component definitions.
 *
 * The assistant returns a `responseComponents` array alongside the legacy `message` string.
 * The frontend renders each component by its `type`. This prevents the AI from returning
 * arbitrary HTML or JSX — the model proposes only action IDs, the backend maps results to types.
 *
 * Supported component types:
 *   text              — plain conversational message (markdown safe)
 *   apartment_grid    — list of available apartments with interactive cards
 *   apartment_card    — single apartment availability result
 *   reservation_summary — reservation details card
 *   operations_table  — arrivals or departures table
 *   financial_summary — outstanding payments KPI card
 *   action_preview    — confirmation card for consequential operations
 *   success           — action executed successfully
 *   error             — operation failed
 *   clarification     — missing info prompt
 */

/**
 * Build a text component
 * @param {string} content - Markdown-safe text
 * @param {'normal'|'warning'|'info'|'security'} [variant]
 * @returns {Object}
 */
function textComponent(content, variant = 'normal') {
  return { type: 'text', content, variant };
}

/**
 * Assistant Service for BFA Intelligent Operations
 * Coordinates conversational intent parsing with authoritative gateway execution.
 */
class AssistantService {
  /**
   * Process incoming user chat message
   * @param {Object} options
   * @param {string} options.message
   * @param {Object} options.user
   * @param {number|string} [options.propertyId]
   * @param {Array} [options.conversationHistory] - Recent conversation turns for AI context
   * @param {Object} [options.req]
   * @returns {Promise<Object>}
   */
  static async processMessage({ message, user, propertyId, conversationHistory = [], req }) {
    // 1. Get authorized actions for this user (used by AI provider and auth check)
    const authorizedToolList = actionRegistry.listForUser(user);

    // 2. Try AI intent resolution first (when provider is configured)
    let resolved = null;
    try {
      resolved = await resolveWithAI({
        message,
        history: conversationHistory,
        authorizedTools: authorizedToolList,
      });
    } catch (aiErr) {
      // AI failure is non-fatal; fall through to deterministic resolver
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[AssistantService] AI resolution failed, using deterministic fallback:', aiErr.message);
      }
    }

    // 3. Deterministic fallback if AI returned nothing
    if (!resolved) {
      resolved = resolveIntent(message, { user, propertyId, conversationHistory });
    }

    // 4. Handle adversarial rejection
    if (resolved.type === 'ADVERSARIAL_REJECTED') {
      return {
        replyType: 'ADVERSARIAL_WARNING',
        message: 'Security Notice: Your request contained unrecognized instructions or unauthorized command syntax. I can only assist with registered operational actions within your assigned BFA permissions.',
        actionId: null,
        responseComponents: [
          textComponent('🔒 **Security Notice:** Your request contained unrecognized instructions or unauthorized command syntax. I can only assist with registered operational actions within your assigned BFA permissions.', 'security'),
        ],
      };
    }

    if (resolved.type === 'UNAUTHORIZED_NAVIGATION') {
      return {
        replyType: 'PERMISSION_DENIED',
        message: resolved.message,
        actionId: 'navigation.navigate',
        responseComponents: [textComponent(resolved.message, 'warning')],
      };
    }

    if (resolved.type === 'UNSUPPORTED' || resolved.type === 'MULTI_ACTION_DETECTED') {
      return {
        replyType: 'HELP',
        message: resolved.message,
        actionId: null,
        responseComponents: [textComponent(resolved.message, 'info')],
      };
    }

    if (resolved.type === 'CLARIFICATION') {
      return {
        replyType: 'CLARIFICATION',
        message: resolved.message,
        actionId: resolved.actionId,
        missingFields: resolved.missingFields,
        responseComponents: [
          { type: 'clarification', content: resolved.message, missingFields: resolved.missingFields },
        ],
      };
    }

    // 5. Intent matched: verify user authorization against ActionRegistry
    const isAuthorized = authorizedToolList.some((a) => a.actionId === resolved.actionId);

    if (!isAuthorized) {
      const denyMsg = `Access Restricted: Your current role (${user.role}) is not authorized to execute '${resolved.actionId}'. Please contact an administrator or management if you require this capability.`;
      return {
        replyType: 'PERMISSION_DENIED',
        message: denyMsg,
        actionId: resolved.actionId,
        responseComponents: [textComponent(denyMsg, 'warning')],
      };
    }

    // 6. Dispatch to Authoritative Automation Gateway
    try {
      const executionResult = await AutomationGateway.proposeOrExecute({
        actionId: resolved.actionId,
        params: resolved.parameters,
        user,
        req,
      });

      if (executionResult.confirmationRequired) {
        const confirmMsg = `I have prepared the proposal for **${resolved.actionId}**. Please inspect the verified parameters on the confirmation card below and confirm execution.`;
        return {
          replyType: 'CONFIRMATION_REQUIRED',
          message: confirmMsg,
          actionId: resolved.actionId,
          confirmation: executionResult.confirmation,
          responseComponents: [
            textComponent(confirmMsg),
            {
              type: 'action_preview',
              confirmation: executionResult.confirmation,
              actionId: resolved.actionId,
            },
          ],
        };
      }

      // 7. Build typed response components based on action type
      const components = this.buildResponseComponents(resolved.actionId, executionResult.result, user);
      const summaryText = this.formatExecutionSummary(resolved.actionId, executionResult.result);

      return {
        replyType: 'SUCCESS',
        message: summaryText,
        actionId: resolved.actionId,
        confirmation: null,
        result: executionResult.result,
        responseComponents: components,
      };
    } catch (err) {
      const errMsg = `Operation could not be completed: ${err.message}`;
      return {
        replyType: 'ERROR',
        message: errMsg,
        error: {
          code: err.code || 'EXECUTION_FAILED',
          status: err.statusCode || 500,
        },
        responseComponents: [{ type: 'error', content: errMsg, code: err.code || 'EXECUTION_FAILED' }],
      };
    }
  }

  /**
   * Build typed response component array based on the action and its result.
   * This is the only place that maps raw data to UI component types.
   * @param {string} actionId
   * @param {any} result
   * @param {Object} user
   * @returns {Array<Object>}
   */
  static buildResponseComponents(actionId, result, user) {
    if (!result) {
      return [textComponent('✅ Operation completed successfully.')];
    }

    switch (actionId) {
      case 'apartments.list_available': {
        const apartments = result.apartments || [];
        if (apartments.length === 0) {
          return [
            textComponent(`No apartments are available for check-in on **${result.checkInDate}**. All units may be occupied or under maintenance.`, 'info'),
            {
              type: 'apartment_grid',
              apartments: [],
              checkInDate: result.checkInDate,
              checkOutDate: result.checkOutDate,
              total: 0,
              empty: true,
            },
          ];
        }

        const userRole = (user.role || '').toUpperCase();
        const showPricing = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'].includes(userRole);

        return [
          textComponent(`Found **${result.total}** available apartment${result.total !== 1 ? 's' : ''} for **${result.checkInDate}** (1 night).`),
          {
            type: 'apartment_grid',
            apartments: apartments,
            checkInDate: result.checkInDate,
            checkOutDate: result.checkOutDate,
            total: result.total,
            showPricing,
            empty: false,
          },
        ];
      }

      case 'apartments.check_availability': {
        if (result.isAvailable) {
          const rateStr = result.ratePerNight ? `₦${result.ratePerNight.toLocaleString()}` : null;
          return [
            textComponent(`✅ **Apartment ${result.unitNumber || '#' + result.apartmentId}** is available for check-in on **${result.checkInDate}**!`),
            {
              type: 'apartment_card',
              apartment: {
                apartmentId: result.apartmentId,
                unitNumber: result.unitNumber,
                unitName: result.unitName,
                propertyName: result.propertyName,
                propertyId: result.propertyId,
                isAvailable: true,
                checkInDate: result.checkInDate,
                checkOutDate: result.checkOutDate,
                nights: result.nights,
                ratePerNight: result.ratePerNight,
                totalAmount: result.totalAmount,
              },
              showPricing: Boolean(result.ratePerNight),
            },
          ];
        }
        return [
          {
            type: 'apartment_card',
            apartment: {
              apartmentId: result.apartmentId,
              unitNumber: result.unitNumber,
              unitName: result.unitName,
              propertyName: result.propertyName,
              isAvailable: false,
              checkInDate: result.checkInDate,
              reason: result.reason || 'The unit is occupied or reserved on that date.',
            },
            showPricing: false,
          },
        ];
      }

      case 'operations.get_today_arrivals': {
        const arrivals = result;
        return [
          textComponent(
            arrivals.length === 0
              ? `📅 No arrivals scheduled for today.`
              : `📅 **${arrivals.length} arrival${arrivals.length !== 1 ? 's' : ''}** scheduled for today.`
          ),
          {
            type: 'operations_table',
            tableType: 'arrivals',
            rows: arrivals,
            date: new Date().toISOString().split('T')[0],
            total: arrivals.length,
          },
        ];
      }

      case 'operations.get_today_departures': {
        const departures = result;
        return [
          textComponent(
            departures.length === 0
              ? `🚪 No departures scheduled for today.`
              : `🚪 **${departures.length} departure${departures.length !== 1 ? 's' : ''}** scheduled for today.`
          ),
          {
            type: 'operations_table',
            tableType: 'departures',
            rows: departures,
            date: new Date().toISOString().split('T')[0],
            total: departures.length,
          },
        ];
      }

      case 'reservations.get_details': {
        return [
          {
            type: 'reservation_summary',
            reservation: result,
          },
        ];
      }

      case 'financial.summarize_outstanding_payments': {
        return [
          {
            type: 'financial_summary',
            data: result,
          },
        ];
      }

      case 'navigation.navigate': {
        return [
          textComponent(`Navigated to **${result.displayName}** (\`${result.path}\`).`),
          {
            type: 'navigation',
            routeId: result.routeId,
            path: result.path,
            displayName: result.displayName,
            moduleGroup: result.moduleGroup,
            params: result.params || {},
            query: result.query || {},
          },
        ];
      }

      case 'dev.get_register': {
        return [
          textComponent(`📋 **BFA Continuous Development Register** (Release Baseline: **${result.baseline?.currentRelease || '1.0.0-rc2'}**)`),
          {
            type: 'dev_register',
            data: result,
          },
        ];
      }

      case 'dev.get_system_status': {
        return [
          textComponent(`🔍 **Real-Time System Diagnostics:** Subsystems **${result.status}** with **${result.database?.appliedMigrations || 23}** migrations applied.`),
          {
            type: 'system_diagnostic',
            data: result,
          },
        ];
      }

      case 'dev.plan_task': {
        return [
          textComponent(`📝 **10-Step Continuous Development Plan** for **"${result.task?.title}"** (${result.task?.priority} Priority).`),
          {
            type: 'development_plan',
            data: result,
          },
        ];
      }

      default:
        return [textComponent(this.formatExecutionSummary(actionId, result))];
    }
  }

  /**
   * Format action execution result into human-readable markdown summary (legacy fallback)
   * @param {string} actionId
   * @param {any} result
   * @returns {string}
   */
  static formatExecutionSummary(actionId, result) {
    if (!result) return 'Operation completed successfully.';

    switch (actionId) {
      case 'apartments.list_available': {
        const apts = result.apartments || [];
        if (apts.length === 0) {
          return `**Available Apartments:** No apartments are available for ${result.checkInDate}.`;
        }
        let txt = `**Available Apartments for ${result.checkInDate} (${apts.length} found):**\n`;
        apts.slice(0, 5).forEach((a, i) => {
          txt += `\n${i + 1}. **Apartment ${a.apartmentId}** (${a.unitName || a.unitNumber}, ${a.propertyName}) — ${a.unitType || ''}`;
          if (a.ratePerNight) txt += ` — ₦${a.ratePerNight.toLocaleString()}/night`;
        });
        if (apts.length > 5) txt += `\n\n...and ${apts.length - 5} more available.`;
        return txt;
      }

      case 'operations.get_today_arrivals': {
        const arrivals = Array.isArray(result) ? result : (result.arrivals || []);
        if (arrivals.length === 0) {
          return `**Today's Arrivals:** There are no guests scheduled to check in today.`;
        }
        let txt = `**Today's Arrivals (${arrivals.length} scheduled):**\n`;
        arrivals.forEach((a, i) => {
          txt += `\n${i + 1}. **${a.guestName}** — Apt: ${a.unitNumber || a.apartmentId} (${a.propertyName || 'Property'})\n`;
          txt += `   • Status: ${a.status} | Booking Code: ${a.reservationCode || 'N/A'}`;
        });
        return txt;
      }

      case 'operations.get_today_departures': {
        const departures = Array.isArray(result) ? result : (result.departures || []);
        if (departures.length === 0) {
          return `**Today's Departures:** There are no guests scheduled to check out today.`;
        }
        let txt = `**Today's Departures (${departures.length} scheduled):**\n`;
        departures.forEach((d, i) => {
          txt += `\n${i + 1}. **${d.guestName}** — Apt: ${d.unitNumber || d.apartmentId} (${d.propertyName || 'Property'})\n`;
          txt += `   • Status: ${d.status} | Booking Code: ${d.reservationCode || 'N/A'}`;
        });
        return txt;
      }

      case 'apartments.check_availability': {
        if (result.isAvailable) {
          const rateStr = result.ratePerNight ? `₦${result.ratePerNight.toLocaleString()}` : 'N/A';
          return `✅ **Apartment #${result.apartmentId}** (${result.unitNumber || ''}) is **AVAILABLE** for check-in on **${result.checkInDate}**!\n• Property: ${result.propertyName || 'BFA Apartments'}\n• Rate per night: ${rateStr}`;
        }
        return `❌ **Apartment #${result.apartmentId}** is **NOT AVAILABLE** for check-in on **${result.checkInDate}**.\n${result.reason || 'The unit is occupied or reserved.'}`;
      }

      case 'reservations.get_details': {
        let txt = `📋 **Reservation Details: ${result.reservationCode || '#' + result.reservationId}**\n`;
        txt += `• **Guest:** ${result.guestName}\n`;
        txt += `• **Apartment:** #${result.apartmentId} (${result.propertyName || 'BFA'})\n`;
        txt += `• **Dates:** ${result.checkInDate} to ${result.checkOutDate} (${result.nights} night)\n`;
        txt += `• **Status:** ${result.status}\n`;
        if (result.totalAmount !== undefined) {
          txt += `• **Total Amount:** ₦${result.totalAmount?.toLocaleString() || 0} (Paid: ₦${result.paidAmount?.toLocaleString() || 0})\n`;
          txt += `• **Payment Status:** ${result.paymentStatus || 'N/A'}`;
        }
        return txt;
      }

      case 'financial.summarize_outstanding_payments': {
        let txt = `💰 **Financial Overview**\n`;
        txt += `• **Net Revenue:** ₦${(result.netRevenue || 0).toLocaleString()}\n`;
        txt += `• **Outstanding Receivables:** ₦${(result.outstandingReceivables || 0).toLocaleString()}\n`;
        txt += `• **Pending Payments:** ₦${(result.pendingPayments || 0).toLocaleString()}`;
        return txt;
      }

      case 'navigation.navigate': {
        return `Navigated to **${result.displayName}** (${result.path}).`;
      }

      case 'dev.get_register': {
        const b = result.baseline || {};
        return `📋 **BFA Continuous Development Register**\n• Baseline: ${b.currentRelease || '1.0.0-rc2'}\n• Migrations: ${b.databaseMigrations || '23/23'}\n• Automated Tests: ${b.automatedTestSuite || '47/47 Passing'}\n• Release Gates: ${(result.releaseGates || []).length} cataloged`;
      }

      case 'dev.get_system_status': {
        return `🔍 **BFA Real-Time Diagnostics**\n• System Status: ${result.status}\n• Database Latency: ${result.database?.latencyMs}ms\n• Applied Migrations: ${result.database?.appliedMigrations}\n• Node Memory: ${result.runtime?.memoryUsedMb} MB\n• Subsystems: ${result.subsystemsCount} active`;
      }

      case 'dev.plan_task': {
        return `📝 **10-Step Continuous Development Plan: ${result.task?.title}**\n• Framework: ${result.framework}\n• Phases: ${result.steps?.length || 10} steps planned\n• Priority: ${result.task?.priority}`;
      }

      default:
        return 'Operation completed successfully.';
    }
  }
}

module.exports = AssistantService;
