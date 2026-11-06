const FrontOfficeService = require('./frontOffice.service');

class FrontOfficeController {
  static async getArrivals(req, res, next) {
    try {
      const arrivals = await FrontOfficeService.getArrivals(req.query, req);
      res.status(200).json({
        success: true,
        data: arrivals,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getDepartures(req, res, next) {
    try {
      const departures = await FrontOfficeService.getDepartures(req.query, req);
      res.status(200).json({
        success: true,
        data: departures,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getCurrentGuests(req, res, next) {
    try {
      const guests = await FrontOfficeService.getCurrentGuests(req.query, req);
      res.status(200).json({
        success: true,
        data: guests,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPendingBookings(req, res, next) {
    try {
      const pending = await FrontOfficeService.getPendingBookings(req.query, req);
      res.status(200).json({
        success: true,
        data: pending,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getLiveOperationalFeed(req, res, next) {
    try {
      const feed = await FrontOfficeService.getLiveOperationalFeed(req.query, req);
      res.status(200).json({
        success: true,
        data: feed,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getStats(req, res, next) {
    try {
      const stats = await FrontOfficeService.getOperationalStats(req.query, req);
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }

  static async acceptReservation(req, res, next) {
    try {
      const reservationId = req.params.id || req.body?.reservationId || req.body?.reservation_id;
      const updated = await FrontOfficeService.acceptReservation(reservationId, req);
      res.status(200).json({
        success: true,
        message: `Client ${updated.tenant_name} accepted and assigned to you. Booking is approved.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async claimReservation(req, res, next) {
    try {
      const reservationId = req.params.id || req.body?.reservationId || req.body?.reservation_id;
      const updated = await FrontOfficeService.claimReservation(reservationId, req);
      res.status(200).json({
        success: true,
        message: `Reservation #${updated.reservation_code} claimed successfully.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async approveReservation(req, res, next) {
    try {
      const reservationId = req.params.id || req.body?.reservationId || req.body?.reservation_id;
      const updated = await FrontOfficeService.approveReservation(reservationId, req);
      res.status(200).json({
        success: true,
        message: `Payment verified and reservation #${updated.reservation_code} approved!`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async declineReservation(req, res, next) {
    try {
      const reservationId = req.params.id || req.body?.reservationId || req.body?.reservation_id;
      const { reason, notes } = req.body || {};
      const updated = await FrontOfficeService.declineReservation(reservationId, { reason, notes }, req);
      res.status(200).json({
        success: true,
        message: `Reservation #${updated.reservation_code} declined.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPaymentProof(req, res, next) {
    try {
      const path = require('path');
      const fs = require('fs');
      const pool = require('../../db/pool');
      const { NotFoundError } = require('../../core/errors/apiError');
      const ReservationsRepository = require('../reservations/reservations.repository');
      const ReservationsService = require('../reservations/reservations.service');

      const reservationId = parseInt(req.params.id, 10);
      if (isNaN(reservationId)) {
        throw new NotFoundError("Reservation with ID " + req.params.id + " not found.");
      }

      const reservation = await ReservationsRepository.findById(reservationId);
      if (!reservation) {
        throw new NotFoundError("Reservation with ID " + req.params.id + " not found.");
      }

      // Check property scope authorization before accessing proof metadata or file contents
      ReservationsService.validatePropertyScope(req.user, reservation.property_id);

      let filePath = reservation.payment_proof_path;

      if (!filePath) {
        const attRows = await pool.query(
          'SELECT file_path FROM operational_evidence_attachments WHERE reservation_id = ? AND evidence_category = "BANK_TRANSFER_SLIP" LIMIT 1',
          [reservationId]
        );
        filePath = attRows[0]?.file_path;
      }

      if (filePath && !path.isAbsolute(filePath)) {
        filePath = path.resolve(__dirname, '../../../', filePath.replace(/^\/+/, ''));
      }

      if (!filePath || !fs.existsSync(filePath)) {
        throw new NotFoundError('No payment proof file found for this reservation.');
      }

      res.sendFile(path.resolve(filePath));
    } catch (err) {
      next(err);
    }
  }

  static async checkIn(req, res, next) {
    try {
      const updated = await FrontOfficeService.quickCheckIn(req.params.id, req);
      res.status(200).json({
        success: true,
        message: 'Guest successfully checked in.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async checkOut(req, res, next) {
    try {
      const updated = await FrontOfficeService.quickCheckOut(req.params.id, req);
      res.status(200).json({
        success: true,
        message: 'Guest successfully checked out.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async noShow(req, res, next) {
    try {
      const updated = await FrontOfficeService.quickNoShow(req.params.id, req.body, req);
      res.status(200).json({
        success: true,
        message: 'Reservation marked as NO_SHOW.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = FrontOfficeController;
