const { z } = require('zod');
const ReservationsRepository = require('../../reservations/reservations.repository');
const ReservationsService = require('../../reservations/reservations.service');
const { NotFoundError, ForbiddenError } = require('../../../core/errors/apiError');

module.exports = {
  actionId: 'reservations.get_details',
  description: 'Retrieve reservation details when caller has permission and matching property scope.',
  category: 'RESERVATIONS',
  classification: 'READ',
  riskLevel: 'LOW',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
  requiredCapability: null,
  requiresConfirmation: false,
  requiresDualApproval: false,

  inputSchema: z
    .object({
      reservationId: z.coerce.number().int().positive({ message: 'reservationId must be a positive integer' }).optional(),
      reservationCode: z.string().min(3).max(50).optional(),
    })
    .strict()
    .refine((data) => Boolean(data.reservationId || data.reservationCode), {
      message: 'Either reservationId or reservationCode must be provided',
    }),

  propertyScoping: {
    mode: 'INFERRED_FROM_RECORD',
  },

  summaryBuilder: (params) =>
    `Retrieve details for reservation ${params.reservationCode || '#' + params.reservationId}`,

  async execute({ params, user }) {
    let reservation = null;
    if (params.reservationId) {
      reservation = await ReservationsRepository.findById(params.reservationId);
    } else if (params.reservationCode) {
      const basic = await ReservationsRepository.findByCode(params.reservationCode);
      if (basic) {
        reservation = await ReservationsRepository.findById(basic.id);
      }
    }

    if (!reservation) {
      const identifier = params.reservationCode || `#${params.reservationId}`;
      throw new NotFoundError(`Reservation with identifier ${identifier} not found.`);
    }

    const userRole = (user.role || '').toUpperCase();

    // Agent data isolation
    if (userRole === 'AGENT') {
      if (!user.agentId || parseInt(user.agentId, 10) !== parseInt(reservation.agent_id, 10)) {
        throw new NotFoundError(`Reservation with ID ${params.reservationId} not found.`);
      }
    }

    // Property-level scoping for Owners, Managers, Receptionists, Staff
    if (['OWNER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(userRole) && user.propertyId) {
      if (parseInt(user.propertyId, 10) !== parseInt(reservation.property_id, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization for reservations in this property.');
      }
    }

    const isStaff = userRole === 'STAFF';

    return {
      id: reservation.id,
      reservationCode: reservation.reservation_code,
      guestName: reservation.tenant_name,
      guestEmail: reservation.tenant_email,
      guestPhone: reservation.tenant_phone,
      propertyId: reservation.property_id,
      propertyName: reservation.property_name,
      apartmentId: reservation.apartment_id,
      unitNumber: reservation.unit_number,
      unitName: reservation.unit_name,
      checkInDate: reservation.check_in_date,
      checkOutDate: reservation.check_out_date,
      nights: reservation.nights,
      // Field-level data isolation: Staff is barred from financial details
      totalAmount: isStaff ? undefined : parseFloat(reservation.total_amount),
      paidAmount: isStaff ? undefined : parseFloat(reservation.paid_amount || 0),
      outstandingBalance: isStaff ? undefined : Math.max(0, parseFloat(reservation.total_amount) - parseFloat(reservation.paid_amount || 0)),
      status: reservation.status,
      paymentStatus: isStaff ? undefined : reservation.payment_status,
      paymentMethod: isStaff ? undefined : reservation.payment_method,
      source: reservation.source,
      specialRequests: reservation.special_requests,
      createdAt: reservation.created_at,
    };
  },
};
