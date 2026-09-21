const ReservationsRepository = require('./reservations.repository');
const ReservationsService = require('./reservations.service');
const ApiResponse = require('../../utils/apiResponse');
const { NotFoundError } = require('../../core/errors/apiError');

class ReservationsController {
  static async getAll(req, res, next) {
    try {
      const propertyId = req.query.propertyId || req.headers['x-property-id'];
      const status = req.query.status;

      // Agent data isolation: if user is Agent, restrict strictly to their agentId
      let agentId = req.query.agentId;
      if (req.user?.role === 'AGENT') {
        agentId = req.user.agentId || 1;
      }

      const reservations = await ReservationsRepository.findAll({ propertyId, status, agentId });
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
}

module.exports = ReservationsController;
