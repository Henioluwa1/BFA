const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../../db/pool');
const PropertiesRepository = require('./properties.repository');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const VALID_CATEGORIES = [
  'BUILDING_EXTERIOR',
  'BUILDING_ENTRANCE',
  'RECEPTION',
  'LOBBY',
  'SWIMMING_POOL',
  'GARDEN',
  'PARKING',
  'FACILITIES',
  'INTERIOR',
  'AMENITY',
  'OTHER',
];

class PropertiesService {
  /**
   * Validate that the user is authorized for the given property
   */
  static validatePropertyScope(user, propertyId) {
    if (!user) return;
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) {
      return; // Authorized across all properties
    }
    if (['OPERATIONS_MANAGER', 'MANAGER', 'STAFF', 'RECEPTIONIST'].includes(role)) {
      if (!user.propertyId) {
        throw new ForbiddenError('Access denied: User is not assigned to any property.');
      }
      if (propertyId && String(user.propertyId) !== String(propertyId)) {
        throw new ForbiddenError(`You are only authorized to access Property #${user.propertyId}.`);
      }
    }
  }

  /**
   * List all properties within user's scope
   */
  static async listProperties({ search, status, user } = {}) {
    return PropertiesRepository.findAll({ search, status, user });
  }

  /**
   * Get property details by ID
   */
  static async getPropertyById(id, user = null) {
    if (user) {
      this.validatePropertyScope(user, id);
    }
    const prop = await PropertiesRepository.findById(id);
    if (!prop) {
      throw new NotFoundError(`Property with ID ${id} not found.`);
    }
    return prop;
  }

  /**
   * Create a new property
   */
  static async createProperty(data, user, req = null) {
    if (!data.name || !data.code || !data.address) {
      throw new ValidationError('Property name, code, and address are required.');
    }

    const existing = await PropertiesRepository.findByCode(data.code.trim().toUpperCase());
    if (existing) {
      throw new ConflictError(`Property code '${data.code.toUpperCase()}' is already in use.`);
    }

    const newId = await PropertiesRepository.create({
      ...data,
      created_by: user?.id || null,
    });

    // Process dynamic building amenities (Max 7) if provided
    if (data.building_amenities && Array.isArray(data.building_amenities)) {
      await this.savePropertyAmenities(newId, data.building_amenities, user, req);
    } else if (data.amenities && Array.isArray(data.amenities) && data.amenities.length > 0 && typeof data.amenities[0] === 'object') {
      await this.savePropertyAmenities(newId, data.amenities, user, req);
    }

    const created = await PropertiesRepository.findById(newId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'PROPERTY_CREATED',
      entityType: 'property',
      entityId: String(newId),
      newValues: {
        id: newId,
        name: created.name,
        code: created.code,
        address: created.address,
        status: created.status,
      },
    });

    return created;
  }

  /**
   * Update property details
   */
  static async updateProperty(id, data, user, req = null) {
    this.validatePropertyScope(user, id);

    const property = await this.getPropertyById(id);

    if (data.code && data.code.trim().toUpperCase() !== property.code) {
      const existing = await PropertiesRepository.findByCode(data.code.trim().toUpperCase());
      if (existing && String(existing.id) !== String(id)) {
        throw new ConflictError(`Property code '${data.code.toUpperCase()}' is already in use by another property.`);
      }
    }

    // Material changes to an approved/published property reset its status to DRAFT
    if (['APPROVED', 'PUBLISHED'].includes(property.status) && !data.status) {
      data.status = 'DRAFT';
      data.admin_approved_at = null;
      data.admin_approved_by_id = null;
      data.owner_approved_at = null;
      data.owner_approved_by_id = null;
      data.published_at = null;
      data.published_by_id = null;
      data.rejection_reason = 'Approval invalidated: Content edited after approval.';
    }

    await PropertiesRepository.update(id, {
      ...data,
      updated_by: user?.id || null,
    });

    const updated = await PropertiesRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'PROPERTY_UPDATED',
      entityType: 'property',
      entityId: String(id),
      oldValues: { name: property.name, address: property.address, status: property.status },
      newValues: { name: updated.name, address: updated.address, status: updated.status },
    });

    return updated;
  }

  /**
   * Update property status (ACTIVE, INACTIVE, MAINTENANCE, ARCHIVED)
   */
  static async updatePropertyStatus(id, status, user, req = null) {
    this.validatePropertyScope(user, id);

    const property = await this.getPropertyById(id);
    const validStatuses = [
      'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ARCHIVED',
      'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
      'CHANGES_REQUESTED', 'PUBLISHED', 'UNPUBLISHED'
    ];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid property status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // If deactivating or archiving, verify active reservations
    if (['INACTIVE', 'ARCHIVED'].includes(status)) {
      const activeCount = await PropertiesRepository.getActiveReservationsCount(id);
      if (activeCount > 0) {
        throw new ConflictError(
          `Cannot deactivate Property #${id} (${property.name}). There are ${activeCount} active upcoming reservation(s) assigned to this property.`
        );
      }
    }

    await PropertiesRepository.update(id, {
      status,
      is_archived: status === 'ARCHIVED',
      updated_by: user?.id || null,
    });

    const updated = await PropertiesRepository.findById(id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'PROPERTY_STATUS_UPDATED',
      entityType: 'property',
      entityId: String(id),
      oldValues: { status: property.status },
      newValues: { status: updated.status },
    });

    return updated;
  }

  /**
   * Get units for property
   */
  static async getPropertyApartments(propertyId, user = null) {
    if (user) {
      this.validatePropertyScope(user, propertyId);
    }
    await this.getPropertyById(propertyId);
    return PropertiesRepository.getApartmentsByPropertyId(propertyId);
  }

  // ─── Multiple Property Media Upload & Management ───────────────────
  static async uploadPropertyMedia(propertyId, mediaItems, user, req = null) {
    this.validatePropertyScope(user, propertyId);
    await this.getPropertyById(propertyId);

    const items = Array.isArray(mediaItems) ? mediaItems : [mediaItems];
    if (items.length === 0) {
      throw new ValidationError('At least one media item must be provided.');
    }

    const uploadDir = path.resolve(__dirname, '../../../uploads/properties');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const createdAssets = [];
    const isPublisher = ['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(user?.role);
    // Managers can upload images for assigned property; published status is 0 (pending review) unless Admin
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
        throw new ValidationError(`Item #${i + 1} exceeds 5MB size limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`);
      }

      // Magic byte validation:
      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isWebp = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';

      if (!isJpeg && !isPng && !isWebp) {
        throw new ValidationError(`Item #${i + 1} file signature does not match valid JPEG, PNG, or WebP image content.`);
      }

      const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
      const cleanFileName = `prop_${propertyId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const filePath = path.join(uploadDir, cleanFileName);
      fs.writeFileSync(filePath, buffer);

      const category = VALID_CATEGORIES.includes(item.category) ? item.category : 'BUILDING_EXTERIOR';
      const isPrimary = item.isPrimary || item.is_cover ? 1 : 0;

      // If marked as primary cover, unset any existing primary cover for this property
      if (isPrimary) {
        await pool.query("UPDATE media_assets SET is_primary = FALSE WHERE entity_type = 'PROPERTY' AND entity_id = ?", [propertyId]);
      }

      const sql = `
        INSERT INTO media_assets 
          (entity_type, entity_id, category, file_path, file_name, file_url, mime_type, file_size_bytes, 
           caption, display_order, is_primary, is_published, uploaded_by)
        VALUES ('PROPERTY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        propertyId,
        category,
        filePath,
        cleanFileName,
        `/uploads/properties/${cleanFileName}`,
        mimeType,
        buffer.length,
        item.caption || null,
        item.display_order !== undefined ? item.display_order : i,
        isPrimary,
        defaultPublished,
        user?.id || null,
      ];

      const res = await pool.query(sql, params);
      const inserted = await pool.query('SELECT * FROM media_assets WHERE id = ?', [res.insertId]);
      createdAssets.push(inserted[0]);
    }

    await AuditService.record({
      req,
      action: 'PROPERTY_MEDIA_UPLOADED',
      entityType: 'property_media',
      entityId: String(propertyId),
      newValues: { count: createdAssets.length, published: isPublisher },
    });

    return createdAssets;
  }

  static async getPropertyMedia(propertyId, user = null) {
    let sql = "SELECT * FROM media_assets WHERE entity_type = 'PROPERTY' AND entity_id = ?";
    const params = [propertyId];

    // Public / unauthenticated visitors only see published images
    const isInternal = user && ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(user.role);
    if (!isInternal) {
      sql += ' AND is_published = TRUE';
    }

    sql += ' ORDER BY is_primary DESC, display_order ASC, id ASC';
    return pool.query(sql, params);
  }

  static async setCoverImage(propertyId, mediaId, user, req = null) {
    this.validatePropertyScope(user, propertyId);
    const media = await pool.query("SELECT * FROM media_assets WHERE id = ? AND entity_type = 'PROPERTY' AND entity_id = ?", [mediaId, propertyId]);
    if (media.length === 0) {
      throw new NotFoundError(`Media asset #${mediaId} not found on Property #${propertyId}.`);
    }

    await pool.query("UPDATE media_assets SET is_primary = 0 WHERE entity_type = 'PROPERTY' AND entity_id = ?", [propertyId]);
    await pool.query('UPDATE media_assets SET is_primary = 1 WHERE id = ?', [mediaId]);

    await AuditService.record({
      req,
      action: 'PROPERTY_COVER_IMAGE_SET',
      entityType: 'property_media',
      entityId: String(mediaId),
      newValues: { property_id: propertyId, is_primary: 1 },
    });

    return { message: 'Cover image updated successfully.' };
  }

  static async reorderPropertyMedia(propertyId, orderList, user, req = null) {
    this.validatePropertyScope(user, propertyId);
    if (!Array.isArray(orderList)) {
      throw new ValidationError('orderList must be an array of { id, display_order }.');
    }

    for (const item of orderList) {
      if (item.id && item.display_order !== undefined) {
        await pool.query(
          "UPDATE media_assets SET display_order = ? WHERE id = ? AND entity_type = 'PROPERTY' AND entity_id = ?",
          [item.display_order, item.id, propertyId]
        );
      }
    }

    return this.getPropertyMedia(propertyId, user);
  }

  static async publishPropertyMedia(propertyId, mediaId, isPublished, user, req = null) {
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(user?.role)) {
      throw new ForbiddenError('Only Administrators and Owners can publish property media.');
    }
    await pool.query(
      "UPDATE media_assets SET is_published = ? WHERE id = ? AND entity_type = 'PROPERTY' AND entity_id = ?",
      [isPublished ? 1 : 0, mediaId, propertyId]
    );

    await AuditService.record({
      req,
      action: isPublished ? 'PROPERTY_MEDIA_PUBLISHED' : 'PROPERTY_MEDIA_UNPUBLISHED',
      entityType: 'property_media',
      entityId: String(mediaId),
      newValues: { property_id: propertyId, is_published: isPublished ? 1 : 0 },
    });

    return { message: `Media asset #${mediaId} publication status set to ${isPublished ? 'PUBLISHED' : 'UNPUBLISHED'}.` };
  }

  static async deletePropertyMedia(propertyId, mediaId, user, req = null) {
    this.validatePropertyScope(user, propertyId);
    const media = await pool.query("SELECT * FROM media_assets WHERE id = ? AND entity_type = 'PROPERTY' AND entity_id = ?", [mediaId, propertyId]);
    if (media.length === 0) {
      throw new NotFoundError(`Media asset #${mediaId} not found.`);
    }

    const asset = media[0];
    if (asset.file_path && fs.existsSync(asset.file_path)) {
      try {
        fs.unlinkSync(asset.file_path);
      } catch (err) {
        console.warn(`Could not delete file ${asset.file_path}:`, err.message);
      }
    }

    await pool.query('DELETE FROM media_assets WHERE id = ?', [mediaId]);

    await AuditService.record({
      req,
      action: 'PROPERTY_MEDIA_DELETED',
      entityType: 'property_media',
      entityId: String(mediaId),
      oldValues: asset,
    });

    return { message: 'Media asset deleted successfully.' };
  }

  /**
   * Helper to invalidate approvals on material structural/unit/space edits
   */
  static async invalidatePropertyApproval(propertyId, reason = 'Material change to property or units') {
    const prop = await PropertiesRepository.findById(propertyId);
    if (prop && ['APPROVED', 'PUBLISHED'].includes(prop.status)) {
      await PropertiesRepository.update(propertyId, {
        status: 'DRAFT',
        admin_approved_at: null,
        admin_approved_by_id: null,
        owner_approved_at: null,
        owner_approved_by_id: null,
        published_at: null,
        published_by_id: null,
        rejection_reason: `Approval invalidated: ${reason}`,
      });
      await AuditService.record({
        action: 'PROPERTY_APPROVAL_INVALIDATED',
        entityType: 'property',
        entityId: String(propertyId),
        newValues: { status: 'DRAFT', reason },
      });
    }
  }

  /**
   * Complete 3-Level Property Hierarchy:
   * Level A: Property + Photos + Amenities + Environment
   * Level B: Apartments/Units + Unit Photos
   * Level C: Internal Spaces per Unit + Space Photos
   */
  /**
   * Save dynamic building amenities for a property (Maximum 7 amenities)
   */
  static async savePropertyAmenities(propertyId, amenitiesList, user, req = null) {
    if (user) {
      this.validatePropertyScope(user, propertyId);
    }
    if (!Array.isArray(amenitiesList)) {
      throw new ValidationError('Building amenities must be an array.');
    }
    if (amenitiesList.length > 7) {
      throw new ValidationError('Maximum of 7 building amenities allowed per property.');
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
              const cleanFileName = `amenity_prop_${propertyId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
              const filePath = path.join(uploadDir, cleanFileName);
              fs.writeFileSync(filePath, buffer);
              photoUrl = `/uploads/amenities/${cleanFileName}`;

              const res = await pool.query(
                `INSERT INTO media_assets 
                  (entity_type, entity_id, category, file_path, file_name, file_url, mime_type, file_size_bytes, caption, display_order, is_published, uploaded_by)
                 VALUES ('PROPERTY_AMENITY', ?, 'AMENITY', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [propertyId, filePath, cleanFileName, photoUrl, mimeType, buffer.length, item.name, i, user?.id || null]
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

    const saved = await PropertiesRepository.savePropertyAmenities(propertyId, processedList);
    // Also synchronize legacy JSONB amenities with amenity names
    await pool.query('UPDATE properties SET amenities = ? WHERE id = ?', [
      JSON.stringify(processedList.map((a) => a.name)),
      propertyId,
    ]);

    await this.invalidatePropertyApproval(propertyId, 'Building amenities modified');
    return saved;
  }

  static async getPropertyAmenities(propertyId) {
    return PropertiesRepository.getPropertyAmenities(propertyId);
  }

  static async getPropertyHierarchy(propertyId, user = null) {
    if (user) {
      this.validatePropertyScope(user, propertyId);
    }
    const prop = await this.getPropertyById(propertyId, user);

    const isInternal = user && ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(user.role);

    // Fetch dynamic building amenities
    const buildingAmenities = await PropertiesRepository.getPropertyAmenities(propertyId);

    // Level A Media: Property photos
    let propMediaSql = "SELECT * FROM media_assets WHERE entity_type = 'PROPERTY' AND entity_id = ?";
    if (!isInternal) {
      propMediaSql += ' AND is_published = TRUE';
    }
    propMediaSql += ' ORDER BY is_primary DESC, display_order ASC, id ASC';
    const propertyMedia = await pool.query(propMediaSql, [propertyId]);

    // Level B: Apartments/Units
    const apartments = await PropertiesRepository.getApartmentsByPropertyId(propertyId);
    const apartmentIds = apartments.map((a) => a.id);

    let apartmentMediaMap = {};
    let internalSpacesMap = {};
    let spaceMediaMap = {};
    let aptAmenitiesMap = {};

    if (apartmentIds.length > 0) {
      const aptPlaceholders = apartmentIds.map(() => '?').join(', ');

      // Level B Media: Apartment photos
      let aptMediaSql = `SELECT * FROM media_assets WHERE entity_type = 'APARTMENT' AND entity_id IN (${aptPlaceholders})`;
      if (!isInternal) {
        aptMediaSql += ' AND is_published = TRUE';
      }
      aptMediaSql += ' ORDER BY is_primary DESC, display_order ASC, id ASC';
      const aptMediaRows = await pool.query(aptMediaSql, apartmentIds);
      for (const m of aptMediaRows) {
        if (!apartmentMediaMap[m.entity_id]) apartmentMediaMap[m.entity_id] = [];
        apartmentMediaMap[m.entity_id].push(m);
      }

      // Apartment dynamic amenities
      const aptAmenityRows = await pool.query(
        `SELECT * FROM apartment_amenities WHERE apartment_id IN (${aptPlaceholders}) ORDER BY display_order ASC, id ASC`,
        apartmentIds
      );
      for (const a of aptAmenityRows) {
        if (!aptAmenitiesMap[a.apartment_id]) aptAmenitiesMap[a.apartment_id] = [];
        aptAmenitiesMap[a.apartment_id].push(a);
      }

      // Level C: Internal Spaces
      const spaceRows = await pool.query(
        `SELECT s.*, 
                (SELECT COUNT(*) FROM media_assets m WHERE m.internal_space_id = s.id) AS photo_count
         FROM apartment_internal_spaces s
         WHERE s.apartment_id IN (${aptPlaceholders})
         ORDER BY s.display_order ASC, s.id ASC`,
        apartmentIds
      );

      const spaceIds = spaceRows.map((s) => s.id);
      if (spaceIds.length > 0) {
        const spacePlaceholders = spaceIds.map(() => '?').join(', ');
        let spaceMediaSql = `SELECT * FROM media_assets WHERE internal_space_id IN (${spacePlaceholders})`;
        if (!isInternal) {
          spaceMediaSql += ' AND is_published = TRUE';
        }
        spaceMediaSql += ' ORDER BY is_primary DESC, display_order ASC, id ASC';
        const spaceMediaRows = await pool.query(spaceMediaSql, spaceIds);
        for (const m of spaceMediaRows) {
          if (!spaceMediaMap[m.internal_space_id]) spaceMediaMap[m.internal_space_id] = [];
          spaceMediaMap[m.internal_space_id].push(m);
        }
      }

      for (const s of spaceRows) {
        const parsedSpace = {
          ...s,
          amenities: typeof s.amenities === 'string' ? JSON.parse(s.amenities || '[]') : (s.amenities || []),
          photos: spaceMediaMap[s.id] || [],
        };
        if (!internalSpacesMap[s.apartment_id]) internalSpacesMap[s.apartment_id] = [];
        internalSpacesMap[s.apartment_id].push(parsedSpace);
      }
    }

    const assembledApartments = apartments.map((a) => {
      const primaryPhoto = (apartmentMediaMap[a.id] || []).find((p) => p.is_primary) || (apartmentMediaMap[a.id] || [])[0] || null;
      return {
        ...a,
        apartment_code: a.apartment_code || a.unit_number,
        main_photo: primaryPhoto ? primaryPhoto.file_url : null,
        amenities: typeof a.amenities === 'string' ? JSON.parse(a.amenities || '[]') : (a.amenities || []),
        apartment_amenities: aptAmenitiesMap[a.id] || [],
        photos: apartmentMediaMap[a.id] || [],
        internal_spaces: internalSpacesMap[a.id] || [],
      };
    });

    const primaryPropPhoto = (propertyMedia || []).find((p) => p.is_primary) || (propertyMedia || [])[0] || null;

    return {
      ...prop,
      main_photo: primaryPropPhoto ? primaryPropPhoto.file_url : null,
      building_amenities: buildingAmenities,
      amenities: typeof prop.amenities === 'string' ? JSON.parse(prop.amenities || '[]') : (prop.amenities || []),
      photos: propertyMedia,
      apartments: assembledApartments,
    };
  }

  /**
   * Submit property for dual-review executive approval
   */
  static async submitForApproval(propertyId, user, req = null) {
    this.validatePropertyScope(user, propertyId);
    const prop = await this.getPropertyById(propertyId, user);

    const apartments = await PropertiesRepository.getApartmentsByPropertyId(propertyId);
    if (!apartments || apartments.length === 0) {
      throw new ValidationError('A property must have at least one apartment unit defined before submission.');
    }

    // Set property status to PENDING_APPROVAL
    await PropertiesRepository.update(propertyId, {
      status: 'PENDING_APPROVAL',
      rejection_reason: null,
      updated_by: user?.id || null,
    });

    const hierarchySnapshot = await this.getPropertyHierarchy(propertyId, user);

    const PropertySubmissionsService = require('./propertySubmissions.service');
    const submission = await PropertySubmissionsService.createSubmission({
      propertyId,
      submissionType: prop.published_at ? 'CONTENT_UPDATE' : 'NEW_PROPERTY',
      contentSnapshot: hierarchySnapshot,
      user,
      req,
    });

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'PROPERTY_SUBMITTED_FOR_APPROVAL',
      entityType: 'property',
      entityId: String(propertyId),
      newValues: {
        status: 'PENDING_APPROVAL',
        submissionId: submission.id,
        submissionCode: submission.submission_code,
      },
    });

    return {
      property: await this.getPropertyById(propertyId, user),
      submission,
    };
  }
}

module.exports = PropertiesService;
