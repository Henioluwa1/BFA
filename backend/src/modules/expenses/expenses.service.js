const ExpensesRepository = require('./expenses.repository');
const PropertiesRepository = require('../properties/properties.repository');
const ApartmentsRepository = require('../apartments/apartments.repository');
const MaintenanceRepository = require('../maintenance/maintenance.repository');
const AuditService = require('../../core/audit/audit.service');
const AccessControlService = require('../../core/access/accessControl.service');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = require('../../core/errors/apiError');

const VALID_CATEGORIES = [
  'MAINTENANCE',
  'UTILITIES',
  'STAFF',
  'SUPPLIES',
  'CLEANING',
  'PROPERTY',
  'ADMINISTRATION',
  'MARKETING',
  'OTHER',
];

class ExpensesService {
  /**
   * Validate user's property scope
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return true;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return true;
    }
    if (['MANAGER', 'STAFF'].includes(role) && user.propertyId) {
      if (parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization for this property.');
      }
    }
    return true;
  }

  /**
   * List expenses with filters and pagination
   */
  static async listExpenses(params, user = null) {
    return ExpensesRepository.findAll({
      ...params,
      user,
    });
  }

  /**
   * Get single expense by ID
   */
  static async getExpenseById(id, user = null) {
    const expense = await ExpensesRepository.findById(id);
    if (!expense) {
      throw new NotFoundError(`Expense record #${id} not found.`);
    }

    if (user) {
      this.validatePropertyScope(user, expense.property_id);
    }

    return expense;
  }

  /**
   * Create new operational expense
   */
  static async createExpense(data, user = null, req = null) {
    if (!data.property_id || !data.description || data.amount === undefined) {
      throw new ValidationError('Property ID, description, and amount are required.');
    }

    this.validatePropertyScope(user, data.property_id);

    // Verify property exists
    const property = await PropertiesRepository.findById(data.property_id);
    if (!property) {
      throw new NotFoundError(`Property #${data.property_id} not found.`);
    }

    // Verify unit if supplied
    if (data.apartment_id) {
      const apartment = await ApartmentsRepository.findById(data.apartment_id);
      if (!apartment) {
        throw new NotFoundError(`Apartment unit #${data.apartment_id} not found.`);
      }
      if (parseInt(apartment.property_id, 10) !== parseInt(data.property_id, 10)) {
        throw new ValidationError('Data Integrity Violation: Unit does not belong to specified property.');
      }
    }

    // Verify maintenance request if supplied
    if (data.maintenance_id) {
      const maint = await MaintenanceRepository.findById(data.maintenance_id);
      if (!maint) {
        throw new NotFoundError(`Maintenance work order #${data.maintenance_id} not found.`);
      }
      if (parseInt(maint.property_id, 10) !== parseInt(data.property_id, 10)) {
        throw new ValidationError('Data Integrity Violation: Maintenance issue does not belong to specified property.');
      }
    }

    const numAmount = parseFloat(data.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new ValidationError('Expense amount must be a positive numeric value.');
    }

    const category = data.category ? String(data.category).toUpperCase() : 'MAINTENANCE';
    if (!VALID_CATEGORIES.includes(category)) {
      throw new ValidationError(`Invalid category '${data.category}'. Allowed: ${VALID_CATEGORIES.join(', ')}`);
    }

    const propCode = property.code || 'BFA';
    const expenseCode = `EXP-${propCode}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const expenseDate = data.expense_date || new Date().toISOString().split('T')[0];

    const insertId = await ExpensesRepository.create({
      expense_code: expenseCode,
      property_id: parseInt(data.property_id, 10),
      apartment_id: data.apartment_id ? parseInt(data.apartment_id, 10) : null,
      maintenance_id: data.maintenance_id ? parseInt(data.maintenance_id, 10) : null,
      category,
      description: data.description.trim(),
      amount: numAmount,
      currency: data.currency || 'NGN',
      expense_date: expenseDate,
      vendor_payee: data.vendor_payee ? data.vendor_payee.trim() : null,
      payment_method: data.payment_method || 'BANK_TRANSFER',
      status: 'RECORDED',
      created_by_id: user?.id || null,
      notes: data.notes || null,
    });

    const created = await ExpensesRepository.findById(insertId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EXPENSE_CREATED',
      entityType: 'expense',
      entityId: String(insertId),
      newValues: {
        expenseCode,
        propertyId: data.property_id,
        category,
        amount: numAmount,
        currency: data.currency || 'NGN',
        status: 'RECORDED',
        expenseDate,
      },
    });

    return created;
  }

  /**
   * Update expense details
   */
  static async updateExpense(id, data, user = null, req = null) {
    const expense = await this.getExpenseById(id, user);

    if (expense.status === 'VOIDED') {
      throw new ConflictError('Cannot update a voided expense record.');
    }

    if (expense.status === 'APPROVED' && user?.role !== 'SUPER_ADMIN' && user?.role !== 'OWNER') {
      throw new ForbiddenError('Approved expenses can only be amended by Super Admin or Owner.');
    }

    const updateData = {};
    if (data.description) updateData.description = data.description.trim();
    if (data.vendor_payee !== undefined) updateData.vendor_payee = data.vendor_payee ? data.vendor_payee.trim() : null;
    if (data.payment_method) updateData.payment_method = data.payment_method;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.expense_date) updateData.expense_date = data.expense_date;

    if (data.amount !== undefined) {
      const numAmount = parseFloat(data.amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new ValidationError('Expense amount must be a positive numeric value.');
      }
      updateData.amount = numAmount;
    }

    if (data.category) {
      const category = String(data.category).toUpperCase();
      if (!VALID_CATEGORIES.includes(category)) {
        throw new ValidationError(`Invalid category '${data.category}'. Allowed: ${VALID_CATEGORIES.join(', ')}`);
      }
      updateData.category = category;
    }

    await ExpensesRepository.update(id, updateData);
    const updated = await ExpensesRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EXPENSE_UPDATED',
      entityType: 'expense',
      entityId: String(id),
      oldValues: { amount: expense.amount, category: expense.category, description: expense.description },
      newValues: updateData,
    });

    return updated;
  }

  /**
   * Approve recorded expense
   */
  static async approveExpense(id, user, req = null) {
    const expense = await this.getExpenseById(id, user);

    // Capability check: EXPENSE_APPROVAL
    const capCheck = await AccessControlService.canAccess(user, 'EXPENSE_APPROVAL');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Expense approval is restricted by system capability policy (${capCheck.reason}).`);
    }

    if (expense.status === 'APPROVED') {
      throw new ConflictError(`Expense #${expense.expense_code} has already been approved.`);
    }

    if (expense.status === 'VOIDED') {
      throw new ConflictError('Cannot approve a voided expense record.');
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await ExpensesRepository.update(id, {
      status: 'APPROVED',
      approved_by_id: user.id,
      approved_at: nowStr,
    });

    const updated = await ExpensesRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EXPENSE_APPROVED',
      entityType: 'expense',
      entityId: String(id),
      oldValues: { status: expense.status },
      newValues: { status: 'APPROVED', approvedById: user.id, approvedAt: nowStr },
    });

    return updated;
  }

  /**
   * Void an expense record (safe cancellation without physical deletion)
   */
  static async voidExpense(id, { reason }, user, req = null) {
    if (!reason || reason.trim().length < 3) {
      throw new ValidationError('A void reason is required (minimum 3 characters).');
    }

    const expense = await this.getExpenseById(id, user);

    if (expense.status === 'VOIDED') {
      throw new ConflictError(`Expense #${expense.expense_code} has already been voided.`);
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await ExpensesRepository.update(id, {
      status: 'VOIDED',
      voided_by_id: user.id,
      voided_at: nowStr,
      void_reason: reason.trim(),
    });

    const updated = await ExpensesRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EXPENSE_VOIDED',
      entityType: 'expense',
      entityId: String(id),
      oldValues: { status: expense.status },
      newValues: { status: 'VOIDED', voidReason: reason.trim(), voidedById: user.id, voidedAt: nowStr },
    });

    return updated;
  }

  /**
   * Get expense summary metrics
   */
  static async getStats(query, user = null) {
    return ExpensesRepository.getStats({
      propertyId: query.propertyId,
      fromDate: query.fromDate,
      toDate: query.toDate,
      user,
    });
  }
}

module.exports = ExpensesService;
