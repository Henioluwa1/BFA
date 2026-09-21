import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PropertyProvider } from './context/PropertyContext';
import { RoleProvider } from './context/RoleContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';

import DashboardPage from './pages/DashboardPage';
import CalendarPage from './pages/CalendarPage';
import ReservationsPage from './pages/ReservationsPage';
import ApartmentsPage from './pages/ApartmentsPage';
import FinancialPage from './pages/FinancialPage';
import ReportsPage from './pages/ReportsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AgentsPage from './pages/AgentsPage';
import MaintenancePage from './pages/MaintenancePage';
import InspectionPage from './pages/InspectionPage';
import AuditPage from './pages/AuditPage';
import TeamPage from './pages/TeamPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <RoleProvider>
        <PropertyProvider>
          <ToastProvider>
            <Routes>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="reservations" element={<ReservationsPage />} />
                <Route path="apartments" element={<ApartmentsPage />} />
                <Route path="financial" element={<FinancialPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="agents" element={<AgentsPage />} />
                <Route path="maintenance" element={<MaintenancePage />} />
                <Route path="inspection" element={<InspectionPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="team" element={<TeamPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="404" element={<NotFoundPage />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Route>
            </Routes>
          </ToastProvider>
        </PropertyProvider>
      </RoleProvider>
    </BrowserRouter>
  );
}
