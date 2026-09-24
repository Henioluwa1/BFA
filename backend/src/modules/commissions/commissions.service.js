const CommissionsRepository = require('./commissions.repository');
const AgentsRepository = require('../agents/agents.repository');
const ReservationsRepository = require('../reservations/reservations.repository');
const AccessControlService = require('../../core/access/accessControl.service');
const AuditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');
const logger = require('../../core/logging/logger');
const pool = require('../../db/pool');

class CommissionsService {
  /**
   * List commissions with filtering and security scoping
   */
  static async listCommissions(query, req = null) {
    return CommissionsRepository.findAll({
      ...query,
      user: req?.user,
    });
  }

  /**
   * Get single commission by ID with scope validation
   */
  static async getCommissionById(id, req = null) {
    const commission = await CommissionsRepository.findById(id);
    if (!commission) {
      throw new NotFoundError(`Commission #${id} not found.`);
    }

    if (req?.user?.role === 'AGENT' && commission.agent_id !== req.user.agentId) {
      throw new ForbiddenError('You are only authorized to view your own commission statements.');
    }

    if (
      req?.user?.propertyId &&
      !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(req?.user?.role) &&
      commission.property_id !== req.user.propertyId
    ) {
      throw new ForbiddenError('Access denied: You do not have access to commissions for this property.');
    }

    return commission;
  }

  /**
   * Calculate or recalculate commission for a reservation
   */
  static async calculateCommissionForReservation(reservationId, options = {}, req = null, conn = null) {
    const reservation = await ReservationsRepository.findById(reservationId, conn);
    if (!reservation) {
      throw new NotFoundError(`Reservation #${reservationId} not found.`);
    }

    const agentId = options.agentId || reservation.agent_id;
    if (!agentId) {
      throw new ValidationError(`Reservation #${reservation.reservation_code} is not associated with any agent.`);
    }

    const agent = await AgentsRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError(`Agent #${agentId} not found.`);
    }

    if (agent.status !== 'ACTIVE') {
      throw new ValidationError(`Cannot calculate commission for inactive or suspended agent '${agent.name}'.`);
    }

    if (agent.property_id && parseInt(agent.property_id, 10) !== parseInt(reservation.property_id, 10)) {
      throw new ValidationError(`Agent '${agent.name}' is not authorized for Property #${reservation.property_id}.`);
    }

    const bookingAmount = parseFloat(reservation.total_amount || 0);
    const commissionRate = parseFloat(agent.commission_rate || 0);
    const commissionType = agent.commission_type || 'PERCENTAGE';

    let commissionAmount = 0.00;
    if (commissionType === 'PERCENTAGE') {
      commissionAmount = Number(((bookingAmount * commissionRate) / 100).toFixed(2));
    } else {
      commissionAmount = Number(commissionRate.toFixed(2));
    }

    // Check existing commission
    const existing = await CommissionsRepository.findByAgentAndReservation(agentId, reservationId);
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (existing) {
      if (['PAID'].includes(existing.status)) {
        throw new ConflictError(`Commission for reservation #${reservation.reservation_code} has already been PAID and cannot be recalculated.`);
      }

      await CommissionsRepository.update(
        existing.id,
        {
          booking_amount: bookingAmount,
          commission_rate: commissionRate,
          commission_type: commissionType,
          commission_amount: commissionAmount,
          calculated_at: nowStr,
          status: existing.status === 'APPROVED' ? 'APPROVED' : 'CALCULATED',
        },
        conn
      );

      return CommissionsRepository.findById(existing.id);
    }

    const commissionCode = `COM-AG${agent.id}-RES${reservation.id}`;

    const insertId = await CommissionsRepository.create(
      {
        commission_code: commissionCode,
        agent_id: agent.id,
        reservation_id: reservation.id,
        property_id: reservation.property_id,
        booking_amount: bookingAmount,
        commission_rate: commissionRate,
        commission_type: commissionType,
        commission_amount: commissionAmount,
        currency: 'NGN',
        status: 'CALCULATED',
        calculated_at: nowStr,
        notes: options.notes || null,
      },
      conn
    );

    const created = await CommissionsRepository.findById(insertId);

    // Audit log
    await AuditService.record({
      req,
      actorId: req?.user?.id,
      actorEmail: req?.user?.email,
      actorRole: req?.user?.role,
      action: 'COMMISSION_CALCULATED',
      entityType: 'commission',
      entityId: String(insertId),
      newValues: {
        commissionCode,
        agentId: agent.id,
        reservationId: reservation.id,
        amount: commissionAmount,
        type: commissionType,
        rate: commissionRate,
      },
    });

    return created;
  }

  /**
   * Authorize / approve a commission
   */
  static async approveCommission(id, req = null) {
    const commission = await this.getCommissionById(id, req);

    // Check capability: COMMISSION_APPROVAL
    const capCheck = await AccessControlService.canAccess(req?.user, 'COMMISSION_APPROVAL');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Commission approval requires authorized capability (${capCheck.reason}).`);
    }

    if (commission.status === 'APPROVED') {
      throw new ConflictError(`Commission #${commission.commission_code} is already approved.`);
    }

    if (commission.status === 'PAID') {
      throw new ConflictError(`Commission #${commission.commission_code} is already paid.`);
    }

    if (['CANCELLED', 'VOIDED'].includes(commission.status)) {
      throw new ConflictError(`Cannot approve a ${commission.status} commission.`);
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await CommissionsRepository.update(id, {
      status: 'APPROVED',
      approved_by_id: req?.user?.id || null,
      approved_at: nowStr,
    });

    const updated = await CommissionsRepository.findById(id);

    // Audit log
    await AuditService.record({
      req,
      actorId: req?.user?.id,
      actorEmail: req?.user?.email,
      actorRole: req?.user?.role,
      action: 'COMMISSION_APPROVED',
      entityType: 'commission',
      entityId: String(id),
      oldValues: { status: commission.status },
      newValues: { status: 'APPROVED', approvedById: req?.user?.id, approvedAt: nowStr },
    });

    // Notify agent
    try {
      await NotificationsService.dispatchNotification({
        recipientRole: 'AGENT',
        title: `Commission Approved: ${commission.commission_code}`,
        message: `Your commission of ₦${Number(commission.commission_amount).toLocaleString()} for reservation ${commission.reservation_code} has been approved for payout.`,
        category: 'FINANCIAL',
        priority: 'MEDIUM',
        sourceEntityType: 'commission',
        sourceEntityId: id,
      });
    } catch (notifErr) {
      logger.warn('Failed to send commission approval notification:', { error: notifErr.message });
    }

    return updated;
  }

  /**
   * Record payout / settlement for an approved commission
   */
  static async recordPayout(id, data, req = null) {
    const commission = await this.getCommissionById(id, req);

    // Check capability: COMMISSION_PAYOUT
    const capCheck = await AccessControlService.canAccess(req?.user, 'COMMISSION_PAYOUT');
    if (!capCheck.allowed) {
      throw new ForbiddenError(`Commission payout requires authorized capability (${capCheck.reason}).`);
    }

    if (commission.status !== 'APPROVED') {
      throw new ValidationError(`Cannot disburse payout: Commission status is '${commission.status}'. Only APPROVED commissions can be paid.`);
    }

    if (!data.payment_reference || !data.payment_reference.trim()) {
      throw new ValidationError('A payment transaction reference is required for commission payout settlement.');
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const paymentMethod = data.payment_method || 'BANK_TRANSFER';
    const paymentRef = data.payment_reference.trim();

    await CommissionsRepository.update(id, {
      status: 'PAID',
      paid_by_id: req?.user?.id || null,
      paid_at: nowStr,
      payment_reference: paymentRef,
      payment_method: paymentMethod,
      notes: data.notes ? (commission.notes ? `${commission.notes} | ${data.notes.trim()}` : data.notes.trim()) : commission.notes,
    });

    const updated = await CommissionsRepository.findById(id);

    // Audit log
    await AuditService.record({
      req,
      actorId: req?.user?.id,
      actorEmail: req?.user?.email,
      actorRole: req?.user?.role,
      action: 'COMMISSION_PAID',
      entityType: 'commission',
      entityId: String(id),
      oldValues: { status: commission.status },
      newValues: {
        status: 'PAID',
        paidById: req?.user?.id,
        paidAt: nowStr,
        paymentReference: paymentRef,
        paymentMethod,
      },
    });

    // Notify agent
    try {
      await NotificationsService.dispatchNotification({
        recipientRole: 'AGENT',
        title: `Commission Disbursed: ${commission.commission_code}`,
        message: `Payout of ₦${Number(commission.commission_amount).toLocaleString()} (${paymentMethod} - Ref: ${paymentRef}) has been disbursed.`,
        category: 'FINANCIAL',
        priority: 'HIGH',
        sourceEntityType: 'commission',
        sourceEntityId: id,
      });
    } catch (notifErr) {
      logger.warn('Failed to send commission payout notification:', { error: notifErr.message });
    }

    return updated;
  }

  /**
   * Void a commission record
   */
  static async voidCommission(id, { reason }, req = null) {
    if (!reason || reason.trim().length < 3) {
      throw new ValidationError('A void reason is required (minimum 3 characters).');
    }

    const commission = await this.getCommissionById(id, req);

    if (commission.status === 'VOIDED') {
      throw new ConflictError(`Commission #${commission.commission_code} is already voided.`);
    }

    if (commission.status === 'PAID' && !['SUPER_ADMIN', 'OWNER'].includes(req?.user?.role)) {
      throw new ForbiddenError('A disbursed commission can only be voided by Super Admin or Owner.');
    }

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await CommissionsRepository.update(id, {
      status: 'VOIDED',
      voided_by_id: req?.user?.id || null,
      voided_at: nowStr,
      void_reason: reason.trim(),
    });

    const updated = await CommissionsRepository.findById(id);

    // Audit log
    await AuditService.record({
      req,
      actorId: req?.user?.id,
      actorEmail: req?.user?.email,
      actorRole: req?.user?.role,
      action: 'COMMISSION_VOIDED',
      entityType: 'commission',
      entityId: String(id),
      oldValues: { status: commission.status },
      newValues: { status: 'VOIDED', voidReason: reason.trim(), voidedById: req?.user?.id, voidedAt: nowStr },
    });

    return updated;
  }

  /**
   * Handle reservation cancellation or full refund reconciliation
   */
  static async reconcileCancellationOrRefund(reservationId, conn = null) {
    const commission = await CommissionsRepository.findByReservationId(reservationId);
    if (!commission) return;

    if (['PENDING', 'CALCULATED', 'APPROVED'].includes(commission.status)) {
      await CommissionsRepository.update(
        commission.id,
        {
          status: 'CANCELLED',
          notes: commission.notes ? `${commission.notes} | Cancelled due to reservation cancellation/refund` : 'Cancelled due to reservation cancellation/refund',
        },
        conn
      );
    }
  }

  /**
   * Summary KPI metrics
   */
  static async getSummary(query, req = null) {
    return CommissionsRepository.getSummary({
      ...query,
      user: req?.user,
    });
  }
}

module.exports = CommissionsService;
