const { NotFoundError, ValidationError } = require('../../core/errors/apiError');

/**
 * Action Registry for BFA Intelligent Operations Automation Engine
 * Explicit, Deny-by-Default Architecture
 */
class ActionRegistry {
  constructor() {
    this.actions = new Map();
  }

  /**
   * Register a new business action in the registry
   * @param {Object} actionDefinition
   */
  register(actionDefinition) {
    if (!actionDefinition.actionId || typeof actionDefinition.actionId !== 'string') {
      throw new Error('Action must define a valid string actionId.');
    }
    if (!actionDefinition.description) {
      throw new Error(`Action ${actionDefinition.actionId} must define a description.`);
    }
    if (!Array.isArray(actionDefinition.permittedRoles) || actionDefinition.permittedRoles.length === 0) {
      throw new Error(`Action ${actionDefinition.actionId} must specify permittedRoles array.`);
    }
    if (!actionDefinition.inputSchema) {
      throw new Error(`Action ${actionDefinition.actionId} must specify a strict inputSchema.`);
    }
    if (typeof actionDefinition.execute !== 'function') {
      throw new Error(`Action ${actionDefinition.actionId} must provide an execute handler function.`);
    }

    const normalizedId = actionDefinition.actionId.trim().toLowerCase();
    if (this.actions.has(normalizedId)) {
      throw new Error(`Action '${normalizedId}' is already registered.`);
    }

    this.actions.set(normalizedId, {
      actionId: normalizedId,
      description: actionDefinition.description,
      category: actionDefinition.category || 'GENERAL',
      requiredCapability: actionDefinition.requiredCapability || null,
      permittedRoles: actionDefinition.permittedRoles.map((r) => r.toUpperCase()),
      classification: actionDefinition.classification || 'READ',
      riskLevel: actionDefinition.riskLevel || 'LOW',
      requiresConfirmation: Boolean(actionDefinition.requiresConfirmation),
      requiresDualApproval: Boolean(actionDefinition.requiresDualApproval),
      inputSchema: actionDefinition.inputSchema,
      propertyScoping: actionDefinition.propertyScoping || { mode: 'OPTIONAL' },
      timeoutMs: actionDefinition.timeoutMs || 5000,
      execute: actionDefinition.execute,
      preValidate: actionDefinition.preValidate || null,
      summaryBuilder: actionDefinition.summaryBuilder || ((params) => `Execute ${normalizedId}`),
      formatResult: actionDefinition.formatResult || ((res) => res),
    });
  }

  /**
   * Look up an action by ID (Deny-by-default if not found)
   * @param {string} actionId
   */
  get(actionId) {
    if (!actionId || typeof actionId !== 'string') {
      throw new ValidationError('A valid actionId string is required.');
    }
    const cleanId = actionId.trim().toLowerCase();
    const action = this.actions.get(cleanId);
    if (!action) {
      throw new NotFoundError(`Unsupported or unregistered automation action: '${actionId}'.`);
    }
    return action;
  }

  /**
   * Check if action exists
   * @param {string} actionId
   */
  has(actionId) {
    if (!actionId || typeof actionId !== 'string') return false;
    return this.actions.has(actionId.trim().toLowerCase());
  }

  /**
   * List all actions visible and authorized for a given user context
   * @param {Object} user
   */
  listForUser(user) {
    if (!user) return [];
    const role = (user.role || '').toUpperCase();
    const isSuperAdmin = role === 'SUPER_ADMIN';

    const visible = [];
    for (const action of this.actions.values()) {
      if (isSuperAdmin || action.permittedRoles.includes(role)) {
        visible.push({
          actionId: action.actionId,
          description: action.description,
          category: action.category,
          classification: action.classification,
          riskLevel: action.riskLevel,
          requiresConfirmation: action.requiresConfirmation,
          requiresDualApproval: action.requiresDualApproval,
          propertyScoping: action.propertyScoping.mode,
        });
      }
    }
    return visible;
  }

  /**
   * List all raw registered action objects
   */
  listAll() {
    return Array.from(this.actions.values());
  }

  /**
   * Clear registry (useful for testing)
   */
  clear() {
    this.actions.clear();
  }
}

// Global Singleton Registry
const registry = new ActionRegistry();
module.exports = registry;
