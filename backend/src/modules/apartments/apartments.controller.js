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

  static async updateReadiness(req, res, next) {
    try {
      const apartment = await ApartmentsService.updateApartmentReadiness(
        req.params.id,
        req.body,
        req.user,
        req
      );
      return ApiResponse.success(res, {
        message: 'Apartment readiness status updated successfully',
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

  static async addBlockedPeriod(req, res, next) {
    try {
      const data = await ApartmentsService.addBlockedPeriod(req.params.id, req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'Unit blocked period created successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getBlockedPeriods(req, res, next) {
    try {
      const data = await ApartmentsService.getBlockedPeriods(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Blocked periods retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteBlockedPeriod(req, res, next) {
    try {
      const data = await ApartmentsService.deleteBlockedPeriod(req.params.id, req.params.blockId, req.user, req);
      return ApiResponse.success(res, {
        message: 'Blocked period removed successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async uploadMedia(req, res, next) {
    try {
      const mediaItems = req.body.media || req.body.items || req.body;
      const result = await ApartmentsService.uploadApartmentMedia(
        parseInt(req.params.id, 10),
        mediaItems,
        req.user,
        req
      );
      return ApiResponse.created(res, {
        message: 'Apartment photographs uploaded successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMedia(req, res, next) {
    try {
      const media = await ApartmentsService.getApartmentMedia(parseInt(req.params.id, 10));
      return ApiResponse.success(res, {
        message: 'Apartment media retrieved successfully',
        data: media,
      });
    } catch (err) {
      next(err);
    }
  }

  static async setCover(req, res, next) {
    try {
      const result = await ApartmentsService.setCoverImage(
        parseInt(req.params.id, 10),
        parseInt(req.params.mediaId, 10),
        req.user
      );
      return ApiResponse.success(res, { message: result.message, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async reorderMedia(req, res, next) {
    try {
      const orderedIds = req.body.orderedIds || req.body;
      const result = await ApartmentsService.reorderMedia(
        parseInt(req.params.id, 10),
        orderedIds,
        req.user
      );
      return ApiResponse.success(res, { message: result.message, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async publishMedia(req, res, next) {
    try {
      const isPublished = req.body.isPublished !== undefined ? req.body.isPublished : true;
      const result = await ApartmentsService.publishMedia(
        parseInt(req.params.id, 10),
        parseInt(req.params.mediaId, 10),
        isPublished,
        req.user
      );
      return ApiResponse.success(res, { message: result.message, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async deleteMedia(req, res, next) {
    try {
      const result = await ApartmentsService.deleteMedia(
        parseInt(req.params.id, 10),
        parseInt(req.params.mediaId, 10),
        req.user
      );
      return ApiResponse.success(res, { message: result.message, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async createAmenities(req, res, next) {
    try {
      const amenitiesList = req.body.amenities || req.body;
      const result = await ApartmentsService.saveApartmentAmenities(
        parseInt(req.params.id, 10),
        amenitiesList,
        req.user,
        req
      );
      return ApiResponse.success(res, {
        message: 'Apartment amenities saved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAmenities(req, res, next) {
    try {
      const amenities = await ApartmentsService.getApartmentAmenities(parseInt(req.params.id, 10));
      return ApiResponse.success(res, {
        message: 'Apartment amenities retrieved successfully',
        data: amenities,
      });
    } catch (err) {
      next(err);
    }
  }

  static async archive(req, res, next) {
    try {
      const mode = req.query.mode === 'delete' ? 'delete' : 'archive';
      const result = await ApartmentsService.archiveApartment(req.params.id, req.user, req, { mode });
      return ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ApartmentsController;
