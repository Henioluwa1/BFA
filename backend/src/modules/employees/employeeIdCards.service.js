const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const EmployeeIdCardsRepository = require('./employeeIdCards.repository');
const EmployeesRepository = require('./employees.repository');
const AccessControlService = require('../../core/access/accessControl.service');
const AuditService = require('../../core/audit/audit.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');
const pool = require('../../db/pool');

class EmployeeIdCardsService {
  /**
   * List ID cards with property scoping
   */
  static async listCards(query, req = null) {
    const user = req?.user;
    let employeeId = query.employeeId ? parseInt(query.employeeId, 10) : undefined;

    if (user && ['STAFF', 'RECEPTIONIST'].includes((user.role || '').toUpperCase())) {
      const myEmp = await EmployeesRepository.findByUserId(user.id);
      if (myEmp) {
        employeeId = myEmp.id;
      }
    }

    return EmployeeIdCardsRepository.findAll({
      ...query,
      employeeId,
      user,
    });
  }

  /**
   * Get card by ID
   */
  static async getCardById(id, req = null) {
    const card = await EmployeeIdCardsRepository.findById(id);
    if (!card) {
      throw new NotFoundError(`Employee ID card #${id} not found.`);
    }

    const user = req?.user;
    if (user && ['STAFF', 'RECEPTIONIST'].includes((user.role || '').toUpperCase())) {
      const myEmp = await EmployeesRepository.findByUserId(user.id);
      if (!myEmp || parseInt(myEmp.id, 10) !== parseInt(card.employee_id, 10)) {
        throw new ForbiddenError('You are only authorized to view your own employee ID card.');
      }
    }

    if (
      user &&
      user.propertyId &&
      !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes((user.role || '').toUpperCase()) &&
      card.property_id &&
      parseInt(card.property_id, 10) !== parseInt(user.propertyId, 10)
    ) {
      throw new ForbiddenError('Access denied: ID card belongs to another property scope.');
    }

    return card;
  }

  /**
   * Get active card for employee
   */
  static async getActiveCardForEmployee(employeeId, req = null) {
    const card = await EmployeeIdCardsRepository.findActiveByEmployeeId(employeeId);
    if (!card) {
      throw new NotFoundError(`No active ID card found for employee #${employeeId}.`);
    }
    return card;
  }

  /**
   * Generate official employee ID card
   */
  static async generateCard(data = {}, user, req = null) {
    // Capability check: EMPLOYEE_ID_CARD_GENERATE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_ID_CARD_GENERATE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`ID card generation requires authorized capability (${capCheck.reason}).`);
    }

    const employeeId = data.employeeId || data.employee_id;
    if (!employeeId) {
      throw new ValidationError('employeeId is required.');
    }

    const employee = await EmployeesRepository.findById(employeeId);
    if (!employee) {
      throw new NotFoundError(`Employee #${employeeId} not found.`);
    }

    if (employee.employment_status === 'TERMINATED') {
      throw new ConflictError('Cannot generate ID card for a TERMINATED employee.');
    }

    // Check if employee already has an active card
    const existingActive = await EmployeeIdCardsRepository.findActiveByEmployeeId(employee.id);
    if (existingActive) {
      throw new ConflictError(`Employee #${employee.employee_code} already has an ACTIVE ID card (${existingActive.card_number}). Use reissue instead.`);
    }

    const now = new Date();
    const issueDateStr = now.toISOString().slice(0, 10);
    let expiresDateStr = data.expires_at || data.expiresAt;
    if (!expiresDateStr) {
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + (parseInt(data.validityYears, 10) || 1));
      expiresDateStr = expiresAt.toISOString().slice(0, 10);
    }

    const cardNumber = `BFA-IDC-${now.getFullYear()}-${String(employee.id).padStart(4, '0')}-${Math.floor(Math.random() * 900 + 100)}`;
    const verificationToken = crypto.randomBytes(24).toString('hex');

    let insertId;
    await pool.withTransaction(async (conn) => {
      insertId = await EmployeeIdCardsRepository.create(
        {
          card_number: cardNumber,
          employee_id: employee.id,
          property_id: employee.property_id || null,
          status: 'ACTIVE',
          verification_token: verificationToken,
          issued_at: issueDateStr,
          expires_at: expiresDateStr,
          generated_by_id: user?.id || 1,
        },
        conn
      );
    });

    const created = await EmployeeIdCardsRepository.findById(insertId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_ID_CARD_GENERATED',
      entityType: 'employee_id_card',
      entityId: String(insertId),
      newValues: {
        cardNumber,
        employeeCode: employee.employee_code,
        employeeName: employee.full_name,
        expiresAt: expiresDateStr,
      },
    });

    return created;
  }

  /**
   * Reissue employee ID card (supersedes prior card)
   */
  static async reissueCard(id, data = {}, user, req = null) {
    let existing;
    try {
      existing = await this.getCardById(id, req);
    } catch {
      existing = await EmployeeIdCardsRepository.findActiveByEmployeeId(id);
    }
    if (!existing) {
      const allCards = await EmployeeIdCardsRepository.findByEmployeeId(id);
      if (allCards.length > 0) existing = allCards[0];
    }
    if (!existing) {
      throw new NotFoundError(`Employee ID card or employee #${id} not found.`);
    }

    // Capability check: EMPLOYEE_ID_CARD_GENERATE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_ID_CARD_GENERATE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`ID card reissuance requires authorized capability (${capCheck.reason}).`);
    }

    const employee = await EmployeesRepository.findById(existing.employee_id);
    if (!employee || employee.employment_status === 'TERMINATED') {
      throw new ConflictError('Cannot reissue ID card for a terminated employee.');
    }

    const reason = data.reason || 'Reissuance requested';
    const now = new Date();
    const issueDateStr = now.toISOString().slice(0, 10);
    let expiresDateStr = data.expires_at || data.expiresAt;
    if (!expiresDateStr) {
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + (parseInt(data.validityYears, 10) || 1));
      expiresDateStr = expiresAt.toISOString().slice(0, 10);
    }

    const newCardNumber = `BFA-IDC-${now.getFullYear()}-${String(employee.id).padStart(4, '0')}-${Math.floor(Math.random() * 900 + 100)}`;
    const verificationToken = crypto.randomBytes(24).toString('hex');

    let newCardId;
    await pool.withTransaction(async (conn) => {
      // Mark old card as REISSUED
      await EmployeeIdCardsRepository.update(
        existing.id,
        {
          status: 'REISSUED',
          revocation_reason: `Reissued into card ${newCardNumber} (${reason})`,
        },
        conn
      );

      // Create new card
      newCardId = await EmployeeIdCardsRepository.create(
        {
          card_number: newCardNumber,
          employee_id: employee.id,
          property_id: employee.property_id || null,
          status: 'ACTIVE',
          verification_token: verificationToken,
          issued_at: issueDateStr,
          expires_at: expiresDateStr,
          generated_by_id: user?.id || 1,
          reissued_from_id: existing.id,
        },
        conn
      );
    });

    const newCard = await EmployeeIdCardsRepository.findById(newCardId);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_ID_CARD_REISSUED',
      entityType: 'employee_id_card',
      entityId: String(newCardId),
      oldValues: { previousCardNumber: existing.card_number },
      newValues: {
        newCardNumber,
        employeeCode: employee.employee_code,
        reason,
      },
    });

    return newCard;
  }

  /**
   * Revoke active employee ID card
   */
  static async revokeCard(id, data = {}, user, req = null) {
    let card = await EmployeeIdCardsRepository.findById(id);
    if (!card) {
      card = await EmployeeIdCardsRepository.findActiveByEmployeeId(id);
    }
    if (!card) {
      throw new NotFoundError(`Employee ID card #${id} not found.`);
    }

    // Capability check: EMPLOYEE_ID_CARD_REVOKE
    const capCheck = await AccessControlService.canAccess(user, 'EMPLOYEE_ID_CARD_REVOKE');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`ID card revocation requires authorized capability (${capCheck.reason}).`);
    }

    if (card.status === 'REVOKED') {
      throw new ConflictError(`ID card #${card.card_number} is already revoked.`);
    }

    const reason = data.revocation_reason || data.reason || 'Management revocation';
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await EmployeeIdCardsRepository.update(card.id, {
      status: 'REVOKED',
      revoked_by_id: user?.id || null,
      revoked_at: nowStr,
      revocation_reason: reason,
    });

    const updated = await EmployeeIdCardsRepository.findById(card.id);

    await AuditService.record({
      req,
      actorId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      action: 'EMPLOYEE_ID_CARD_REVOKED',
      entityType: 'employee_id_card',
      entityId: String(card.id),
      oldValues: { status: card.status },
      newValues: {
        status: 'REVOKED',
        revokedById: user?.id,
        reason,
      },
    });

    return updated;
  }

  /**
   * Public QR code verification endpoint (Gate 11.13)
   * Returns approved, non-sensitive verification data only
   */
  static async verifyCardByToken(token) {
    if (!token || !token.trim()) {
      throw new ValidationError('Verification token is required.');
    }

    const verified = await EmployeeIdCardsRepository.findByVerificationToken(token.trim());
    if (!verified) {
      return {
        isValid: false,
        badge_valid: false,
        message: 'Invalid verification token. No matching BFA employee record found.',
      };
    }

    const isExpired = new Date(verified.expires_at) < new Date();
    const isEmploymentActive = verified.employment_status === 'ACTIVE';
    const isCardActive = verified.card_status === 'ACTIVE' && !isExpired;
    const isValid = isCardActive && isEmploymentActive;

    return {
      isValid,
      badge_valid: isValid,
      message: isValid
        ? 'Official BFA Employee ID Verified'
        : `Badge is ${verified.card_status === 'REVOKED' ? 'revoked' : 'invalid or expired'}`,
      card: {
        cardNumber: verified.card_number,
        cardStatus: isExpired ? 'EXPIRED' : verified.card_status,
        issuedAt: verified.issued_at,
        expiresAt: verified.expires_at,
      },
      employee: {
        employeeCode: verified.employee_code,
        fullName: verified.full_name || verified.employee_name,
        jobTitle: verified.job_title,
        department: verified.department,
        propertyName: verified.property_name || 'BFA Corporate / Multi-Property',
        employmentStatus: verified.employment_status,
      },
      badge: {
        employee_name: verified.full_name || verified.employee_name,
        staff_code: verified.employee_code,
        employee_code: verified.employee_code,
        job_title: verified.job_title,
        department: verified.department,
        property_name: verified.property_name || 'BFA Corporate / Multi-Property',
        employment_status: verified.employment_status,
        card_status: isExpired ? 'EXPIRED' : verified.card_status,
        card_number: verified.card_number,
      },
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate official PDF ID card badge (Gate 11.11)
   */
  static async generateIdCardPDF(id, req = null) {
    let card = await EmployeeIdCardsRepository.findById(id);
    if (!card) {
      card = await EmployeeIdCardsRepository.findActiveByEmployeeId(id);
    }
    if (!card) {
      throw new NotFoundError(`Employee ID card #${id} not found.`);
    }

    const doc = new PDFDocument({
      size: [340, 500], // Standard CR80 badge vertical aspect ratio
      margins: { top: 20, bottom: 20, left: 20, right: 20 },
    });

    // Verification URL for QR code
    const verificationUrl = `https://bfa-apartments.com/verify-id?token=${card.verification_token}`;
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 120, margin: 1 });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    // === FRONT BADGE ===
    // Header banner
    doc.rect(0, 0, 340, 75).fill('#0f172a');
    doc.fillColor('#ca8a04').fontSize(16).text('BFA APARTMENTS', 0, 20, { align: 'center' });
    doc.fillColor('#94a3b8').fontSize(8).text('OFFICIAL STAFF IDENTIFICATION BADGE', 0, 42, { align: 'center' });

    // Photo placeholder / avatar
    const photoY = 95;
    doc.rect(110, photoY, 120, 130).lineWidth(2).strokeColor('#ca8a04').stroke();

    // Check if photo file exists locally
    let hasPhoto = false;
    if (card.employee_photo_url && fs.existsSync(card.employee_photo_url)) {
      try {
        doc.image(card.employee_photo_url, 112, photoY + 2, { width: 116, height: 126 });
        hasPhoto = true;
      } catch {
        hasPhoto = false;
      }
    }
    if (!hasPhoto) {
      doc.rect(112, photoY + 2, 116, 126).fill('#f1f5f9');
      doc.fillColor('#64748b').fontSize(36).text('👤', 0, photoY + 45, { align: 'center' });
    }

    // Employee Details
    const textY = 240;
    doc.fillColor('#0f172a').fontSize(15).text(card.employee_name, 0, textY, { align: 'center' });
    doc.fillColor('#ca8a04').fontSize(11).text(card.job_title, 0, textY + 22, { align: 'center' });
    doc.fillColor('#475569').fontSize(9).text(`Dept: ${card.department} | ${card.property_name || 'All Properties'}`, 0, textY + 40, { align: 'center' });

    // Badge Card Details Box
    const boxY = 325;
    doc.rect(30, boxY, 280, 75).fill('#f8fafc').strokeColor('#e2e8f0').stroke();
    doc.fillColor('#64748b').fontSize(8).text('STAFF ID NUMBER', 45, boxY + 12);
    doc.fillColor('#0f172a').fontSize(10).text(card.employee_code, 45, boxY + 24);

    doc.fillColor('#64748b').fontSize(8).text('CARD NUMBER', 180, boxY + 12);
    doc.fillColor('#0f172a').fontSize(9).text(card.card_number, 180, boxY + 24);

    doc.fillColor('#64748b').fontSize(8).text('ISSUED DATE', 45, boxY + 44);
    doc.fillColor('#0f172a').fontSize(9).text(card.issued_at, 45, boxY + 54);

    doc.fillColor('#64748b').fontSize(8).text('VALID THRU', 180, boxY + 44);
    doc.fillColor('#10b981').fontSize(9).text(card.expires_at, 180, boxY + 54);

    // Front Footer
    doc.rect(0, 475, 340, 25).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(7).text('PROPERTY OF BFA APARTMENTS • AUTHORIZED PERSONNEL ONLY', 0, 483, { align: 'center' });

    // === BACK BADGE (PAGE 2) ===
    doc.addPage();
    doc.rect(0, 0, 340, 50).fill('#0f172a');
    doc.fillColor('#ca8a04').fontSize(12).text('SECURITY VERIFICATION & RETURN POLICY', 0, 18, { align: 'center' });

    // Instructions
    const backY = 70;
    doc.fillColor('#334155').fontSize(8).text(
      '1. This identification card is non-transferable and remains the property of BFA Apartments.\n' +
      '2. Must be visibly displayed at all times while on duty or on property premises.\n' +
      '3. Loss or damage must be reported immediately to management.\n' +
      '4. If found, please return to any BFA Apartments reception or call +234 800-BFA-STAY.\n' +
      '5. Scan the QR code below for instant cryptographic credential verification.',
      30,
      backY,
      { width: 280, lineGap: 4 }
    );

    // QR Code
    const qrY = 210;
    doc.image(qrBuffer, 110, qrY, { width: 120, height: 120 });
    doc.fillColor('#64748b').fontSize(8).text('SCAN FOR DIGITAL AUTHENTICATION', 0, qrY + 130, { align: 'center' });
    doc.fillColor('#94a3b8').fontSize(7).text(`Token: ${card.verification_token.slice(0, 16)}...`, 0, qrY + 145, { align: 'center' });

    // Back Footer
    doc.rect(0, 475, 340, 25).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(7).text('BFA APARTMENTS • LAGOS, NIGERIA', 0, 483, { align: 'center' });

    doc.end();
    return doc;
  }
}

module.exports = EmployeeIdCardsService;
