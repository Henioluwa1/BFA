const BookingAuthService = require('./bookingAuth.service');
const ApiResponse = require('../../utils/apiResponse');

class BookingAuthController {
  static async verifyBooking(req, res, next) {
    try {
      const { authCode, guestEmail, guestPhone } = req.body;
      const data = await BookingAuthService.verifyAndLookup({
        authCode,
        guestEmail,
        guestPhone,
        req,
      });
      return ApiResponse.success(res, {
        message: 'Booking authenticated successfully.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async lookupByQuery(req, res, next) {
    try {
      const { code, email, phone } = req.query;
      const data = await BookingAuthService.verifyAndLookup({
        authCode: code,
        guestEmail: email,
        guestPhone: phone,
        req,
      });
      return ApiResponse.success(res, {
        message: 'Booking authenticated successfully.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = BookingAuthController;
