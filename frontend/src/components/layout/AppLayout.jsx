import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
