const SearchService = require('./search.service');
const ApiResponse = require('../../utils/apiResponse');

// Roles whose property access is strictly scoped to their assigned property
const PROPERTY_SCOPED_ROLES = ['MANAGER', 'RECEPTIONIST', 'STAFF'];

class SearchController {
  static async search(req, res, next) {
    try {
      const { q, propertyId: qPropertyId, type, limit } = req.query;
      const user = req.user; // guaranteed non-null by requireAuth middleware
      const userRole = (user.role || 'STAFF').toUpperCase();
      const agentId = user.agentId;

      // Enforce server-side property isolation for scoped roles.
      // A MANAGER/RECEPTIONIST/STAFF must not be able to search other properties
      // by supplying a different propertyId in the query string.
      let activePropertyId;
      if (PROPERTY_SCOPED_ROLES.includes(userRole) && user.propertyId) {
        activePropertyId = user.propertyId;
      } else {
        activePropertyId = qPropertyId || req.headers['x-property-id'] || null;
      }

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
