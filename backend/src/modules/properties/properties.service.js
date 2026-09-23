const PropertiesRepository = require('./properties.repository');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');

class PropertiesService {
  /**
   * Validate that the user is authorized for the given property
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return; // Authorized across all properties
    }
    if (user.propertyId && String(user.propertyId) !== String(propertyId)) {
      throw new ForbiddenError(`You are only authorized to access Property #${user.propertyId}.`);
    }
  }

  /**
   * List all properties within user's scope
   */
  static async listProperties({ search, status, user } = {}) {
    return PropertiesRepository.findAll({ search, status, user });
  }

  /**
   * Get property details by ID
   */
  static async getPropertyById(id, user = null) {
    if (user) {
      this.validatePropertyScope(user, id);
    }
    const prop = await PropertiesRepository.findById(id);
    if (!prop) {
      throw new NotFoundError(`Property with ID ${id} not found.`);
    }
    return prop;
  }

  /**
   * Create a new property
   */
  static async createProperty(data, user, req = null) {
    if (!data.name || !data.code || !data.address) {
      throw new ValidationError('Property name, code, and address are required.');
    }

    const existing = await PropertiesRepository.findByCode(data.code.trim().toUpperCase());
    if (existing) {
      throw new ConflictError(`Property code '${data.code.toUpperCase()}' is already in use.`);
    }

    const newId = await PropertiesRepository.create({
      ...data,
      created_by: user?.id || null,
    });

    const created = await PropertiesRepository.findById(newId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'PROPERTY_CREATED',
      entityType: 'property',
      entityId: String(newId),
      newValues: {
        id: newId,
        name: created.name,
        code: created.code,
        address: created.address,
        status: created.status,
      },
    });

    return created;
  }

  /**
   * Update property details
   */
  static async updateProperty(id, data, user, req = null) {
    this.validatePropertyScope(user, id);

    const property = await this.getPropertyById(id);

    if (data.code && data.code.trim().toUpperCase() !== property.code) {
      const existing = await PropertiesRepository.findByCode(data.code.trim().toUpperCase());
      if (existing && String(existing.id) !== String(id)) {
        throw new ConflictError(`Property code '${data.code.toUpperCase()}' is already in use by another property.`);
      }
    }

    await PropertiesRepository.update(id, {
      ...data,
      updated_by: user?.id || null,
    });

    const updated = await PropertiesRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'PROPERTY_UPDATED',
      entityType: 'property',
      entityId: String(id),
      oldValues: { name: property.name, address: property.address, status: property.status },
      newValues: { name: updated.name, address: updated.address, status: updated.status },
    });

    return updated;
  }

  /**
   * Update property status (ACTIVE, INACTIVE, MAINTENANCE, ARCHIVED)
   */
  static async updatePropertyStatus(id, status, user, req = null) {
    this.validatePropertyScope(user, id);

    const property = await this.getPropertyById(id);
    const validStatuses = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ARCHIVED'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid property status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // If deactivating or archiving, verify active reservations
    if (['INACTIVE', 'ARCHIVED'].includes(status)) {
      const activeCount = await PropertiesRepository.getActiveReservationsCount(id);
      if (activeCount > 0) {
        throw new ConflictError(
          `Cannot deactivate Property #${id} (${property.name}). There are ${activeCount} active upcoming reservation(s) assigned to this property.`
        );
      }
    }

    await PropertiesRepository.update(id, {
      status,
      is_archived: status === 'ARCHIVED',
      updated_by: user?.id || null,
    });

    const updated = await PropertiesRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'PROPERTY_STATUS_UPDATED',
      entityType: 'property',
      entityId: String(id),
      oldValues: { status: property.status },
      newValues: { status: updated.status },
    });

    return updated;
  }

  /**
   * Get units for property
   */
  static async getPropertyApartments(propertyId, user = null) {
    if (user) {
      this.validatePropertyScope(user, propertyId);
    }
    await this.getPropertyById(propertyId);
    return PropertiesRepository.getApartmentsByPropertyId(propertyId);
  }
}

module.exports = PropertiesService;
