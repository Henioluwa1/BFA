const { z } = require('zod');
const { NavigationRegistry } = require('../navigation/navigationRegistry');
const { NotFoundError, ForbiddenError, ValidationError } = require('../../../core/errors/apiError');

module.exports = {
  actionId: 'navigation.navigate',
  description: 'Navigate to an authorized application page or record within the BFA portal.',
  category: 'NAVIGATION',
  classification: 'READ',
  riskLevel: 'LOW',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
  requiredCapability: null,
  requiresConfirmation: false,
  requiresDualApproval: false,

  inputSchema: z
    .object({
      destination: z.string().min(1, 'Destination route or keyword is required'),
      params: z.record(z.any()).optional().default({}),
      query: z.record(z.any()).optional().default({}),
    })
    .strict(),

  propertyScoping: {
    mode: 'OPTIONAL',
  },

  summaryBuilder: (params) => `Navigate to ${params.destination}`,

  async execute({ params, user }) {
    const rawDest = (params.destination || '').trim();
    if (!rawDest) {
      throw new ValidationError('A valid destination string is required.');
    }

    // 1. Check direct routeId match
    let route = NavigationRegistry.getRouteById(rawDest);

    // 2. If not found by routeId, try natural language match
    if (!route) {
      const matchResult = NavigationRegistry.matchPhrase(rawDest, user.role);
      if (matchResult.status === 'MATCHED') {
        route = matchResult.route;
        if (matchResult.params && Object.keys(matchResult.params).length > 0) {
          params.params = { ...matchResult.params, ...params.params };
        }
      } else if (matchResult.status === 'AMBIGUOUS') {
        const candidateNames = matchResult.candidates.map((c) => `**${c.displayName}**`).join(', ');
        throw new ValidationError(`Your request could refer to multiple destinations: ${candidateNames}. Please specify which page you would like to open.`);
      }
    }

    if (!route) {
      throw new NotFoundError(`Destination '${rawDest}' is not recognized. Please check the page name or ask for your dashboard.`);
    }

    // 3. Verify user authorization
    const userRole = (user?.role || '').toUpperCase();
    if (!NavigationRegistry.isAuthorized(route, userRole)) {
      throw new ForbiddenError(`Access Restricted: Your role (${userRole}) is not authorized to navigate to '${route.displayName}'.`);
    }

    // 4. Construct interpolated path
    const resolvedPath = NavigationRegistry.buildPath(route, params.params || {}, params.query || {});

    return {
      navigationAction: true,
      routeId: route.routeId,
      path: resolvedPath,
      displayName: route.displayName,
      moduleGroup: route.moduleGroup,
      params: params.params || {},
      query: params.query || {},
    };
  },
};
