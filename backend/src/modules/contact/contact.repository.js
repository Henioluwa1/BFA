const pool = require('../../db/pool');
const FrontOfficeRepository = require('../frontOffice/frontOffice.repository');

class ContactRepository {
  /**
   * Generate next atomic inquiry reference: BFA-INQ-YYYYMM-NNNN
   */
  static async generateNextReference() {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `BFA-INQ-${ym}-`;
    const rows = await pool.query(
      'SELECT inquiry_reference FROM contact_inquiries WHERE inquiry_reference LIKE ? ORDER BY id DESC LIMIT 1',
      [`${prefix}%`]
    );
    let seq = 1;
    if (rows && rows.length > 0 && rows[0].inquiry_reference) {
      const parts = rows[0].inquiry_reference.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!Number.isNaN(lastNum)) seq = lastNum + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  /**
   * Secure backend client matching across reservations, guests, and users.
   * Never exposes unrelated clients; returns match confidence and candidate records.
   */
  static async matchClient({ clientName, clientEmail, clientPhone, bookingReference }) {
    const cleanName = (clientName || '').trim();
    const cleanEmail = (clientEmail || '').trim().toLowerCase();
    const cleanPhone = (clientPhone || '').replace(/\s+/g, '');
    const cleanRef = (bookingReference || '').trim().toUpperCase();

    // 1. Exact booking reference match (strongest)
    if (cleanRef) {
      const resRows = await pool.query(
        `SELECT r.id AS reservation_id, r.reservation_code, r.property_id, r.apartment_id,
                r.guest_id, r.tenant_name, r.tenant_email, r.tenant_phone, r.status,
                r.assigned_staff_id,
                p.name AS property_name, a.unit_number, a.unit_name
         FROM reservations r
         JOIN properties p ON p.id = r.property_id
         LEFT JOIN apartments a ON a.id = r.apartment_id
         WHERE UPPER(r.reservation_code) = ?
         ORDER BY r.created_at DESC
         LIMIT 5`,
        [cleanRef]
      );
      if (resRows && resRows.length === 1) {
        const r = resRows[0];
        const nameMatch =
          cleanName &&
          r.tenant_name &&
          r.tenant_name.toLowerCase().includes(cleanName.split(' ')[0].toLowerCase());
        const emailMatch = cleanEmail && r.tenant_email && r.tenant_email.toLowerCase() === cleanEmail;
        const phoneMatch =
          cleanPhone && r.tenant_phone && r.tenant_phone.replace(/\s+/g, '').endsWith(cleanPhone.slice(-8));

        if (nameMatch || emailMatch || phoneMatch) {
          return {
            confidence: 'EXACT',
            isNewClient: false,
            reservation: r,
            guestId: r.guest_id || null,
            propertyId: r.property_id,
            assignedReceptionistId: r.assigned_staff_id || null,
          };
        }
      }
    }

    // 2. Match by name + (email or phone) on active/recent reservations
    if (cleanName && (cleanEmail || cleanPhone)) {
      const resCandidates = await pool.query(
        `SELECT r.id AS reservation_id, r.reservation_code, r.property_id, r.apartment_id,
                r.guest_id, r.tenant_name, r.tenant_email, r.tenant_phone, r.status,
                r.assigned_staff_id,
                p.name AS property_name, a.unit_number, a.unit_name
         FROM reservations r
         JOIN properties p ON p.id = r.property_id
         LEFT JOIN apartments a ON a.id = r.apartment_id
         WHERE r.status NOT IN ('CANCELLED', 'DECLINED')
           AND LOWER(r.tenant_name) = ?
         ORDER BY r.created_at DESC
         LIMIT 10`,
        [cleanName.toLowerCase()]
      );

      if (resCandidates && resCandidates.length > 0) {
        const strongMatches = resCandidates.filter((r) => {
          const emailOk = cleanEmail && r.tenant_email && r.tenant_email.toLowerCase() === cleanEmail;
          const phoneOk =
            cleanPhone &&
            r.tenant_phone &&
            cleanPhone.length >= 7 &&
            r.tenant_phone.replace(/\D/g, '').endsWith(cleanPhone.replace(/\D/g, '').slice(-8));
          return emailOk || phoneOk;
        });

        if (strongMatches.length === 1) {
          const r = strongMatches[0];
          const emailOk = cleanEmail && r.tenant_email && r.tenant_email.toLowerCase() === cleanEmail;
          const phoneOk =
            cleanPhone &&
            r.tenant_phone &&
            r.tenant_phone.replace(/\D/g, '').endsWith(cleanPhone.replace(/\D/g, '').slice(-8));
          return {
            confidence: emailOk && phoneOk ? 'HIGH' : 'MEDIUM',
            isNewClient: false,
            reservation: r,
            guestId: r.guest_id || null,
            propertyId: r.property_id,
            assignedReceptionistId: r.assigned_staff_id || null,
          };
        }

        // Ambiguous: multiple distinct records match name + identifier or name only
        if (resCandidates.length > 1 && strongMatches.length !== 1) {
          return {
            confidence: 'LOW',
            isNewClient: true,
            reservation: null,
            guestId: null,
            propertyId: null,
            assignedReceptionistId: null,
            ambiguous: true,
          };
        }
      }
    }

    // 3. Fallback: check guests table with name + email/phone
    if (cleanName && (cleanEmail || cleanPhone)) {
      const guestRows = await pool.query(
        `SELECT id, first_name, last_name, display_name, email, phone
         FROM guests
         WHERE LOWER(COALESCE(display_name, TRIM(CONCAT(first_name, ' ', last_name)), '')) = ?
         LIMIT 5`,
        [cleanName.toLowerCase()]
      );
      if (guestRows && guestRows.length === 1) {
        const g = guestRows[0];
        const emailOk = cleanEmail && g.email && g.email.toLowerCase() === cleanEmail;
        const phoneOk =
          cleanPhone &&
          g.phone &&
          cleanPhone.length >= 7 &&
          g.phone.replace(/\D/g, '').endsWith(cleanPhone.replace(/\D/g, '').slice(-8));
        if (emailOk || phoneOk) {
          // Find latest reservation for this guest
          const [latestRes] = await pool.query(
            `SELECT id AS reservation_id, reservation_code, property_id, assigned_staff_id, status
             FROM reservations
             WHERE guest_id = ? AND status NOT IN ('CANCELLED', 'DECLINED')
             ORDER BY created_at DESC LIMIT 1`,
            [g.id]
          );
          return {
            confidence: 'MEDIUM',
            isNewClient: false,
            reservation: latestRes || null,
            guestId: g.id,
            propertyId: latestRes?.property_id || null,
            assignedReceptionistId: latestRes?.assigned_staff_id || null,
          };
        }
      }
    }

    return {
      confidence: 'NONE',
      isNewClient: true,
      reservation: null,
      guestId: null,
      propertyId: null,
      assignedReceptionistId: null,
    };
  }

  /**
   * Check whether a staff user is active & available (not suspended, not INACTIVE, not OFF_DUTY/AWAY if receptionist)
   */
  static async isStaffAvailableForRouting(userId, propertyId = null) {
    if (!userId) return { available: false, reason: 'NO_ASSIGNEE' };
    const [u] = await pool.query(
      'SELECT id, name, role, status, property_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!u) return { available: false, reason: 'USER_NOT_FOUND' };
    if (String(u.status || '').toUpperCase() !== 'ACTIVE') {
      return { available: false, reason: `USER_${String(u.status || 'INACTIVE').toUpperCase()}`, user: u };
    }
    if (propertyId && u.property_id && Number(u.property_id) !== Number(propertyId)) {
      return { available: false, reason: 'PROPERTY_MISMATCH', user: u };
    }

    // Check employee employment_status & latest daily metric availability
    const [emp] = await pool.query(
      'SELECT id, employment_status FROM employees WHERE user_id = ? LIMIT 1',
      [userId]
    );
    if (emp && ['SUSPENDED', 'TERMINATED', 'ON_LEAVE', 'INACTIVE'].includes(String(emp.employment_status || '').toUpperCase())) {
      return { available: false, reason: `EMPLOYEE_${emp.employment_status}`, user: u };
    }

    // Check receptionist_daily_metrics for today if receptionist
    if (String(u.role || '').toUpperCase() === 'RECEPTIONIST') {
      const today = new Date().toISOString().split('T')[0];
      const [metric] = await pool.query(
        `SELECT shift_status, availability_status
         FROM receptionist_daily_metrics
         WHERE receptionist_id = ? AND work_date = ?
         ORDER BY id DESC LIMIT 1`,
        [userId, today]
      );
      if (metric) {
        if (metric.shift_status === 'OFF_DUTY' || metric.availability_status === 'AWAY') {
          return { available: false, reason: `RECEPTIONIST_${metric.availability_status || metric.shift_status}`, user: u };
        }
      }
    }

    return { available: true, user: u };
  }

  /**
   * Resolve responsible Manager (or Admin/Owner fallback) for a property
   */
  static async resolveResponsibleManager(propertyId = null) {
    if (propertyId) {
      const [mgr] = await pool.query(
        `SELECT id, name, role, email, property_id
         FROM users
         WHERE status = 'ACTIVE'
           AND property_id = ?
           AND role IN ('OPERATIONS_MANAGER', 'MANAGER')
         ORDER BY id ASC LIMIT 1`,
        [propertyId]
      );
      if (mgr) return mgr;
    }

    const [fallback] = await pool.query(
      `SELECT id, name, role, email, property_id
       FROM users
       WHERE status = 'ACTIVE'
         AND role IN ('OPERATIONS_MANAGER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN')
       ORDER BY CASE role
         WHEN 'OPERATIONS_MANAGER' THEN 1
         WHEN 'MANAGER' THEN 2
         WHEN 'ADMIN' THEN 3
         WHEN 'OWNER' THEN 4
         ELSE 5
       END, id ASC
       LIMIT 1`
    );
    return fallback || null;
  }

  static async insertInquiry(data) {
    const result = await pool.query(
      `INSERT INTO contact_inquiries (
        inquiry_reference, client_access_code_hash, client_access_code_salt,
        client_name, client_email, client_phone,
        matched_guest_id, booking_reference, matched_reservation_id,
        is_new_client, match_confidence, property_id,
        inquiry_department, inquiry_category, inquiry_subject, inquiry_message,
        attachment_path, attachment_filename, attachment_mime,
        assigned_receptionist_id, assigned_manager_id, current_assignee_id, current_assignee_role,
        routing_reason, response_sla_minutes, response_sla_deadline_at,
        status, priority, submitted_ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.inquiryReference,
        data.accessCodeHash,
        data.accessCodeSalt,
        data.clientName,
        data.clientEmail || null,
        data.clientPhone || null,
        data.matchedGuestId || null,
        data.bookingReference || null,
        data.matchedReservationId || null,
        data.isNewClient ? 1 : 0,
        data.matchConfidence || 'NONE',
        data.propertyId || null,
        data.inquiryDepartment,
        data.inquiryCategory || null,
        data.inquirySubject || null,
        data.inquiryMessage,
        data.attachmentPath || null,
        data.attachmentFilename || null,
        data.attachmentMime || null,
        data.assignedReceptionistId || null,
        data.assignedManagerId || null,
        data.currentAssigneeId,
        data.currentAssigneeRole,
        data.routingReason || null,
        data.responseSlaMinutes || 90,
        data.responseSlaDeadlineAt,
        data.status || 'ASSIGNED',
        data.priority || 'NORMAL',
        data.submittedIp || null,
      ]
    );
    return result.insertId;
  }

  static async findByReference(inquiryReference) {
    const rows = await pool.query(
      `SELECT ci.*,
              p.name AS property_name,
              u_curr.name AS current_assignee_name, u_curr.role AS current_assignee_user_role,
              u_rec.name AS assigned_receptionist_name,
              u_mgr.name AS assigned_manager_name
       FROM contact_inquiries ci
       LEFT JOIN properties p ON p.id = ci.property_id
       LEFT JOIN users u_curr ON u_curr.id = ci.current_assignee_id
       LEFT JOIN users u_rec ON u_rec.id = ci.assigned_receptionist_id
       LEFT JOIN users u_mgr ON u_mgr.id = ci.assigned_manager_id
       WHERE UPPER(ci.inquiry_reference) = ?
       LIMIT 1`,
      [String(inquiryReference || '').trim().toUpperCase()]
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const rows = await pool.query(
      `SELECT ci.*,
              p.name AS property_name,
              u_curr.name AS current_assignee_name, u_curr.role AS current_assignee_user_role,
              u_rec.name AS assigned_receptionist_name,
              u_mgr.name AS assigned_manager_name,
              r.reservation_code, r.check_in_date, r.check_out_date, r.status AS reservation_status
       FROM contact_inquiries ci
       LEFT JOIN properties p ON p.id = ci.property_id
       LEFT JOIN users u_curr ON u_curr.id = ci.current_assignee_id
       LEFT JOIN users u_rec ON u_rec.id = ci.assigned_receptionist_id
       LEFT JOIN users u_mgr ON u_mgr.id = ci.assigned_manager_id
       LEFT JOIN reservations r ON r.id = ci.matched_reservation_id
       WHERE ci.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  static async listForUser(user, { status, department, propertyId, page = 1, pageSize = 30 } = {}) {
    let sql = `
      SELECT ci.*,
             p.name AS property_name,
             u_curr.name AS current_assignee_name,
             u_rec.name AS assigned_receptionist_name
      FROM contact_inquiries ci
      LEFT JOIN properties p ON p.id = ci.property_id
      LEFT JOIN users u_curr ON u_curr.id = ci.current_assignee_id
      LEFT JOIN users u_rec ON u_rec.id = ci.assigned_receptionist_id
      WHERE 1 = 1
    `;
    const params = [];
    const role = String(user?.role || '').toUpperCase();

    if (role === 'STAFF') {
      sql += ' AND ci.current_assignee_id = ?';
      params.push(user.id);
    } else if (role === 'RECEPTIONIST') {
      if (user.propertyId) {
        sql += ' AND (ci.current_assignee_id = ? OR ci.assigned_receptionist_id = ? OR (ci.property_id = ? AND ci.is_new_client = 0))';
        params.push(user.id, user.id, user.propertyId);
      } else {
        sql += ' AND (ci.current_assignee_id = ? OR ci.assigned_receptionist_id = ?)';
        params.push(user.id, user.id);
      }
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (user.propertyId) {
        sql += ' AND (ci.property_id = ? OR ci.property_id IS NULL OR ci.current_assignee_id = ? OR ci.assigned_manager_id = ?)';
        params.push(user.propertyId, user.id, user.id);
      }
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND ci.property_id = ?';
      params.push(parseInt(propertyId, 10));
    }

    if (status && status !== 'ALL') {
      sql += ' AND ci.status = ?';
      params.push(status);
    }
    if (department && department !== 'ALL') {
      sql += ' AND ci.inquiry_department = ?';
      params.push(department);
    }

    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 30));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
    sql += ' ORDER BY ci.submitted_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return pool.query(sql, params);
  }

  static async insertMessage(data) {
    const res = await pool.query(
      `INSERT INTO inquiry_messages (
        inquiry_id, sender_type, sender_user_id, sender_display_name,
        message_body, is_internal, is_client_response,
        attachment_path, attachment_filename, attachment_mime, attachment_size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.inquiryId,
        data.senderType,
        data.senderUserId || null,
        data.senderDisplayName || null,
        data.messageBody,
        data.isInternal ? 1 : 0,
        data.isClientResponse ? 1 : 0,
        data.attachmentPath || null,
        data.attachmentFilename || null,
        data.attachmentMime || null,
        data.attachmentSizeBytes || null,
      ]
    );
    return res.insertId;
  }

  static async getMessages(inquiryId, includeInternal = false) {
    let sql = `
      SELECT id, inquiry_id, sender_type, sender_user_id, sender_display_name,
             message_body, is_internal, is_client_response,
             attachment_path, attachment_filename, attachment_mime, attachment_size_bytes,
             created_at
      FROM inquiry_messages
      WHERE inquiry_id = ?
    `;
    if (!includeInternal) {
      sql += ' AND is_internal = 0';
    }
    sql += ' ORDER BY created_at ASC, id ASC';
    return pool.query(sql, [inquiryId]);
  }

  static async insertAssignment(data) {
    const res = await pool.query(
      `INSERT INTO inquiry_assignments (
        inquiry_id, previous_assignee_id, previous_assignee_role,
        new_assignee_id, new_assignee_role, assigned_by_id,
        assignment_reason, routing_type, sla_inherited, new_sla_deadline_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.inquiryId,
        data.previousAssigneeId || null,
        data.previousAssigneeRole || null,
        data.newAssigneeId,
        data.newAssigneeRole,
        data.assignedById,
        data.assignmentReason || null,
        data.routingType || 'INITIAL',
        data.slaInherited ? 1 : 0,
        data.newSlaDeadlineAt || null,
      ]
    );
    return res.insertId;
  }

  static async getAssignments(inquiryId) {
    return pool.query(
      `SELECT ia.*,
              u_prev.name AS previous_assignee_name,
              u_new.name AS new_assignee_name,
              u_by.name AS assigned_by_name
       FROM inquiry_assignments ia
       LEFT JOIN users u_prev ON u_prev.id = ia.previous_assignee_id
       LEFT JOIN users u_new ON u_new.id = ia.new_assignee_id
       LEFT JOIN users u_by ON u_by.id = ia.assigned_by_id
       WHERE ia.inquiry_id = ?
       ORDER BY ia.created_at ASC, ia.id ASC`,
      [inquiryId]
    );
  }

  static async upsertSlaLog(data) {
    const existing = await pool.query(
      'SELECT id FROM inquiry_sla_logs WHERE inquiry_id = ? AND assignee_id = ? AND sla_stage = ? LIMIT 1',
      [data.inquiryId, data.assigneeId, data.slaStage]
    );
    if (existing && existing.length > 0) {
      return existing[0].id;
    }
    const res = await pool.query(
      `INSERT INTO inquiry_sla_logs (
        inquiry_id, assignee_id, sla_stage, sla_deadline_at,
        sla_met, breached_at, notification_sent, notification_sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.inquiryId,
        data.assigneeId,
        data.slaStage,
        data.slaDeadlineAt,
        data.slaMet === undefined ? null : (data.slaMet ? 1 : 0),
        data.breachedAt || null,
        data.notificationSent ? 1 : 0,
        data.notificationSentAt || null,
      ]
    );
    return res.insertId;
  }
}

module.exports = ContactRepository;
