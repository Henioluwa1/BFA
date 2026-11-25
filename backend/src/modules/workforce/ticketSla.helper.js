/**
 * Ticket SLA, Priority, Lifecycle State Machine & Next-Action Helper
 * BFA Apartments Management System
 *
 * Centralizes priority-based Ack SLA rules (default + Owner 3-24h config),
 * reminder trigger hours, Lagos timezone formatting, transition rules,
 * and role-aware next-action directives.
 */

const DEFAULT_ACK_SLA_HOURS = {
  CRITICAL: 3,
  URGENT: 6,
  HIGH: 6,
  NORMAL: 12,
  IMPORTANT: 12,
  LOW: 24,
};

const EXACT_REMINDER_SCHEDULES = {
  3: { t1: 1, t2: 2, escalate: 3 },
  6: { t1: 3, t2: 5, escalate: 6 },
  12: { t1: 6, t2: 10, escalate: 12 },
  24: { t1: 12, t2: 20, escalate: 24 },
};

const ACTIVE_PRE_COMPLETION_STATUSES = [
  'OPEN',
  'ISSUED',
  'AWAITING_ACKNOWLEDGEMENT',
  'ACKNOWLEDGED',
  'ACCEPTED',
  'IN_PROGRESS',
  'REASSIGNED',
  'BLOCKED',
  'PENDING_INFORMATION',
  'AWAITING_CLARIFICATION',
  'REVISION_REQUIRED',
  'OVERDUE',
  'ESCALATED',
];

const TERMINAL_OR_CLOSED_STATUSES = ['COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED'];

function normalizePriority(priority = 'NORMAL') {
  const upper = String(priority || 'NORMAL').trim().toUpperCase();
  if (['CRITICAL', 'URGENT', 'HIGH', 'IMPORTANT', 'NORMAL', 'LOW'].includes(upper)) {
    return upper;
  }
  return 'NORMAL';
}

function getSlaHoursForPriority(priority = 'NORMAL', configuredMap = null) {
  const key = normalizePriority(priority);
  const raw = configuredMap && configuredMap[key] !== undefined ? Number(configuredMap[key]) : DEFAULT_ACK_SLA_HOURS[key];
  if (!Number.isFinite(raw) || raw < 3 || raw > 24) {
    return DEFAULT_ACK_SLA_HOURS[key] || 12;
  }
  return Math.round(raw);
}

function getReminderMilestonesHours(slaHours = 12) {
  const h = Math.min(24, Math.max(3, Math.round(Number(slaHours) || 12)));
  if (EXACT_REMINDER_SCHEDULES[h]) {
    return EXACT_REMINDER_SCHEDULES[h];
  }
  const t1 = Math.max(1, Math.floor(h * 0.5));
  const t2 = Math.max(t1 + 1, Math.min(h - 1, Math.round(h * 0.83)));
  return { t1, t2, escalate: h };
}

function validateAckSlaConfig(inputMap) {
  if (!inputMap || typeof inputMap !== 'object') {
    throw new Error('SLA configuration object is required.');
  }
  const result = { ...DEFAULT_ACK_SLA_HOURS };
  for (const key of Object.keys(DEFAULT_ACK_SLA_HOURS)) {
    if (inputMap[key] !== undefined) {
      const n = Number(inputMap[key]);
      if (!Number.isFinite(n) || n < 3 || n > 24) {
        throw new Error(`Acknowledgment SLA for ${key} must be between 3 and 24 hours (received: ${inputMap[key]}).`);
      }
      result[key] = Math.round(n);
    }
  }
  return result;
}

function formatLagosTime(value) {
  if (!value) return null;
  try {
    const dt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return `${dt.toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })} WAT`;
  } catch {
    return String(value);
  }
}

/**
 * Single authoritative role-aware Next Action resolver for Ticket cards & details drawers.
 */
function deriveNextAction(op, viewerUser = {}) {
  const viewerId = Number(viewerUser.id || 0);
  const viewerRole = String(viewerUser.role || '').toUpperCase();
  const isManagement = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(viewerRole);
  const status = String(op.status || 'OPEN').toUpperCase();
  const isResponsible = op.current_responsible_user_id && Number(op.current_responsible_user_id) === viewerId;
  const isInitiator = op.initiated_by_user_id && Number(op.initiated_by_user_id) === viewerId;
  const recipients = Array.isArray(op.recipients) ? op.recipients : [];
  const viewerRecip = recipients.find((r) => Number(r.user_id) === viewerId && !r.reassigned_out);

  if (status === 'CLOSED') {
    return {
      text: `Ticket closed (${op.closure_outcome || 'RESOLVED'}). View closure record or reopen if follow-up is required.`,
      actorRole: 'CLOSED',
      actionType: 'NONE',
      isViewerAction: false,
    };
  }
  if (status === 'COMPLETED') {
    return {
      text: isManagement
        ? 'Completed and approved. Formally close ticket to archive final record.'
        : 'Ticket completed and verified. Awaiting formal archival closure.',
      actorRole: isManagement ? 'MANAGEMENT' : 'COMPLETE',
      actionType: isManagement ? 'CLOSE' : 'NONE',
      isViewerAction: isManagement,
    };
  }
  if (status === 'CANCELLED') {
    return {
      text: 'Ticket cancelled by management. Excluded from staff execution penalties.',
      actorRole: 'CANCELLED',
      actionType: 'NONE',
      isViewerAction: false,
    };
  }
  if (status === 'REJECTED') {
    const isDecline = op.rejection_category === 'ASSIGNEE_INVALID_DECLINED';
    return {
      text: isManagement
        ? isDecline
          ? 'Declined by assignee as misassigned/invalid. Reassign to correct personnel or close/cancel.'
          : 'Ticket rejected. Reassign, reopen for correction, or formally close.'
        : 'Ticket marked rejected. Awaiting management disposition.',
      actorRole: isManagement ? 'MANAGEMENT' : 'SUPERVISOR',
      actionType: isManagement ? 'REASSIGN' : 'NONE',
      isViewerAction: isManagement,
    };
  }

  if (status === 'SUBMITTED_FOR_REVIEW' || status === 'AWAITING_REVIEW' || status === 'PENDING_APPROVAL') {
    const canReview = isManagement && !isResponsible;
    return {
      text: canReview
        ? 'Execution completed and submitted. Review work quality and Approve, Request Revision, or Reject.'
        : 'Submitted for supervisory review. Awaiting management sign-off.',
      actorRole: 'SUPERVISOR',
      actionType: 'REVIEW',
      isViewerAction: canReview,
    };
  }

  if (status === 'BLOCKED') {
    return {
      text: isManagement
        ? 'Ticket blocked by operational impediment. Review reported blocker and intervene to unblock.'
        : 'Ticket blocked. Awaiting supervisory intervention and resolution guidance.',
      actorRole: 'SUPERVISOR',
      actionType: 'RESOLVE_BLOCKER',
      isViewerAction: isManagement || isInitiator,
    };
  }

  if (status === 'AWAITING_CLARIFICATION' || status === 'PENDING_INFORMATION') {
    return {
      text: isInitiator || isManagement
        ? 'Clarification requested by recipient. Provide response to resume execution.'
        : 'Awaiting clarification response from issuer before execution proceeds.',
      actorRole: 'ISSUER',
      actionType: 'RESPOND_CLARIFICATION',
      isViewerAction: isInitiator || isManagement,
    };
  }

  if (status === 'REVISION_REQUIRED') {
    return {
      text: isResponsible
        ? 'Supervisor requested revisions. Address review feedback and resubmit completion.'
        : `Revision requested. ${op.responsible_name || 'Assigned owner'} must update and resubmit.`,
      actorRole: 'ASSIGNEE',
      actionType: 'SUBMIT_COMPLETION',
      isViewerAction: !!isResponsible,
    };
  }

  // Needs recipient acknowledgement first?
  if (viewerRecip && !viewerRecip.acknowledged_at) {
    return {
      text: `Acknowledge receipt immediately (${op.acknowledgment_sla_hours || 12}h SLA${
        op.acknowledgment_deadline_at ? ` — due ${formatLagosTime(op.acknowledgment_deadline_at)}` : ''
      }).`,
      actorRole: 'RECIPIENT',
      actionType: 'ACKNOWLEDGE',
      isViewerAction: true,
    };
  }

  // Group ticket still awaiting ownership acceptance/assignment?
  if (!op.current_responsible_user_id) {
    if (viewerRecip || isManagement) {
      return {
        text: isManagement
          ? 'Open group ticket: Eligible staff must Accept Responsibility or Supervisor may Assign Owner.'
          : 'Awaiting ownership: Click Accept Responsibility to claim this ticket.',
        actorRole: 'GROUP_ELIGIBLE',
        actionType: isManagement && !viewerRecip ? 'ASSIGN' : 'ACCEPT_RESPONSIBILITY',
        isViewerAction: true,
      };
    }
    return {
      text: `Awaiting ownership from ${op.current_responsible_group || 'eligible group'}.`,
      actorRole: 'GROUP',
      actionType: 'WAIT',
      isViewerAction: false,
    };
  }

  if (status === 'ESCALATED' || status === 'OVERDUE') {
    if (isResponsible) {
      return {
        text: status === 'ESCALATED'
          ? 'SLA Escalated! Acknowledge, update execution status, or request a justified extension immediately.'
          : 'Execution deadline overdue! Submit progress/completion or request deadline extension immediately.',
        actorRole: 'ASSIGNEE',
        actionType: 'UPDATE_OR_COMPLETE',
        isViewerAction: true,
      };
    }
    return {
      text: `Ticket ${status.toLowerCase()}. Supervisor review or reassignment recommended (${op.responsible_name || 'Assignee'}).`,
      actorRole: 'SUPERVISOR',
      actionType: 'REASSIGN_OR_FOLLOW_UP',
      isViewerAction: isManagement,
    };
  }

  if (status === 'ACKNOWLEDGED') {
    if (isResponsible) {
      return {
        text: op.accepted_at
          ? 'Responsibility accepted. Click Start Execution to begin active work.'
          : 'Receipt acknowledged. Confirm Responsibility or Start Execution.',
        actorRole: 'ASSIGNEE',
        actionType: 'START_EXECUTION',
        isViewerAction: true,
      };
    }
    return {
      text: `Acknowledged. Awaiting execution start by ${op.responsible_name || 'assignee'}.`,
      actorRole: 'ASSIGNEE',
      actionType: 'WAIT',
      isViewerAction: false,
    };
  }

  if (status === 'ACCEPTED') {
    if (isResponsible) {
      return {
        text: 'Responsibility accepted. Click Start Execution to begin work.',
        actorRole: 'ASSIGNEE',
        actionType: 'START_EXECUTION',
        isViewerAction: true,
      };
    }
    return {
      text: `${op.responsible_name || 'Assignee'} accepted responsibility. Execution starting soon.`,
      actorRole: 'ASSIGNEE',
      actionType: 'WAIT',
      isViewerAction: false,
    };
  }

  if (status === 'IN_PROGRESS') {
    if (isResponsible) {
      return {
        text: 'Ticket in progress. Post progress updates, upload DB evidence, or Submit Completion for review.',
        actorRole: 'ASSIGNEE',
        actionType: 'PROGRESS_OR_COMPLETE',
        isViewerAction: true,
      };
    }
    return {
      text: `Execution in progress under ${op.responsible_name || 'assigned owner'}.`,
      actorRole: 'ASSIGNEE',
      actionType: 'MONITOR',
      isViewerAction: false,
    };
  }

  return {
    text: `Awaiting acknowledgement / ownership by ${op.responsible_name || op.current_responsible_group || 'assigned personnel'}.`,
    actorRole: 'RECIPIENT',
    actionType: 'ACKNOWLEDGE',
    isViewerAction: Boolean(viewerRecip || isResponsible),
  };
}

module.exports = {
  DEFAULT_ACK_SLA_HOURS,
  ACTIVE_PRE_COMPLETION_STATUSES,
  TERMINAL_OR_CLOSED_STATUSES,
  normalizePriority,
  getSlaHoursForPriority,
  getReminderMilestonesHours,
  validateAckSlaConfig,
  formatLagosTime,
  deriveNextAction,
};
