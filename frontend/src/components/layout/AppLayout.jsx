import React, { useState, useEffect, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ErrorBoundary from '../ui/ErrorBoundary';
import GlobalBookingAlertModal from '../frontOffice/GlobalBookingAlertModal';
import FloatingStaffChatModal from '../chat/FloatingStaffChatModal';
import { useAuth } from '../../context/AuthContext';

function ContentLoader() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '45vh',
        gap: '12px',
        color: 'rgba(255, 255, 255, 0.7)',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          border: '2.5px solid rgba(212, 175, 55, 0.2)',
          borderTopColor: '#d4af37',
          borderRadius: '50%',
          animation: 'contentSpin 0.7s linear infinite',
        }}
      />
      <span style={{ fontSize: '0.82rem', letterSpacing: '0.05em', fontWeight: 600 }}>
        Loading...
      </span>
      <style>{`
        @keyframes contentSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

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
      {/* Global Booking Alert Modal: Strictly mounted ONLY within the Receptionist Portal */}
      {user?.role === 'RECEPTIONIST' && <GlobalBookingAlertModal />}
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
            <Suspense fallback={<ContentLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {/* Floating Staff Team Chat: Available across all authorized staff roles */}
      <FloatingStaffChatModal />
    </div>
  );
}
