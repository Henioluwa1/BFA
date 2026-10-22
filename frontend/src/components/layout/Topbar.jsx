import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { systemService } from '../../services/api';
import Breadcrumbs from './Breadcrumbs';
import GlobalSearchModal from '../search/GlobalSearchModal';
import OperationsAssistantModal from '../assistant/OperationsAssistantModal';

export default function Topbar({ onToggleMobileNav }) {
  const { properties, activePropertyId, setActivePropertyId } = useProperty();
  const { user, logout, isSuperAdmin } = useAuth();
  const { notifications, unreadCount, permission, requestPermission, markAllAsRead } = useNotifications();
  const [apiHealth, setApiHealth] = useState({ status: 'checking', dbStatus: 'checking' });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [notifsDropdownOpen, setNotifsDropdownOpen] = useState(false);
  const notifsRef = useRef(null);

  const recentNotifs = notifications.slice(0, 5);

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
    const interval = setInterval(() => {
      checkConnection();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close notifications dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifsRef.current && !notifsRef.current.contains(e.target)) {
        setNotifsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  // Keyboard shortcut: Alt+A or Ctrl+J to open Operations Assistant
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.altKey && (e.key === 'a' || e.key === 'A')) || ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J'))) {
        e.preventDefault();
        setIsAssistantOpen((prev) => !prev);
      }
    };
    const handleCustomOpen = () => setIsAssistantOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('bfa:open-assistant', handleCustomOpen);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('bfa:open-assistant', handleCustomOpen);
    };
  }, []);

  const handleToggleNotifs = () => {
    if (!notifsDropdownOpen) {
      fetchRecent();
    }
    setNotifsDropdownOpen((prev) => !prev);
  };



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

          {/* Operations Assistant Trigger */}
          <button
            type="button"
            className="topbar-assistant-btn"
            onClick={() => setIsAssistantOpen(true)}
            title="Open BFA Operations Assistant (Alt+A)"
            aria-label="Open Operations Assistant"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span>Assistant</span>
            <span className="assistant-badge-pill">AI</span>
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

          {/* Central Notification Bell */}
          <div className="notif-wrapper" ref={notifsRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={handleToggleNotifs}
              title="Notifications"
              aria-label="View notifications"
              style={{
                position: 'relative',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.45rem',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    borderRadius: '10px',
                    padding: '1px 5px',
                    minWidth: '16px',
                    textAlign: 'center',
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {notifsDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '115%',
                  width: '320px',
                  background: 'var(--card-bg, #1a202c)',
                  border: '1px solid var(--border-color, #2d3748)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  zIndex: 1000,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid var(--border-color)',
                  }}
                >
                  <strong style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>Notifications</strong>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    {permission !== 'granted' && (
                      <button
                        type="button"
                        onClick={requestPermission}
                        title="Enable desktop notifications"
                        style={{
                          background: 'rgba(59,130,246,0.12)',
                          border: '1px solid rgba(59,130,246,0.3)',
                          borderRadius: '4px',
                          color: '#60a5fa',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          padding: '0.2rem 0.45rem',
                        }}
                      >
                        🔔 Enable Desktop
                      </button>
                    )}
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--brand-accent, #3b82f6)',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  {recentNotifs.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        background: n.is_read ? 'transparent' : 'rgba(59,130,246,0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {n.title}
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          {n.category}
                        </span>
                      </div>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                        {n.message?.length > 70 ? `${n.message.substring(0, 70)}...` : n.message}
                      </p>
                    </div>
                  ))}
                  {recentNotifs.length === 0 && (
                    <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      No new notifications
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '0.6rem 1rem',
                    textAlign: 'center',
                    borderTop: '1px solid var(--border-color)',
                    background: 'rgba(0,0,0,0.15)',
                  }}
                >
                  <Link
                    to="/app/notifications"
                    onClick={() => setNotifsDropdownOpen(false)}
                    style={{ fontSize: '0.8125rem', color: 'var(--brand-accent)', textDecoration: 'none' }}
                  >
                    View all notifications ➔
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Authenticated User Profile Pill (Section 6 & 7 & 16: Clickable Profile Trigger) */}
          <Link
            to="/app/my-profile"
            className="user-profile-pill"
            title={`Logged in as ${user?.name} (${user?.role}) — Click to view My Profile`}
            aria-label="View My Profile"
          >
            <div className="user-avatar" style={{ background: isSuperAdmin ? '#3b82f6' : 'var(--brand-primary)' }}>
              {userInitial}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.name || 'Authorized User'}</span>
              <span className="user-role-tag">
                {isSuperAdmin ? '👑 SUPER ADMIN' : user?.role || 'AUTHENTICATED'}
              </span>
            </div>
          </Link>

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

      {/* BFA Intelligent Operations Assistant Modal */}
      <OperationsAssistantModal
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
      />
    </>
  );
}
