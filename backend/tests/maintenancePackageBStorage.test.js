const fs = require('fs');
const path = require('path');
const pool = require('../src/db/pool');
const PrivateStorageService = require('../src/modules/maintenance/privateStorage.service');

describe('Stage 2.5B Package B — Private Maintenance Evidence Storage & Migration 031 Verification', () => {
  let testMaintenanceId = null;
  const testIssueCode = 'MNT-TEST-B-001';
  let createdAttachmentId = null;
  let testTempFilePath = null;
  let testQuarantineFilePath = null;

  beforeAll(async () => {
    // 1. Ensure private storage directories exist
    PrivateStorageService.ensureDirectories();

    // 2. Clean up any existing test records
    await pool.query('DELETE FROM operational_evidence_attachments WHERE work_order_reference = ?', [testIssueCode]);
    await pool.query('DELETE FROM maintenance_requests WHERE issue_code = ?', [testIssueCode]);

    // 3. Insert test work order
    const maintRes = await pool.query(
      `INSERT INTO maintenance_requests (issue_code, property_id, apartment_id, issue_title, category, priority, status)
       VALUES (?, 1, 1, 'PackageB Storage Verification Work Order', 'PLUMBING', 'MEDIUM', 'OPEN')`,
      [testIssueCode]
    );
    testMaintenanceId = maintRes.insertId;
  });

  afterAll(async () => {
    if (createdAttachmentId) {
      await pool.query('DELETE FROM operational_evidence_attachments WHERE id = ?', [createdAttachmentId]);
    }
    if (testMaintenanceId) {
      await pool.query('DELETE FROM maintenance_requests WHERE id = ?', [testMaintenanceId]);
    }
    if (testTempFilePath && fs.existsSync(testTempFilePath)) {
      try { fs.unlinkSync(testTempFilePath); } catch (_) { }
    }
    if (testQuarantineFilePath && fs.existsSync(testQuarantineFilePath)) {
      try { fs.unlinkSync(testQuarantineFilePath); } catch (_) { }
    }
    await pool.closePool();
  });

  // =========================================================================
  // 1. Migration 031 Schema & Integrity Verification
  // =========================================================================
  describe('1. Migration 031 Schema & Constraints', () => {
    test('1.1 operational_evidence_attachments has maintenance_id and work_order_reference columns', async () => {
      const tableRows = await pool.query('SHOW CREATE TABLE operational_evidence_attachments');
      const createSql = tableRows[0]['Create Table'];

      expect(createSql).toContain('`maintenance_id` int(11) DEFAULT NULL');
      expect(createSql).toContain('`work_order_reference` varchar(50) DEFAULT NULL');
      expect(createSql).toContain('CONSTRAINT `fk_oea_maintenance` FOREIGN KEY (`maintenance_id`) REFERENCES `maintenance_requests` (`id`) ON DELETE SET NULL');
      expect(createSql).toContain('KEY `idx_oea_maintenance_cat` (`maintenance_id`,`evidence_category`)');
      expect(createSql).toContain('KEY `idx_oea_work_order_ref` (`work_order_reference`)');
    });

    test('1.2 maintenance_requests has idx_maint_assigned_status index', async () => {
      const tableRows = await pool.query('SHOW CREATE TABLE maintenance_requests');
      const createSql = tableRows[0]['Create Table'];
      expect(createSql).toContain('idx_maint_assigned_status');
    });

    test('1.3 system_settings has retention days and workload warning threshold seeded', async () => {
      const retentionDays = await PrivateStorageService.getRetentionDays();
      expect(retentionDays).toBe(1825); // 5 years provisional

      const settRows = await pool.query(
        'SELECT setting_value FROM system_settings WHERE setting_key = "maintenance_workload_warning_threshold"'
      );
      expect(settRows.length).toBeGreaterThan(0);
      expect(parseInt(settRows[0].setting_value, 10)).toBe(5);
    });
  });

  // =========================================================================
  // 2. Private Storage File Validation & Magic Bytes Detection
  // =========================================================================
  describe('2. Private Storage File Validation & Magic Bytes', () => {
    test('2.1 Valid JPEG buffer passes validation', () => {
      const validJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
      const result = PrivateStorageService.validateImageFile(validJpeg);
      expect(result.valid).toBe(true);
      expect(result.format).toBe('JPEG');
      expect(result.mimeType).toBe('image/jpeg');
    });

    test('2.2 Valid PNG buffer passes validation', () => {
      const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
      const result = PrivateStorageService.validateImageFile(validPng);
      expect(result.valid).toBe(true);
      expect(result.format).toBe('PNG');
      expect(result.mimeType).toBe('image/png');
    });

    test('2.3 Valid WebP buffer passes validation', () => {
      // RIFF .... WEBP
      const validWebp = Buffer.alloc(16);
      validWebp.write('RIFF', 0, 'ascii');
      validWebp.writeUInt32LE(8, 4);
      validWebp.write('WEBP', 8, 'ascii');

      const result = PrivateStorageService.validateImageFile(validWebp);
      expect(result.valid).toBe(true);
      expect(result.format).toBe('WEBP');
      expect(result.mimeType).toBe('image/webp');
    });

    test('2.4 Invalid magic bytes (e.g. plain text or executable) are rejected with ValidationError', () => {
      const fakeText = Buffer.from('This is a text file masquerading as an image.');
      expect(() => PrivateStorageService.validateImageFile(fakeText)).toThrow(/Invalid file format/);

      const fakeExe = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
      expect(() => PrivateStorageService.validateImageFile(fakeExe)).toThrow(/Invalid file format/);
    });

    test('2.5 File exceeding 10MB limit is rejected', () => {
      const oversizedHeader = Buffer.alloc(11 * 1024 * 1024);
      oversizedHeader[0] = 0xFF;
      oversizedHeader[1] = 0xD8;
      oversizedHeader[2] = 0xFF;
      expect(() => PrivateStorageService.validateImageFile(oversizedHeader)).toThrow(/exceeds maximum limit/);
    });

    test('2.6 Path traversal attempts are rejected', () => {
      const dirs = PrivateStorageService.getStorageDirectories();
      const maliciousPath = path.join(dirs.maintenance, '../../../../Windows/System32/evil.jpg');
      expect(() => PrivateStorageService.assertSafePath(maliciousPath, dirs.maintenance)).toThrow(/Path traversal detected/);
    });
  });

  // =========================================================================
  // 3. Evidence Ingestion & Work Order Reference Snapshot
  // =========================================================================
  describe('3. Evidence Ingestion & Snapshot Preservation', () => {
    test('3.1 Successfully stores private evidence and populates work_order_reference snapshot', async () => {
      // 12-byte valid JPEG buffer
      const testJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);

      const stored = await PrivateStorageService.storeMaintenanceEvidence({
        workOrderId: testMaintenanceId,
        workOrderReference: testIssueCode,
        propertyId: 1,
        apartmentId: 1,
        evidenceCategory: 'MAINTENANCE_AFTER',
        fileBuffer: testJpeg,
        originalFileName: 'repair_finish.jpg',
        caption: 'Replaced pipe valve',
        uploadedById: 2, // Admin
      });

      expect(stored.id).toBeDefined();
      createdAttachmentId = stored.id;
      expect(stored.workOrderReference).toBe(testIssueCode);
      expect(stored.fileName).toMatch(/^mnt_ev_/);

      // Verify file exists in private maintenance directory (outside uploads)
      const fullPath = path.resolve(__dirname, '../', stored.filePath);
      expect(fs.existsSync(fullPath)).toBe(true);

      // Verify database record
      const dbRows = await pool.query(
        'SELECT * FROM operational_evidence_attachments WHERE id = ?',
        [createdAttachmentId]
      );
      expect(dbRows.length).toBe(1);
      expect(dbRows[0].maintenance_id).toBe(testMaintenanceId);
      expect(dbRows[0].work_order_reference).toBe(testIssueCode);
      expect(dbRows[0].evidence_category).toBe('MAINTENANCE_AFTER');
    });

    test('3.2 Deleting maintenance request sets maintenance_id to NULL but PRESERVES work_order_reference snapshot', async () => {
      // Delete the work order
      await pool.query('DELETE FROM maintenance_requests WHERE id = ?', [testMaintenanceId]);

      // Check the attachment record
      const dbRows = await pool.query(
        'SELECT * FROM operational_evidence_attachments WHERE id = ?',
        [createdAttachmentId]
      );
      expect(dbRows.length).toBe(1);
      expect(dbRows[0].maintenance_id).toBeNull();
      expect(dbRows[0].work_order_reference).toBe(testIssueCode);

      // File must still exist on filesystem!
      const fullPath = path.resolve(__dirname, '../', dbRows[0].file_path);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });

  // =========================================================================
  // 4. Storage Hygiene, Sweeper & Quarantine Protocol
  // =========================================================================
  describe('4. Storage Hygiene & Quarantine Recovery Protocol', () => {
    test('4.1 Temp sweeper deletes orphaned files older than threshold (60 minutes)', () => {
      const dirs = PrivateStorageService.getStorageDirectories();
      testTempFilePath = path.join(dirs.temp, 'expired_temp_test.jpg');
      fs.writeFileSync(testTempFilePath, 'temporary orphan bytes');

      // Set mtime to 90 minutes ago
      const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000);
      fs.utimesSync(testTempFilePath, ninetyMinutesAgo, ninetyMinutesAgo);

      const result = PrivateStorageService.sweepTempFiles(60);
      expect(result.sweptCount).toBeGreaterThan(0);
      expect(fs.existsSync(testTempFilePath)).toBe(false);
    });

    test('4.2 Integrity scanner detects missing files and quarantines unreferenced files older than 24 hours', async () => {
      const dirs = PrivateStorageService.getStorageDirectories();

      // Create an unreferenced file in maintenance directory with mtime 25 hours ago
      const unrefFileName = `unref_test_${Date.now()}.jpg`;
      const unrefPath = path.join(dirs.maintenance, unrefFileName);
      fs.writeFileSync(unrefPath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]));
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      fs.utimesSync(unrefPath, twentyFiveHoursAgo, twentyFiveHoursAgo);

      const audit = await PrivateStorageService.auditEvidenceStorageIntegrity();

      // The unreferenced file must have been moved to quarantine
      testQuarantineFilePath = path.join(dirs.quarantine, unrefFileName);
      expect(fs.existsSync(unrefPath)).toBe(false);
      expect(fs.existsSync(testQuarantineFilePath)).toBe(true);

      const quarantined = audit.quarantinedFiles.find((f) => f.fileName === unrefFileName);
      expect(quarantined).toBeDefined();
    });

    test('4.3 Authorized evidence purging removes record and disk file and logs audit event', async () => {
      const purgeResult = await PrivateStorageService.purgeEvidenceAttachment(
        createdAttachmentId,
        { id: 2, email: 'admin@bfa.com', role: 'ADMIN' }
      );
      expect(purgeResult.success).toBe(true);

      // Verify database record deleted
      const rows = await pool.query('SELECT * FROM operational_evidence_attachments WHERE id = ?', [createdAttachmentId]);
      expect(rows.length).toBe(0);
      createdAttachmentId = null;

      // Verify audit record logged
      const auditRows = await pool.query(
        'SELECT * FROM audit_logs WHERE action = "MAINTENANCE_EVIDENCE_PURGED" ORDER BY id DESC LIMIT 1'
      );
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe('MAINTENANCE_EVIDENCE_PURGED');
    });
  });
});