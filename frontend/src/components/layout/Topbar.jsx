import React, { useEffect, useState } from 'react';
import { useProperty } from '../../context/PropertyContext';
import { useRole } from '../../context/RoleContext';
import { systemService } from '../../services/api';
import Breadcrumbs from './Breadcrumbs';
import GlobalSearchModal from '../search/GlobalSearchModal';

export default function Topbar() {
  const { properties, activePropertyId, setActivePropertyId } = useProperty();
  const { currentRole, setCurrentRole, activeRoleObj, roles } = useRole();
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

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <Breadcrumbs />
        </div>

        <div className="topbar-right">
          {/* Global Search Trigger (Section 5 & 6) */}
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

          {/* Global Multi-Property Selector (Section 1, 7, 24) */}
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
              {properties.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  🏢 {prop.name} ({prop.unitCount} Units)
                </option>
              ))}
            </select>
          </div>

          {/* Centralized Role Switcher (Section 20 & 21) */}
          <div className="role-switcher" title="Simulate / Switch Operational User Role">
            <span className="role-switcher-label">Role:</span>
            <select
              className="role-select"
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value)}
              id="role-switcher-select"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Backend & DB Health Indicator */}
          <div className="status-indicator" title={`API: ${apiHealth.status} | DB: ${apiHealth.dbStatus}`}>
            <div
              className={`status-dot ${
                apiHealth.status === 'connected' ? 'connected' : 'degraded'
              }`}
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {apiHealth.status === 'connected' ? 'Connected' : 'Connecting...'}
            </span>
          </div>

          {/* User Role Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'var(--role-badge-bg, var(--rust-primary))',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.8rem',
                color: 'var(--role-badge-text, #ffffff)',
              }}
            >
              {activeRoleObj.name.substring(0, 2).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {activeRoleObj.label}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--rust-light)', fontWeight: 700, letterSpacing: '0.04em' }}>
                {activeRoleObj.name.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
