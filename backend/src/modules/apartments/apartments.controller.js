const ApartmentsService = require('./apartments.service');
const ApiResponse = require('../../utils/apiResponse');

class ApartmentsController {
  static async getAll(req, res, next) {
    try {
      const propertyId = req.query.propertyId || req.headers['x-property-id'];
      const status = req.query.status;
      const unitType = req.query.unitType;
      const search = req.query.q || req.query.search;
      const page = req.query.page;
      const pageSize = req.query.pageSize;

      const apartments = await ApartmentsService.listApartments({
        propertyId,
        status,
        unitType,
        search,
        user: req.user,
        page,
        pageSize,
      });

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
      const apartment = await ApartmentsService.getApartmentById(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Apartment details retrieved successfully',
        data: apartment,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const apartment = await ApartmentsService.createApartment(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Apartment unit created successfully',
        data: apartment,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const apartment = await ApartmentsService.updateApartment(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'Apartment unit updated successfully',
        data: apartment,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req, res, next) {
    try {
      const apartment = await ApartmentsService.updateApartmentStatus(
        req.params.id,
        req.body.status,
        req.user,
        req
      );
      return ApiResponse.success(res, {
        message: 'Apartment unit status updated successfully',
        data: apartment,
      });
    } catch (err) {
      next(err);
    }
  }

  static async checkAvailability(req, res, next) {
    try {
      const checkInDate = req.query.checkInDate || req.query.date || req.body?.checkInDate || req.body?.date;
      const result = await ApartmentsService.checkAvailability(req.params.id, checkInDate);
      return ApiResponse.success(res, {
        message: 'Unit availability checked successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ApartmentsController;
