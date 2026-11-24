import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { systemService } from '../../services/api';
import chatService from '../../services/chatService';
import { getSocket } from '../../services/socket';
import Breadcrumbs from './Breadcrumbs';
import GlobalSearchModal from '../search/GlobalSearchModal';
import OperationsAssistantModal from '../assistant/OperationsAssistantModal';

export default function Topbar({ onToggleSidebar, onToggleMobileNav, isSidebarOpen, isCollapsed }) {
  const { properties, activePropertyId, setActivePropertyId } = useProperty();
  const { user, logout, isSuperAdmin } = useAuth();
  const { notifications, unreadCount, permission, requestPermission, markAllAsRead } = useNotifications();
  const [apiHealth, setApiHealth] = useState({ status: 'checking', dbStatus: 'checking' });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [notifsDropdownOpen, setNotifsDropdownOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const notifsRef = useRef(null);
  const accountMenuRef = useRef(null);

  const handleToggle = onToggleSidebar || onToggleMobileNav;

  const fetchChatUnread = useCallback(async () => {
    try {
      const res = await chatService.getUnreadCount();
      const payload = res?.data !== undefined ? res.data : res;
      const count = Number(payload?.totalUnread || 0);
      setChatUnreadCount(count);
    } catch {
      // Ignore background unread check errors
    }
  }, []);

  useEffect(() => {
    fetchChatUnread();
    const interval = setInterval(fetchChatUnread, 45000);

    const socket = getSocket();
    if (socket) {
      const handleIncoming = () => {
        setChatUnreadCount((prev) => prev + 1);
      };
      const handleSummary = (data) => {
        if (data?.totalUnread !== undefined) {
          setChatUnreadCount(Number(data.totalUnread));
        }
      };
      socket.on('message:new_incoming', handleIncoming);
      socket.on('unread:summary', handleSummary);

      return () => {
        clearInterval(interval);
        socket.off('message:new_incoming', handleIncoming);
        socket.off('unread:summary', handleSummary);
      };
    }

    return () => clearInterval(interval);
  }, [fetchChatUnread]);

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

  // Close notifications and account dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifsRef.current && !notifsRef.current.contains(e.target)) {
        setNotifsDropdownOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
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
    setAccountMenuOpen(false);
    setNotifsDropdownOpen((prev) => !prev);
  };

  const handleToggleAccountMenu = () => {
    setNotifsDropdownOpen(false);
    setAccountMenuOpen((prev) => !prev);
  };

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  const roleDisplay = isSuperAdmin ? '👑 SUPER ADMIN' : (user?.role || 'AUTHENTICATED').replace(/_/g, ' ');

  // Look up active property object for display
  const activePropertyObj = (properties || []).find((p) => String(p.id) === String(activePropertyId));

  return (
    <>
      <header className="topbar">
        {/* ── LEFT SECTION: Hamburger Toggle + Breadcrumbs/Page Title ── */}
        <div className="topbar-left">
          {/* Permanent, Predictable Sidebar Hamburger Toggle (NEVER disappears or flex-shrinks) */}
          <button
            type="button"
            className="topbar-nav-toggle"
            onClick={handleToggle}
            title={isSidebarOpen ? "Close navigation sidebar" : "Open navigation sidebar"}
            aria-label={isSidebarOpen ? "Close navigation sidebar" : "Open navigation sidebar"}
            aria-expanded={Boolean(isSidebarOpen)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Responsive Page Title & Breadcrumbs */}
          <Breadcrumbs />
        </div>

        {/* ── RIGHT SECTION: Actions, Quick Controls, Notifications, Profile ── */}
        <div className="topbar-right">
          {/* Global Search Trigger (Desktop full with shortcut, Mobile compact icon) */}
          <button
            type="button"
            className="topbar-search-btn"
            onClick={() => setIsSearchOpen(true)}
            title="Search records across BFA platform (Ctrl+K)"
            aria-label="Open Global Search"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="search-btn-label">Search records...</span>
            <span className="search-kbd" aria-hidden="true">Ctrl K</span>
          </button>

          {/* Operations Assistant Trigger (Visible on desktop & tablet >= 768px, also in Mobile Menu) */}
          <button
            type="button"
            className="topbar-assistant-btn desktop-tablet-only"
            onClick={() => setIsAssistantOpen(true)}
            title="Open BFA Operations Assistant (Alt+A)"
            aria-label="Open Operations Assistant"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span className="assistant-btn-label">Assistant</span>
            <span className="assistant-badge-pill" aria-hidden="true">AI</span>
          </button>

          {/* Global Multi-Property Scope Selector (Visible on desktop & tablet >= 768px, also in Mobile Menu) */}
          <div className="property-switcher desktop-tablet-only" title="Active Property Scope">
            <span className="property-switcher-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1" />
              </svg>
              Scope:
            </span>
            <select
              className="property-select"
              value={activePropertyId}
              onChange={(e) => setActivePropertyId(e.target.value)}
              id="property-switcher-select"
              aria-label="Filter active property scope"
            >
              <option value="all">✦ All Properties</option>
              {(properties || []).map((prop) => (
                <option key={prop.id} value={prop.id}>
                  🏢 {prop.name} ({prop.unitCount || 0} Units)
                </option>
              ))}
            </select>
          </div>

          {/* Staff Chat Shortcut Icon with Real-Time Unread Badge */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('bfa:open-chat'))}
            className="topbar-icon-btn chat-topbar-btn"
            title="Staff Chat & File Sharing"
            aria-label={`Open staff chat ${chatUnreadCount > 0 ? `(${chatUnreadCount} unread)` : ''}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            {chatUnreadCount > 0 && (
              <span className="topbar-badge topbar-badge-chat" aria-hidden="true">
                {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
              </span>
            )}
          </button>

          {/* Central Notification Bell */}
          <div className="notif-wrapper" ref={notifsRef}>
            <button
              type="button"
              className="topbar-icon-btn notif-topbar-btn"
              onClick={handleToggleNotifs}
              title="Notifications"
              aria-label={`View notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
              aria-expanded={notifsDropdownOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="topbar-badge topbar-badge-notif" aria-hidden="true">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {notifsDropdownOpen && (
              <div className="topbar-dropdown notif-dropdown-panel" role="region" aria-label="Notifications Panel">
                <div className="notif-dropdown-header">
                  <strong>Notifications</strong>
                  <div className="notif-header-actions">
                    {permission !== 'granted' && (
                      <button
                        type="button"
                        onClick={requestPermission}
                        className="btn-enable-desktop-notifs"
                        title="Enable desktop browser notifications"
                      >
                        🔔 Enable Desktop
                      </button>
                    )}
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="btn-mark-all-read"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                </div>

                <div className="notif-list-body">
                  {recentNotifs.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      className={`notif-item ${n.is_read ? 'read' : 'unread'}`}
                    >
                      <div className="notif-item-header">
                        <span className="notif-item-title">{n.title}</span>
                        <span className="notif-item-category">{n.category}</span>
                      </div>
                      <p className="notif-item-message">
                        {n.message?.length > 70 ? `${n.message.substring(0, 70)}...` : n.message}
                      </p>
                    </div>
                  ))}
                  {recentNotifs.length === 0 && (
                    <div className="notif-empty-state">
                      No new notifications
                    </div>
                  )}
                </div>

                <div className="notif-dropdown-footer">
                  <Link
                    to="/app/notifications"
                    onClick={() => setNotifsDropdownOpen(false)}
                    className="notif-view-all-link"
                  >
                    View all notifications ➔
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Trigger & Responsive Account Menu */}
          <div className="user-profile-wrapper" ref={accountMenuRef}>
            {/* Desktop Full Profile Pill (>= 1200px) */}
            <div
              className="user-profile-pill desktop-only"
              onClick={handleToggleAccountMenu}
              title={`Logged in as ${user?.name} (${user?.role}) — Click for account actions`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggleAccountMenu();
                }
              }}
              aria-haspopup="true"
              aria-expanded={accountMenuOpen}
            >
              <div className="user-avatar" style={{ background: isSuperAdmin ? '#3b82f6' : 'var(--brand-primary)' }}>
                {userInitial}
              </div>
              <div className="user-details">
                <span className="user-name">{user?.name || 'Authorized User'}</span>
                <span className="user-role-tag">{roleDisplay}</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="profile-chevron">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Mobile / Tablet Compact Avatar Button (< 1200px) */}
            <button
              type="button"
              className="user-avatar-btn mobile-tablet-only"
              onClick={handleToggleAccountMenu}
              title={`Account & Quick Actions: ${user?.name} (${roleDisplay})`}
              aria-label="Open Account & Quick Actions Menu"
              aria-expanded={accountMenuOpen}
            >
              <div className="user-avatar" style={{ background: isSuperAdmin ? '#3b82f6' : 'var(--brand-primary)' }}>
                {userInitial}
              </div>
            </button>

            {/* Account & Quick Actions Dropdown Menu */}
            {accountMenuOpen && (
              <div className="topbar-dropdown account-dropdown-panel" role="menu">
                {/* User Identity Header */}
                <div className="account-dropdown-user-header">
                  <div className="account-dropdown-avatar" style={{ background: isSuperAdmin ? '#3b82f6' : 'var(--brand-primary)' }}>
                    {userInitial}
                  </div>
                  <div className="account-dropdown-user-info">
                    <div className="account-dropdown-name">{user?.name || 'Authorized User'}</div>
                    <div className="account-dropdown-email">{user?.email || 'admin@bfa.com'}</div>
                    <span className="account-dropdown-role-badge">{roleDisplay}</span>
                  </div>
                </div>

                {/* Mobile Quick Action: Active Property Scope (< 768px) */}
                <div className="account-dropdown-mobile-section mobile-only">
                  <div className="account-dropdown-section-title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1" />
                    </svg>
                    Active Property Scope
                  </div>
                  <select
                    className="property-select mobile-account-property-select"
                    value={activePropertyId}
                    onChange={(e) => setActivePropertyId(e.target.value)}
                  >
                    <option value="all">✦ All Properties</option>
                    {(properties || []).map((prop) => (
                      <option key={prop.id} value={prop.id}>
                        🏢 {prop.name} ({prop.unitCount || 0} Units)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mobile Quick Action: Assistant AI (< 768px) */}
                <div className="account-dropdown-mobile-section mobile-only">
                  <button
                    type="button"
                    className="account-dropdown-item assistant-quick-item"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setIsAssistantOpen(true);
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span>Operations Assistant AI</span>
                    <span className="assistant-badge-pill" style={{ marginLeft: 'auto' }}>AI</span>
                  </button>
                </div>

                <div className="account-dropdown-divider" />

                {/* Navigation Links */}
                <Link
                  to="/app/my-profile"
                  className="account-dropdown-item"
                  onClick={() => setAccountMenuOpen(false)}
                  role="menuitem"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>My Profile & Settings</span>
                </Link>

                <Link
                  to="/app/notifications"
                  className="account-dropdown-item"
                  onClick={() => setAccountMenuOpen(false)}
                  role="menuitem"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span>Notifications & Alerts</span>
                  {unreadCount > 0 && <span className="account-dropdown-badge">{unreadCount}</span>}
                </Link>

                <div className="account-dropdown-divider" />

                {/* Logout Action */}
                <button
                  type="button"
                  className="account-dropdown-item logout-item"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    logout();
                  }}
                  role="menuitem"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>

          {/* Dedicated Logout Action (Desktop & Tablet >= 768px) */}
          <button
            type="button"
            className="btn-logout desktop-tablet-only"
            onClick={logout}
            title="Sign out of BFA portal"
            aria-label="Sign out"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="logout-btn-text">Logout</span>
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
