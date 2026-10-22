const { z } = require('zod');
const FinancialService = require('../../financial/financial.service');
const { ForbiddenError } = require('../../../core/errors/apiError');

module.exports = {
  actionId: 'financial.summarize_outstanding_payments',
  description: "Summarize outstanding receivables and pending payments within caller's authorized property scope.",
  category: 'FINANCIAL',
  classification: 'READ',
  riskLevel: 'MEDIUM',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
  requiredCapability: null,
  requiresConfirmation: false,
  requiresDualApproval: false,

  inputSchema: z
    .object({
      propertyId: z.coerce.number().int().positive().optional(),
      fromDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'fromDate must be in YYYY-MM-DD format')
        .optional(),
      toDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'toDate must be in YYYY-MM-DD format')
        .optional(),
    })
    .strict(),

  propertyScoping: {
    mode: 'USER_RESTRICTED',
  },

  summaryBuilder: (params) =>
    `Summarize outstanding payments${params.propertyId ? ` for property #${params.propertyId}` : ''}`,

  async execute({ params, user }) {
    const userRole = (user.role || '').toUpperCase();

    // Enforce server-side property isolation for Manager and Scoped Owner
    let effectivePropertyId = null;
    if (['OWNER', 'MANAGER'].includes(userRole) && user.propertyId) {
      if (params.propertyId && parseInt(params.propertyId, 10) !== parseInt(user.propertyId, 10)) {
        throw new ForbiddenError('Access denied: You do not have authorization to view financials for another property.');
      }
      effectivePropertyId = user.propertyId;
    } else if (params.propertyId) {
      effectivePropertyId = params.propertyId;
    }

    const overview = await FinancialService.getOverview({
      propertyId: effectivePropertyId,
      fromDate: params.fromDate,
      toDate: params.toDate,
      user,
    });

    const kpis = overview.kpis || {};

    return {
      propertyId: effectivePropertyId || 'all',
      grossCollected: kpis.grossCollected || 0,
      totalRefunded: kpis.totalRefunded || 0,
      netRevenue: kpis.netRevenue || 0,
      bookedRevenue: kpis.bookedRevenue || 0,
      outstandingReceivables: kpis.outstandingReceivables || 0,
      pendingPayments: kpis.pendingPayments || 0,
      approvedExpenses: kpis.approvedExpenses || 0,
      pendingExpenses: kpis.pendingExpenses || 0,
      currency: kpis.currency || 'NGN',
    };
  },
};
