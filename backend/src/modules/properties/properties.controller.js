const PropertiesService = require('./properties.service');
const ApiResponse = require('../../utils/apiResponse');

class PropertiesController {
  static async getAll(req, res, next) {
    try {
      const properties = await PropertiesService.listProperties({
        search: req.query.q || req.query.search,
        status: req.query.status,
        user: req.user,
      });
      return ApiResponse.success(res, {
        message: 'Properties retrieved successfully',
        data: properties,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const property = await PropertiesService.getPropertyById(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Property details retrieved successfully',
        data: property,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const property = await PropertiesService.createProperty(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Property created successfully',
        data: property,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const property = await PropertiesService.updateProperty(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Property updated successfully',
        data: property,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req, res, next) {
    try {
      const property = await PropertiesService.updatePropertyStatus(req.params.id, req.body.status, req.user, req);
      return ApiResponse.success(res, {
        message: 'Property status updated successfully',
        data: property,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getApartments(req, res, next) {
    try {
      const apartments = await PropertiesService.getPropertyApartments(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Property apartments retrieved successfully',
        data: apartments,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = PropertiesController;
