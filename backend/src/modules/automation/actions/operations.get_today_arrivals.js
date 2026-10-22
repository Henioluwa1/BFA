const { z } = require('zod');
const FrontOfficeService = require('../../frontOffice/frontOffice.service');
const { ForbiddenError } = require('../../../core/errors/apiError');

module.exports = {
  actionId: 'operations.get_today_arrivals',
  description: "Retrieve today's arriving reservations within the caller's authorized property scope.",
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

  summaryBuilder: (params) => `Retrieve arrivals for ${params.date || 'today'}`,

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

    const arrivals = await FrontOfficeService.getArrivals(
      { propertyId: effectivePropertyId, date },
      context.req
    );

    // Sanitize output: Never disclose guest auth codes or secrets
    return arrivals.map((arr) => ({
      reservationId: arr.id,
      reservationCode: arr.reservation_code,
      guestName: arr.guest_name || arr.tenant_name,
      guestPhone: arr.guest_phone || arr.tenant_phone,
      propertyName: arr.property_name,
      propertyId: arr.property_id,
      unitNumber: arr.unit_number,
      unitName: arr.unit_name,
      checkInDate: arr.check_in_date,
      checkOutDate: arr.check_out_date,
      status: arr.status,
      paymentStatus: arr.payment_status,
      outstandingBalance: arr.outstanding_balance,
    }));
  },
};
