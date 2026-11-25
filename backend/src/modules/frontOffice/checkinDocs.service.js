const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../../db/pool');
const ReservationsService = require('../reservations/reservations.service');
const AuditService = require('../../core/audit/audit.service');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../core/errors/apiError');

const ALLOWED_DOC_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB

class CheckinDocsService {
  static async getAuthorizedReservation(reservationId, user) {
    const [res] = await pool.query(
      `SELECT r.*, p.name AS property_name, p.code AS property_code,
              a.unit_number, a.unit_name, a.unit_type, a.status AS unit_status,
              a.housekeeping_status, a.maintenance_status,
              u_staff.name AS assigned_staff_name
       FROM reservations r
       JOIN properties p ON p.id = r.property_id
       JOIN apartments a ON a.id = r.apartment_id
       LEFT JOIN users u_staff ON u_staff.id = r.assigned_staff_id
       WHERE r.id = ?
       LIMIT 1`,
      [reservationId]
    );
    if (!res) throw new NotFoundError(`Reservation #${reservationId} not found.`);
    ReservationsService.validatePropertyScope(user, res.property_id);
    return res;
  }

  static async getDocumentTypes() {
    return pool.query(
      'SELECT * FROM checkin_document_types WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
    );
  }

  static async getCheckinSession(reservationId, user) {
    const res = await this.getAuthorizedReservation(reservationId, user);
    const [session] = await pool.query(
      'SELECT * FROM checkin_sessions WHERE reservation_id = ? LIMIT 1',
      [res.id]
    );
    return session || null;
  }

  static async upsertCheckinSession(reservationId, data = {}, user) {
    const res = await this.getAuthorizedReservation(reservationId, user);
    const existing = await this.getCheckinSession(reservationId, user);

    const occupantNamesJson = Array.isArray(data.occupantNames)
      ? JSON.stringify(data.occupantNames)
      : (typeof data.occupantNames === 'string' ? data.occupantNames : null);

    const ackMethod = data.clientAcknowledged ? (data.acknowledgmentMethod || 'DIGITAL_SIGNATURE') : null;
    const ackTs = data.clientAcknowledged ? new Date() : null;

    if (existing) {
      await pool.query(
        `UPDATE checkin_sessions
         SET document_type_code = ?, document_id_number = ?, document_issuing_country = ?,
             document_expiry_date = ?, actual_occupant_count = ?, occupant_names = ?,
             vehicle_registration = ?, client_acknowledged = ?, acknowledgment_timestamp = COALESCE(acknowledgment_timestamp, ?),
             acknowledgment_method = COALESCE(acknowledgment_method, ?),
             emergency_contact_name = ?, emergency_contact_phone = ?, emergency_contact_relationship = ?,
             checkin_notes = ?, special_requirements = ?, status = ?, updated_at = NOW()
         WHERE reservation_id = ?`,
        [
          data.documentTypeCode || null,
          data.documentIdNumber || null,
          data.documentIssuingCountry || 'Nigeria',
          data.documentExpiryDate || null,
          data.actualOccupantCount ? parseInt(data.actualOccupantCount, 10) : null,
          occupantNamesJson,
          data.vehicleRegistration || null,
          data.clientAcknowledged ? 1 : 0,
          ackTs,
          ackMethod,
          data.emergencyContactName || null,
          data.emergencyContactPhone || null,
          data.emergencyContactRelationship || null,
          data.checkinNotes || null,
          data.specialRequirements || null,
          data.clientAcknowledged ? 'IN_PROGRESS' : (existing.status || 'PENDING'),
          res.id,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO checkin_sessions (
          reservation_id, property_id, document_type_code, document_id_number,
          document_issuing_country, document_expiry_date, actual_occupant_count,
          occupant_names, vehicle_registration, client_acknowledged, acknowledgment_timestamp,
          acknowledgment_method, emergency_contact_name, emergency_contact_phone,
          emergency_contact_relationship, checkin_notes, special_requirements,
          status, created_by_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          res.id,
          res.property_id,
          data.documentTypeCode || null,
          data.documentIdNumber || null,
          data.documentIssuingCountry || 'Nigeria',
          data.documentExpiryDate || null,
          data.actualOccupantCount ? parseInt(data.actualOccupantCount, 10) : null,
          occupantNamesJson,
          data.vehicleRegistration || null,
          data.clientAcknowledged ? 1 : 0,
          ackTs,
          ackMethod,
          data.emergencyContactName || null,
          data.emergencyContactPhone || null,
          data.emergencyContactRelationship || null,
          data.checkinNotes || null,
          data.specialRequirements || null,
          data.clientAcknowledged ? 'IN_PROGRESS' : 'PENDING',
          user.id,
        ]
      );
    }

    await AuditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'CHECKIN_DETAILS_UPDATED',
      entityType: 'reservation',
      entityId: String(res.id),
      newValues: { documentTypeCode: data.documentTypeCode, clientAcknowledged: Boolean(data.clientAcknowledged) },
    });

    return this.getCheckinSession(reservationId, user);
  }

  static async listDocuments(reservationId, user) {
    const res = await this.getAuthorizedReservation(reservationId, user);
    return pool.query(
      `SELECT cd.id, cd.reservation_id, cd.property_id, cd.document_type_code,
              cd.original_filename, cd.file_size_bytes, cd.mime_type,
              cd.upload_status, cd.verification_status, cd.uploaded_at, cd.verified_at,
              u.name AS uploaded_by_name, v.name AS verified_by_name
       FROM checkin_documents cd
       LEFT JOIN users u ON u.id = cd.uploaded_by_id
       LEFT JOIN users v ON v.id = cd.verified_by_id
       WHERE cd.reservation_id = ? AND cd.is_latest = 1
       ORDER BY cd.uploaded_at DESC`,
      [res.id]
    );
  }

  static async uploadDocument(reservationId, { documentTypeCode, fileBase64, originalFilename, mimeType }, user) {
    const res = await this.getAuthorizedReservation(reservationId, user);
    if (!documentTypeCode || !fileBase64) {
      throw new BadRequestError('documentTypeCode and fileBase64 are required.');
    }

    const cleanMime = (mimeType || '').toLowerCase();
    if (!ALLOWED_DOC_MIMES.includes(cleanMime)) {
      throw new BadRequestError(`Invalid file type '${mimeType}'. Allowed: PDF, JPG, PNG, WebP.`);
    }

    const rawB64 = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(rawB64, 'base64');
    if (buf.length > MAX_DOC_BYTES) {
      throw new BadRequestError('File size exceeds 10 MB limit.');
    }

    const extMap = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    const ext = extMap[cleanMime] || 'bin';
    const storedName = `${crypto.randomUUID().replace(/-/g, '')}.${ext}`;
    const relPath = path.join('private_uploads', 'checkin-docs', String(res.property_id), String(res.id), storedName).replace(/\\/g, '/');
    const absDir = path.resolve(__dirname, '../../../private_uploads/checkin-docs', String(res.property_id), String(res.id));
    fs.mkdirSync(absDir, { recursive: true });
    fs.writeFileSync(path.join(absDir, storedName), buf);

    // Mark previous latest documents of the same type as replaced
    await pool.query(
      `UPDATE checkin_documents
       SET is_latest = 0, upload_status = 'REPLACED', replaced_at = NOW()
       WHERE reservation_id = ? AND document_type_code = ? AND is_latest = 1`,
      [res.id, documentTypeCode]
    );

    const insertRes = await pool.query(
      `INSERT INTO checkin_documents (
        reservation_id, property_id, document_type_code, original_filename,
        stored_filename, file_path, file_size_bytes, mime_type,
        upload_status, verification_status, is_latest, uploaded_by_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADED', 'PENDING', 1, ?)`,
      [
        res.id,
        res.property_id,
        documentTypeCode,
        originalFilename || storedName,
        storedName,
        relPath,
        buf.length,
        cleanMime,
        user.id,
      ]
    );

    await AuditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'CHECKIN_DOCUMENT_UPLOADED',
      entityType: 'checkin_document',
      entityId: String(insertRes.insertId),
      newValues: { reservationId: res.id, documentTypeCode, mimeType: cleanMime, fileSizeBytes: buf.length },
    });

    return {
      id: insertRes.insertId,
      reservationId: res.id,
      documentTypeCode,
      originalFilename: originalFilename || storedName,
      mimeType: cleanMime,
      fileSizeBytes: buf.length,
      uploadStatus: 'UPLOADED',
    };
  }

  static async serveDocument(docId, user) {
    const [doc] = await pool.query(
      `SELECT cd.*, r.property_id
       FROM checkin_documents cd
       JOIN reservations r ON r.id = cd.reservation_id
       WHERE cd.id = ? LIMIT 1`,
      [docId]
    );
    if (!doc) throw new NotFoundError('Document not found.');
    ReservationsService.validatePropertyScope(user, doc.property_id);

    const absPath = path.resolve(__dirname, '../../../', doc.file_path);
    if (!fs.existsSync(absPath)) {
      throw new NotFoundError('Stored document file is missing from private storage.');
    }
    return {
      absolutePath: absPath,
      mimeType: doc.mime_type,
      originalFilename: doc.original_filename,
    };
  }

  static async getPaymentTransactionRefs(reservationId, user) {
    const res = await this.getAuthorizedReservation(reservationId, user);
    return pool.query(
      `SELECT ptr.*, u_rec.name AS recorded_by_name, u_ver.name AS verified_by_name
       FROM payment_transaction_refs ptr
       LEFT JOIN users u_rec ON u_rec.id = ptr.recorded_by_id
       LEFT JOIN users u_ver ON u_ver.id = ptr.verified_by_id
       WHERE ptr.reservation_id = ?
       ORDER BY ptr.recorded_at DESC, ptr.id DESC`,
      [res.id]
    );
  }

  /**
   * Record structured payment transaction reference (does NOT auto-verify payment)
   */
  static async recordPaymentRef(reservationId, data = {}, user) {
    const res = await this.getAuthorizedReservation(reservationId, user);
    const cleanRef = (data.transactionReference || '').trim();
    const numAmount = parseFloat(data.amount);

    if (!cleanRef) {
      throw new BadRequestError('Unique transaction reference / identifier is required.');
    }
    if (!numAmount || numAmount <= 0) {
      throw new BadRequestError('Valid payment amount greater than 0 is required.');
    }

    // Duplicate detection within property
    const [existing] = await pool.query(
      'SELECT id, reservation_id, verification_status FROM payment_transaction_refs WHERE transaction_reference = ? AND property_id = ? LIMIT 1',
      [cleanRef, res.property_id]
    );

    if (existing) {
      return {
        isDuplicate: true,
        existingId: existing.id,
        existingReservationId: existing.reservation_id,
        verificationStatus: existing.verification_status,
        message: 'Duplicate transaction reference detected. No duplicate ledger entry created.',
      };
    }

    const insertRes = await pool.query(
      `INSERT INTO payment_transaction_refs (
        reservation_id, property_id, transaction_reference, reference_type, payment_rail,
        amount, currency, payment_date, payment_datetime,
        payer_name, payer_account_number, payer_bank_name,
        receiving_account_last4, receiving_bank,
        verification_status, is_duplicate, recorded_by_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)`,
      [
        res.id,
        res.property_id,
        cleanRef,
        data.referenceType || 'CLIENT_SUPPLIED',
        data.paymentRail || 'BANK_TRANSFER',
        numAmount,
        data.currency || 'NGN',
        data.paymentDate || new Date().toISOString().split('T')[0],
        data.paymentDatetime || new Date(),
        data.payerName || res.tenant_name || null,
        data.payerAccountNumber || null,
        data.payerBankName || null,
        data.receivingAccountLast4 || null,
        data.receivingBank || null,
        user.id,
        data.notes || null,
      ]
    );

    // Update reservation primary_transaction_ref if empty
    if (!res.primary_transaction_ref) {
      await pool.query(
        'UPDATE reservations SET primary_transaction_ref = ? WHERE id = ? AND primary_transaction_ref IS NULL',
        [cleanRef, res.id]
      );
    }

    await AuditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'PAYMENT_REFERENCE_RECORDED',
      entityType: 'payment_transaction_ref',
      entityId: String(insertRes.insertId),
      newValues: { reservationId: res.id, transactionReference: cleanRef, amount: numAmount, verificationStatus: 'PENDING' },
    });

    return {
      isDuplicate: false,
      refId: insertRes.insertId,
      verificationStatus: 'PENDING',
    };
  }

  /**
   * Comprehensive 9-gate check-in readiness evaluation
   */
  static async evaluateCheckinReadiness(reservationId, user) {
    const res = await this.getAuthorizedReservation(reservationId, user);
    const [session, docs, paymentRefs] = await Promise.all([
      this.getCheckinSession(reservationId, user),
      this.listDocuments(reservationId, user),
      this.getPaymentTransactionRefs(reservationId, user),
    ]);

    const gates = [
      {
        key: 'BOOKING_VALID',
        label: 'Booking exists and is active',
        passed: !['CANCELLED', 'DECLINED', 'NO_SHOW', 'CHECKED_OUT', 'CHECKED_IN'].includes(res.status),
        detail: `Current status: ${res.status}`,
      },
      {
        key: 'IDENTITY_INFO',
        label: 'Client identity details & check-in acknowledgment',
        passed: Boolean(session?.document_type_code && session?.document_id_number && session?.client_acknowledged),
        detail: session?.client_acknowledged ? `ID: ${session.document_type_code}` : 'Identity details or acknowledgment pending',
      },
      {
        key: 'DOCUMENTS_UPLOADED',
        label: 'Required identification document uploaded',
        passed: docs.length > 0,
        detail: docs.length > 0 ? `${docs.length} document(s) uploaded` : 'No ID document uploaded yet',
      },
      {
        key: 'PAYMENT_SATISFIED',
        label: 'Payment verified or approved pay-at-property',
        passed:
          res.payment_status === 'PAID' ||
          Number(res.paid_amount || 0) >= Number(res.total_amount || 0) ||
          paymentRefs.some((p) => p.verification_status === 'VERIFIED'),
        detail: `Payment status: ${res.payment_status} (Paid: ${res.paid_amount || 0} / ${res.total_amount || 0})`,
      },
      {
        key: 'APARTMENT_READY',
        label: 'Apartment occupancy, housekeeping & maintenance ready',
        passed:
          ['AVAILABLE', 'READY'].includes(res.unit_status) &&
          res.housekeeping_status === 'INSPECTED_READY' &&
          res.maintenance_status === 'OPERATIONAL',
        detail: `Unit: ${res.unit_status} | HK: ${res.housekeeping_status} | Maint: ${res.maintenance_status}`,
      },
    ];

    const readyForCheckIn = gates.every((g) => g.passed);
    return {
      reservation: res,
      session,
      documents: docs,
      paymentRefs,
      gates,
      readyForCheckIn,
    };
  }
}

module.exports = CheckinDocsService;
