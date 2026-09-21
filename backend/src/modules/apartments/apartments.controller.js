const ApartmentsRepository = require('./apartments.repository');
const ApiResponse = require('../../utils/apiResponse');
const { NotFoundError } = require('../../core/errors/apiError');

class ApartmentsController {
  static async getAll(req, res, next) {
    try {
      const propertyId = req.query.propertyId || req.headers['x-property-id'];
      const status = req.query.status;

      const apartments = await ApartmentsRepository.findAll({ propertyId, status });
      return ApiResponse.success(res, {
        message: 'Apartments retrieved successfully',
        data: apartments,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const apartment = await ApartmentsRepository.findById(req.params.id);
      if (!apartment) {
        throw new NotFoundError(`Apartment with ID ${req.params.id} not found.`);
      }
      return ApiResponse.success(res, {
        message: 'Apartment details retrieved successfully',
        data: apartment,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ApartmentsController;
