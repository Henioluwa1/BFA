const InternalSpacesService = require('./internalSpaces.service');
const ApiResponse = require('../../utils/apiResponse');

class InternalSpacesController {
  static async list(req, res, next) {
    try {
      const apartmentId = parseInt(req.params.id, 10);
      const spaces = await InternalSpacesService.listSpaces(apartmentId);
      return ApiResponse.success(res, {
        message: 'Internal spaces retrieved successfully',
        data: spaces,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const apartmentId = parseInt(req.params.id, 10);
      const space = await InternalSpacesService.createSpace(apartmentId, req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Internal space created successfully',
        data: space,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const spaceId = parseInt(req.params.spaceId, 10);
      const updated = await InternalSpacesService.updateSpace(spaceId, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Internal space updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req, res, next) {
    try {
      const spaceId = parseInt(req.params.spaceId, 10);
      const result = await InternalSpacesService.deleteSpace(spaceId, req.user, req);
      return ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }

  static async uploadMedia(req, res, next) {
    try {
      const spaceId = parseInt(req.params.spaceId, 10);
      const mediaItems = req.body.images || req.body.mediaItems || req.body;
      const result = await InternalSpacesService.uploadSpaceMedia(spaceId, mediaItems, req.user, req);
      return ApiResponse.created(res, {
        message: 'Space photographs uploaded successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteMedia(req, res, next) {
    try {
      const spaceId = parseInt(req.params.spaceId, 10);
      const mediaId = parseInt(req.params.mediaId, 10);
      const result = await InternalSpacesService.deleteSpaceMedia(spaceId, mediaId, req.user, req);
      return ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = InternalSpacesController;
