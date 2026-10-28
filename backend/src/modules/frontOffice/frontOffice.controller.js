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
      const updated = await FrontOfficeService.acceptReservation(req.params.id, req);
      res.status(200).json({
        success: true,
        message: `Client ${updated.tenant_name} accepted and assigned to you. Booking is approved.`,
        data: updated,
      });
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
