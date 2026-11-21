/**
 * Central Operations, Directives, Operations Memos & Chat Integration Service
 * BFA Apartments Management System
 *
 * Implements:
 * 1. Operation Initiation & Centrally Enforced Routing Matrix
 * 2. Automatic Operations Memo Generation (Versioned, with PDF storage)
 * 3. Chat System Transport Integration (Direct/Group Thread creation, Context Cards, Acknowledgements)
 * 4. Multi-View Scoping (Initiated by me, Assigned to me, Supervising, Action Required, Archived)
 * 5. Lifecycle Management (Acknowledgement, Clarifications, Blockers, Progress, Task Linkage, Reviews)
 * 6. Versioned Amendments & Cancellation Notices
 * 7. Immutable Audit Events Ledger
 */

const pool = require('../../db/pool');
const PDFDocument = require('pdfkit');
const AuditService = require('../../core/audit/audit.service');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');
const ChatService = require('../chat/chat.service');
const ChatRepository = require('../chat/chat.repository');

class CentralOperationsService {
  /**
   * Enforce Central Routing Matrix according to Enterprise Governance:
   * - OWNER: Directives restricted to Admin & Operations Managers. Cannot direct General Staff.
   * - ADMIN / SUPER_ADMIN: Corporate directives to Managers or company-wide.
   * - MANAGER: Property-scoped operations for Receptionists & Staff within assigned property.
   * - STAFF / RECEPTIONIST: Unit/duty scoped, cannot cross-manage.
   */
  static async assertRoutingMatrix(initiatorUser, targetAudienceType, propertyId, specificUserIds = []) {
    const role = (initiatorUser.role || '').toUpperCase();

    // 1. Owner restrictions
    if (role === 'OWNER') {
      if (['PROPERTY_STAFF', 'PROPERTY_RECEPTIONISTS', 'PROPERTY_ALL'].includes(targetAudienceType)) {
        throw new ForbiddenError(
          'Routing Matrix Violation: Owner is strictly restricted to issuing Management Directives to Administrators and Operations Managers. Direct staff broadcasting is not permitted.'
        );
      }
      if (specificUserIds && specificUserIds.length > 0) {
        const usersRes = await pool.query(
          `SELECT id, role FROM users WHERE id = ANY($1::int[]);`,
          [specificUserIds]
        );
        const nonMgmt = usersRes.filter(u => !['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER'].includes((u.role || '').toUpperCase()));
        if (nonMgmt.length > 0) {
          throw new ForbiddenError(
            'Routing Matrix Violation: Owner directives may only target Administrative and Operations Management personnel.'
          );
        }
      }
    }

    // 2. Admin restrictions (Admin -> Managers)
    if (role === 'ADMIN') {
      if (['PROPERTY_STAFF', 'PROPERTY_RECEPTIONISTS'].includes(targetAudienceType)) {
        throw new ForbiddenError(
          'Routing Matrix Violation: Direct execution routes from Admin must go through Operations Managers.'
        );
      }
      if (specificUserIds && specificUserIds.length > 0) {
        const usersRes = await pool.query(
          `SELECT id, role FROM users WHERE id = ANY($1::int[]);`,
          [specificUserIds]
        );
        const nonMgmt = usersRes.filter(u => !['MANAGER', 'OPERATIONS_MANAGER', 'SUPER_ADMIN', 'OWNER'].includes((u.role || '').toUpperCase()));
        if (nonMgmt.length > 0) {
          throw new ForbiddenError(
            'Routing Matrix Violation: Admin directives must be directed to Operations Managers.'
          );
        }
      }
    }

    // 3. Manager property scope restrictions
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (!propertyId && targetAudienceType !== 'SPECIFIC_USER') {
        throw new BadRequestError('Managers must specify a property for operational directives.');
      }
      if (propertyId) {
        const propIdNum = parseInt(propertyId, 10);
        const hasAccess = await this.checkUserPropertyAccess(initiatorUser, propIdNum);
        if (!hasAccess) {
          throw new ForbiddenError('Access Denied: You cannot issue operations outside your assigned property.');
        }
      }
    }

    // 4. Staff and Receptionist restrictions: Cannot initiate operations
    if (['STAFF', 'RECEPTIONIST'].includes(role)) {
      throw new ForbiddenError(
        'Access Denied: Staff and Receptionists are task performers only and cannot initiate operations.'
      );
    }

    return true;
  }

  /**
   * Check if a user has access to a property
   */
  static async checkUserPropertyAccess(user, propertyId) {
    const role = (user.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      return true;
    }
    const propIdNum = parseInt(propertyId, 10);
    if (user.propertyId && parseInt(user.propertyId, 10) === propIdNum) {
      return true;
    }
    const checkRes = await pool.query(
      'SELECT 1 FROM user_property_assignments WHERE user_id = $1 AND property_id = $2 LIMIT 1;',
      [user.id, propIdNum]
    );
    return checkRes && checkRes.length > 0;
  }

  /**
   * Generate sequential codes
   */
  static async generateOperationCode() {
    const now = new Date();
    const prefix = `OPS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM central_operations WHERE operation_code LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  static async generateMemoReference() {
    const now = new Date();
    const prefix = `MEMO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM operations_memos WHERE memo_reference LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Resolve recipient users based on audience type and property
   */
  static async resolveRecipientUsers(targetAudienceType, propertyId, specificUserIds = []) {
    let resolved = [];

    if (['SPECIFIC_USER', 'SPECIFIC_USERS'].includes(targetAudienceType)) {
      if (!specificUserIds || specificUserIds.length === 0) {
        throw new BadRequestError('Specific recipient user IDs are required for this audience type.');
      }
      resolved = await pool.query(
        `SELECT id, name, email, role FROM users WHERE id = ANY($1::int[]) AND status = 'ACTIVE';`,
        [specificUserIds]
      );
    } else if (targetAudienceType === 'MANAGERS_ONLY') {
      resolved = await pool.query(
        `SELECT id, name, email, role FROM users WHERE role IN ('MANAGER', 'OPERATIONS_MANAGER', 'ADMIN') AND status = 'ACTIVE';`
      );
    } else if (targetAudienceType === 'PROPERTY_STAFF') {
      if (!propertyId) throw new BadRequestError('Property is required for PROPERTY_STAFF audience.');
      resolved = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email, u.role
         FROM users u
         LEFT JOIN user_property_assignments upa ON upa.user_id = u.id
         WHERE (u.property_id = $1 OR upa.property_id = $1)
           AND u.role = 'STAFF'
           AND u.status = 'ACTIVE';`,
        [propertyId]
      );
    } else if (targetAudienceType === 'PROPERTY_RECEPTIONISTS') {
      if (!propertyId) throw new BadRequestError('Property is required for PROPERTY_RECEPTIONISTS audience.');
      resolved = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email, u.role
         FROM users u
         LEFT JOIN user_property_assignments upa ON upa.user_id = u.id
         WHERE (u.property_id = $1 OR upa.property_id = $1)
           AND u.role = 'RECEPTIONIST'
           AND u.status = 'ACTIVE';`,
        [propertyId]
      );
    } else if (targetAudienceType === 'PROPERTY_ALL') {
      if (!propertyId) throw new BadRequestError('Property is required for PROPERTY_ALL audience.');
      resolved = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email, u.role
         FROM users u
         LEFT JOIN user_property_assignments upa ON upa.user_id = u.id
         WHERE (u.property_id = $1 OR upa.property_id = $1)
           AND u.role IN ('STAFF', 'RECEPTIONIST', 'MANAGER', 'OPERATIONS_MANAGER')
           AND u.status = 'ACTIVE';`,
        [propertyId]
      );
    } else if (targetAudienceType === 'DEPARTMENT_GROUP') {
      if (specificUserIds && specificUserIds.length > 0) {
        resolved = await pool.query(
          `SELECT id, name, email, role FROM users WHERE id = ANY($1::int[]) AND status = 'ACTIVE';`,
          [specificUserIds]
        );
      } else {
        throw new BadRequestError('Department group requires recipient users list.');
      }
    }

    if (!resolved || resolved.length === 0) {
      throw new BadRequestError('No active recipients found for the selected operational audience.');
    }

    return resolved;
  }

  /**
   * INITIATE A NEW CENTRAL OPERATION
   * Transactional creation of:
   * 1. central_operations record
   * 2. central_operation_recipients records
   * 3. operations_memos record (Version 1)
   * 4. PDF document storage in operational_documents_storage
   * 5. Chat thread & memo dispatch card with acknowledgements
   * 6. Audit event ledger entry
   */
  static async createOperation(initiatorUser, data) {
    const {
      title,
      category = 'PROPERTY_OPERATIONS',
      priority = 'NORMAL',
      property_id = null,
      target_audience_type = 'SPECIFIC_USER',
      recipient_user_ids = [],
      subject,
      purpose,
      operational_instructions,
      expected_outcome = null,
      responsibility_definition = null,
      reporting_requirements = null,
      deadline_at = null,
      supervisor_user_id = null,
    } = data;

    if (!title || !subject || !purpose || !operational_instructions) {
      throw new BadRequestError('Title, subject, purpose, and operational instructions are required.');
    }

    // 1. Routing Matrix check
    await this.assertRoutingMatrix(initiatorUser, target_audience_type, property_id, recipient_user_ids);

    // 2. Resolve recipients
    const recipients = await this.resolveRecipientUsers(target_audience_type, property_id, recipient_user_ids);

    // 3. Generate sequential codes
    const operationCode = await this.generateOperationCode();
    const memoReference = await this.generateMemoReference();

    // 4. Resolve Property details for memo header
    let propertyDetails = null;
    let propertyScopeSummary = 'Corporate / Multi-Property';
    if (property_id) {
      const pRes = await pool.query('SELECT id, name, code, city FROM properties WHERE id = $1 LIMIT 1;', [property_id]);
      if (pRes && pRes.length > 0) {
        propertyDetails = pRes[0];
        propertyScopeSummary = `${propertyDetails.name} (${propertyDetails.code || 'BFA'})`;
      }
    }

    // Issuer designation
    const issuerRoleName = (initiatorUser.role || '').replace(/_/g, ' ');
    const issuerDesignation = initiatorUser.jobTitle || `${issuerRoleName.charAt(0).toUpperCase() + issuerRoleName.slice(1).toLowerCase()} Executive`;

    // Recipient summary
    const recipientSummary = recipients.length === 1
      ? `${recipients[0].name} (${recipients[0].role})`
      : target_audience_type.replace(/_/g, ' ') + ` (${recipients.length} Personnel)`;

    // Deadline & effective date strings
    const deadlineText = deadline_at ? new Date(deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'As Directed / Ongoing';
    const effectiveDateText = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    // 5. Insert Central Operation
    const insertOpSql = `
      INSERT INTO central_operations (
        operation_code, title, category, priority, status,
        initiated_by_user_id, property_id, target_audience_type,
        subject, purpose, operational_instructions, expected_outcome,
        responsibility_definition, reporting_requirements, deadline_at,
        supervisor_user_id
      ) VALUES (
        $1, $2, $3, $4, 'ISSUED',
        $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14,
        $15
      ) RETURNING *;
    `;

    const opRows = await pool.query(insertOpSql, [
      operationCode,
      title,
      category,
      priority,
      initiatorUser.id,
      property_id,
      target_audience_type,
      subject,
      purpose,
      operational_instructions,
      expected_outcome,
      responsibility_definition,
      reporting_requirements,
      deadline_at,
      supervisor_user_id,
    ]);

    const createdOp = opRows.rows?.[0] || (Array.isArray(opRows) ? opRows[0] : opRows);
    const operationId = createdOp.id;

    // 6. Insert Recipients
    for (const r of recipients) {
      await pool.query(
        `INSERT INTO central_operation_recipients (operation_id, user_id, role_at_time, status)
         VALUES ($1, $2, $3, 'DELIVERED')
         ON CONFLICT (operation_id, user_id) DO NOTHING;`,
        [operationId, r.id, r.role]
      );
    }

    // 7. Insert Operations Memo Record (Version 1)
    const insertMemoSql = `
      INSERT INTO operations_memos (
        operation_id, memo_reference, version_number,
        issuer_user_id, issuer_designation, recipient_summary,
        property_scope_summary, title, category, priority,
        subject, purpose, operational_instructions, expected_outcome,
        responsibility_definition, reporting_requirements,
        deadline_text, effective_date_text
      ) VALUES (
        $1, $2, 1,
        $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15,
        $16, $17
      ) RETURNING *;
    `;

    const memoRows = await pool.query(insertMemoSql, [
      operationId,
      memoReference,
      initiatorUser.id,
      issuerDesignation,
      recipientSummary,
      propertyScopeSummary,
      title,
      category,
      priority,
      subject,
      purpose,
      operational_instructions,
      expected_outcome,
      responsibility_definition,
      reporting_requirements,
      deadlineText,
      effectiveDateText,
    ]);

    const createdMemo = memoRows.rows?.[0] || (Array.isArray(memoRows) ? memoRows[0] : memoRows);
    const memoId = createdMemo.id;

    // 8. Generate and store PDF in operational_documents_storage
    let storageId = null;
    try {
      const memoPdfBuffer = await this.generateOperationsMemoPdfBuffer({
        operation: createdOp,
        memo: createdMemo,
        initiator: initiatorUser,
        recipients,
        property: propertyDetails,
      });

      const storeSql = `
        INSERT INTO operational_documents_storage (
          entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by
        ) VALUES (
          'OPERATIONS_MEMO', $1, $2, 'application/pdf', $3, $4, $5
        ) RETURNING id;
      `;
      const storeRes = await pool.query(storeSql, [
        memoId,
        `${memoReference}.pdf`,
        memoPdfBuffer.length,
        memoPdfBuffer,
        initiatorUser.id,
      ]);
      storageId = storeRes.rows?.[0]?.id || (Array.isArray(storeRes) ? storeRes[0]?.id : null);

      await pool.query('UPDATE operations_memos SET document_storage_id = $1 WHERE id = $2;', [storageId, memoId]);
      await pool.query('UPDATE central_operations SET latest_memo_id = $1 WHERE id = $2;', [memoId, operationId]);
    } catch (pdfErr) {
      logger.error(`Error generating or saving memo PDF: ${pdfErr.message}`);
    }

    // 9. Dispatch via Existing Internal Staff Chat
    let chatThreadId = null;
    let chatMessageId = null;
    try {
      if (recipients.length === 1 && target_audience_type === 'SPECIFIC_USER') {
        // Personal operation: routed straight to recipient's private 1-on-1 DM thread
        const directThread = await ChatService.findOrCreateDirectThread(initiatorUser, recipients[0].id);
        chatThreadId = directThread.id;
      } else if (property_id) {
        // Shared Team Channel for the property
        const propChannelRes = await pool.query(
          `SELECT id FROM chat_threads WHERE thread_type = 'PROPERTY_CHANNEL' AND property_id = $1 AND status = 'ACTIVE' LIMIT 1;`,
          [property_id]
        );
        const propChannels = propChannelRes.rows || (Array.isArray(propChannelRes) ? propChannelRes : []);
        if (propChannels.length > 0) {
          chatThreadId = propChannels[0].id;
        } else {
          const pName = propertyDetails?.name || `Property #${property_id}`;
          const createdChannel = await ChatRepository.createPropertyChannel(initiatorUser, property_id, `${pName} Team Channel`);
          chatThreadId = createdChannel.id;
        }
      } else {
        // Multi-recipient operational group thread
        const participantIds = Array.from(new Set([initiatorUser.id, ...recipients.map(r => r.id)]));
        const groupThread = await ChatRepository.createGroupThread(
          initiatorUser,
          `[OPS] ${operationCode}: ${title.substring(0, 40)}`,
          participantIds
        );
        chatThreadId = groupThread.id;
      }

      if (chatThreadId) {
        const priorityIcon = priority === 'CRITICAL' ? '🚨' : priority === 'URGENT' ? '⚡' : '📋';
        const msgContent = `${priorityIcon} [OFFICIAL OPERATIONS MEMO — ${memoReference}]\n` +
          `Ref: ${operationCode}\n` +
          `Title: ${title}\n` +
          `Category: ${category.replace(/_/g, ' ')}\n` +
          `Priority: ${priority}\n` +
          `Property Scope: ${propertyScopeSummary}\n` +
          `Deadline: ${deadlineText}\n\n` +
          `Subject: ${subject}\n\n` +
          `Instructions: ${operational_instructions.substring(0, 300)}${operational_instructions.length > 300 ? '...' : ''}\n\n` +
          `⚠️ Mandatory action required. Review and acknowledge receipt in the Operations Centre.`;

        const sentMsg = await ChatService.sendMessage(initiatorUser, {
          threadId: chatThreadId,
          messageType: 'TEXT',
          content: msgContent,
          priority: priority === 'CRITICAL' ? 'CRITICAL' : priority === 'URGENT' ? 'URGENT' : 'IMPORTANT',
          contextEntityType: 'OPERATION',
          contextEntityId: operationId,
        });

        chatMessageId = sentMsg.id;

        // Populate chat_message_acknowledgements for each recipient
        for (const r of recipients) {
          await pool.query(
            `INSERT INTO chat_message_acknowledgements (message_id, user_id)
             VALUES ($1, $2)
             ON CONFLICT (message_id, user_id) DO NOTHING;`,
            [chatMessageId, r.id]
          );
        }

        // Link chat IDs back to central_operations
        await pool.query(
          `UPDATE central_operations 
           SET chat_thread_id = $1, chat_message_id = $2 
           WHERE id = $3;`,
          [chatThreadId, chatMessageId, operationId]
        );
      }
    } catch (chatErr) {
      logger.warn(`Failed to auto-dispatch operation to chat: ${chatErr.message}`);
    }

    // 10. Record Audit Event
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'INITIATED', $3, $4);`,
      [
        operationId,
        initiatorUser.id,
        `Operation ${operationCode} initiated by ${initiatorUser.name} (${initiatorUser.role})`,
        JSON.stringify({
          operationCode,
          memoReference,
          priority,
          category,
          recipientCount: recipients.length,
          chatThreadId,
        }),
      ]
    );

    await AuditService.record({
      actorId: initiatorUser.id,
      actorEmail: initiatorUser.email,
      actorRole: initiatorUser.role,
      action: 'CENTRAL_OPERATION_INITIATED',
      entityType: 'central_operation',
      entityId: String(operationId),
      newValues: {
        operationCode,
        memoReference,
        title,
        priority,
        category,
        recipients: recipients.map(r => r.id),
      },
    });

    return this.getOperationById(initiatorUser, operationId);
  }

  /**
   * LIST OPERATIONS ACROSS 5 OPERATIONAL VIEWS WITH FILTERS
   * Views:
   * 1. initiatedByMe
   * 2. assignedToMe
   * 3. supervising
   * 4. actionRequired
   * 5. archived
   */
  static async listOperations(user, filters = {}) {
    const role = (user.role || '').toUpperCase();
    const userId = user.id;
    const view = filters.view || 'assignedToMe';

    const conditions = [];
    const params = [];

    // Core View Branching
    if (view === 'initiatedByMe') {
      params.push(userId);
      conditions.push(`co.initiated_by_user_id = $${params.length}`);
    } else if (view === 'assignedToMe') {
      params.push(userId);
      conditions.push(`EXISTS (
        SELECT 1 FROM central_operation_recipients cor 
        WHERE cor.operation_id = co.id AND cor.user_id = $${params.length}
      )`);
    } else if (view === 'supervising') {
      if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
        // Global leadership sees company-wide oversight
      } else {
        params.push(userId);
        conditions.push(`(
          co.supervisor_user_id = $${params.length}
          OR co.initiated_by_user_id = $${params.length}
          OR (co.property_id IN (
            SELECT property_id FROM user_property_assignments WHERE user_id = $${params.length}
          ) AND '${role}' IN ('MANAGER', 'OPERATIONS_MANAGER'))
        )`);
      }
    } else if (view === 'actionRequired') {
      params.push(userId);
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM central_operation_recipients cor 
          WHERE cor.operation_id = co.id 
            AND cor.user_id = $${params.length}
            AND cor.acknowledged_at IS NULL
            AND co.status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')
        )
        OR (
          co.initiated_by_user_id = $${params.length} 
          AND co.status IN ('AWAITING_REVIEW', 'AWAITING_CLARIFICATION', 'BLOCKED')
        )
      )`);
    } else if (view === 'archived') {
      conditions.push(`co.status IN ('COMPLETED', 'CANCELLED', 'CLOSED')`);
      // Non-admin can only see their own archived
      if (!['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
        params.push(userId);
        conditions.push(`(
          co.initiated_by_user_id = $${params.length}
          OR co.supervisor_user_id = $${params.length}
          OR EXISTS (
            SELECT 1 FROM central_operation_recipients cor 
            WHERE cor.operation_id = co.id AND cor.user_id = $${params.length}
          )
        )`);
      }
    }

    // Role Security Boundary (Staff/Receptionist cannot snoop on unauthorized operations)
    if (['STAFF', 'RECEPTIONIST'].includes(role)) {
      params.push(userId);
      conditions.push(`(
        co.initiated_by_user_id = $${params.length}
        OR EXISTS (
          SELECT 1 FROM central_operation_recipients cor 
          WHERE cor.operation_id = co.id AND cor.user_id = $${params.length}
        )
      )`);
    }

    // General Filters
    if (filters.category && filters.category !== 'all') {
      params.push(filters.category);
      conditions.push(`co.category = $${params.length}`);
    }

    if (filters.priority && filters.priority !== 'all') {
      params.push(filters.priority);
      conditions.push(`co.priority = $${params.length}`);
    }

    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      conditions.push(`co.status = $${params.length}`);
    }

    if (filters.property_id && filters.property_id !== 'all') {
      params.push(parseInt(filters.property_id, 10));
      conditions.push(`co.property_id = $${params.length}`);
    }

    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      conditions.push(`(
        co.operation_code ILIKE $${params.length}
        OR co.title ILIKE $${params.length}
        OR co.subject ILIKE $${params.length}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        co.*,
        u_init.name AS initiator_name,
        u_init.email AS initiator_email,
        u_init.role AS initiator_role,
        p.name AS property_name,
        p.code AS property_code,
        om.memo_reference,
        om.version_number AS memo_version,
        om.document_storage_id,
        (
          SELECT COUNT(*) 
          FROM central_operation_recipients cor 
          WHERE cor.operation_id = co.id
        ) AS total_recipients_count,
        (
          SELECT COUNT(*) 
          FROM central_operation_recipients cor 
          WHERE cor.operation_id = co.id AND cor.acknowledged_at IS NOT NULL
        ) AS acknowledged_recipients_count,
        (
          SELECT COUNT(*) 
          FROM operational_tasks ot 
          WHERE ot.central_operation_id = co.id
        ) AS linked_tasks_count,
        (
          SELECT COUNT(*) 
          FROM operational_tasks ot 
          WHERE ot.central_operation_id = co.id AND ot.status = 'COMPLETED'
        ) AS completed_tasks_count,
        (
          SELECT cor.acknowledged_at 
          FROM central_operation_recipients cor 
          WHERE cor.operation_id = co.id AND cor.user_id = ${parseInt(userId, 10)}
          LIMIT 1
        ) AS user_acknowledged_at
      FROM central_operations co
      JOIN users u_init ON co.initiated_by_user_id = u_init.id
      LEFT JOIN properties p ON co.property_id = p.id
      LEFT JOIN operations_memos om ON co.latest_memo_id = om.id
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN co.priority = 'CRITICAL' THEN 1
          WHEN co.priority = 'URGENT' THEN 2
          WHEN co.priority = 'IMPORTANT' THEN 3
          ELSE 4
        END,
        co.created_at DESC
      LIMIT 100;
    `;

    const res = await pool.query(query, params);
    return res.rows || (Array.isArray(res) ? res : []);
  }

  /**
   * GET FULL OPERATION DETAILS BY ID
   * Includes memo history, recipient acknowledgement status, linked tasks, and audit events.
   */
  static async getOperationById(user, operationId) {
    const opIdNum = parseInt(operationId, 10);
    const role = (user.role || '').toUpperCase();

    const opRes = await pool.query(
      `SELECT 
        co.*,
        u_init.name AS initiator_name,
        u_init.email AS initiator_email,
        u_init.role AS initiator_role,
        u_sup.name AS supervisor_name,
        u_sup.email AS supervisor_email,
        p.name AS property_name,
        p.code AS property_code,
        p.address AS property_address,
        p.city AS property_city,
        om.memo_reference,
        om.version_number AS memo_version,
        om.document_storage_id,
        om.issuer_designation,
        om.recipient_summary,
        om.property_scope_summary,
        om.deadline_text,
        om.effective_date_text,
        om.amendment_reason
       FROM central_operations co
       JOIN users u_init ON co.initiated_by_user_id = u_init.id
       LEFT JOIN users u_sup ON co.supervisor_user_id = u_sup.id
       LEFT JOIN properties p ON co.property_id = p.id
       LEFT JOIN operations_memos om ON co.latest_memo_id = om.id
       WHERE co.id = $1
       LIMIT 1;`,
      [opIdNum]
    );

    if (!opRes || opRes.length === 0) {
      throw new NotFoundError(`Central Operation #${operationId} does not exist.`);
    }

    const op = opRes[0];

    // Access authorization check
    if (['STAFF', 'RECEPTIONIST'].includes(role)) {
      const recipientCheck = await pool.query(
        'SELECT 1 FROM central_operation_recipients WHERE operation_id = $1 AND user_id = $2 LIMIT 1;',
        [opIdNum, user.id]
      );
      if (op.initiated_by_user_id !== user.id && (!recipientCheck || recipientCheck.length === 0)) {
        throw new ForbiddenError('You are not authorized to view this operational record.');
      }
    }

    // Fetch Recipients with acknowledgement status
    const recipients = await pool.query(
      `SELECT 
        cor.*,
        u.name,
        u.email,
        u.role
       FROM central_operation_recipients cor
       JOIN users u ON cor.user_id = u.id
       WHERE cor.operation_id = $1
       ORDER BY cor.id ASC;`,
      [opIdNum]
    );

    // Fetch Memo Versions History
    const memos = await pool.query(
      `SELECT 
        id, memo_reference, version_number, issuer_designation,
        recipient_summary, property_scope_summary, deadline_text,
        effective_date_text, amendment_reason, document_storage_id, created_at
       FROM operations_memos
       WHERE operation_id = $1
       ORDER BY version_number DESC;`,
      [opIdNum]
    );

    // Fetch Linked Operational Tasks
    const linkedTasks = await pool.query(
      `SELECT 
        ot.id, ot.task_code, ot.title, ot.status, ot.priority, ot.due_date,
        u_assign.name AS assigned_to_name,
        u_assign.email AS assigned_to_email
       FROM operational_tasks ot
       LEFT JOIN users u_assign ON ot.assigned_to_id = u_assign.id
       WHERE ot.central_operation_id = $1
       ORDER BY ot.id DESC;`,
      [opIdNum]
    );

    // Fetch Audit Trail Events
    const events = await pool.query(
      `SELECT 
        coe.*,
        u.name AS actor_name,
        u.email AS actor_email,
        u.role AS actor_role
       FROM central_operation_events coe
       JOIN users u ON coe.actor_user_id = u.id
       WHERE coe.operation_id = $1
       ORDER BY coe.created_at DESC;`,
      [opIdNum]
    );

    return {
      ...op,
      recipients: recipients || [],
      memos: memos || [],
      linkedTasks: linkedTasks || [],
      events: events || [],
    };
  }

  /**
   * ACKNOWLEDGE OPERATION RECEIPT
   */
  static async acknowledgeOperation(user, operationId, note = null) {
    const opIdNum = parseInt(operationId, 10);

    const checkRes = await pool.query(
      'SELECT id, acknowledged_at FROM central_operation_recipients WHERE operation_id = $1 AND user_id = $2 LIMIT 1;',
      [opIdNum, user.id]
    );

    if (!checkRes || checkRes.length === 0) {
      throw new ForbiddenError('You are not a registered recipient of this operational memo.');
    }

    const now = new Date();
    await pool.query(
      `UPDATE central_operation_recipients 
       SET acknowledged_at = $1, acknowledgement_note = $2, acceptance_status = 'ACCEPTED' 
       WHERE operation_id = $3 AND user_id = $4;`,
      [now, note, opIdNum, user.id]
    );

    // Also update chat_message_acknowledgements if message exists
    const [op] = await pool.query('SELECT chat_message_id, operation_code, title FROM central_operations WHERE id = $1;', [opIdNum]);
    if (op?.chat_message_id) {
      await pool.query(
        `UPDATE chat_message_acknowledgements 
         SET acknowledged_at = $1 
         WHERE message_id = $2 AND user_id = $3;`,
        [now, op.chat_message_id, user.id]
      );
    }

    // Check if all recipients have acknowledged to transition status to ACKNOWLEDGED / IN_PROGRESS
    const unacknowledged = await pool.query(
      'SELECT COUNT(*) AS pending FROM central_operation_recipients WHERE operation_id = $1 AND acknowledged_at IS NULL;',
      [opIdNum]
    );
    const isFullyAcknowledged = parseInt(unacknowledged[0]?.pending || 0, 10) === 0;

    await pool.query(
      `UPDATE central_operations 
       SET status = CASE WHEN status = 'ISSUED' THEN 'ACKNOWLEDGED' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1;`,
      [opIdNum]
    );

    // Record Audit Event
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'ACKNOWLEDGED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Receipt acknowledged by ${user.name} (${user.role})`,
        JSON.stringify({ note, fullyAcknowledged: isFullyAcknowledged }),
      ]
    );

    return this.getOperationById(user, opIdNum);
  }

  /**
   * SUBMIT CLARIFICATION REQUEST OR FEEDBACK
   */
  static async requestClarification(user, operationId, { questionText }) {
    if (!questionText || questionText.trim().length < 5) {
      throw new BadRequestError('Detailed clarification inquiry text is required.');
    }
    const opIdNum = parseInt(operationId, 10);
    const op = await this.getOperationById(user, opIdNum);

    await pool.query(
      `UPDATE central_operations 
       SET status = 'AWAITING_CLARIFICATION', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1;`,
      [opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'CLARIFICATION_REQUESTED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Clarification requested by ${user.name}: "${questionText.substring(0, 100)}"`,
        JSON.stringify({ questionText }),
      ]
    );

    // If chat thread exists, dispatch notification message
    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `❓ [CLARIFICATION INQUIRY - ${op.operation_code}]\n${user.name} (${user.role}): ${questionText}`,
          priority: 'IMPORTANT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Could not post clarification to chat: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * RESPOND TO CLARIFICATION INQUIRY
   */
  static async respondClarification(user, operationId, { responseText }) {
    if (!responseText || responseText.trim().length < 5) {
      throw new BadRequestError('Detailed clarification response text is required.');
    }
    const opIdNum = parseInt(operationId, 10);
    const op = await this.getOperationById(user, opIdNum);

    await pool.query(
      `UPDATE central_operations 
       SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1;`,
      [opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'CLARIFICATION_RESPONDED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Clarification provided by ${user.name}: "${responseText.substring(0, 100)}"`,
        JSON.stringify({ responseText }),
      ]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `💡 [CLARIFICATION RESPONSE - ${op.operation_code}]\n${user.name} (${user.role}): ${responseText}`,
          priority: 'NORMAL',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Could not post clarification response to chat: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * REPORT OPERATIONAL BLOCKER
   */
  static async reportBlocker(user, operationId, { category = 'ACCESS', details }) {
    if (!details || details.trim().length < 5) {
      throw new BadRequestError('Blocker description details are required.');
    }
    const opIdNum = parseInt(operationId, 10);
    const op = await this.getOperationById(user, opIdNum);

    await pool.query(
      `UPDATE central_operations 
       SET status = 'BLOCKED', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1;`,
      [opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'BLOCKER_REPORTED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Operational blocker reported (${category}) by ${user.name}: "${details.substring(0, 100)}"`,
        JSON.stringify({ category, details }),
      ]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `🚨 [OPERATIONAL BLOCKER - ${op.operation_code}]\nCategory: ${category}\nReported By: ${user.name} (${user.role})\nDetails: ${details}\n\nImmediate managerial intervention requested.`,
          priority: 'URGENT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Could not post blocker alert to chat: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * UPDATE OPERATIONAL PROGRESS
   */
  static async updateProgress(user, operationId, { progressNotes, status = 'IN_PROGRESS' }) {
    if (!progressNotes || progressNotes.trim().length < 5) {
      throw new BadRequestError('Progress update notes are required.');
    }
    const opIdNum = parseInt(operationId, 10);
    const op = await this.getOperationById(user, opIdNum);

    await pool.query(
      `UPDATE central_operations 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2;`,
      [status, opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'PROGRESS_UPDATE', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Progress logged by ${user.name}: "${progressNotes.substring(0, 100)}"`,
        JSON.stringify({ progressNotes, status }),
      ]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `📈 [PROGRESS UPDATE - ${op.operation_code}]\nStatus: ${status}\nLogged By: ${user.name} (${user.role})\nNotes: ${progressNotes}`,
          priority: 'NORMAL',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Could not post progress to chat: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * SPAWN OR LINK OPERATIONAL TASK FROM AN OPERATION
   */
  static async createLinkedTask(user, operationId, taskData) {
    const opIdNum = parseInt(operationId, 10);
    const op = await this.getOperationById(user, opIdNum);

    const {
      assigned_to_id,
      title,
      description,
      task_category = 'GENERAL',
      priority = op.priority || 'NORMAL',
      due_date = op.deadline_at || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      apartment_id = null,
    } = taskData;

    if (!assigned_to_id || !title || !description) {
      throw new BadRequestError('Assigned user, title, and description are required for linked task creation.');
    }

    // Generate task code
    const now = new Date();
    const prefix = `TSK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const countRes = await pool.query(
      "SELECT COUNT(*) AS total FROM operational_tasks WHERE task_code LIKE $1;",
      [`${prefix}%`]
    );
    const count = parseInt(countRes[0]?.total || 0, 10) + 1;
    const taskCode = `${prefix}${String(count).padStart(4, '0')}`;

    const insertTaskSql = `
      INSERT INTO operational_tasks (
        task_code, property_id, apartment_id, central_operation_id,
        assigned_to_id, assigned_by_id, title, description,
        task_category, priority, due_date, status
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, 'PENDING'
      ) RETURNING *;
    `;

    const taskRows = await pool.query(insertTaskSql, [
      taskCode,
      op.property_id || (user.propertyId ? parseInt(user.propertyId, 10) : 1),
      apartment_id,
      opIdNum,
      assigned_to_id,
      user.id,
      title,
      description,
      task_category,
      priority,
      due_date,
    ]);

    const createdTask = taskRows.rows?.[0] || (Array.isArray(taskRows) ? taskRows[0] : taskRows);

    // Record event
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'TASK_LINKED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Task ${taskCode} created and linked to operation by ${user.name}`,
        JSON.stringify({ taskId: createdTask.id, taskCode, title }),
      ]
    );

    return createdTask;
  }

  /**
   * SUBMIT COMPLETION FOR REVIEW
   */
  static async submitCompletion(user, operationId, { completionNotes }) {
    if (!completionNotes || completionNotes.trim().length < 5) {
      throw new BadRequestError('Detailed completion summary notes are required.');
    }
    const opIdNum = parseInt(operationId, 10);
    const op = await this.getOperationById(user, opIdNum);

    await pool.query(
      `UPDATE central_operations 
       SET status = 'AWAITING_REVIEW', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1;`,
      [opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'COMPLETION_SUBMITTED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Operational completion submitted for managerial review by ${user.name}`,
        JSON.stringify({ completionNotes }),
      ]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `🏁 [COMPLETION SUBMITTED - ${op.operation_code}]\nSubmitted By: ${user.name} (${user.role})\nNotes: ${completionNotes}\n\nAwaiting managerial sign-off and closure review.`,
          priority: 'IMPORTANT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Could not post completion alert to chat: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * REVIEW OPERATION (APPROVE / COMPLETE OR REVISE / REJECT)
   */
  static async reviewOperation(user, operationId, { decision, reviewNotes }) {
    const role = (user.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER'].includes(role)) {
      throw new ForbiddenError('Only managerial and administrative personnel can conduct operational reviews.');
    }

    const opIdNum = parseInt(operationId, 10);
    const op = await this.getOperationById(user, opIdNum);

    const isApproved = decision === 'APPROVED' || decision === 'COMPLETED';
    const newStatus = isApproved ? 'COMPLETED' : 'REJECTED';
    const now = new Date();
    const completedAt = isApproved ? now : null;

    await pool.query(
      `UPDATE central_operations 
       SET status = $1,
           completed_at = $2,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3;`,
      [newStatus, completedAt, opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, $3, $4, $5);`,
      [
        opIdNum,
        user.id,
        isApproved ? 'APPROVED' : 'REJECTED',
        `Operation marked as ${newStatus} by ${user.name} (${user.role}): "${(reviewNotes || '').substring(0, 100)}"`,
        JSON.stringify({ decision, reviewNotes }),
      ]
    );

    if (op.chat_thread_id) {
      try {
        const badge = isApproved ? '✅ [OPERATION OFFICIALLY COMPLETED]' : '❌ [OPERATION RETURNED FOR REVISION]';
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `${badge}\nRef: ${op.operation_code}\nReviewed By: ${user.name} (${user.role})\nReview Notes: ${reviewNotes || 'Sign-off complete.'}`,
          priority: isApproved ? 'NORMAL' : 'URGENT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Could not post review decision to chat: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * AMEND OPERATION & ISSUE NEW MEMO VERSION
   */
  static async amendOperation(user, operationId, amendmentData) {
    const opIdNum = parseInt(operationId, 10);
    const op = await this.getOperationById(user, opIdNum);

    const role = (user.role || '').toUpperCase();
    if (op.initiated_by_user_id !== user.id && !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      throw new ForbiddenError('Only the initiating officer or an Administrator may amend an active operation.');
    }

    const {
      amendment_reason,
      operational_instructions = op.operational_instructions,
      deadline_at = op.deadline_at,
      priority = op.priority,
    } = amendmentData;

    if (!amendment_reason || amendment_reason.trim().length < 5) {
      throw new BadRequestError('A clear audit reason is required for operational amendments.');
    }

    const newVersion = (op.memo_version || 1) + 1;
    const memoReference = await this.generateMemoReference();
    const deadlineText = deadline_at ? new Date(deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : op.deadline_text;
    const effectiveDateText = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    // 1. Update central_operations
    await pool.query(
      `UPDATE central_operations 
       SET operational_instructions = $1, deadline_at = $2, priority = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4;`,
      [operational_instructions, deadline_at, priority, opIdNum]
    );

    // 2. Insert new memo version
    const insertMemoSql = `
      INSERT INTO operations_memos (
        operation_id, memo_reference, version_number,
        issuer_user_id, issuer_designation, recipient_summary,
        property_scope_summary, title, category, priority,
        subject, purpose, operational_instructions, expected_outcome,
        responsibility_definition, reporting_requirements,
        deadline_text, effective_date_text, amendment_reason
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16,
        $17, $18, $19
      ) RETURNING *;
    `;

    const newMemoRows = await pool.query(insertMemoSql, [
      opIdNum,
      memoReference,
      newVersion,
      user.id,
      op.issuer_designation || `${role} Executive`,
      op.recipient_summary || 'Authorized Operational Recipients',
      op.property_scope_summary || 'Corporate Scope',
      op.title,
      op.category,
      priority,
      op.subject,
      op.purpose,
      operational_instructions,
      op.expected_outcome,
      op.responsibility_definition,
      op.reporting_requirements,
      deadlineText,
      effectiveDateText,
      amendment_reason,
    ]);

    const createdNewMemo = newMemoRows.rows?.[0] || (Array.isArray(newMemoRows) ? newMemoRows[0] : newMemoRows);
    const newMemoId = createdNewMemo.id;

    // Generate & store revised PDF
    try {
      const memoPdfBuffer = await this.generateOperationsMemoPdfBuffer({
        operation: { ...op, operational_instructions, deadline_at, priority },
        memo: createdNewMemo,
        initiator: user,
        recipients: op.recipients,
        property: { name: op.property_name, code: op.property_code, city: op.property_city },
      });

      const storeSql = `
        INSERT INTO operational_documents_storage (
          entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by
        ) VALUES (
          'OPERATIONS_MEMO', $1, $2, 'application/pdf', $3, $4, $5
        ) RETURNING id;
      `;
      const storeRes = await pool.query(storeSql, [
        newMemoId,
        `${memoReference}_v${newVersion}.pdf`,
        memoPdfBuffer.length,
        memoPdfBuffer,
        user.id,
      ]);
      const newStorageId = storeRes.rows?.[0]?.id || (Array.isArray(storeRes) ? storeRes[0]?.id : null);

      await pool.query('UPDATE operations_memos SET document_storage_id = $1 WHERE id = $2;', [newStorageId, newMemoId]);
      await pool.query('UPDATE central_operations SET latest_memo_id = $1 WHERE id = $2;', [newMemoId, opIdNum]);
    } catch (pdfErr) {
      logger.error(`Error saving revised memo PDF: ${pdfErr.message}`);
    }

    // 3. Reset recipient acknowledgements for the amendment
    await pool.query(
      `UPDATE central_operation_recipients 
       SET acknowledged_at = NULL, acceptance_status = 'PENDING' 
       WHERE operation_id = $1;`,
      [opIdNum]
    );

    // 4. Log event
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'AMENDED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Operation amended by ${user.name} (Issued revised Memo ${memoReference} v${newVersion})`,
        JSON.stringify({ amendment_reason, newVersion, memoReference }),
      ]
    );

    // 5. Post notification in chat
    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `📝 [OFFICIAL MEMO AMENDMENT — ${memoReference} (v${newVersion})]\n` +
            `Ref: ${op.operation_code}\n` +
            `Amended By: ${user.name} (${user.role})\n` +
            `Reason for Revision: ${amendment_reason}\n\n` +
            `Updated Instructions: ${operational_instructions.substring(0, 250)}...\n\n` +
            `⚠️ Please review the revised memo in the Operations Centre and re-acknowledge.`,
          priority: 'URGENT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Could not post amendment to chat: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * CANCEL OPERATION & DISPATCH FORMAL NOTICE
   */
  static async cancelOperation(user, operationId, { cancellation_reason }) {
    if (!cancellation_reason || cancellation_reason.trim().length < 5) {
      throw new BadRequestError('A comprehensive justification is required to cancel an active operation.');
    }

    const opIdNum = parseInt(operationId, 10);
    const op = await this.getOperationById(user, opIdNum);

    const role = (user.role || '').toUpperCase();
    if (op.initiated_by_user_id !== user.id && !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      throw new ForbiddenError('Only the initiating officer or an Administrator may cancel an active operation.');
    }

    const now = new Date();
    await pool.query(
      `UPDATE central_operations 
       SET status = 'CANCELLED',
           cancelled_at = $1,
           cancellation_reason = $2,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3;`,
      [now, cancellation_reason, opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'CANCELLED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Operation formally cancelled by ${user.name} (${user.role}): "${cancellation_reason.substring(0, 100)}"`,
        JSON.stringify({ cancellation_reason }),
      ]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `🛑 [OFFICIAL CANCELLATION NOTICE — ${op.operation_code}]\n` +
            `Title: ${op.title}\n` +
            `Cancelled By: ${user.name} (${user.role})\n` +
            `Reason: ${cancellation_reason}\n\n` +
            `All associated directives and linked pending actions under this operation are officially revoked.`,
          priority: 'URGENT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Could not post cancellation to chat: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * RETRIEVE MEMO PDF BINARY BUFFER
   */
  static async getMemoPdfBuffer(user, memoId, operationId) {
    let memoRes;
    if (memoId) {
      const memoIdNum = parseInt(memoId, 10);
      memoRes = await pool.query(
        `SELECT om.*, co.initiated_by_user_id 
         FROM operations_memos om 
         JOIN central_operations co ON om.operation_id = co.id 
         WHERE om.id = $1 LIMIT 1;`,
        [memoIdNum]
      );
    } else if (operationId) {
      const opIdNum = parseInt(operationId, 10);
      memoRes = await pool.query(
        `SELECT om.*, co.initiated_by_user_id 
         FROM operations_memos om 
         JOIN central_operations co ON om.operation_id = co.id 
         WHERE om.operation_id = $1 
         ORDER BY om.version_number DESC LIMIT 1;`,
        [opIdNum]
      );
    }

    if (!memoRes || memoRes.length === 0) {
      throw new NotFoundError(`Operations Memo not found.`);
    }

    const memo = memoRes[0];

    // Access authorization check for non-admin
    const role = (user.role || '').toUpperCase();
    if (['STAFF', 'RECEPTIONIST'].includes(role)) {
      const recipientCheck = await pool.query(
        'SELECT 1 FROM central_operation_recipients WHERE operation_id = $1 AND user_id = $2 LIMIT 1;',
        [memo.operation_id, user.id]
      );
      if (memo.initiated_by_user_id !== user.id && (!recipientCheck || recipientCheck.length === 0)) {
        throw new ForbiddenError('You do not have authorization to download this Operations Memo.');
      }
    }

    // Check if stored in operational_documents_storage
    if (memo.document_storage_id) {
      const docRes = await pool.query(
        'SELECT file_data, file_name, mime_type FROM operational_documents_storage WHERE id = $1 LIMIT 1;',
        [memo.document_storage_id]
      );
      if (docRes && docRes.length > 0 && docRes[0].file_data) {
        return {
          buffer: docRes[0].file_data,
          fileName: docRes[0].file_name,
          mimeType: docRes[0].mime_type,
        };
      }
    }

    // If binary not found, regenerate on-the-fly
    const op = await this.getOperationById(user, memo.operation_id);
    const pdfBuffer = await this.generateOperationsMemoPdfBuffer({
      operation: op,
      memo,
      initiator: { name: op.initiator_name, role: op.initiator_role, email: op.initiator_email },
      recipients: op.recipients,
      property: { name: op.property_name, code: op.property_code, city: op.property_city },
    });

    return {
      buffer: pdfBuffer,
      fileName: `${memo.memo_reference}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  /**
   * PDFKit GENERATOR FOR FORMAL OPERATIONS MEMORANDUM
   * Beautiful executive styling matching BFA corporate standards.
   */
  static async generateOperationsMemoPdfBuffer({ operation, memo, initiator, recipients = [], property }) {
    return new Promise((resolve, reject) => {
      // Use bufferPages: true for professional multi-page numbering
      const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Corporate Typography & Colors
      const primaryDark = '#0f172a';
      const secondaryMuted = '#475569';
      const borderLine = '#cbd5e1';
      const brandAccent = '#1d4ed8';
      const contentWidth = doc.page.width - 100; // 495.28 pt

      const ensureSpace = (requiredPoints) => {
        if (doc.y + requiredPoints > doc.page.height - 60) {
          doc.addPage();
        }
      };

      // ─── Header Branding ───────────────────────────────────────────
      doc.fillColor(primaryDark).fontSize(18).font('Helvetica-Bold').text('BFA APARTMENTS MANAGEMENT SYSTEM', { align: 'center' });
      doc.fontSize(9.5).font('Helvetica').fillColor(secondaryMuted).text('Central Operations & Executive Directives Directorate', { align: 'center' });
      doc.moveDown(0.3);
      doc.strokeColor(borderLine).lineWidth(1.2).moveTo(50, doc.y).lineTo(50 + contentWidth, doc.y).stroke();
      doc.moveDown(0.6);

      // ─── Document Title ────────────────────────────────────────────
      doc.fillColor(brandAccent).fontSize(13).font('Helvetica-Bold').text('OFFICIAL OPERATIONS MEMORANDUM', { align: 'center' });
      doc.moveDown(0.6);

      // ─── Metadata Header Table ─────────────────────────────────────
      const startY = doc.y;
      const tableHeight = 115;
      doc.rect(50, startY, contentWidth, tableHeight).strokeColor(borderLine).fillAndStroke('#f8fafc', borderLine);

      const col1Label = 60;
      const col1Val = 145;
      const col2Label = 320;
      const col2Val = 395;
      let lineY = startY + 10;

      // Row 1: Memo Ref & Date
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('MEMO REF:', col1Label, lineY);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryDark).text(memo.memo_reference || 'REF-MEMO', col1Val, lineY);

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('DATE:', col2Label, lineY);
      doc.font('Helvetica').fontSize(8.5).fillColor(primaryDark).text(memo.effective_date_text || new Date().toLocaleDateString(), col2Val, lineY);

      // Row 2: Operation Code & Version
      lineY += 18;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('OPS REF:', col1Label, lineY);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(brandAccent).text(operation.operation_code || 'OPS-PENDING', col1Val, lineY);

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('VERSION:', col2Label, lineY);
      doc.font('Helvetica').fontSize(8.5).fillColor(primaryDark).text(`v${memo.version_number || 1}.0 ${memo.version_number > 1 ? '(Revised)' : ''}`, col2Val, lineY);

      // Row 3: Issued By & Priority
      lineY += 18;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('ISSUED BY:', col1Label, lineY);
      doc.font('Helvetica').fontSize(8.5).fillColor(primaryDark).text(`${initiator.name || 'Authorised Officer'} — ${memo.issuer_designation || initiator.role}`, col1Val, lineY, { width: 165 });

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('PRIORITY:', col2Label, lineY);
      const prioColor = operation.priority === 'CRITICAL' ? '#dc2626' : operation.priority === 'URGENT' ? '#d97706' : '#2563eb';
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(prioColor).text(operation.priority || 'NORMAL', col2Val, lineY);

      // Row 4: Target Audience & Property Scope
      lineY += 20;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('TO (RECIPIENT):', col1Label, lineY);
      doc.font('Helvetica').fontSize(8.5).fillColor(primaryDark).text(memo.recipient_summary || 'Authorised Operational Personnel', col1Val, lineY, { width: 165 });

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('PROPERTY:', col2Label, lineY);
      doc.font('Helvetica').fontSize(8.5).fillColor(primaryDark).text(memo.property_scope_summary || property?.name || 'Corporate', col2Val, lineY, { width: 145 });

      // Row 5: Deadline & Category
      lineY += 20;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('DEADLINE:', col1Label, lineY);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryDark).text(memo.deadline_text || 'Standard Timeline', col1Val, lineY);

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryMuted).text('CATEGORY:', col2Label, lineY);
      doc.font('Helvetica').fontSize(8.5).fillColor(primaryDark).text((operation.category || 'DIRECTIVE').replace(/_/g, ' '), col2Val, lineY);

      doc.y = startY + tableHeight + 12;

      // ─── Subject Banner ────────────────────────────────────────────
      ensureSpace(40);
      const subjY = doc.y;
      doc.rect(50, subjY, contentWidth, 24).fill('#e2e8f0');
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(primaryDark).text(`SUBJECT: ${memo.subject || operation.subject}`, 60, subjY + 6, { width: contentWidth - 20 });
      doc.y = subjY + 34;

      // Helper function for rendering sections with dynamic page safety
      const renderSection = (num, secTitle, secBody) => {
        if (!secBody || !secBody.trim()) return;
        ensureSpace(45);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(brandAccent).text(`${num}. ${secTitle.toUpperCase()}`);
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(9).fillColor(primaryDark).text(secBody, { align: 'justify', lineGap: 2.5, width: contentWidth });
        doc.moveDown(0.7);
      };

      // ─── Core Structured Sections ──────────────────────────────────
      renderSection('1', 'Purpose & Executive Rationale', memo.purpose || operation.purpose);
      renderSection('2', 'Operational Instructions & Directives', memo.operational_instructions || operation.operational_instructions);

      if (memo.expected_outcome || operation.expected_outcome) {
        renderSection('3', 'Expected Outcome & Key Deliverables', memo.expected_outcome || operation.expected_outcome);
      }

      if (memo.responsibility_definition || operation.responsibility_definition) {
        renderSection('4', 'Execution Responsibility & Accountability Matrix', memo.responsibility_definition || operation.responsibility_definition);
      }

      if (memo.reporting_requirements || operation.reporting_requirements) {
        renderSection('5', 'Reporting Requirements & Verification Procedures', memo.reporting_requirements || operation.reporting_requirements);
      }

      if (memo.amendment_reason) {
        ensureSpace(50);
        const amendY = doc.y;
        doc.rect(50, amendY, contentWidth, 32).fillAndStroke('#fef3c7', '#f59e0b');
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#b45309').text(`REVISION AUDIT NOTE (v${memo.version_number}):`, 60, amendY + 4);
        doc.font('Helvetica').fontSize(8.5).fillColor('#78350f').text(memo.amendment_reason, 60, amendY + 16, { width: contentWidth - 20 });
        doc.y = amendY + 40;
      }

      // ─── Compliance & Acknowledgement Block ─────────────────────────
      ensureSpace(60);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(brandAccent).text('FORMAL COMPLIANCE & ACKNOWLEDGEMENT MANDATE');
      doc.moveDown(0.2);
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(secondaryMuted).text(
        'All designated recipients are required by company standard operating procedures to formally acknowledge receipt of this memorandum via the BFA Staff Portal / Operations Centre within the stipulated timeframe. Failure to acknowledge or carry out directed operational mandates constitutes a procedural breach.',
        { align: 'justify', width: contentWidth }
      );
      doc.moveDown(0.8);

      // Sign-off signature footer
      ensureSpace(70);
      const signY = doc.y;
      doc.strokeColor(borderLine).lineWidth(1).moveTo(50, signY).lineTo(250, signY).stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryDark).text(initiator.name || 'Authorised Signatory', 50, signY + 4);
      doc.font('Helvetica').fontSize(8).fillColor(secondaryMuted).text(memo.issuer_designation || initiator.role, 50, signY + 16);
      doc.text(`Digital Verification Timestamp: ${new Date().toISOString()}`, 50, signY + 26);

      // Multi-page footer across all pages
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(7.5).fillColor('#94a3b8').text(
          `BFA APARTMENTS — CONFIDENTIAL INTERNAL OPERATIONAL DOCUMENT — Page ${i + 1} of ${pages.count}`,
          50,
          doc.page.height - 35,
          { align: 'center', width: contentWidth }
        );
      }

      doc.end();
    });
  }
}

module.exports = CentralOperationsService;
