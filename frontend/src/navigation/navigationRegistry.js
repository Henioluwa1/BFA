/**
 * ============================================================================
 * BFA Intelligent Operations Assistant — Client-Side Navigation Registry
 * ============================================================================
 * Mirrors the authoritative backend route registry using ES Module syntax.
 * Enables instant client-side route validation, alias resolution, and destination checks.
 * ============================================================================
 */

export const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'];
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'];
export const LEADERSHIP_ROLES = ['SUPER_ADMIN', 'ADMIN'];

export const ROUTES = [
  // Core
  {
    routeId: 'dashboard',
    path: '/app/dashboard',
    displayName: 'Dashboard',
    moduleGroup: 'CORE',
    permittedRoles: ALL_ROLES,
    aliases: ['dashboard', 'my dashboard', 'home', 'main screen', 'overview', 'return to dashboard', 'command center'],
  },

  // Properties & Units
  {
    routeId: 'properties',
    path: '/app/properties',
    displayName: 'Properties & Buildings',
    moduleGroup: 'PROPERTIES_UNITS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    aliases: ['properties', 'buildings', 'property list', 'real estate', 'estates', 'open properties'],
  },
  {
    routeId: 'apartments',
    path: '/app/apartments',
    displayName: 'Apartments & Units',
    moduleGroup: 'PROPERTIES_UNITS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
    aliases: ['apartments', 'units', 'rooms', 'vacant units', 'available units', 'open apartments'],
  },
  {
    routeId: 'calendar',
    path: '/app/calendar',
    displayName: 'Availability Calendar',
    moduleGroup: 'PROPERTIES_UNITS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'OWNER'],
    aliases: ['calendar', 'availability calendar', 'booking calendar', 'occupancy calendar', 'schedule', 'open calendar'],
  },

  // Front Office & Bookings
  {
    routeId: 'front_office',
    path: '/app/front-office',
    displayName: 'Daily Front Desk',
    moduleGroup: 'FRONT_OFFICE_BOOKINGS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST'],
    aliases: ['front desk', 'front office', 'daily front desk', 'reception', 'reception desk', 'check in desk', 'open front desk', 'front office desk'],
  },
  {
    routeId: 'reservations',
    path: '/app/reservations',
    displayName: 'All Reservations',
    moduleGroup: 'FRONT_OFFICE_BOOKINGS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT', 'OWNER'],
    aliases: ['reservations', 'bookings', 'all reservations', 'all bookings', 'booking list', 'open reservations'],
  },
  {
    routeId: 'guests',
    path: '/app/guests',
    displayName: 'Tenants & Guests',
    moduleGroup: 'FRONT_OFFICE_BOOKINGS',
    permittedRoles: ALL_ROLES,
    aliases: ['guests', 'tenants', 'guest list', 'tenant directory', 'customer profiles', 'open guests'],
  },

  // Staff & Partners
  {
    routeId: 'employees',
    path: '/app/employees',
    displayName: 'Employees Directory',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    aliases: ['employees', 'staff directory', 'staff list', 'workforce', 'personnel', 'open employees'],
  },
  {
    routeId: 'employee_detail',
    path: '/app/employees/:id',
    displayName: 'Employee Profile',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    paramKeys: ['id'],
    aliases: ['employee profile', 'staff profile', 'view employee'],
  },
  {
    routeId: 'performance',
    path: '/app/performance',
    displayName: 'Staff Performance',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    aliases: ['performance', 'staff performance', 'evaluations', 'staff ratings', 'kpis', 'open performance'],
  },
  {
    routeId: 'id_cards',
    path: '/app/id-cards',
    displayName: 'Staff ID Cards',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    aliases: ['id cards', 'badges', 'staff badges', 'security badges', 'open id cards'],
  },
  {
    routeId: 'my_profile',
    path: '/app/my-profile',
    displayName: 'My Profile & Badge',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ALL_ROLES,
    aliases: ['my profile', 'profile', 'my account', 'my badge', 'open my profile'],
  },
  {
    routeId: 'agents',
    path: '/app/agents',
    displayName: 'Agents & Commissions',
    moduleGroup: 'STAFF_PARTNERS',
    permittedRoles: ADMIN_ROLES,
    aliases: ['agents', 'commissions', 'broker commissions', 'agent payouts', 'open agents'],
  },

  // Finance & Accounts
  {
    routeId: 'financial',
    path: '/app/financial',
    displayName: 'Financial Overview',
    moduleGroup: 'FINANCE_ACCOUNTS',
    permittedRoles: ADMIN_ROLES,
    aliases: ['finance', 'financial', 'financial overview', 'revenue', 'expenses', 'outstanding payments', 'ledger', 'open financial'],
  },

  // Maintenance & Care
  {
    routeId: 'maintenance',
    path: '/app/maintenance',
    displayName: 'Work Orders & Repairs',
    moduleGroup: 'MAINTENANCE_CARE',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
    aliases: ['maintenance', 'repairs', 'work orders', 'repair requests', 'faults', 'open maintenance'],
  },
  {
    routeId: 'inspection',
    path: '/app/inspection',
    displayName: 'Unit Inspections',
    moduleGroup: 'MAINTENANCE_CARE',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF', 'OWNER'],
    aliases: ['inspection', 'inspections', 'unit inspections', 'room inspections', 'open inspection'],
  },

  // Reports & Intelligence
  {
    routeId: 'analytics',
    path: '/app/analytics',
    displayName: 'Analytics & Trends',
    moduleGroup: 'REPORTS_INTELLIGENCE',
    permittedRoles: ADMIN_ROLES,
    aliases: ['analytics', 'trends', 'metrics', 'statistics', 'occupancy trends', 'open analytics'],
  },
  {
    routeId: 'reports',
    path: '/app/reports',
    displayName: 'Reports & Exports',
    moduleGroup: 'REPORTS_INTELLIGENCE',
    permittedRoles: ADMIN_ROLES,
    aliases: ['reports', 'exports', 'csv export', 'download reports', 'open reports'],
  },
  {
    routeId: 'audit',
    path: '/app/audit',
    displayName: 'Audit Trail & Logs',
    moduleGroup: 'REPORTS_INTELLIGENCE',
    permittedRoles: ADMIN_ROLES,
    aliases: ['audit', 'audit trail', 'audit logs', 'activity logs', 'security logs', 'open audit'],
  },

  // System Administration
  {
    routeId: 'access_control',
    path: '/app/access-control',
    displayName: 'Access Control Policies',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'ADMIN'],
    aliases: ['access control', 'access policies', 'capabilities', 'policy management', 'open access control'],
  },
  {
    routeId: 'team',
    path: '/app/team',
    displayName: 'Team & RBAC',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: LEADERSHIP_ROLES,
    aliases: ['team', 'user management', 'rbac', 'system users', 'open team'],
  },
  {
    routeId: 'settings',
    path: '/app/settings',
    displayName: 'System Settings',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: LEADERSHIP_ROLES,
    aliases: ['settings', 'configuration', 'system config', 'open settings'],
  },
  {
    routeId: 'operations_control',
    path: '/app/operations',
    displayName: 'Operations Control Center',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'OWNER'],
    aliases: ['operations control center', 'operations center', 'control center', 'operations', 'system governance', 'governance', 'subsystem health', 'operations control', 'open operations'],
  },
  {
    routeId: 'announcements',
    path: '/app/announcements',
    displayName: 'Announcements Board',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ADMIN_ROLES,
    aliases: ['announcements', 'broadcasts', 'notice board', 'open announcements'],
  },
  {
    routeId: 'communications',
    path: '/app/communications',
    displayName: 'Communications Hub',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
    aliases: ['communications', 'messages', 'email templates', 'sms templates', 'open communications'],
  },
  {
    routeId: 'notifications',
    path: '/app/notifications',
    displayName: 'Notifications Center',
    moduleGroup: 'SYSTEM_ADMIN',
    permittedRoles: ALL_ROLES,
    aliases: ['notifications', 'alerts', 'activity alerts', 'open notifications'],
  },
  {
    routeId: 'chat',
    path: '/app/chat',
    displayName: 'Internal Staff Chat',
    moduleGroup: 'COMMUNICATIONS',
    permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF'],
    aliases: ['chat', 'internal chat', 'staff chat', 'messages', 'open chat'],
  },
];

export class NavigationRegistry {
  static getRouteById(routeId) {
    if (!routeId) return null;
    return ROUTES.find((r) => r.routeId.toLowerCase() === routeId.trim().toLowerCase()) || null;
  }

  static isAuthorized(route, userRole) {
    if (!route) return false;
    const role = (userRole || '').toUpperCase();
    if (role === 'SUPER_ADMIN') return true;
    return route.permittedRoles.includes('*') || route.permittedRoles.includes(role);
  }

  static buildPath(route, params = {}, query = {}) {
    let p = route.path;
    if (route.paramKeys && Array.isArray(route.paramKeys)) {
      for (const k of route.paramKeys) {
        const val = params[k];
        if (val !== undefined && val !== null) {
          p = p.replace(`:${k}`, encodeURIComponent(String(val)));
        } else {
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
