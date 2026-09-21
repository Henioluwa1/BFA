import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className={`main-wrapper ${collapsed ? 'expanded' : ''}`}>
        <Topbar />
        <main className="content-viewport">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
