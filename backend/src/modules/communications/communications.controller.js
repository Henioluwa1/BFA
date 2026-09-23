const CommunicationsService = require('./communications.service');
const ApiResponse = require('../../utils/apiResponse');

class CommunicationsController {
  static async list(req, res, next) {
    try {
      const { status, type, propertyId, page, pageSize } = req.query;
      const data = await CommunicationsService.listCommunications({
        status,
        type,
        propertyId,
        user: req.user,
        page,
        pageSize,
      });
      return ApiResponse.success(res, {
        message: 'Communications retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const data = await CommunicationsService.getCommunicationById(req.params.id);
      return ApiResponse.success(res, {
        message: 'Communication details retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const result = await CommunicationsService.createCommunication({
        ...req.body,
        user: req.user,
        req,
      });
      return ApiResponse.created(res, {
        message: 'Communication created successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async submit(req, res, next) {
    try {
      const result = await CommunicationsService.submitCommunication(req.params.id, req.user, req);
      return ApiResponse.success(res, {
        message: 'Communication submitted for approval.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async approve(req, res, next) {
    try {
      const { notes, reviewNotes } = req.body;
      const result = await CommunicationsService.approveCommunication(req.params.id, req.user, notes || reviewNotes, req);
      return ApiResponse.success(res, {
        message: 'Communication approved successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async reject(req, res, next) {
    try {
      const { notes, reviewNotes } = req.body;
      const result = await CommunicationsService.rejectCommunication(req.params.id, req.user, notes || reviewNotes, req);
      return ApiResponse.success(res, {
        message: 'Communication rejected.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async send(req, res, next) {
    try {
      const result = await CommunicationsService.sendCommunication(req.params.id, req.user, req);
      return ApiResponse.success(res, {
        message: 'Communication sent successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listTemplates(req, res, next) {
    try {
      const data = await CommunicationsService.listTemplates();
      return ApiResponse.success(res, {
        message: 'Templates retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createTemplate(req, res, next) {
    try {
      const result = await CommunicationsService.createTemplate({
        ...req.body,
        user: req.user,
      });
      return ApiResponse.created(res, {
        message: 'Template created successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CommunicationsController;
