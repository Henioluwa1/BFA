const ApartmentsRepository = require('./apartments.repository');
const PropertiesRepository = require('../properties/properties.repository');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');

const VALID_OPERATIONAL_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'OCCUPIED',
  'DIRTY',
  'CLEANING',
  'READY',
  'MAINTENANCE',
  'BLOCKED',
  'OUT_OF_SERVICE',
];

class ApartmentsService {
  /**
   * Validate user's property scope
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return;
    }
    if (user.propertyId && String(user.propertyId) !== String(propertyId)) {
      throw new ForbiddenError(`You are only authorized to manage units in Property #${user.propertyId}.`);
    }
  }

  /**
   * List apartments with filters & server-side pagination
   */
  static async listApartments(filters = {}) {
    return ApartmentsRepository.findAll(filters);
  }

  /**
   * Get unit by ID with property and reservation context
   */
  static async getApartmentById(id, user = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    if (user) {
      this.validatePropertyScope(user, unit.property_id);
    }

    const reservations = await ApartmentsRepository.getUnitReservations(id);
    return {
      ...unit,
      reservations,
    };
  }

  /**
   * Create new apartment unit
   */
  static async createApartment(data, user, req = null) {
    if (!data.property_id || !data.unit_number || !data.unit_name) {
      throw new ValidationError('Property ID, unit number, and unit name are required.');
    }

    this.validatePropertyScope(user, data.property_id);

    // Verify property exists
    const property = await PropertiesRepository.findById(data.property_id);
    if (!property) {
      throw new NotFoundError(`Property #${data.property_id} does not exist.`);
    }

    // Verify unit number unique within this property
    const existing = await ApartmentsRepository.findByPropertyAndUnitNumber(
      data.property_id,
      data.unit_number
    );
    if (existing) {
      throw new ConflictError(
        `Unit number '${data.unit_number}' already exists in ${property.name}.`
      );
    }

    const newId = await ApartmentsRepository.create({
      ...data,
      created_by: user?.id || null,
    });

    const created = await ApartmentsRepository.findById(newId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'UNIT_CREATED',
      entityType: 'unit',
      entityId: String(newId),
      newValues: {
        id: newId,
        unitNumber: created.unit_number,
        unitName: created.unit_name,
        propertyId: created.property_id,
        unitType: created.unit_type,
        ratePerNight: created.rate_per_night,
      },
    });

    return created;
  }

  /**
   * Update apartment unit
   */
  static async updateApartment(id, data, user, req = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    this.validatePropertyScope(user, unit.property_id);

    if (data.property_id && data.property_id !== unit.property_id) {
      this.validatePropertyScope(user, data.property_id);
    }

    // If unit number or property changed, verify uniqueness
    const targetPropertyId = data.property_id || unit.property_id;
    const targetUnitNumber = data.unit_number || unit.unit_number;
    if (
      String(targetPropertyId) !== String(unit.property_id) ||
      String(targetUnitNumber) !== String(unit.unit_number)
    ) {
      const conflict = await ApartmentsRepository.findByPropertyAndUnitNumber(
        targetPropertyId,
        targetUnitNumber
      );
      if (conflict && String(conflict.id) !== String(id)) {
        throw new ConflictError(
          `Unit number '${targetUnitNumber}' already exists in Property #${targetPropertyId}.`
        );
      }
    }

    await ApartmentsRepository.update(id, {
      ...data,
      updated_by: user?.id || null,
    });

    const updated = await ApartmentsRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'UNIT_UPDATED',
      entityType: 'unit',
      entityId: String(id),
      oldValues: { unitName: unit.unit_name, unitNumber: unit.unit_number, rate: unit.rate_per_night },
      newValues: { unitName: updated.unit_name, unitNumber: updated.unit_number, rate: updated.rate_per_night },
    });

    return updated;
  }

  /**
   * Update operational status of apartment unit
   */
  static async updateApartmentStatus(id, status, user, req = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    this.validatePropertyScope(user, unit.property_id);

    const normalizedStatus = String(status).toUpperCase();
    if (!VALID_OPERATIONAL_STATUSES.includes(normalizedStatus)) {
      throw new ValidationError(
        `Invalid unit status '${status}'. Must be one of: ${VALID_OPERATIONAL_STATUSES.join(', ')}`
      );
    }

    await ApartmentsRepository.updateStatus(id, normalizedStatus, user?.id || null);
    const updated = await ApartmentsRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'UNIT_STATUS_UPDATED',
      entityType: 'unit',
      entityId: String(id),
      oldValues: { status: unit.status },
      newValues: { status: updated.status },
    });

    return updated;
  }

  /**
   * Check unit availability for requested check-in date
   */
  static async checkAvailability(id, checkInDate) {
    if (!checkInDate) {
      throw new ValidationError('checkInDate is required in YYYY-MM-DD format.');
    }
    return ApartmentsRepository.checkAvailability(id, checkInDate);
  }
}

module.exports = ApartmentsService;
