import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const routeNames = {
  '': 'Dashboard',
  dashboard: 'Dashboard',
  calendar: 'Availability Calendar',
  reservations: 'All Reservations',
  apartments: 'Apartments & Units',
  properties: 'Properties & Buildings',
  'front-office': 'Daily Front Desk',
  'receptionist-monitor': 'Receptionist Live Monitor',
  guests: 'Tenants & Guests',
  financial: 'Financial Management',
  analytics: 'Analytics & Insights',
  agents: 'Agent Management',
  maintenance: 'Maintenance Tracker',
  inspection: 'Apartment Inspection',
  team: 'Team & RBAC Policies',
  'access-control': 'Access Control Policies',
  audit: 'Security & Audit Logs',
  settings: 'System Settings',
  workforce: 'Workforce Directory',
  employees: 'Employee Directory',
  'employee-evaluation': 'Staff Performance & KPI',
  'employee-performance': 'Performance Metrics',
  'employee-id-cards': 'Staff ID Cards',
  'my-schedule': 'My Schedule',
  reports: 'Operational Reports',
  announcements: 'Staff Announcements',
  chat: 'Staff Collaboration & Operations',
  notifications: 'Notifications',
  'my-profile': 'My Profile',
  profile: 'Employee Profile',
  'design-system': 'Design System',
};

export default function Breadcrumbs() {
  const location = useLocation();

  // Filter out empty segments and internal router prefix 'app'
  const rawSegments = location.pathname.split('/').filter(Boolean);
  const pathSegments = rawSegments.filter((seg) => seg.toLowerCase() !== 'app');

  // Compute active page title
  const activeSegment = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
  const activeTitle = routeNames[activeSegment] || (activeSegment ? activeSegment.charAt(0).toUpperCase() + activeSegment.slice(1).replace(/-/g, ' ') : 'Dashboard');

  // Full breadcrumb trail string for accessibility and title tooltip
  const fullBreadcrumbText = `BFA / ${pathSegments.map((s) => routeNames[s] || s).join(' / ') || 'Dashboard'}`;

  return (
    <nav className="topbar-breadcrumbs-container" aria-label="Breadcrumbs" title={fullBreadcrumbText}>
      {/* Mobile Single-Title Display (< 768px): Clear, prominent, zero overflow */}
      <div className="topbar-mobile-title" aria-hidden="true">
        <span className="topbar-mobile-title-text">{activeTitle}</span>
      </div>

      {/* Desktop / Tablet Breadcrumb Trail (>= 768px) */}
      <div className="topbar-desktop-trail">
        <Link to="/app/dashboard" className="topbar-crumb-root" title="Go to Dashboard">
          <span>BFA</span>
        </Link>
        <span className="topbar-crumb-separator" aria-hidden="true">/</span>

        {pathSegments.length === 0 ? (
          <span className="topbar-crumb-current">Dashboard</span>
        ) : (
          pathSegments.map((segment, index) => {
            const isLast = index === pathSegments.length - 1;
            const label = routeNames[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
            const targetPath = `/app/${pathSegments.slice(0, index + 1).join('/')}`;

            return (
              <React.Fragment key={segment}>
                {index > 0 && <span className="topbar-crumb-separator" aria-hidden="true">/</span>}
                {isLast ? (
                  <span className="topbar-crumb-current" aria-current="page">
                    {label}
                  </span>
                ) : (
                  <Link to={targetPath} className="topbar-crumb-link">
                    {label}
                  </Link>
                )}
              </React.Fragment>
            );
          })
        )}
      </div>
    </nav>
  );
}
