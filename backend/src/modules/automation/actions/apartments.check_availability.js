const { z } = require('zod');
const ReservationsService = require('../../reservations/reservations.service');
const ApartmentsRepository = require('../../apartments/apartments.repository');
const { NotFoundError, ForbiddenError } = require('../../../core/errors/apiError');

module.exports = {
  actionId: 'apartments.check_availability',
  description: 'Query apartment availability using existing booking rules and one-night maximum policy.',
  category: 'RESERVATIONS',
  classification: 'READ',
  riskLevel: 'LOW',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
  requiredCapability: 'PUBLIC_AVAILABILITY',
  requiresConfirmation: false,
  requiresDualApproval: false,

  inputSchema: z
    .object({
      apartmentId: z.coerce.number().int().positive({ message: 'apartmentId must be a positive integer' }),
      checkInDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'checkInDate must be in YYYY-MM-DD format'),
    })
    .strict(),

  propertyScoping: {
    mode: 'INFERRED_FROM_RECORD',
  },

  summaryBuilder: (params) => `Check availability for apartment #${params.apartmentId} on ${params.checkInDate}`,

  async execute({ params, user }) {
    // 1. Fetch apartment to check property scope
    const apartment = await ApartmentsRepository.findById(params.apartmentId);
    if (!apartment) {
      throw new NotFoundError(`Apartment with ID ${params.apartmentId} not found.`);
    }

    // 2. Validate property scope for scoped roles
    const userRole = (user.role || '').toUpperCase();
    if (['OWNER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(userRole) && user.propertyId) {
      if (parseInt(user.propertyId, 10) !== parseInt(apartment.property_id, 10)) {
        throw new ForbiddenError('Access denied: You are not authorized to query apartments in this property.');
      }
    }

    // 3. Delegate to central ReservationsService (enforcing 1-night rule and blocked periods)
    const availability = await ReservationsService.checkAvailability({
      apartmentId: params.apartmentId,
      checkInDate: params.checkInDate,
    });

    return {
      isAvailable: availability.isAvailable,
      apartmentId: availability.apartment.id,
      unitName: availability.apartment.unit_name,
      unitNumber: availability.apartment.unit_number,
      propertyName: availability.apartment.property_name,
      propertyId: availability.apartment.property_id,
      ratePerNight: parseFloat(availability.ratePerNight),
      checkInDate: availability.checkInDate,
      checkOutDate: availability.checkOutDate,
      nights: availability.nights,
      totalAmount: parseFloat(availability.totalAmount),
      reason: availability.reason || null,
    };
  },
};
