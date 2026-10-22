const { z } = require('zod');
const FrontOfficeService = require('../../frontOffice/frontOffice.service');
const { ForbiddenError } = require('../../../core/errors/apiError');

module.exports = {
  actionId: 'operations.get_today_departures',
  description: "Retrieve today's departing reservations within the caller's authorized property scope.",
  category: 'OPERATIONS',
  classification: 'READ',
  riskLevel: 'LOW',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'OWNER'],
  requiredCapability: null,
  requiresConfirmation: false,
  requiresDualApproval: false,

  inputSchema: z
    .object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
        .optional(),
      propertyId: z.coerce.number().int().positive().optional(),
    })
    .strict(),

  propertyScoping: {
    mode: 'USER_RESTRICTED',
  },

  summaryBuilder: (params) => `Retrieve departures for ${params.date || 'today'}`,

  async execute({ params, user, context }) {
    const today = new Date().toISOString().split('T')[0];
    const date = params.date || today;

    // Server-side property isolation (applies to all property-scoped roles)
    let effectivePropertyId = null;
    const userRole = (user.role || '').toUpperCase();
    if (['MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'].includes(userRole) && user.propertyId) {
      if (params.propertyId && parseInt(params.propertyId, 10) !== parseInt(user.propertyId, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization for another property.');
      }
      effectivePropertyId = user.propertyId;
    } else if (params.propertyId) {
      effectivePropertyId = params.propertyId;
    }

    const departures = await FrontOfficeService.getDepartures(
      { propertyId: effectivePropertyId, date },
      context.req
    );

    return departures.map((dep) => ({
      reservationId: dep.id,
      reservationCode: dep.reservation_code,
      guestName: dep.guest_name || dep.tenant_name,
      guestPhone: dep.guest_phone || dep.tenant_phone,
      propertyName: dep.property_name,
      propertyId: dep.property_id,
      unitNumber: dep.unit_number,
      unitName: dep.unit_name,
      checkInDate: dep.check_in_date,
      checkOutDate: dep.check_out_date,
      status: dep.status,
      paymentStatus: dep.payment_status,
      outstandingBalance: dep.outstanding_balance,
    }));
  },
};
