const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../db/pool');
const { ValidationError, NotFoundError, ConflictError } = require('../../core/errors/apiError');
const auditService = require('../../core/audit/audit.service');
const AccessControlService = require('../../core/access/accessControl.service');
const BookingAuthService = require('../bookingAuth/bookingAuth.service');
const PaymentsService = require('../payments/payments.service');
const PricingService = require('../pricing/pricing.service');
const NotificationsService = require('../notifications/notifications.service');
const ReservationsService = require('../reservations/reservations.service');
const ReservationsRepository = require('../reservations/reservations.repository');
const { validateImageUpload } = require('../../utils/fileSignatureValidator');

// 1. Public Properties Showcase
async function getPublicProperties(req, res, next) {
  try {
    const rows = await db.query(`
      SELECT 
        p.id, 
        p.name, 
        p.code, 
        p.address, 
        p.city, 
        p.state,
        p.country,
        p.description,
        p.environment_description,
        p.category,
        p.location,
        p.district,
        p.amenities,
        p.technical_specs,
        p.check_in_time,
        p.check_out_time,
        p.status,
        (SELECT file_url FROM media_assets WHERE entity_type = 'PROPERTY' AND entity_id = p.id AND is_published = 1 ORDER BY is_primary DESC, display_order ASC, id ASC LIMIT 1) AS primary_photo_url,
        (SELECT COUNT(*) FROM media_assets WHERE entity_type = 'PROPERTY' AND entity_id = p.id AND is_published = 1) AS photo_count,
        COUNT(a.id) AS total_units,
        COUNT(CASE WHEN a.status = 'AVAILABLE' AND a.is_active = 1 AND (a.approval_status IN ('APPROVED', 'PUBLISHED') OR a.approved_snapshot IS NOT NULL) THEN a.id END) AS available_units,
        MIN(CASE WHEN a.is_active = 1 AND (a.approval_status IN ('APPROVED', 'PUBLISHED') OR a.approved_snapshot IS NOT NULL) THEN COALESCE(a.approved_rate_per_night, a.rate_per_night) END) AS starting_rate
      FROM properties p
      LEFT JOIN apartments a ON p.id = a.property_id
      WHERE p.status IN ('ACTIVE', 'PUBLISHED')
        AND (p.approval_status IN ('APPROVED', 'PUBLISHED') OR p.approved_snapshot IS NOT NULL)
        AND (p.is_archived IS NULL OR p.is_archived = FALSE)
      GROUP BY p.id
      ORDER BY p.id ASC
    `);

    const scrubbedRows = rows.map((row) => {
      const snap = row.approved_snapshot
        ? (typeof row.approved_snapshot === 'string' ? (() => { try { return JSON.parse(row.approved_snapshot); } catch { return null; } })() : row.approved_snapshot)
        : null;
      const base = (snap && !['APPROVED', 'PUBLISHED'].includes(row.approval_status)) ? { ...row, ...snap } : row;
      return {
        ...base,
        amenities: typeof base.amenities === 'string' ? (() => {
          try { return JSON.parse(base.amenities); } catch { return []; }
        })() : (base.amenities || []),
        technical_specs: typeof base.technical_specs === 'string' ? (() => {
          try { return JSON.parse(base.technical_specs); } catch { return {}; }
        })() : (base.technical_specs || {}),
      };
    });

    res.status(200).json({
      success: true,
      message: 'Active public properties retrieved.',
      data: scrubbedRows,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 2. Public Available Apartments
async function getPublicApartments(req, res, next) {
  try {
    const propertyId = req.query.propertyId ? parseInt(req.query.propertyId, 10) : null;
    const includeAll = req.query.includeAll === 'true' || req.query.all === 'true';
    const statusFilter = req.query.status;

    let sql = `
      SELECT 
        a.id, 
        a.property_id, 
        p.name AS property_name, 
        p.city,
        a.unit_number, 
        a.apartment_code,
        a.unit_name, 
        a.unit_type, 
        a.description,
        COALESCE(a.approved_rate_per_night, a.rate_per_night) AS rate_per_night,
        a.floor,
        a.capacity,
        a.bedroom_count,
        a.bathroom_count,
        a.amenities,
        a.technical_specs,
        a.status,
        (SELECT file_url FROM media_assets WHERE entity_type = 'APARTMENT' AND entity_id = a.id AND is_published = 1 ORDER BY is_primary DESC, display_order ASC, id ASC LIMIT 1) AS primary_photo_url
      FROM apartments a
      JOIN properties p ON a.property_id = p.id
      WHERE p.status IN ('ACTIVE', 'PUBLISHED')
        AND (p.approval_status IN ('APPROVED', 'PUBLISHED') OR p.approved_snapshot IS NOT NULL)
        AND (p.is_archived IS NULL OR p.is_archived = FALSE)
        AND a.is_active = 1
        AND (a.approval_status IN ('APPROVED', 'PUBLISHED') OR a.approved_snapshot IS NOT NULL)
    `;
    const params = [];

    if (statusFilter) {
      sql += ' AND a.status = ?';
      params.push(statusFilter);
    } else if (!includeAll) {
      sql += " AND a.status = 'AVAILABLE'";
    }

    if (propertyId) {
      sql += ' AND a.property_id = ?';
      params.push(propertyId);
    }
    sql += ' ORDER BY a.rate_per_night ASC, a.unit_number ASC';

    const rows = await db.query(sql, params);

    const scrubbedRows = rows.map((row) => ({
      ...row,
      apartment_code: row.apartment_code || row.unit_number,
      amenities: typeof row.amenities === 'string' ? (() => {
        try { return JSON.parse(row.amenities); } catch { return []; }
      })() : (row.amenities || []),
      technical_specs: typeof row.technical_specs === 'string' ? (() => {
        try { return JSON.parse(row.technical_specs); } catch { return {}; }
      })() : (row.technical_specs || {}),
    }));

    res.status(200).json({
      success: true,
      message: 'Available apartments retrieved.',
      data: scrubbedRows,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 2b. Public Property Detail & Room Types Showcase
async function getPublicPropertyDetail(req, res, next) {
  try {
    const propertyId = parseInt(req.params.id, 10);
    if (!propertyId || isNaN(propertyId)) {
      throw new ValidationError('A valid numeric property ID is required.');
    }

    const propRows = await db.query(
      `SELECT 
        p.id, 
        p.name, 
        p.code, 
        p.address, 
        p.city, 
        p.state,
        p.country,
        p.description,
        p.environment_description,
        p.category,
        p.location,
        p.district,
        p.contact_phone,
        p.contact_email,
        p.amenities,
        p.technical_specs,
        p.check_in_time,
        p.check_out_time,
        p.status
      FROM properties p 
      WHERE p.id = ? AND p.status IN ('ACTIVE', 'PUBLISHED') AND (p.approval_status IN ('APPROVED', 'PUBLISHED') OR p.approved_snapshot IS NOT NULL) AND (p.is_archived IS NULL OR p.is_archived = FALSE)`,
      [propertyId]
    );

    if (propRows.length === 0) {
      throw new NotFoundError('Property not found or is currently not active for public booking.');
    }

    // Property-level published media
    const propMedia = await db.query(
      `SELECT id, category, file_name, file_url, mime_type, caption, display_order, is_primary
       FROM media_assets 
       WHERE entity_type = 'PROPERTY' AND entity_id = ? AND is_published = 1
       ORDER BY is_primary DESC, display_order ASC, id ASC`,
      [propertyId]
    );

    // Dynamic building amenities
    const propAmenitiesRows = await db.query(
      `SELECT id, name, description, photo_url, display_order
       FROM property_amenities
       WHERE property_id = ?
       ORDER BY display_order ASC, id ASC`,
      [propertyId]
    );

    const primaryPropPhoto = (propMedia || []).find((p) => p.is_primary) || (propMedia || [])[0] || null;

    const property = {
      ...propRows[0],
      main_photo: primaryPropPhoto ? primaryPropPhoto.file_url : null,
      building_amenities: propAmenitiesRows || [],
      amenities: typeof propRows[0].amenities === 'string' ? (() => {
        try { return JSON.parse(propRows[0].amenities); } catch { return []; }
      })() : (propRows[0].amenities || []),
      technical_specs: typeof propRows[0].technical_specs === 'string' ? (() => {
        try { return JSON.parse(propRows[0].technical_specs); } catch { return {}; }
      })() : (propRows[0].technical_specs || {}),
      photos: propMedia || [],
    };

    const unitRows = await db.query(
      `SELECT 
        a.id, 
        a.property_id, 
        a.unit_number, 
        a.apartment_code,
        a.unit_name, 
        a.unit_type, 
        a.description,
        COALESCE(a.approved_rate_per_night, a.rate_per_night) AS rate_per_night,
        a.floor,
        a.capacity,
        a.bedroom_count,
        a.bathroom_count,
        a.amenities,
        a.technical_specs,
        a.status
      FROM apartments a
      WHERE a.property_id = ? AND a.is_active = 1 AND (a.approval_status IN ('APPROVED', 'PUBLISHED') OR a.approved_snapshot IS NOT NULL)
      ORDER BY COALESCE(a.approved_rate_per_night, a.rate_per_night) ASC, a.unit_number ASC`,
      [propertyId]
    );

    const unitIds = unitRows.map((u) => u.id);
    let unitMediaMap = {};
    let unitSpacesMap = {};
    let unitAmenitiesMap = {};

    if (unitIds.length > 0) {
      const placeholders = unitIds.map(() => '?').join(', ');
      const unitMediaRows = await db.query(
        `SELECT id, entity_id, category, file_name, file_url, caption, display_order, is_primary
         FROM media_assets
         WHERE entity_type = 'APARTMENT' AND entity_id IN (${placeholders}) AND is_published = 1
         ORDER BY is_primary DESC, display_order ASC, id ASC`,
        unitIds
      );
      for (const m of unitMediaRows) {
        if (!unitMediaMap[m.entity_id]) unitMediaMap[m.entity_id] = [];
        unitMediaMap[m.entity_id].push(m);
      }

      // Dynamic apartment amenities
      const aptAmenityRows = await db.query(
        `SELECT id, apartment_id, name, description, photo_url, display_order
         FROM apartment_amenities
         WHERE apartment_id IN (${placeholders})
         ORDER BY display_order ASC, id ASC`,
        unitIds
      );
      for (const a of aptAmenityRows) {
        if (!unitAmenitiesMap[a.apartment_id]) unitAmenitiesMap[a.apartment_id] = [];
        unitAmenitiesMap[a.apartment_id].push(a);
      }

      // Internal Spaces for units
      const spacesRows = await db.query(
        `SELECT s.id, s.apartment_id, s.property_id, s.space_type, s.name, s.description, s.amenities, s.display_order
         FROM apartment_internal_spaces s
         WHERE s.apartment_id IN (${placeholders})
         ORDER BY s.display_order ASC, s.id ASC`,
        unitIds
      );

      const spaceIds = spacesRows.map((s) => s.id);
      let spaceMediaMap = {};
      if (spaceIds.length > 0) {
        const spacePlaceholders = spaceIds.map(() => '?').join(', ');
        const spaceMediaRows = await db.query(
          `SELECT id, internal_space_id, category, file_name, file_url, caption, display_order, is_primary
           FROM media_assets
           WHERE entity_type = 'INTERNAL_SPACE' AND internal_space_id IN (${spacePlaceholders}) AND is_published = 1
           ORDER BY is_primary DESC, display_order ASC, id ASC`,
          spaceIds
        );
        for (const sm of spaceMediaRows) {
          if (!spaceMediaMap[sm.internal_space_id]) spaceMediaMap[sm.internal_space_id] = [];
          spaceMediaMap[sm.internal_space_id].push(sm);
        }
      }

      for (const s of spacesRows) {
        const parsedSpace = {
          ...s,
          amenities: typeof s.amenities === 'string' ? (() => {
            try { return JSON.parse(s.amenities); } catch { return []; }
          })() : (s.amenities || []),
          photos: spaceMediaMap[s.id] || [],
        };
        if (!unitSpacesMap[s.apartment_id]) unitSpacesMap[s.apartment_id] = [];
        unitSpacesMap[s.apartment_id].push(parsedSpace);
      }
    }

    const units = unitRows.map((u) => {
      const primaryPhoto = (unitMediaMap[u.id] || []).find((p) => p.is_primary) || (unitMediaMap[u.id] || [])[0] || null;
      return {
        ...u,
        apartment_code: u.apartment_code || u.unit_number,
        main_photo: primaryPhoto ? primaryPhoto.file_url : null,
        apartment_amenities: unitAmenitiesMap[u.id] || [],
        amenities: typeof u.amenities === 'string' ? (() => {
          try { return JSON.parse(u.amenities); } catch { return []; }
        })() : (u.amenities || []),
        technical_specs: typeof u.technical_specs === 'string' ? (() => {
          try { return JSON.parse(u.technical_specs); } catch { return {}; }
        })() : (u.technical_specs || {}),
        photos: unitMediaMap[u.id] || [],
        internal_spaces: unitSpacesMap[u.id] || [],
      };
    });

    // Group units into Room Types
    const roomTypeMap = new Map();
    for (const unit of units) {
      const typeKey = unit.unit_type || 'Standard Suite';
      if (!roomTypeMap.has(typeKey)) {
        roomTypeMap.set(typeKey, {
          unitType: typeKey,
          startingRate: parseFloat(unit.rate_per_night) || 0,
          capacity: unit.capacity || 2,
          bedroomCount: unit.bedroom_count || 1,
          bathroomCount: unit.bathroom_count || 1,
          amenities: Array.isArray(unit.amenities) && unit.amenities.length > 0 ? unit.amenities : property.amenities,
          totalUnits: 0,
          availableUnits: 0,
          unitIds: [],
          units: [],
        });
      }
      const roomType = roomTypeMap.get(typeKey);
      roomType.totalUnits += 1;
      if (unit.status === 'AVAILABLE') {
        roomType.availableUnits += 1;
      }
      const unitRate = parseFloat(unit.rate_per_night) || 0;
      if (unitRate < roomType.startingRate || roomType.startingRate === 0) {
        roomType.startingRate = unitRate;
      }
      roomType.unitIds.push(unit.id);
      roomType.units.push(unit);
    }

    const roomTypes = Array.from(roomTypeMap.values());

    res.status(200).json({
      success: true,
      message: 'Property detail and room types retrieved.',
      data: {
        property,
        roomTypes,
        units,
        totalUnits: units.length,
        availableUnits: units.filter((u) => u.status === 'AVAILABLE').length,
        startingRate: roomTypes.length > 0 ? Math.min(...roomTypes.map((rt) => rt.startingRate)) : 0,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 2c. Public Property Room Types Listing
async function getPublicRoomTypes(req, res, next) {
  try {
    const propertyId = parseInt(req.params.id, 10);
    if (!propertyId || isNaN(propertyId)) {
      throw new ValidationError('A valid numeric property ID is required.');
    }

    const propRows = await db.query(
      'SELECT id, name, code, city, amenities FROM properties WHERE id = ? AND status = \'ACTIVE\'',
      [propertyId]
    );
    if (propRows.length === 0) {
      throw new NotFoundError('Property not found or is currently not active.');
    }

    const property = propRows[0];
    const defaultAmenities = typeof property.amenities === 'string' ? (() => {
      try { return JSON.parse(property.amenities); } catch { return []; }
    })() : (property.amenities || []);

    const unitRows = await db.query(
      `SELECT 
        a.id, 
        a.property_id, 
        a.unit_number, 
        a.unit_name, 
        a.unit_type, 
        a.rate_per_night,
        a.floor,
        a.capacity,
        a.bedroom_count,
        a.bathroom_count,
        a.amenities,
        a.technical_specs,
        a.status
      FROM apartments a
      WHERE a.property_id = ? AND a.is_active = 1
      ORDER BY a.rate_per_night ASC, a.unit_number ASC`,
      [propertyId]
    );

    const roomTypeMap = new Map();
    for (const unit of unitRows) {
      const typeKey = unit.unit_type || 'Standard Suite';
      if (!roomTypeMap.has(typeKey)) {
        const parsedAmn = typeof unit.amenities === 'string' ? (() => {
          try { return JSON.parse(unit.amenities); } catch { return defaultAmenities; }
        })() : (unit.amenities || defaultAmenities);

        roomTypeMap.set(typeKey, {
          unitType: typeKey,
          startingRate: parseFloat(unit.rate_per_night) || 0,
          capacity: unit.capacity || 2,
          bedroomCount: unit.bedroom_count || 1,
          bathroomCount: unit.bathroom_count || 1,
          amenities: parsedAmn,
          totalUnits: 0,
          availableUnits: 0,
          sampleUnitId: unit.id,
          unitNumbers: [],
        });
      }
      const roomType = roomTypeMap.get(typeKey);
      roomType.totalUnits += 1;
      if (unit.status === 'AVAILABLE') {
        roomType.availableUnits += 1;
      }
      const unitRate = parseFloat(unit.rate_per_night) || 0;
      if (unitRate < roomType.startingRate || roomType.startingRate === 0) {
        roomType.startingRate = unitRate;
      }
      roomType.unitNumbers.push(unit.unit_number);
    }

    res.status(200).json({
      success: true,
      message: 'Room types for property retrieved.',
      data: Array.from(roomTypeMap.values()),
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 3. Check Availability (Delegates to authoritative centralized ReservationsService)
async function checkAvailability(req, res, next) {
  try {
    const { apartmentId, checkInDate } = req.body;
    if (!apartmentId || !checkInDate) {
      throw new ValidationError('apartmentId and checkInDate are required.');
    }

    const availability = await ReservationsService.checkAvailability({
      apartmentId: parseInt(apartmentId, 10),
      checkInDate,
    });

    if (!availability.isAvailable) {
      return res.status(200).json({
        success: true,
        message: availability.reason,
        data: {
          isAvailable: false,
          reason: availability.reason,
          apartmentId: availability.apartment?.id,
          unitName: availability.apartment?.unit_name,
          unitNumber: availability.apartment?.unit_number,
          propertyName: availability.apartment?.property_name,
          ratePerNight: parseFloat(availability.apartment?.rate_per_night || 0),
        },
        meta: { timestamp: new Date().toISOString(), requestId: req.id },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Apartment is available for booking.',
      data: {
        isAvailable: true,
        apartmentId: availability.apartment.id,
        unitName: availability.apartment.unit_name,
        unitNumber: availability.apartment.unit_number,
        propertyName: availability.apartment.property_name,
        ratePerNight: availability.ratePerNight,
        checkInDate: availability.checkInDate,
        checkOutDate: availability.checkOutDate,
        nights: 1,
        totalAmount: availability.totalAmount,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 3b. Authoritative Public Price Quote Generator
async function getPublicQuote(req, res, next) {
  try {
    const quote = await PricingService.generateQuote(req.body);
    return res.status(200).json({
      success: true,
      message: 'Authoritative price quote generated.',
      data: quote,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 3c. Public Payment Configuration (Official Bank Details from authorized system settings)
async function getPublicPaymentConfig(req, res, next) {
  try {
    const rows = await db.query(
      `SELECT setting_key, setting_value 
       FROM system_settings 
       WHERE category = 'banking' OR setting_key IN ('bank_name', 'account_name', 'account_number', 'transfer_instructions')`
    );

    const configMap = {};
    for (const r of rows) {
      configMap[r.setting_key] = r.setting_value;
    }

    const bankName = configMap.bank_name || process.env.BFA_BANK_NAME || null;
    const accountName = configMap.account_name || process.env.BFA_ACCOUNT_NAME || null;
    const accountNumber = configMap.account_number || process.env.BFA_ACCOUNT_NUMBER || null;
    const transferInstructions = configMap.transfer_instructions || process.env.BFA_TRANSFER_INSTRUCTIONS || 
      'Please use your Booking Reference Code or Full Guest Name as transfer narration. Once transfer is completed, upload your payment receipt or debit confirmation slip below for front desk verification.';

    const isConfigured = Boolean(bankName && accountName && accountNumber);

    const allowedPaymentMethods = ['BANK_TRANSFER'];
    const capCheck = await AccessControlService.canAccess(null, 'PAY_AT_PROPERTY');
    if (capCheck.allowed) {
      allowedPaymentMethods.push('PAY_AT_PROPERTY');
    }

    return res.status(200).json({
      success: true,
      data: {
        isConfigured,
        bankName: isConfigured ? bankName : null,
        accountName: isConfigured ? accountName : null,
        accountNumber: isConfigured ? accountNumber : null,
        transferInstructions: isConfigured ? transferInstructions : null,
        allowedPaymentMethods,
        notice: isConfigured 
          ? 'Transfer proof must be uploaded. A front desk officer verifies all transfers before approval.'
          : 'BFA Official Bank Account Details are awaiting administrative setup. Please contact the front desk directly or choose Pay at Property.',
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 3d. Public Payment Proof Uploader (Validates JPEG/PNG/WebP magic bytes + blocks PostScript/SVG/executables, <= 5MB)
async function uploadPaymentProof(req, res, next) {
  try {
    const { fileData, fileName, fileType } = req.body;
    const { buffer, mimeType, ext } = validateImageUpload({
      fileData,
      fileType: fileType || 'image/jpeg',
      fileName: fileName || '',
      maxSizeBytes: 5 * 1024 * 1024,
      label: 'Payment proof',
    });

    const cleanFileName = `proof_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const uploadDir = path.resolve(__dirname, '../../../uploads/payment_proofs');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, cleanFileName);
    fs.writeFileSync(filePath, buffer);

    return res.status(200).json({
      success: true,
      message: 'Payment proof uploaded successfully.',
      data: {
        proofUrl: `/uploads/payment_proofs/${cleanFileName}`,
        filePath,
        fileName: cleanFileName,
        fileSizeBytes: buffer.length,
        mimeType,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    return next(err);
  }
}

// Helper: check unit availability for given date
async function checkUnitAvailability(apartmentId, date) {
  const aptRows = await db.query('SELECT status FROM apartments WHERE id = ?', [apartmentId]);
  if (!aptRows || aptRows.length === 0 || ['MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE'].includes(aptRows[0].status)) {
    return false;
  }
  const nextDate = (() => {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  const conflicts = await db.query(
    `SELECT id FROM reservations 
     WHERE apartment_id = ? 
       AND status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING', 'PENDING_REVIEW', 'CLAIMED', 'AWAITING_ASSIGNMENT')
       AND (
         check_in_date = ? 
         OR (check_in_date < ? AND check_out_date > ?)
       )
     LIMIT 1`,
    [apartmentId, date, nextDate, date]
  );
  return conflicts.length === 0;
}

// 4. Public Online Booking Submission (Delegates to centralized ReservationsService with Bank Transfer & Front Desk Verification)
async function createPublicBooking(req, res, next) {
  try {
    const {
      apartmentId,
      propertyId: requestedPropertyId,
      property_id: requestedPropertySnakeId,
      guestName,
      guestEmail,
      guestPhone,
      checkInDate,
      paymentOption,
      paymentMethod = 'BANK_TRANSFER',
      quoteToken,
      quote_token,
      proofUrl,
      proofFilePath,
      proofFileName,
      proofFileSizeBytes,
      proofMimeType,
      specialRequests,
    } = req.body;

    if (!apartmentId || !guestName || !guestEmail || !guestPhone || !checkInDate) {
      throw new ValidationError('All booking fields are required (apartmentId, guestName, guestEmail, guestPhone, checkInDate).');
    }

    const parsedAptId = parseInt(apartmentId, 10);
    if (!Number.isFinite(parsedAptId) || parsedAptId <= 0) {
      throw new ValidationError('Invalid apartmentId supplied.');
    }

    const aptLookup = await db.query(
      `SELECT a.id, a.property_id, a.status, p.status AS property_status
       FROM apartments a
       JOIN properties p ON p.id = a.property_id
       WHERE a.id = ?
       LIMIT 1`,
      [parsedAptId]
    );
    if (!aptLookup || aptLookup.length === 0) {
      throw new NotFoundError(`Apartment unit #${parsedAptId} not found.`);
    }
    const aptRow = aptLookup[0];
    const resolvedPropertyId = parseInt(aptRow.property_id, 10);
    const providedPropId = requestedPropertyId || requestedPropertySnakeId;
    if (providedPropId && parseInt(providedPropId, 10) !== resolvedPropertyId) {
      throw new ValidationError('Requested propertyId does not match the selected apartment unit.');
    }

    const finalMethod = (paymentOption === 'PAY_AT_PROPERTY' || paymentMethod === 'PAY_AT_PROPERTY')
      ? 'PAY_AT_PROPERTY'
      : 'BANK_TRANSFER';

    const isPayAtProperty = finalMethod === 'PAY_AT_PROPERTY';
    const isBankTransfer = finalMethod === 'BANK_TRANSFER';

    if (isPayAtProperty) {
      const capCheck = await AccessControlService.canAccess(null, 'PAY_AT_PROPERTY');
      if (!capCheck.allowed) {
        throw new ValidationError(`Pay at Property is currently disabled by management (${capCheck.reason}). Please pay via Bank Transfer.`);
      }
    }

    // 1. Resolve proof path if provided (file path, URL, or base64 data)
    let finalProofPath = proofFilePath || proofUrl || null;
    let finalProofName = proofFileName || 'transfer_receipt.jpg';
    let finalProofMime = proofMimeType || 'image/jpeg';
    let finalProofBytes = proofFileSizeBytes || 1024;

    if (!finalProofPath && (req.body.proofBase64 || req.body.fileData)) {
      const rawData = req.body.proofBase64 || req.body.fileData;
      const { buffer, mimeType: pMime, ext } = validateImageUpload({
        fileData: rawData,
        fileType: req.body.proofMimeType || req.body.fileType || 'image/jpeg',
        fileName: proofFileName || '',
        maxSizeBytes: 5 * 1024 * 1024,
        label: 'Payment proof',
      });
      const cleanFileName = `proof_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
      const uploadDir = path.resolve(__dirname, '../../../uploads/payment_proofs');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      finalProofPath = path.join(uploadDir, cleanFileName);
      fs.writeFileSync(finalProofPath, buffer);
      finalProofName = cleanFileName;
      finalProofMime = pMime;
      finalProofBytes = buffer.length;
    }

    // Explicit manual verification status: never mark approved or paid at creation
    const initialReservationStatus = 'PENDING_REVIEW';
    const hasProof = Boolean(finalProofPath);
    const initialPaymentStatus = isBankTransfer 
      ? (hasProof ? 'PROOF_UPLOADED' : 'NOT_SUBMITTED') 
      : 'PAYMENT_PENDING';

    const reservation = await ReservationsService.createReservation(
      {
        apartment_id: parsedAptId,
        property_id: resolvedPropertyId,
        tenant_name: guestName,
        tenant_email: guestEmail,
        tenant_phone: guestPhone,
        check_in_date: checkInDate,
        check_out_date: req.body.checkOutDate || req.body.check_out_date,
        source: 'ONLINE',
        payment_method: finalMethod,
        status: initialReservationStatus,
        payment_status: initialPaymentStatus,
        paid_amount: 0.00,
        quote_token: quoteToken || quote_token,
        special_requests: specialRequests || null,
      },
      req
    );

    // Save proof path on reservation if provided
    if (finalProofPath) {
      await db.query(
        'UPDATE reservations SET payment_proof_path = ?, payment_status = ? WHERE id = ?',
        [finalProofPath, initialPaymentStatus, reservation.id]
      );

      // Record in operational_evidence_attachments
      try {
        await db.query(
          `INSERT INTO operational_evidence_attachments (
             property_id, apartment_id, reservation_id, evidence_category, file_path, file_name, file_url, mime_type, file_size_bytes, caption, uploaded_by_id, verification_status
           ) VALUES (?, ?, ?, 'BANK_TRANSFER_SLIP', ?, ?, ?, ?, ?, ?, 1, 'PENDING_REVIEW')`,
          [
            reservation.property_id,
            reservation.apartment_id,
            reservation.id,
            finalProofPath,
            finalProofName,
            proofUrl || finalProofPath,
            finalProofMime,
            finalProofBytes,
            `Bank transfer proof uploaded by guest ${guestName}`,
          ]
        );
      } catch (attErr) {
        // Attachment logging failure non-blocking
      }

      // Record in payment_receipts as unverified reported
      try {
        const rcptNum = `BFA-RCP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
        await db.query(
          `INSERT INTO payment_receipts (
             receipt_number, reservation_id, property_id, apartment_id, payer_name, payer_email, payer_phone, amount, currency, payment_method, payment_status, verification_status, pdf_path
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NGN', 'BANK_TRANSFER', 'PARTIAL', 'UNVERIFIED_REPORTED', ?)`,
          [
            rcptNum,
            reservation.id,
            reservation.property_id,
            reservation.apartment_id,
            guestName,
            guestEmail,
            guestPhone,
            reservation.total_amount,
            finalProofPath,
          ]
        );
      } catch (rcptErr) {
        // Receipt record failure non-blocking
      }
    }

    // Payment transaction: record as pending hold (no automatic ledger postings!)
    await PaymentsService.processPayment({
      reservationId: reservation.id,
      paymentMethod: finalMethod,
      amount: reservation.total_amount,
      currency: 'NGN',
      status: 'PENDING',
      isUnverified: true,
      provider: isPayAtProperty ? 'OFFLINE_COUNTER' : 'BANK_TRANSFER_HOLD',
      req,
    });

    if (isBankTransfer && hasProof) {
      await db.query("UPDATE reservations SET payment_status = 'PROOF_UPLOADED' WHERE id = ?", [reservation.id]);
    }

    return res.status(201).json({
      success: true,
      message: 'Reservation request received. Our Front Desk team will verify your transfer within 2–5 minutes.',
      data: {
        id: reservation.id,
        reservationCode: reservation.reservation_code,
        authCode: null, // Keep authCode hidden until verified and approved by front desk!
        status: initialReservationStatus,
        paymentStatus: initialPaymentStatus,
        paymentMethod: finalMethod,
        guestName: reservation.tenant_name,
        guestEmail: reservation.tenant_email,
        propertyName: reservation.property_name,
        unitName: reservation.unit_name,
        unitNumber: reservation.unit_number,
        checkInDate: reservation.check_in_date,
        checkOutDate: reservation.check_out_date,
        nights: 1,
        totalAmount: parseFloat(reservation.total_amount),
        paidAmount: 0.00,
        outstandingBalance: parseFloat(reservation.total_amount),
        hasProofUploaded: Boolean(finalProofPath),
        reviewNotice: 'Our front desk verifies transfers within 2–5 minutes. You may track your status here in real time.',
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 4b. Booking Tracking Lookup (By Reservation Reference + Guest Email)
async function trackBooking(req, res, next) {
  try {
    const { reservationCode, reference, guestEmail, email } = req.body;
    const ref = (reservationCode || reference || '').trim().toUpperCase();
    const cleanEmail = (guestEmail || email || '').trim().toLowerCase();

    if (!ref || !cleanEmail) {
      throw new ValidationError('Both Reservation Reference Code and Guest Email are required for tracking.');
    }

    const rows = await db.query(
      `SELECT 
         r.id, 
         r.reservation_code, 
         r.status, 
         r.payment_status, 
         r.payment_method,
         r.total_amount, 
         r.paid_amount,
         r.tenant_name, 
         r.tenant_email, 
         r.tenant_phone,
         r.check_in_date, 
         r.check_out_date, 
         r.nights,
         r.special_requests,
         r.payment_proof_path,
         r.decline_reason,
         r.declined_at,
         r.cancellation_reason,
         r.cancelled_at,
         r.room_change_status,
         r.room_change_notes,
         r.created_at,
         p.id as property_id,
         p.name as property_name, 
         p.address as property_address, 
         p.city as property_city,
         a.id as apartment_id,
         a.unit_name, 
         a.unit_number, 
         a.unit_type,
         a.rate_per_night,
         u.name as assigned_staff_name
       FROM reservations r
       JOIN properties p ON r.property_id = p.id
       JOIN apartments a ON r.apartment_id = a.id
       LEFT JOIN users u ON r.assigned_staff_id = u.id
       WHERE r.reservation_code = ? AND LOWER(r.tenant_email) = ?
       LIMIT 1`,
      [ref, cleanEmail]
    );

    if (rows.length === 0) {
      throw new NotFoundError('No booking found matching the provided reference and email. Please verify your details.');
    }

    const r = rows[0];
    const isApproved = r.status === 'CONFIRMED' || r.status === 'CHECKED_IN';
    const isVerified = r.payment_status === 'VERIFIED' || r.payment_status === 'PAYMENT_SUCCESS';

    let authCode = null;
    if (isApproved) {
      const authRows = await db.query(
        "SELECT auth_code FROM booking_authentications WHERE reservation_id = ? AND status = 'ACTIVE' LIMIT 1",
        [r.id]
      );
      authCode = authRows[0]?.auth_code || null;
    }

    const totalAmt = parseFloat(r.total_amount);
    const paidAmt = parseFloat(r.paid_amount || 0);
    const outstanding = Math.max(0, totalAmt - paidAmt);

    const timeline = [
      {
        step: 1,
        title: 'Booking Request Submitted',
        status: 'COMPLETED',
        time: r.created_at || 'Recorded',
        description: 'Reservation details and stay dates registered.',
      },
      {
        step: 2,
        title: 'Front Desk Claim & Assignment',
        status: r.assigned_staff_name ? 'COMPLETED' : 'IN_PROGRESS',
        detail: r.assigned_staff_name ? `Assigned to ${r.assigned_staff_name}` : 'Awaiting front desk pickup (2–5 mins)',
      },
      {
        step: 3,
        title: 'Bank Transfer Verification',
        status: isVerified ? 'COMPLETED' : r.status === 'DECLINED' ? 'FAILED' : 'IN_PROGRESS',
        detail: isVerified 
          ? 'Transfer verified on bank statement.' 
          : r.status === 'DECLINED' 
            ? `Verification declined: ${r.decline_reason || 'Discrepancy detected'}` 
            : 'Receptionist matching payment proof with bank records.',
      },
      {
        step: 4,
        title: 'Approval & Key Card Passcode',
        status: isApproved ? 'COMPLETED' : 'PENDING',
        authCode: isApproved ? authCode : null,
        detail: isApproved 
          ? 'Your booking is fully confirmed. Present your passcode at the front desk upon arrival.' 
          : 'Check-in passcode unlocks upon front desk verification.',
      },
    ];

    return res.status(200).json({
      success: true,
      message: 'Booking details retrieved successfully.',
      data: {
        id: r.id,
        reservationCode: r.reservation_code,
        authCode: isApproved ? authCode : null,
        status: r.status,
        paymentStatus: r.payment_status,
        paymentMethod: r.payment_method,
        isApproved,
        isVerified,
        guestName: r.tenant_name,
        guestEmail: r.tenant_email,
        guestPhone: r.tenant_phone,
        propertyName: r.property_name,
        propertyAddress: `${r.property_address}, ${r.property_city}`,
        unitName: r.unit_name,
        unitNumber: r.unit_number,
        unitType: r.unit_type,
        ratePerNight: parseFloat(r.rate_per_night),
        checkInDate: r.check_in_date,
        checkOutDate: r.check_out_date,
        nights: r.nights,
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        outstandingBalance: outstanding,
        assignedStaffName: r.assigned_staff_name || null,
        hasProofUploaded: Boolean(r.payment_proof_path),
        declineReason: r.decline_reason || null,
        cancellationReason: r.cancellation_reason || null,
        roomChangeStatus: r.room_change_status || null,
        roomChangeNotes: r.room_change_notes || null,
        timeline,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 4c. Guest Booking Cancellation
async function cancelPublicBooking(req, res, next) {
  try {
    const { reservationCode, reference, guestEmail, email, reason = 'CHANGE_OF_PLANS', notes = '' } = req.body;
    const ref = (reservationCode || reference || '').trim().toUpperCase();
    const cleanEmail = (guestEmail || email || '').trim().toLowerCase();

    if (!ref || !cleanEmail) {
      throw new ValidationError('Both Reservation Reference Code and Guest Email are required.');
    }

    const rows = await db.query(
      'SELECT id, apartment_id, property_id, status, total_amount, paid_amount FROM reservations WHERE reservation_code = ? AND LOWER(tenant_email) = ?',
      [ref, cleanEmail]
    );

    if (rows.length === 0) {
      throw new NotFoundError('No booking found matching reference and email.');
    }

    const reservation = rows[0];

    if (['CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'].includes(reservation.status)) {
      throw new ValidationError(`This booking cannot be cancelled because it is in '${reservation.status}' status.`);
    }

    const structuredReason = notes ? `${reason}: ${notes}` : reason;

    await db.query(
      `UPDATE reservations 
       SET status = 'CANCELLED',
           cancellation_reason = ?,
           cancelled_at = NOW()
       WHERE id = ?`,
      [structuredReason, reservation.id]
    );

    await auditService.record({
      req,
      actorRole: 'PUBLIC_GUEST',
      actorEmail: cleanEmail,
      action: 'RESERVATION_CANCELLED_BY_GUEST',
      entityType: 'reservation',
      entityId: reservation.id,
      newValues: { reason: structuredReason, cancelled_at: new Date().toISOString() },
    });

    return res.status(200).json({
      success: true,
      message: 'Your booking has been cancelled successfully.',
      data: {
        reservationCode: ref,
        status: 'CANCELLED',
        cancellationReason: structuredReason,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 4d. Guest Room Change Request
async function requestRoomChange(req, res, next) {
  try {
    const { reservationCode, reference, guestEmail, email, targetApartmentId, notes = '' } = req.body;
    const ref = (reservationCode || reference || '').trim().toUpperCase();
    const cleanEmail = (guestEmail || email || '').trim().toLowerCase();

    if (!ref || !cleanEmail || !targetApartmentId) {
      throw new ValidationError('Reservation Reference, Guest Email, and target Apartment ID are required.');
    }

    const rows = await db.query(
      `SELECT r.id, r.apartment_id, r.property_id, r.check_in_date, r.status, r.total_amount, a.unit_name as current_unit_name 
       FROM reservations r 
       JOIN apartments a ON r.apartment_id = a.id
       WHERE r.reservation_code = ? AND LOWER(r.tenant_email) = ?`,
      [ref, cleanEmail]
    );

    if (rows.length === 0) {
      throw new NotFoundError('No booking found matching reference and email.');
    }

    const r = rows[0];

    if (['CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'].includes(r.status)) {
      throw new ValidationError(`Room change cannot be requested for bookings in '${r.status}' status.`);
    }

    const targetAptRows = await db.query(
      'SELECT id, unit_name, unit_number, rate_per_night, status FROM apartments WHERE id = ? AND is_active = 1',
      [parseInt(targetApartmentId, 10)]
    );

    if (targetAptRows.length === 0) {
      throw new NotFoundError('Requested apartment unit is not active or not found.');
    }

    const targetApt = targetAptRows[0];

    const isAvail = await checkUnitAvailability(targetApt.id, r.check_in_date);
    if (!isAvail) {
      throw new ConflictError(`Target unit '${targetApt.unit_name}' is not available for ${r.check_in_date}.`);
    }

    const currentTotal = parseFloat(r.total_amount);
    const targetRate = parseFloat(targetApt.rate_per_night);
    const priceDelta = targetRate - currentTotal;

    const changeNotes = `Guest requested change from ${r.current_unit_name} to ${targetApt.unit_name} (Price delta: ₦${priceDelta.toLocaleString()}). ${notes}`.trim();

    await db.query(
      `UPDATE reservations 
       SET room_change_requested_apartment_id = ?,
           room_change_status = 'REQUESTED',
           room_change_notes = ?
       WHERE id = ?`,
      [targetApt.id, changeNotes, r.id]
    );

    await auditService.record({
      req,
      actorRole: 'PUBLIC_GUEST',
      actorEmail: cleanEmail,
      action: 'ROOM_CHANGE_REQUESTED',
      entityType: 'reservation',
      entityId: r.id,
      newValues: { targetApartmentId: targetApt.id, priceDelta },
    });

    return res.status(200).json({
      success: true,
      message: 'Room change request submitted. Our front desk will review and confirm your change.',
      data: {
        reservationCode: ref,
        currentUnitName: r.current_unit_name,
        targetUnitName: targetApt.unit_name,
        targetRate,
        priceDelta,
        status: 'CHANGE_REQUESTED',
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 5. Public Announcements
async function getPublicAnnouncements(req, res, next) {
  try {
    const { location = 'PUBLIC_LANDING', propertyId } = req.query;
    const data = await NotificationsService.getActiveAnnouncements({
      displayLocation: location,
      propertyId,
    });
    res.status(200).json({
      success: true,
      message: 'Active public announcements retrieved.',
      data,
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

// 6. Persistent Public Media File Streamer (serves BYTEA from DB or disk fallback)
async function getPublicMediaFile(req, res, next) {
  try {
    const mediaId = parseInt(req.params.mediaId, 10);
    if (!mediaId || isNaN(mediaId)) {
      throw new ValidationError('Invalid media ID.');
    }

    const rows = await db.query(
      'SELECT id, file_data, file_path, mime_type, file_name, is_published FROM media_assets WHERE id = ?',
      [mediaId]
    );
    if (rows.length === 0 || !rows[0].is_published) {
      throw new NotFoundError('Media asset not found.');
    }

    const asset = rows[0];
    res.setHeader('Content-Type', asset.mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (asset.file_data) {
      const buf = Buffer.isBuffer(asset.file_data) ? asset.file_data : Buffer.from(asset.file_data);
      return res.status(200).send(buf);
    }

    if (asset.file_path && fs.existsSync(asset.file_path)) {
      return res.sendFile(path.resolve(asset.file_path));
    }

    throw new NotFoundError('Media binary is not available.');
  } catch (err) {
    next(err);
  }
}

// 7. Public Single Apartment Detail
async function getPublicApartmentDetail(req, res, next) {
  try {
    const apartmentId = parseInt(req.params.id, 10);
    if (!apartmentId || isNaN(apartmentId)) {
      throw new ValidationError('A valid numeric apartment ID is required.');
    }

    const rows = await db.query(
      `SELECT
        a.id, a.property_id, a.unit_number, a.apartment_code, a.unit_name, a.unit_type,
        a.description, a.rate_per_night, a.floor, a.capacity, a.bedroom_count, a.bathroom_count,
        a.amenities, a.technical_specs, a.status,
        p.name AS property_name, p.code AS property_code, p.address AS property_address,
        p.city AS property_city, p.state AS property_state
       FROM apartments a
       JOIN properties p ON a.property_id = p.id
       WHERE a.id = ? AND a.is_active = 1 AND p.status IN ('ACTIVE', 'PUBLISHED') AND (p.is_archived IS NULL OR p.is_archived = FALSE)`,
      [apartmentId]
    );
    if (rows.length === 0) {
      throw new NotFoundError('Apartment not found or not currently published.');
    }

    const unit = rows[0];
    const photos = await db.query(
      `SELECT id, category, file_name, file_url, caption, display_order, is_primary
       FROM media_assets
       WHERE entity_type = 'APARTMENT' AND entity_id = ? AND is_published = 1
       ORDER BY is_primary DESC, display_order ASC, id ASC`,
      [apartmentId]
    );
    const apartmentAmenities = await db.query(
      `SELECT id, name, description, photo_url, display_order
       FROM apartment_amenities
       WHERE apartment_id = ?
       ORDER BY display_order ASC, id ASC`,
      [apartmentId]
    );

    const primaryPhoto = photos.find((p) => p.is_primary) || photos[0] || null;

    res.status(200).json({
      success: true,
      message: 'Apartment detail retrieved.',
      data: {
        ...unit,
        apartment_code: unit.apartment_code || unit.unit_number,
        main_photo: primaryPhoto ? primaryPhoto.file_url : null,
        photos,
        apartment_amenities: apartmentAmenities,
        amenities: typeof unit.amenities === 'string' ? (() => {
          try { return JSON.parse(unit.amenities); } catch { return []; }
        })() : (unit.amenities || []),
        technical_specs: typeof unit.technical_specs === 'string' ? (() => {
          try { return JSON.parse(unit.technical_specs); } catch { return {}; }
        })() : (unit.technical_specs || {}),
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPublicProperties,
  getPublicApartments,
  getPublicPropertyDetail,
  getPublicRoomTypes,
  getPublicApartmentDetail,
  getPublicMediaFile,
  checkAvailability,
  getPublicQuote,
  getPublicPaymentConfig,
  uploadPaymentProof,
  createPublicBooking,
  trackBooking,
  cancelPublicBooking,
  requestRoomChange,
  getPublicAnnouncements,
};
