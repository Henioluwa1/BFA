import React, { useEffect, useState } from 'react';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { systemService } from '../../services/api';
import Breadcrumbs from './Breadcrumbs';
import GlobalSearchModal from '../search/GlobalSearchModal';

export default function Topbar({ onToggleMobileNav }) {
  const { properties, activePropertyId, setActivePropertyId } = useProperty();
  const { user, logout, isSuperAdmin } = useAuth();
  const [apiHealth, setApiHealth] = useState({ status: 'checking', dbStatus: 'checking' });
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const checkConnection = async () => {
    try {
      const res = await systemService.checkHealth();
      if (res.data?.status === 'healthy') {
        setApiHealth({ status: 'connected', dbStatus: res.data.database?.status || 'connected' });
      } else {
        setApiHealth({ status: 'degraded', dbStatus: res.data?.database?.status || 'degraded' });
      }
    } catch {
      setApiHealth({ status: 'offline', dbStatus: 'disconnected' });
    }
  };

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 15000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut: Ctrl+K or Cmd+K to open search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          {/* Mobile hamburger toggle (Section 16) */}
          <button
            type="button"
            className="mobile-nav-toggle"
            onClick={onToggleMobileNav}
            title="Toggle Navigation Menu"
            aria-label="Toggle navigation drawer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Breadcrumbs />
        </div>

        <div className="topbar-right">
          {/* Global Search Trigger (Section 19) */}
          <button
            className="topbar-search-btn"
            onClick={() => setIsSearchOpen(true)}
            title="Search entire BFA platform (Ctrl+K)"
            aria-label="Open Global Search"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Search records...</span>
            <span className="search-kbd">Ctrl K</span>
          </button>

          {/* Global Multi-Property Selector (Section 1 & 18) */}
          <div className="property-switcher" title="Active Property Scope">
            <span className="property-switcher-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1" />
              </svg>
              Scope:
            </span>
            <select
              className="property-select"
              value={activePropertyId}
              onChange={(e) => setActivePropertyId(e.target.value)}
              id="property-switcher-select"
            >
              <option value="all">✦ All Properties</option>
              {(properties || []).map((prop) => (
                <option key={prop.id} value={prop.id}>
                  🏢 {prop.name} ({prop.unitCount || 0} Units)
                </option>
              ))}
            </select>
          </div>

          {/* Authenticated User Profile Pill (Section 6 & 7: Role derived from Backend) */}
          <div className="user-profile-pill" title={`Logged in as ${user?.name} (${user?.role})`}>
            <div className="user-avatar" style={{ background: isSuperAdmin ? '#3b82f6' : 'var(--brand-primary)' }}>
              {userInitial}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.name || 'Authorized User'}</span>
              <span className="user-role-tag">
                {isSuperAdmin ? '👑 SUPER ADMIN' : user?.role || 'AUTHENTICATED'}
              </span>
            </div>
          </div>

          {/* Logout Action */}
          <button
            type="button"
            className="btn-logout"
            onClick={logout}
            title="Sign out of BFA portal"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Global Categorized Search Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
