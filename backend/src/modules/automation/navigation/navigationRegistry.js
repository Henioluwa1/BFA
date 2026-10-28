/**
 * ============================================================================
 * BFA Intelligent Operations Assistant — Centralized Navigation Registry
 * ============================================================================
 * Authoritative mapping of all verified application routes, display names,
 * module groups, permitted roles, natural-language aliases, and parameter extractors.
 *
 * Source of truth: frontend/src/App.jsx & frontend/src/components/layout/Sidebar.jsx
 * ============================================================================
 */

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'];
const LEADERSHIP_ROLES = ['SUPER_ADMIN', 'ADMIN'];

const ROUTES = [
  // --------------------------------------------------------------------------
  // 1. Dashboard & Core
  // --------------------------------------------------------------------------
  {
    routeId: 'dashboard',
    path: '/app/dashboard',
    displayName: 'Dashboard',
    moduleGroup: 'CORE',
    permittedRoles: ALL_ROLES,
    aliases: [
      'dashboard',
      'my dashboard',
      'home',
      'home page',
      'main page',
      'main screen',
      'start page',
      'overview',
      'return to dashboard',
      'take me home',
      'go home',
      'back to dashboard',
      'command center',
      'telemetry',
    ],
  },

  // --------------------------------------------------------------------------
  // 2. Domain A: Properties & Units
  // --------------------------------------------------------------------------
  {
    routeId: 'properties',
    path: '/app/properties',
    displayName: 'Properties & Buildings',
    moduleGroup: 'PROPERTIES_UNITS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    aliases: [
      'properties',
      'property',
      'buildings',
      'building',
      'properties and buildings',
      'property list',
      'property catalog',
      'properties directory',
      'real estate',
      'estates',
      'view properties',
      'manage properties',
      'open properties',
    ],
  },
  {
    routeId: 'apartments',
    path: '/app/apartments',
    displayName: 'Apartments & Units',
    moduleGroup: 'PROPERTIES_UNITS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
    aliases: [
      'apartments',
      'apartment',
      'units',
      'unit',
      'rooms',
      'room',
      'apartments and units',
      'apartment list',
      'units directory',
      'vacant units',
      'all apartments',
      'available units',
      'manage apartments',
      'inspect units',
      'open apartments',
    ],
  },
  {
    routeId: 'calendar',
    path: '/app/calendar',
    displayName: 'Availability Calendar',
    moduleGroup: 'PROPERTIES_UNITS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'OWNER'],
    aliases: [
      'calendar',
      'availability calendar',
      'booking calendar',
      'reservation calendar',
      'schedule',
      'occupancy calendar',
      'availability matrix',
      'date availability',
      'matrix',
      'open calendar',
      'view calendar',
    ],
  },

  // --------------------------------------------------------------------------
  // 3. Domain B: Front Office & Bookings
  // --------------------------------------------------------------------------
  {
    routeId: 'front_office',
    path: '/app/front-office',
    displayName: 'Daily Front Desk',
    moduleGroup: 'FRONT_OFFICE_BOOKINGS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST'],
    aliases: [
      'front desk',
      'front office',
      'daily front desk',
      'reception',
      'reception desk',
      'check in desk',
      'front desk desk',
      'daily operations',
      'open front desk',
      'front desk console',
      'front office desk',
    ],
  },
  {
    routeId: 'reservations',
    path: '/app/reservations',
    displayName: 'All Reservations',
    moduleGroup: 'FRONT_OFFICE_BOOKINGS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT', 'OWNER'],
    aliases: [
      'reservations',
      'reservation',
      'bookings',
      'booking',
      'all reservations',
      'all bookings',
      'booking list',
      'reservation list',
      'manage reservations',
      'view bookings',
      'find reservation',
      'search reservations',
      'open reservations',
    ],
  },
  {
    routeId: 'guests',
    path: '/app/guests',
    displayName: 'Tenants & Guests',
    moduleGroup: 'FRONT_OFFICE_BOOKINGS',
    permittedRoles: ALL_ROLES,
    aliases: [
      'guests',
      'guest',
      'tenants',
      'tenant',
      'tenants and guests',
      'guest list',
      'tenant list',
      'guest directory',
      'tenant directory',
      'customer profiles',
      'guest profiles',
      'manage guests',
      'open guests',
    ],
  },

  // --------------------------------------------------------------------------
  // 4. Domain C: Staff & Partners
  // --------------------------------------------------------------------------
  {
    routeId: 'employees',
    path: '/app/employees',
    displayName: 'Employees Directory',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    aliases: [
      'employees',
      'employee',
      'staff directory',
      'employees directory',
      'staff list',
      'employee list',
      'manage employees',
      'manage staff',
      'workforce',
      'personnel',
      'open employees',
    ],
  },
  {
    routeId: 'employee_detail',
    path: '/app/employees/:id',
    displayName: 'Employee Profile',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    paramKeys: ['id'],
    aliases: [
      'employee profile',
      'staff profile',
      'view employee',
      'employee details',
    ],
  },
  {
    routeId: 'performance',
    path: '/app/performance',
    displayName: 'Staff Performance',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    aliases: [
      'performance',
      'staff performance',
      'employee performance',
      'evaluations',
      'performance evaluations',
      'staff ratings',
      'kpi',
      'staff kpis',
      'open performance',
      'performance reviews',
    ],
  },
  {
    routeId: 'id_cards',
    path: '/app/id-cards',
    displayName: 'Staff ID Cards',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    aliases: [
      'id cards',
      'id card',
      'staff id cards',
      'employee id cards',
      'badges',
      'staff badges',
      'security cards',
      'id badges',
      'generate id card',
      'open id cards',
    ],
  },
  {
    routeId: 'my_profile',
    path: '/app/my-profile',
    displayName: 'My Profile & Badge',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ALL_ROLES,
    aliases: [
      'my profile',
      'profile',
      'my account',
      'my badge',
      'my id card',
      'user profile',
      'my details',
      'who am i',
      'open my profile',
    ],
  },
  {
    routeId: 'agents',
    path: '/app/agents',
    displayName: 'Agents & Commissions',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    aliases: [
      'agents',
      'agent',
      'partners',
      'commissions',
      'commission',
      'agents and commissions',
      'agent directory',
      'broker commissions',
      'agent payouts',
      'open agents',
    ],
  },

  // --------------------------------------------------------------------------
  // 5. Domain D: Finance & Accounts
  // --------------------------------------------------------------------------
  {
    routeId: 'financial',
    path: '/app/financial',
    displayName: 'Financial Overview',
    moduleGroup: 'FINANCE_ACCOUNTS',
    permittedRoles: ADMIN_ROLES,
    aliases: [
      'finance',
      'financial',
      'financials',
      'financial overview',
      'accounts',
      'accounting',
      'revenue',
      'expenses',
      'ledger',
      'general ledger',
      'outstanding payments',
      'receivables',
      'cashflow',
      'financial dashboard',
      'open financial',
    ],
  },

  // --------------------------------------------------------------------------
  // 6. Domain E: Maintenance & Care
  // --------------------------------------------------------------------------
  {
    routeId: 'maintenance',
    path: '/app/maintenance',
    displayName: 'Work Orders & Repairs',
    moduleGroup: 'MAINTENANCE_CARE',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
    aliases: [
      'maintenance',
      'repairs',
      'work orders',
      'repair requests',
      'work orders and repairs',
      'faults',
      'tickets',
      'maintenance tickets',
      'maintenance requests',
      'facilities',
      'open maintenance',
    ],
  },
  {
    routeId: 'inspection',
    path: '/app/inspection',
    displayName: 'Unit Inspections',
    moduleGroup: 'MAINTENANCE_CARE',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF', 'OWNER'],
    aliases: [
      'inspection',
      'inspections',
      'unit inspections',
      'room inspection',
      'property inspection',
      'audit inspection',
      'move in inspection',
      'move out inspection',
      'open inspection',
    ],
  },

  // --------------------------------------------------------------------------
  // 7. Domain F: Reports & Intelligence
  // --------------------------------------------------------------------------
  {
    routeId: 'analytics',
    path: '/app/analytics',
    displayName: 'Analytics & Trends',
    moduleGroup: 'REPORTS_INTELLIGENCE',
    permittedRoles: ADMIN_ROLES,
    aliases: [
      'analytics',
      'trends',
      'analytics and trends',
      'metrics',
      'statistics',
      'business intelligence',
      'charts',
      'occupancy trends',
      'performance trends',
      'open analytics',
    ],
  },
  {
    routeId: 'reports',
    path: '/app/reports',
    displayName: 'Reports & Exports',
    moduleGroup: 'REPORTS_INTELLIGENCE',
    permittedRoles: ADMIN_ROLES,
    aliases: [
      'reports',
      'exports',
      'reports and exports',
      'download reports',
      'csv export',
      'pdf reports',
      'financial reports',
      'booking reports',
      'open reports',
    ],
  },
  {
    routeId: 'audit',
    path: '/app/audit',
    displayName: 'Audit Trail & Logs',
    moduleGroup: 'REPORTS_INTELLIGENCE',
    permittedRoles: ADMIN_ROLES,
    aliases: [
      'audit',
      'audit trail',
      'audit logs',
      'activity logs',
      'system logs',
      'security logs',
      'compliance logs',
      'audit records',
      'open audit',
    ],
  },

  // --------------------------------------------------------------------------
  // 8. Domain G: System Administration
  // --------------------------------------------------------------------------
  {
    routeId: 'access_control',
    path: '/app/access-control',
    displayName: 'Access Control Policies',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'ADMIN'],
    aliases: [
      'access control',
      'access control policies',
      'capabilities',
      'security policies',
      'policy management',
      'access policies',
      'manage access',
      'permissions management',
      'overrides',
      'approvals',
      'open access control',
    ],
  },
  {
    routeId: 'team',
    path: '/app/team',
    displayName: 'Team & RBAC',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: LEADERSHIP_ROLES,
    aliases: [
      'team',
      'team and rbac',
      'rbac',
      'user accounts',
      'roles and permissions',
      'system users',
      'user management',
      'admin users',
      'open team',
    ],
  },
  {
    routeId: 'settings',
    path: '/app/settings',
    displayName: 'System Settings',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: LEADERSHIP_ROLES,
    aliases: [
      'settings',
      'system settings',
      'configuration',
      'system config',
      'portal settings',
      'app settings',
      'preferences',
      'open settings',
    ],
  },
  {
    routeId: 'operations_control',
    path: '/app/operations',
    displayName: 'Operations Control Center',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'OWNER'],
    aliases: [
      'operations control center',
      'operations center',
      'control center',
      'operations',
      'system governance',
      'governance',
      'subsystem health',
      'operations control',
      'open operations',
      'open control center',
    ],
  },
  {
    routeId: 'announcements',
    path: '/app/announcements',
    displayName: 'Announcements Board',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ADMIN_ROLES,
    aliases: [
      'announcements',
      'announcement',
      'announcements board',
      'broadcasts',
      'notice board',
      'notices',
      'bulletin',
      'open announcements',
    ],
  },
  {
    routeId: 'communications',
    path: '/app/communications',
    displayName: 'Communications Hub',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
    aliases: [
      'communications',
      'communication',
      'communications hub',
      'messages',
      'email templates',
      'sms templates',
      'outbox',
      'dispatches',
      'open communications',
    ],
  },
  {
    routeId: 'notifications',
    path: '/app/notifications',
    displayName: 'Notifications Center',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ALL_ROLES,
    aliases: [
      'notifications',
      'notification',
      'notifications center',
      'alerts',
      'activity alerts',
      'system alerts',
      'unread notifications',
      'open notifications',
    ],
  },

  // --------------------------------------------------------------------------
  // 9. Internal Chat
  // --------------------------------------------------------------------------
  {
    routeId: 'chat',
    path: '/app/chat',
    displayName: 'Internal Staff Chat',
    moduleGroup: 'COMMUNICATIONS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF'],
    aliases: [
      'chat',
      'internal chat',
      'staff chat',
      'messaging',
      'direct messages',
      'chat room',
      'open chat',
    ],
  },
];

class NavigationRegistry {
  /**
   * Get all registered routes
   */
  static getAllRoutes() {
    return ROUTES;
  }

  /**
   * Find a route by its ID
   * @param {string} routeId
   * @returns {Object|null}
   */
  static getRouteById(routeId) {
    if (!routeId) return null;
    const cleanId = routeId.trim().toLowerCase();
    return ROUTES.find((r) => r.routeId.toLowerCase() === cleanId) || null;
  }

  /**
   * Check if user role is authorized for this route
   * @param {Object} route
   * @param {string} userRole
   * @returns {boolean}
   */
  static isAuthorized(route, userRole) {
    if (!route) return false;
    const role = (userRole || '').toUpperCase();
    if (role === 'SUPER_ADMIN') return true;
    if (route.permittedRoles.includes('*') || route.permittedRoles.includes(role)) {
      return true;
    }
    return false;
  }

  /**
   * List routes authorized for a given user role
   * @param {string} userRole
   * @returns {Array<Object>}
   */
  static listForRole(userRole) {
    const role = (userRole || '').toUpperCase();
    return ROUTES.filter((r) => this.isAuthorized(r, role));
  }

  /**
   * Match natural language phrase to a route
   * Returns:
   *  { status: 'MATCHED', route, params, confidence: 1.0 }
   *  { status: 'AMBIGUOUS', candidates: [...] }
   *  { status: 'NO_MATCH' }
   * @param {string} text
   * @param {string} [userRole]
   * @returns {Object}
   */
  static matchPhrase(text, userRole = 'ADMIN') {
    if (!text || typeof text !== 'string') {
      return { status: 'NO_MATCH' };
    }

    // Clean and normalize text
    let clean = text
      .toLowerCase()
      .replace(/[?!.,;:'"()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Strip common leading action prefixes
    clean = clean
      .replace(/^(?:please\s+)?(?:can\s+you\s+)?(?:take\s+me\s+to|navigate\s+to|open|go\s+to|show\s+me|view|bring\s+up|load|launch|visit|switch\s+to)\s+/i, '')
      .replace(/^(?:the\s+|my\s+|our\s+)/i, '')
      .trim();

    // 1. Check for exact alias match
    for (const route of ROUTES) {
      for (const alias of route.aliases) {
        if (clean === alias || clean === `the ${alias}` || clean === `page for ${alias}` || clean === `${alias} page`) {
          return {
            status: 'MATCHED',
            route,
            confidence: 1.0,
            params: {},
          };
        }
      }
    }

    // 2. Check for employee-specific ID parameter route: e.g. "employee 4", "staff member 5", "employee 15 profile"
    const empMatch = clean.match(/\b(?:employee|staff|personnel)\s+(?:#|id\s*)?(\d+)(?:\s+(?:profile|card|details?))?\b/i);
    if (empMatch) {
      const empRoute = this.getRouteById('employee_detail');
      return {
        status: 'MATCHED',
        route: empRoute,
        confidence: 0.95,
        params: { id: empMatch[1] },
      };
    }

    // 3. Substring / inclusion matching with scoring
    const candidates = [];

    for (const route of ROUTES) {
      let maxScore = 0;
      for (const alias of route.aliases) {
        if (clean === alias) {
          maxScore = Math.max(maxScore, 100);
        } else if (clean.startsWith(alias) || clean.endsWith(alias)) {
          maxScore = Math.max(maxScore, 85);
        } else if (clean.includes(alias)) {
          // If alias is at least 4 characters to avoid micro-matches
          if (alias.length >= 4) {
            maxScore = Math.max(maxScore, 70);
          }
        } else {
          // Word-overlap check
          const aliasWords = alias.split(' ');
          const inputWords = clean.split(' ');
          const overlap = aliasWords.filter((w) => w.length > 3 && inputWords.includes(w));
          if (overlap.length >= 2) {
            maxScore = Math.max(maxScore, 65);
          } else if (overlap.length === 1 && aliasWords.length === 1 && inputWords.length <= 3) {
            maxScore = Math.max(maxScore, 60);
          }
        }
      }

      if (maxScore >= 60) {
        candidates.push({ route, score: maxScore });
      }
    }

    if (candidates.length === 0) {
      return { status: 'NO_MATCH' };
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // If top candidate has significantly higher score than second, return MATCHED
    if (candidates.length === 1 || candidates[0].score - (candidates[1]?.score || 0) >= 15) {
      return {
        status: 'MATCHED',
        route: candidates[0].route,
        confidence: candidates[0].score / 100,
        params: {},
      };
    }

    // Otherwise, ambiguous request
    return {
      status: 'AMBIGUOUS',
      candidates: candidates.slice(0, 3).map((c) => c.route),
    };
  }

  /**
   * Build interpolated path for route
   * @param {Object} route
   * @param {Object} [params]
   * @param {Object} [query]
   * @returns {string}
   */
  static buildPath(route, params = {}, query = {}) {
    let p = route.path;
    if (route.paramKeys && Array.isArray(route.paramKeys)) {
      for (const k of route.paramKeys) {
        const val = params[k];
        if (val !== undefined && val !== null) {
          p = p.replace(`:${k}`, encodeURIComponent(String(val)));
        } else {
          // Fall back to collection route if param missing
          p = p.replace(`/:${k}`, '');
        }
      }
    }

    const queryKeys = Object.keys(query);
    if (queryKeys.length > 0) {
      const qParams = new URLSearchParams();
      queryKeys.forEach((k) => {
        if (query[k] !== undefined && query[k] !== null) {
          qParams.append(k, String(query[k]));
        }
      });
      const qs = qParams.toString();
      if (qs) {
        p += `?${qs}`;
      }
    }

    return p;
  }
}

module.exports = {
  NavigationRegistry,
  ROUTES,
  ALL_ROLES,
  ADMIN_ROLES,
  LEADERSHIP_ROLES,
};
