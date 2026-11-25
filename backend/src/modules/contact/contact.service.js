const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const pool = require('../../db/pool');
const ContactRepository = require('./contact.repository');
const NotificationsService = require('../notifications/notifications.service');
const ChatRepository = require('../chat/chat.repository');
const AuditService = require('../../core/audit/audit.service');
const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} = require('../../core/errors/apiError');

const SLA_MINUTES = 90;
const MAX_LOOKUP_ATTEMPTS = 5;
const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/webm',
];
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

class ContactService {
  /**
   * Persist base64 attachment to private storage (non-public path)
   */
  static savePrivateAttachment(base64Data, originalFilename, mimeType, subfolder = 'inquiries') {
    if (!base64Data) return null;
    const cleanMime = (mimeType || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(cleanMime)) {
      throw new BadRequestError(`Unsupported file type '${mimeType}'. Allowed: JPG, PNG, WebP, PDF, MP4, WebM.`);
    }
    const rawB64 = String(base64Data).replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(rawB64, 'base64');
    if (buf.length > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestError('Attachment exceeds the 10 MB size limit.');
    }

    const extMap = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    };
    const ext = extMap[cleanMime] || 'bin';
    const storedName = `${crypto.randomUUID().replace(/-/g, '')}.${ext}`;
    const relPath = path.join('private_uploads', subfolder, storedName).replace(/\\/g, '/');
    const absDir = path.resolve(__dirname, '../../../private_uploads', subfolder);
    fs.mkdirSync(absDir, { recursive: true });
    fs.writeFileSync(path.join(absDir, storedName), buf);

    return {
      filePath: relPath,
      filename: originalFilename || storedName,
      mimeType: cleanMime,
      sizeBytes: buf.length,
    };
  }

  /**
   * Dispatch inquiry card to assignee's Staff Chat DM
   */
  static async dispatchStaffChatCard({ assigneeId, propertyId, inquiryId, inquiryReference, clientName, department, message, slaDeadline }) {
    try {
      const systemSender = await ContactRepository.resolveResponsibleManager(propertyId);
      const senderId = systemSender && Number(systemSender.id) !== Number(assigneeId)
        ? systemSender.id
        : assigneeId;
      const thread = await ChatRepository.findOrCreateDirectThread(senderId, assigneeId);
      if (!thread?.id) return;

      const cardBody = [
        `[OFFICIAL CLIENT INQUIRY CARD]`,
        `Ticket Ref: ${inquiryReference}`,
        `Department: ${department}`,
        `Client: ${clientName}`,
        `SLA Deadline: ${new Date(slaDeadline).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} WAT`,
        `Message: ${String(message).slice(0, 300)}`,
        `Action: Open Inquiry #${inquiryReference} in Front Office / Inquiries`,
      ].join('\n');

      await pool.query(
        `INSERT INTO chat_messages (thread_id, sender_id, message_type, body, metadata, created_at)
         VALUES (?, ?, 'SYSTEM_CARD', ?, ?, NOW())`,
        [
          thread.id,
          senderId,
          cardBody,
          JSON.stringify({ entityType: 'contact_inquiry', inquiryId, inquiryReference, department }),
        ]
      );
    } catch {
      // Non-fatal: notification & inquiry record remain authoritative
    }
  }

  /**
   * Public: Submit Contact Desk inquiry -> matches client, routes to Receptionist or Manager, starts 90-min SLA
   */
  static async submitInquiry({
    clientName,
    clientEmail,
    clientPhone,
    inquiryDepartment,
    inquiryCategory,
    inquirySubject,
    message,
    bookingReference,
    propertyInterest,
    attachmentBase64,
    attachmentFilename,
    attachmentMime,
    ipAddress,
  }) {
    const cleanName = (clientName || '').trim();
    const cleanDept = (inquiryDepartment || '').trim();
    const cleanMessage = (message || '').trim();

    if (!cleanName || !cleanDept || !cleanMessage) {
      throw new BadRequestError('Full name, inquiry department, and message are required.');
    }

    const inquiryReference = await ContactRepository.generateNextReference();
    const plainAccessCode = crypto.randomBytes(9).toString('base64url').slice(0, 12).toUpperCase();
    const salt = await bcrypt.genSalt(10);
    const accessCodeHash = await bcrypt.hash(plainAccessCode, salt);

    // Optional attachment
    let savedAttachment = null;
    if (attachmentBase64) {
      savedAttachment = this.savePrivateAttachment(attachmentBase64, attachmentFilename, attachmentMime, 'inquiries');
    }

    // Secure backend client matching
    const match = await ContactRepository.matchClient({
      clientName: cleanName,
      clientEmail,
      clientPhone,
      bookingReference,
    });

    // Resolve propertyId from matched reservation or propertyInterest hint
    let propertyId = match.propertyId || null;
    if (!propertyId && propertyInterest && propertyInterest !== 'ALL') {
      const codeMap = {
        GRAND_HORIZON: 'GHT',
        AZURE_BAY: 'ABR',
        ROYAL_PALMS: 'RPS',
      };
      const hint = codeMap[propertyInterest] || propertyInterest;
      const [propRow] = await pool.query(
        'SELECT id FROM properties WHERE UPPER(code) LIKE ? OR UPPER(name) LIKE ? LIMIT 1',
        [`%${hint}%`, `%${propertyInterest.replace(/_/g, ' ')}%`]
      );
      if (propRow) propertyId = propRow.id;
    }

    // Determine routing: active assigned receptionist -> else Manager
    let assignedReceptionistId = match.assignedReceptionistId || null;
    let assignedManagerId = null;
    let currentAssigneeId = null;
    let currentAssigneeRole = 'MANAGER';
    let routingReason = 'NEW_UNMATCHED_CLIENT_TO_MANAGER';
    let priority = 'NORMAL';

    const manager = await ContactRepository.resolveResponsibleManager(propertyId);
    assignedManagerId = manager?.id || 1;

    if (!match.isNewClient && assignedReceptionistId) {
      const avail = await ContactRepository.isStaffAvailableForRouting(assignedReceptionistId, propertyId);
      if (avail.available) {
        currentAssigneeId = assignedReceptionistId;
        currentAssigneeRole = avail.user.role || 'RECEPTIONIST';
        routingReason = 'EXISTING_CLIENT_ASSIGNED_RECEPTIONIST';
        priority = 'CRITICAL';
      } else {
        currentAssigneeId = assignedManagerId;
        currentAssigneeRole = manager?.role || 'MANAGER';
        routingReason = `RECEPTIONIST_BYPASSED_${avail.reason}`;
        priority = 'HIGH';
      }
    } else if (!match.isNewClient) {
      currentAssigneeId = assignedManagerId;
      currentAssigneeRole = manager?.role || 'MANAGER';
      routingReason = 'EXISTING_CLIENT_NO_ACTIVE_RECEPTIONIST';
      priority = 'HIGH';
    } else {
      currentAssigneeId = assignedManagerId;
      currentAssigneeRole = manager?.role || 'MANAGER';
      routingReason = match.ambiguous ? 'AMBIGUOUS_IDENTITY_SAFE_MANAGER_ROUTE' : 'NEW_UNMATCHED_CLIENT_TO_MANAGER';
    }

    const slaDeadline = new Date(Date.now() + SLA_MINUTES * 60 * 1000);

    const inquiryId = await ContactRepository.insertInquiry({
      inquiryReference,
      accessCodeHash,
      accessCodeSalt: salt,
      clientName: cleanName,
      clientEmail: (clientEmail || '').trim() || null,
      clientPhone: (clientPhone || '').trim() || null,
      matchedGuestId: match.guestId,
      bookingReference: (bookingReference || '').trim() || match.reservation?.reservation_code || null,
      matchedReservationId: match.reservation?.reservation_id || null,
      isNewClient: match.isNewClient,
      matchConfidence: match.confidence,
      propertyId,
      inquiryDepartment: cleanDept,
      inquiryCategory: inquiryCategory || cleanDept,
      inquirySubject: inquirySubject || `${cleanDept} Inquiry from ${cleanName}`,
      inquiryMessage: cleanMessage,
      attachmentPath: savedAttachment?.filePath || null,
      attachmentFilename: savedAttachment?.filename || null,
      attachmentMime: savedAttachment?.mimeType || null,
      assignedReceptionistId,
      assignedManagerId,
      currentAssigneeId,
      currentAssigneeRole,
      routingReason,
      responseSlaMinutes: SLA_MINUTES,
      responseSlaDeadlineAt: slaDeadline,
      status: 'ASSIGNED',
      priority,
      submittedIp: ipAddress || null,
    });

    // Record initial assignment & SLA log
    await ContactRepository.insertAssignment({
      inquiryId,
      previousAssigneeId: null,
      previousAssigneeRole: null,
      newAssigneeId: currentAssigneeId,
      newAssigneeRole: currentAssigneeRole,
      assignedById: currentAssigneeId,
      assignmentReason: routingReason,
      routingType: 'INITIAL',
      slaInherited: false,
      newSlaDeadlineAt: slaDeadline,
    });

    await ContactRepository.upsertSlaLog({
      inquiryId,
      assigneeId: currentAssigneeId,
      slaStage: 'ASSIGNED',
      slaDeadlineAt: slaDeadline,
      notificationSent: true,
      notificationSentAt: new Date(),
    });

    // Critical notification to assignee
    await NotificationsService.dispatchNotification({
      recipientId: currentAssigneeId,
      propertyId,
      title: `[${cleanDept}] ${priority === 'CRITICAL' ? 'CRITICAL: ' : ''}Client Inquiry ${inquiryReference}`,
      message: `${cleanName} submitted a ${cleanDept} inquiry. Response SLA: 90 minutes.`,
      category: 'COMMUNICATION',
      priority: priority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      sourceEntityType: 'contact_inquiry',
      sourceEntityId: String(inquiryId),
      linkUrl: `/front-office?inquiry=${inquiryReference}`,
    });

    // Send Staff Chat DM card
    await this.dispatchStaffChatCard({
      assigneeId: currentAssigneeId,
      propertyId,
      inquiryId,
      inquiryReference,
      clientName: cleanName,
      department: cleanDept,
      message: cleanMessage,
      slaDeadline,
    });

    await AuditService.record({
      action: 'INQUIRY_SUBMITTED_AND_ROUTED',
      entityType: 'contact_inquiry',
      entityId: String(inquiryId),
      newValues: {
        inquiryReference,
        inquiryDepartment: cleanDept,
        matchConfidence: match.confidence,
        currentAssigneeId,
        routingReason,
      },
    });

    return {
      inquiryReference,
      clientAccessCode: plainAccessCode,
      inquiryDepartment: cleanDept,
      status: 'ASSIGNED',
      slaDeadline: slaDeadline.toISOString(),
    };
  }

  /**
   * Public: Rate-limited access-code lookup -> returns short-lived session token
   */
  static async lookupByAccessCode({ inquiryReference, accessCode }) {
    const cleanRef = (inquiryReference || '').trim().toUpperCase();
    const cleanCode = (accessCode || '').trim();
    if (!cleanRef || !cleanCode) {
      throw new BadRequestError('Both Inquiry Reference and Access Code are required.');
    }

    const inquiry = await ContactRepository.findByReference(cleanRef);
    if (!inquiry) {
      throw new NotFoundError('No inquiry found matching that reference and access code.');
    }

    // Rate-limit check per inquiry
    const lastAttempt = inquiry.lookup_last_attempt_at ? new Date(inquiry.lookup_last_attempt_at).getTime() : 0;
    const withinWindow = Date.now() - lastAttempt < LOOKUP_WINDOW_MS;
    const attemptCount = withinWindow ? (inquiry.lookup_attempt_count || 0) : 0;

    if (attemptCount >= MAX_LOOKUP_ATTEMPTS) {
      throw new BadRequestError('Too many failed lookup attempts. Please wait 15 minutes before trying again.');
    }

    const isMatch = await bcrypt.compare(cleanCode, inquiry.client_access_code_hash);
    if (!isMatch) {
      await pool.query(
        'UPDATE contact_inquiries SET lookup_attempt_count = ?, lookup_last_attempt_at = NOW() WHERE id = ?',
        [attemptCount + 1, inquiry.id]
      );
      throw new UnauthorizedError('Invalid access code for this inquiry reference.');
    }

    // Reset counter & issue 2-hour session token
    const sessionToken = jwt.sign(
      { scope: 'CLIENT_INQUIRY', inquiryId: inquiry.id, inquiryReference: inquiry.inquiry_reference },
      config.security.jwtSecret,
      { expiresIn: '2h' }
    );
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE contact_inquiries SET lookup_attempt_count = 0, client_access_token = ?, access_token_expires_at = ? WHERE id = ?',
      [sessionToken, expiresAt, inquiry.id]
    );

    const messages = await ContactRepository.getMessages(inquiry.id, false);
    return {
      token: sessionToken,
      expiresAt: expiresAt.toISOString(),
      inquiry: this.sanitizeClientInquiry(inquiry),
      messages,
    };
  }

  static verifyClientToken(token) {
    if (!token) throw new UnauthorizedError('Access session token is required.');
    try {
      const decoded = jwt.verify(token, config.security.jwtSecret);
      if (decoded.scope !== 'CLIENT_INQUIRY' || !decoded.inquiryId) {
        throw new UnauthorizedError('Invalid inquiry session token.');
      }
      return decoded;
    } catch {
      throw new UnauthorizedError('Your inquiry session has expired. Please re-enter your access code.');
    }
  }

  static sanitizeClientInquiry(inquiry) {
    return {
      inquiryReference: inquiry.inquiry_reference,
      clientName: inquiry.client_name,
      inquiryDepartment: inquiry.inquiry_department,
      inquirySubject: inquiry.inquiry_subject,
      inquiryMessage: inquiry.inquiry_message,
      status: inquiry.status,
      propertyName: inquiry.property_name || null,
      submittedAt: inquiry.submitted_at,
      firstResponseAt: inquiry.first_response_at,
      resolvedAt: inquiry.resolved_at,
      closedAt: inquiry.closed_at,
      clientFeedbackRating: inquiry.client_feedback_rating,
      clientFeedbackText: inquiry.client_feedback_text,
      clientMarkedResolved: Boolean(inquiry.client_marked_resolved),
    };
  }

  static async getClientInquiryDetail(token) {
    const decoded = this.verifyClientToken(token);
    const inquiry = await ContactRepository.findById(decoded.inquiryId);
    if (!inquiry) throw new NotFoundError('Inquiry not found.');
    const messages = await ContactRepository.getMessages(inquiry.id, false);
    return {
      inquiry: this.sanitizeClientInquiry(inquiry),
      messages,
    };
  }

  static async addClientMessage(token, { messageBody, attachmentBase64, attachmentFilename, attachmentMime }) {
    const decoded = this.verifyClientToken(token);
    const cleanBody = (messageBody || '').trim();
    if (!cleanBody) throw new BadRequestError('Message text is required.');

    const inquiry = await ContactRepository.findById(decoded.inquiryId);
    if (!inquiry) throw new NotFoundError('Inquiry not found.');

    let savedAtt = null;
    if (attachmentBase64) {
      savedAtt = this.savePrivateAttachment(attachmentBase64, attachmentFilename, attachmentMime, 'inquiry-messages');
    }

    const msgId = await ContactRepository.insertMessage({
      inquiryId: inquiry.id,
      senderType: 'CLIENT',
      senderDisplayName: inquiry.client_name,
      messageBody: cleanBody,
      isInternal: false,
      isClientResponse: false,
      attachmentPath: savedAtt?.filePath || null,
      attachmentFilename: savedAtt?.filename || null,
      attachmentMime: savedAtt?.mimeType || null,
      attachmentSizeBytes: savedAtt?.sizeBytes || null,
    });

    const nextStatus = inquiry.status === 'CLOSED' ? 'OPEN' : 'PENDING_CLIENT';
    await pool.query('UPDATE contact_inquiries SET status = ?, updated_at = NOW() WHERE id = ?', [
      nextStatus,
      inquiry.id,
    ]);

    await NotificationsService.dispatchNotification({
      recipientId: inquiry.current_assignee_id,
      propertyId: inquiry.property_id,
      title: `Client Follow-Up on ${inquiry.inquiry_reference}`,
      message: `${inquiry.client_name} sent a follow-up message: "${cleanBody.slice(0, 120)}"`,
      category: 'COMMUNICATION',
      priority: 'HIGH',
      sourceEntityType: 'contact_inquiry',
      sourceEntityId: String(inquiry.id),
      linkUrl: `/front-office?inquiry=${inquiry.inquiry_reference}`,
    });

    return { messageId: msgId, status: nextStatus };
  }

  static async submitClientFeedback(token, { rating, feedbackText, markedResolved }) {
    const decoded = this.verifyClientToken(token);
    const numRating = parseInt(rating, 10);
    if (!numRating || numRating < 1 || numRating > 5) {
      throw new BadRequestError('Rating must be between 1 and 5.');
    }

    await pool.query(
      `UPDATE contact_inquiries
       SET client_feedback_rating = ?, client_feedback_text = ?, client_marked_resolved = ?,
           feedback_submitted_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [numRating, (feedbackText || '').trim() || null, markedResolved ? 1 : 0, decoded.inquiryId]
    );

    return { recorded: true, rating: numRating };
  }

  /**
   * Staff: List inquiries (scoped)
   */
  static async listInquiries(user, filters = {}) {
    return ContactRepository.listForUser(user, filters);
  }

  static async assertStaffAccess(inquiry, user) {
    if (!inquiry) throw new NotFoundError('Inquiry not found.');
    const role = String(user?.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) return;
    if (user.propertyId && inquiry.property_id && Number(user.propertyId) !== Number(inquiry.property_id)) {
      throw new ForbiddenError('Access denied: Inquiry belongs to another property.');
    }
    if (role === 'STAFF' && Number(inquiry.current_assignee_id) !== Number(user.id)) {
      throw new ForbiddenError('Access denied: Inquiry is not assigned to you.');
    }
  }

  static async getInquiryById(id, user) {
    const inquiry = await ContactRepository.findById(id);
    await this.assertStaffAccess(inquiry, user);
    const [messages, assignments] = await Promise.all([
      ContactRepository.getMessages(inquiry.id, true),
      ContactRepository.getAssignments(inquiry.id),
    ]);
    return { inquiry, messages, assignments };
  }

  /**
   * Staff: Reassign or escalate inquiry (preserves history & gives fresh SLA to new assignee)
   */
  static async assignInquiry(id, { newAssigneeId, reason }, user) {
    const inquiry = await ContactRepository.findById(id);
    await this.assertStaffAccess(inquiry, user);

    const [target] = await pool.query(
      "SELECT id, name, role, property_id, status FROM users WHERE id = ? AND status = 'ACTIVE' LIMIT 1",
      [newAssigneeId]
    );
    if (!target) throw new NotFoundError('Selected target staff member was not found or is not active.');

    const freshDeadline = new Date(Date.now() + SLA_MINUTES * 60 * 1000);

    await ContactRepository.insertAssignment({
      inquiryId: inquiry.id,
      previousAssigneeId: inquiry.current_assignee_id,
      previousAssigneeRole: inquiry.current_assignee_role,
      newAssigneeId: target.id,
      newAssigneeRole: target.role,
      assignedById: user.id,
      assignmentReason: (reason || '').trim() || 'Manager reassignment',
      routingType: 'REASSIGNMENT',
      slaInherited: false,
      newSlaDeadlineAt: freshDeadline,
    });

    await pool.query(
      `UPDATE contact_inquiries
       SET current_assignee_id = ?, current_assignee_role = ?, status = 'ASSIGNED',
           response_sla_deadline_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [target.id, target.role, freshDeadline, inquiry.id]
    );

    await NotificationsService.dispatchNotification({
      recipientId: target.id,
      propertyId: inquiry.property_id,
      title: `Assigned Inquiry: ${inquiry.inquiry_reference} [${inquiry.inquiry_department}]`,
      message: `${user.name || 'Management'} assigned ${inquiry.inquiry_reference} to you. Reason: ${reason || 'Operational routing'}.`,
      category: 'COMMUNICATION',
      priority: 'HIGH',
      sourceEntityType: 'contact_inquiry',
      sourceEntityId: String(inquiry.id),
      linkUrl: `/front-office?inquiry=${inquiry.inquiry_reference}`,
    });

    await this.dispatchStaffChatCard({
      assigneeId: target.id,
      propertyId: inquiry.property_id,
      inquiryId: inquiry.id,
      inquiryReference: inquiry.inquiry_reference,
      clientName: inquiry.client_name,
      department: inquiry.inquiry_department,
      message: inquiry.inquiry_message,
      slaDeadline: freshDeadline,
    });

    return { assignedTo: target.name, newSlaDeadline: freshDeadline.toISOString() };
  }

  /**
   * Staff: Add response or internal note
   * Only non-internal staff messages marked as client response satisfy the 90-min SLA
   */
  static async addStaffMessage(id, { messageBody, isInternal = false, isClientResponse = true }, user) {
    const cleanBody = (messageBody || '').trim();
    if (!cleanBody) throw new BadRequestError('Message body is required.');

    const inquiry = await ContactRepository.findById(id);
    await this.assertStaffAccess(inquiry, user);

    const qualifiesSla = !isInternal && Boolean(isClientResponse);
    const msgId = await ContactRepository.insertMessage({
      inquiryId: inquiry.id,
      senderType: 'STAFF',
      senderUserId: user.id,
      senderDisplayName: `${user.name || 'BFA Concierge'} (${user.role})`,
      messageBody: cleanBody,
      isInternal: Boolean(isInternal),
      isClientResponse: qualifiesSla,
    });

    if (qualifiesSla && !inquiry.first_response_at) {
      const metSla = new Date() <= new Date(inquiry.response_sla_deadline_at);
      await pool.query(
        `UPDATE contact_inquiries
         SET first_response_at = NOW(), first_response_by_id = ?, response_sla_met = ?,
             status = 'RESPONDED', updated_at = NOW()
         WHERE id = ?`,
        [user.id, metSla ? 1 : 0, inquiry.id]
      );
    } else if (qualifiesSla) {
      await pool.query("UPDATE contact_inquiries SET status = 'RESPONDED', updated_at = NOW() WHERE id = ?", [inquiry.id]);
    }

    return { messageId: msgId, qualifiesSla };
  }

  static async closeInquiry(id, { resolutionNote }, user) {
    const inquiry = await ContactRepository.findById(id);
    await this.assertStaffAccess(inquiry, user);
    await pool.query(
      `UPDATE contact_inquiries
       SET status = 'CLOSED', resolution_note = ?, resolved_by_id = ?, resolved_at = NOW(),
           closed_by_id = ?, closed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [(resolutionNote || '').trim() || 'Resolved by staff', user.id, user.id, inquiry.id]
    );
    return { status: 'CLOSED' };
  }

  static async reopenInquiry(id, { reason }, user) {
    const inquiry = await ContactRepository.findById(id);
    await this.assertStaffAccess(inquiry, user);
    await pool.query("UPDATE contact_inquiries SET status = 'OPEN', updated_at = NOW() WHERE id = ?", [inquiry.id]);
    await ContactRepository.insertMessage({
      inquiryId: inquiry.id,
      senderType: 'STAFF',
      senderUserId: user.id,
      senderDisplayName: user.name,
      messageBody: `Inquiry reopened: ${reason || 'Follow-up required'}`,
      isInternal: true,
      isClientResponse: false,
    });
    return { status: 'OPEN' };
  }
}

module.exports = ContactService;
