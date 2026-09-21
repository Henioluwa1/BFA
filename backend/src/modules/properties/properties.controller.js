const PropertiesRepository = require('./properties.repository');
const ApiResponse = require('../../utils/apiResponse');
const { NotFoundError } = require('../../core/errors/apiError');

class PropertiesController {
  static async getAll(req, res, next) {
    try {
      const properties = await PropertiesRepository.findAll();
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
      const property = await PropertiesRepository.findById(req.params.id);
      if (!property) {
        throw new NotFoundError(`Property with ID ${req.params.id} not found.`);
      }
      return ApiResponse.success(res, {
        message: 'Property details retrieved successfully',
        data: property,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = PropertiesController;
