const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ApartmentsRepository = require('./apartments.repository');
const PropertiesRepository = require('../properties/properties.repository');
const PropertiesService = require('../properties/properties.service');
const AuditService = require('../../core/audit/audit.service');
const pool = require('../../db/pool');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const VALID_OPERATIONAL_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'OCCUPIED',
  'DIRTY',
  'CLEANING',
  'READY',
  'MAINTENANCE',
  'BLOCKED',
  'OUT_OF_SERVICE',
];

class ApartmentsService {
  /**
   * Validate user's property scope
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return;
    }
    if (['MANAGER', 'STAFF', 'RECEPTIONIST'].includes(role)) {
      if (!user.propertyId) {
        throw new ForbiddenError('Access denied: User is not assigned to any property.');
      }
      if (propertyId && String(user.propertyId) !== String(propertyId)) {
        throw new ForbiddenError(`You are only authorized to manage units in Property #${user.propertyId}.`);
      }
    }
  }

  /**
   * List apartments with filters & server-side pagination
   */
  static async listApartments(filters = {}) {
    return ApartmentsRepository.findAll(filters);
  }

  /**
   * Get unit by ID with property and reservation context
   */
  static async getApartmentById(id, user = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    if (user) {
      this.validatePropertyScope(user, unit.property_id);
    }

    const reservations = await ApartmentsRepository.getUnitReservations(id);
    return {
      ...unit,
      reservations,
    };
  }

  /**
   * Create new apartment unit
   */
  static async createApartment(data, user, req = null) {
    const rawNumber = data.unit_number || data.apartment_code;
    if (!data.property_id || !rawNumber || !data.unit_name) {
      throw new ValidationError('Property ID, unit number / Apartment ID, and unit name are required.');
    }

    this.validatePropertyScope(user, data.property_id);

    // Verify property exists
    const property = await PropertiesRepository.findById(data.property_id);
    if (!property) {
      throw new NotFoundError(`Property #${data.property_id} does not exist.`);
    }

    // Verify unit number or manual Apartment ID unique within this property
    const aptCode = String(data.apartment_code || rawNumber).trim();
    const existing = await ApartmentsRepository.findByPropertyAndApartmentCode(
      data.property_id,
      aptCode
    );
    if (existing) {
      throw new ConflictError(
        `Apartment ID / Unit '${aptCode}' already exists in ${property.name}.`
      );
    }

    const newId = await ApartmentsRepository.create({
      ...data,
      unit_number: String(data.unit_number || aptCode).trim(),
      apartment_code: aptCode,
      description: data.description ? String(data.description).trim() : null,
      created_by: user?.id || null,
    });

    // Save dynamic apartment amenities if provided
    if (data.apartment_amenities && Array.isArray(data.apartment_amenities)) {
      await this.saveApartmentAmenities(newId, data.apartment_amenities, user, req);
    } else if (data.amenities && Array.isArray(data.amenities) && data.amenities.length > 0 && typeof data.amenities[0] === 'object') {
      await this.saveApartmentAmenities(newId, data.amenities, user, req);
    }

    const created = await ApartmentsRepository.findById(newId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'UNIT_CREATED',
      entityType: 'unit',
      entityId: String(newId),
      newValues: {
        id: newId,
        unitNumber: created.unit_number,
        apartmentCode: created.apartment_code,
        unitName: created.unit_name,
        propertyId: created.property_id,
        unitType: created.unit_type,
        ratePerNight: created.rate_per_night,
      },
    });

    await PropertiesService.invalidatePropertyApproval(created.property_id, 'New unit added');

    return created;
  }

  /**
   * Upload apartment-level photographs (including Main Apartment Photograph)
   */
  static async uploadApartmentMedia(apartmentId, mediaItems, user, req = null) {
    const unit = await ApartmentsRepository.findById(apartmentId);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${apartmentId} not found.`);
    }
    this.validatePropertyScope(user, unit.property_id);

    const items = Array.isArray(mediaItems) ? mediaItems : [mediaItems];
    if (items.length === 0) {
      throw new ValidationError('At least one media item must be provided.');
    }

    const uploadDir = path.resolve(__dirname, '../../../uploads/apartments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const createdAssets = [];
    const isPublisher = ['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(user?.role);
    const defaultPublished = isPublisher ? 1 : 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.fileData) {
        throw new ValidationError(`Item #${i + 1}: fileData (base64) is required.`);
      }

      let mimeType = item.fileType || 'image/jpeg';
      let base64Content = item.fileData;

      if (item.fileData.startsWith('data:')) {
        const match = item.fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
        if (match) {
          mimeType = match[1].toLowerCase();
          base64Content = match[2];
        }
      }

      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new ValidationError(`Item #${i + 1}: Invalid file type '${mimeType}'. Supported: JPEG, PNG, WebP.`);
      }

      const buffer = Buffer.from(base64Content, 'base64');
      if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
        throw new ValidationError(`Item #${i + 1} exceeds 10MB size limit.`);
      }

      // Magic byte validation
      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isWebp = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';

      if (!isJpeg && !isPng && !isWebp) {
        throw new ValidationError(`Item #${i + 1} file signature does not match valid JPEG, PNG, or WebP image content.`);
      }

      const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
      const cleanFileName = `apt_${apartmentId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const filePath = path.join(uploadDir, cleanFileName);
      fs.writeFileSync(filePath, buffer);

      const isPrimary = item.isPrimary || item.is_cover || (items.length === 1 && !createdAssets.length) ? 1 : 0;
      if (isPrimary) {
        await pool.query(
          "UPDATE media_assets SET is_primary = FALSE WHERE entity_type = 'APARTMENT' AND entity_id = ?",
          [apartmentId]
        );
      }

      const sql = `
        INSERT INTO media_assets 
          (entity_type, entity_id, category, file_path, file_name, file_url, file_data, mime_type, file_size_bytes, 
           caption, display_order, is_primary, is_published, uploaded_by)
        VALUES 
          ('APARTMENT', ?, 'INTERIOR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const fileUrl = `/uploads/apartments/${cleanFileName}`;
      const caption = (item.caption || `${unit.unit_name} Main Photo`).trim();
      const displayOrder = item.display_order !== undefined ? parseInt(item.display_order, 10) : i;

      const result = await pool.query(sql, [
        apartmentId,
        filePath,
        cleanFileName,
        fileUrl,
        buffer,
        mimeType,
        buffer.length,
        caption,
        displayOrder,
        isPrimary,
        defaultPublished,
        user?.id || null,
      ]);

      const persistentUrl = `/api/v1/public/media/${result.insertId}`;
      await pool.query('UPDATE media_assets SET file_url = ? WHERE id = ?', [persistentUrl, result.insertId]);
      const inserted = await pool.query(
        'SELECT id, entity_type, entity_id, category, file_path, file_name, file_url, mime_type, file_size_bytes, caption, display_order, is_primary, is_representative, is_published, submission_id, uploaded_by, created_at, updated_at FROM media_assets WHERE id = ?',
        [result.insertId]
      );
      createdAssets.push(inserted[0]);
    }

    if (!isPublisher) {
      await PropertiesService.invalidatePropertyApproval(unit.property_id, 'Apartment media updated');
    }
    return createdAssets;
  }

  /**
   * Save dynamic apartment amenities (Unlimited amenities allowed)
   */
  static async saveApartmentAmenities(apartmentId, amenitiesList, user, req = null) {
    const unit = await ApartmentsRepository.findById(apartmentId);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${apartmentId} not found.`);
    }
    this.validatePropertyScope(user, unit.property_id);

    if (!Array.isArray(amenitiesList)) {
      throw new ValidationError('Apartment amenities must be an array.');
    }

    const uploadDir = path.resolve(__dirname, '../../../uploads/amenities');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const processedList = [];
    for (let i = 0; i < amenitiesList.length; i++) {
      const item = { ...amenitiesList[i] };
      if (!item.name || !String(item.name).trim()) continue;

      let photoUrl = item.photo_url || item.photoUrl || null;
      let mediaAssetId = item.media_asset_id || item.mediaAssetId || null;

      // Handle base64 image upload if provided
      if (item.photoData) {
        let mimeType = item.fileType || 'image/jpeg';
        let base64Content = item.photoData;

        if (item.photoData.startsWith('data:')) {
          const match = item.photoData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
          if (match) {
            mimeType = match[1].toLowerCase();
            base64Content = match[2];
          }
        }

        if (ALLOWED_MIME_TYPES.includes(mimeType)) {
          const buffer = Buffer.from(base64Content, 'base64');
          if (buffer.length <= MAX_IMAGE_SIZE_BYTES) {
            const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
            const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
            const isWebp = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';

            if (isJpeg || isPng || isWebp) {
              const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
              const cleanFileName = `amenity_apt_${apartmentId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
              const filePath = path.join(uploadDir, cleanFileName);
              fs.writeFileSync(filePath, buffer);
              photoUrl = `/uploads/amenities/${cleanFileName}`;

              const res = await pool.query(
                `INSERT INTO media_assets 
                  (entity_type, entity_id, category, file_path, file_name, file_url, mime_type, file_size_bytes, caption, display_order, is_published, uploaded_by)
                 VALUES ('APARTMENT_AMENITY', ?, 'AMENITY', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [apartmentId, filePath, cleanFileName, photoUrl, mimeType, buffer.length, item.name, i, user?.id || null]
              );
              mediaAssetId = res.insertId;
            }
          }
        }
      }

      processedList.push({
        name: String(item.name).trim(),
        description: item.description ? String(item.description).trim() : null,
        photo_url: photoUrl,
        media_asset_id: mediaAssetId,
        display_order: item.display_order !== undefined ? parseInt(item.display_order, 10) : i,
      });
    }

    const saved = await ApartmentsRepository.saveApartmentAmenities(apartmentId, processedList);
    // Also synchronize legacy JSONB amenities
    await pool.query('UPDATE apartments SET amenities = ? WHERE id = ?', [
      JSON.stringify(processedList.map((a) => a.name)),
      apartmentId,
    ]);

    await PropertiesService.invalidatePropertyApproval(unit.property_id, 'Apartment amenities modified');
    return saved;
  }

  static async getApartmentAmenities(apartmentId) {
    return ApartmentsRepository.getApartmentAmenities(apartmentId);
  }

  static async getApartmentMedia(apartmentId) {
    return pool.query(
      "SELECT id, entity_type, entity_id, category, file_path, file_name, file_url, mime_type, file_size_bytes, caption, display_order, is_primary, is_representative, is_published, submission_id, uploaded_by, created_at, updated_at FROM media_assets WHERE entity_type = 'APARTMENT' AND entity_id = ? ORDER BY is_primary DESC, display_order ASC, id ASC",
      [apartmentId]
    );
  }

  static async setCoverImage(apartmentId, mediaId, user) {
    const unit = await ApartmentsRepository.findById(apartmentId);
    if (!unit) throw new NotFoundError(`Apartment unit #${apartmentId} not found.`);
    this.validatePropertyScope(user, unit.property_id);

    const media = await pool.query(
      "SELECT id FROM media_assets WHERE id = ? AND entity_type = 'APARTMENT' AND entity_id = ?",
      [mediaId, apartmentId]
    );
    if (media.length === 0) throw new NotFoundError(`Media asset #${mediaId} not found on Apartment #${apartmentId}.`);

    await pool.query("UPDATE media_assets SET is_primary = 0 WHERE entity_type = 'APARTMENT' AND entity_id = ?", [apartmentId]);
    await pool.query('UPDATE media_assets SET is_primary = 1 WHERE id = ?', [mediaId]);
    return { message: 'Apartment cover image updated.' };
  }

  static async reorderMedia(apartmentId, orderedIds, user) {
    const unit = await ApartmentsRepository.findById(apartmentId);
    if (!unit) throw new NotFoundError(`Apartment unit #${apartmentId} not found.`);
    this.validatePropertyScope(user, unit.property_id);
    if (!Array.isArray(orderedIds)) throw new ValidationError('orderedIds must be an array.');

    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query(
        "UPDATE media_assets SET display_order = ? WHERE id = ? AND entity_type = 'APARTMENT' AND entity_id = ?",
        [i, parseInt(orderedIds[i], 10), apartmentId]
      );
    }
    return { message: 'Apartment media order updated.' };
  }

  static async publishMedia(apartmentId, mediaId, isPublished, user) {
    const unit = await ApartmentsRepository.findById(apartmentId);
    if (!unit) throw new NotFoundError(`Apartment unit #${apartmentId} not found.`);
    this.validatePropertyScope(user, unit.property_id);
    await pool.query(
      "UPDATE media_assets SET is_published = ? WHERE id = ? AND entity_type = 'APARTMENT' AND entity_id = ?",
      [isPublished ? 1 : 0, mediaId, apartmentId]
    );
    return { message: isPublished ? 'Apartment image published.' : 'Apartment image unpublished.' };
  }

  static async deleteMedia(apartmentId, mediaId, user) {
    const unit = await ApartmentsRepository.findById(apartmentId);
    if (!unit) throw new NotFoundError(`Apartment unit #${apartmentId} not found.`);
    this.validatePropertyScope(user, unit.property_id);

    const rows = await pool.query(
      "SELECT id, file_path FROM media_assets WHERE id = ? AND entity_type = 'APARTMENT' AND entity_id = ?",
      [mediaId, apartmentId]
    );
    if (rows.length === 0) throw new NotFoundError(`Media asset #${mediaId} not found.`);

    await pool.query('DELETE FROM media_assets WHERE id = ?', [mediaId]);
    if (rows[0].file_path && fs.existsSync(rows[0].file_path)) {
      try { fs.unlinkSync(rows[0].file_path); } catch {}
    }
    return { message: 'Apartment image deleted.' };
  }

  /**
   * Update apartment unit
   */
  static async updateApartment(id, data, user, req = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    this.validatePropertyScope(user, unit.property_id);

    if (data.property_id && data.property_id !== unit.property_id) {
      this.validatePropertyScope(user, data.property_id);
    }

    // If unit number or property changed, verify uniqueness
    const targetPropertyId = data.property_id || unit.property_id;
    const targetUnitNumber = data.unit_number || unit.unit_number;
    if (
      String(targetPropertyId) !== String(unit.property_id) ||
      String(targetUnitNumber) !== String(unit.unit_number)
    ) {
      const conflict = await ApartmentsRepository.findByPropertyAndUnitNumber(
        targetPropertyId,
        targetUnitNumber
      );
      if (conflict && String(conflict.id) !== String(id)) {
        throw new ConflictError(
          `Unit number '${targetUnitNumber}' already exists in Property #${targetPropertyId}.`
        );
      }
    }

    await ApartmentsRepository.update(id, {
      ...data,
      updated_by: user?.id || null,
    });

    const updated = await ApartmentsRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'UNIT_UPDATED',
      entityType: 'unit',
      entityId: String(id),
      oldValues: { unitName: unit.unit_name, unitNumber: unit.unit_number, rate: unit.rate_per_night },
      newValues: { unitName: updated.unit_name, unitNumber: updated.unit_number, rate: updated.rate_per_night },
    });

    await PropertiesService.invalidatePropertyApproval(unit.property_id, 'Unit configuration updated');

    return updated;
  }

  /**
   * Update decoupled unit readiness status (housekeeping and maintenance)
   * Independent of occupancy status
   */
  static async updateApartmentReadiness(id, { housekeepingStatus, maintenanceStatus, notes }, user, req = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    this.validatePropertyScope(user, unit.property_id);

    const validHousekeeping = ['DIRTY', 'CLEANING_IN_PROGRESS', 'CLEANED', 'INSPECTED_READY'];
    const validMaintenance = ['OPERATIONAL', 'INSPECTION_REQUIRED', 'UNDER_REPAIR', 'OUT_OF_ORDER'];

    if (housekeepingStatus && !validHousekeeping.includes(String(housekeepingStatus).toUpperCase())) {
      throw new ValidationError(`Invalid housekeeping status '${housekeepingStatus}'. Must be one of: ${validHousekeeping.join(', ')}`);
    }

    if (maintenanceStatus && !validMaintenance.includes(String(maintenanceStatus).toUpperCase())) {
      throw new ValidationError(`Invalid maintenance status '${maintenanceStatus}'. Must be one of: ${validMaintenance.join(', ')}`);
    }

    const normHk = housekeepingStatus ? String(housekeepingStatus).toUpperCase() : null;
    const normMaint = maintenanceStatus ? String(maintenanceStatus).toUpperCase() : null;

    await ApartmentsRepository.updateReadiness(id, { housekeepingStatus: normHk, maintenanceStatus: normMaint }, user?.id || null);
    const updated = await ApartmentsRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'APARTMENT_READINESS_UPDATED',
      entityType: 'unit',
      entityId: String(id),
      oldValues: {
        housekeeping_status: unit.housekeeping_status,
        maintenance_status: unit.maintenance_status,
      },
      newValues: {
        housekeeping_status: updated.housekeeping_status,
        maintenance_status: updated.maintenance_status,
        notes: notes || null,
      },
    });

    return updated;
  }

  /**
   * Update operational status of apartment unit
   */
  static async updateApartmentStatus(id, status, user, req = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    this.validatePropertyScope(user, unit.property_id);

    const normalizedStatus = String(status).toUpperCase();
    if (!VALID_OPERATIONAL_STATUSES.includes(normalizedStatus)) {
      throw new ValidationError(
        `Invalid unit status '${status}'. Must be one of: ${VALID_OPERATIONAL_STATUSES.join(', ')}`
      );
    }

    if (normalizedStatus === 'AVAILABLE') {
      // 1. Check if blocking maintenance requests exist
      const maintRows = await pool.query(
        'SELECT COUNT(*) as count FROM maintenance_requests WHERE apartment_id = ? AND status IN ("OPEN", "IN_PROGRESS") AND blocking_unit = 1',
        [id]
      );
      if (parseInt(maintRows[0]?.count || 0, 10) > 0) {
        throw new ConflictError('Cannot set status to AVAILABLE: Unit has active blocking maintenance work orders.');
      }

      // 2. Check if active reservation occupies unit today
      const todayStr = new Date().toISOString().slice(0, 10);
      const activeRes = await pool.query(
        `SELECT id, reservation_code FROM reservations 
         WHERE apartment_id = ? 
           AND status IN ('CONFIRMED', 'CHECKED_IN') 
           AND check_in_date <= ? AND check_out_date > ? 
         LIMIT 1`,
        [id, todayStr, todayStr]
      );
      if (activeRes.length > 0) {
        throw new ConflictError(`Cannot set status to AVAILABLE: Unit is occupied by active reservation #${activeRes[0].reservation_code}.`);
      }

      // 3. Check if active blocked period covers today
      const activeBlock = await pool.query(
        `SELECT id, reason FROM blocked_periods 
         WHERE apartment_id = ? 
           AND start_date <= ? AND end_date >= ? 
         LIMIT 1`,
        [id, todayStr, todayStr]
      );
      if (activeBlock.length > 0) {
        throw new ConflictError(`Cannot set status to AVAILABLE: Unit is blocked (${activeBlock[0].reason}).`);
      }

      // 4. Operational state progression: cannot skip from MAINTENANCE or DIRTY directly to AVAILABLE
      if (['MAINTENANCE', 'DIRTY'].includes(unit.status)) {
        throw new ConflictError(`Unit in '${unit.status}' state cannot bypass cleaning. It must transition through CLEANING and READY before becoming AVAILABLE.`);
      }
    }

    await ApartmentsRepository.updateStatus(id, normalizedStatus, user?.id || null);
    const updated = await ApartmentsRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'UNIT_STATUS_UPDATED',
      entityType: 'unit',
      entityId: String(id),
      oldValues: { status: unit.status },
      newValues: { status: updated.status },
    });

    return updated;
  }

  /**
   * Check unit availability for requested check-in date
   */
  static async checkAvailability(id, checkInDate) {
    if (!checkInDate) {
      throw new ValidationError('checkInDate is required in YYYY-MM-DD format.');
    }
    return ApartmentsRepository.checkAvailability(id, checkInDate);
  }

  /**
   * Add operational blocked period for unit
   */
  static async addBlockedPeriod(id, { startDate, endDate, reason }, user, req = null) {
    if (!startDate || !endDate || !reason) {
      throw new ValidationError('startDate, endDate, and reason are required.');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new ValidationError('Dates must be in YYYY-MM-DD format.');
    }

    if (startDate > endDate) {
      throw new ValidationError('startDate cannot be after endDate.');
    }

    const trimmedReason = String(reason).trim();
    if (trimmedReason.length < 3) {
      throw new ValidationError('Reason must be at least 3 characters.');
    }

    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    this.validatePropertyScope(user, unit.property_id);

    // Check for conflicting active reservations
    const conflictingReservations = await pool.query(
      `SELECT id, reservation_code, check_in_date, check_out_date, status
       FROM reservations
       WHERE apartment_id = ?
         AND status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING')
         AND check_in_date <= ? AND check_out_date > ?`,
      [id, endDate, startDate]
    );

    if (conflictingReservations.length > 0) {
      const conflict = conflictingReservations[0];
      throw new ConflictError(
        `Cannot block unit: active reservation #${conflict.reservation_code} exists from ${conflict.check_in_date} to ${conflict.check_out_date}.`
      );
    }

    // Check for existing overlapping blocked periods
    const overlappingBlocks = await pool.query(
      `SELECT id, start_date, end_date, reason
       FROM blocked_periods
       WHERE apartment_id = ?
         AND start_date <= ? AND end_date >= ?`,
      [id, endDate, startDate]
    );

    if (overlappingBlocks.length > 0) {
      const block = overlappingBlocks[0];
      throw new ConflictError(
        `A blocked period already overlaps with requested dates (${block.start_date} to ${block.end_date}: ${block.reason}).`
      );
    }

    const insertId = await ApartmentsRepository.addBlockedPeriod({
      propertyId: unit.property_id,
      apartmentId: unit.id,
      startDate,
      endDate,
      reason: trimmedReason,
      blockedById: user?.id || null,
    });

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'BLOCKED_PERIOD_CREATED',
      entityType: 'unit',
      entityId: String(id),
      newValues: {
        id: insertId,
        propertyId: unit.property_id,
        apartmentId: unit.id,
        unitNumber: unit.unit_number,
        startDate,
        endDate,
        reason: trimmedReason,
      },
    });

    return {
      id: insertId,
      property_id: unit.property_id,
      apartment_id: unit.id,
      start_date: startDate,
      end_date: endDate,
      reason: trimmedReason,
      blocked_by_id: user?.id || null,
    };
  }

  /**
   * Get all blocked periods for unit
   */
  static async getBlockedPeriods(id, user = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    if (user) {
      this.validatePropertyScope(user, unit.property_id);
    }

    return ApartmentsRepository.getBlockedPeriods(id);
  }

  /**
   * Delete blocked period
   */
  static async deleteBlockedPeriod(id, blockId, user, req = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    this.validatePropertyScope(user, unit.property_id);

    const block = await ApartmentsRepository.findBlockedPeriodById(blockId);
    if (!block || String(block.apartment_id) !== String(id)) {
      throw new NotFoundError(`Blocked period #${blockId} not found on unit #${id}.`);
    }

    await ApartmentsRepository.deleteBlockedPeriod(blockId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'BLOCKED_PERIOD_DELETED',
      entityType: 'unit',
      entityId: String(id),
      oldValues: {
        id: block.id,
        apartmentId: block.apartment_id,
        startDate: block.start_date,
        endDate: block.end_date,
        reason: block.reason,
      },
    });

    return { success: true, message: 'Blocked period removed successfully.' };
  }

  static async updateApartmentReadiness(id, { housekeepingStatus, maintenanceStatus, notes }, user, req = null) {
    const unit = await ApartmentsRepository.findById(id);
    if (!unit) {
      throw new NotFoundError(`Apartment unit #${id} not found.`);
    }

    this.validatePropertyScope(user, unit.property_id);

    const validHousekeeping = ['DIRTY', 'CLEANING_IN_PROGRESS', 'CLEANED', 'INSPECTED_READY'];
    const validMaintenance = ['OPERATIONAL', 'INSPECTION_REQUIRED', 'UNDER_REPAIR', 'OUT_OF_ORDER'];

    if (housekeepingStatus && !validHousekeeping.includes(String(housekeepingStatus).toUpperCase())) {
      throw new ValidationError(`Invalid housekeeping status '${housekeepingStatus}'. Must be one of: ${validHousekeeping.join(', ')}`);
    }

    if (maintenanceStatus && !validMaintenance.includes(String(maintenanceStatus).toUpperCase())) {
      throw new ValidationError(`Invalid maintenance status '${maintenanceStatus}'. Must be one of: ${validMaintenance.join(', ')}`);
    }

    const normHk = housekeepingStatus ? String(housekeepingStatus).toUpperCase() : null;
    const normMaint = maintenanceStatus ? String(maintenanceStatus).toUpperCase() : null;

    await ApartmentsRepository.updateReadiness(id, { housekeepingStatus: normHk, maintenanceStatus: normMaint }, user?.id || null);
    const updated = await ApartmentsRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'APARTMENT_READINESS_UPDATED',
      entityType: 'unit',
      entityId: String(id),
      oldValues: {
        housekeeping_status: unit.housekeeping_status,
        maintenance_status: unit.maintenance_status,
      },
      newValues: {
        housekeeping_status: updated.housekeeping_status,
        maintenance_status: updated.maintenance_status,
        notes: notes || null,
      },
    });

    return updated;
  }
}

module.exports = ApartmentsService;
