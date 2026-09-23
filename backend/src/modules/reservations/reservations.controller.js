const ReservationsRepository = require('./reservations.repository');
const ReservationsService = require('./reservations.service');
const ApiResponse = require('../../utils/apiResponse');
const { NotFoundError, ForbiddenError } = require('../../core/errors/apiError');

class ReservationsController {
  static async getAll(req, res, next) {
    try {
      const propertyId = req.query.propertyId || req.headers['x-property-id'];
      const {
        apartmentId,
        status,
        search,
        source,
        fromDate,
        toDate,
        paymentStatus,
        page,
        pageSize,
      } = req.query;

      // Agent data isolation: if user is Agent, restrict strictly to their agentId
      let agentId = req.query.agentId;
      if (req.user?.role === 'AGENT') {
        agentId = req.user.agentId || 1;
      }

      const reservations = await ReservationsRepository.findAll({
        propertyId,
        apartmentId,
        status,
        search,
        source,
        agentId,
        fromDate,
        toDate,
        paymentStatus,
        page,
        pageSize,
        user: req.user,
      });

      return ApiResponse.success(res, {
        message: 'Reservations retrieved successfully',
        data: reservations,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const reservation = await ReservationsRepository.findById(req.params.id);
      if (!reservation) {
        throw new NotFoundError(`Reservation with ID ${req.params.id} not found.`);
      }

      // Check agent isolation
      if (req.user?.role === 'AGENT' && reservation.agent_id !== req.user.agentId) {
        throw new NotFoundError(`Reservation with ID ${req.params.id} not found.`);
      }

      // Check property scope
      ReservationsService.validatePropertyScope(req.user, reservation.property_id);

      return ApiResponse.success(res, {
        message: 'Reservation details retrieved successfully',
        data: reservation,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const newReservation = await ReservationsService.createReservation(req.body, req);
      return ApiResponse.created(res, {
        message: 'Reservation created successfully under 1-night maximum policy',
        data: newReservation,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const updated = await ReservationsService.updateReservation(req.params.id, req.body, req);
      return ApiResponse.success(res, {
        message: 'Reservation updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async confirm(req, res, next) {
    try {
      const confirmed = await ReservationsService.confirmReservation(req.params.id, req);
      return ApiResponse.success(res, {
        message: 'Reservation confirmed successfully',
        data: confirmed,
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancel(req, res, next) {
    try {
      const cancelled = await ReservationsService.cancelReservation(req.params.id, req.body, req);
      return ApiResponse.success(res, {
        message: 'Reservation cancelled successfully',
        data: cancelled,
      });
    } catch (err) {
      next(err);
    }
  }

  static async checkIn(req, res, next) {
    try {
      const checkedIn = await ReservationsService.checkInReservation(req.params.id, req);
      return ApiResponse.success(res, {
        message: 'Guest successfully checked in. Unit marked OCCUPIED.',
        data: checkedIn,
      });
    } catch (err) {
      next(err);
    }
  }

  static async checkOut(req, res, next) {
    try {
      const checkedOut = await ReservationsService.checkOutReservation(req.params.id, req);
      return ApiResponse.success(res, {
        message: 'Guest successfully checked out. Unit marked DIRTY for housekeeping.',
        data: checkedOut,
      });
    } catch (err) {
      next(err);
    }
  }

  static async noShow(req, res, next) {
    try {
      const updated = await ReservationsService.noShowReservation(req.params.id, req.body, req);
      return ApiResponse.success(res, {
        message: 'Reservation marked as NO_SHOW.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getHistory(req, res, next) {
    try {
      const history = await ReservationsRepository.getStatusHistory(req.params.id);
      return ApiResponse.success(res, {
        message: 'Reservation status history retrieved successfully',
        data: history,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ReservationsController;
