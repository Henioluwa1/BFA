const { z } = require('zod');
const ReservationsService = require('../../reservations/reservations.service');
const ApartmentsRepository = require('../../apartments/apartments.repository');
const { ValidationError, ForbiddenError, NotFoundError } = require('../../../core/errors/apiError');

module.exports = {
  actionId: 'reservations.create',
  description: 'Create a reservation through the authoritative reservation engine under BFA one-night maximum policy.',
  category: 'RESERVATIONS',
  classification: 'WRITE',
  riskLevel: 'HIGH',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT'],
  requiredCapability: 'MANUAL_RESERVATION',
  requiresConfirmation: true,
  requiresDualApproval: false,

  inputSchema: z
    .object({
      apartmentId: z.coerce.number().int().positive({ message: 'apartmentId must be a positive integer' }),
      tenantName: z
        .string()
        .min(2, 'Guest name must be at least 2 characters')
        .max(100, 'Guest name cannot exceed 100 characters'),
      tenantEmail: z.string().email('Valid guest email is required'),
      tenantPhone: z
        .string()
        .min(7, 'Guest phone must be at least 7 characters')
        .max(25, 'Guest phone cannot exceed 25 characters'),
      checkInDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'checkInDate must be in YYYY-MM-DD format'),
      checkOutDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'checkOutDate must be in YYYY-MM-DD format'),
      paymentMethod: z
        .enum(['CASH', 'POS', 'TRANSFER', 'CARD', 'ONLINE'])
        .default('TRANSFER'),
      specialRequests: z.string().max(500).optional(),
    })
    .strict()
    .refine(
      (data) => {
        const dIn = new Date(data.checkInDate);
        const dOut = new Date(data.checkOutDate);
        const diffDays = Math.round((dOut - dIn) / (1000 * 60 * 60 * 24));
        return diffDays === 1;
      },
      {
        message: 'BFA Business Rule Violation: Reservations are strictly limited to exactly 1 night.',
        path: ['checkOutDate'],
      }
    ),

  propertyScoping: {
    mode: 'INFERRED_FROM_RECORD',
  },

  summaryBuilder: (params) =>
    `Create reservation for ${params.tenantName} in apartment #${params.apartmentId} for ${params.checkInDate}`,

  /**
   * Pre-validation executed when action is proposed
   */
  async preValidate({ params, user }) {
    const apartment = await ApartmentsRepository.findById(params.apartmentId);
    if (!apartment) {
      throw new NotFoundError(`Apartment with ID ${params.apartmentId} not found.`);
    }

    const userRole = (user.role || '').toUpperCase();
    if (['OWNER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(userRole) && user.propertyId) {
      if (parseInt(user.propertyId, 10) !== parseInt(apartment.property_id, 10)) {
        throw new ForbiddenError(
          'Access denied: You are not authorized to create reservations for this property.'
        );
      }
    }

    // Agent dynamic capability check
    if (userRole === 'AGENT') {
      const AccessControlService = require('../../../core/access/accessControl.service');
      const agentCap = await AccessControlService.canAccess(user, 'AGENT_BOOKING');
      if (!agentCap.allowed) {
        throw new ForbiddenError(`Access denied: Capability 'AGENT_BOOKING' is restricted (${agentCap.reason || 'disabled'}).`);
      }
    }

    // Pre-check availability
    const avail = await ReservationsService.checkAvailability({
      apartmentId: params.apartmentId,
      checkInDate: params.checkInDate,
    });

    if (!avail.isAvailable) {
      throw new ValidationError(avail.reason || 'Apartment is not available for the requested date.');
    }

    return {
      propertyId: apartment.property_id,
      propertyName: apartment.property_name,
      unitName: apartment.unit_name,
      ratePerNight: parseFloat(avail.ratePerNight),
      totalAmount: parseFloat(avail.totalAmount),
    };
  },

  /**
   * Authoritative execution executed upon confirmed proposal
   */
  async execute({ params, user, context }) {
    // 1. Re-validate apartment and property scoping at execution time
    const apartment = await ApartmentsRepository.findById(params.apartmentId);
    if (!apartment) {
      throw new NotFoundError(`Apartment with ID ${params.apartmentId} not found.`);
    }

    const userRole = (user.role || '').toUpperCase();
    if (['OWNER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(userRole) && user.propertyId) {
      if (parseInt(user.propertyId, 10) !== parseInt(apartment.property_id, 10)) {
        throw new ForbiddenError(
          'Access denied: You are not authorized to create reservations for this property.'
        );
      }
    }

    // Agent source tagging
    const isAgent = userRole === 'AGENT';
    const source = isAgent ? 'AGENT' : 'DIRECT';
    const agentId = isAgent ? user.agentId : null;

    const confirmationToken = context.confirmation?.confirmation_token || null;

    // 2. Delegate to authoritative centralized ReservationsService (handles row-level lock and transaction)
    const newReservation = await ReservationsService.createReservation(
      {
        apartment_id: params.apartmentId,
        tenant_name: params.tenantName,
        tenant_email: params.tenantEmail,
        tenant_phone: params.tenantPhone,
        check_in_date: params.checkInDate,
        check_out_date: params.checkOutDate,
        payment_method: params.paymentMethod,
        special_requests: params.specialRequests,
        confirmation_token: confirmationToken,
        source,
        agent_id: agentId,
      },
      context.req
    );

    return {
      reservationId: newReservation.id,
      reservationCode: newReservation.reservation_code,
      guestName: newReservation.tenant_name,
      guestEmail: newReservation.tenant_email,
      propertyName: newReservation.property_name,
      unitName: newReservation.unit_name,
      unitNumber: newReservation.unit_number,
      checkInDate: newReservation.check_in_date,
      checkOutDate: newReservation.check_out_date,
      nights: 1,
      totalAmount: parseFloat(newReservation.total_amount),
      status: newReservation.status,
      paymentStatus: newReservation.payment_status,
      paymentMethod: newReservation.payment_method,
      createdAt: newReservation.created_at,
    };
  },
};
