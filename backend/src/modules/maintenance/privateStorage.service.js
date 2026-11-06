const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../../db/pool');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');
const logger = require('../../utils/logger');

// Allowed image formats with corresponding magic bytes
const MAGIC_BYTES = {
  JPEG: [0xFF, 0xD8, 0xFF],
  PNG: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  WEBP_RIFF: [0x52, 0x49, 0x46, 0x46], // "RIFF"
  WEBP_TAG: [0x57, 0x45, 0x42, 0x50],  // "WEBP" at bytes 8-11
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

class PrivateStorageService {
  /**
   * Resolve storage directory paths
   */
  static getStorageDirectories() {
    const baseDir = path.resolve(__dirname, '../../../storage/private');
    return {
      base: baseDir,
      maintenance: path.join(baseDir, 'maintenance'),
      temp: path.join(baseDir, 'temp'),
      quarantine: path.join(baseDir, 'quarantine'),
    };
  }

  /**
   * Ensure private directories exist with appropriate permissions
   */
  static ensureDirectories() {
    const dirs = this.getStorageDirectories();
    for (const dir of Object.values(dirs)) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
      }
    }
    return dirs;
  }

  /**
   * Validate file buffer or file path for format and size
   * @param {Buffer|string} input - File buffer or absolute file path
   * @param {object} options
   */
  static validateImageFile(input, options = {}) {
    let buffer;
    let size;

    if (Buffer.isBuffer(input)) {
      buffer = input;
      size = buffer.length;
    } else if (typeof input === 'string') {
      if (!fs.existsSync(input)) {
        throw new NotFoundError(`File at path '${input}' does not exist.`);
      }
      const stat = fs.statSync(input);
      size = stat.size;
      // Read first 32 bytes for magic bytes verification
      const fd = fs.openSync(input, 'r');
      buffer = Buffer.alloc(32);
      fs.readSync(fd, buffer, 0, 32, 0);
      fs.closeSync(fd);
    } else {
      throw new ValidationError('Invalid file input: Expected Buffer or file path string.');
    }

    // 1. File size verification
    const maxSize = options.maxSizeBytes || MAX_FILE_SIZE_BYTES;
    if (size > maxSize) {
      throw new ValidationError(`File size (${(size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum limit of ${(maxSize / (1024 * 1024)).toFixed(0)}MB.`);
    }

    if (size === 0) {
      throw new ValidationError('Uploaded file is empty (0 bytes).');
    }

    // 2. Magic bytes verification
    const detectedFormat = this.detectImageFormat(buffer);
    if (!detectedFormat) {
      throw new ValidationError('Invalid file format: File header does not match allowed image formats (JPEG, PNG, WebP).');
    }

    return {
      valid: true,
      format: detectedFormat.format,
      mimeType: detectedFormat.mimeType,
      extension: detectedFormat.extension,
      sizeBytes: size,
    };
  }

  /**
   * Detect image format by inspecting leading header bytes
   * @param {Buffer} buffer
   */
  static detectImageFormat(buffer) {
    if (!buffer || buffer.length < 12) return null;

    // Check JPEG (FF D8 FF)
    if (
      buffer[0] === MAGIC_BYTES.JPEG[0] &&
      buffer[1] === MAGIC_BYTES.JPEG[1] &&
      buffer[2] === MAGIC_BYTES.JPEG[2]
    ) {
      return { format: 'JPEG', mimeType: 'image/jpeg', extension: '.jpg' };
    }

    // Check PNG (89 50 4E 47 0D 0A 1A 0A)
    if (
      buffer[0] === MAGIC_BYTES.PNG[0] &&
      buffer[1] === MAGIC_BYTES.PNG[1] &&
      buffer[2] === MAGIC_BYTES.PNG[2] &&
      buffer[3] === MAGIC_BYTES.PNG[3] &&
      buffer[4] === MAGIC_BYTES.PNG[4] &&
      buffer[5] === MAGIC_BYTES.PNG[5] &&
      buffer[6] === MAGIC_BYTES.PNG[6] &&
      buffer[7] === MAGIC_BYTES.PNG[7]
    ) {
      return { format: 'PNG', mimeType: 'image/png', extension: '.png' };
    }

    // Check WebP (RIFF .... WEBP)
    if (
      buffer[0] === MAGIC_BYTES.WEBP_RIFF[0] &&
      buffer[1] === MAGIC_BYTES.WEBP_RIFF[1] &&
      buffer[2] === MAGIC_BYTES.WEBP_RIFF[2] &&
      buffer[3] === MAGIC_BYTES.WEBP_RIFF[3] &&
      buffer[8] === MAGIC_BYTES.WEBP_TAG[0] &&
      buffer[9] === MAGIC_BYTES.WEBP_TAG[1] &&
      buffer[10] === MAGIC_BYTES.WEBP_TAG[2] &&
      buffer[11] === MAGIC_BYTES.WEBP_TAG[3]
    ) {
      return { format: 'WEBP', mimeType: 'image/webp', extension: '.webp' };
    }

    return null;
  }

  /**
   * Generate cryptographically collision-resistant filename
   * Pattern: mnt_ev_<workOrderId>_<uuid>.<ext>
   */
  static generateFileName(workOrderId, extension) {
    const sanitizedId = String(workOrderId || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
    const uuid = crypto.randomUUID();
    const cleanExt = extension.startsWith('.') ? extension : `.${extension}`;
    return `mnt_ev_${sanitizedId}_${uuid}${cleanExt.toLowerCase()}`;
  }

  /**
   * Verify path is strictly within the allowed directory (Path Traversal Protection)
   */
  static assertSafePath(targetPath, baseDir) {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBase = path.resolve(baseDir);
    if (!resolvedTarget.startsWith(resolvedBase)) {
      throw new ForbiddenError('Path traversal detected: Target file path is outside authorized storage directory.');
    }
    return resolvedTarget;
  }

  /**
   * Atomically move file from temp to final destination with same-volume rename
   * Falls back to copy-then-unlink if cross-device link (EXDEV) error occurs
   */
  static atomicMoveFile(sourceTempPath, destinationDir, fileName) {
    const dirs = this.ensureDirectories();
    const targetDir = destinationDir || dirs.maintenance;
    const destPath = path.join(targetDir, fileName);

    // Guard against directory traversal
    this.assertSafePath(destPath, targetDir);

    try {
      fs.renameSync(sourceTempPath, destPath);
    } catch (err) {
      if (err.code === 'EXDEV') {
        fs.copyFileSync(sourceTempPath, destPath);
        fs.unlinkSync(sourceTempPath);
      } else {
        throw err;
      }
    }

    return destPath;
  }

  /**
   * Ingest and save private maintenance evidence attachment
   */
  static async storeMaintenanceEvidence({
    workOrderId,
    workOrderReference = null,
    propertyId,
    apartmentId = null,
    evidenceCategory = 'MAINTENANCE_AFTER',
    fileBuffer,
    originalFileName = 'evidence.jpg',
    caption = null,
    uploadedById,
    req = null,
  }) {
    const dirs = this.ensureDirectories();

    // 1. Validate file
    const validation = this.validateImageFile(fileBuffer);

    // 2. Generate safe unique filename
    const safeFileName = this.generateFileName(workOrderId, validation.extension);
    const tempFilePath = path.join(dirs.temp, `temp_${crypto.randomUUID()}${validation.extension}`);

    // 3. Write to same-volume temp staging directory
    fs.writeFileSync(tempFilePath, fileBuffer);

    let finalFilePath = null;
    let attachmentId = null;

    try {
      // 4. Atomically move to private maintenance storage
      finalFilePath = this.atomicMoveFile(tempFilePath, dirs.maintenance, safeFileName);

      // Relative path for database portability
      const relativePath = path.join('storage', 'private', 'maintenance', safeFileName).replace(/\\/g, '/');
      const streamUrl = `/api/v1/maintenance/${workOrderId}/evidence/${safeFileName}/stream`;

      // 5. Insert attachment record into database
      const insertResult = await pool.query(
        `INSERT INTO operational_evidence_attachments (
          maintenance_id, work_order_reference, property_id, apartment_id,
          evidence_category, file_path, file_name, file_url,
          mime_type, file_size_bytes, caption, uploaded_by_id,
          verification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW')`,
        [
          workOrderId,
          workOrderReference,
          propertyId,
          apartmentId,
          evidenceCategory,
          relativePath,
          safeFileName,
          streamUrl,
          validation.mimeType,
          validation.sizeBytes,
          caption,
          uploadedById,
        ]
      );

      attachmentId = insertResult.insertId;

      // 6. Record immutable audit event
      await AuditService.record({
        req,
        actorId: uploadedById,
        action: 'MAINTENANCE_EVIDENCE_ATTACHED',
        entityType: 'maintenance',
        entityId: String(workOrderId),
        newValues: {
          attachmentId,
          evidenceCategory,
          fileName: safeFileName,
          fileSizeBytes: validation.sizeBytes,
          mimeType: validation.mimeType,
        },
      });

      return {
        id: attachmentId,
        maintenanceId: workOrderId,
        workOrderReference,
        fileName: safeFileName,
        filePath: relativePath,
        fileUrl: streamUrl,
        streamUrl,
        mimeType: validation.mimeType,
        fileSizeBytes: validation.sizeBytes,
        evidenceCategory,
        caption,
      };
    } catch (err) {
      // Compensating cleanup on database failure
      if (finalFilePath && fs.existsSync(finalFilePath)) {
        try { fs.unlinkSync(finalFilePath); } catch (_) {}
      }
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
      }
      throw err;
    }
  }

  /**
   * Sweep orphaned files from temp directory older than specified minutes
   * @param {number} maxAgeMinutes - Default 60 minutes
   */
  static sweepTempFiles(maxAgeMinutes = 60) {
    const dirs = this.ensureDirectories();
    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    let sweptCount = 0;

    if (!fs.existsSync(dirs.temp)) return { sweptCount: 0 };

    const files = fs.readdirSync(dirs.temp);
    for (const file of files) {
      const fullPath = path.join(dirs.temp, file);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
          sweptCount++;
          logger.info(`Swept expired temp evidence file: ${file}`);
        }
      } catch (err) {
        logger.warn(`Could not sweep temp file ${file}: ${err.message}`);
      }
    }

    return { sweptCount };
  }

  /**
   * Integrity audit scanner
   * - Identifies database records referencing missing files
   * - Identifies files on disk with no database record (quarantining files older than 24 hours)
   */
  static async auditEvidenceStorageIntegrity() {
    const dirs = this.ensureDirectories();
    const missingDbFiles = [];
    const quarantinedFiles = [];
    const pendingQuarantineFiles = [];

    // 1. Database -> Filesystem Audit
    const dbRecords = await pool.query(
      `SELECT id, maintenance_id, work_order_reference, file_path, file_name
       FROM operational_evidence_attachments
       WHERE file_path LIKE '%maintenance%' OR maintenance_id IS NOT NULL`
    );

    for (const record of dbRecords) {
      const fullPath = path.resolve(__dirname, '../../../', record.file_path);
      if (!fs.existsSync(fullPath)) {
        missingDbFiles.push({
          recordId: record.id,
          maintenanceId: record.maintenance_id,
          workOrderReference: record.work_order_reference,
          filePath: record.file_path,
        });
      }
    }

    // 2. Filesystem -> Database Audit
    const now = Date.now();
    const activeUploadGraceMs = 60 * 60 * 1000; // 60 minutes
    const quarantineThresholdMs = 24 * 60 * 60 * 1000; // 24 hours

    const diskFiles = fs.readdirSync(dirs.maintenance);
    for (const fileName of diskFiles) {
      const fullPath = path.join(dirs.maintenance, fileName);
      const stat = fs.statSync(fullPath);
      const fileAgeMs = now - stat.mtimeMs;

      // In-progress upload protection: Skip files created within the last 60 minutes
      if (fileAgeMs < activeUploadGraceMs) {
        continue;
      }

      // Check if file is referenced in DB
      const matching = dbRecords.find(
        (r) => r.file_name === fileName || (r.file_path && r.file_path.includes(fileName))
      );

      if (!matching) {
        if (fileAgeMs > quarantineThresholdMs) {
          // File is unreferenced and > 24 hours old: Move to quarantine
          const quarantinePath = path.join(dirs.quarantine, fileName);
          fs.renameSync(fullPath, quarantinePath);
          quarantinedFiles.push({
            fileName,
            ageHours: Math.round(fileAgeMs / (1000 * 60 * 60)),
            quarantinePath,
          });
          logger.warn(`Quarantined unreferenced evidence file: ${fileName} (age: ${Math.round(fileAgeMs / 3600000)}h)`);
        } else {
          // Between 60m and 24h: Flag as pending quarantine
          pendingQuarantineFiles.push({
            fileName,
            ageMinutes: Math.round(fileAgeMs / (1000 * 60)),
          });
        }
      }
    }

    return {
      healthy: missingDbFiles.length === 0 && quarantinedFiles.length === 0,
      totalCheckedRecords: dbRecords.length,
      missingFiles: missingDbFiles,
      quarantinedFiles,
      pendingQuarantineFiles,
    };
  }

  /**
   * Get configured retention days from system_settings
   * Provisional policy default: 1825 days (5 years)
   */
  static async getRetentionDays() {
    const rows = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = "maintenance_evidence_retention_days" LIMIT 1'
    );
    if (rows && rows.length > 0 && !isNaN(parseInt(rows[0].setting_value, 10))) {
      return parseInt(rows[0].setting_value, 10);
    }
    return 1825; // Default provisional retention
  }

  /**
   * Purge evidence attachment record and delete backing file
   */
  static async purgeEvidenceAttachment(attachmentId, actorUser, req = null) {
    const actorRole = (actorUser?.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(actorRole)) {
      throw new ForbiddenError('Only Super Admin or Admin can authorize maintenance evidence purging.');
    }

    const rows = await pool.query(
      'SELECT * FROM operational_evidence_attachments WHERE id = ?',
      [attachmentId]
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundError(`Evidence attachment #${attachmentId} not found.`);
    }
    const attachment = rows[0];

    const fullPath = path.resolve(__dirname, '../../../', attachment.file_path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    await pool.query('DELETE FROM operational_evidence_attachments WHERE id = ?', [attachmentId]);

    // Record immutable audit event
    await AuditService.record({
      req,
      actorId: actorUser?.id,
      actorEmail: actorUser?.email,
      actorRole: actorUser?.role,
      action: 'MAINTENANCE_EVIDENCE_PURGED',
      entityType: 'operational_evidence',
      entityId: String(attachmentId),
      details: {
        maintenanceId: attachment.maintenance_id,
        workOrderReference: attachment.work_order_reference,
        fileName: attachment.file_name,
        filePath: attachment.file_path,
      },
    });

    return { success: true, purgedId: attachmentId };
  }

  /**
   * Stream maintenance evidence attachment file with security headers and traversal prevention
   * @param {number|string} workOrderId
   * @param {number|string} evidenceIdentifier - Numeric attachment ID or string file_name
   * @param {object} user - Authenticated user context
   * @returns {Promise<{ stream: fs.ReadStream, mimeType: string, fileName: string, fileSizeBytes: number, attachment: object }>}
   */
  static async getEvidenceStream(workOrderId, evidenceIdentifier, user = null) {
    const maintId = parseInt(workOrderId, 10);
    if (!maintId || isNaN(maintId)) {
      throw new ValidationError('A valid numeric work order ID is required.');
    }

    if (!evidenceIdentifier || !String(evidenceIdentifier).trim()) {
      throw new ValidationError('Evidence identifier (ID or filename) is required.');
    }

    // 1. Fetch work order to verify existence and property scope
    const maintRows = await pool.query(
      'SELECT id, issue_code, property_id FROM maintenance_requests WHERE id = ?',
      [maintId]
    );
    if (!maintRows || maintRows.length === 0) {
      throw new NotFoundError(`Maintenance request #${workOrderId} not found.`);
    }
    const maint = maintRows[0];

    // Property scope check on work order
    const MaintenanceService = require('./maintenance.service');
    if (user) {
      MaintenanceService.validatePropertyScope(user, maint.property_id);
    }

    // 2. Fetch evidence attachment by ID or file_name
    let attachmentRows;
    const isNumericId = !isNaN(parseInt(evidenceIdentifier, 10)) && String(parseInt(evidenceIdentifier, 10)) === String(evidenceIdentifier);
    if (isNumericId) {
      attachmentRows = await pool.query(
        `SELECT * FROM operational_evidence_attachments 
         WHERE id = ? AND (maintenance_id = ? OR work_order_reference = ?)`,
        [parseInt(evidenceIdentifier, 10), maint.id, maint.issue_code]
      );
    } else {
      attachmentRows = await pool.query(
        `SELECT * FROM operational_evidence_attachments 
         WHERE file_name = ? AND (maintenance_id = ? OR work_order_reference = ?)`,
        [String(evidenceIdentifier).trim(), maint.id, maint.issue_code]
      );
    }

    if (!attachmentRows || attachmentRows.length === 0) {
      throw new NotFoundError(`Evidence attachment '${evidenceIdentifier}' not found for work order #${workOrderId}.`);
    }
    const attachment = attachmentRows[0];

    // Property scope check on attachment
    if (user && attachment.property_id) {
      MaintenanceService.validatePropertyScope(user, attachment.property_id);
    }

    // 3. Resolve path and perform canonical realpath containment check
    const dirs = this.ensureDirectories();
    const fullPath = path.resolve(__dirname, '../../../', attachment.file_path);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundError(`Evidence file '${attachment.file_name}' not found on storage disk.`);
    }

    // Canonical realpath containment check (strictly prevents symlinks and traversal outside private storage)
    const baseCanonical = fs.realpathSync(dirs.base);
    const targetCanonical = fs.realpathSync(fullPath);
    if (!targetCanonical.startsWith(baseCanonical)) {
      throw new ForbiddenError('Security boundary violation: File path resolves outside private storage root.');
    }

    const stat = fs.statSync(targetCanonical);
    const stream = fs.createReadStream(targetCanonical);

    return {
      stream,
      mimeType: attachment.mime_type || 'image/jpeg',
      fileName: attachment.file_name,
      fileSizeBytes: stat.size,
      attachment,
    };
  }

  /**
   * List evidence attachments for a work order
   * @param {number|string} workOrderId
   * @param {object} user - Authenticated user context
   * @returns {Promise<Array<object>>}
   */
  static async listEvidence(workOrderId, user = null) {
    const maintId = parseInt(workOrderId, 10);
    if (!maintId || isNaN(maintId)) {
      throw new ValidationError('A valid numeric work order ID is required.');
    }

    const maintRows = await pool.query(
      'SELECT id, issue_code, property_id FROM maintenance_requests WHERE id = ?',
      [maintId]
    );
    if (!maintRows || maintRows.length === 0) {
      throw new NotFoundError(`Maintenance request #${workOrderId} not found.`);
    }
    const maint = maintRows[0];

    const MaintenanceService = require('./maintenance.service');
    if (user) {
      MaintenanceService.validatePropertyScope(user, maint.property_id);
    }

    const rows = await pool.query(
      `SELECT id, maintenance_id, work_order_reference, property_id, apartment_id,
              evidence_category, file_name, file_url, mime_type, file_size_bytes,
              caption, uploaded_by_id, verification_status, created_at
       FROM operational_evidence_attachments
       WHERE maintenance_id = ? OR work_order_reference = ?
       ORDER BY id ASC`,
      [maint.id, maint.issue_code]
    );

    return rows.map((r) => ({
      ...r,
      streamUrl: `/api/v1/maintenance/${maint.id}/evidence/${r.id}/stream`,
    }));
  }

  /**
   * Purge single evidence record and delete disk file with audit logging
   * @param {number|string} workOrderId
   * @param {number|string} evidenceIdentifier
   * @param {object} actorUser
   * @param {string} justification
   * @param {object} req
   */
  static async purgeEvidenceRecord(workOrderId, evidenceIdentifier, actorUser, justification = null, req = null) {
    const actorRole = (actorUser?.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER'].includes(actorRole)) {
      throw new ForbiddenError('Unauthorized: Only management roles can delete maintenance evidence.');
    }

    const maintId = parseInt(workOrderId, 10);
    const maintRows = await pool.query(
      'SELECT id, issue_code, property_id FROM maintenance_requests WHERE id = ?',
      [maintId]
    );
    if (!maintRows || maintRows.length === 0) {
      throw new NotFoundError(`Maintenance request #${workOrderId} not found.`);
    }
    const maint = maintRows[0];

    const MaintenanceService = require('./maintenance.service');
    if (actorUser) {
      MaintenanceService.validatePropertyScope(actorUser, maint.property_id);
    }

    let attachmentRows;
    const isNumericId = !isNaN(parseInt(evidenceIdentifier, 10)) && String(parseInt(evidenceIdentifier, 10)) === String(evidenceIdentifier);
    if (isNumericId) {
      attachmentRows = await pool.query(
        'SELECT * FROM operational_evidence_attachments WHERE id = ? AND (maintenance_id = ? OR work_order_reference = ?)',
        [parseInt(evidenceIdentifier, 10), maint.id, maint.issue_code]
      );
    } else {
      attachmentRows = await pool.query(
        'SELECT * FROM operational_evidence_attachments WHERE file_name = ? AND (maintenance_id = ? OR work_order_reference = ?)',
        [String(evidenceIdentifier).trim(), maint.id, maint.issue_code]
      );
    }

    if (!attachmentRows || attachmentRows.length === 0) {
      throw new NotFoundError(`Evidence attachment '${evidenceIdentifier}' not found for work order #${workOrderId}.`);
    }
    const attachment = attachmentRows[0];

    // Delete file from disk if present
    const fullPath = path.resolve(__dirname, '../../../', attachment.file_path);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (err) {
        logger.warn(`Could not delete evidence file ${fullPath}: ${err.message}`);
      }
    }

    // Delete record from database
    await pool.query('DELETE FROM operational_evidence_attachments WHERE id = ?', [attachment.id]);

    // Record immutable audit event
    await AuditService.record({
      req,
      actorId: actorUser?.id,
      actorEmail: actorUser?.email,
      actorRole: actorUser?.role,
      action: 'MAINTENANCE_EVIDENCE_PURGED',
      entityType: 'operational_evidence',
      entityId: String(attachment.id),
      newValues: {
        workOrderId: maint.id,
        workOrderReference: maint.issue_code,
        fileName: attachment.file_name,
        filePath: attachment.file_path,
        justification: justification || 'Authorized deletion by management',
      },
    });

    return {
      success: true,
      purgedId: attachment.id,
      fileName: attachment.file_name,
      message: 'Evidence attachment purged successfully',
    };
  }
}

module.exports = PrivateStorageService;
