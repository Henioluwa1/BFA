const { z } = require('zod');
const pool = require('../../../db/pool');
const { ForbiddenError } = require('../../../core/errors/apiError');

/**
 * Action: apartments.list_available
 * Lists all apartments that are available for at least one night on a given date.
 * Respects property scoping and the 1-night maximum stay rule.
 */
module.exports = {
  actionId: 'apartments.list_available',
  description: 'List all apartments available for booking on a specified date, respecting property scope and booking rules.',
  category: 'RESERVATIONS',
  classification: 'READ',
  riskLevel: 'LOW',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
  requiredCapability: 'PUBLIC_AVAILABILITY',
  requiresConfirmation: false,
  requiresDualApproval: false,

  inputSchema: z
    .object({
      checkInDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'checkInDate must be in YYYY-MM-DD format'),
      propertyId: z.coerce.number().int().positive().optional(),
    })
    .strict(),

  propertyScoping: {
    mode: 'USER_RESTRICTED',
  },

  summaryBuilder: (params) =>
    `List available apartments for ${params.checkInDate}${params.propertyId ? ` in property #${params.propertyId}` : ''}`,

  async execute({ params, user }) {
    const userRole = (user.role || '').toUpperCase();

    // Server-side property isolation
    let effectivePropertyId = null;
    if (['OWNER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(userRole) && user.propertyId) {
      if (params.propertyId && parseInt(params.propertyId, 10) !== parseInt(user.propertyId, 10)) {
        throw new ForbiddenError('Access denied: You are not authorized to query apartments in another property.');
      }
      effectivePropertyId = user.propertyId;
    } else if (params.propertyId) {
      effectivePropertyId = params.propertyId;
    }

    // Compute check-out date enforcing 1-night maximum stay
    const checkInParts = params.checkInDate.split('-');
    const checkInDateObj = new Date(
      parseInt(checkInParts[0], 10),
      parseInt(checkInParts[1], 10) - 1,
      parseInt(checkInParts[2], 10)
    );
    const checkOutDateObj = new Date(checkInDateObj);
    checkOutDateObj.setDate(checkOutDateObj.getDate() + 1);
    const checkOutDate = checkOutDateObj.toISOString().split('T')[0];

    // Query: apartments that are AVAILABLE and not conflicting with reservations on the date
    // or maintenance blocks. Uses the same logic as single-apartment availability.
    let sql = `
      SELECT
        a.id,
        a.unit_number,
        a.unit_name,
        a.unit_type,
        a.status,
        a.rate_per_night,
        a.property_id,
        p.name AS property_name,
        p.code AS property_code,
        a.floor,
        a.bedroom_count,
        a.bathroom_count,
        a.amenities,
        a.notes
      FROM apartments a
      JOIN properties p ON p.id = a.property_id
      WHERE a.status = 'AVAILABLE'
        AND p.status = 'ACTIVE'
    `;
    const queryParams = [];

    if (effectivePropertyId) {
      sql += ' AND a.property_id = ?';
      queryParams.push(effectivePropertyId);
    }

    // Exclude apartments with conflicting active reservations on the requested night
    sql += `
      AND a.id NOT IN (
        SELECT DISTINCT r.apartment_id
        FROM reservations r
        WHERE r.status NOT IN ('CANCELLED', 'NO_SHOW')
          AND r.check_in_date < ?
          AND r.check_out_date > ?
      )
    `;
    queryParams.push(checkOutDate, params.checkInDate);

    sql += ' ORDER BY p.name ASC, a.unit_number ASC';

    const apartments = await pool.query(sql, queryParams);

    // Sanitize: never expose internal IDs beyond what the UI needs
    const sanitized = apartments.map((apt) => {
      let parsedAmenities = [];
      if (apt.amenities) {
        if (Array.isArray(apt.amenities)) {
          parsedAmenities = apt.amenities;
        } else if (typeof apt.amenities === 'string') {
          try {
            parsedAmenities = JSON.parse(apt.amenities);
          } catch {
            parsedAmenities = apt.amenities.split(',').map((s) => s.trim());
          }
        }
      }

      const base = {
        apartmentId: apt.id,
        unitNumber: apt.unit_number,
        unitName: apt.unit_name || apt.unit_number,
        unitType: apt.unit_type,
        status: apt.status,
        floor: apt.floor || null,
        bedrooms: apt.bedroom_count || 1,
        bathrooms: apt.bathroom_count || 1,
        amenities: Array.isArray(parsedAmenities) ? parsedAmenities : [],
        description: apt.notes || null,
        checkInDate: params.checkInDate,
        checkOutDate,
        nights: 1,
      };

      // Financial data: only show to roles that can see pricing
      if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'].includes(userRole)) {
        base.ratePerNight = parseFloat(apt.rate_per_night) || null;
        base.totalAmount = base.ratePerNight !== null ? base.ratePerNight * 1 : null;
        base.currency = 'NGN';
      }

      // Property info: show to non-guest roles
      base.propertyName = apt.property_name;
      base.propertyCode = apt.property_code;
      base.propertyId = apt.property_id;

      return base;
    });

    return {
      apartments: sanitized,
      total: sanitized.length,
      checkInDate: params.checkInDate,
      checkOutDate,
      nights: 1,
      propertyId: effectivePropertyId || null,
    };
  },
};
