const GuestsService = require('./guests.service');

class GuestsController {
  static async getAll(req, res, next) {
    try {
      const guests = await GuestsService.listGuests(req.query, req);
      res.status(200).json({
        success: true,
        data: guests,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const guest = await GuestsService.getGuestById(req.params.id, req);
      res.status(200).json({
        success: true,
        data: guest,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getReservations(req, res, next) {
    try {
      const guest = await GuestsService.getGuestById(req.params.id, req);
      res.status(200).json({
        success: true,
        data: guest.reservations || [],
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const guest = await GuestsService.createGuest(req.body, req);
      res.status(201).json({
        success: true,
        data: guest,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const updated = await GuestsService.updateGuest(req.params.id, req.body, req);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getDuplicates(req, res, next) {
    try {
      const duplicates = await GuestsService.getDuplicates();
      res.status(200).json({
        success: true,
        data: duplicates,
      });
    } catch (err) {
      next(err);
    }
  }

  static async merge(req, res, next) {
    try {
      const { primaryId, duplicateId } = req.body;
      const merged = await GuestsService.mergeProfiles(primaryId, duplicateId, req);
      res.status(200).json({
        success: true,
        data: merged,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = GuestsController;
