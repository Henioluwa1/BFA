/**
 * Central Operations & Unified Ticketing Engine Service
 * BFA Apartments Management System
 *
 * Authoritative service backing Ticket Issuance, Priority-Based Ack SLA,
 * Ownership & Reassignment History, Deadline Extensions, DB-Persisted Evidence,
 * Formal Closure / Reopen Workflows, Official Memorandum PDF Generation,
 * and Property-Scoped Authorization.
 */

const pool = require('../../db/pool');
const logger = require('../../utils/logger');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../../core/errors/apiError');
const ChatRepository = require('../chat/chat.repository');
const ChatService = require('../chat/chat.service');
const NotificationsService = require('../notifications/notifications.service');
const MemoPdfGenerator = require('./memoPdfGenerator');
const {
  DEFAULT_ACK_SLA_HOURS,
  normalizePriority,
  getSlaHoursForPriority,
  validateAckSlaConfig,
  formatLagosTime,
  deriveNextAction,
} = require('./ticketSla.helper');

function extractRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function extractInsertId(res) {
  if (!res) return null;
  if (Array.isArray(res) && res[0]?.id) return res[0].id;
  if (res.rows?.[0]?.id) return res.rows[0].id;
  if (res.insertId) return res.insertId;
  return null;
}

function addHoursDate(date, hours) {
  const base = date instanceof Date ? date : new Date(date);
  return new Date(base.getTime() + Number(hours) * 3600 * 1000);
}

class CentralOperationsService {
  static deriveNextAction(op, viewerUser) {
    return deriveNextAction(op, viewerUser);
  }

  // ─── Priority Ack SLA Configuration (Owner-Configurable 3-24h) ─────────
  static async getAckSlaConfig() {
    try {
      const rows = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'ticket_ack_sla_hours' LIMIT 1"
      );
      const list = extractRows(rows);
      if (list.length > 0 && list[0].setting_value) {
        const parsed = typeof list[0].setting_value === 'string'
          ? JSON.parse(list[0].setting_value)
          : list[0].setting_value;
        return { ...DEFAULT_ACK_SLA_HOURS, ...parsed };
      }
    } catch (err) {
      logger.warn(`Using default Ack SLA config: ${err.message}`);
    }
    return { ...DEFAULT_ACK_SLA_HOURS };
  }

  static async updateAckSlaConfig(user, inputMap) {
    const role = String(user?.role || '').toUpperCase();
    if (!['OWNER', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenError('Only the Owner or Super Admin may modify priority Acknowledgment SLA thresholds.');
    }
    let validated;
    try {
      validated = validateAckSlaConfig(inputMap);
    } catch (err) {
      throw new BadRequestError(err.message);
    }

    const jsonStr = JSON.stringify(validated);
    if (pool.isPostgres()) {
      await pool.query(
        `INSERT INTO system_settings (category, setting_key, setting_value, description)
         VALUES ('ticketing', 'ticket_ack_sla_hours', ?, 'Priority-based ticket acknowledgment SLA in hours (3-24h)')
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [jsonStr]
      );
    } else {
      await pool.query(
        `INSERT INTO system_settings (category, setting_key, setting_value, description)
         VALUES ('ticketing', 'ticket_ack_sla_hours', ?, 'Priority-based ticket acknowledgment SLA in hours (3-24h)')
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [jsonStr]
      );
    }

    await pool.query(
      `INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, new_values)
       VALUES (?, ?, ?, 'TICKET_SLA_CONFIG_UPDATED', 'system_settings', 'ticket_ack_sla_hours', ?)`,
      [user.id, user.email || null, role, jsonStr]
    );

    return validated;
  }

  // ─── Routing Matrix & Property Access Governance ────────────────────────
  static async checkUserPropertyAccess(user, propertyId) {
    const role = String(user?.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) return true;

    const targetPropId = parseInt(propertyId, 10);
    if (Number.isNaN(targetPropId)) return false;

    const uRes = await pool.query('SELECT property_id FROM users WHERE id = ? LIMIT 1', [user.id]);
    const uRow = extractRows(uRes)[0];
    if (uRow?.property_id && Number(uRow.property_id) === targetPropId) {
      return true;
    }

    const assignRes = await pool.query(
      'SELECT id FROM user_property_assignments WHERE user_id = ? AND property_id = ? LIMIT 1',
      [user.id, targetPropId]
    );
    return extractRows(assignRes).length > 0;
  }

  static async assertRoutingMatrix(initiatorUser, targetAudienceType, propertyId, specificUserIds = []) {
    const role = String(initiatorUser?.role || '').toUpperCase();
    const audience = String(targetAudienceType || 'SPECIFIC_USER').toUpperCase();

    if (['STAFF', 'RECEPTIONIST', 'AGENT'].includes(role)) {
      throw new ForbiddenError('Access Denied: Staff, Receptionists, and Agents cannot initiate operational tickets.');
    }

    const cleanIds = Array.isArray(specificUserIds)
      ? Array.from(new Set(specificUserIds.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0)))
      : [];

    // 0. Strict Owner-Only Rule for Group Operations
    const isGroupOperation = !['SPECIFIC_USER', 'SPECIFIC_USERS'].includes(audience) || cleanIds.length > 1 ||
      (audience === 'SPECIFIC_USERS' && cleanIds.length !== 1);

    if (isGroupOperation && role !== 'OWNER') {
      throw new ForbiddenError(
        'Operational Governance Mandate: Only the Owner role is authorized to initiate group operations/tickets. Non-owner roles are restricted to 1-to-1 personal tickets.'
      );
    }

    // 1. Validate Owner group & direct targeting
    if (role === 'OWNER') {
      if (['PROPERTY_STAFF', 'PROPERTY_RECEPTIONISTS'].includes(audience)) {
        throw new ForbiddenError(
          'Routing Matrix Violation: Owner group tickets should target Management, Property Team (PROPERTY_ALL), or All Staff rather than sub-department bypass.'
        );
      }
      if (cleanIds.length > 0) {
        const usersRes = await pool.query(
          `SELECT id, role FROM users WHERE id IN (${cleanIds.map(() => '?').join(', ')}) AND status = 'ACTIVE'`,
          cleanIds
        );
        const rows = extractRows(usersRes);
        const nonMgmt = rows.filter(
          (u) => !['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER'].includes(String(u.role || '').toUpperCase())
        );
        if (nonMgmt.length > 0) {
          throw new ForbiddenError(
            'Routing Matrix Violation: Owner directives may only target Administrative and Operations Management personnel.'
          );
        }
      }
    }

    // 2. Admin / Super Admin restrictions: Personal 1-to-1 tickets to Managers or Property/Admin Staff
    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      if (cleanIds.length > 0) {
        const usersRes = await pool.query(
          `SELECT id, role FROM users WHERE id IN (${cleanIds.map(() => '?').join(', ')}) AND status = 'ACTIVE'`,
          cleanIds
        );
        const disallowed = extractRows(usersRes).filter(
          (u) => !['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(String(u.role || '').toUpperCase())
        );
        if (disallowed.length > 0) {
          throw new ForbiddenError('Routing Matrix Violation: Recipients must be active internal BFA personnel.');
        }
      }
    }

    // 3. Manager / Operations Manager property-scoped 1-to-1 Staff/Receptionist restrictions
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (propertyId) {
        const hasAccess = await this.checkUserPropertyAccess(initiatorUser, propertyId);
        if (!hasAccess) {
          throw new ForbiddenError('Access Denied: You cannot issue tickets outside your assigned property.');
        }
      }
      if (cleanIds.length > 0) {
        const usersRes = await pool.query(
          `SELECT id, role, property_id FROM users WHERE id IN (${cleanIds.map(() => '?').join(', ')}) AND status = 'ACTIVE'`,
          cleanIds
        );
        const rows = extractRows(usersRes);
        for (const u of rows) {
          const uRole = String(u.role || '').toUpperCase();
          if (!['STAFF', 'RECEPTIONIST'].includes(uRole)) {
            throw new ForbiddenError(
              'Routing Matrix Violation: Managers may only assign personal tickets to Staff and Receptionists.'
            );
          }
          if (u.property_id) {
            const canReachTarget = await this.checkUserPropertyAccess(initiatorUser, u.property_id);
            if (!canReachTarget) {
              throw new ForbiddenError('Access Denied: You cannot assign tickets to staff outside your assigned property.');
            }
          }
        }
      }
    }

    return true;
  }

  static async assertUserCanViewOperation(user, op, recipients = null) {
    const role = String(user?.role || '').toUpperCase();
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      return true;
    }

    const userId = Number(user.id);
    if (
      Number(op.initiated_by_user_id) === userId ||
      Number(op.supervisor_user_id) === userId ||
      Number(op.current_responsible_user_id) === userId
    ) {
      return true;
    }

    let recipList = recipients;
    if (!recipList) {
      const rRes = await pool.query(
        'SELECT user_id FROM central_operation_recipients WHERE operation_id = ? AND user_id = ? LIMIT 1',
        [op.id, userId]
      );
      if (extractRows(rRes).length > 0) return true;
    } else if (recipList.some((r) => Number(r.user_id) === userId)) {
      return true;
    }

    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role) && op.property_id) {
      const hasAccess = await this.checkUserPropertyAccess(user, op.property_id);
      if (hasAccess) return true;
    }

    throw new ForbiddenError('Access Denied: You are not authorized to access this operational ticket or memorandum.');
  }

  // ─── Sequential Reference Code Generators ──────────────────────────────
  static async generateNextSequence(table, column, prefixBase) {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `${prefixBase}-${ym}-`;
    const rows = await pool.query(
      `SELECT ${column} AS code FROM ${table} WHERE ${column} LIKE ? ORDER BY id DESC LIMIT 20`,
      [`${prefix}%`]
    );
    let maxSeq = 0;
    for (const r of extractRows(rows)) {
      const tail = String(r.code || '').split('-').pop();
      const num = parseInt(tail, 10);
      if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
    }
    const suffix = String(maxSeq + 1).padStart(4, '0');
    return `${prefix}${suffix}`;
  }

  static async generateOperationCode() {
    return this.generateNextSequence('central_operations', 'operation_code', 'OPS');
  }

  static async generateTicketReference() {
    return this.generateNextSequence('central_operations', 'ticket_reference', 'BFA-TKT');
  }

  static async generateMemoReference() {
    return this.generateNextSequence('operations_memos', 'memo_reference', 'MEMO');
  }

  // ─── Recipient Resolution Across All Audience Types ────────────────────
  static async resolveRecipientUsers(targetAudienceType, propertyId, specificUserIds = []) {
    const audience = String(targetAudienceType || 'SPECIFIC_USER').toUpperCase();
    const cleanIds = Array.isArray(specificUserIds)
      ? Array.from(new Set(specificUserIds.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0)))
      : [];

    if (['SPECIFIC_USER', 'SPECIFIC_USERS', 'MULTI_RECIPIENT_TEAM'].includes(audience) || cleanIds.length > 0) {
      if (cleanIds.length === 0) {
        throw new BadRequestError('At least one valid recipient user ID is required.');
      }
      const res = await pool.query(
        `SELECT id, name, email, role, property_id FROM users WHERE id IN (${cleanIds.map(() => '?').join(', ')}) AND status = 'ACTIVE'`,
        cleanIds
      );
      const found = extractRows(res);
      if (found.length === 0) {
        throw new BadRequestError('No active recipient accounts matched the provided user IDs.');
      }
      return found;
    }

    if (audience === 'MANAGERS_ONLY') {
      const res = await pool.query(
        "SELECT id, name, email, role, property_id FROM users WHERE role IN ('MANAGER', 'OPERATIONS_MANAGER', 'ADMIN') AND status = 'ACTIVE' ORDER BY id ASC"
      );
      return extractRows(res);
    }

    if (audience === 'ALL_MANAGEMENT') {
      const res = await pool.query(
        "SELECT id, name, email, role, property_id FROM users WHERE role IN ('MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN') AND status = 'ACTIVE' ORDER BY id ASC"
      );
      return extractRows(res);
    }

    if (audience === 'ALL_RECEPTIONISTS') {
      const res = await pool.query(
        "SELECT id, name, email, role, property_id FROM users WHERE role = 'RECEPTIONIST' AND status = 'ACTIVE' ORDER BY id ASC"
      );
      return extractRows(res);
    }

    if (audience === 'ALL_STAFF') {
      const res = await pool.query(
        "SELECT id, name, email, role, property_id FROM users WHERE role IN ('ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF') AND status = 'ACTIVE' ORDER BY id ASC"
      );
      return extractRows(res);
    }

    if (audience === 'PROPERTY_STAFF') {
      if (!propertyId) throw new BadRequestError('Property ID is required for PROPERTY_STAFF audience.');
      const res = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email, u.role, u.property_id
         FROM users u
         LEFT JOIN user_property_assignments upa ON upa.user_id = u.id
         WHERE (u.property_id = ? OR upa.property_id = ?) AND u.role = 'STAFF' AND u.status = 'ACTIVE'`,
        [propertyId, propertyId]
      );
      return extractRows(res);
    }

    if (audience === 'PROPERTY_RECEPTIONISTS') {
      if (!propertyId) throw new BadRequestError('Property ID is required for PROPERTY_RECEPTIONISTS audience.');
      const res = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email, u.role, u.property_id
         FROM users u
         LEFT JOIN user_property_assignments upa ON upa.user_id = u.id
         WHERE (u.property_id = ? OR upa.property_id = ?) AND u.role = 'RECEPTIONIST' AND u.status = 'ACTIVE'`,
        [propertyId, propertyId]
      );
      return extractRows(res);
    }

    if (['PROPERTY_ALL', 'DEPARTMENT', 'DEPARTMENT_GROUP'].includes(audience)) {
      if (propertyId) {
        const res = await pool.query(
          `SELECT DISTINCT u.id, u.name, u.email, u.role, u.property_id
           FROM users u
           LEFT JOIN user_property_assignments upa ON upa.user_id = u.id
           WHERE (u.property_id = ? OR upa.property_id = ?)
             AND u.role IN ('OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF')
             AND u.status = 'ACTIVE'`,
          [propertyId, propertyId]
        );
        return extractRows(res);
      }
      const res = await pool.query(
        "SELECT id, name, email, role, property_id FROM users WHERE role IN ('ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF') AND status = 'ACTIVE' ORDER BY id ASC"
      );
      return extractRows(res);
    }

    throw new BadRequestError(`Unsupported target audience type '${targetAudienceType}'.`);
  }

  // ─── 1. Create New Ticket / Operation ──────────────────────────────────
  static async createOperation(initiatorUser, data) {
    const {
      title,
      category: rawCategory = 'ADMINISTRATIVE_DIRECTIVE',
      priority: rawPriority = 'NORMAL',
      property_id = null,
      target_audience_type: rawAudience = 'SPECIFIC_USER',
      recipient_user_ids = [],
      subject,
      purpose,
      operational_instructions,
      expected_outcome = null,
      responsibility_definition = null,
      reporting_requirements = null,
      deadline_at = null,
      supervisor_user_id = null,
      template_type = null,
    } = data;

    const ALLOWED_CATEGORIES = new Set([
      'ADMINISTRATIVE_DIRECTIVE',
      'PROPERTY_OPERATIONS',
      'MAINTENANCE_INSPECTION',
      'FRONT_OFFICE_RECEPTION',
      'STAFF_ASSIGNMENT',
      'OPERATIONAL_IMPROVEMENT',
      'COMPLIANCE_POLICY',
      'EMERGENCY_OPERATION',
      'MANAGEMENT_COMMUNICATION',
    ]);
    const upperCat = String(rawCategory || 'ADMINISTRATIVE_DIRECTIVE').trim().toUpperCase();
    const category = ALLOWED_CATEGORIES.has(upperCat) ? upperCat : 'ADMINISTRATIVE_DIRECTIVE';

    if (!title || !title.trim() || !purpose || !purpose.trim() || !operational_instructions || !operational_instructions.trim()) {
      throw new BadRequestError('Title, Operational Purpose, and Specific Instructions are strictly required.');
    }

    const priority = normalizePriority(rawPriority);
    const target_audience_type = String(rawAudience || 'SPECIFIC_USER').toUpperCase();
    const cleanRecipIds = Array.isArray(recipient_user_ids)
      ? Array.from(new Set(recipient_user_ids.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0)))
      : [];

    // 1. Governance & Routing check
    await this.assertRoutingMatrix(initiatorUser, target_audience_type, property_id, cleanRecipIds);

    // 2. Resolve Active Recipients
    const recipients = await this.resolveRecipientUsers(target_audience_type, property_id, cleanRecipIds);
    if (recipients.length === 0) {
      throw new BadRequestError('No active eligible recipients found for the specified target audience.');
    }

    // 3. Priority-Based Ack SLA Calculation (Server Authoritative)
    const slaConfig = await this.getAckSlaConfig();
    const ackSlaHours = getSlaHoursForPriority(priority, slaConfig);
    const issuedAt = new Date();
    const ackDeadlineAt = addHoursDate(issuedAt, ackSlaHours);
    const parsedExecDeadline = deadline_at ? new Date(deadline_at) : null;
    if (parsedExecDeadline && Number.isNaN(parsedExecDeadline.getTime())) {
      throw new BadRequestError('Invalid execution deadline timestamp supplied.');
    }

    // 4. Generate Unique Sequential Identifiers
    const operationCode = await this.generateOperationCode();
    const ticketReference = await this.generateTicketReference();
    const memoReference = await this.generateMemoReference();

    // 5. Property Scope Metadata
    let propertyDetails = null;
    let propertyScopeSummary = 'Corporate / Multi-Property';
    if (property_id) {
      const pRes = await pool.query('SELECT id, name, code, city FROM properties WHERE id = ? LIMIT 1', [property_id]);
      const pRow = extractRows(pRes)[0];
      if (pRow) {
        propertyDetails = pRow;
        propertyScopeSummary = `${pRow.name} (${pRow.code || 'BFA'})`;
      }
    }

    const issuerRoleName = String(initiatorUser.role || '').replace(/_/g, ' ');
    const issuerDesignation = initiatorUser.jobTitle || `${initiatorUser.name || 'Management'} (${issuerRoleName})`;
    const recipientSummary = recipients.length === 1
      ? `${recipients[0].name} (${recipients[0].role})`
      : `${target_audience_type.replace(/_/g, ' ')} (${recipients.length} Personnel)`;

    const deadlineText = parsedExecDeadline ? formatLagosTime(parsedExecDeadline) : 'As Directed / Ongoing';
    const effectiveDateText = formatLagosTime(issuedAt);

    // 6. Ownership Semantics: Personal Ticket vs Open Group Ticket
    const isSinglePersonal = recipients.length === 1 && ['SPECIFIC_USER', 'SPECIFIC_USERS'].includes(target_audience_type);
    const responsibleUserId = isSinglePersonal ? recipients[0].id : null;
    const responsibleGroup = isSinglePersonal ? null : target_audience_type;
    const initialStatus = 'AWAITING_ACKNOWLEDGEMENT';
    const initialNextAction = isSinglePersonal
      ? `Awaiting receipt acknowledgement by ${recipients[0].name} (Due within ${ackSlaHours}h SLA — ${formatLagosTime(ackDeadlineAt)}).`
      : `Group ticket dispatched to ${recipients.length} eligible personnel. Acknowledge receipt & Accept Responsibility (or Supervisor assign owner).`;

    const cleanSubject = (subject && subject.trim()) || title.trim();
    const effectiveSupervisorId = supervisor_user_id || initiatorUser.id;

    // 7. Insert Ticket Record into central_operations
    let operationId;
    if (pool.isPostgres()) {
      const opRows = await pool.query(
        `INSERT INTO central_operations (
          operation_code, ticket_reference, title, category, priority, status,
          initiated_by_user_id, property_id, target_audience_type,
          subject, purpose, operational_instructions, expected_outcome,
          responsibility_definition, reporting_requirements, deadline_at,
          acknowledgment_sla_hours, acknowledgment_deadline_at,
          supervisor_user_id, current_responsible_user_id, current_responsible_group, next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id`,
        [
          operationCode,
          ticketReference,
          title.trim(),
          category,
          priority,
          initialStatus,
          initiatorUser.id,
          property_id || null,
          target_audience_type,
          cleanSubject,
          purpose.trim(),
          operational_instructions.trim(),
          expected_outcome,
          responsibility_definition,
          reporting_requirements,
          parsedExecDeadline,
          ackSlaHours,
          ackDeadlineAt,
          effectiveSupervisorId,
          responsibleUserId,
          responsibleGroup,
          initialNextAction,
        ]
      );
      operationId = extractInsertId(opRows);
    } else {
      const opRes = await pool.query(
        `INSERT INTO central_operations (
          operation_code, ticket_reference, title, category, priority, status,
          initiated_by_user_id, property_id, target_audience_type,
          subject, purpose, operational_instructions, expected_outcome,
          responsibility_definition, reporting_requirements, deadline_at,
          acknowledgment_sla_hours, acknowledgment_deadline_at,
          supervisor_user_id, current_responsible_user_id, current_responsible_group, next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          operationCode,
          ticketReference,
          title.trim(),
          category,
          priority,
          initialStatus,
          initiatorUser.id,
          property_id || null,
          target_audience_type,
          cleanSubject,
          purpose.trim(),
          operational_instructions.trim(),
          expected_outcome,
          responsibility_definition,
          reporting_requirements,
          parsedExecDeadline,
          ackSlaHours,
          ackDeadlineAt,
          effectiveSupervisorId,
          responsibleUserId,
          responsibleGroup,
          initialNextAction,
        ]
      );
      operationId = extractInsertId(opRes);
    }

    // 8. Record Initial Deadline History if deadline_at provided
    if (parsedExecDeadline) {
      await pool.query(
        `INSERT INTO ticket_deadline_history (operation_id, previous_deadline_at, new_deadline_at, change_type, reason, requested_by_id, approved_by_id)
         VALUES (?, NULL, ?, 'INITIAL', 'Initial ticket issuance deadline', ?, ?)`,
        [operationId, parsedExecDeadline, initiatorUser.id, initiatorUser.id]
      );
    }

    // 9. Insert Recipients (Single-source ownership: NO auto-task duplication on group tickets!)
    for (const r of recipients) {
      if (pool.isPostgres()) {
        await pool.query(
          `INSERT INTO central_operation_recipients (operation_id, user_id, role_at_time, status, assigned_at)
           VALUES (?, ?, ?, 'DELIVERED', ?)
           ON CONFLICT (operation_id, user_id) DO NOTHING`,
          [operationId, r.id, r.role, issuedAt]
        );
      } else {
        await pool.query(
          `INSERT IGNORE INTO central_operation_recipients (operation_id, user_id, role_at_time, status, assigned_at)
           VALUES (?, ?, ?, 'DELIVERED', ?)`,
          [operationId, r.id, r.role, issuedAt]
        );
      }
    }

    // Personal 1-to-1 ticket keeps ONE synchronized view row in operational_tasks (Group waits for Claim/Assign!)
    if (isSinglePersonal && responsibleUserId) {
      try {
        const taskCode = `TSK-${operationCode.replace('OPS-', '')}-01`;
        await pool.query(
          `INSERT INTO operational_tasks (
            task_code, property_id, assigned_to_id, assigned_by_id,
            title, description, expected_outcome, task_category,
            priority, due_date, status, central_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
          [
            taskCode,
            property_id || recipients[0]?.property_id || 1,
            responsibleUserId,
            initiatorUser.id,
            title.trim(),
            operational_instructions.trim(),
            expected_outcome,
            category === 'MAINTENANCE_INSPECTION' ? 'MAINTENANCE' : 'GENERAL',
            priority,
            parsedExecDeadline || addHoursDate(issuedAt, 72),
            operationId,
          ]
        );
      } catch (taskErr) {
        logger.warn(`Could not sync primary task projection for ${ticketReference}: ${taskErr.message}`);
      }
    }

    // 10. Generate Aligned Official Memo PDF & Store Persistently in DB Binary Table
    const resolvedTemplate =
      template_type || (isSinglePersonal ? 'DIRECTIVE_PERSONAL' : recipients.length > 1 ? 'MULTI_RECIPIENT_TEAM' : 'GROUP_BROADCAST');

    const opSnapshotForPdf = {
      id: operationId,
      operation_code: operationCode,
      ticket_reference: ticketReference,
      title: title.trim(),
      category,
      priority,
      status: initialStatus,
      target_audience_type,
      subject: cleanSubject,
      purpose: purpose.trim(),
      operational_instructions: operational_instructions.trim(),
      expected_outcome,
      responsibility_definition,
      reporting_requirements,
      deadline_at: parsedExecDeadline,
      acknowledgment_sla_hours: ackSlaHours,
      acknowledgment_deadline_at: ackDeadlineAt,
      created_at: issuedAt,
      responsible_name: isSinglePersonal ? recipients[0].name : null,
      responsible_role: isSinglePersonal ? recipients[0].role : null,
      current_responsible_group: responsibleGroup,
    };

    const memoSnapshotForPdf = {
      memo_reference: memoReference,
      version_number: 1,
      issuer_designation: issuerDesignation,
      recipient_summary: recipientSummary,
      property_scope_summary: propertyScopeSummary,
      title: title.trim(),
      subject: cleanSubject,
      purpose: purpose.trim(),
      operational_instructions: operational_instructions.trim(),
      expected_outcome,
      responsibility_definition,
      reporting_requirements,
      deadline_text: deadlineText,
      effective_date_text: effectiveDateText,
      created_at: issuedAt,
    };

    const pdfBuffer = await MemoPdfGenerator.generateOperationsMemoPdfBuffer({
      operation: opSnapshotForPdf,
      memo: memoSnapshotForPdf,
      initiator: initiatorUser,
      recipients: recipients.map((r) => ({ user_name: r.name, role_at_time: r.role, acceptance_status: 'PENDING' })),
      property: propertyDetails,
      templateType: resolvedTemplate,
    });

    let docStorageId = null;
    try {
      const storeRes = await pool.query(
        pool.isPostgres()
          ? `INSERT INTO operational_documents_storage (entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by)
             VALUES ('OPERATIONS_MEMO', ?, ?, 'application/pdf', ?, ?, ?) RETURNING id`
          : `INSERT INTO operational_documents_storage (entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by)
             VALUES ('OPERATIONS_MEMO', ?, ?, 'application/pdf', ?, ?, ?)`,
        [operationId, `${memoReference}.pdf`, pdfBuffer.length, pdfBuffer, initiatorUser.id]
      );
      docStorageId = extractInsertId(storeRes);
    } catch (docErr) {
      logger.warn(`Failed storing initial memo PDF bytes: ${docErr.message}`);
    }

    let memoId = null;
    const memoRes = await pool.query(
      pool.isPostgres()
        ? `INSERT INTO operations_memos (
            operation_id, memo_reference, version_number, issuer_user_id, issuer_designation,
            recipient_summary, property_scope_summary, title, category, priority, subject,
            purpose, operational_instructions, expected_outcome, responsibility_definition,
            reporting_requirements, deadline_text, effective_date_text, document_storage_id
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
        : `INSERT INTO operations_memos (
            operation_id, memo_reference, version_number, issuer_user_id, issuer_designation,
            recipient_summary, property_scope_summary, title, category, priority, subject,
            purpose, operational_instructions, expected_outcome, responsibility_definition,
            reporting_requirements, deadline_text, effective_date_text, document_storage_id
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operationId,
        memoReference,
        initiatorUser.id,
        issuerDesignation,
        recipientSummary,
        propertyScopeSummary,
        title.trim(),
        category,
        priority,
        cleanSubject,
        purpose.trim(),
        operational_instructions.trim(),
        expected_outcome,
        responsibility_definition,
        reporting_requirements,
        deadlineText,
        effectiveDateText,
        docStorageId,
      ]
    );
    memoId = extractInsertId(memoRes);

    // 11. Route Ticket Card Into Direct Conversation (Personal) or Authorized Group Thread (Owner Group)
    let chatThreadId = null;
    let chatMessageId = null;
    try {
      if (isSinglePersonal) {
        const directThread = await ChatService.findOrCreateDirectThread(initiatorUser, recipients[0].id);
        chatThreadId = directThread.id;
      } else if (property_id) {
        const propChannels = extractRows(
          await pool.query(
            "SELECT id FROM chat_threads WHERE thread_type = 'PROPERTY_CHANNEL' AND property_id = ? AND status = 'ACTIVE' LIMIT 1",
            [property_id]
          )
        );
        if (propChannels.length > 0) {
          chatThreadId = propChannels[0].id;
        } else {
          const pName = propertyDetails?.name || `Property #${property_id}`;
          const createdCh = await ChatRepository.createPropertyChannel(initiatorUser, property_id, `${pName} Team Channel`);
          chatThreadId = createdCh.id;
        }
      } else if (target_audience_type === 'ALL_STAFF') {
        const genGroup = await ChatRepository.getOrCreateGeneralGroupThread();
        chatThreadId = genGroup.id;
      } else {
        const groupThread = await ChatRepository.findOrCreateManagementGroupThread(
          initiatorUser,
          recipients.map((r) => r.id)
        );
        chatThreadId = groupThread.id;
      }

      if (chatThreadId) {
        const icon = priority === 'CRITICAL' ? '🚨' : ['URGENT', 'HIGH'].includes(priority) ? '⚡' : '🎫';
        const msgContent =
          `${icon} [OPERATIONAL TICKET — ${ticketReference} / ${memoReference}]\n` +
          `Title: ${title.trim()}\n` +
          `Priority: ${priority} (Ack SLA: ${ackSlaHours}h — Due ${formatLagosTime(ackDeadlineAt)})\n` +
          `Exec Deadline: ${deadlineText}\n` +
          `Recipients: ${recipientSummary}\n` +
          `Action Required: Open ticket card to Acknowledge Receipt${isSinglePersonal ? ' & begin execution' : ' or Accept Responsibility'}.`;

        const sentMsg = await ChatService.sendMessage(initiatorUser, {
          threadId: chatThreadId,
          messageType: 'CONTEXT_LINK',
          content: msgContent,
          priority,
          contextEntityType: 'OPERATION',
          contextEntityId: operationId,
        });
        chatMessageId = sentMsg?.id || null;
      }
    } catch (chatErr) {
      logger.warn(`Ticket #${ticketReference} chat dispatch notice: ${chatErr.message}`);
    }

    await pool.query(
      'UPDATE central_operations SET latest_memo_id = ?, chat_thread_id = ?, chat_message_id = ? WHERE id = ?',
      [memoId, chatThreadId, chatMessageId, operationId]
    );

    // 12. Audit Event & Individual In-App Notifications
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'ISSUED', ?, ?)`,
      [
        operationId,
        initiatorUser.id,
        `Ticket ${ticketReference} (${operationCode}) issued to ${recipientSummary} (${priority}, ${ackSlaHours}h Ack SLA).`,
        JSON.stringify({
          ticketReference,
          operationCode,
          memoReference,
          priority,
          ackSlaHours,
          ackDeadlineAt: ackDeadlineAt.toISOString(),
          recipientIds: recipients.map((r) => r.id),
        }),
      ]
    );

    for (const r of recipients) {
      try {
        await NotificationsService.dispatchNotification({
          recipientId: r.id,
          recipientRole: r.role,
          propertyId: property_id || null,
          title: `New Ticket (${priority}): ${ticketReference}`,
          message: `"${title.trim()}" issued by ${initiatorUser.name}. Acknowledge within ${ackSlaHours}h (${formatLagosTime(ackDeadlineAt)}).`,
          category: 'TICKET',
          priority: priority === 'CRITICAL' ? 'CRITICAL' : ['URGENT', 'HIGH', 'IMPORTANT'].includes(priority) ? 'HIGH' : 'MEDIUM',
          sourceEntityType: 'CENTRAL_OPERATION',
          sourceEntityId: operationId,
          linkUrl: `/portal/operations?op=${operationId}`,
        });
      } catch (nErr) {
        logger.warn(`Failed dispatching ticket notification to user #${r.id}: ${nErr.message}`);
      }
    }

    return this.getOperationById(initiatorUser, operationId);
  }

  // ─── 2. List Operations / Tickets Across Role-Scoped Views ─────────────
  static async listOperations(user, filters = {}) {
    const role = String(user?.role || '').toUpperCase();
    const userId = Number(user.id);
    const view = filters.view || (['STAFF', 'RECEPTIONIST'].includes(role) ? 'myTickets' : 'assignedToMe');

    const conditions = [];
    const params = [];

    // Role isolation baseline so Managers only see their property scope and Staff only see theirs
    const isGlobalLeader = ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role);
    const isManager = ['MANAGER', 'OPERATIONS_MANAGER'].includes(role);

    if (isManager && !isGlobalLeader) {
      params.push(userId, userId, userId, userId);
      conditions.push(`(
        co.initiated_by_user_id = ?
        OR co.supervisor_user_id = ?
        OR co.current_responsible_user_id = ?
        OR co.property_id IN (SELECT property_id FROM user_property_assignments WHERE user_id = ?)
        OR co.property_id = (SELECT property_id FROM users WHERE id = ${userId})
        OR EXISTS (SELECT 1 FROM central_operation_recipients cor_s WHERE cor_s.operation_id = co.id AND cor_s.user_id = ${userId})
      )`);
    } else if (!isGlobalLeader) {
      params.push(userId, userId);
      conditions.push(`(
        co.current_responsible_user_id = ?
        OR EXISTS (SELECT 1 FROM central_operation_recipients cor_s WHERE cor_s.operation_id = co.id AND cor_s.user_id = ? AND COALESCE(cor_s.reassigned_out, FALSE) = FALSE)
      )`);
    }

    // View filter branching
    if (view === 'initiatedByMe') {
      params.push(userId);
      conditions.push('co.initiated_by_user_id = ?');
    } else if (view === 'assignedToMe' || view === 'myTickets') {
      params.push(userId, userId);
      conditions.push(`(
        co.current_responsible_user_id = ?
        OR EXISTS (
          SELECT 1 FROM central_operation_recipients cor
          WHERE cor.operation_id = co.id AND cor.user_id = ? AND COALESCE(cor.reassigned_out, FALSE) = FALSE
        )
      )`);
    } else if (view === 'supervising') {
      if (!isGlobalLeader) {
        params.push(userId, userId);
        conditions.push('(co.initiated_by_user_id = ? OR co.supervisor_user_id = ? OR co.property_id IS NOT NULL)');
      }
    } else if (view === 'actionRequired') {
      params.push(userId, userId);
      conditions.push(`co.status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED', 'REJECTED')`);
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM central_operation_recipients cor
          WHERE cor.operation_id = co.id AND cor.user_id = ? AND cor.acknowledged_at IS NULL AND COALESCE(cor.reassigned_out, FALSE) = FALSE
        )
        OR co.current_responsible_user_id = ?
        OR (co.status IN ('SUBMITTED_FOR_REVIEW', 'AWAITING_REVIEW', 'BLOCKED') AND ${isGlobalLeader || isManager ? '1=1' : '1=0'})
      )`);
    } else if (view === 'overdue') {
      conditions.push(`(co.status = 'OVERDUE' OR (co.deadline_at IS NOT NULL AND co.deadline_at < CURRENT_TIMESTAMP AND co.status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED')))`);
    } else if (view === 'escalated') {
      conditions.push(`(co.status = 'ESCALATED' OR co.escalated_at IS NOT NULL)`);
      conditions.push(`co.status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED')`);
    } else if (view === 'pendingReview') {
      conditions.push(`co.status IN ('SUBMITTED_FOR_REVIEW', 'AWAITING_REVIEW', 'PENDING_APPROVAL')`);
    } else if (view === 'reassigned') {
      conditions.push('co.reassignment_count > 0');
    } else if (view === 'archived' || view === 'closed' || view === 'completed') {
      conditions.push(`co.status IN ('COMPLETED', 'CANCELLED', 'CLOSED', 'REJECTED')`);
    }

    if (filters.status && filters.status !== 'all') {
      const st = String(filters.status).toUpperCase();
      if (st === 'OVERDUE') {
        conditions.push(`(co.status = 'OVERDUE' OR (co.deadline_at IS NOT NULL AND co.deadline_at < CURRENT_TIMESTAMP AND co.status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED')))`);
      } else {
        params.push(st);
        conditions.push('co.status = ?');
      }
    }

    if (filters.priority && filters.priority !== 'all') {
      params.push(String(filters.priority).toUpperCase());
      conditions.push('co.priority = ?');
    }

    if (filters.property_id && filters.property_id !== 'all') {
      const propIdNum = parseInt(filters.property_id, 10);
      if (isManager && !isGlobalLeader) {
        const hasAccess = await this.checkUserPropertyAccess(user, propIdNum);
        if (!hasAccess) {
          throw new ForbiddenError('Access Denied: You cannot view operations outside your assigned property.');
        }
      }
      params.push(propIdNum);
      conditions.push('co.property_id = ?');
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term, term);
      conditions.push('(co.title LIKE ? OR co.operation_code LIKE ? OR COALESCE(co.ticket_reference, \'\') LIKE ? OR co.subject LIKE ?)');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT
        co.*,
        u_init.name AS initiator_name,
        u_init.role AS initiator_role,
        u_resp.name AS responsible_name,
        u_resp.role AS responsible_role,
        p.name AS property_name,
        p.code AS property_code,
        om.memo_reference,
        om.version_number AS memo_version,
        (SELECT COUNT(*) FROM central_operation_recipients cor WHERE cor.operation_id = co.id AND COALESCE(cor.reassigned_out, FALSE) = FALSE) AS total_recipients,
        (SELECT COUNT(*) FROM central_operation_recipients cor WHERE cor.operation_id = co.id AND cor.acknowledged_at IS NOT NULL AND COALESCE(cor.reassigned_out, FALSE) = FALSE) AS acknowledged_count,
        (SELECT cor_self.acknowledged_at FROM central_operation_recipients cor_self WHERE cor_self.operation_id = co.id AND cor_self.user_id = ${userId} LIMIT 1) AS my_acknowledged_at,
        (SELECT COUNT(*) FROM operational_tasks ot WHERE ot.central_operation_id = co.id) AS linked_tasks_count
      FROM central_operations co
      JOIN users u_init ON co.initiated_by_user_id = u_init.id
      LEFT JOIN users u_resp ON co.current_responsible_user_id = u_resp.id
      LEFT JOIN properties p ON co.property_id = p.id
      LEFT JOIN operations_memos om ON co.latest_memo_id = om.id
      ${whereClause}
      ORDER BY co.created_at DESC, co.id DESC
    `;

    const rows = extractRows(await pool.query(sql, params));
    return rows.map((r) => ({
      ...r,
      ticket_reference: r.ticket_reference || r.operation_code,
      viewer_next_action: this.deriveNextAction(r, user),
    }));
  }

  // ─── 3. Resolve Numeric Operation ID & Fetch Detailed Ticket View ──────
  static async resolveOperationId(operationId) {
    const raw = String(operationId).trim();
    if (/^\d+$/.test(raw)) {
      return parseInt(raw, 10);
    }
    const rows = extractRows(
      await pool.query(
        'SELECT id FROM central_operations WHERE operation_code = ? OR ticket_reference = ? LIMIT 1',
        [raw, raw]
      )
    );
    if (rows.length === 0) {
      throw new NotFoundError(`Operational ticket '${operationId}' not found.`);
    }
    return rows[0].id;
  }

  static async getOperationById(user, operationId) {
    const opIdNum = await this.resolveOperationId(operationId);

    const opRows = extractRows(
      await pool.query(
        `SELECT
          co.*,
          u_init.name AS initiator_name, u_init.email AS initiator_email, u_init.role AS initiator_role,
          u_sup.name AS supervisor_name, u_sup.email AS supervisor_email,
          u_resp.name AS responsible_name, u_resp.email AS responsible_email, u_resp.role AS responsible_role,
          u_rev.name AS reviewer_name, u_rev.role AS reviewer_role,
          u_cls.name AS closed_by_name, u_rej.name AS rejected_by_name,
          p.name AS property_name, p.code AS property_code, p.address AS property_address, p.city AS property_city,
          om.memo_reference, om.version_number AS memo_version, om.document_storage_id,
          om.issuer_designation, om.recipient_summary, om.property_scope_summary,
          om.deadline_text, om.effective_date_text, om.amendment_reason
         FROM central_operations co
         JOIN users u_init ON co.initiated_by_user_id = u_init.id
         LEFT JOIN users u_sup ON co.supervisor_user_id = u_sup.id
         LEFT JOIN users u_resp ON co.current_responsible_user_id = u_resp.id
         LEFT JOIN users u_rev ON co.reviewed_by_user_id = u_rev.id
         LEFT JOIN users u_cls ON co.closed_by_user_id = u_cls.id
         LEFT JOIN users u_rej ON co.rejected_by_user_id = u_rej.id
         LEFT JOIN properties p ON co.property_id = p.id
         LEFT JOIN operations_memos om ON co.latest_memo_id = om.id
         WHERE co.id = ? LIMIT 1`,
        [opIdNum]
      )
    );

    if (opRows.length === 0) {
      throw new NotFoundError(`Operational ticket #${operationId} not found.`);
    }

    const op = opRows[0];
    const recipients = extractRows(
      await pool.query(
        `SELECT cor.*, u.name AS user_name, u.email AS user_email, u.role AS current_role
         FROM central_operation_recipients cor
         JOIN users u ON cor.user_id = u.id
         WHERE cor.operation_id = ?
         ORDER BY cor.id ASC`,
        [opIdNum]
      )
    );

    await this.assertUserCanViewOperation(user, op, recipients);

    const tasks = extractRows(
      await pool.query(
        `SELECT ot.*, u.name AS assigned_to_name, u.role AS assigned_to_role
         FROM operational_tasks ot
         LEFT JOIN users u ON ot.assigned_to_id = u.id
         WHERE ot.central_operation_id = ?
         ORDER BY ot.id ASC`,
        [opIdNum]
      )
    );

    const events = extractRows(
      await pool.query(
        `SELECT coe.*, u.name AS actor_name, u.role AS actor_role
         FROM central_operation_events coe
         JOIN users u ON coe.actor_user_id = u.id
         WHERE coe.operation_id = ?
         ORDER BY coe.created_at DESC, coe.id DESC`,
        [opIdNum]
      )
    );

    const memoHistory = extractRows(
      await pool.query(
        'SELECT * FROM operations_memos WHERE operation_id = ? ORDER BY version_number DESC',
        [opIdNum]
      )
    );

    const reassignmentHistory = extractRows(
      await pool.query(
        `SELECT trh.*,
                u_prev.name AS previous_user_name, u_prev.role AS previous_user_role,
                u_new.name AS new_user_name, u_new.role AS new_user_role,
                u_by.name AS reassigned_by_name, u_by.role AS reassigned_by_role
         FROM ticket_reassignment_history trh
         LEFT JOIN users u_prev ON trh.previous_user_id = u_prev.id
         JOIN users u_new ON trh.new_user_id = u_new.id
         JOIN users u_by ON trh.reassigned_by_id = u_by.id
         WHERE trh.operation_id = ?
         ORDER BY trh.reassigned_at DESC, trh.id DESC`,
        [opIdNum]
      )
    );

    const deadlineHistory = extractRows(
      await pool.query(
        `SELECT tdh.*, u_req.name AS requested_by_name, u_app.name AS approved_by_name
         FROM ticket_deadline_history tdh
         LEFT JOIN users u_req ON tdh.requested_by_id = u_req.id
         LEFT JOIN users u_app ON tdh.approved_by_id = u_app.id
         WHERE tdh.operation_id = ?
         ORDER BY tdh.created_at DESC, tdh.id DESC`,
        [opIdNum]
      )
    );

    const evidenceFiles = extractRows(
      await pool.query(
        `SELECT ods.id, ods.file_name, ods.mime_type, ods.file_size_bytes, ods.uploaded_by, ods.created_at,
                u.name AS uploaded_by_name
         FROM operational_documents_storage ods
         LEFT JOIN users u ON ods.uploaded_by = u.id
         WHERE ods.entity_type = 'TICKET_EVIDENCE' AND ods.entity_id = ?
         ORDER BY ods.created_at DESC`,
        [opIdNum]
      )
    ).map((ev) => ({
      ...ev,
      downloadUrl: `/api/v1/workforce/operations/${opIdNum}/evidence/${ev.id}`,
    }));

    const viewerNextAction = this.deriveNextAction({ ...op, recipients }, user);

    return {
      ...op,
      ticket_reference: op.ticket_reference || op.operation_code,
      recipients,
      tasks,
      events,
      memo_history: memoHistory,
      reassignment_history: reassignmentHistory,
      deadline_history: deadlineHistory,
      evidence_files: evidenceFiles,
      viewer_next_action: viewerNextAction,
      next_action: op.next_action || viewerNextAction.text,
    };
  }

  // ─── 4. Acknowledge Receipt (Stops Unack SLA Reminders) ────────────────
  static async acknowledgeOperation(user, operationId, note = null) {
    const opIdNum = await this.resolveOperationId(operationId);
    const checkRows = extractRows(
      await pool.query(
        'SELECT id, acknowledged_at FROM central_operation_recipients WHERE operation_id = ? AND user_id = ? LIMIT 1',
        [opIdNum, user.id]
      )
    );
    if (checkRows.length === 0) {
      throw new ForbiddenError('You are not a registered recipient of this ticket.');
    }

    const now = new Date();
    await pool.query(
      `UPDATE central_operation_recipients
       SET acknowledged_at = COALESCE(acknowledged_at, ?),
           acknowledgement_note = COALESCE(?, acknowledgement_note),
           acceptance_status = CASE WHEN acceptance_status = 'PENDING' THEN 'ACKNOWLEDGED' ELSE acceptance_status END,
           requires_reacknowledgement = FALSE
       WHERE operation_id = ? AND user_id = ?`,
      [now, note || null, opIdNum, user.id]
    );

    // Mark reassigned ticket acknowledgment flag if this recipient received a reassignment
    await pool.query(
      `UPDATE ticket_reassignment_history
       SET new_recipient_acknowledged = TRUE,
           new_recipient_acknowledged_at = COALESCE(new_recipient_acknowledged_at, ?)
       WHERE operation_id = ? AND new_user_id = ? AND new_recipient_acknowledged = FALSE`,
      [now, opIdNum, user.id]
    );

    const [op] = extractRows(
      await pool.query(
        'SELECT chat_message_id, operation_code, ticket_reference, status, current_responsible_user_id, first_acknowledged_at FROM central_operations WHERE id = ?',
        [opIdNum]
      )
    );

    if (op?.chat_message_id) {
      await pool.query(
        'UPDATE chat_message_acknowledgements SET acknowledged_at = COALESCE(acknowledged_at, ?) WHERE message_id = ? AND user_id = ?',
        [now, op.chat_message_id, user.id]
      );
    }

    const advanceToAck = ['OPEN', 'ISSUED', 'PENDING_DELIVERY', 'DELIVERED', 'AWAITING_ACKNOWLEDGEMENT', 'REASSIGNED', 'ESCALATED'].includes(op?.status);
    const nextActionText = op?.current_responsible_user_id
      ? `Acknowledged by recipient. Responsible person should Accept Responsibility or Start Execution.`
      : 'Receipt acknowledged. Awaiting group member to Accept Responsibility or supervisor to assign an owner.';

    await pool.query(
      `UPDATE central_operations
       SET first_acknowledged_at = COALESCE(first_acknowledged_at, ?),
           status = CASE WHEN ? THEN 'ACKNOWLEDGED' ELSE status END,
           next_action = CASE WHEN ? THEN ? ELSE next_action END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [now, advanceToAck ? 1 : 0, advanceToAck ? 1 : 0, nextActionText, opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'ACKNOWLEDGED', ?, ?)`,
      [
        opIdNum,
        user.id,
        `Ticket receipt acknowledged by ${user.name} (${user.role})`,
        JSON.stringify({ note: note || null, acknowledgedAt: now.toISOString() }),
      ]
    );

    return this.getOperationById(user, opIdNum);
  }

  // ─── 5. Accept Responsibility / Claim Ownership ────────────────────────
  static async claimOperation(user, operationId) {
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    if (['COMPLETED', 'CANCELLED', 'CLOSED', 'REJECTED'].includes(op.status)) {
      throw new BadRequestError(`Cannot accept ownership for ticket ${op.ticket_reference} in status ${op.status}.`);
    }

    if (op.current_responsible_user_id && Number(op.current_responsible_user_id) !== Number(user.id)) {
      throw new ConflictError(`Ticket ${op.ticket_reference} already has assigned owner ${op.responsible_name || 'another staff member'}.`);
    }

    const now = new Date();
    const newStatus = ['OPEN', 'ISSUED', 'AWAITING_ACKNOWLEDGEMENT', 'AWAITING_OWNERSHIP', 'ACKNOWLEDGED', 'REASSIGNED', 'ESCALATED'].includes(op.status)
      ? 'ACCEPTED'
      : op.status;
    const nextAction = `Responsibility accepted by ${user.name}. Click Start Execution to begin work.`;

    await pool.query(
      `UPDATE central_operations
       SET current_responsible_user_id = ?,
           current_responsible_group = NULL,
           first_acknowledged_at = COALESCE(first_acknowledged_at, ?),
           accepted_at = COALESCE(accepted_at, ?),
           status = ?,
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [user.id, now, now, newStatus, nextAction, opIdNum]
    );

    // Ensure claiming user is registered & marked ACCEPTED/acknowledged
    if (pool.isPostgres()) {
      await pool.query(
        `INSERT INTO central_operation_recipients (operation_id, user_id, role_at_time, status, acknowledged_at, acceptance_status, requires_reacknowledgement, assigned_at)
         VALUES (?, ?, ?, 'DELIVERED', ?, 'ACCEPTED', FALSE, ?)
         ON CONFLICT (operation_id, user_id) DO UPDATE
           SET acknowledged_at = COALESCE(central_operation_recipients.acknowledged_at, EXCLUDED.acknowledged_at),
               acceptance_status = 'ACCEPTED',
               requires_reacknowledgement = FALSE,
               reassigned_out = FALSE`,
        [opIdNum, user.id, user.role, now, now]
      );
    } else {
      await pool.query(
        `INSERT INTO central_operation_recipients (operation_id, user_id, role_at_time, status, acknowledged_at, acceptance_status, requires_reacknowledgement, assigned_at)
         VALUES (?, ?, ?, 'DELIVERED', ?, 'ACCEPTED', FALSE, ?)
         ON DUPLICATE KEY UPDATE
           acknowledged_at = COALESCE(acknowledged_at, VALUES(acknowledged_at)),
           acceptance_status = 'ACCEPTED',
           requires_reacknowledgement = FALSE,
           reassigned_out = FALSE`,
        [opIdNum, user.id, user.role, now, now]
      );
    }

    await pool.query(
      `UPDATE ticket_reassignment_history
       SET new_recipient_acknowledged = TRUE,
           new_recipient_acknowledged_at = COALESCE(new_recipient_acknowledged_at, ?)
       WHERE operation_id = ? AND new_user_id = ? AND new_recipient_acknowledged = FALSE`,
      [now, opIdNum, user.id]
    );

    // Create ONE linked execution task lazily upon ownership acceptance
    const existingTasks = extractRows(
      await pool.query('SELECT id FROM operational_tasks WHERE central_operation_id = ? LIMIT 1', [opIdNum])
    );
    if (existingTasks.length === 0) {
      try {
        const taskCode = `TSK-${op.operation_code.replace('OPS-', '')}-01`;
        await pool.query(
          `INSERT INTO operational_tasks (
            task_code, property_id, assigned_to_id, assigned_by_id,
            title, description, expected_outcome, task_category,
            priority, due_date, status, central_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
          [
            taskCode,
            op.property_id || 1,
            user.id,
            op.initiated_by_user_id,
            op.title,
            op.operational_instructions,
            op.expected_outcome,
            op.category === 'MAINTENANCE_INSPECTION' ? 'MAINTENANCE' : 'GENERAL',
            op.priority,
            op.deadline_at || addHoursDate(now, 72),
            opIdNum,
          ]
        );
      } catch (taskErr) {
        logger.warn(`Task projection sync notice on claim: ${taskErr.message}`);
      }
    }

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'ACCEPTED', ?, ?)`,
      [
        opIdNum,
        user.id,
        `Ownership & responsibility accepted by ${user.name} (${user.role}).`,
        JSON.stringify({ acceptedBy: user.id, acceptedAt: now.toISOString() }),
      ]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `👤 [RESPONSIBILITY ACCEPTED — ${op.ticket_reference}]\n${user.name} (${user.role}) has accepted primary responsibility for this ticket.`,
          priority: 'NORMAL',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Chat notice on claim: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  // ─── 6. Delegate / Reassign Ownership (With Mandatory Reason & Fresh Ack) ─
  static async assignOperation(user, operationId, targetUserId, notes = null, extra = {}) {
    const opIdNum = await this.resolveOperationId(operationId);
    const targetIdNum = parseInt(targetUserId, 10);
    if (!Number.isFinite(targetIdNum) || targetIdNum <= 0) {
      throw new BadRequestError('Valid target assignee user ID is required.');
    }

    const op = await this.getOperationById(user, opIdNum);
    const userRole = String(user.role || '').toUpperCase();
    const isAllowed =
      Number(op.initiated_by_user_id) === Number(user.id) ||
      Number(op.supervisor_user_id) === Number(user.id) ||
      ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(userRole);

    if (!isAllowed) {
      throw new ForbiddenError('You do not have authority to assign or reassign this ticket.');
    }

    const targetRows = extractRows(
      await pool.query("SELECT id, name, email, role, property_id FROM users WHERE id = ? AND status = 'ACTIVE' LIMIT 1", [targetIdNum])
    );
    if (targetRows.length === 0) {
      throw new NotFoundError(`Active target staff member #${targetUserId} does not exist.`);
    }
    const targetUser = targetRows[0];

    const previousUserId = op.current_responsible_user_id ? Number(op.current_responsible_user_id) : null;
    const isReassignment = Boolean(previousUserId && previousUserId !== targetIdNum);
    const reasonText = String(extra?.reason || notes || '').trim();

    if (isReassignment && reasonText.length < 3) {
      throw new BadRequestError('A clear reason is strictly required when reassigning a ticket from another owner.');
    }

    const now = new Date();
    const slaHours = op.acknowledgment_sla_hours || getSlaHoursForPriority(op.priority);
    const newAckDeadline = addHoursDate(now, slaHours);
    const nextAction = isReassignment
      ? `Reassigned to ${targetUser.name}. Awaiting fresh acknowledgement & execution.`
      : `Assigned to ${targetUser.name}. Awaiting acknowledgement & responsibility confirmation.`;

    const newStatus = isReassignment
      ? 'REASSIGNED'
      : ['OPEN', 'ISSUED', 'AWAITING_ACKNOWLEDGEMENT', 'AWAITING_OWNERSHIP', 'ACKNOWLEDGED', 'ESCALATED', 'REJECTED'].includes(op.status)
        ? 'AWAITING_ACKNOWLEDGEMENT'
        : op.status;

    await pool.query(
      `UPDATE central_operations
       SET current_responsible_user_id = ?,
           current_responsible_group = NULL,
           status = ?,
           next_action = ?,
           reassignment_count = reassignment_count + ?,
           acknowledgment_deadline_at = ?,
           sla_first_reminder_sent_at = NULL,
           sla_final_reminder_sent_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [targetIdNum, newStatus, nextAction, isReassignment ? 1 : 0, newAckDeadline, opIdNum]
    );

    if (previousUserId && previousUserId !== targetIdNum) {
      await pool.query(
        `UPDATE central_operation_recipients
         SET reassigned_out = TRUE, acceptance_status = 'REASSIGNED_OUT'
         WHERE operation_id = ? AND user_id = ?`,
        [opIdNum, previousUserId]
      );
    }

    // Ensure target user has a fresh recipient entry requiring new acknowledgement
    if (pool.isPostgres()) {
      await pool.query(
        `INSERT INTO central_operation_recipients (
          operation_id, user_id, role_at_time, status, acknowledged_at, acceptance_status, requires_reacknowledgement, reassigned_out, assigned_at
        ) VALUES (?, ?, ?, 'DELIVERED', NULL, 'PENDING', TRUE, FALSE, ?)
        ON CONFLICT (operation_id, user_id) DO UPDATE
          SET acknowledged_at = NULL,
              acceptance_status = 'PENDING',
              requires_reacknowledgement = TRUE,
              reassigned_out = FALSE,
              assigned_at = EXCLUDED.assigned_at`,
        [opIdNum, targetIdNum, targetUser.role, now]
      );
    } else {
      await pool.query(
        `INSERT INTO central_operation_recipients (
          operation_id, user_id, role_at_time, status, acknowledged_at, acceptance_status, requires_reacknowledgement, reassigned_out, assigned_at
        ) VALUES (?, ?, ?, 'DELIVERED', NULL, 'PENDING', TRUE, FALSE, ?)
        ON DUPLICATE KEY UPDATE
          acknowledged_at = NULL,
          acceptance_status = 'PENDING',
          requires_reacknowledgement = TRUE,
          reassigned_out = FALSE,
          assigned_at = VALUES(assigned_at)`,
        [opIdNum, targetIdNum, targetUser.role, now]
      );
    }

    // Update or create linked single primary task so assignee always sees the ticket in tasks too
    const existingTasks = extractRows(
      await pool.query('SELECT id FROM operational_tasks WHERE central_operation_id = ? ORDER BY id ASC LIMIT 1', [opIdNum])
    );
    if (existingTasks.length > 0) {
      await pool.query(
        "UPDATE operational_tasks SET assigned_to_id = ?, assigned_by_id = ?, status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [targetIdNum, user.id, existingTasks[0].id]
      );
    } else {
      try {
        const taskCode = `TSK-${op.operation_code.replace('OPS-', '')}-${String(Date.now()).slice(-4)}`;
        await pool.query(
          `INSERT INTO operational_tasks (
            task_code, property_id, assigned_to_id, assigned_by_id,
            title, description, expected_outcome, task_category,
            priority, due_date, status, central_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
          [
            taskCode,
            op.property_id || targetUser.property_id || 1,
            targetIdNum,
            user.id,
            op.title,
            op.operational_instructions,
            op.expected_outcome,
            op.category === 'MAINTENANCE_INSPECTION' ? 'MAINTENANCE' : 'GENERAL',
            op.priority,
            op.deadline_at || addHoursDate(now, 72),
            opIdNum,
          ]
        );
      } catch (taskErr) {
        logger.warn(`Task projection sync notice on assign: ${taskErr.message}`);
      }
    }

    // Dispatch DM ticket notification directly to new assignee
    let dmThreadId = null;
    let dmMessageId = null;
    try {
      if (Number(user.id) !== targetIdNum) {
        const dm = await ChatService.findOrCreateDirectThread(user, targetIdNum);
        dmThreadId = dm?.id || null;
        if (dmThreadId) {
          const msg = await ChatService.sendMessage(user, {
            threadId: dmThreadId,
            messageType: 'CONTEXT_LINK',
            content:
              `🔄 [${isReassignment ? 'TICKET REASSIGNED TO YOU' : 'TICKET ASSIGNED TO YOU'} — ${op.ticket_reference}]\n` +
              `Title: ${op.title}\n` +
              `${isReassignment ? `Previous Owner: ${op.responsible_name || 'N/A'}\nReason: ${reasonText}\n` : ''}` +
              `Assigned By: ${user.name} (${user.role})\n` +
              `Ack SLA: ${slaHours}h (Due ${formatLagosTime(newAckDeadline)})\n` +
              `Open the ticket to Acknowledge Receipt.`,
            priority: op.priority || 'IMPORTANT',
            contextEntityType: 'OPERATION',
            contextEntityId: opIdNum,
          });
          dmMessageId = msg?.id || null;
        }
      }
    } catch (dmErr) {
      logger.warn(`Direct assignment DM notify warning: ${dmErr.message}`);
    }

    // Persist Reassignment History Record
    await pool.query(
      `INSERT INTO ticket_reassignment_history (
        operation_id, previous_user_id, new_user_id, reassigned_by_id,
        reason, reassigned_at, new_recipient_acknowledged, notification_thread_id, notification_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, ?)`,
      [
        opIdNum,
        previousUserId,
        targetIdNum,
        user.id,
        reasonText || `Delegated to ${targetUser.name} by ${user.name}`,
        now,
        dmThreadId,
        dmMessageId,
      ]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        opIdNum,
        user.id,
        isReassignment ? 'REASSIGNED' : 'ASSIGNED',
        `${isReassignment ? 'Reassigned' : 'Assigned'} to ${targetUser.name} by ${user.name}${reasonText ? ` — Reason: ${reasonText}` : ''}`,
        JSON.stringify({ previousUserId, newUserId: targetIdNum, targetName: targetUser.name, reason: reasonText }),
      ]
    );

    try {
      await NotificationsService.dispatchNotification({
        recipientId: targetIdNum,
        recipientRole: targetUser.role,
        propertyId: op.property_id || null,
        title: `${isReassignment ? 'Ticket Reassigned' : 'Ticket Assigned'}: ${op.ticket_reference}`,
        message: `${user.name} assigned "${op.title}" to you. Acknowledge within ${slaHours}h (${formatLagosTime(newAckDeadline)}).`,
        category: 'TICKET',
        priority: op.priority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        sourceEntityType: 'CENTRAL_OPERATION',
        sourceEntityId: opIdNum,
        linkUrl: `/portal/operations?op=${opIdNum}`,
      });
    } catch (nErr) {
      logger.warn(`Assign notification warning: ${nErr.message}`);
    }

    return this.getOperationById(user, opIdNum);
  }

  // ─── 7. Start Execution (Distinct From Ack & Accept) ───────────────────
  static async startExecution(user, operationId, notes = null) {
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    if (['COMPLETED', 'CANCELLED', 'CLOSED', 'REJECTED'].includes(op.status)) {
      throw new BadRequestError(`Cannot start execution for ticket in status ${op.status}.`);
    }
    if (!op.current_responsible_user_id) {
      throw new BadRequestError('A responsible owner must Accept Responsibility or be assigned before execution begins.');
    }

    const role = String(user.role || '').toUpperCase();
    const isMgmt = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(role);
    if (Number(op.current_responsible_user_id) !== Number(user.id) && !isMgmt) {
      throw new ForbiddenError('Only the assigned owner or supervising management can mark execution started.');
    }

    const now = new Date();
    const nextAction = `Execution started by ${user.name}. Log progress updates, evidence, or submit completion when done.`;

    await pool.query(
      `UPDATE central_operations
       SET status = 'IN_PROGRESS',
           first_acknowledged_at = COALESCE(first_acknowledged_at, ?),
           accepted_at = COALESCE(accepted_at, ?),
           started_at = COALESCE(started_at, ?),
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [now, now, now, nextAction, opIdNum]
    );

    await pool.query(
      `UPDATE central_operation_recipients
       SET acknowledged_at = COALESCE(acknowledged_at, ?),
           acceptance_status = 'ACCEPTED',
           requires_reacknowledgement = FALSE
       WHERE operation_id = ? AND user_id = ?`,
      [now, opIdNum, op.current_responsible_user_id]
    );

    await pool.query(
      "UPDATE operational_tasks SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE central_operation_id = ? AND status = 'PENDING'",
      [opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'STARTED', ?, ?)`,
      [
        opIdNum,
        user.id,
        `Execution started by ${user.name}${notes ? `: ${notes}` : ''}`,
        JSON.stringify({ startedAt: now.toISOString(), notes: notes || null }),
      ]
    );

    return this.getOperationById(user, opIdNum);
  }

  // ─── 8. Clarification Workflow ─────────────────────────────────────────
  static async requestClarification(user, operationId, { questionText }) {
    if (!questionText || questionText.trim().length < 5) {
      throw new BadRequestError('Detailed clarification inquiry text is required.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);
    const now = new Date();

    await pool.query(
      `UPDATE central_operations
       SET status = 'AWAITING_CLARIFICATION',
           clarification_question = ?,
           clarification_requested_by_id = ?,
           clarification_requested_at = ?,
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        questionText.trim(),
        user.id,
        now,
        `Clarification requested by ${user.name}. Issuer must respond to resume execution.`,
        opIdNum,
      ]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'CLARIFICATION_REQUESTED', ?, ?)`,
      [opIdNum, user.id, `Clarification requested by ${user.name}: "${questionText.trim().slice(0, 90)}"`, JSON.stringify({ questionText })]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `❓ [CLARIFICATION INQUIRY — ${op.ticket_reference}]\n${user.name} (${user.role}): ${questionText.trim()}`,
          priority: 'IMPORTANT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Clarification chat post error: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  static async respondClarification(user, operationId, { responseText }) {
    if (!responseText || responseText.trim().length < 5) {
      throw new BadRequestError('Detailed clarification response text is required.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);
    const now = new Date();
    const resumedStatus = op.started_at ? 'IN_PROGRESS' : op.accepted_at ? 'ACCEPTED' : 'ACKNOWLEDGED';

    await pool.query(
      `UPDATE central_operations
       SET status = ?,
           clarification_response = ?,
           clarification_responded_at = ?,
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        resumedStatus,
        responseText.trim(),
        now,
        `Clarification answered by ${user.name}. Assignee may resume execution.`,
        opIdNum,
      ]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'CLARIFICATION_RESPONDED', ?, ?)`,
      [opIdNum, user.id, `Clarification answered by ${user.name}: "${responseText.trim().slice(0, 90)}"`, JSON.stringify({ responseText })]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `💡 [CLARIFICATION RESPONSE — ${op.ticket_reference}]\n${user.name} (${user.role}): ${responseText.trim()}`,
          priority: 'NORMAL',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Clarification response chat error: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  // ─── 9. Blocker Report & Unblock Resolution ────────────────────────────
  static async reportBlocker(user, operationId, { category = 'ACCESS', details, blockerCategory, description }) {
    const cleanCategory = blockerCategory || category || 'OTHER';
    const cleanDetails = String(description || details || '').trim();
    if (cleanDetails.length < 5) {
      throw new BadRequestError('Blocker description details are required.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    await pool.query(
      `UPDATE central_operations
       SET status = 'BLOCKED',
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [`Blocker reported (${cleanCategory}) by ${user.name}. Supervisor intervention required to unblock.`, opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'BLOCKER_REPORTED', ?, ?)`,
      [opIdNum, user.id, `Blocker reported (${cleanCategory}) by ${user.name}: "${cleanDetails.slice(0, 90)}"`, JSON.stringify({ category: cleanCategory, details: cleanDetails })]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `🚨 [TICKET BLOCKED — ${op.ticket_reference}]\nCategory: ${cleanCategory}\nReported By: ${user.name} (${user.role})\nDetails: ${cleanDetails}\n\nSupervisor action required to unblock.`,
          priority: 'URGENT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Blocker chat error: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  static async resolveBlocker(user, operationId, { resolutionNotes = 'Blocker resolved by management.' } = {}) {
    const role = String(user.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(role)) {
      throw new ForbiddenError('Only supervising management may formally resolve and unblock a ticket.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);
    const resumedStatus = op.started_at ? 'IN_PROGRESS' : 'ACCEPTED';

    await pool.query(
      `UPDATE central_operations
       SET status = ?,
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [resumedStatus, `Blocker resolved by ${user.name}. Execution resumed.`, opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'BLOCKER_RESOLVED', ?, ?)`,
      [opIdNum, user.id, `Blocker resolved by ${user.name}: ${resolutionNotes}`, JSON.stringify({ resolutionNotes })]
    );

    return this.getOperationById(user, opIdNum);
  }

  // ─── 10. Deadline Extension Request & Supervisory Approval ─────────────
  static async requestExtension(user, operationId, { requestedDeadlineAt, reason }) {
    if (!requestedDeadlineAt || !reason || String(reason).trim().length < 5) {
      throw new BadRequestError('A proposed new deadline and clear justification are required.');
    }
    const newDt = new Date(requestedDeadlineAt);
    if (Number.isNaN(newDt.getTime())) {
      throw new BadRequestError('Invalid requested deadline timestamp.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    if (['COMPLETED', 'CLOSED', 'CANCELLED'].includes(op.status)) {
      throw new BadRequestError(`Cannot request deadline extension for ticket in status ${op.status}.`);
    }

    const now = new Date();
    await pool.query(
      `UPDATE central_operations
       SET extension_status = 'PENDING',
           requested_deadline_at = ?,
           extension_reason = ?,
           extension_requested_by_id = ?,
           extension_requested_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newDt, String(reason).trim(), user.id, now, opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'EXTENSION_REQUESTED', ?, ?)`,
      [
        opIdNum,
        user.id,
        `Deadline extension requested to ${formatLagosTime(newDt)} by ${user.name}.`,
        JSON.stringify({ currentDeadline: op.deadline_at, requestedDeadlineAt: newDt.toISOString(), reason }),
      ]
    );

    // Notify issuer / supervisor
    const reviewerId = Number(op.supervisor_user_id || op.initiated_by_user_id);
    if (reviewerId && reviewerId !== Number(user.id)) {
      try {
        await NotificationsService.dispatchNotification({
          recipientId: reviewerId,
          propertyId: op.property_id || null,
          title: `Extension Requested: ${op.ticket_reference}`,
          message: `${user.name} requested deadline extension to ${formatLagosTime(newDt)} — "${String(reason).trim().slice(0, 120)}"`,
          category: 'TICKET',
          priority: 'HIGH',
          sourceEntityType: 'CENTRAL_OPERATION',
          sourceEntityId: opIdNum,
          linkUrl: `/portal/operations?op=${opIdNum}`,
        });
      } catch (e) {
        logger.warn(`Extension notify warning: ${e.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  static async reviewExtension(user, operationId, { decision, notes = null }) {
    const role = String(user.role || '').toUpperCase();
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    const canApprove =
      Number(op.initiated_by_user_id) === Number(user.id) ||
      Number(op.supervisor_user_id) === Number(user.id) ||
      ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(role);

    if (!canApprove) {
      throw new ForbiddenError('Only supervising management or the ticket issuer can review deadline extension requests.');
    }
    if (op.extension_status !== 'PENDING' || !op.requested_deadline_at) {
      throw new BadRequestError('There is no pending deadline extension request for this ticket.');
    }

    const approved = String(decision || '').toUpperCase() === 'APPROVED';
    const now = new Date();
    const approvedDeadline = new Date(op.requested_deadline_at);

    if (approved) {
      await pool.query(
        `INSERT INTO ticket_deadline_history (operation_id, previous_deadline_at, new_deadline_at, change_type, reason, requested_by_id, approved_by_id)
         VALUES (?, ?, ?, 'EXTENSION_APPROVED', ?, ?, ?)`,
        [opIdNum, op.deadline_at, approvedDeadline, op.extension_reason || notes, op.extension_requested_by_id, user.id]
      );

      await pool.query(
        `UPDATE central_operations
         SET deadline_at = ?,
             extension_status = 'APPROVED',
             extension_reviewed_by_id = ?,
             extension_reviewed_at = ?,
             extension_review_notes = ?,
             status = CASE WHEN status = 'OVERDUE' AND ? > CURRENT_TIMESTAMP THEN 'IN_PROGRESS' ELSE status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [approvedDeadline, user.id, now, notes || null, approvedDeadline, opIdNum]
      );

      await pool.query(
        'UPDATE operational_tasks SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE central_operation_id = ?',
        [approvedDeadline, opIdNum]
      );
    } else {
      await pool.query(
        `UPDATE central_operations
         SET extension_status = 'REJECTED',
             extension_reviewed_by_id = ?,
             extension_reviewed_at = ?,
             extension_review_notes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [user.id, now, notes || 'Extension request declined.', opIdNum]
      );
    }

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        opIdNum,
        user.id,
        approved ? 'EXTENSION_APPROVED' : 'EXTENSION_REJECTED',
        `Extension ${approved ? `APPROVED to ${formatLagosTime(approvedDeadline)}` : 'REJECTED'} by ${user.name}`,
        JSON.stringify({ decision: approved ? 'APPROVED' : 'REJECTED', notes }),
      ]
    );

    if (op.extension_requested_by_id && Number(op.extension_requested_by_id) !== Number(user.id)) {
      try {
        await NotificationsService.dispatchNotification({
          recipientId: op.extension_requested_by_id,
          propertyId: op.property_id || null,
          title: `Extension ${approved ? 'Approved' : 'Declined'}: ${op.ticket_reference}`,
          message: `Your deadline extension request was ${approved ? `approved to ${formatLagosTime(approvedDeadline)}` : 'declined'} by ${user.name}.`,
          category: 'TICKET',
          priority: 'MEDIUM',
          sourceEntityType: 'CENTRAL_OPERATION',
          sourceEntityId: opIdNum,
          linkUrl: `/portal/operations?op=${opIdNum}`,
        });
      } catch (e) {
        logger.warn(`Extension decision notify error: ${e.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  // ─── 11. Progress Updates & Linked Tasks ───────────────────────────────
  static async updateProgress(user, operationId, { progressNotes, note, status = 'IN_PROGRESS', progressPercent = null }) {
    const cleanNote = String(progressNotes || note || '').trim();
    if (cleanNote.length < 3) {
      throw new BadRequestError('Progress update notes are required.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    if (!op.current_responsible_user_id && op.current_responsible_group) {
      throw new BadRequestError('Accept Responsibility (claim ownership) or assign an owner before submitting execution progress.');
    }

    const pct = progressPercent !== null && progressPercent !== undefined
      ? Math.max(0, Math.min(100, parseInt(progressPercent, 10) || 0))
      : op.last_progress_percent || 0;

    await pool.query(
      `UPDATE central_operations
       SET status = ?,
           started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
           last_progress_percent = ?,
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, pct, `Progress at ${pct}% logged by ${user.name}. Continue execution or submit completion.`, opIdNum]
    );

    await pool.query(
      "UPDATE operational_tasks SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE central_operation_id = ? AND status = 'PENDING'",
      [opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'PROGRESS_UPDATED', ?, ?)`,
      [opIdNum, user.id, `Progress (${pct}%) logged by ${user.name}: "${cleanNote.slice(0, 90)}"`, JSON.stringify({ progressNotes: cleanNote, progressPercent: pct, status })]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `📈 [PROGRESS UPDATE — ${op.ticket_reference} (${pct}%)]\nLogged By: ${user.name}\nNotes: ${cleanNote}`,
          priority: 'NORMAL',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Progress chat post error: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  static async createLinkedTask(user, operationId, taskData) {
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    const {
      assigned_to_id,
      title,
      description,
      task_category = 'GENERAL',
      priority = op.priority || 'NORMAL',
      due_date = op.deadline_at || addHoursDate(new Date(), 48).toISOString(),
      apartment_id = null,
    } = taskData;

    if (!assigned_to_id || !title || !description) {
      throw new BadRequestError('Assigned user, title, and description are required for sub-task creation.');
    }

    const taskCode = await this.generateNextSequence('operational_tasks', 'task_code', 'TSK');
    const normPriority = normalizePriority(priority);
    const sql = pool.isPostgres()
      ? `INSERT INTO operational_tasks (task_code, property_id, apartment_id, central_operation_id, assigned_to_id, assigned_by_id, title, description, task_category, priority, due_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING') RETURNING *`
      : `INSERT INTO operational_tasks (task_code, property_id, apartment_id, central_operation_id, assigned_to_id, assigned_by_id, title, description, task_category, priority, due_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`;

    const res = await pool.query(sql, [
      taskCode,
      op.property_id || (user.propertyId ? parseInt(user.propertyId, 10) : 1),
      apartment_id,
      opIdNum,
      assigned_to_id,
      user.id,
      title,
      description,
      task_category,
      normPriority,
      due_date,
    ]);

    const createdId = extractInsertId(res);
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'TASK_LINKED', ?, ?)`,
      [opIdNum, user.id, `Milestone task ${taskCode} linked to ticket by ${user.name}`, JSON.stringify({ taskId: createdId, taskCode, title })]
    );

    return this.getOperationById(user, opIdNum);
  }

  // ─── 12. DB-Persisted Evidence Attachments (No Ephemeral Render Disk!) ─
  static async uploadEvidence(user, operationId, { fileData, fileName, mimeType, caption = null }) {
    if (!fileData || !fileName) {
      throw new BadRequestError('Evidence fileData (base64) and fileName are required.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    await this.getOperationById(user, opIdNum);

    const b64Clean = String(fileData).includes('base64,') ? String(fileData).split('base64,')[1] : String(fileData);
    const buffer = Buffer.from(b64Clean, 'base64');
    if (buffer.length === 0 || buffer.length > 6 * 1024 * 1024) {
      throw new BadRequestError('Evidence attachment must be between 1 byte and 6 MB.');
    }

    const safeMime = String(mimeType || 'application/octet-stream').slice(0, 90);
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);

    const res = await pool.query(
      pool.isPostgres()
        ? `INSERT INTO operational_documents_storage (entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by)
           VALUES ('TICKET_EVIDENCE', ?, ?, ?, ?, ?, ?) RETURNING id`
        : `INSERT INTO operational_documents_storage (entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by)
           VALUES ('TICKET_EVIDENCE', ?, ?, ?, ?, ?, ?)`,
      [opIdNum, safeName, safeMime, buffer.length, buffer, user.id]
    );

    const docId = extractInsertId(res);
    const downloadUrl = `/api/v1/workforce/operations/${opIdNum}/evidence/${docId}`;

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'EVIDENCE_UPLOADED', ?, ?)`,
      [opIdNum, user.id, `Evidence "${safeName}" uploaded to database storage by ${user.name}`, JSON.stringify({ docId, fileName: safeName, caption, sizeBytes: buffer.length })]
    );

    return { id: docId, fileName: safeName, mimeType: safeMime, sizeBytes: buffer.length, downloadUrl };
  }

  static async getEvidenceFile(user, operationId, docId) {
    const opIdNum = await this.resolveOperationId(operationId);
    await this.getOperationById(user, opIdNum);
    const rows = extractRows(
      await pool.query(
        "SELECT id, file_name, mime_type, file_data FROM operational_documents_storage WHERE id = ? AND entity_type = 'TICKET_EVIDENCE' AND entity_id = ? LIMIT 1",
        [parseInt(docId, 10), opIdNum]
      )
    );
    if (rows.length === 0) {
      throw new NotFoundError('Ticket evidence attachment not found.');
    }
    return rows[0];
  }

  // ─── 13. Completion, Supervisory Review, Rejection, Close & Reopen ─────
  static async submitCompletion(user, operationId, { completionNotes, evidenceUrl, completionEvidenceUrl }) {
    if (!completionNotes || completionNotes.trim().length < 5) {
      throw new BadRequestError('Completion summary and verification notes are required.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    if (!op.current_responsible_user_id) {
      throw new BadRequestError('Ticket must have an assigned owner before completion can be submitted.');
    }

    const now = new Date();
    const finalEvidenceUrl = completionEvidenceUrl || evidenceUrl || op.completion_evidence_url || null;
    const nextAction = 'Completion submitted. Supervisor must Review and Approve, Request Revision, or Reject.';

    await pool.query(
      `UPDATE central_operations
       SET status = 'SUBMITTED_FOR_REVIEW',
           completion_notes = ?,
           completion_evidence_url = ?,
           last_progress_percent = 100,
           completed_at = ?,
           started_at = COALESCE(started_at, ?),
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [completionNotes.trim(), finalEvidenceUrl, now, now, nextAction, opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'COMPLETION_SUBMITTED', ?, ?)`,
      [opIdNum, user.id, `Completion submitted for review by ${user.name}`, JSON.stringify({ completionNotes, evidenceUrl: finalEvidenceUrl })]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `🏁 [COMPLETION SUBMITTED — ${op.ticket_reference}]\nSubmitted By: ${user.name}\nNotes: ${completionNotes.trim()}\nAwaiting supervisory verification & closure.`,
          priority: 'IMPORTANT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (err) {
        logger.warn(`Completion chat error: ${err.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  static async reviewOperation(user, operationId, { decision, reviewNotes, closeImmediately = true }) {
    const role = String(user.role || '').toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(role)) {
      throw new ForbiddenError('Only managerial and administrative personnel can review completed tickets.');
    }

    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    const upperDecision = String(decision || 'APPROVED').toUpperCase();
    const isApproved = ['APPROVED', 'COMPLETED'].includes(upperDecision);
    const isRevise = ['REVISE', 'REVISION_REQUIRED'].includes(upperDecision);
    const now = new Date();

    const newStatus = isApproved
      ? (closeImmediately ? 'CLOSED' : 'COMPLETED')
      : isRevise
        ? 'REVISION_REQUIRED'
        : 'REJECTED';

    const rejectionCategory = !isApproved ? 'SUPERVISOR_QUALITY_REJECTED' : op.rejection_category;
    const closureOutcome = isApproved && closeImmediately ? 'APPROVED_COMPLETED' : !isApproved && !isRevise ? 'REJECTED_QUALITY' : null;
    const nextAction = isApproved
      ? closeImmediately
        ? 'Ticket approved and formally closed.'
        : 'Work approved. Formally close ticket to archive.'
      : isRevise
        ? `Revisions requested: ${reviewNotes || 'Address reviewer feedback'}. Update work and resubmit.`
        : `Work rejected by supervisor: ${reviewNotes || 'Did not meet quality standards'}.`;

    await pool.query(
      `UPDATE central_operations
       SET status = ?,
           completed_at = COALESCE(completed_at, ?),
           closed_at = ?,
           closed_by_user_id = ?,
           closure_outcome = ?,
           closure_reason = ?,
           review_notes = ?,
           reviewed_by_user_id = ?,
           reviewed_at = ?,
           rejection_category = ?,
           rejected_by_user_id = ?,
           rejected_at = ?,
           rejection_reason = ?,
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        newStatus,
        isApproved ? now : op.completed_at,
        newStatus === 'CLOSED' || newStatus === 'REJECTED' ? now : null,
        newStatus === 'CLOSED' ? user.id : op.closed_by_user_id,
        closureOutcome || op.closure_outcome,
        newStatus === 'CLOSED' ? (reviewNotes || 'Approved and closed by supervisor.') : op.closure_reason,
        reviewNotes || null,
        user.id,
        now,
        rejectionCategory || null,
        !isApproved && !isRevise ? user.id : op.rejected_by_user_id,
        !isApproved && !isRevise ? now : op.rejected_at,
        !isApproved && !isRevise ? (reviewNotes || 'Supervisor quality rejection') : op.rejection_reason,
        nextAction,
        opIdNum,
      ]
    );

    if (isApproved) {
      await pool.query(
        "UPDATE operational_tasks SET status = 'COMPLETED', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE central_operation_id = ?",
        [opIdNum]
      );
    }

    const evtType = isApproved ? (newStatus === 'CLOSED' ? 'CLOSED' : 'APPROVED') : isRevise ? 'REVISION_REQUESTED' : 'REJECTED';
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, ?, ?, ?)`,
      [opIdNum, user.id, evtType, `Review concluded as ${newStatus} by ${user.name}`, JSON.stringify({ decision: upperDecision, reviewNotes, newStatus })]
    );

    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `${isApproved ? '✅' : '⚠️'} [TICKET ${newStatus} — ${op.ticket_reference}]\nReviewed By: ${user.name}\nNotes: ${reviewNotes || 'N/A'}`,
          priority: isApproved ? 'NORMAL' : 'IMPORTANT',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (e) {
        logger.warn(`Review chat notify error: ${e.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * Assignee Decline (Misassigned / Impossible — no quality penalty) OR Management Reject
   */
  static async rejectOrDeclineTicket(user, operationId, { reason, category = null }) {
    if (!reason || String(reason).trim().length < 5) {
      throw new BadRequestError('A clear reason (at least 5 characters) is required when rejecting or declining a ticket.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);
    const role = String(user.role || '').toUpperCase();
    const isMgmt = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(role);
    const isAssignee = Number(op.current_responsible_user_id) === Number(user.id);

    const rejCategory = category || (isAssignee && !isMgmt ? 'ASSIGNEE_INVALID_DECLINED' : 'SUPERVISOR_QUALITY_REJECTED');
    const now = new Date();
    const nextAction = rejCategory === 'ASSIGNEE_INVALID_DECLINED'
      ? `Declined by ${user.name} (${reason.trim()}). Supervisor must reassign or cancel.`
      : `Rejected by ${user.name}: ${reason.trim()}.`;

    await pool.query(
      `UPDATE central_operations
       SET status = 'REJECTED',
           rejected_by_user_id = ?,
           rejected_at = ?,
           rejection_reason = ?,
           rejection_category = ?,
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [user.id, now, String(reason).trim(), rejCategory, nextAction, opIdNum]
    );

    if (rejCategory === 'ASSIGNEE_INVALID_DECLINED') {
      await pool.query(
        "UPDATE central_operation_recipients SET acceptance_status = 'DECLINED' WHERE operation_id = ? AND user_id = ?",
        [opIdNum, user.id]
      );
    }

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'REJECTED', ?, ?)`,
      [opIdNum, user.id, `Ticket ${rejCategory === 'ASSIGNEE_INVALID_DECLINED' ? 'declined' : 'rejected'} by ${user.name}: ${reason.trim().slice(0, 90)}`, JSON.stringify({ reason, rejectionCategory: rejCategory })]
    );

    return this.getOperationById(user, opIdNum);
  }

  static async closeTicket(user, operationId, { outcome = 'CLOSED_RESOLVED', closureReason = 'Formally closed.' } = {}) {
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);
    const role = String(user.role || '').toUpperCase();
    const canClose =
      Number(op.initiated_by_user_id) === Number(user.id) ||
      Number(op.supervisor_user_id) === Number(user.id) ||
      ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(role);

    if (!canClose) {
      throw new ForbiddenError('Only issuing or managerial personnel may formally close a ticket.');
    }

    const now = new Date();
    await pool.query(
      `UPDATE central_operations
       SET status = 'CLOSED',
           closed_at = COALESCE(closed_at, ?),
           closed_by_user_id = ?,
           closure_outcome = ?,
           closure_reason = ?,
           completed_at = COALESCE(completed_at, ?),
           next_action = 'Ticket formally closed and archived.',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [now, user.id, outcome, closureReason, outcome === 'APPROVED_COMPLETED' || outcome === 'CLOSED_RESOLVED' ? now : null, opIdNum]
    );

    await pool.query(
      "UPDATE operational_tasks SET status = 'COMPLETED', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE central_operation_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED')",
      [opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'CLOSED', ?, ?)`,
      [opIdNum, user.id, `Ticket formally closed (${outcome}) by ${user.name}.`, JSON.stringify({ outcome, closureReason })]
    );

    return this.getOperationById(user, opIdNum);
  }

  static async reopenTicket(user, operationId, { reason }) {
    if (!reason || String(reason).trim().length < 5) {
      throw new BadRequestError('A clear reason is required to reopen a closed, completed, or rejected ticket.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);
    const role = String(user.role || '').toUpperCase();
    const canReopen =
      Number(op.initiated_by_user_id) === Number(user.id) ||
      Number(op.supervisor_user_id) === Number(user.id) ||
      ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(role);

    if (!canReopen) {
      throw new ForbiddenError('Only supervising management or the ticket issuer may reopen a ticket.');
    }
    if (!['COMPLETED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(op.status)) {
      throw new BadRequestError(`Ticket is currently ${op.status} and does not need reopening.`);
    }

    const reopenedStatus = op.current_responsible_user_id ? 'IN_PROGRESS' : 'OPEN';
    const nextAction = `Ticket reopened by ${user.name}: ${reason.trim()}. Prior closure history preserved.`;

    await pool.query(
      `UPDATE central_operations
       SET status = ?,
           reopen_count = reopen_count + 1,
           closed_at = NULL,
           next_action = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reopenedStatus, nextAction, opIdNum]
    );

    await pool.query(
      "UPDATE operational_tasks SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE central_operation_id = ?",
      [opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'REOPENED', ?, ?)`,
      [
        opIdNum,
        user.id,
        `Ticket reopened (#${(op.reopen_count || 0) + 1}) by ${user.name}: ${reason.trim().slice(0, 90)}`,
        JSON.stringify({
          reason: reason.trim(),
          previousStatus: op.status,
          previousClosedAt: op.closed_at,
          previousClosureOutcome: op.closure_outcome,
        }),
      ]
    );

    if (op.current_responsible_user_id && Number(op.current_responsible_user_id) !== Number(user.id)) {
      try {
        await NotificationsService.dispatchNotification({
          recipientId: op.current_responsible_user_id,
          propertyId: op.property_id || null,
          title: `Ticket Reopened: ${op.ticket_reference}`,
          message: `${user.name} reopened "${op.title}" — ${reason.trim()}`,
          category: 'TICKET',
          priority: 'HIGH',
          sourceEntityType: 'CENTRAL_OPERATION',
          sourceEntityId: opIdNum,
          linkUrl: `/portal/operations?op=${opIdNum}`,
        });
      } catch (e) {
        logger.warn(`Reopen notify error: ${e.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  // ─── 14. Amend & Cancel ────────────────────────────────────────────────
  static async amendOperation(user, operationId, amendmentData) {
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);
    const role = String(user.role || '').toUpperCase();

    if (Number(op.initiated_by_user_id) !== Number(user.id) && !['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      throw new ForbiddenError('Only the initiating officer, Owner, or Administrator may amend an operation.');
    }

    const {
      amendment_reason,
      operational_instructions = op.operational_instructions,
      deadline_at = op.deadline_at,
      priority: rawPriority = op.priority,
    } = amendmentData;

    if (!amendment_reason || amendment_reason.trim().length < 5) {
      throw new BadRequestError('A clear audit reason is required for operational amendments.');
    }

    const priority = normalizePriority(rawPriority);
    const newVersion = (op.memo_version || 1) + 1;
    const memoReference = await this.generateMemoReference();
    const parsedDeadline = deadline_at ? new Date(deadline_at) : null;
    const deadlineText = parsedDeadline ? formatLagosTime(parsedDeadline) : op.deadline_text;
    const effectiveDateText = formatLagosTime(new Date());

    if (parsedDeadline && String(parsedDeadline.toISOString()) !== String(op.deadline_at ? new Date(op.deadline_at).toISOString() : '')) {
      await pool.query(
        `INSERT INTO ticket_deadline_history (operation_id, previous_deadline_at, new_deadline_at, change_type, reason, requested_by_id, approved_by_id)
         VALUES (?, ?, ?, 'AMENDMENT', ?, ?, ?)`,
        [opIdNum, op.deadline_at, parsedDeadline, amendment_reason.trim(), user.id, user.id]
      );
    }

    await pool.query(
      'UPDATE central_operations SET operational_instructions = ?, deadline_at = ?, priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [operational_instructions, parsedDeadline, priority, opIdNum]
    );

    const memoSnapshot = {
      memo_reference: memoReference,
      version_number: newVersion,
      issuer_designation: op.issuer_designation || user.name,
      recipient_summary: op.recipient_summary || op.target_audience_type,
      property_scope_summary: op.property_scope_summary || op.property_name || 'All Properties',
      title: op.title,
      subject: op.subject,
      purpose: op.purpose,
      operational_instructions,
      expected_outcome: op.expected_outcome,
      responsibility_definition: op.responsibility_definition,
      reporting_requirements: op.reporting_requirements,
      deadline_text: deadlineText,
      effective_date_text: effectiveDateText,
      amendment_reason: amendment_reason.trim(),
      created_at: new Date(),
    };

    const pdfBuffer = await MemoPdfGenerator.generateOperationsMemoPdfBuffer({
      operation: { ...op, operational_instructions, deadline_at: parsedDeadline, priority },
      memo: memoSnapshot,
      initiator: { name: op.initiator_name, role: op.initiator_role },
      recipients: op.recipients || [],
      property: op.property_id ? { name: op.property_name, code: op.property_code, city: op.property_city } : null,
      templateType: 'OFFICIAL_AMENDMENT',
    });

    let storageId = null;
    try {
      const storeRes = await pool.query(
        pool.isPostgres()
          ? `INSERT INTO operational_documents_storage (entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by)
             VALUES ('OPERATIONS_MEMO', ?, ?, 'application/pdf', ?, ?, ?) RETURNING id`
          : `INSERT INTO operational_documents_storage (entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by)
             VALUES ('OPERATIONS_MEMO', ?, ?, 'application/pdf', ?, ?, ?)`,
        [opIdNum, `${memoReference}.pdf`, pdfBuffer.length, pdfBuffer, user.id]
      );
      storageId = extractInsertId(storeRes);
    } catch (e) {
      logger.warn(`Failed caching amended PDF: ${e.message}`);
    }

    const memoInsert = await pool.query(
      pool.isPostgres()
        ? `INSERT INTO operations_memos (
            operation_id, memo_reference, version_number, issuer_user_id, issuer_designation,
            recipient_summary, property_scope_summary, title, category, priority, subject,
            purpose, operational_instructions, expected_outcome, responsibility_definition,
            reporting_requirements, deadline_text, effective_date_text, document_storage_id, amendment_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
        : `INSERT INTO operations_memos (
            operation_id, memo_reference, version_number, issuer_user_id, issuer_designation,
            recipient_summary, property_scope_summary, title, category, priority, subject,
            purpose, operational_instructions, expected_outcome, responsibility_definition,
            reporting_requirements, deadline_text, effective_date_text, document_storage_id, amendment_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opIdNum,
        memoReference,
        newVersion,
        user.id,
        memoSnapshot.issuer_designation,
        memoSnapshot.recipient_summary,
        memoSnapshot.property_scope_summary,
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
        storageId,
        amendment_reason.trim(),
      ]
    );
    const newMemoId = extractInsertId(memoInsert);

    await pool.query('UPDATE central_operations SET latest_memo_id = ? WHERE id = ?', [newMemoId, opIdNum]);
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'AMENDED', ?, ?)`,
      [opIdNum, user.id, `Amended (v${newVersion} / ${memoReference}) by ${user.name}: ${amendment_reason.trim()}`, JSON.stringify({ newVersion, memoReference, amendment_reason })]
    );

    return this.getOperationById(user, opIdNum);
  }

  static async cancelOperation(user, operationId, { cancellation_reason }) {
    if (!cancellation_reason || cancellation_reason.trim().length < 5) {
      throw new BadRequestError('A comprehensive justification is required to cancel a ticket.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    const role = String(user.role || '').toUpperCase();
    if (Number(op.initiated_by_user_id) !== Number(user.id) && !['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
      throw new ForbiddenError('Only the initiating officer, Owner, or Administrator may cancel a ticket.');
    }

    const now = new Date();
    await pool.query(
      `UPDATE central_operations
       SET status = 'CANCELLED',
           cancelled_at = ?,
           cancellation_reason = ?,
           closure_outcome = 'CANCELLED_BY_MANAGEMENT',
           next_action = 'Ticket cancelled by management. Excluded from staff execution penalties.',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [now, cancellation_reason.trim(), opIdNum]
    );

    await pool.query(
      "UPDATE operational_tasks SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE central_operation_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED')",
      [opIdNum]
    );

    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, 'CANCELLED', ?, ?)`,
      [opIdNum, user.id, `Ticket cancelled by ${user.name}: "${cancellation_reason.trim().slice(0, 90)}"`, JSON.stringify({ cancellation_reason })]
    );

    return this.getOperationById(user, opIdNum);
  }

  // ─── 15. PDF Memo Retrieval & Regeneration ─────────────────────────────
  static async getMemoPdfBuffer(user, memoId, operationId, { regenerate = false } = {}) {
    let memo = null;
    const memoIdStr = memoId && memoId !== 'undefined' && memoId !== 'null' ? String(memoId).trim() : null;
    let cleanOpId = null;

    if (operationId && operationId !== 'undefined' && operationId !== 'null') {
      try {
        cleanOpId = await this.resolveOperationId(operationId);
      } catch {
        // Optional fallback to memoId
      }
    }

    if (memoIdStr) {
      const isNum = /^\d+$/.test(memoIdStr);
      const rows = extractRows(
        await pool.query(
          `SELECT om.* FROM operations_memos om WHERE ${isNum ? 'om.id = ?' : 'om.memo_reference = ?'} LIMIT 1`,
          [isNum ? parseInt(memoIdStr, 10) : memoIdStr]
        )
      );
      memo = rows[0] || null;
    }

    if (!memo && cleanOpId) {
      const rows = extractRows(
        await pool.query('SELECT * FROM operations_memos WHERE operation_id = ? ORDER BY version_number DESC LIMIT 1', [cleanOpId])
      );
      memo = rows[0] || null;
    }

    const targetOpId = memo?.operation_id || cleanOpId;
    if (!targetOpId) {
      throw new NotFoundError('Operations Memorandum not found.');
    }

    // Strict Authorization Check via getOperationById (covers Admin/Owner, Recipients, Initiator, Property Managers!)
    const op = await this.getOperationById(user, targetOpId);

    if (!memo) {
      memo = {
        operation_id: op.id,
        memo_reference: op.memo_reference || `MEMO-${op.operation_code || op.id}`,
        version_number: op.memo_version || 1,
        subject: op.subject,
        purpose: op.purpose,
        operational_instructions: op.operational_instructions,
        expected_outcome: op.expected_outcome,
        responsibility_definition: op.responsibility_definition,
        reporting_requirements: op.reporting_requirements,
        issuer_designation: op.issuer_designation || op.initiator_name,
        recipient_summary: op.recipient_summary || op.target_audience_type,
        property_scope_summary: op.property_scope_summary || op.property_name || 'Corporate / Multi-Property',
        deadline_text: op.deadline_at ? formatLagosTime(op.deadline_at) : 'As Directed / Ongoing',
        effective_date_text: formatLagosTime(op.created_at),
        created_at: op.created_at,
      };
    }

    // Generate clean cursor-safe PDF using MemoPdfGenerator (always up-to-date if recipients acknowledged or regenerate=true)
    const pdfBuffer = await MemoPdfGenerator.generateOperationsMemoPdfBuffer({
      operation: op,
      memo,
      initiator: { name: op.initiator_name, role: op.initiator_role, email: op.initiator_email },
      recipients: op.recipients || [],
      property: op.property_id ? { name: op.property_name, code: op.property_code, city: op.property_city } : null,
      templateType: (memo.version_number || 1) > 1 ? 'OFFICIAL_AMENDMENT' : null,
    });

    if (regenerate || !memo.document_storage_id) {
      try {
        const res = await pool.query(
          pool.isPostgres()
            ? `INSERT INTO operational_documents_storage (entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by)
               VALUES ('OPERATIONS_MEMO', ?, ?, 'application/pdf', ?, ?, ?) RETURNING id`
            : `INSERT INTO operational_documents_storage (entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by)
               VALUES ('OPERATIONS_MEMO', ?, ?, 'application/pdf', ?, ?, ?)`,
          [op.id, `${memo.memo_reference}.pdf`, pdfBuffer.length, pdfBuffer, user.id]
        );
        const newId = extractInsertId(res);
        if (newId && memo.id) {
          await pool.query('UPDATE operations_memos SET document_storage_id = ? WHERE id = ?', [newId, memo.id]);
        }
      } catch (saveErr) {
        logger.warn(`Memo PDF storage refresh warning: ${saveErr.message}`);
      }
    }

    return {
      buffer: pdfBuffer,
      fileName: `${memo.memo_reference || op.ticket_reference || 'Memorandum'}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  // ─── 16. Role-Scoped Operations & Ticketing Summary KPIs ───────────────
  static async getOperationsSummary(user, _filters = {}) {
    const role = String(user?.role || '').toUpperCase();
    const userId = Number(user.id);
    const params = [];
    let scopeSql = '';

    if (['STAFF', 'RECEPTIONIST'].includes(role)) {
      params.push(userId, userId);
      scopeSql = `WHERE (co.current_responsible_user_id = ? OR EXISTS (SELECT 1 FROM central_operation_recipients c2 WHERE c2.operation_id = co.id AND c2.user_id = ? AND COALESCE(c2.reassigned_out, FALSE) = FALSE))`;
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      params.push(userId, userId, userId, userId);
      scopeSql = `WHERE (
        co.initiated_by_user_id = ?
        OR co.supervisor_user_id = ?
        OR co.current_responsible_user_id = ?
        OR co.property_id IN (SELECT property_id FROM user_property_assignments WHERE user_id = ?)
        OR co.property_id = (SELECT property_id FROM users WHERE id = ${userId})
      )`;
    }

    const summaryRows = extractRows(
      await pool.query(
        `SELECT
          COUNT(DISTINCT co.id) AS total_operations,
          COUNT(DISTINCT CASE WHEN co.status IN ('OPEN', 'ISSUED', 'AWAITING_ACKNOWLEDGEMENT', 'ACKNOWLEDGED', 'ACCEPTED', 'IN_PROGRESS', 'REASSIGNED', 'BLOCKED', 'AWAITING_CLARIFICATION', 'SUBMITTED_FOR_REVIEW', 'AWAITING_REVIEW', 'REVISION_REQUIRED', 'OVERDUE', 'ESCALATED') THEN co.id END) AS active_count,
          COUNT(DISTINCT CASE WHEN co.status IN ('OPEN', 'ISSUED', 'AWAITING_ACKNOWLEDGEMENT', 'REASSIGNED') THEN co.id END) AS awaiting_ack_count,
          COUNT(DISTINCT CASE WHEN co.status IN ('SUBMITTED_FOR_REVIEW', 'AWAITING_REVIEW', 'PENDING_APPROVAL') THEN co.id END) AS pending_review_count,
          COUNT(DISTINCT CASE WHEN co.status = 'OVERDUE' OR (co.deadline_at IS NOT NULL AND co.deadline_at < CURRENT_TIMESTAMP AND co.status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED')) THEN co.id END) AS overdue_count,
          COUNT(DISTINCT CASE WHEN co.status = 'ESCALATED' OR (co.escalated_at IS NOT NULL AND co.status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED')) THEN co.id END) AS escalated_count,
          COUNT(DISTINCT CASE WHEN co.status IN ('COMPLETED', 'CLOSED') THEN co.id END) AS completed_count
         FROM central_operations co
         ${scopeSql}`,
        params
      )
    );

    const pendingAckRes = extractRows(
      await pool.query(
        `SELECT COUNT(*) AS count
         FROM central_operation_recipients cor
         JOIN central_operations co ON co.id = cor.operation_id
         WHERE cor.user_id = ?
           AND cor.acknowledged_at IS NULL
           AND COALESCE(cor.reassigned_out, FALSE) = FALSE
           AND co.status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED')`,
        [userId]
      )
    );

    const row = summaryRows[0] || {};
    return {
      total_operations: parseInt(row.total_operations || 0, 10),
      active_count: parseInt(row.active_count || 0, 10),
      awaiting_ack_count: parseInt(row.awaiting_ack_count || 0, 10),
      pending_review_count: parseInt(row.pending_review_count || 0, 10),
      overdue_count: parseInt(row.overdue_count || 0, 10),
      escalated_count: parseInt(row.escalated_count || 0, 10),
      completed_count: parseInt(row.completed_count || 0, 10),
      my_pending_acknowledgements: parseInt(pendingAckRes[0]?.count || 0, 10),
    };
  }

  static async generateOperationsMemoPdfBuffer(opts) {
    return MemoPdfGenerator.generateOperationsMemoPdfBuffer(opts);
  }
}

module.exports = CentralOperationsService;
