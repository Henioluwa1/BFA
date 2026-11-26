const pool = require('../../db/pool');
const auditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const { ValidationError, ForbiddenError, NotFoundError, ConflictError } = require('../../core/errors/apiError');

class PropertySubmissionsService {
  /**
   * Dispatch mandatory high-priority notifications to BOTH Owner and Operations Manager
   */
  static async notifyReviewers({ submission, propertyName, apartmentName = null, submittedByName, shortDesc = '' }) {
    const isApt = submission.entity_type === 'APARTMENT';
    const heading = isApt
      ? 'NEW APARTMENT APPROVAL NEEDED — REVIEW BEFORE PUBLISHING'
      : 'NEW PROPERTY APPROVAL NEEDED — REVIEW BEFORE PUBLISHING';

    const subjectLabel = isApt
      ? `${propertyName} — ${apartmentName || 'Apartment Unit'}`
      : propertyName;

    const message = [
      `${subjectLabel}`,
      `Type: ${submission.submission_type} (v${submission.document_version || submission.version_number || 1})`,
      `Submitted by: ${submittedByName || 'Portal Manager'}`,
      `Submitted at: ${new Date(submission.submitted_at || Date.now()).toLocaleString('en-NG')}`,
      `Status: ${submission.status}`,
      shortDesc ? `Summary: ${String(shortDesc).slice(0, 180)}` : null,
      `Action Required: Review the complete submission document and PDF before publishing.`,
    ].filter(Boolean).join(' | ');

    const linkUrl = `/app/approvals?submission=${submission.id}`;

    for (const role of ['OWNER', 'OPERATIONS_MANAGER']) {
      try {
        await NotificationsService.dispatchNotification({
          recipientRole: role,
          title: heading,
          message,
          category: 'APPROVAL',
          priority: 'CRITICAL',
          sourceEntityType: 'property_submission',
          sourceEntityId: String(submission.id),
          linkUrl,
        });
      } catch (err) {
        console.warn(`Failed to dispatch approval notification to ${role}:`, err.message);
      }
    }
  }

  /**
   * Create a new property or apartment submission & notify Owner + Operations Manager
   */
  static async createSubmission({
    propertyId,
    apartmentId = null,
    entityType = null,
    submissionType = 'CONTENT_UPDATE',
    contentSnapshot = {},
    mediaAssetIds = [],
    user,
    req = null,
  }) {
    if (!propertyId) {
      throw new ValidationError('Property ID is required.');
    }

    const resolvedEntityType = entityType || (apartmentId ? 'APARTMENT' : 'PROPERTY');
    const validTypes = ['NEW_PROPERTY', 'NEW_APARTMENT', 'CONTENT_UPDATE', 'PHOTO_UPDATE', 'PRICE_UPDATE'];
    if (!validTypes.includes(submissionType)) {
      throw new ValidationError(`Invalid submission type: ${submissionType}`);
    }

    const props = await pool.query('SELECT id, name FROM properties WHERE id = ?', [propertyId]);
    if (props.length === 0) {
      throw new NotFoundError(`Property #${propertyId} does not exist.`);
    }
    const propertyName = props[0].name;

    if (
      ['OPERATIONS_MANAGER', 'MANAGER'].includes(String(user.role || '').toUpperCase()) &&
      user.propertyId &&
      parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)
    ) {
      throw new ForbiddenError('Managers can only create submissions for their assigned property.');
    }

    const maxVerRows = await pool.query(
      'SELECT MAX(version_number) as max_ver FROM property_submissions WHERE property_id = ?',
      [propertyId]
    );
    const versionNumber = (maxVerRows[0]?.max_ver || 0) + 1;
    const prefix = resolvedEntityType === 'APARTMENT' ? 'BFA-APT' : 'BFA-SUB';
    const submissionCode = `${prefix}-${propertyId}-V${versionNumber}-${Date.now().toString(36).toUpperCase()}`;
    const snapshotJson = typeof contentSnapshot === 'string' ? contentSnapshot : JSON.stringify(contentSnapshot || {});

    const result = await pool.query(
      `INSERT INTO property_submissions (
        submission_code, property_id, apartment_id, entity_type, version_number, document_version,
        submission_type, status, content_snapshot, submitted_by_id, submitted_at,
        admin_review_status, owner_review_status, ops_review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_OWNER_APPROVAL', ?, ?, NOW(), 'PENDING', 'PENDING', 'PENDING')`,
      [
        submissionCode,
        propertyId,
        apartmentId || null,
        resolvedEntityType,
        versionNumber,
        versionNumber,
        submissionType,
        snapshotJson,
        user.id,
      ]
    );

    const submissionId = result.insertId;

    if (Array.isArray(mediaAssetIds) && mediaAssetIds.length > 0) {
      for (const mediaId of mediaAssetIds) {
        await pool.query(
          'UPDATE media_assets SET submission_id = ?, is_published = 0 WHERE id = ?',
          [submissionId, mediaId]
        );
      }
    }

    const created = await this.getSubmissionById(submissionId, user);

    await this.notifyReviewers({
      submission: created,
      propertyName,
      apartmentName: contentSnapshot?.unit_name
        ? `${contentSnapshot.unit_name} (#${contentSnapshot.unit_number || ''})`
        : null,
      submittedByName: user.name || user.email,
      shortDesc: contentSnapshot?.description || contentSnapshot?.address || '',
    });

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PROPERTY_SUBMISSION_CREATED',
      entityType: 'property_submission',
      entityId: String(submissionId),
      newValues: {
        submissionCode,
        propertyId,
        apartmentId,
        entityType: resolvedEntityType,
        versionNumber,
        submissionType,
        status: 'PENDING_OWNER_APPROVAL',
      },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    return created;
  }

  /**
   * List submissions with property scoping and entity/status filters
   */
  static async listSubmissions(query = {}, user) {
    let sql = `
      SELECT 
        s.*,
        p.name AS property_name,
        p.code AS property_code,
        a.unit_name AS apartment_name,
        a.unit_number AS apartment_number,
        a.entered_rate_per_night,
        a.approved_rate_per_night,
        a.pricing_status,
        u.name AS submitted_by_name,
        owner_u.name AS owner_reviewed_by_name,
        ops_u.name AS ops_reviewed_by_name,
        pub_u.name AS published_by_name,
        COALESCE(
          (SELECT file_url FROM media_assets WHERE submission_id = s.id ORDER BY is_primary DESC, id ASC LIMIT 1),
          (SELECT file_url FROM media_assets WHERE entity_type = COALESCE(s.entity_type, 'PROPERTY') AND entity_id = COALESCE(s.apartment_id, s.property_id) ORDER BY is_primary DESC, id ASC LIMIT 1)
        ) AS main_photo_url,
        (SELECT COUNT(*) FROM property_review_comments c WHERE c.submission_id = s.id) AS comments_count
      FROM property_submissions s
      JOIN properties p ON s.property_id = p.id
      LEFT JOIN apartments a ON s.apartment_id = a.id
      JOIN users u ON s.submitted_by_id = u.id
      LEFT JOIN users owner_u ON s.owner_reviewed_by_id = owner_u.id
      LEFT JOIN users ops_u ON s.ops_reviewed_by_id = ops_u.id
      LEFT JOIN users pub_u ON s.published_by_id = pub_u.id
      WHERE 1=1
    `;
    const params = [];

    if (
      ['OPERATIONS_MANAGER', 'MANAGER'].includes(String(user.role || '').toUpperCase()) &&
      user.propertyId
    ) {
      sql += ' AND s.property_id = ?';
      params.push(user.propertyId);
    } else if (query.propertyId && query.propertyId !== 'all') {
      sql += ' AND s.property_id = ?';
      params.push(parseInt(query.propertyId, 10));
    }

    if (query.entityType && query.entityType !== 'ALL') {
      sql += ' AND s.entity_type = ?';
      params.push(query.entityType);
    }

    if (query.status && query.status !== 'ALL') {
      sql += ' AND s.status = ?';
      params.push(query.status);
    }

    sql += ' ORDER BY s.id DESC';

    const rows = await pool.query(sql, params);
    return rows.map((r) => ({
      ...r,
      content_snapshot: typeof r.content_snapshot === 'string'
        ? (() => { try { return JSON.parse(r.content_snapshot || '{}'); } catch { return {}; } })()
        : (r.content_snapshot || {}),
    }));
  }

  /**
   * Get single submission by ID with comments and linked media
   */
  static async getSubmissionById(id, user = null) {
    const rows = await pool.query(
      `SELECT 
        s.*,
        p.name AS property_name,
        p.code AS property_code,
        a.unit_name AS apartment_name,
        a.unit_number AS apartment_number,
        u.name AS submitted_by_name,
        owner_u.name AS owner_reviewed_by_name,
        ops_u.name AS ops_reviewed_by_name,
        pub_u.name AS published_by_name
      FROM property_submissions s
      JOIN properties p ON s.property_id = p.id
      LEFT JOIN apartments a ON s.apartment_id = a.id
      JOIN users u ON s.submitted_by_id = u.id
      LEFT JOIN users owner_u ON s.owner_reviewed_by_id = owner_u.id
      LEFT JOIN users ops_u ON s.ops_reviewed_by_id = ops_u.id
      LEFT JOIN users pub_u ON s.published_by_id = pub_u.id
      WHERE s.id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      throw new NotFoundError(`Submission #${id} not found.`);
    }

    const submission = rows[0];

    if (
      user &&
      ['OPERATIONS_MANAGER', 'MANAGER'].includes(String(user.role || '').toUpperCase()) &&
      user.propertyId &&
      parseInt(user.propertyId, 10) !== parseInt(submission.property_id, 10)
    ) {
      throw new ForbiddenError('You are not authorized to view submissions for another property.');
    }

    const comments = await pool.query(
      `SELECT c.*, u.name as author_name, u.role as author_role
       FROM property_review_comments c
       JOIN users u ON c.author_id = u.id
       WHERE c.submission_id = ?
       ORDER BY c.id ASC`,
      [id]
    );

    const entityType = submission.entity_type === 'APARTMENT' && submission.apartment_id ? 'APARTMENT' : 'PROPERTY';
    const entityId = entityType === 'APARTMENT' ? submission.apartment_id : submission.property_id;

    const media = await pool.query(
      'SELECT id, entity_type, entity_id, file_url, mime_type, caption, is_primary, display_order, is_published FROM media_assets WHERE (submission_id = ? OR (entity_type = ? AND entity_id = ?)) ORDER BY is_primary DESC, display_order ASC, id ASC',
      [id, entityType, entityId]
    );

    return {
      ...submission,
      content_snapshot: typeof submission.content_snapshot === 'string'
        ? (() => { try { return JSON.parse(submission.content_snapshot || '{}'); } catch { return {}; } })()
        : (submission.content_snapshot || {}),
      review_comments: comments,
      media_assets: media,
    };
  }

  /**
   * Two-Stage Independent Review:
   * Stage 1: OWNER
   * Stage 2: OPERATIONS_MANAGER
   */
  static async reviewSubmission(id, {
    action, // 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'
    decisionNotes = '',
    commentTargetType = null,
    commentTargetId = null,
    commentType = 'CORRECTION_REQUIRED',
    commentContent = '',
  }, user, req = null) {
    if (!['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'].includes(action)) {
      throw new ValidationError(`Invalid review action: ${action}. Must be APPROVED, CHANGES_REQUESTED, or REJECTED.`);
    }

    const userRole = String(user.role || '').toUpperCase();
    if (!['OWNER', 'OPERATIONS_MANAGER'].includes(userRole)) {
      throw new ForbiddenError('Only the Owner and Operations Manager are authorized to review or approve submissions.');
    }

    if (['CHANGES_REQUESTED', 'REJECTED'].includes(action) && !String(decisionNotes || commentContent || '').trim()) {
      throw new ValidationError('A reason or comment is required when rejecting or requesting changes.');
    }

    const txResult = await pool.withTransaction(async (conn) => {
      const [lockedRows] = await conn.query(
        'SELECT * FROM property_submissions WHERE id = ? FOR UPDATE',
        [id]
      );
      if (lockedRows.length === 0) {
        throw new NotFoundError(`Submission #${id} not found.`);
      }

      const submission = {
        ...lockedRows[0],
        content_snapshot: typeof lockedRows[0].content_snapshot === 'string'
          ? (() => { try { return JSON.parse(lockedRows[0].content_snapshot || '{}'); } catch { return {}; } })()
          : (lockedRows[0].content_snapshot || {}),
      };

      if (
        ['OPERATIONS_MANAGER', 'MANAGER'].includes(userRole) &&
        user.propertyId &&
        parseInt(user.propertyId, 10) !== parseInt(submission.property_id, 10)
      ) {
        throw new ForbiddenError('You are not authorized to review submissions for another property.');
      }

      if (submission.status === 'PUBLISHED') {
        throw new ConflictError('Cannot review an already published submission.');
      }
      if (submission.status === 'REJECTED') {
        throw new ConflictError('Submission has already been rejected.');
      }
      if (submission.status === 'APPROVED' && action === 'REJECTED') {
        throw new ConflictError('Cannot reject a submission that has already received full approval.');
      }

      // Segregation of duties: submitter cannot approve their own submission
      if (parseInt(submission.submitted_by_id, 10) === parseInt(user.id, 10)) {
        throw new ForbiddenError('Self-approval violation: Submitters cannot review or approve their own submission.');
      }

      const isOwner = userRole === 'OWNER';
      const isOps = userRole === 'OPERATIONS_MANAGER';

      if (isOwner) {
        if (submission.owner_review_status === 'APPROVED') {
          throw new ConflictError('Owner approval has already been recorded for this submission.');
        }
      }

      if (isOps) {
        if (submission.owner_review_status !== 'APPROVED' && action === 'APPROVED') {
          throw new ConflictError('Owner approval must be recorded before Operations Manager approval.');
        }
        if (submission.ops_review_status === 'APPROVED') {
          throw new ConflictError('Operations Manager approval has already been recorded for this submission.');
        }
      }

      const updates = [];
      const params = [];

      if (isOwner) {
        updates.push('owner_review_status = ?', 'owner_reviewed_by_id = ?', 'owner_decision_notes = ?', 'owner_reviewed_at = NOW()');
        params.push(action, user.id, decisionNotes || null);
      } else {
        updates.push('ops_review_status = ?', 'ops_reviewed_by_id = ?', 'ops_decision_notes = ?', 'ops_reviewed_at = NOW()');
        params.push(action, user.id, decisionNotes || null);
      }

      const newOwnerStatus = isOwner ? action : (submission.owner_review_status || 'PENDING');
      const newOpsStatus = isOps ? action : (submission.ops_review_status || 'PENDING');

      let finalStatus = submission.status;
      if (action === 'REJECTED') {
        finalStatus = 'REJECTED';
      } else if (action === 'CHANGES_REQUESTED') {
        finalStatus = 'CHANGES_REQUESTED';
      } else if (newOwnerStatus === 'APPROVED' && newOpsStatus === 'APPROVED') {
        finalStatus = 'APPROVED';
      } else if (newOwnerStatus === 'APPROVED') {
        finalStatus = 'PENDING_OPS_APPROVAL';
      } else {
        finalStatus = 'PENDING_OWNER_APPROVAL';
      }

      updates.push('status = ?', 'updated_at = NOW()');
      params.push(finalStatus, id);

      await conn.query(`UPDATE property_submissions SET ${updates.join(', ')} WHERE id = ?`, params);

      // Apply approval status to target property or apartment (without auto-publishing!)
      const snap = submission.content_snapshot || {};
      if (submission.entity_type === 'APARTMENT' && submission.apartment_id) {
        if (finalStatus === 'APPROVED') {
          const approvedRate = snap.entered_rate_per_night ?? snap.rate_per_night;
          await conn.query(
            `UPDATE apartments SET
              unit_name = COALESCE(?, unit_name),
              unit_type = COALESCE(?, unit_type),
              description = COALESCE(?, description),
              bedroom_count = COALESCE(?, bedroom_count),
              bathroom_count = COALESCE(?, bathroom_count),
              capacity = COALESCE(?, capacity),
              rate_per_night = COALESCE(?, rate_per_night),
              approved_rate_per_night = COALESCE(?, approved_rate_per_night),
              entered_rate_per_night = COALESCE(?, entered_rate_per_night),
              pricing_status = 'APPROVED',
              approval_status = 'APPROVED',
              approved_snapshot = ?
             WHERE id = ?`,
            [
              snap.unit_name || null,
              snap.unit_type || null,
              snap.description || null,
              snap.bedroom_count || null,
              snap.bathroom_count || null,
              snap.capacity || null,
              approvedRate ?? null,
              approvedRate ?? null,
              approvedRate ?? null,
              JSON.stringify(snap),
              submission.apartment_id,
            ]
          );
        } else {
          await conn.query('UPDATE apartments SET approval_status = ? WHERE id = ?', [finalStatus, submission.apartment_id]);
        }
      } else {
        if (finalStatus === 'APPROVED') {
          await conn.query(
            `UPDATE properties SET
              name = COALESCE(?, name),
              address = COALESCE(?, address),
              location = COALESCE(?, location),
              district = COALESCE(?, district),
              city = COALESCE(?, city),
              state = COALESCE(?, state),
              country = COALESCE(?, country),
              description = COALESCE(?, description),
              environment_description = COALESCE(?, environment_description),
              approval_status = 'APPROVED',
              approved_snapshot = ?
             WHERE id = ?`,
            [
              snap.name || null,
              snap.address || null,
              snap.location || null,
              snap.district || null,
              snap.city || null,
              snap.state || null,
              snap.country || null,
              snap.description || null,
              snap.environment_description || null,
              JSON.stringify(snap),
              submission.property_id,
            ]
          );
        } else {
          await conn.query('UPDATE properties SET approval_status = ? WHERE id = ?', [finalStatus, submission.property_id]);
        }
      }

      const noteText = commentContent || decisionNotes;
      if (noteText && noteText.trim()) {
        await conn.query(
          `INSERT INTO property_review_comments (
            submission_id, property_id, author_id, author_role, target_type, target_id, comment_type, content
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            submission.property_id,
            user.id,
            userRole,
            commentTargetType || submission.entity_type || 'PROPERTY',
            commentTargetId || submission.apartment_id || submission.property_id,
            commentType || (action === 'APPROVED' ? 'APPROVAL_NOTE' : 'CORRECTION_REQUIRED'),
            noteText.trim(),
          ]
        );
      }

      return { submission, finalStatus, newOwnerStatus, newOpsStatus };
    });

    const { submission, finalStatus, newOwnerStatus, newOpsStatus } = txResult;

    // Notify submitter on rejection/changes or full approval (outside transaction lock)
    if (['REJECTED', 'CHANGES_REQUESTED', 'APPROVED'].includes(finalStatus)) {
      try {
        await NotificationsService.dispatchNotification({
          recipientId: submission.submitted_by_id,
          title: `SUBMISSION ${finalStatus}: ${submission.submission_code}`,
          message: `${user.name || userRole} marked submission ${submission.submission_code} as ${action}.${decisionNotes ? ` Notes: ${decisionNotes}` : ''}`,
          category: 'APPROVAL',
          priority: finalStatus === 'APPROVED' ? 'HIGH' : 'CRITICAL',
          sourceEntityType: 'property_submission',
          sourceEntityId: String(id),
          linkUrl: `/app/approvals?submission=${id}`,
        });
      } catch (err) {
        console.warn('Submitter notification warning:', err.message);
      }
    }

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: `SUBMISSION_${action}`,
      entityType: 'property_submission',
      entityId: String(id),
      newValues: {
        reviewerRole: userRole,
        action,
        finalStatus,
        ownerReviewStatus: newOwnerStatus,
        opsReviewStatus: newOpsStatus,
        decisionNotes,
      },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    return this.getSubmissionById(id, user);
  }

  /**
   * Separate Authorized Publication Action (only after BOTH Owner & Operations Manager approved)
   */
  static async publishSubmission(id, user, req = null) {
    const userRole = String(user.role || '').toUpperCase();
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN', 'OPERATIONS_MANAGER'].includes(userRole)) {
      throw new ForbiddenError('You are not authorized to publish submissions.');
    }

    const submission = await pool.withTransaction(async (conn) => {
      const [lockedRows] = await conn.query(
        'SELECT * FROM property_submissions WHERE id = ? FOR UPDATE',
        [id]
      );
      if (lockedRows.length === 0) {
        throw new NotFoundError(`Submission #${id} not found.`);
      }
      const sub = lockedRows[0];

      if (
        ['OPERATIONS_MANAGER', 'MANAGER'].includes(userRole) &&
        user.propertyId &&
        parseInt(user.propertyId, 10) !== parseInt(sub.property_id, 10)
      ) {
        throw new ForbiddenError('You are not authorized to publish submissions for another property.');
      }

      if (sub.status === 'PUBLISHED') {
        throw new ConflictError('Submission has already been published.');
      }

      if (sub.owner_review_status !== 'APPROVED' || sub.ops_review_status !== 'APPROVED') {
        throw new ConflictError(
          `Publication blocked: Both Owner (${sub.owner_review_status}) and Operations Manager (${sub.ops_review_status}) approvals are required.`
        );
      }

      if (sub.status !== 'APPROVED') {
        throw new ConflictError(`Submission must be in APPROVED state before publishing (current: ${sub.status}).`);
      }

      await conn.query(
        `UPDATE property_submissions SET status = 'PUBLISHED', published_at = NOW(), published_by_id = ?, updated_at = NOW() WHERE id = ?`,
        [user.id, id]
      );

      if (sub.entity_type === 'APARTMENT' && sub.apartment_id) {
        await conn.query(
          `UPDATE apartments SET is_active = 1, approval_status = 'PUBLISHED', published_at = NOW(), published_by_id = ? WHERE id = ?`,
          [user.id, sub.apartment_id]
        );
        await conn.query(
          `UPDATE media_assets SET is_published = 1 WHERE (submission_id = ? OR (entity_type = 'APARTMENT' AND entity_id = ?))`,
          [id, sub.apartment_id]
        );
      } else {
        await conn.query(
          `UPDATE properties SET status = 'ACTIVE', approval_status = 'PUBLISHED', published_at = NOW(), published_by_id = ? WHERE id = ?`,
          [user.id, sub.property_id]
        );
        await conn.query(
          `UPDATE media_assets SET is_published = 1 WHERE (submission_id = ? OR (entity_type = 'PROPERTY' AND entity_id = ?))`,
          [id, sub.property_id]
        );
      }

      return sub;
    });

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PROPERTY_SUBMISSION_PUBLISHED',
      entityType: 'property_submission',
      entityId: String(id),
      newValues: {
        status: 'PUBLISHED',
        entityType: submission.entity_type,
        propertyId: submission.property_id,
        apartmentId: submission.apartment_id,
      },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    return this.getSubmissionById(id, user);
  }
}

module.exports = PropertySubmissionsService;
