const SearchService = require('./search.service');
const ApiResponse = require('../../utils/apiResponse');

class SearchController {
  static async search(req, res, next) {
    try {
      const { q, propertyId, type, limit } = req.query;
      const activePropertyId = propertyId || req.headers['x-property-id'];

      const userRole = req.user?.role || 'ADMIN';
      const agentId = req.user?.agentId;

      const results = await SearchService.search({
        query: q,
        propertyId: activePropertyId,
        type,
        userRole,
        agentId,
        limit,
      });

      return ApiResponse.success(res, {
        message: 'Search query executed successfully',
        data: results,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = SearchController;
