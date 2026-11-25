/**
 * Background Ticket SLA Reminder & Hierarchical Escalation Scheduler
 * BFA Apartments Management System
 *
 * - Evaluates unacknowledged tickets against priority-based SLA milestones:
 *   CRITICAL (3h -> 1h, 2h, 3h), URGENT/HIGH (6h -> 3h, 5h, 6h),
 *   NORMAL/IMPORTANT (12h -> 6h, 10h, 12h), LOW (24h -> 12h, 20h, 24h)
 *   plus any Owner-configured values (3-24h).
 * - Evaluates active ticket execution deadlines for 50% / 2h pre-due reminders & overdue escalation.
 * - Strictly idempotent via ticket_reminder_logs UNIQUE(operation_id, recipient_user_id, reminder_stage).
 * - Stops unacknowledged reminders immediately once acknowledged or ticket completed/closed/cancelled.
 * - Escalates strictly up the supervisory hierarchy (never all-staff broadcast).
 */

const pool = require('../../db/pool');
const logger = require('../../utils/logger');
const NotificationsService = require('../notifications/notifications.service');
const ChatRepository = require('../chat/chat.repository');
const {
  getSlaHoursForPriority,
  getReminderMilestonesHours,
  formatLagosTime,
  ACTIVE_PRE_COMPLETION_STATUSES,
  TERMINAL_OR_CLOSED_STATUSES,
} = require('./ticketSla.helper');

const SWEEP_INTERVAL_MS = 60 * 1000;
let intervalHandle = null;
let isSweeping = false;

function mapNotifPriority(opPriority = 'NORMAL') {
  const p = String(opPriority || 'NORMAL').toUpperCase();
  if (p === 'CRITICAL') return 'CRITICAL';
  if (['URGENT', 'HIGH', 'IMPORTANT'].includes(p)) return 'HIGH';
  if (p === 'LOW') return 'LOW';
  return 'MEDIUM';
}

class TicketSlaSchedulerService {
  static async resolveSystemSenderId(preferredIds = [], excludeUserId = null) {
    const exclude = Number(excludeUserId || 0);
    for (const rawId of preferredIds) {
      const id = Number(rawId || 0);
      if (id > 0 && id !== exclude) {
        const [row] = await pool.query("SELECT id FROM users WHERE id = ? AND status = 'ACTIVE' LIMIT 1", [id]);
        if (row) return row.id;
      }
    }
    const admins = await pool.query(
      "SELECT id FROM users WHERE status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER') ORDER BY id ASC LIMIT 5"
    );
    const hit = (admins || []).find((u) => Number(u.id) !== exclude);
    if (hit) return hit.id;
    const anyUser = await pool.query("SELECT id FROM users WHERE status = 'ACTIVE' AND id != ? ORDER BY id ASC LIMIT 1", [exclude || 0]);
    return anyUser[0]?.id || 1;
  }

  static async resolveEscalationTargets(op, breachingUser = null) {
    const breachingId = Number(breachingUser?.id || breachingUser?.user_id || 0);
    const breachingRole = String(breachingUser?.role || breachingUser?.role_at_time || '').toUpperCase();
    const candidates = new Map();

    const addUserRow = (u) => {
      if (!u || !u.id || Number(u.id) === breachingId) return;
      candidates.set(Number(u.id), u);
    };

    // 1. Always include ticket initiator & explicit supervisor (if active and not breaching)
    const explicitIds = [op.initiated_by_user_id, op.supervisor_user_id].filter((id) => Number(id) > 0);
    if (explicitIds.length > 0) {
      const rows = await pool.query(
        `SELECT id, name, email, role FROM users WHERE status = 'ACTIVE' AND id IN (${explicitIds.map(() => '?').join(', ')})`,
        explicitIds
      );
      rows.forEach(addUserRow);
    }

    // 2. Hierarchical escalation up by breaching role
    if (['STAFF', 'RECEPTIONIST', ''].includes(breachingRole)) {
      if (op.property_id) {
        const mgrs = await pool.query(
          `SELECT DISTINCT u.id, u.name, u.email, u.role
           FROM users u
           LEFT JOIN user_property_assignments upa ON upa.user_id = u.id
           WHERE u.status = 'ACTIVE'
             AND u.role IN ('MANAGER', 'OPERATIONS_MANAGER')
             AND (u.property_id = ? OR upa.property_id = ? OR u.property_id IS NULL)`,
          [op.property_id, op.property_id]
        );
        mgrs.forEach(addUserRow);
      }
      if (candidates.size === 0) {
        const admins = await pool.query(
          "SELECT id, name, email, role FROM users WHERE status = 'ACTIVE' AND role IN ('ADMIN', 'OPERATIONS_MANAGER')"
        );
        admins.forEach(addUserRow);
      }
    } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(breachingRole)) {
      const execs = await pool.query(
        "SELECT id, name, email, role FROM users WHERE status = 'ACTIVE' AND role IN ('ADMIN', 'OWNER')"
      );
      execs.forEach(addUserRow);
    } else {
      // Admin / executive escalation goes to Owner / Super Admin
      const top = await pool.query(
        "SELECT id, name, email, role FROM users WHERE status = 'ACTIVE' AND role IN ('OWNER', 'SUPER_ADMIN')"
      );
      top.forEach(addUserRow);
    }

    return Array.from(candidates.values());
  }

  /**
   * Atomically claim an idempotent reminder slot so duplicate runs never double-notify.
   */
  static async claimReminderSlot(operationId, recipientUserId, stage, channel = 'ALL') {
    const isPg = !!pool.isPostgres();
    if (isPg) {
      const res = await pool.query(
        `INSERT INTO ticket_reminder_logs (operation_id, recipient_user_id, reminder_stage, channel, delivery_status, attempt_count)
         VALUES (?, ?, ?, ?, 'SENT', 1)
         ON CONFLICT (operation_id, recipient_user_id, reminder_stage) DO NOTHING
         RETURNING id`,
        [operationId, recipientUserId, stage, channel]
      );
      const id = res?.insertId || res?.rows?.[0]?.id || (Array.isArray(res) && res[0]?.id) || null;
      return id;
    }

    const res = await pool.query(
      `INSERT IGNORE INTO ticket_reminder_logs (operation_id, recipient_user_id, reminder_stage, channel, delivery_status, attempt_count)
       VALUES (?, ?, ?, ?, 'SENT', 1)`,
      [operationId, recipientUserId, stage, channel]
    );
    const affected = res?.affectedRows || 0;
    if (affected === 0) return null;
    return res?.insertId || 1;
  }

  static async markSlotFailed(slotId, errorMessage) {
    if (!slotId) return;
    try {
      await pool.query(
        "UPDATE ticket_reminder_logs SET delivery_status = 'FAILED', attempt_count = attempt_count + 1, last_error = ? WHERE id = ?",
        [String(errorMessage || 'Unknown delivery error').slice(0, 500), slotId]
      );
    } catch {
      // Ignore secondary logging error
    }
  }

  static async dispatchDirectReminder({ op, recipientUser, title, message, messageType = 'SYSTEM_NOTICE' }) {
    const recipientId = Number(recipientUser.id || recipientUser.user_id);

    // 1. In-App Notification (with TICKET category)
    await NotificationsService.dispatchNotification({
      recipientId,
      recipientRole: recipientUser.role || recipientUser.role_at_time || null,
      propertyId: op.property_id || null,
      title,
      message,
      category: 'TICKET',
      priority: mapNotifPriority(op.priority),
      sourceEntityType: 'CENTRAL_OPERATION',
      sourceEntityId: op.id,
      linkUrl: `/portal/operations?op=${op.id}`,
      channel: 'IN_APP',
    });

    // 2. Direct Chat Message (creates unread badge + conversation notice)
    const senderId = await this.resolveSystemSenderId([op.initiated_by_user_id, op.supervisor_user_id], recipientId);
    if (senderId && senderId !== recipientId) {
      const dm = await ChatRepository.findOrCreateDirectThread(senderId, recipientId);
      if (dm?.id) {
        await pool.query(
          `INSERT INTO chat_messages (thread_id, sender_id, message_type, priority, content, context_entity_type, context_entity_id)
           VALUES (?, ?, ?, ?, ?, 'OPERATION', ?)`,
          [dm.id, senderId, messageType === 'CONTEXT_LINK' ? 'CONTEXT_LINK' : 'TEXT', op.priority || 'NORMAL', message, op.id]
        );
        await pool.query('UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [dm.id]);
      }
    }
  }

  static async recordOpEvent(opId, actorUserId, eventType, summary, details = {}) {
    await pool.query(
      `INSERT INTO central_operation_events (operation_id, actor_user_id, event_type, event_summary, event_details)
       VALUES (?, ?, ?, ?, ?)`,
      [opId, actorUserId || 1, eventType, summary.slice(0, 255), JSON.stringify(details)]
    );
  }

  /**
   * Sweep all open/unacknowledged tickets for Ack SLA reminders & Execution deadline escalation.
   */
  static async runSlaSweep({ now = new Date() } = {}) {
    if (isSweeping) {
      return { skipped: true, reason: 'Sweep already in progress' };
    }
    isSweeping = true;

    const current = now instanceof Date ? now : new Date(now);
    const stats = {
      ackFirstReminders: 0,
      ackFinalReminders: 0,
      ackEscalations: 0,
      execReminders: 0,
      overdueEscalations: 0,
      errors: [],
    };

    try {
      // ── 1. Unacknowledged Ticket Recipients (Active Only) ─────────────────
      const unackRows = await pool.query(
        `SELECT
           co.id, co.operation_code, co.ticket_reference, co.title, co.priority, co.status,
           co.property_id, co.initiated_by_user_id, co.supervisor_user_id,
           co.current_responsible_user_id, co.acknowledgment_sla_hours, co.acknowledgment_deadline_at,
           co.reassignment_count, co.reopen_count, co.created_at, co.escalated_at,
           cor.id AS recipient_row_id, cor.user_id, cor.role_at_time, cor.assigned_at, cor.delivered_at,
           u.name AS recipient_name, u.email AS recipient_email, u.role AS recipient_role
         FROM central_operation_recipients cor
         JOIN central_operations co ON co.id = cor.operation_id
         JOIN users u ON u.id = cor.user_id
         WHERE u.status = 'ACTIVE'
           AND cor.acknowledged_at IS NULL
           AND COALESCE(cor.reassigned_out, FALSE) = FALSE
           AND co.status NOT IN (${TERMINAL_OR_CLOSED_STATUSES.map(() => '?').join(', ')})
           AND (
             co.current_responsible_user_id IS NULL
             OR co.current_responsible_user_id = cor.user_id
           )`,
        TERMINAL_OR_CLOSED_STATUSES
      );

      for (const row of unackRows) {
        const ref = row.ticket_reference || row.operation_code;
        const slaHours = row.acknowledgment_sla_hours || getSlaHoursForPriority(row.priority);
        const milestones = getReminderMilestonesHours(slaHours);
        const baseStart = new Date(row.assigned_at || row.delivered_at || row.created_at);
        const elapsedHours = (current.getTime() - baseStart.getTime()) / (1000 * 60 * 60);
        const revSuffix = `R${row.reassignment_count || 0}`;
        const ackDeadlineDisplay = formatLagosTime(
          row.acknowledgment_deadline_at || new Date(baseStart.getTime() + slaHours * 3600 * 1000)
        );

        // Escalation stage (>= slaHours OR past explicit acknowledgment_deadline_at)
        const breachedDeadline =
          elapsedHours >= milestones.escalate ||
          (row.acknowledgment_deadline_at && current.getTime() >= new Date(row.acknowledgment_deadline_at).getTime());

        if (breachedDeadline) {
          const slotId = await this.claimReminderSlot(row.id, row.user_id, `ACK_ESC_${revSuffix}`, 'ALL');
          if (slotId) {
            try {
              const supervisors = await this.resolveEscalationTargets(row, {
                id: row.user_id,
                role: row.recipient_role || row.role_at_time,
              });
              const primaryEscId = supervisors[0]?.id || row.initiated_by_user_id;

              // Update ticket status & escalation metadata
              await pool.query(
                `UPDATE central_operations
                 SET escalated_at = COALESCE(escalated_at, CURRENT_TIMESTAMP),
                     escalated_to_user_id = COALESCE(escalated_to_user_id, ?),
                     status = CASE WHEN status IN ('OPEN', 'ISSUED', 'AWAITING_ACKNOWLEDGEMENT', 'REASSIGNED') THEN 'ESCALATED' ELSE status END,
                     next_action = ?
                 WHERE id = ?`,
                [
                  primaryEscId || null,
                  `SLA Escalated (${slaHours}h Ack SLA breached by ${row.recipient_name}). Supervisor follow-up or reassignment required.`,
                  row.id,
                ]
              );

              // Notify breaching assignee directly
              await this.dispatchDirectReminder({
                op: row,
                recipientUser: { id: row.user_id, role: row.recipient_role },
                title: `SLA Breached & Escalated: ${ref}`,
                message: `🚨 [SLA ESCALATION — ${ref}]\nTicket "${row.title}" (${row.priority}) was not acknowledged within the ${slaHours}h SLA (${ackDeadlineDisplay}) and has been escalated to management.\nPlease acknowledge receipt immediately.`,
              });

              // Escalate strictly to hierarchical supervisors
              for (const sup of supervisors) {
                const supSlot = await this.claimReminderSlot(row.id, sup.id, `ACK_SUP_ESC_${row.user_id}_${revSuffix}`, 'ALL');
                if (supSlot) {
                  await this.dispatchDirectReminder({
                    op: row,
                    recipientUser: sup,
                    title: `Unacknowledged Ticket Escalated: ${ref}`,
                    message: `⚠️ [HIERARCHICAL ESCALATION — ${ref}]\nTicket "${row.title}" (${row.priority}) remains unacknowledged by ${row.recipient_name} (${row.recipient_role}) past the ${slaHours}h SLA (${ackDeadlineDisplay}).\nSupervisor review or reassignment is required.`,
                  });
                }
              }

              await this.recordOpEvent(
                row.id,
                row.initiated_by_user_id || 1,
                'ESCALATED',
                `Acknowledgment SLA (${slaHours}h) breached by ${row.recipient_name}; escalated to supervisory chain.`,
                {
                  breachingUserId: row.user_id,
                  slaHours,
                  escalatedToIds: supervisors.map((s) => s.id),
                }
              );

              stats.ackEscalations += 1;
            } catch (err) {
              await this.markSlotFailed(slotId, err.message);
              stats.errors.push(`Esc ${row.id}/${row.user_id}: ${err.message}`);
            }
          }
          continue;
        }

        // Second/Final Reminder before SLA expiry
        if (elapsedHours >= milestones.t2) {
          const slotId = await this.claimReminderSlot(row.id, row.user_id, `ACK_T2_${revSuffix}`, 'ALL');
          if (slotId) {
            try {
              await pool.query(
                'UPDATE central_operations SET sla_final_reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
                [row.id]
              );
              await this.dispatchDirectReminder({
                op: row,
                recipientUser: { id: row.user_id, role: row.recipient_role },
                title: `Final Ack Reminder (${row.priority}): ${ref}`,
                message: `⏰ [FINAL SLA REMINDER — ${ref}]\nTicket "${row.title}" requires immediate acknowledgement before ${ackDeadlineDisplay} (${slaHours}h SLA) to avoid supervisory escalation.`,
              });
              await this.recordOpEvent(
                row.id,
                row.initiated_by_user_id || 1,
                'SLA_REMINDER_SENT',
                `Final acknowledgment reminder sent to ${row.recipient_name} (${milestones.t2}h/${slaHours}h SLA).`,
                { recipientUserId: row.user_id, stage: 'T2', slaHours }
              );
              stats.ackFinalReminders += 1;
            } catch (err) {
              await this.markSlotFailed(slotId, err.message);
              stats.errors.push(`T2 ${row.id}/${row.user_id}: ${err.message}`);
            }
          }
          continue;
        }

        // First Reminder
        if (elapsedHours >= milestones.t1) {
          const slotId = await this.claimReminderSlot(row.id, row.user_id, `ACK_T1_${revSuffix}`, 'ALL');
          if (slotId) {
            try {
              await pool.query(
                'UPDATE central_operations SET sla_first_reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
                [row.id]
              );
              await this.dispatchDirectReminder({
                op: row,
                recipientUser: { id: row.user_id, role: row.recipient_role },
                title: `Action Required: Acknowledge ${ref}`,
                message: `🔔 [SLA REMINDER — ${ref}]\nYou have not yet acknowledged Ticket "${row.title}" (${row.priority}).\nAck SLA Deadline: ${ackDeadlineDisplay}. Open the ticket in chat to Acknowledge Receipt.`,
              });
              await this.recordOpEvent(
                row.id,
                row.initiated_by_user_id || 1,
                'SLA_REMINDER_SENT',
                `First acknowledgment reminder sent to ${row.recipient_name} (${milestones.t1}h/${slaHours}h SLA).`,
                { recipientUserId: row.user_id, stage: 'T1', slaHours }
              );
              stats.ackFirstReminders += 1;
            } catch (err) {
              await this.markSlotFailed(slotId, err.message);
              stats.errors.push(`T1 ${row.id}/${row.user_id}: ${err.message}`);
            }
          }
        }
      }

      // ── 2. Active Execution Deadlines (Pre-Due Reminders & Overdue Detection) ─
      const deadlineOps = await pool.query(
        `SELECT co.*, u.name AS responsible_name, u.role AS responsible_role
         FROM central_operations co
         LEFT JOIN users u ON u.id = co.current_responsible_user_id
         WHERE co.deadline_at IS NOT NULL
           AND co.status IN (${ACTIVE_PRE_COMPLETION_STATUSES.map(() => '?').join(', ')})`,
        ACTIVE_PRE_COMPLETION_STATUSES
      );

      for (const op of deadlineOps) {
        const ref = op.ticket_reference || op.operation_code;
        const createdAt = new Date(op.created_at);
        const deadlineAt = new Date(op.deadline_at);
        const totalWindowMs = Math.max(60 * 60 * 1000, deadlineAt.getTime() - createdAt.getTime());
        const remainingMs = deadlineAt.getTime() - current.getTime();
        const elapsedFraction = (current.getTime() - createdAt.getTime()) / totalWindowMs;
        const targetUserId = op.current_responsible_user_id || null;
        const execRev = `E${op.reopen_count || 0}`;

        if (remainingMs <= 0) {
          // Mark Overdue & escalate to supervisors once
          if (op.status !== 'OVERDUE') {
            await pool.query(
              `UPDATE central_operations
               SET overdue_at = COALESCE(overdue_at, CURRENT_TIMESTAMP),
                   status = CASE WHEN status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED', 'SUBMITTED_FOR_REVIEW', 'AWAITING_REVIEW') THEN 'OVERDUE' ELSE status END,
                   next_action = ?
               WHERE id = ?`,
              [
                `Execution deadline (${formatLagosTime(deadlineAt)}) passed. Submit completion, request approved extension, or escalate.`,
                op.id,
              ]
            );
            await this.recordOpEvent(
              op.id,
              op.initiated_by_user_id || 1,
              'OVERDUE_MARKED',
              `Execution deadline (${formatLagosTime(deadlineAt)}) exceeded; ticket flagged OVERDUE.`,
              { deadlineAt: deadlineAt.toISOString(), responsibleUserId: targetUserId }
            );
          }

          if (targetUserId) {
            const slotId = await this.claimReminderSlot(op.id, targetUserId, `EXEC_OVERDUE_${execRev}`, 'ALL');
            if (slotId) {
              try {
                await this.dispatchDirectReminder({
                  op,
                  recipientUser: { id: targetUserId, role: op.responsible_role },
                  title: `OVERDUE Ticket: ${ref}`,
                  message: `🚨 [EXECUTION OVERDUE — ${ref}]\nTicket "${op.title}" passed its execution deadline (${formatLagosTime(deadlineAt)}).\nPlease submit progress/completion or request an extension with justification.`,
                });
                const supervisors = await this.resolveEscalationTargets(op, { id: targetUserId, role: op.responsible_role });
                for (const sup of supervisors) {
                  const supSlot = await this.claimReminderSlot(op.id, sup.id, `EXEC_SUP_OVERDUE_${execRev}`, 'ALL');
                  if (supSlot) {
                    await this.dispatchDirectReminder({
                      op,
                      recipientUser: sup,
                      title: `Supervisor Alert — Overdue Ticket ${ref}`,
                      message: `⚠️ [OVERDUE ESCALATION — ${ref}]\nTicket "${op.title}" assigned to ${op.responsible_name || 'Unassigned'} exceeded deadline ${formatLagosTime(deadlineAt)}.`,
                    });
                  }
                }
                stats.overdueEscalations += 1;
              } catch (err) {
                await this.markSlotFailed(slotId, err.message);
                stats.errors.push(`Overdue ${op.id}: ${err.message}`);
              }
            }
          }
          continue;
        }

        // Pre-due reminder (2h before OR >=50% elapsed)
        if (targetUserId) {
          if (remainingMs <= 2 * 3600 * 1000) {
            const slotId = await this.claimReminderSlot(op.id, targetUserId, `EXEC_PRE2H_${execRev}`, 'ALL');
            if (slotId) {
              try {
                await this.dispatchDirectReminder({
                  op,
                  recipientUser: { id: targetUserId, role: op.responsible_role },
                  title: `Deadline Approaching (<2h): ${ref}`,
                  message: `⏳ [DEADLINE APPROACHING — ${ref}]\nTicket "${op.title}" is due at ${formatLagosTime(deadlineAt)}. Please submit completion or request an extension if blocked.`,
                });
                stats.execReminders += 1;
              } catch (err) {
                await this.markSlotFailed(slotId, err.message);
              }
            }
          } else if (elapsedFraction >= 0.5) {
            const slotId = await this.claimReminderSlot(op.id, targetUserId, `EXEC_50PCT_${execRev}`, 'ALL');
            if (slotId) {
              try {
                await this.dispatchDirectReminder({
                  op,
                  recipientUser: { id: targetUserId, role: op.responsible_role },
                  title: `Halfway Reminder: ${ref}`,
                  message: `📌 [PROGRESS CHECK-IN — ${ref}]\nTicket "${op.title}" has reached 50% of its execution window (Due: ${formatLagosTime(deadlineAt)}). Post a progress update when ready.`,
                });
                stats.execReminders += 1;
              } catch (err) {
                await this.markSlotFailed(slotId, err.message);
              }
            }
          }
        }
      }

      return stats;
    } finally {
      isSweeping = false;
    }
  }

  static startScheduler() {
    if (process.env.NODE_ENV === 'test' || intervalHandle) {
      return;
    }
    logger.info('[SLA-SCHEDULER] Starting background Ticket SLA & Escalation monitor (60s interval)...');
    // Delay initial run slightly so HTTP/DB pools settle on boot
    setTimeout(() => {
      this.runSlaSweep().catch((err) => logger.warn(`[SLA-SCHEDULER] Initial sweep notice: ${err.message}`));
    }, 10000).unref();

    intervalHandle = setInterval(() => {
      this.runSlaSweep().catch((err) => logger.warn(`[SLA-SCHEDULER] Sweep error: ${err.message}`));
    }, SWEEP_INTERVAL_MS);
    if (typeof intervalHandle.unref === 'function') {
      intervalHandle.unref();
    }
  }

  static stopScheduler() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
      logger.info('[SLA-SCHEDULER] Background SLA monitor stopped.');
    }
  }
}

module.exports = TicketSlaSchedulerService;
