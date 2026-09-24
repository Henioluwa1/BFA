const AgentsService = require('./agents.service');

class AgentsController {
  static async getAll(req, res, next) {
    try {
      const result = await AgentsService.listAgents(req.query, req);
      res.status(200).json({
        success: true,
        data: result.agents,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const agent = await AgentsService.getAgentById(req.params.id, req);
      res.status(200).json({
        success: true,
        data: agent,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const agent = await AgentsService.createAgent(req.body, req);
      res.status(201).json({
        success: true,
        message: 'Agent created successfully',
        data: agent,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const updated = await AgentsService.updateAgent(req.params.id, req.body, req);
      res.status(200).json({
        success: true,
        message: 'Agent updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req, res, next) {
    try {
      const { status } = req.body;
      const updated = await AgentsService.updateStatus(req.params.id, status, req);
      res.status(200).json({
        success: true,
        message: `Agent status updated to ${status}`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getClients(req, res, next) {
    try {
      const clients = await AgentsService.getClients(req.params.id, req);
      res.status(200).json({
        success: true,
        data: clients,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPerformance(req, res, next) {
    try {
      const performance = await AgentsService.getPerformance(req.params.id, req);
      res.status(200).json({
        success: true,
        data: performance,
      });
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      const result = await AgentsService.deleteAgent(req.params.id, req);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AgentsController;
