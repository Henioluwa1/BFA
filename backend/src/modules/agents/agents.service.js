const AgentsRepository = require('./agents.repository');
const AuditService = require('../../core/audit/audit.service');
const NotificationsService = require('../notifications/notifications.service');
const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = require('../../core/errors/apiError');
const pool = require('../../db/pool');

class AgentsService {
  /**
   * List agents with filtering and scoping
   */
  static async listAgents(query, req = null) {
    return AgentsRepository.findAll({
      ...query,
      user: req?.user,
    });
  }

  /**
   * Get agent by ID with security checks
   */
  static async getAgentById(id, req = null) {
    const agent = await AgentsRepository.findById(id);
    if (!agent) {
      throw new NotFoundError(`Agent #${id} not found.`);
    }

    // Role check: if AGENT, only see own record
    if (req?.user?.role === 'AGENT' && req.user.agentId !== parseInt(id, 10)) {
      throw new ForbiddenError('You are only authorized to view your own agent profile.');
    }

    // Property scope check
    if (
      req?.user?.propertyId &&
      !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(req?.user?.role) &&
      agent.property_id &&
      agent.property_id !== req.user.propertyId
    ) {
      throw new ForbiddenError('You do not have access to agents from this property.');
    }

    return agent;
  }

  /**
   * Create new agent
   */
  static async createAgent(data, req = null) {
    if (!data.name || !data.name.trim()) {
      throw new ValidationError('Agent name is required.');
    }
    if (!data.email || !data.email.trim()) {
      throw new ValidationError('Agent email is required.');
    }
    if (!data.phone || !data.phone.trim()) {
      throw new ValidationError('Agent phone number is required.');
    }

    const cleanEmail = data.email.trim().toLowerCase();
    const existing = await AgentsRepository.findByEmail(cleanEmail);
    if (existing) {
      throw new ConflictError(`An agent with email '${cleanEmail}' already exists (ID: #${existing.id}).`);
    }

    const commissionType = data.commission_type || 'PERCENTAGE';
    if (!['PERCENTAGE', 'FIXED'].includes(commissionType)) {
      throw new ValidationError("Invalid commission type. Allowed values are 'PERCENTAGE' or 'FIXED'.");
    }

    const commissionRate = data.commission_rate !== undefined ? parseFloat(data.commission_rate) : 10.00;
    if (isNaN(commissionRate) || commissionRate < 0) {
      throw new ValidationError('Commission rate must be a non-negative number.');
    }
    if (commissionType === 'PERCENTAGE' && commissionRate > 100) {
      throw new ValidationError('Percentage commission rate cannot exceed 100%.');
    }

    const status = data.status || 'ACTIVE';
    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
      throw new ValidationError("Invalid status. Allowed values are 'ACTIVE', 'INACTIVE', or 'SUSPENDED'.");
    }

    const agentId = await AgentsRepository.create({
      name: data.name.trim(),
      agency_name: data.agency_name ? data.agency_name.trim() : null,
      email: cleanEmail,
      phone: data.phone.trim(),
      commission_rate: commissionRate,
      commission_type: commissionType,
      property_id: data.property_id || null,
      bank_name: data.bank_name ? data.bank_name.trim() : null,
      account_number: data.account_number ? data.account_number.trim() : null,
      account_name: data.account_name ? data.account_name.trim() : null,
      notes: data.notes ? data.notes.trim() : null,
      status,
    });

    const created = await AgentsRepository.findById(agentId);

    // Audit log
    await AuditService.record({
      req,
      actorId: req?.user?.id,
      actorEmail: req?.user?.email,
      actorRole: req?.user?.role,
      action: 'AGENT_CREATED',
      entityType: 'agent',
      entityId: String(agentId),
      newValues: {
        name: created.name,
        agencyName: created.agency_name,
        email: created.email,
        commissionRate: created.commission_rate,
        commissionType: created.commission_type,
        status: created.status,
      },
    });

    return created;
  }

  /**
   * Update existing agent
   */
  static async updateAgent(id, data, req = null) {
    const existing = await this.getAgentById(id, req);

    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      if (cleanEmail !== existing.email.toLowerCase()) {
        const duplicate = await AgentsRepository.findByEmail(cleanEmail);
        if (duplicate && duplicate.id !== parseInt(id, 10)) {
          throw new ConflictError(`An agent with email '${cleanEmail}' already exists.`);
        }
      }
      data.email = cleanEmail;
    }

    if (data.commission_type && !['PERCENTAGE', 'FIXED'].includes(data.commission_type)) {
      throw new ValidationError("Invalid commission type. Allowed values are 'PERCENTAGE' or 'FIXED'.");
    }

    if (data.commission_rate !== undefined) {
      const rate = parseFloat(data.commission_rate);
      if (isNaN(rate) || rate < 0) {
        throw new ValidationError('Commission rate must be a non-negative number.');
      }
      const type = data.commission_type || existing.commission_type;
      if (type === 'PERCENTAGE' && rate > 100) {
        throw new ValidationError('Percentage commission rate cannot exceed 100%.');
      }
      data.commission_rate = rate;
    }

    if (data.status && !['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(data.status)) {
      throw new ValidationError("Invalid status. Allowed values are 'ACTIVE', 'INACTIVE', or 'SUSPENDED'.");
    }

    await AgentsRepository.update(id, data);
    const updated = await AgentsRepository.findById(id);

    // Audit log
    await AuditService.record({
      req,
      actorId: req?.user?.id,
      actorEmail: req?.user?.email,
      actorRole: req?.user?.role,
      action: 'AGENT_UPDATED',
      entityType: 'agent',
      entityId: String(id),
      oldValues: {
        name: existing.name,
        commissionRate: existing.commission_rate,
        commissionType: existing.commission_type,
        status: existing.status,
      },
      newValues: data,
    });

    return updated;
  }

  /**
   * Change agent status (ACTIVE, INACTIVE, SUSPENDED)
   */
  static async updateStatus(id, status, req = null) {
    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
      throw new ValidationError("Invalid status. Allowed values are 'ACTIVE', 'INACTIVE', or 'SUSPENDED'.");
    }

    const existing = await this.getAgentById(id, req);
    if (existing.status === status) {
      return existing;
    }

    await AgentsRepository.update(id, { status });
    const updated = await AgentsRepository.findById(id);

    // Audit log
    await AuditService.record({
      req,
      actorId: req?.user?.id,
      actorEmail: req?.user?.email,
      actorRole: req?.user?.role,
      action: 'AGENT_STATUS_CHANGED',
      entityType: 'agent',
      entityId: String(id),
      oldValues: { status: existing.status },
      newValues: { status },
    });

    return updated;
  }

  /**
   * Get referred clients
   */
  static async getClients(id, req = null) {
    await this.getAgentById(id, req);
    return AgentsRepository.getClients(id);
  }

  /**
   * Get performance metrics
   */
  static async getPerformance(id, req = null) {
    await this.getAgentById(id, req);
    return AgentsRepository.getPerformance(id);
  }

  /**
   * Safe delete or deactivate agent
   */
  static async deleteAgent(id, req = null) {
    const existing = await this.getAgentById(id, req);

    // Check if agent has active reservations or commissions
    const resCount = await pool.query('SELECT COUNT(*) as count FROM reservations WHERE agent_id = ?', [id]);
    const comCount = await pool.query('SELECT COUNT(*) as count FROM commissions WHERE agent_id = ?', [id]);

    const totalRecords = parseInt(resCount[0]?.count || 0, 10) + parseInt(comCount[0]?.count || 0, 10);

    if (totalRecords > 0) {
      // Deactivate rather than delete to maintain historical financial and reservation integrity
      await AgentsRepository.update(id, { status: 'INACTIVE' });
      await AuditService.record({
        req,
        actorId: req?.user?.id,
        actorEmail: req?.user?.email,
        actorRole: req?.user?.role,
        action: 'AGENT_DEACTIVATED',
        entityType: 'agent',
        entityId: String(id),
        oldValues: { status: existing.status },
        newValues: { status: 'INACTIVE', reason: 'Deactivated due to existing transaction history' },
      });
      return {
        deleted: false,
        deactivated: true,
        message: 'Agent has existing reservations or commissions. Profile status set to INACTIVE to preserve audit integrity.',
      };
    }

    await pool.query('DELETE FROM agents WHERE id = ?', [id]);
    await AuditService.record({
      req,
      actorId: req?.user?.id,
      actorEmail: req?.user?.email,
      actorRole: req?.user?.role,
      action: 'AGENT_DELETED',
      entityType: 'agent',
      entityId: String(id),
      oldValues: { name: existing.name, email: existing.email },
    });

    return {
      deleted: true,
      deactivated: false,
      message: 'Agent profile deleted successfully.',
    };
  }
}

module.exports = AgentsService;
