const InspectionsRepository = require('./inspections.repository');
const ReservationsRepository = require('../reservations/reservations.repository');
const ApartmentsRepository = require('../apartments/apartments.repository');
const PropertiesRepository = require('../properties/properties.repository');
const AuditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');

class InspectionsService {
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
   * List inspections with filtering
   */
  static async listInspections(params, req = null) {
    return InspectionsRepository.findAll({
      ...params,
      user: req?.user,
    });
  }

  /**
   * Get inspection by ID
   */
  static async getInspectionById(id, req = null) {
    const inspection = await InspectionsRepository.findById(id);
    if (!inspection) {
      throw new NotFoundError(`Inspection #${id} not found.`);
    }

    this.validatePropertyScope(req?.user, inspection.property_id);
    return inspection;
  }

  /**
   * Create new inspection
   */
  static async createInspection(data, req = null) {
    let propertyId = data.property_id;
    let apartmentId = data.apartment_id;
    let guestId = data.guest_id || null;

    // 1. If reservation linked, cross-verify entity integrity
    if (data.reservation_id) {
      const reservation = await ReservationsRepository.findById(data.reservation_id);
      if (!reservation) {
        throw new NotFoundError(`Reservation #${data.reservation_id} not found.`);
      }

      propertyId = reservation.property_id;
      apartmentId = reservation.apartment_id;
      guestId = reservation.guest_id || null;

      // Verify frontend didn't supply mismatched property or apartment IDs
      if (data.property_id && parseInt(data.property_id, 10) !== reservation.property_id) {
        throw new ValidationError('Data Integrity Violation: Provided property_id does not match reservation property.');
      }
      if (data.apartment_id && parseInt(data.apartment_id, 10) !== reservation.apartment_id) {
        throw new ValidationError('Data Integrity Violation: Provided apartment_id does not match reservation unit.');
      }
    }

    if (!propertyId || !apartmentId) {
      throw new ValidationError('property_id and apartment_id are required.');
    }

    // 2. Validate property scope
    this.validatePropertyScope(req?.user, propertyId);

    // 3. Verify apartment belongs to property
    const apartment = await ApartmentsRepository.findById(apartmentId);
    if (!apartment) {
      throw new NotFoundError(`Apartment #${apartmentId} not found.`);
    }
    if (parseInt(apartment.property_id, 10) !== parseInt(propertyId, 10)) {
      throw new ValidationError('Data Integrity Violation: Selected unit does not belong to specified property.');
    }

    // 4. Generate unique inspection code
    const property = await PropertiesRepository.findById(propertyId);
    const propCode = property?.code || 'BFA';
    const inspectionCode = `INSP-${propCode}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

    const inspectorId = data.inspector_id ? parseInt(data.inspector_id, 10) : req?.user?.id || 1;
    const scheduledDate = data.scheduled_date || new Date().toISOString().split('T')[0];

    const inspectionId = await InspectionsRepository.create({
      inspection_code: inspectionCode,
      reservation_id: data.reservation_id ? parseInt(data.reservation_id, 10) : null,
      guest_id: guestId ? parseInt(guestId, 10) : null,
      property_id: parseInt(propertyId, 10),
      apartment_id: parseInt(apartmentId, 10),
      inspector_id: inspectorId,
      inspection_type: data.inspection_type || 'CHECKOUT',
      condition_rating: data.condition_rating || 'GOOD',
      damage_items: data.damage_items || [],
      missing_items: data.missing_items || [],
      notes: data.notes || null,
      evidence: data.evidence || [],
      status: data.status || 'DRAFT',
      scheduled_date: scheduledDate,
      created_by: req?.user?.id || null,
    });

    await AuditService.record({
      req,
      action: 'INSPECTION_CREATED',
      entityType: 'inspection',
      entityId: inspectionId,
      newValues: {
        code: inspectionCode,
        propertyId,
        apartmentId,
        type: data.inspection_type || 'CHECKOUT',
        condition: data.condition_rating || 'GOOD',
        status: data.status || 'DRAFT',
      },
    });

    return InspectionsRepository.findById(inspectionId);
  }

  /**
   * Update inspection
   */
  static async updateInspection(id, data, req = null) {
    const existing = await InspectionsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Inspection #${id} not found.`);
    }

    this.validatePropertyScope(req?.user, existing.property_id);

    if (existing.status === 'COMPLETED' && data.status && data.status !== 'COMPLETED' && data.status !== 'FOLLOW_UP') {
      throw new ValidationError('Cannot revert a completed inspection back to draft or in-progress.');
    }

    await InspectionsRepository.update(id, {
      ...data,
      updated_by: req?.user?.id || null,
    });

    await AuditService.record({
      req,
      action: 'INSPECTION_UPDATED',
      entityType: 'inspection',
      entityId: id,
      oldValues: {
        status: existing.status,
        condition: existing.condition_rating,
      },
      newValues: data,
    });

    return InspectionsRepository.findById(id);
  }

  /**
   * Complete inspection workflow
   */
  static async completeInspection(id, data = {}, req = null) {
    const existing = await InspectionsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Inspection #${id} not found.`);
    }

    this.validatePropertyScope(req?.user, existing.property_id);

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const conditionRating = data.condition_rating || existing.condition_rating || 'GOOD';
    const finalStatus = conditionRating === 'DAMAGED' || conditionRating === 'POOR' ? 'FOLLOW_UP' : 'COMPLETED';

    await InspectionsRepository.update(id, {
      condition_rating: conditionRating,
      damage_items: data.damage_items !== undefined ? data.damage_items : existing.damage_items,
      missing_items: data.missing_items !== undefined ? data.missing_items : existing.missing_items,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      evidence: data.evidence !== undefined ? data.evidence : existing.evidence,
      status: finalStatus,
      completed_at: nowStr,
      updated_by: req?.user?.id || null,
    });

    await AuditService.record({
      req,
      action: 'INSPECTION_COMPLETED',
      entityType: 'inspection',
      entityId: id,
      newValues: {
        conditionRating,
        status: finalStatus,
        completedAt: nowStr,
      },
    });

    // If unit is damaged or has missing items, dispatch operational alert
    if (finalStatus === 'FOLLOW_UP') {
      try {
        await NotificationsService.dispatchNotification({
          userId: req?.user?.id || 1,
          type: 'OPERATIONAL_ALERT',
          title: `Inspection Follow-Up Required: Unit ${existing.unit_number}`,
          message: `Inspection ${existing.inspection_code} completed with rating '${conditionRating}'. Damage/missing items require follow-up.`,
          metadata: { inspectionId: id, unitNumber: existing.unit_number, propertyId: existing.property_id },
        });
      } catch {
        // Handled silently
      }
    }

    return InspectionsRepository.findById(id);
  }
}

module.exports = InspectionsService;
