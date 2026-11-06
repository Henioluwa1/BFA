const PropertySubmissionsService = require('./propertySubmissions.service');
const ApiResponse = require('../../utils/apiResponse');

class PropertySubmissionsController {
  static async create(req, res, next) {
    try {
      const { propertyId, submissionType, contentSnapshot, mediaAssetIds } = req.body;
      const data = await PropertySubmissionsService.createSubmission({
        propertyId,
        submissionType,
        contentSnapshot,
        mediaAssetIds,
        user: req.user,
        req,
      });
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Property submission created and queued for dual review.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async list(req, res, next) {
    try {
      const data = await PropertySubmissionsService.listSubmissions(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Property submissions retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const data = await PropertySubmissionsService.getSubmissionById(
        parseInt(req.params.id, 10),
        req.user
      );
      return ApiResponse.success(res, {
        message: 'Submission details retrieved.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async review(req, res, next) {
    try {
      const {
        action,
        decisionNotes,
        commentTargetType,
        commentTargetId,
        commentType,
        commentContent,
      } = req.body;

      const data = await PropertySubmissionsService.reviewSubmission(
        parseInt(req.params.id, 10),
        {
          action,
          decisionNotes,
          commentTargetType,
          commentTargetId,
          commentType,
          commentContent,
        },
        req.user,
        req
      );

      return ApiResponse.success(res, {
        message: `Submission review recorded: ${action}.`,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async publish(req, res, next) {
    try {
      const data = await PropertySubmissionsService.publishSubmission(
        parseInt(req.params.id, 10),
        req.user,
        req
      );

      return ApiResponse.success(res, {
        message: 'Submission successfully published.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = PropertySubmissionsController;

