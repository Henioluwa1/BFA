import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const routeNames = {
  '': 'Dashboard',
  calendar: 'Calendar',
  reservations: 'All Reservations',
  apartments: 'Apartments & Units',
  financial: 'Financial Management',
  analytics: 'Analytics & Insights',
  agents: 'Agent Management',
  maintenance: 'Maintenance Tracker',
  inspection: 'Apartment Inspection',
  team: 'Team & RBAC',
  settings: 'System Settings',
};

export default function Breadcrumbs() {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);

  return (
    <nav aria-label="Breadcrumbs" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
      <Link to="/" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span>BFA</span>
      </Link>
      <span style={{ color: 'var(--border-default)' }}>/</span>
      {pathSegments.length === 0 ? (
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Dashboard</span>
      ) : (
        pathSegments.map((segment, index) => {
          const isLast = index === pathSegments.length - 1;
          const label = routeNames[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
          return (
            <React.Fragment key={segment}>
              {index > 0 && <span style={{ color: 'var(--border-default)' }}>/</span>}
              <span style={{ color: isLast ? 'var(--accent-gold)' : 'var(--text-secondary)', fontWeight: isLast ? 600 : 400 }}>
                {label}
              </span>
            </React.Fragment>
          );
        })
      )}
    </nav>
  );
}
