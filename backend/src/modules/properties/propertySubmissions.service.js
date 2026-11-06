const pool = require('../../db/pool');
const auditService = require('../../core/audit/audit.service');
const { ValidationError, ForbiddenError, NotFoundError, ConflictError } = require('../../core/errors/apiError');

class PropertySubmissionsService {
  /**
   * Create a new property content or photo submission
   */
  static async createSubmission({
    propertyId,
    submissionType = 'CONTENT_UPDATE',
    contentSnapshot = {},
    mediaAssetIds = [],
    user,
    req = null,
  }) {
    if (!propertyId) {
      throw new ValidationError('Property ID is required.');
    }
    if (!['NEW_PROPERTY', 'CONTENT_UPDATE', 'PHOTO_UPDATE'].includes(submissionType)) {
      throw new ValidationError(`Invalid submission type: ${submissionType}`);
    }

    // Verify property exists
    const props = await pool.query('SELECT id, name FROM properties WHERE id = ?', [propertyId]);
    if (props.length === 0) {
      throw new NotFoundError(`Property #${propertyId} does not exist.`);
    }

    // Scoping check: Operations Manager can only submit for their assigned property
    if (['OPERATIONS_MANAGER', 'MANAGER'].includes(user.role) && user.propertyId && parseInt(user.propertyId, 10) !== parseInt(propertyId, 10)) {
      throw new ForbiddenError('Operations Managers can only create submissions for their assigned property.');
    }

    // Determine current version number
    const maxVerRows = await pool.query(
      'SELECT MAX(version_number) as max_ver FROM property_submissions WHERE property_id = ?',
      [propertyId]
    );
    const versionNumber = (maxVerRows[0]?.max_ver || 0) + 1;
    const submissionCode = `BFA-SUB-${propertyId}-V${versionNumber}-${Date.now().toString(36).toUpperCase()}`;

    const snapshotJson = typeof contentSnapshot === 'string' ? contentSnapshot : JSON.stringify(contentSnapshot);

    const result = await pool.query(
      `INSERT INTO property_submissions (
        submission_code, property_id, version_number, submission_type,
        status, content_snapshot, submitted_by_id, submitted_at,
        admin_review_status, owner_review_status
      ) VALUES (?, ?, ?, ?, 'SUBMITTED', ?, ?, NOW(), 'PENDING', 'PENDING')`,
      [submissionCode, propertyId, versionNumber, submissionType, snapshotJson, user.id]
    );

    const submissionId = result.insertId;

    // Link media assets if provided
    if (Array.isArray(mediaAssetIds) && mediaAssetIds.length > 0) {
      for (const mediaId of mediaAssetIds) {
        await pool.query(
          'UPDATE media_assets SET submission_id = ?, is_published = 0 WHERE id = ?',
          [submissionId, mediaId]
        );
      }
    }

    const created = await this.getSubmissionById(submissionId, user);

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
        versionNumber,
        submissionType,
        status: 'SUBMITTED',
      },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    return created;
  }

  /**
   * List submissions with property scoping
   */
  static async listSubmissions(query = {}, user) {
    let sql = `
      SELECT 
        s.*,
        p.name AS property_name,
        p.code AS property_code,
        u.name AS submitted_by_name,
        admin_u.name AS admin_reviewed_by_name,
        owner_u.name AS owner_reviewed_by_name,
        (SELECT COUNT(*) FROM property_review_comments c WHERE c.submission_id = s.id) AS comments_count
      FROM property_submissions s
      JOIN properties p ON s.property_id = p.id
      JOIN users u ON s.submitted_by_id = u.id
      LEFT JOIN users admin_u ON s.admin_reviewed_by_id = admin_u.id
      LEFT JOIN users owner_u ON s.owner_reviewed_by_id = owner_u.id
      WHERE 1=1
    `;
    const params = [];

    // Property isolation for Operations Managers
    if (['OPERATIONS_MANAGER', 'MANAGER'].includes(user.role) && user.propertyId) {
      sql += ' AND s.property_id = ?';
      params.push(user.propertyId);
    } else if (query.propertyId && query.propertyId !== 'all') {
      sql += ' AND s.property_id = ?';
      params.push(parseInt(query.propertyId, 10));
    }

    if (query.status && query.status !== 'ALL') {
      sql += ' AND s.status = ?';
      params.push(query.status);
    }

    sql += ' ORDER BY s.id DESC';

    const rows = await pool.query(sql, params);
    return rows.map((r) => ({
      ...r,
      content_snapshot: typeof r.content_snapshot === 'string' ? JSON.parse(r.content_snapshot || '{}') : r.content_snapshot,
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
        u.name AS submitted_by_name,
        admin_u.name AS admin_reviewed_by_name,
        owner_u.name AS owner_reviewed_by_name
      FROM property_submissions s
      JOIN properties p ON s.property_id = p.id
      JOIN users u ON s.submitted_by_id = u.id
      LEFT JOIN users admin_u ON s.admin_reviewed_by_id = admin_u.id
      LEFT JOIN users owner_u ON s.owner_reviewed_by_id = owner_u.id
      WHERE s.id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      throw new NotFoundError(`Submission #${id} not found.`);
    }

    const submission = rows[0];

    // Property isolation
    if (user && ['OPERATIONS_MANAGER', 'MANAGER'].includes(user.role) && user.propertyId && parseInt(user.propertyId, 10) !== parseInt(submission.property_id, 10)) {
      throw new ForbiddenError('You are not authorized to view submissions for another property.');
    }

    // Fetch review comments
    const comments = await pool.query(
      `SELECT c.*, u.name as author_name
       FROM property_review_comments c
       JOIN users u ON c.author_id = u.id
       WHERE c.submission_id = ?
       ORDER BY c.id ASC`,
      [id]
    );

    // Fetch linked media assets
    const media = await pool.query(
      'SELECT * FROM media_assets WHERE submission_id = ? ORDER BY display_order ASC, id ASC',
      [id]
    );

    return {
      ...submission,
      content_snapshot: typeof submission.content_snapshot === 'string' ? JSON.parse(submission.content_snapshot || '{}') : submission.content_snapshot,
      review_comments: comments,
      media_assets: media,
    };
  }

  /**
   * Review a submission (Dual Review: Admin and Owner independent reviews)
   */
  static async reviewSubmission(id, {
    action, // 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'
    decisionNotes = '',
    commentTargetType = null, // 'PROPERTY' | 'APARTMENT' | 'MEDIA_ASSET'
    commentTargetId = null,
    commentType = 'CORRECTION_REQUIRED',
    commentContent = '',
  }, user, req = null) {
    if (!['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'].includes(action)) {
      throw new ValidationError(`Invalid review action: ${action}. Must be APPROVED, CHANGES_REQUESTED, or REJECTED.`);
    }

    const userRole = (user.role || '').toUpperCase();
    if (!['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(userRole)) {
      throw new ForbiddenError('Only Admins and the Business Owner are authorized to review property submissions.');
    }

    const submission = await this.getSubmissionById(id, user);

    if (['PUBLISHED'].includes(submission.status)) {
      throw new ConflictError('Cannot review an already published submission.');
    }

    // Dual-Review Rule: Submitter CANNOT approve or review their own submission
    if (parseInt(submission.submitted_by_id, 10) === parseInt(user.id, 10)) {
      throw new ForbiddenError('Self-approval violation: Submitters are strictly forbidden from reviewing or approving their own submissions.');
    }

    // Role-specific review tracking
    let isReviewingAsAdmin = userRole === 'ADMIN' || (userRole === 'SUPER_ADMIN' && submission.admin_review_status === 'PENDING');
    let isReviewingAsOwner = userRole === 'OWNER';

    // If a Super Admin acts, default to Admin reviewer unless specified
    if (userRole === 'SUPER_ADMIN' && !isReviewingAsAdmin && !isReviewingAsOwner) {
      isReviewingAsAdmin = true;
    }

    const updates = [];
    const params = [];

    if (isReviewingAsOwner) {
      updates.push('owner_review_status = ?', 'owner_reviewed_by_id = ?', 'owner_decision_notes = ?', 'owner_reviewed_at = NOW()');
      params.push(action, user.id, decisionNotes || null);
    } else {
      updates.push('admin_review_status = ?', 'admin_reviewed_by_id = ?', 'admin_decision_notes = ?', 'admin_reviewed_at = NOW()');
      params.push(action, user.id, decisionNotes || null);
    }

    // Calculate new overall status
    const currentAdminStatus = isReviewingAsOwner ? submission.admin_review_status : action;
    const currentOwnerStatus = isReviewingAsOwner ? action : submission.owner_review_status;

    let overallStatus = 'IN_REVIEW';
    if (currentAdminStatus === 'REJECTED' || currentOwnerStatus === 'REJECTED') {
      overallStatus = 'REJECTED';
    } else if (currentAdminStatus === 'CHANGES_REQUESTED' || currentOwnerStatus === 'CHANGES_REQUESTED') {
      overallStatus = 'CHANGES_REQUESTED';
    } else if (currentAdminStatus === 'APPROVED' && currentOwnerStatus === 'APPROVED') {
      overallStatus = 'FULLY_APPROVED';
    } else if (currentAdminStatus === 'APPROVED') {
      overallStatus = 'APPROVED_BY_ADMIN';
    } else if (currentOwnerStatus === 'APPROVED') {
      overallStatus = 'APPROVED_BY_OWNER';
    }

    updates.push('status = ?');
    params.push(overallStatus);

    params.push(id);
    await pool.query(`UPDATE property_submissions SET ${updates.join(', ')} WHERE id = ?`, params);

    // If targeted comment provided, record it
    if (commentTargetType && commentContent.trim()) {
      await pool.query(
        `INSERT INTO property_review_comments (
          submission_id, property_id, target_type, target_id,
          author_id, author_role, comment_type, content, resolution_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
        [
          id,
          submission.property_id,
          commentTargetType,
          commentTargetId ? parseInt(commentTargetId, 10) : submission.property_id,
          user.id,
          userRole,
          commentType,
          commentContent.trim(),
        ]
      );
    }

    const updated = await this.getSubmissionById(id, user);

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: userRole,
      action: 'PROPERTY_SUBMISSION_REVIEWED',
      entityType: 'property_submission',
      entityId: String(id),
      newValues: {
        action,
        decisionNotes,
        adminReviewStatus: currentAdminStatus,
        ownerReviewStatus: currentOwnerStatus,
        overallStatus,
      },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    return updated;
  }

  /**
   * Publish a fully-approved submission
   */
  static async publishSubmission(id, user, req = null) {
    const userRole = (user.role || '').toUpperCase();
    if (!['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
      throw new ForbiddenError('Only the Property Owner or System Admin can publish approved property content.');
    }

    const submission = await this.getSubmissionById(id, user);

    if (submission.status === 'PUBLISHED') {
      throw new ConflictError('This submission is already published.');
    }

    // Non-negotiable Dual-Approval Gate: BOTH Admin and Owner MUST have approved
    const isBothApproved =
      submission.admin_review_status === 'APPROVED' &&
      submission.owner_review_status === 'APPROVED';

    if (!isBothApproved || submission.status !== 'FULLY_APPROVED') {
      throw new ForbiddenError(
        `Dual-Approval Gate Violation: Publication blocked. Submissions strictly require independent approval from BOTH the Admin and the Owner before publication. (Admin: ${submission.admin_review_status}, Owner: ${submission.owner_review_status})`
      );
    }

    // Apply content updates to property if specified in snapshot
    const snapshot = submission.content_snapshot || {};
    if (snapshot.name || snapshot.description || snapshot.address) {
      const updates = [];
      const params = [];
      if (snapshot.name) { updates.push('name = ?'); params.push(snapshot.name); }
      if (snapshot.description) { updates.push('description = ?'); params.push(snapshot.description); }
      if (snapshot.address) { updates.push('address = ?'); params.push(snapshot.address); }
      if (snapshot.city) { updates.push('city = ?'); params.push(snapshot.city); }
      if (snapshot.state) { updates.push('state = ?'); params.push(snapshot.state); }
      if (snapshot.amenities) {
        updates.push('amenities = ?');
        params.push(typeof snapshot.amenities === 'string' ? snapshot.amenities : JSON.stringify(snapshot.amenities));
      }

      if (updates.length > 0) {
        params.push(submission.property_id);
        await pool.query(`UPDATE properties SET ${updates.join(', ')} WHERE id = ?`, params);
      }
    }

    // Mark associated media assets as published
    await pool.query(
      'UPDATE media_assets SET is_published = 1 WHERE submission_id = ?',
      [id]
    );

    // Mark submission published
    await pool.query(
      `UPDATE property_submissions 
       SET status = 'PUBLISHED', published_at = NOW(), published_by_id = ?
       WHERE id = ?`,
      [user.id, id]
    );

    const published = await this.getSubmissionById(id, user);

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: userRole,
      action: 'PROPERTY_SUBMISSION_PUBLISHED',
      entityType: 'property_submission',
      entityId: String(id),
      newValues: {
        status: 'PUBLISHED',
        publishedAt: published.published_at,
        publishedById: user.id,
      },
      requestId: req?.id,
      ipAddress: req?.ip,
    });

    return published;
  }
}

module.exports = PropertySubmissionsService;

