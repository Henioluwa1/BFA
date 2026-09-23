const GuestsRepository = require('./guests.repository');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');

class GuestsService {
  /**
   * List all guests with filtering
   */
  static async listGuests(params, req = null) {
    return GuestsRepository.findAll({
      ...params,
      user: req?.user,
    });
  }

  /**
   * Get guest profile by ID
   */
  static async getGuestById(id, req = null) {
    const guest = await GuestsRepository.findById(id);
    if (!guest) {
      throw new NotFoundError(`Guest #${id} not found.`);
    }

    // Agent isolation check: if agent, can only access if they have reservations with this guest
    if (req?.user?.role === 'AGENT') {
      const hasAgentReservation = (guest.reservations || []).some(
        (r) => r.agent_id === req.user.agentId
      );
      if (!hasAgentReservation) {
        throw new ForbiddenError('Access denied: You are not authorized to view this guest profile.');
      }
    }

    return guest;
  }

  /**
   * Create new guest
   */
  static async createGuest(data, req = null) {
    if (!data.email || !data.phone) {
      throw new ValidationError('Email and phone number are required for guest profile.');
    }

    const cleanEmail = data.email.trim().toLowerCase();
    const existing = await GuestsRepository.findByEmail(cleanEmail);
    if (existing) {
      throw new ConflictError(`A guest with email '${cleanEmail}' already exists (ID: #${existing.id}).`);
    }

    const firstName = (data.first_name || '').trim();
    const lastName = (data.last_name || '').trim();
    const displayName = (data.display_name || `${firstName} ${lastName}`).trim();

    if (!displayName) {
      throw new ValidationError('Guest name is required.');
    }

    const guestId = await GuestsRepository.create({
      first_name: firstName || displayName.split(' ')[0] || 'Guest',
      last_name: lastName || displayName.split(' ').slice(1).join(' ') || 'Tenant',
      display_name: displayName,
      email: cleanEmail,
      phone: data.phone.trim(),
      address: data.address,
      city: data.city || 'Lagos',
      country: data.country || 'Nigeria',
      nationality: data.nationality || 'Nigerian',
      identification_type: data.identification_type,
      identification_number: data.identification_number,
      emergency_contact_name: data.emergency_contact_name,
      emergency_contact_phone: data.emergency_contact_phone,
      notes: data.notes,
      status: data.status || 'ACTIVE',
      created_by: req?.user?.id || null,
    });

    await AuditService.record({
      req,
      action: 'GUEST_CREATED',
      entityType: 'guest',
      entityId: guestId,
      newValues: {
        name: displayName,
        email: cleanEmail,
        phone: data.phone.trim(),
        status: data.status || 'ACTIVE',
      },
    });

    return GuestsRepository.findById(guestId);
  }

  /**
   * Update existing guest
   */
  static async updateGuest(id, data, req = null) {
    const existing = await GuestsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Guest #${id} not found.`);
    }

    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      if (cleanEmail !== existing.email.toLowerCase()) {
        const duplicate = await GuestsRepository.findByEmail(cleanEmail);
        if (duplicate && duplicate.id !== parseInt(id, 10)) {
          throw new ConflictError(`Email '${cleanEmail}' is already registered to Guest #${duplicate.id}.`);
        }
      }
    }

    await GuestsRepository.update(id, data);

    await AuditService.record({
      req,
      action: 'GUEST_UPDATED',
      entityType: 'guest',
      entityId: id,
      oldValues: {
        name: existing.display_name,
        email: existing.email,
        status: existing.status,
      },
      newValues: data,
    });

    return GuestsRepository.findById(id);
  }

  /**
   * Get potential duplicate guest profiles
   */
  static async getDuplicates() {
    return GuestsRepository.findDuplicates();
  }

  /**
   * Merge duplicate profile into primary profile
   */
  static async mergeProfiles(primaryId, duplicateId, req = null) {
    if (parseInt(primaryId, 10) === parseInt(duplicateId, 10)) {
      throw new ValidationError('Cannot merge a guest profile into itself.');
    }

    const primary = await GuestsRepository.findById(primaryId);
    const duplicate = await GuestsRepository.findById(duplicateId);

    if (!primary || !duplicate) {
      throw new NotFoundError('One or both guest profiles not found.');
    }

    await GuestsRepository.mergeGuests(primaryId, duplicateId, req?.user?.id);

    await AuditService.record({
      req,
      action: 'GUEST_MERGED',
      entityType: 'guest',
      entityId: primaryId,
      newValues: {
        primaryGuestId: primaryId,
        mergedDuplicateId: duplicateId,
        duplicateName: duplicate.display_name,
        duplicateEmail: duplicate.email,
      },
    });

    return GuestsRepository.findById(primaryId);
  }
}

module.exports = GuestsService;
