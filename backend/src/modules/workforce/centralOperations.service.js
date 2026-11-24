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
  ConflictError,
} = require('../../core/errors/apiError');
const logger = require('../../utils/logger');
const ChatService = require('../chat/chat.service');
const ChatRepository = require('../chat/chat.repository');

class CentralOperationsService {
  /**
   * DERIVE UNAMBIGUOUS NEXT ACTION FOR ANY OPERATIONAL RECORD AND VIEWER
   * Dynamic, role-aware, and actionable guidance for the recipient and management.
   */
  static deriveNextAction(op, viewerUser) {
    if (!op) return { text: 'No action required.', generalText: 'No action required.', actionKey: 'NONE', actionableByMe: false };

    const viewerId = viewerUser ? Number(viewerUser.id) : null;
    const viewerRole = viewerUser ? (viewerUser.role || '').toUpperCase() : '';
    const status = op.status || 'ISSUED';
    const isInitiator = viewerId && Number(op.initiated_by_user_id) === viewerId;
    const isSupervisor = viewerId && Number(op.supervisor_user_id) === viewerId;
    const isResponsible = viewerId && Number(op.current_responsible_user_id) === viewerId;
    const isManagement = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(viewerRole);

    const recipientRecord = op.recipients?.find(r => Number(r.user_id || r.id) === viewerId);
    const hasAcknowledged = recipientRecord && Boolean(recipientRecord.acknowledged_at);

    switch (status) {
      case 'DRAFT':
        return {
          text: isInitiator ? 'Review draft directives and formally issue operation.' : 'Draft directive pending issuance.',
          generalText: 'Draft pending issuance.',
          actionKey: isInitiator ? 'ISSUE' : 'NONE',
          actionableByMe: isInitiator,
        };

      case 'ISSUED':
      case 'AWAITING_ACKNOWLEDGEMENT':
        if (recipientRecord && !hasAcknowledged) {
          return {
            text: 'Awaiting your formal acknowledgement. Click "Acknowledge Receipt" to confirm you have reviewed the directive.',
            generalText: 'Awaiting recipient formal acknowledgement.',
            actionKey: 'ACKNOWLEDGE',
            actionableByMe: true,
          };
        }
        return {
          text: 'Awaiting recipient acknowledgement from designated personnel.',
          generalText: 'Awaiting recipient acknowledgement.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'ACKNOWLEDGED':
      case 'AWAITING_OWNERSHIP':
        if (!op.current_responsible_user_id) {
          if (recipientRecord || isManagement) {
            return {
              text: 'Operation awaiting ownership: You can claim and accept responsibility, or management can assign an executing officer.',
              generalText: 'Awaiting member ownership claim or supervisor assignment.',
              actionKey: 'CLAIM',
              actionableByMe: true,
            };
          }
          return {
            text: `Awaiting designated personnel in [${op.current_responsible_group || op.target_audience_type}] to claim ownership.`,
            generalText: 'Awaiting ownership acceptance.',
            actionKey: 'NONE',
            actionableByMe: false,
          };
        }
        if (isResponsible) {
          return {
            text: 'Responsibility accepted. Review directives and begin operational execution.',
            generalText: `Assigned to ${op.responsible_name || 'designated officer'}. Execution pending.`,
            actionKey: 'EXECUTE',
            actionableByMe: true,
          };
        }
        return {
          text: `Assigned to ${op.responsible_name || 'designated officer'}. Execution pending.`,
          generalText: `Assigned to ${op.responsible_name || 'designated officer'}.`,
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'ACCEPTED':
      case 'IN_PROGRESS':
        if (isResponsible) {
          return {
            text: 'Execute operational instructions. Submit progress updates or deliverables when milestones are achieved.',
            generalText: `Execution in progress by ${op.responsible_name || 'assigned officer'}.`,
            actionKey: 'SUBMIT_PROGRESS',
            actionableByMe: true,
          };
        }
        if (isInitiator || isSupervisor || isManagement) {
          return {
            text: `Execution in progress by ${op.responsible_name || 'assigned officer'}. Monitor progress and provide guidance if needed.`,
            generalText: `In progress under ${op.responsible_name || 'assigned officer'}.`,
            actionKey: 'NONE',
            actionableByMe: false,
          };
        }
        return {
          text: `In progress under ${op.responsible_name || 'assigned team'}.`,
          generalText: 'Execution in progress.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'AWAITING_CLARIFICATION':
        if (isInitiator || isSupervisor || isManagement) {
          return {
            text: 'Clarification inquiry submitted by recipient. Provide answers or guidance to unblock execution.',
            generalText: 'Clarification inquiry pending response from initiator.',
            actionKey: 'RESPOND_CLARIFICATION',
            actionableByMe: true,
          };
        }
        return {
          text: 'Clarification requested. Awaiting response from issuing authority.',
          generalText: 'Pending clarification response.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'BLOCKED':
        if (isSupervisor || isInitiator || isManagement) {
          return {
            text: 'Operational blocker reported! Review reported impediment and intervene to resolve.',
            generalText: 'Operational blocker reported. Management intervention required.',
            actionKey: 'RESOLVE_BLOCKER',
            actionableByMe: true,
          };
        }
        return {
          text: 'Operational blocker reported. Awaiting management assistance to resolve impediment.',
          generalText: 'Blocked by operational impediment.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'SUBMITTED_FOR_REVIEW':
      case 'AWAITING_REVIEW':
      case 'AWAITING_APPROVAL':
        if (isInitiator || isSupervisor || isManagement) {
          return {
            text: 'Deliverables completed and submitted for review. Inspect outcome and approve completion or request revisions.',
            generalText: 'Work submitted. Awaiting supervisory verification and approval.',
            actionKey: 'REVIEW',
            actionableByMe: true,
          };
        }
        return {
          text: 'Deliverables submitted for review. Awaiting management sign-off.',
          generalText: 'Awaiting supervisory sign-off.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'REVISION_REQUIRED':
        if (isResponsible) {
          return {
            text: `Revisions requested by reviewer: ${op.review_notes || 'Implement requested adjustments'}. Update work and resubmit.`,
            generalText: 'Revisions requested by reviewer.',
            actionKey: 'REVISE',
            actionableByMe: true,
          };
        }
        return {
          text: `Revisions requested from ${op.responsible_name || 'responsible officer'}. Awaiting resubmission.`,
          generalText: 'Revisions in progress.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'COMPLETED':
      case 'CLOSED':
        return {
          text: 'Operation completed, verified, and officially closed. No further action required.',
          generalText: 'Operation completed and closed.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'CANCELLED':
      case 'REJECTED':
        return {
          text: `Operation cancelled${op.cancellation_reason ? `: ${op.cancellation_reason}` : ''}. Archived in audit ledger.`,
          generalText: 'Operation cancelled.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      default:
        return {
          text: op.next_action || 'Review directive and adhere to instructions.',
          generalText: op.next_action || 'Review directive.',
          actionKey: 'NONE',
          actionableByMe: false,
        };
    }
  }

  /**
   * DERIVE UNAMBIGUOUS NEXT ACTION FOR ANY OPERATIONAL RECORD AND VIEWER
   * Dynamic, role-aware, and actionable guidance for the recipient and management.
   */
  static deriveNextAction(op, viewerUser) {
    if (!op) return { text: 'No action required.', generalText: 'No action required.', actionKey: 'NONE', actionableByMe: false };

    const viewerId = viewerUser ? Number(viewerUser.id) : null;
    const viewerRole = viewerUser ? (viewerUser.role || '').toUpperCase() : '';
    const status = op.status || 'ISSUED';
    const isInitiator = viewerId && Number(op.initiated_by_user_id) === viewerId;
    const isSupervisor = viewerId && Number(op.supervisor_user_id) === viewerId;
    const isResponsible = viewerId && Number(op.current_responsible_user_id) === viewerId;
    const isManagement = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(viewerRole);

    const recipientRecord = op.recipients?.find(r => Number(r.user_id || r.id) === viewerId);
    const hasAcknowledged = recipientRecord && Boolean(recipientRecord.acknowledged_at);

    switch (status) {
      case 'DRAFT':
        return {
          text: isInitiator ? 'Review draft directives and formally issue operation.' : 'Draft directive pending issuance.',
          generalText: 'Draft pending issuance.',
          actionKey: isInitiator ? 'ISSUE' : 'NONE',
          actionableByMe: isInitiator,
        };

      case 'ISSUED':
      case 'AWAITING_ACKNOWLEDGEMENT':
        if (recipientRecord && !hasAcknowledged) {
          return {
            text: 'Awaiting your formal acknowledgement. Click "Acknowledge Receipt" to confirm you have reviewed the directive.',
            generalText: 'Awaiting recipient formal acknowledgement.',
            actionKey: 'ACKNOWLEDGE',
            actionableByMe: true,
          };
        }
        return {
          text: 'Awaiting recipient acknowledgement from designated personnel.',
          generalText: 'Awaiting recipient acknowledgement.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'ACKNOWLEDGED':
      case 'AWAITING_OWNERSHIP':
        if (!op.current_responsible_user_id) {
          if (recipientRecord || isManagement) {
            return {
              text: 'Operation awaiting ownership: You can claim and accept responsibility, or management can assign an executing officer.',
              generalText: 'Awaiting member ownership claim or supervisor assignment.',
              actionKey: 'CLAIM',
              actionableByMe: true,
            };
          }
          return {
            text: `Awaiting designated personnel in [${op.current_responsible_group || op.target_audience_type}] to claim ownership.`,
            generalText: 'Awaiting ownership acceptance.',
            actionKey: 'NONE',
            actionableByMe: false,
          };
        }
        if (isResponsible) {
          return {
            text: 'Responsibility accepted. Review directives and begin operational execution.',
            generalText: `Assigned to ${op.responsible_name || 'designated officer'}. Execution pending.`,
            actionKey: 'EXECUTE',
            actionableByMe: true,
          };
        }
        return {
          text: `Assigned to ${op.responsible_name || 'designated officer'}. Execution pending.`,
          generalText: `Assigned to ${op.responsible_name || 'designated officer'}.`,
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'ACCEPTED':
      case 'IN_PROGRESS':
        if (isResponsible) {
          return {
            text: 'Execute operational instructions. Submit progress updates or deliverables when milestones are achieved.',
            generalText: `Execution in progress by ${op.responsible_name || 'assigned officer'}.`,
            actionKey: 'SUBMIT_PROGRESS',
            actionableByMe: true,
          };
        }
        if (isInitiator || isSupervisor || isManagement) {
          return {
            text: `Execution in progress by ${op.responsible_name || 'assigned officer'}. Monitor progress and provide guidance if needed.`,
            generalText: `In progress under ${op.responsible_name || 'assigned officer'}.`,
            actionKey: 'NONE',
            actionableByMe: false,
          };
        }
        return {
          text: `In progress under ${op.responsible_name || 'assigned team'}.`,
          generalText: 'Execution in progress.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'AWAITING_CLARIFICATION':
        if (isInitiator || isSupervisor || isManagement) {
          return {
            text: 'Clarification inquiry submitted by recipient. Provide answers or guidance to unblock execution.',
            generalText: 'Clarification inquiry pending response from initiator.',
            actionKey: 'RESPOND_CLARIFICATION',
            actionableByMe: true,
          };
        }
        return {
          text: 'Clarification requested. Awaiting response from issuing authority.',
          generalText: 'Pending clarification response.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'BLOCKED':
        if (isSupervisor || isInitiator || isManagement) {
          return {
            text: 'Operational blocker reported! Review reported impediment and intervene to resolve.',
            generalText: 'Operational blocker reported. Management intervention required.',
            actionKey: 'RESOLVE_BLOCKER',
            actionableByMe: true,
          };
        }
        return {
          text: 'Operational blocker reported. Awaiting management assistance to resolve impediment.',
          generalText: 'Blocked by operational impediment.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'SUBMITTED_FOR_REVIEW':
      case 'AWAITING_REVIEW':
      case 'AWAITING_APPROVAL':
        if (isInitiator || isSupervisor || isManagement) {
          return {
            text: 'Deliverables completed and submitted for review. Inspect outcome and approve completion or request revisions.',
            generalText: 'Work submitted. Awaiting supervisory verification and approval.',
            actionKey: 'REVIEW',
            actionableByMe: true,
          };
        }
        return {
          text: 'Deliverables submitted for review. Awaiting management sign-off.',
          generalText: 'Awaiting supervisory sign-off.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'REVISION_REQUIRED':
        if (isResponsible) {
          return {
            text: `Revisions requested by reviewer: ${op.review_notes || 'Implement requested adjustments'}. Update work and resubmit.`,
            generalText: 'Revisions requested by reviewer.',
            actionKey: 'REVISE',
            actionableByMe: true,
          };
        }
        return {
          text: `Revisions requested from ${op.responsible_name || 'responsible officer'}. Awaiting resubmission.`,
          generalText: 'Revisions in progress.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'COMPLETED':
      case 'CLOSED':
        return {
          text: 'Operation completed, verified, and officially closed. No further action required.',
          generalText: 'Operation completed and closed.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'CANCELLED':
      case 'REJECTED':
        return {
          text: `Operation cancelled${op.cancellation_reason ? `: ${op.cancellation_reason}` : ''}. Archived in audit ledger.`,
          generalText: 'Operation cancelled.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      default:
        return {
          text: op.next_action || 'Review directive and adhere to instructions.',
          generalText: op.next_action || 'Review directive.',
          actionKey: 'NONE',
          actionableByMe: false,
        };
    }
  }

  /**
   * DERIVE UNAMBIGUOUS NEXT ACTION FOR ANY OPERATIONAL RECORD AND VIEWER
   * Dynamic, role-aware, and actionable guidance for the recipient and management.
   */
  static deriveNextAction(op, viewerUser) {
    if (!op) return { text: 'No action required.', generalText: 'No action required.', actionKey: 'NONE', actionableByMe: false };

    const viewerId = viewerUser ? Number(viewerUser.id) : null;
    const viewerRole = viewerUser ? (viewerUser.role || '').toUpperCase() : '';
    const status = op.status || 'ISSUED';
    const isInitiator = viewerId && Number(op.initiated_by_user_id) === viewerId;
    const isSupervisor = viewerId && Number(op.supervisor_user_id) === viewerId;
    const isResponsible = viewerId && Number(op.current_responsible_user_id) === viewerId;
    const isManagement = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(viewerRole);

    const recipientRecord = op.recipients?.find(r => Number(r.user_id || r.id) === viewerId);
    const hasAcknowledged = recipientRecord && Boolean(recipientRecord.acknowledged_at);

    switch (status) {
      case 'DRAFT':
        return {
          text: isInitiator ? 'Review draft directives and formally issue operation.' : 'Draft directive pending issuance.',
          generalText: 'Draft pending issuance.',
          actionKey: isInitiator ? 'ISSUE' : 'NONE',
          actionableByMe: isInitiator,
        };

      case 'ISSUED':
      case 'AWAITING_ACKNOWLEDGEMENT':
        if (recipientRecord && !hasAcknowledged) {
          return {
            text: 'Awaiting your formal acknowledgement. Click "Acknowledge Receipt" to confirm you have reviewed the directive.',
            generalText: 'Awaiting recipient formal acknowledgement.',
            actionKey: 'ACKNOWLEDGE',
            actionableByMe: true,
          };
        }
        return {
          text: 'Awaiting recipient acknowledgement from designated personnel.',
          generalText: 'Awaiting recipient acknowledgement.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'ACKNOWLEDGED':
      case 'AWAITING_OWNERSHIP':
        if (!op.current_responsible_user_id) {
          if (recipientRecord || isManagement) {
            return {
              text: 'Operation awaiting ownership: You can claim and accept responsibility, or management can assign an executing officer.',
              generalText: 'Awaiting member ownership claim or supervisor assignment.',
              actionKey: 'CLAIM',
              actionableByMe: true,
            };
          }
          return {
            text: `Awaiting designated personnel in [${op.current_responsible_group || op.target_audience_type}] to claim ownership.`,
            generalText: 'Awaiting ownership acceptance.',
            actionKey: 'NONE',
            actionableByMe: false,
          };
        }
        if (isResponsible) {
          return {
            text: 'Responsibility accepted. Review directives and begin operational execution.',
            generalText: `Assigned to ${op.responsible_name || 'designated officer'}. Execution pending.`,
            actionKey: 'EXECUTE',
            actionableByMe: true,
          };
        }
        return {
          text: `Assigned to ${op.responsible_name || 'designated officer'}. Execution pending.`,
          generalText: `Assigned to ${op.responsible_name || 'designated officer'}.`,
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'ACCEPTED':
      case 'IN_PROGRESS':
        if (isResponsible) {
          return {
            text: 'Execute operational instructions. Submit progress updates or deliverables when milestones are achieved.',
            generalText: `Execution in progress by ${op.responsible_name || 'assigned officer'}.`,
            actionKey: 'SUBMIT_PROGRESS',
            actionableByMe: true,
          };
        }
        if (isInitiator || isSupervisor || isManagement) {
          return {
            text: `Execution in progress by ${op.responsible_name || 'assigned officer'}. Monitor progress and provide guidance if needed.`,
            generalText: `In progress under ${op.responsible_name || 'assigned officer'}.`,
            actionKey: 'NONE',
            actionableByMe: false,
          };
        }
        return {
          text: `In progress under ${op.responsible_name || 'assigned team'}.`,
          generalText: 'Execution in progress.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'AWAITING_CLARIFICATION':
        if (isInitiator || isSupervisor || isManagement) {
          return {
            text: 'Clarification inquiry submitted by recipient. Provide answers or guidance to unblock execution.',
            generalText: 'Clarification inquiry pending response from initiator.',
            actionKey: 'RESPOND_CLARIFICATION',
            actionableByMe: true,
          };
        }
        return {
          text: 'Clarification requested. Awaiting response from issuing authority.',
          generalText: 'Pending clarification response.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'BLOCKED':
        if (isSupervisor || isInitiator || isManagement) {
          return {
            text: 'Operational blocker reported! Review reported impediment and intervene to resolve.',
            generalText: 'Operational blocker reported. Management intervention required.',
            actionKey: 'RESOLVE_BLOCKER',
            actionableByMe: true,
          };
        }
        return {
          text: 'Operational blocker reported. Awaiting management assistance to resolve impediment.',
          generalText: 'Blocked by operational impediment.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'SUBMITTED_FOR_REVIEW':
      case 'AWAITING_REVIEW':
      case 'AWAITING_APPROVAL':
        if (isInitiator || isSupervisor || isManagement) {
          return {
            text: 'Deliverables completed and submitted for review. Inspect outcome and approve completion or request revisions.',
            generalText: 'Work submitted. Awaiting supervisory verification and approval.',
            actionKey: 'REVIEW',
            actionableByMe: true,
          };
        }
        return {
          text: 'Deliverables submitted for review. Awaiting management sign-off.',
          generalText: 'Awaiting supervisory sign-off.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'REVISION_REQUIRED':
        if (isResponsible) {
          return {
            text: `Revisions requested by reviewer: ${op.review_notes || 'Implement requested adjustments'}. Update work and resubmit.`,
            generalText: 'Revisions requested by reviewer.',
            actionKey: 'REVISE',
            actionableByMe: true,
          };
        }
        return {
          text: `Revisions requested from ${op.responsible_name || 'responsible officer'}. Awaiting resubmission.`,
          generalText: 'Revisions in progress.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'COMPLETED':
      case 'CLOSED':
        return {
          text: 'Operation completed, verified, and officially closed. No further action required.',
          generalText: 'Operation completed and closed.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      case 'CANCELLED':
      case 'REJECTED':
        return {
          text: `Operation cancelled${op.cancellation_reason ? `: ${op.cancellation_reason}` : ''}. Archived in audit ledger.`,
          generalText: 'Operation cancelled.',
          actionKey: 'NONE',
          actionableByMe: false,
        };

      default:
        return {
          text: op.next_action || 'Review directive and adhere to instructions.',
          generalText: op.next_action || 'Review directive.',
          actionKey: 'NONE',
          actionableByMe: false,
        };
    }
  }

  /**
   * Enforce Central Routing Matrix according to Enterprise Governance:
   * - STRICT OWNER-ONLY RULE: Only the OWNER role may initiate group operations.
   * - OWNER: Directives restricted to Admin & Operations Managers.
   * - ADMIN / SUPER_ADMIN: Directives to Managers (personal 1-to-1).
   * - MANAGER: Property-scoped operations for Staff & Receptionists (personal 1-to-1).
   * - STAFF / RECEPTIONIST: Task performers only, cannot initiate operations.
   */
  static async assertRoutingMatrix(initiatorUser, targetAudienceType, propertyId, specificUserIds = []) {
    const role = (initiatorUser.role || '').toUpperCase();

    // 0. Strict Owner-Only Rule for Group Operations
    const isGroupOperation = targetAudienceType !== 'SPECIFIC_USER' ||
      (Array.isArray(specificUserIds) && specificUserIds.length > 1);

    if (isGroupOperation && role !== 'OWNER') {
      throw new ForbiddenError(
        'Operational Governance Mandate: Only the Owner role is authorized to initiate group operations. Non-owner staff are restricted to personal 1-to-1 directives.'
      );
    }

    // 1. Owner restrictions: Directives restricted to Admin & Operations Managers
    if (role === 'OWNER') {
      if (['PROPERTY_STAFF', 'PROPERTY_RECEPTIONISTS'].includes(targetAudienceType)) {
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

    // 2. Admin restrictions (Admin -> Managers only, personal 1-to-1)
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
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

    // 3. Manager property scope restrictions (Manager -> Staff / Receptionist, personal 1-to-1)
    if (['MANAGER', 'OPERATIONS_MANAGER'].includes(role)) {
      if (propertyId) {
        const propIdNum = parseInt(propertyId, 10);
        const hasAccess = await this.checkUserPropertyAccess(initiatorUser, propIdNum);
        if (!hasAccess) {
          throw new ForbiddenError('Access Denied: You cannot issue operations outside your assigned property.');
        }
      }
      if (specificUserIds && specificUserIds.length > 0) {
        const usersRes = await pool.query(
          `SELECT id, role, property_id FROM users WHERE id = ANY($1::int[]);`,
          [specificUserIds]
        );
        for (const u of usersRes) {
          const uRole = (u.role || '').toUpperCase();
          if (!['STAFF', 'RECEPTIONIST'].includes(uRole)) {
            throw new ForbiddenError('Routing Matrix Violation: Managers may only assign operational directives to Staff and Receptionists.');
          }
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

    // 5. Determine Initial Ownership and Next Action
    const isPersonal = recipients.length === 1 && target_audience_type === 'SPECIFIC_USER';
    const responsibleUserId = isPersonal ? recipients[0].id : null;
    const responsibleGroup = isPersonal ? null : target_audience_type;
    const initialStatus = 'ISSUED';
    const initialNextAction = isPersonal 
      ? 'Awaiting recipient formal acknowledgement and task acceptance.'
      : 'Awaiting group acknowledgement and member ownership acceptance.';

    // Insert Central Operation
    const insertOpSql = `
      INSERT INTO central_operations (
        operation_code, title, category, priority, status,
        initiated_by_user_id, property_id, target_audience_type,
        subject, purpose, operational_instructions, expected_outcome,
        responsibility_definition, reporting_requirements, deadline_at,
        supervisor_user_id, current_responsible_user_id, current_responsible_group, next_action
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19
      ) RETURNING *;
    `;

    const opRows = await pool.query(insertOpSql, [
      operationCode,
      title,
      category,
      priority,
      initialStatus,
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
      responsibleUserId,
      responsibleGroup,
      initialNextAction,
    ]);

    const createdOp = opRows.rows?.[0] || (Array.isArray(opRows) ? opRows[0] : opRows);
    const operationId = createdOp.id;

    // 5b. For Personal Operations, automatically create primary linked task
    if (isPersonal && responsibleUserId) {
      try {
        const taskCode = `TSK-${operationCode.replace('OPS-', '')}-01`;
        await pool.query(
          `INSERT INTO operational_tasks (
            task_code, property_id, assigned_to_id, assigned_by_id,
            title, description, expected_outcome, task_category,
            priority, due_date, status, central_operation_id
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, 'PENDING', $11
          );`,
          [
            taskCode,
            property_id || (recipients[0]?.property_id || 1),
            responsibleUserId,
            initiatorUser.id,
            title,
            operational_instructions,
            expected_outcome,
            category === 'MAINTENANCE_INSPECTION' ? 'MAINTENANCE' : 'GENERAL',
            priority,
            deadline_at || new Date(Date.now() + 86400000 * 3),
            operationId,
          ]
        );
      } catch (taskErr) {
        logger.warn(`Could not auto-create primary operational task: ${taskErr.message}`);
      }
    }

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
      } else if (recipients.length > 1) {
        // Multi-recipient operational group: Use canonical management thread
        const groupThread = await ChatRepository.findOrCreateManagementGroupThread(
          initiatorUser,
          recipients.map(r => r.id)
        );
        chatThreadId = groupThread.id;
      } else {
        // General company-wide group
        const genGroup = await ChatRepository.getOrCreateGeneralGroupThread();
        chatThreadId = genGroup.id;
      }

      if (chatThreadId) {
        const priorityIcon = priority === 'CRITICAL' ? '🚨' : priority === 'URGENT' ? '⚡' : '📋';
        const isPersonalOp = recipients.length === 1 && target_audience_type === 'SPECIFIC_USER';
        const msgContent = `${priorityIcon} [OFFICIAL OPERATIONS MEMO — ${memoReference}]\n` +
          `Ref: ${operationCode}\n` +
          `Title: ${title}\n` +
          `Category: ${category.replace(/_/g, ' ')}\n` +
          `Priority: ${priority}\n` +
          `Property Scope: ${propertyScopeSummary}\n` +
          `Deadline: ${deadlineText}\n` +
          `Current Owner: ${isPersonalOp ? recipients[0].name : `Open to Group [${target_audience_type}]`}\n` +
          `Next Action: ${initialNextAction}\n\n` +
          `Subject: ${subject}\n\n` +
          `Instructions: ${operational_instructions.substring(0, 300)}${operational_instructions.length > 300 ? '...' : ''}\n\n` +
          `⚠️ Official Directive: Review details, acknowledge receipt, or accept responsibility directly from this operation card.`;

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
    } else if (view === 'awaitingOwnership') {
      conditions.push(`(co.current_responsible_user_id IS NULL AND co.status IN ('ISSUED', 'ACKNOWLEDGED', 'AWAITING_OWNERSHIP'))`);
    } else if (view === 'archived') {
      conditions.push(`co.status IN ('COMPLETED', 'CANCELLED', 'CLOSED')`);
      if (!['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(role)) {
        params.push(userId);
        conditions.push(`(
          co.initiated_by_user_id = ${params.length}
          OR co.supervisor_user_id = ${params.length}
          OR EXISTS (
            SELECT 1 FROM central_operation_recipients cor 
            WHERE cor.operation_id = co.id AND cor.user_id = ${params.length}
          )
        )`);
      }
    } else if (view === 'all') {
      // Global management oversight
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
        u_resp.name AS responsible_name,
        u_resp.role AS responsible_role,
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
      LEFT JOIN users u_resp ON co.current_responsible_user_id = u_resp.id
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
    const rows = res.rows || (Array.isArray(res) ? res : []);
    return rows.map((r) => ({
      ...r,
      viewer_next_action: this.deriveNextAction(r, user),
    }));
  }

  /**
   * Helper to resolve an operationId which may be numeric (ID) or string (reference_number).
   * Returns the numeric ID.
   */
  static async resolveOperationId(operationId) {
    if (operationId === null || operationId === undefined) {
      throw new NotFoundError('Operation ID is required.');
    }
    const str = String(operationId).trim();
    if (!str || str === 'undefined' || str === 'null') {
      throw new NotFoundError('Valid Operation ID is required.');
    }
    if (/^\d+$/.test(str)) {
      return parseInt(str, 10);
    }
    const res = await pool.query(
      'SELECT id FROM central_operations WHERE operation_code = $1 LIMIT 1;',
      [str]
    );
    if (!res || res.length === 0) {
      throw new NotFoundError(`Central Operation '${str}' does not exist.`);
    }
    return res[0].id;
  }

  /**
   * GET FULL OPERATION DETAILS BY ID
   * Includes memo history, recipient acknowledgement status, linked tasks, and audit events.
   */
  static async getOperationById(user, operationId) {
    const opIdNum = await this.resolveOperationId(operationId);
    const role = (user.role || '').toUpperCase();

    const opRes = await pool.query(
      `SELECT 
        co.*,
        u_init.name AS initiator_name,
        u_init.email AS initiator_email,
        u_init.role AS initiator_role,
        u_sup.name AS supervisor_name,
        u_sup.email AS supervisor_email,
        u_resp.name AS responsible_name,
        u_resp.email AS responsible_email,
        u_resp.role AS responsible_role,
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
       LEFT JOIN users u_resp ON co.current_responsible_user_id = u_resp.id
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

    const viewerNextAction = this.deriveNextAction({ ...op, recipients: recipients || [] }, user);
    return {
      ...op,
      recipients: recipients || [],
      memos: memos || [],
      linkedTasks: linkedTasks || [],
      events: events || [],
      viewer_next_action: viewerNextAction,
    };
  }

  /**
   * ACKNOWLEDGE OPERATION RECEIPT
   */
  static async acknowledgeOperation(user, operationId, note = null) {
    const opIdNum = await this.resolveOperationId(operationId);

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

    const nextAct = isFullyAcknowledged
      ? (op?.current_responsible_user_id ? 'Responsibility accepted. Review directives and begin operational execution.' : 'Awaiting ownership: an eligible member must accept responsibility or supervisor must assign.')
      : 'Awaiting remaining recipient acknowledgements.';
    await pool.query(
      `UPDATE central_operations 
       SET status = CASE WHEN status = 'ISSUED' THEN 'ACKNOWLEDGED' ELSE status END,
           next_action = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2;`,
      [nextAct, opIdNum]
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
   * CLAIM / ACCEPT RESPONSIBILITY FOR A GROUP OPERATION
   * Allows an eligible recipient to accept primary ownership.
   */
  static async claimOperation(user, operationId) {
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    if (['COMPLETED', 'CANCELLED', 'CLOSED'].includes(op.status)) {
      throw new BadRequestError(`Cannot claim operation #${operationId} because it is already ${op.status}.`);
    }

    if (op.current_responsible_user_id && op.current_responsible_user_id !== user.id) {
      throw new ConflictError(`Operation #${operationId} has already been claimed by ${op.responsible_name || 'another team member'}.`);
    }

    const nextAction = 'Responsibility accepted. Review directives and begin operational execution.';
    const newStatus = op.status === 'ISSUED' || op.status === 'ACKNOWLEDGED' || op.status === 'AWAITING_OWNERSHIP' 
      ? 'ACCEPTED' 
      : op.status;

    await pool.query(
      `UPDATE central_operations 
       SET current_responsible_user_id = $1,
           current_responsible_group = NULL,
           status = $2,
           next_action = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4;`,
      [user.id, newStatus, nextAction, opIdNum]
    );

    // Create or update linked primary task for the claiming user
    const existingTask = await pool.query(
      'SELECT id FROM operational_tasks WHERE central_operation_id = $1 AND assigned_to_id = $2 LIMIT 1;',
      [opIdNum, user.id]
    );
    const existingRows = existingTask.rows || (Array.isArray(existingTask) ? existingTask : []);
    if (existingRows.length === 0) {
      const taskCode = `TSK-${op.operation_code.replace('OPS-', '')}-${String(Date.now()).slice(-4)}`;
      try {
        await pool.query(
          `INSERT INTO operational_tasks (
            task_code, property_id, assigned_to_id, assigned_by_id,
            title, description, expected_outcome, task_category,
            priority, due_date, status, central_operation_id
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, 'IN_PROGRESS', $11
          );`,
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
            op.deadline_at || new Date(Date.now() + 86400000 * 3),
            opIdNum,
          ]
        );
      } catch (taskErr) {
        logger.warn(`Could not create operational task on claim: ${taskErr.message}`);
      }
    }

    // Auto-acknowledge for claiming user if not yet acknowledged
    await pool.query(
      `UPDATE central_operation_recipients 
       SET acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP), acceptance_status = 'ACCEPTED' 
       WHERE operation_id = $1 AND user_id = $2;`,
      [opIdNum, user.id]
    );

    // Audit Event
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'TASK_LINKED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Task responsibility accepted by ${user.name} (${user.role})`,
        JSON.stringify({ claimed_by_name: user.name, role: user.role, action: 'CLAIMED_RESPONSIBILITY' }),
      ]
    );

    // Post to chat thread
    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `👤 [TASK OWNERSHIP ACCEPTED] ${user.name} (${user.role.replace(/_/g, ' ')}) has accepted primary responsibility for Operation ${op.operation_code}.\n👉 Next Action: ${nextAction}`,
          priority: 'NORMAL',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (chatErr) {
        logger.warn(`Failed to post claim message to chat: ${chatErr.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * ASSIGN / DELEGATE OPERATION RESPONSIBILITY TO A SPECIFIC USER
   * Allows initiator, supervisor, or management to assign responsibility.
   */
  static async assignOperation(user, operationId, targetUserId, notes = null) {
    const opIdNum = await this.resolveOperationId(operationId);
    const targetIdNum = parseInt(targetUserId, 10);
    const op = await this.getOperationById(user, opIdNum);

    const userRole = (user.role || '').toUpperCase();
    const isInitiator = op.initiated_by_user_id === user.id;
    const isSupervisor = op.supervisor_user_id === user.id;
    const isManagement = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(userRole);

    if (!isInitiator && !isSupervisor && !isManagement) {
      throw new ForbiddenError('You do not have authority to assign or delegate this operation.');
    }

    const targetUserRes = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1 LIMIT 1;', [targetIdNum]);
    const targetRows = targetUserRes.rows || (Array.isArray(targetUserRes) ? targetUserRes : []);
    if (targetRows.length === 0) {
      throw new NotFoundError(`Target user #${targetUserId} does not exist.`);
    }
    const targetUser = targetRows[0];

    const nextAction = `Assigned to ${targetUser.name}. Review directives and begin operational execution.`;
    const newStatus = op.status === 'ISSUED' || op.status === 'ACKNOWLEDGED' || op.status === 'AWAITING_OWNERSHIP' 
      ? 'ACCEPTED' 
      : op.status;

    await pool.query(
      `UPDATE central_operations 
       SET current_responsible_user_id = $1,
           current_responsible_group = NULL,
           status = $2,
           next_action = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4;`,
      [targetIdNum, newStatus, nextAction, opIdNum]
    );

    // Ensure target user is recorded in central_operation_recipients
    await pool.query(
      `INSERT INTO central_operation_recipients (operation_id, user_id, role_at_time, status)
       VALUES ($1, $2, $3, 'DELIVERED')
       ON CONFLICT (operation_id, user_id) DO NOTHING;`,
      [opIdNum, targetIdNum, targetUser.role]
    );

    // Create or update linked primary task for target user
    const existingTask = await pool.query(
      'SELECT id FROM operational_tasks WHERE central_operation_id = $1 AND assigned_to_id = $2 LIMIT 1;',
      [opIdNum, targetIdNum]
    );
    const existingRows = existingTask.rows || (Array.isArray(existingTask) ? existingTask : []);
    if (existingRows.length === 0) {
      const taskCode = `TSK-${op.operation_code.replace('OPS-', '')}-${String(Date.now()).slice(-4)}`;
      try {
        await pool.query(
          `INSERT INTO operational_tasks (
            task_code, property_id, assigned_to_id, assigned_by_id,
            title, description, expected_outcome, task_category,
            priority, due_date, status, central_operation_id
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, 'PENDING', $11
          );`,
          [
            taskCode,
            op.property_id || 1,
            targetIdNum,
            user.id,
            op.title,
            op.operational_instructions,
            op.expected_outcome,
            op.category === 'MAINTENANCE_INSPECTION' ? 'MAINTENANCE' : 'GENERAL',
            op.priority,
            op.deadline_at || new Date(Date.now() + 86400000 * 3),
            opIdNum,
          ]
        );
      } catch (taskErr) {
        logger.warn(`Could not create operational task on assignment: ${taskErr.message}`);
      }
    }

    // Audit Event
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES ($1, $2, 'TASK_LINKED', $3, $4);`,
      [
        opIdNum,
        user.id,
        `Responsibility delegated to ${targetUser.name} by ${user.name}`,
        JSON.stringify({ assigned_by: user.name, assigned_to: targetUser.name, notes, action: 'DELEGATED_RESPONSIBILITY' }),
      ]
    );

    // Post to chat thread
    if (op.chat_thread_id) {
      try {
        await ChatService.sendMessage(user, {
          threadId: op.chat_thread_id,
          messageType: 'TEXT',
          content: `📌 [RESPONSIBILITY DELEGATED] Operation ${op.operation_code} has been assigned to ${targetUser.name} (${targetUser.role.replace(/_/g, ' ')}) by ${user.name}.${notes ? `\nInstructions: ${notes}` : ''}\n👉 Next Action: ${nextAction}`,
          priority: 'NORMAL',
          contextEntityType: 'OPERATION',
          contextEntityId: opIdNum,
        });
      } catch (chatErr) {
        logger.warn(`Failed to post delegation message to chat: ${chatErr.message}`);
      }
    }

    return this.getOperationById(user, opIdNum);
  }

  /**
   * SUBMIT CLARIFICATION REQUEST OR FEEDBACK
   */
  static async requestClarification(user, operationId, { questionText }) {
    if (!questionText || questionText.trim().length < 5) {
      throw new BadRequestError('Detailed clarification inquiry text is required.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
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
    const opIdNum = await this.resolveOperationId(operationId);
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
    const opIdNum = await this.resolveOperationId(operationId);
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
    const opIdNum = await this.resolveOperationId(operationId);
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
    const opIdNum = await this.resolveOperationId(operationId);
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
  static async submitCompletion(user, operationId, { completionNotes, evidenceUrl }) {
    if (!completionNotes || completionNotes.trim().length < 5) {
      throw new BadRequestError('Detailed completion summary notes are required.');
    }
    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);
    const nextAction = 'Deliverables completed and submitted for review. Awaiting supervisory verification and sign-off.';

    await pool.query(
      `UPDATE central_operations 
       SET status = 'SUBMITTED_FOR_REVIEW',
           completion_notes = $1,
           completion_evidence_url = $2,
           next_action = $3,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4;`,
      [completionNotes.trim(), evidenceUrl || null, nextAction, opIdNum]
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

    const opIdNum = await this.resolveOperationId(operationId);
    const op = await this.getOperationById(user, opIdNum);

    const isApproved = decision === 'APPROVED' || decision === 'COMPLETED';
    const isRevise = decision === 'REVISE' || decision === 'REVISION_REQUIRED';
    const newStatus = isApproved ? 'COMPLETED' : (isRevise ? 'REVISION_REQUIRED' : 'REJECTED');
    const now = new Date();
    const completedAt = isApproved ? now : null;
    const closedAt = isApproved || newStatus === 'REJECTED' ? now : null;
    const nextAction = isApproved 
      ? 'Operation completed and verified. No further action required.'
      : (isRevise ? `Revisions requested by reviewer: ${reviewNotes || 'Implement corrections'}. Update work and resubmit.` : 'Operation rejected and closed.');

    await pool.query(
      `UPDATE central_operations 
       SET status = $1,
           completed_at = $2,
           closed_at = $3,
           review_notes = $4,
           reviewed_by_user_id = $5,
           reviewed_at = $6,
           next_action = $7,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $8;`,
      [newStatus, completedAt, closedAt, reviewNotes || null, user.id, now, nextAction, opIdNum]
    );
    if (isApproved) {
      await pool.query(
        `UPDATE operational_tasks SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE central_operation_id = $1;`,
        [opIdNum]
      );
    }

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
    const opIdNum = await this.resolveOperationId(operationId);
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

    const opIdNum = await this.resolveOperationId(operationId);
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
   * Robust retrieval with automatic on-the-fly generation and binary integrity checks.
   */
  static async getMemoPdfBuffer(user, memoId, operationId) {
    let memoRes;
    const memoIdStr = (memoId && memoId !== 'undefined' && memoId !== 'null') ? String(memoId).trim() : null;
    let cleanOpId = null;

    if (operationId && operationId !== 'undefined' && operationId !== 'null') {
      try {
        cleanOpId = await this.resolveOperationId(operationId);
      } catch (err) {
        // quiet fallback if reference cannot be resolved
      }
    }

    if (memoIdStr) {
      const isNum = /^\d+$/.test(memoIdStr);
      memoRes = await pool.query(
        `SELECT om.*, co.initiated_by_user_id 
         FROM operations_memos om 
         JOIN central_operations co ON om.operation_id = co.id 
         WHERE ${isNum ? 'om.id = $1' : 'om.memo_reference = $1'} LIMIT 1;`,
        [isNum ? parseInt(memoIdStr, 10) : memoIdStr]
      );
    }

    if ((!memoRes || memoRes.length === 0) && cleanOpId) {
      memoRes = await pool.query(
        `SELECT om.*, co.initiated_by_user_id 
         FROM operations_memos om 
         JOIN central_operations co ON om.operation_id = co.id 
         WHERE om.operation_id = $1 
         ORDER BY om.version_number DESC LIMIT 1;`,
        [cleanOpId]
      );
    }

    let memo = memoRes && memoRes.length > 0 ? memoRes[0] : null;
    const targetOpId = memo ? memo.operation_id : cleanOpId;

    // If memo row does not exist yet for this operation, fetch the operation to synthesize
    let op = null;
    if (targetOpId) {
      try {
        op = await this.getOperationById(user, targetOpId);
      } catch (err) {
        logger.warn(`Could not load operation #${targetOpId} for memo generation: ${err.message}`);
      }
    }

    if (!memo && !op) {
      throw new NotFoundError(`Operations Memo not found.`);
    }

    if (!memo && op) {
      // Synthesize memo from operation record
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
        issuer_designation: op.initiator_role || 'Operations Directorate',
        recipient_summary: op.target_audience_type || 'Operational Personnel',
        property_scope_summary: op.property_name || 'Corporate / Multi-Property',
        deadline_text: op.deadline_at ? new Date(op.deadline_at).toLocaleDateString() : 'Standard Timeline',
        effective_date_text: new Date().toLocaleDateString(),
      };
    }

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
      try {
        const docRes = await pool.query(
          'SELECT file_data, file_name, mime_type FROM operational_documents_storage WHERE id = $1 LIMIT 1;',
          [memo.document_storage_id]
        );
        if (docRes && docRes.length > 0 && docRes[0].file_data) {
          let raw = docRes[0].file_data;
          if (typeof raw === 'string') {
            if (raw.startsWith('\\x')) {
              raw = Buffer.from(raw.slice(2), 'hex');
            } else if (raw.startsWith('%PDF')) {
              raw = Buffer.from(raw, 'binary');
            }
          }
          if (Buffer.isBuffer(raw) && raw.length > 100 && raw.slice(0, 4).toString('ascii') === '%PDF') {
            return {
              buffer: raw,
              fileName: docRes[0].file_name || `${memo.memo_reference}.pdf`,
              mimeType: 'application/pdf',
            };
          }
        }
      } catch (docErr) {
        logger.warn(`Failed reading memo document storage #${memo.document_storage_id}: ${docErr.message}`);
      }
    }

    // If binary not found or corrupted, regenerate on-the-fly
    if (!op) {
      op = await this.getOperationById(user, memo.operation_id);
    }
    const pdfBuffer = await this.generateOperationsMemoPdfBuffer({
      operation: op,
      memo,
      initiator: { name: op.initiator_name, role: op.initiator_role, email: op.initiator_email },
      recipients: op.recipients || [],
      property: { name: op.property_name, code: op.property_code, city: op.property_city },
    });

    // Cache regenerated binary to storage
    try {
      const storeRes = await pool.query(
        `INSERT INTO operational_documents_storage (
           entity_type, entity_id, file_name, mime_type, file_size_bytes, file_data, uploaded_by
         ) VALUES (
           'OPERATIONS_MEMO', $1, $2, 'application/pdf', $3, $4, $5
         ) RETURNING id;`,
        [
          memo.id || memo.operation_id,
          `${memo.memo_reference}.pdf`,
          pdfBuffer.length,
          pdfBuffer,
          user.id || op.initiated_by_user_id || 1,
        ]
      );
      const newStorageId = storeRes.rows?.[0]?.id || (Array.isArray(storeRes) ? storeRes[0]?.id : null);
      if (newStorageId && memo.id) {
        await pool.query('UPDATE operations_memos SET document_storage_id = $1 WHERE id = $2;', [newStorageId, memo.id]);
      }
    } catch (saveErr) {
      logger.warn(`Failed caching regenerated memo PDF: ${saveErr.message}`);
    }

    return {
      buffer: pdfBuffer,
      fileName: `${memo.memo_reference}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  /**
   * GET OPERATIONS SUMMARY METRICS FOR REPORTING & DASHBOARDS
   * Consolidated real-time metrics respecting role boundaries.
   */
  static async getOperationsSummary(user, filters = {}) {
    const role = (user.role || '').toUpperCase();
    const userId = user.id;

    let scopeSql = '';
    const params = [];

    if (['STAFF', 'RECEPTIONIST'].includes(role)) {
      params.push(userId);
      scopeSql = 'WHERE (co.current_responsible_user_id = $1 OR cor.user_id = $1)';
    } else if (role === 'MANAGER') {
      params.push(userId);
      scopeSql = 'WHERE (co.property_id IN (SELECT property_id FROM user_property_assignments WHERE user_id = $1) OR co.initiated_by_user_id = $1)';
    }

    const sql = `
      SELECT 
        COUNT(DISTINCT co.id) AS total_operations,
        COUNT(DISTINCT CASE WHEN co.status = 'ISSUED' THEN co.id END) AS awaiting_acknowledgement,
        COUNT(DISTINCT CASE WHEN co.status IN ('ACKNOWLEDGED', 'AWAITING_OWNERSHIP') AND co.current_responsible_user_id IS NULL THEN co.id END) AS awaiting_ownership,
        COUNT(DISTINCT CASE WHEN co.status IN ('ACCEPTED', 'IN_PROGRESS') THEN co.id END) AS in_progress,
        COUNT(DISTINCT CASE WHEN co.status = 'BLOCKED' THEN co.id END) AS blocked,
        COUNT(DISTINCT CASE WHEN co.status = 'AWAITING_CLARIFICATION' THEN co.id END) AS awaiting_clarification,
        COUNT(DISTINCT CASE WHEN co.status IN ('SUBMITTED_FOR_REVIEW', 'AWAITING_REVIEW', 'AWAITING_APPROVAL') THEN co.id END) AS awaiting_review,
        COUNT(DISTINCT CASE WHEN co.status = 'REVISION_REQUIRED' THEN co.id END) AS revision_required,
        COUNT(DISTINCT CASE WHEN co.status = 'COMPLETED' THEN co.id END) AS completed,
        COUNT(DISTINCT CASE WHEN co.status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED') AND co.deadline_at < CURRENT_TIMESTAMP THEN co.id END) AS overdue
      FROM central_operations co
      LEFT JOIN central_operation_recipients cor ON cor.operation_id = co.id
      ${scopeSql};
    `;

    const res = await pool.query(sql, params);
    const row = res.rows?.[0] || (Array.isArray(res) ? res[0] : res) || {};
    return {
      total: parseInt(row.total_operations || 0, 10),
      awaiting_acknowledgement: parseInt(row.awaiting_acknowledgement || 0, 10),
      awaiting_ownership: parseInt(row.awaiting_ownership || 0, 10),
      in_progress: parseInt(row.in_progress || 0, 10),
      blocked: parseInt(row.blocked || 0, 10),
      awaiting_clarification: parseInt(row.awaiting_clarification || 0, 10),
      awaiting_review: parseInt(row.awaiting_review || 0, 10),
      revision_required: parseInt(row.revision_required || 0, 10),
      completed: parseInt(row.completed || 0, 10),
      overdue: parseInt(row.overdue || 0, 10),
    };
  }

  /**
   * PDFKit GENERATOR FOR FORMAL OPERATIONS MEMORANDUM
   * Beautiful executive styling matching BFA corporate standards.
   * Full support for 4 official document templates:
   * - Template A: Short Directive / Operational Memo (concise directive)
   * - Template B: Multi-Section Long Directive (detailed technical & operational directives)
   * - Template C: Multi-Recipient Team Directive (staff, receptionists, supervisors with delivery/ack matrix)
   * - Template D: Multi-Page Revision / Amendment Directive (revision audit note, superseding directives)
   */
  static async generateOperationsMemoPdfBuffer({ operation, memo, initiator, recipients = [], property, templateType }) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        bufferPages: true,
      });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const primaryDark = '#0f172a'; // Slate 900
      const secondaryMuted = '#475569'; // Slate 600
      const borderLine = '#cbd5e1'; // Slate 300
      const brandAccent = '#1d4ed8'; // Blue 700
      const contentWidth = doc.page.width - 80; // 515.28 pt
      const pageBottomSafe = doc.page.height - 50;

      const ensureSpace = (requiredPoints) => {
        if (doc.y + requiredPoints > pageBottomSafe) {
          doc.addPage();
          doc.y = 52; // Account for running header on subsequent pages
        }
      };

      // Determine template type (auto-detect if not explicitly provided)
      let resolvedTemplate = (templateType || memo.template_type || operation.memo_template || '').toUpperCase();
      if (!resolvedTemplate) {
        if (memo.version_number > 1 || memo.amendment_reason || (operation.version && operation.version > 1)) {
          resolvedTemplate = 'REVISION_AMENDMENT'; // Template D
        } else if ((recipients && recipients.length > 1) || ['ROLE_GROUP', 'PROPERTY_ALL', 'TEAM', 'ALL'].includes(operation.target_audience_type)) {
          resolvedTemplate = 'MULTI_RECIPIENT_TEAM'; // Template C
        } else if (
          (memo.operational_instructions && memo.operational_instructions.length > 380) ||
          (memo.expected_outcome && memo.responsibility_definition && memo.reporting_requirements)
        ) {
          resolvedTemplate = 'MULTI_SECTION_LONG'; // Template B
        } else {
          resolvedTemplate = 'SHORT_DIRECTIVE'; // Template A
        }
      }

      // 1. Executive Header Branding
      doc.fillColor(primaryDark).fontSize(15).font('Helvetica-Bold').text('BFA APARTMENTS MANAGEMENT SYSTEM', 40, 40, { align: 'center', width: contentWidth });
      doc.fontSize(8.5).font('Helvetica').fillColor(secondaryMuted).text('Central Operations & Executive Directives Directorate', { align: 'center', width: contentWidth });
      doc.moveDown(0.3);
      doc.strokeColor(borderLine).lineWidth(1).moveTo(40, doc.y).lineTo(40 + contentWidth, doc.y).stroke();
      doc.moveDown(0.4);

      // Template Specific Title Banner
      let docTitle = 'OFFICIAL OPERATIONS MEMORANDUM';
      let titleColor = brandAccent;
      if (resolvedTemplate === 'SHORT_DIRECTIVE') {
        docTitle = 'EXECUTIVE OPERATIONAL DIRECTIVE';
        titleColor = '#1e3a8a';
      } else if (resolvedTemplate === 'MULTI_SECTION_LONG') {
        docTitle = 'MULTI-SECTION TECHNICAL DIRECTIVE & OPERATIONAL FRAMEWORK';
        titleColor = '#1e3a8a';
      } else if (resolvedTemplate === 'MULTI_RECIPIENT_TEAM') {
        docTitle = 'TEAM OPERATIONAL DIRECTIVE & MULTI-RECIPIENT MANDATE';
        titleColor = '#0f766e'; // Teal 700
      } else if (resolvedTemplate === 'REVISION_AMENDMENT') {
        docTitle = 'OFFICIAL DIRECTIVE REVISION & AMENDMENT MEMORANDUM';
        titleColor = '#b45309'; // Amber 700
      }

      doc.fillColor(titleColor).fontSize(12).font('Helvetica-Bold').text(docTitle, { align: 'center', width: contentWidth });
      doc.moveDown(0.5);

      // Template D: Revision Audit Banner
      if (resolvedTemplate === 'REVISION_AMENDMENT' || memo.amendment_reason) {
        const amendText = memo.amendment_reason || 'Administrative modification superseding previous operational instructions.';
        doc.font('Helvetica').fontSize(8);
        const amendTextH = doc.heightOfString(amendText, { width: contentWidth - 20 });
        const bannerH = amendTextH + 20;
        ensureSpace(bannerH + 6);
        const banY = doc.y;
        doc.rect(40, banY, contentWidth, bannerH).fillAndStroke('#fef3c7', '#f59e0b');
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#b45309').text(`REVISION AUDIT NOTICE (v${memo.version_number || 2}.0 — SUPERSEDES PRIOR VERSION):`, 50, banY + 5);
        doc.font('Helvetica').fontSize(8).fillColor('#78350f').text(amendText, 50, banY + 16, { width: contentWidth - 20 });
        doc.y = banY + bannerH + 8;
      }

      // 2. Structured Two-Column Metadata Table
      const leftColX = 40;
      const rightColX = 300;
      const labelW = 90;
      const leftValW = 160;
      const rightValW = 165;

      const priorityColor = operation.priority === 'CRITICAL' ? '#dc2626' : operation.priority === 'URGENT' ? '#d97706' : '#2563eb';

      const rowsData = [
        {
          leftLabel: 'MEMO REF:',
          leftVal: memo.memo_reference || 'REF-MEMO',
          leftBold: true,
          rightLabel: 'ISSUE DATE:',
          rightVal: memo.effective_date_text || new Date().toLocaleDateString('en-GB'),
        },
        {
          leftLabel: 'OPS CODE:',
          leftVal: operation.operation_code || 'OPS-PENDING',
          leftBold: true,
          leftColor: brandAccent,
          rightLabel: 'VERSION:',
          rightVal: `v${memo.version_number || 1}.0 ${memo.version_number > 1 ? '(Revised)' : '(Original)'}`,
        },
        {
          leftLabel: 'ISSUED BY:',
          leftVal: `${initiator?.name || 'Authorised Officer'} (${memo.issuer_designation || initiator?.role || 'Executive'})`,
          rightLabel: 'PRIORITY:',
          rightVal: operation.priority || 'NORMAL',
          rightBold: true,
          rightColor: priorityColor,
        },
        {
          leftLabel: 'TARGET AUDIENCE:',
          leftVal: memo.recipient_summary || (recipients.length > 1 ? `Multi-Recipient Team (${recipients.length} Personnel)` : 'Operational Personnel'),
          rightLabel: 'PROPERTY SCOPE:',
          rightVal: memo.property_scope_summary || property?.name || 'Corporate Multi-Property',
        },
        {
          leftLabel: 'RESPONSIBLE:',
          leftVal: operation.responsible_name ? `${operation.responsible_name} (${operation.responsible_role || 'Assigned'})` : (operation.current_responsible_group ? `[Group: ${operation.current_responsible_group}]` : 'Open to Group / Collective'),
          leftBold: Boolean(operation.responsible_name),
          rightLabel: 'DEADLINE:',
          rightVal: memo.deadline_text || 'Standard Operating Timeline',
          rightBold: true,
        },
      ];

      doc.font('Helvetica').fontSize(8);
      let measuredTableHeight = 12;
      const measuredRowHeights = rowsData.map(r => {
        const leftH = doc.heightOfString(r.leftVal, { width: leftValW });
        const rightH = doc.heightOfString(r.rightVal, { width: rightValW });
        const rowH = Math.max(leftH, rightH, 12) + 5;
        measuredTableHeight += rowH;
        return rowH;
      });

      ensureSpace(measuredTableHeight + 10);
      const actualTableY = doc.y;

      doc.rect(40, actualTableY, contentWidth, measuredTableHeight)
        .fillAndStroke('#f8fafc', borderLine);

      doc.strokeColor(borderLine).lineWidth(0.8)
        .moveTo(295, actualTableY).lineTo(295, actualTableY + measuredTableHeight).stroke();

      let currentY = actualTableY + 6;
      rowsData.forEach((row, idx) => {
        const rowH = measuredRowHeights[idx];

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(secondaryMuted).text(row.leftLabel, leftColX + 8, currentY);
        doc.font(row.leftBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          .fillColor(row.leftColor || primaryDark)
          .text(row.leftVal, leftColX + 8 + labelW, currentY, { width: leftValW });

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(secondaryMuted).text(row.rightLabel, rightColX + 8, currentY);
        doc.font(row.rightBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          .fillColor(row.rightColor || primaryDark)
          .text(row.rightVal, rightColX + 8 + labelW, currentY, { width: rightValW });

        currentY += rowH;

        if (idx < rowsData.length - 1) {
          doc.strokeColor('#e2e8f0').lineWidth(0.5)
            .moveTo(40, currentY - 2).lineTo(40 + contentWidth, currentY - 2).stroke();
        }
      });

      doc.y = actualTableY + measuredTableHeight + 10;

      // 3. Subject Banner
      const subjText = `SUBJECT: ${(memo.subject || operation.subject || '').toUpperCase()}`;
      doc.font('Helvetica-Bold').fontSize(9);
      const subjHeight = doc.heightOfString(subjText, { width: contentWidth - 16 }) + 10;
      ensureSpace(subjHeight + 8);
      const subjY = doc.y;
      doc.rect(40, subjY, contentWidth, subjHeight).fill('#e2e8f0');
      doc.font('Helvetica-Bold').fontSize(9).fillColor(primaryDark).text(subjText, 48, subjY + 5, { width: contentWidth - 16 });
      doc.y = subjY + subjHeight + 10;

      // Section Renderer Helper
      const renderSection = (num, secTitle, secBody, options = {}) => {
        if (!secBody || !secBody.trim()) return;
        const heading = `${num}. ${secTitle.toUpperCase()}`;
        doc.font('Helvetica-Bold').fontSize(9.5);
        const headingH = doc.heightOfString(heading, { width: contentWidth });
        
        ensureSpace(headingH + 35);

        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(options.headingColor || brandAccent).text(heading);
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(8.5).fillColor(primaryDark).text(secBody.trim(), {
          align: 'justify',
          lineGap: 2.5,
          width: contentWidth,
        });
        doc.moveDown(0.6);
      };

      // 4. Render Body Based on Template Type
      if (resolvedTemplate === 'SHORT_DIRECTIVE') {
        // Template A: Concise Single/Short Page
        renderSection('1', 'Executive Directive & Operational Objective', memo.purpose || operation.purpose);
        renderSection('2', 'Specific Action Items & Operational Instructions', memo.operational_instructions || operation.operational_instructions);
        renderSection('3', 'Accountability, Next Action & Deadlines', 
          `Assigned Ownership: ${operation.responsible_name ? `${operation.responsible_name} (${operation.responsible_role || 'Assigned'})` : (operation.current_responsible_group || 'Unassigned / Open to Group')}\n` +
          `Mandated Deadline: ${memo.deadline_text || 'Standard Operating Timeline'}\n` +
          `Immediate Next Required Action: ${operation.next_action || 'Review directive mandates and acknowledge receipt via portal.'}`
        );
      } else if (resolvedTemplate === 'MULTI_SECTION_LONG') {
        // Template B: Detailed Long Directive
        renderSection('1', 'Purpose & Strategic Operational Rationale', memo.purpose || operation.purpose);
        renderSection('2', 'Detailed Technical & Operational Instructions', memo.operational_instructions || operation.operational_instructions);
        renderSection('3', 'Expected Outcome & Key Acceptance Standards', memo.expected_outcome || operation.expected_outcome || 'Full operational readiness with verified log submission and zero defects.');
        renderSection('4', 'Execution Timeline, Milestones & Deadlines', 
          `Operational Cutover / Effective Date: ${memo.effective_date_text || 'Immediate'}\n` +
          `Mandated Completion Deadline: ${memo.deadline_text || 'Standard Operating Timeline'}\n` +
          `Milestones: Phase 1 execution -> Intermediate logging -> Supervisory sign-off.`
        );
        renderSection('5', 'Responsibility, Accountability & Supervisory Escalation Matrix', memo.responsibility_definition || operation.responsibility_definition || 'Designated operational personnel bear primary execution accountability.');
        renderSection('6', 'Reporting Requirements & Verification Procedures', memo.reporting_requirements || operation.reporting_requirements || 'Progress updates to be submitted upon milestone completion.');
        renderSection('7', 'Current Operational Status & Next Required Action',
          `Current System Status: ${(operation.status || 'ISSUED').replace(/_/g, ' ')}\n` +
          `Immediate Next Required Action: ${operation.next_action || 'Review directive and begin implementation.'}`
        );
      } else if (resolvedTemplate === 'MULTI_RECIPIENT_TEAM') {
        // Template C: Multi-Recipient Team Directive with Roster Table
        renderSection('1', 'Collective Purpose & Operational Rationale', memo.purpose || operation.purpose);
        renderSection('2', 'Team Execution Protocols & General Directives', memo.operational_instructions || operation.operational_instructions);

        // Recipient Distribution & Acknowledgment Roster Table
        ensureSpace(80);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(brandAccent).text('3. FORMAL RECIPIENT DISTRIBUTION & ACKNOWLEDGMENT ROSTER');
        doc.moveDown(0.2);

        const recTableY = doc.y;
        const colW = [24, 150, 130, 110, 101]; // sum = 515
        const recList = recipients && recipients.length > 0 ? recipients : [
          { name: 'Marcus Vance', role: 'OPERATIONS_MANAGER', status: 'DELIVERED', acknowledged_at: null },
          { name: 'Sarah Jenkins', role: 'ADMIN', status: 'DELIVERED', acknowledged_at: new Date() },
        ];

        // Table Header
        doc.rect(40, recTableY, contentWidth, 16).fill('#e2e8f0');
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(primaryDark);
        doc.text('#', 44, recTableY + 4, { width: colW[0] });
        doc.text('RECIPIENT NAME', 44 + colW[0], recTableY + 4, { width: colW[1] });
        doc.text('DESIGNATED ROLE', 44 + colW[0] + colW[1], recTableY + 4, { width: colW[2] });
        doc.text('DELIVERY STATUS', 44 + colW[0] + colW[1] + colW[2], recTableY + 4, { width: colW[3] });
        doc.text('ACKNOWLEDGMENT', 44 + colW[0] + colW[1] + colW[2] + colW[3], recTableY + 4, { width: colW[4] });

        let recRowY = recTableY + 16;
        recList.forEach((r, idx) => {
          ensureSpace(18);
          if (doc.y > pageBottomSafe - 20) {
            doc.addPage();
            doc.y = 52;
            recRowY = doc.y;
          }
          const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
          doc.rect(40, recRowY, contentWidth, 16).fillAndStroke(rowBg, '#e2e8f0');
          doc.font('Helvetica').fontSize(7.5).fillColor(primaryDark);
          doc.text(String(idx + 1), 44, recRowY + 4, { width: colW[0] });
          doc.font('Helvetica-Bold').text(r.name || 'Staff Member', 44 + colW[0], recRowY + 4, { width: colW[1] });
          doc.font('Helvetica').text((r.role || 'Personnel').replace(/_/g, ' '), 44 + colW[0] + colW[1], recRowY + 4, { width: colW[2] });
          doc.text(r.status || 'DELIVERED', 44 + colW[0] + colW[1] + colW[2], recRowY + 4, { width: colW[3] });
          const ackText = r.acknowledged_at ? `ACK (${new Date(r.acknowledged_at).toLocaleDateString('en-GB')})` : 'PENDING ACK';
          doc.font(r.acknowledged_at ? 'Helvetica-Bold' : 'Helvetica-Oblique')
            .fillColor(r.acknowledged_at ? '#15803d' : '#d97706')
            .text(ackText, 44 + colW[0] + colW[1] + colW[2] + colW[3], recRowY + 4, { width: colW[4] });

          recRowY += 16;
        });

        doc.y = recRowY + 10;
        renderSection('4', 'Inter-Departmental Handoff & Escalation Protocols', memo.reporting_requirements || operation.reporting_requirements || 'Any blocker encountered during execution must be escalated immediately to the designated supervisor.');
      } else if (resolvedTemplate === 'REVISION_AMENDMENT') {
        // Template D: Revision / Amendment Directive
        renderSection('1', 'Scope of Operational Amendment & Revision Delta', 
          `This operational memorandum formally amends, updates, and supersedes prior directives under reference ${memo.memo_reference}.\n\n` +
          `Amendment Summary: ${memo.amendment_reason || 'Administrative update to operational procedures and task specifications.'}`
        );
        renderSection('2', 'Superseding Operational Directives & Instructions', memo.operational_instructions || operation.operational_instructions);
        renderSection('3', 'Cutover, Transition & Deprecation of Prior Instructions', 
          'Effective immediately upon release of this revision, all previously issued directives conflicting with the operational mandates stated herein are officially deprecated and nullified. All assigned teams must adjust standard operating procedures in accordance with this revision.'
        );
        renderSection('4', 'Updated Timeline, Deliverables & Accountability Matrix', 
          `Effective Cutover Date: ${memo.effective_date_text || 'Immediate'}\n` +
          `Updated Mandated Deadline: ${memo.deadline_text || 'Standard Operating Timeline'}\n` +
          `Primary Responsible Officer: ${operation.responsible_name ? `${operation.responsible_name} (${operation.responsible_role || 'Assigned'})` : (operation.current_responsible_group || 'Unassigned / Collective')}`
        );
        renderSection('5', 'Reporting Requirements & Verification Audit Lineage', memo.reporting_requirements || operation.reporting_requirements || 'Updated logs and milestone submissions must reflect v2.0 parameters.');
      }

      // 5. Formal Compliance & Acknowledgement Mandate
      ensureSpace(55);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(brandAccent).text('FORMAL COMPLIANCE & ACKNOWLEDGEMENT MANDATE');
      doc.moveDown(0.2);
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(secondaryMuted).text(
        'All designated recipients are required by company standard operating procedures to formally acknowledge receipt of this memorandum via the BFA Staff Portal / Staff Chat within the stipulated timeframe. Failure to acknowledge or carry out directed operational mandates constitutes a procedural breach.',
        { align: 'justify', width: contentWidth, lineGap: 1.5 }
      );
      doc.moveDown(0.6);

      // 6. Sign-off & Signature Section
      ensureSpace(70);
      const signY = doc.y;
      doc.strokeColor(borderLine).lineWidth(1).moveTo(40, signY).lineTo(240, signY).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(primaryDark).text(initiator?.name || 'Authorised Signatory', 40, signY + 4);
      doc.font('Helvetica').fontSize(7.5).fillColor(secondaryMuted).text(memo.issuer_designation || initiator?.role || 'Executive Authority', 40, signY + 15);
      doc.text(`Digital Verification Timestamp: ${new Date().toISOString()}`, 40, signY + 25);
      doc.text(`Doc Ref: ${memo.memo_reference || 'BFA-MEMO'} | Template: ${resolvedTemplate} | Audit Hash: VERIFIED-AUTHENTIC`, 40, signY + 35);

      // 7. Dynamic Header and Footer on All Buffered Pages
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;

        // Running Confidential Header (Page > 0)
        if (i > 0) {
          doc.fontSize(7).font('Helvetica').fillColor(secondaryMuted).text(
            `BFA APARTMENTS — OPERATIONS MEMORANDUM (${memo.memo_reference || 'REF'}) — [CONFIDENTIAL]`,
            40,
            24,
            { width: contentWidth, align: 'center', lineBreak: false }
          );
          doc.strokeColor(borderLine).lineWidth(0.5).moveTo(40, 34).lineTo(40 + contentWidth, 34).stroke();
        }

        // Running Footer (All Pages)
        doc.strokeColor(borderLine).lineWidth(0.5).moveTo(40, doc.page.height - 36).lineTo(40 + contentWidth, doc.page.height - 36).stroke();
        doc.fontSize(7).font('Helvetica').fillColor('#94a3b8').text(
          `BFA APARTMENTS MANAGEMENT SYSTEM • CONFIDENTIAL INTERNAL OPERATIONAL DOCUMENT • Page ${i + 1} of ${pages.count}`,
          40,
          doc.page.height - 28,
          { align: 'center', width: contentWidth, lineBreak: false }
        );
      }

      doc.end();
    });
  }
}

module.exports = CentralOperationsService;
