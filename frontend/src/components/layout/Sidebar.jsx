import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

// Navigation structure organized by logical business domains (Section 17, 18)
const dashboardItem = {
  path: '/app/dashboard',
  label: 'Dashboard',
  roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
      <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
    </svg>
  ),
};

const navGroups = [
  {
    id: 'properties_units',
    label: 'Properties & Units',
    items: [
      {
        path: '/app/properties',
        label: 'Properties & Buildings',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
            <path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M8 10h.01" /><path d="M16 10h.01" /><path d="M8 14h.01" /><path d="M16 14h.01" />
          </svg>
        ),
      },
      {
        path: '/app/apartments',
        label: 'Apartments & Units',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ),
      },
      {
        path: '/app/calendar',
        label: 'Availability Calendar',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'front_office_reservations',
    label: 'Front Office & Bookings',
    items: [
      {
        path: '/app/front-office',
        label: 'Daily Front Desk',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" />
          </svg>
        ),
      },
      {
        path: '/app/reservations',
        label: 'All Reservations',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        ),
      },
      {
        path: '/app/guests',
        label: 'Tenants & Guests',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'staff_partners',
    label: 'Staff & Partners',
    items: [
      {
        path: '/app/employees',
        label: 'Employees Directory',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        ),
      },
      {
        path: '/app/performance',
        label: 'Staff Performance',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /><circle cx="12" cy="4" r="2" />
          </svg>
        ),
      },
      {
        path: '/app/id-cards',
        label: 'Staff ID Cards',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        ),
      },
      {
        path: '/app/my-profile',
        label: 'My Profile & Badge',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        ),
      },
      {
        path: '/app/agents',
        label: 'Agents & Commissions',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'finance_accounts',
    label: 'Finance & Accounts',
    items: [
      {
        path: '/app/financial',
        label: 'Financial Overview',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'maintenance_operations',
    label: 'Maintenance & Care',
    items: [
      {
        path: '/app/maintenance',
        label: 'Work Orders & Repairs',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        ),
      },
      {
        path: '/app/inspection',
        label: 'Unit Inspections',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'reports_intelligence',
    label: 'Reports & Intelligence',
    items: [
      {
        path: '/app/analytics',
        label: 'Analytics & Trends',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        ),
      },
      {
        path: '/app/reports',
        label: 'Reports & Exports',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        ),
      },
      {
        path: '/app/audit',
        label: 'Audit Trail & Logs',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'system_admin',
    label: 'System Administration',
    items: [
      {
        path: '/app/access-control',
        label: 'Access Control Policies',
        roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'ADMIN'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ),
      },
      {
        path: '/app/team',
        label: 'Team & RBAC',
        roles: ['SUPER_ADMIN', 'ADMIN'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          </svg>
        ),
      },
      {
        path: '/app/settings',
        label: 'System Settings',
        roles: ['SUPER_ADMIN', 'ADMIN'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
      },
      {
        path: '/app/announcements',
        label: 'Announcements Board',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        ),
      },
      {
        path: '/app/communications',
        label: 'Communications Hub',
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        ),
      },
      {
        path: '/app/notifications',
        label: 'Notifications Center',
        showBadge: true,
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        ),
      },
    ],
  },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, onCloseMobile }) {
  const { user } = useAuth();
  const location = useLocation();
  const { unreadCount = 0 } = useNotifications() || {};
  const userRole = (user?.role || 'STAFF').toUpperCase();

  // State to track expanded / collapsed groups
  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('bfa_sidebar_open_groups');
      return saved ? JSON.parse(saved) : {
        properties_units: true,
        front_office_reservations: true,
        staff_partners: true,
        finance_accounts: true,
        maintenance_operations: true,
        reports_intelligence: true,
        system_admin: true,
      };
    } catch {
      return {
        properties_units: true,
        front_office_reservations: true,
        staff_partners: true,
        finance_accounts: true,
        maintenance_operations: true,
        reports_intelligence: true,
        system_admin: true,
      };
    }
  });

  // Automatically keep current group expanded when user navigates
  useEffect(() => {
    const currentPath = location.pathname;
    navGroups.forEach((group) => {
      const hasActive = group.items.some((item) =>
        currentPath === item.path || currentPath.startsWith(`${item.path}/`)
      );
      if (hasActive && !openGroups[group.id]) {
        setOpenGroups((prev) => {
          const next = { ...prev, [group.id]: true };
          try {
            localStorage.setItem('bfa_sidebar_open_groups', JSON.stringify(next));
          } catch {
            // ignore localStorage quota errors
          }
          return next;
        });
      }
    });
  }, [location.pathname]);

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem('bfa_sidebar_open_groups', JSON.stringify(next));
      } catch {
        // ignore localStorage quota errors
      }
      return next;
    });
  };

  // Close drawer on Escape key and lock body scroll on mobile (Section 8)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileOpen) {
        onCloseMobile();
      }
    };
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, onCloseMobile]);

  const isRoleAuthorized = (roles) => roles.includes(userRole) || userRole === 'SUPER_ADMIN';

  // Filter groups according to authenticated user permissions
  const authorizedDashboard = isRoleAuthorized(dashboardItem.roles);
  const authorizedGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isRoleAuthorized(item.roles)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <Link to="/app/dashboard" className="brand-logo-wrap" onClick={onCloseMobile}>
            <div className="brand-icon">B</div>
            <span className="brand-text">BFA APARTS</span>
            <span className="brand-tag">ERP</span>
          </Link>
          {mobileOpen ? (
            <button
              type="button"
              className="collapse-toggle"
              onClick={onCloseMobile}
              title="Close Menu"
              aria-label="Close navigation drawer"
              style={{ minWidth: '34px', minHeight: '34px', fontSize: '1.1rem' }}
            >
              ✕
            </button>
          ) : (
            <button
              type="button"
              className="collapse-toggle"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              aria-label="Toggle Sidebar"
            >
              {collapsed ? '→' : '←'}
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          {/* Dashboard Direct Route */}
          {authorizedDashboard && (
            <NavLink
              to={dashboardItem.path}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              title={collapsed ? dashboardItem.label : undefined}
              onClick={onCloseMobile}
            >
              {dashboardItem.icon}
              <span className="nav-text">{dashboardItem.label}</span>
            </NavLink>
          )}

          {/* Collapsible Nav Groups */}
          {authorizedGroups.map((group) => {
            const isGroupOpen = Boolean(openGroups[group.id]);
            const isAnyItemActive = group.items.some(
              (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
            );

            return (
              <div key={group.id} className="nav-group">
                <button
                  type="button"
                  className={`nav-group-header ${isAnyItemActive ? 'active-group' : ''}`}
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isGroupOpen}
                  title={group.label}
                >
                  <span className="nav-group-title">{group.label}</span>
                  <svg
                    className={`nav-group-chevron ${isGroupOpen ? 'open' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                <div
                  className="nav-group-items"
                  style={{
                    display: isGroupOpen ? 'flex' : 'none',
                  }}
                >
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                      title={collapsed ? item.label : undefined}
                      onClick={onCloseMobile}
                    >
                      {item.icon}
                      <span className="nav-text">{item.label}</span>
                      {item.showBadge && unreadCount > 0 && (
                        <span className="nav-badge" title={`${unreadCount} unread notifications`}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Operations Assistant Quick Launcher */}
          <button
            type="button"
            className="nav-link"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(124, 58, 237, 0.1))',
              border: '1px solid rgba(37, 99, 235, 0.25)',
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--brand-accent)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.65rem 1rem',
              marginTop: '0.75rem',
              marginBottom: '0.5rem',
              borderRadius: '8px',
            }}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('bfa:open-assistant'));
              onCloseMobile();
            }}
            title="Open BFA Operations Assistant (Alt+A)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="nav-icon" style={{ color: 'var(--brand-accent)' }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span className="nav-text" style={{ fontWeight: 600 }}>Assistant AI</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            <div style={{ fontWeight: 600, color: '#f8fafc' }}>{user?.name}</div>
            <div style={{ color: 'var(--brand-accent)', fontWeight: 700, textTransform: 'uppercase' }}>
              {user?.role ? user.role.replace('_', ' ') : 'AUTHENTICATED'}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
