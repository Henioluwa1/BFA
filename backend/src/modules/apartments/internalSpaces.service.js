const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../../db/pool');
const logger = require('../../utils/logger');
const auditService = require('../../core/audit/audit.service');
const PropertiesService = require('../properties/properties.service');
const { ValidationError, ForbiddenError, NotFoundError } = require('../../core/errors/apiError');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const VALID_SPACE_TYPES = [
  'BEDROOM', 'LIVING_ROOM', 'KITCHEN', 'BATHROOM', 'TOILET',
  'DINING_AREA', 'BALCONY', 'STUDY_AREA', 'CORRIDOR', 'TERRACE', 'CUSTOM',
];

class InternalSpacesService {
  /**
   * Validate property scoping for the requesting user
   */
  static async validateApartmentAccess(apartmentId, user) {
    const apts = await pool.query(
      'SELECT a.id, a.property_id, a.unit_name, a.unit_number FROM apartments a WHERE a.id = ?',
      [apartmentId]
    );
    if (!apts || apts.length === 0) {
      throw new NotFoundError(`Apartment #${apartmentId} not found.`);
    }
    const apt = apts[0];

    if (['OPERATIONS_MANAGER', 'MANAGER'].includes(user?.role) && user?.propertyId) {
      if (parseInt(user.propertyId, 10) !== parseInt(apt.property_id, 10)) {
        throw new ForbiddenError('You are not authorized to manage spaces for this property.');
      }
    }
    return apt;
  }

  /**
   * List all internal spaces for an apartment, including media assets
   */
  static async listSpaces(apartmentId) {
    const spaces = await pool.query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM media_assets m 
               WHERE m.internal_space_id = s.id) AS photo_count
       FROM apartment_internal_spaces s
       WHERE s.apartment_id = ?
       ORDER BY s.display_order ASC, s.id ASC`,
      [apartmentId]
    );

    // Fetch media for each space
    const spaceIds = spaces.map((s) => s.id);
    let mediaBySpace = {};
    if (spaceIds.length > 0) {
      const placeholders = spaceIds.map(() => '?').join(', ');
      const mediaRows = await pool.query(
        `SELECT id, entity_type, entity_id, internal_space_id, category, file_path, file_name, file_url,
                mime_type, file_size_bytes, caption, display_order, is_primary, is_published, created_at
         FROM media_assets
         WHERE internal_space_id IN (${placeholders})
         ORDER BY display_order ASC, id ASC`,
        spaceIds
      );
      for (const m of mediaRows) {
        if (!mediaBySpace[m.internal_space_id]) mediaBySpace[m.internal_space_id] = [];
        mediaBySpace[m.internal_space_id].push(m);
      }
    }

    return spaces.map((s) => ({
      ...s,
      amenities: typeof s.amenities === 'string' ? JSON.parse(s.amenities || '[]') : (s.amenities || []),
      photos: mediaBySpace[s.id] || [],
    }));
  }

  /**
   * Create an internal space in an apartment
   */
  static async createSpace(apartmentId, data, user, req = null) {
    const apt = await this.validateApartmentAccess(apartmentId, user);

    const name = (data.name || '').trim();
    if (!name) {
      throw new ValidationError('Internal space name is required (e.g. Master Bedroom, Chef Kitchen).');
    }

    const spaceType = VALID_SPACE_TYPES.includes(data.space_type) ? data.space_type : 'CUSTOM';
    const displayOrder = parseInt(data.display_order, 10) || 0;
    const description = data.description ? data.description.trim() : null;
    const amenitiesJson = Array.isArray(data.amenities)
      ? JSON.stringify(data.amenities)
      : typeof data.amenities === 'string'
      ? data.amenities
      : '[]';

    const result = await pool.query(
      `INSERT INTO apartment_internal_spaces 
        (apartment_id, property_id, space_type, name, description, display_order, amenities)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [apt.id, apt.property_id, spaceType, name, description, displayOrder, amenitiesJson]
    );

    const spaceId = result.insertId;

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'INTERNAL_SPACE_CREATED',
      entityType: 'apartment_internal_space',
      entityId: String(spaceId),
      newValues: { apartmentId: apt.id, propertyId: apt.property_id, spaceType, name },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    await PropertiesService.invalidatePropertyApproval(apt.property_id, 'Internal space created');

    const spaces = await this.listSpaces(apt.id);
    return spaces.find((s) => s.id === spaceId);
  }

  /**
   * Update an internal space
   */
  static async updateSpace(spaceId, data, user, req = null) {
    const rows = await pool.query(
      'SELECT id, apartment_id, property_id, name FROM apartment_internal_spaces WHERE id = ?',
      [spaceId]
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundError(`Internal space #${spaceId} not found.`);
    }
    const current = rows[0];
    await this.validateApartmentAccess(current.apartment_id, user);

    const updates = [];
    const params = [];

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new ValidationError('Space name cannot be empty.');
      updates.push('name = ?');
      params.push(name);
    }
    if (data.space_type !== undefined) {
      const st = VALID_SPACE_TYPES.includes(data.space_type) ? data.space_type : 'CUSTOM';
      updates.push('space_type = ?');
      params.push(st);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description ? data.description.trim() : null);
    }
    if (data.display_order !== undefined) {
      updates.push('display_order = ?');
      params.push(parseInt(data.display_order, 10) || 0);
    }
    if (data.amenities !== undefined) {
      updates.push('amenities = ?');
      params.push(Array.isArray(data.amenities) ? JSON.stringify(data.amenities) : String(data.amenities));
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(spaceId);
      await pool.query(`UPDATE apartment_internal_spaces SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'INTERNAL_SPACE_UPDATED',
      entityType: 'apartment_internal_space',
      entityId: String(spaceId),
      newValues: data,
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    await PropertiesService.invalidatePropertyApproval(current.property_id, 'Internal space updated');

    const spaces = await this.listSpaces(current.apartment_id);
    return spaces.find((s) => s.id === parseInt(spaceId, 10));
  }

  /**
   * Delete an internal space and unlink its photos
   */
  static async deleteSpace(spaceId, user, req = null) {
    const rows = await pool.query(
      'SELECT id, apartment_id, property_id, name FROM apartment_internal_spaces WHERE id = ?',
      [spaceId]
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundError(`Internal space #${spaceId} not found.`);
    }
    const current = rows[0];
    await this.validateApartmentAccess(current.apartment_id, user);

    // Delete associated photos on disk if any
    const media = await pool.query(
      'SELECT id, file_path FROM media_assets WHERE internal_space_id = ?',
      [spaceId]
    );
    for (const m of media) {
      try {
        if (m.file_path && fs.existsSync(m.file_path)) {
          fs.unlinkSync(m.file_path);
        }
      } catch (err) {
        logger.warn(`Could not remove file ${m.file_path}: ${err.message}`);
      }
    }

    await pool.query('DELETE FROM media_assets WHERE internal_space_id = ?', [spaceId]);
    await pool.query('DELETE FROM apartment_internal_spaces WHERE id = ?', [spaceId]);

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'INTERNAL_SPACE_DELETED',
      entityType: 'apartment_internal_space',
      entityId: String(spaceId),
      oldValues: { name: current.name, apartmentId: current.apartment_id },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    await PropertiesService.invalidatePropertyApproval(current.property_id, 'Internal space deleted');

    return { success: true, message: `Space '${current.name}' deleted successfully.` };
  }

  /**
   * Upload photos specifically for an internal space
   */
  static async uploadSpaceMedia(spaceId, mediaItems, user, req = null) {
    const rows = await pool.query(
      'SELECT id, apartment_id, property_id, name, space_type FROM apartment_internal_spaces WHERE id = ?',
      [spaceId]
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundError(`Internal space #${spaceId} not found.`);
    }
    const space = rows[0];
    await this.validateApartmentAccess(space.apartment_id, user);

    const items = Array.isArray(mediaItems) ? mediaItems : [mediaItems];
    if (items.length === 0) {
      throw new ValidationError('At least one media item must be provided.');
    }

    const uploadDir = path.resolve(__dirname, '../../../uploads/spaces');
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
        throw new ValidationError(`Item #${i + 1} exceeds 10MB size limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`);
      }

      // Magic byte validation
      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isWebp = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';

      if (!isJpeg && !isPng && !isWebp) {
        throw new ValidationError(`Item #${i + 1} file signature does not match valid JPEG, PNG, or WebP image content.`);
      }

      const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
      const cleanFileName = `space_${spaceId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const filePath = path.join(uploadDir, cleanFileName);
      fs.writeFileSync(filePath, buffer);

      const isPrimary = item.isPrimary ? 1 : 0;
      if (isPrimary) {
        await pool.query(
          "UPDATE media_assets SET is_primary = FALSE WHERE entity_type = 'INTERNAL_SPACE' AND internal_space_id = ?",
          [spaceId]
        );
      }

      const sql = `
        INSERT INTO media_assets 
          (entity_type, entity_id, internal_space_id, category, file_path, file_name, file_url, mime_type, file_size_bytes, 
           caption, display_order, is_primary, is_published, uploaded_by)
        VALUES 
          ('INTERNAL_SPACE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const fileUrl = `/uploads/spaces/${cleanFileName}`;
      const caption = (item.caption || `${space.name} Photo`).trim();
      const displayOrder = item.display_order !== undefined ? parseInt(item.display_order, 10) : i;

      const result = await pool.query(sql, [
        space.apartment_id,
        spaceId,
        'INTERIOR',
        filePath,
        cleanFileName,
        fileUrl,
        mimeType,
        buffer.length,
        caption,
        displayOrder,
        isPrimary,
        defaultPublished,
        user.id,
      ]);

      createdAssets.push({
        id: result.insertId,
        entity_type: 'INTERNAL_SPACE',
        entity_id: space.apartment_id,
        internal_space_id: spaceId,
        category: 'INTERIOR',
        file_name: cleanFileName,
        file_url: fileUrl,
        caption,
        display_order: displayOrder,
        is_primary: Boolean(isPrimary),
        is_published: Boolean(defaultPublished),
      });
    }

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'INTERNAL_SPACE_MEDIA_UPLOADED',
      entityType: 'apartment_internal_space',
      entityId: String(spaceId),
      newValues: { count: createdAssets.length, spaceName: space.name },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    await PropertiesService.invalidatePropertyApproval(space.property_id, 'Internal space photo uploaded');

    return createdAssets;
  }

  /**
   * Delete an internal space media asset
   */
  static async deleteSpaceMedia(spaceId, mediaId, user, req = null) {
    const rows = await pool.query(
      'SELECT id, apartment_id, property_id FROM apartment_internal_spaces WHERE id = ?',
      [spaceId]
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundError(`Internal space #${spaceId} not found.`);
    }
    await this.validateApartmentAccess(rows[0].apartment_id, user);

    const mediaRows = await pool.query(
      'SELECT id, file_path FROM media_assets WHERE id = ? AND internal_space_id = ?',
      [mediaId, spaceId]
    );
    if (!mediaRows || mediaRows.length === 0) {
      throw new NotFoundError(`Media asset #${mediaId} not found for space #${spaceId}.`);
    }

    const asset = mediaRows[0];
    try {
      if (asset.file_path && fs.existsSync(asset.file_path)) {
        fs.unlinkSync(asset.file_path);
      }
    } catch (err) {
      logger.warn(`Could not delete file ${asset.file_path}: ${err.message}`);
    }

    await pool.query('DELETE FROM media_assets WHERE id = ?', [mediaId]);

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'INTERNAL_SPACE_MEDIA_DELETED',
      entityType: 'apartment_internal_space',
      entityId: String(spaceId),
      oldValues: { mediaId },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    await PropertiesService.invalidatePropertyApproval(rows[0].property_id, 'Internal space photo deleted');

    return { success: true, message: 'Photo deleted successfully.' };
  }
}

module.exports = InternalSpacesService;
