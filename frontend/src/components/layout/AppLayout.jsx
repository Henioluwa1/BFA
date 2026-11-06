import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ErrorBoundary from '../ui/ErrorBoundary';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();

  // Enforce authorized role theme while inside the internal portal shell
  // and cleanly reset to 'default' if navigating out to unauthenticated public pages
  useEffect(() => {
    let roleKey = (user?.role || '').toLowerCase();
    if (roleKey === 'operations_manager') {
      roleKey = 'manager';
    }
    const validThemes = ['super_admin', 'admin', 'owner', 'manager', 'staff', 'receptionist', 'agent'];
    const activeTheme = validThemes.includes(roleKey) ? roleKey : 'default';
    document.documentElement.setAttribute('data-portal-theme', activeTheme);

    return () => {
      // Clean reset when leaving internal portal shell
      document.documentElement.setAttribute('data-portal-theme', 'default');
    };
  }, [user]);

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={`main-wrapper ${collapsed ? 'expanded' : ''}`}>
        <Topbar onToggleMobileNav={() => setMobileOpen((prev) => !prev)} />
        <main className="content-viewport">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
