import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PropertyProvider } from './context/PropertyContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Public Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';

// Authenticated Pages
import DashboardPage from './pages/DashboardPage';
import FrontOfficePage from './pages/FrontOfficePage';
import CalendarPage from './pages/CalendarPage';
import ReservationsPage from './pages/ReservationsPage';
import GuestsPage from './pages/GuestsPage';
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
import AccessControlPage from './pages/AccessControlPage';
import CommunicationsPage from './pages/CommunicationsPage';
import NotificationsPage from './pages/NotificationsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PropertyProvider>
          <ToastProvider>
            <Routes>
              {/* Public Routes (Section 11, 14) */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Authenticated Portal Shell (Section 14, 25) */}
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<AppLayout />}>
                  <Route index element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="front-office" element={<FrontOfficePage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="reservations" element={<ReservationsPage />} />
                  <Route path="guests" element={<GuestsPage />} />
                  <Route path="tenants" element={<GuestsPage />} />
                  <Route path="apartments" element={<ApartmentsPage />} />
                  <Route path="financial" element={<FinancialPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="agents" element={<AgentsPage />} />
                  <Route path="maintenance" element={<MaintenancePage />} />
                  <Route path="inspection" element={<InspectionPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="access-control" element={<AccessControlPage />} />
                  <Route path="communications" element={<CommunicationsPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="announcements" element={<AnnouncementsPage />} />
                  <Route path="team" element={<TeamPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="404" element={<NotFoundPage />} />
                </Route>
              </Route>

              {/* Legacy / Direct Route Compatibility Redirects */}
              <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
              <Route path="/front-office" element={<Navigate to="/app/front-office" replace />} />
              <Route path="/calendar" element={<Navigate to="/app/calendar" replace />} />
              <Route path="/reservations" element={<Navigate to="/app/reservations" replace />} />
              <Route path="/guests" element={<Navigate to="/app/guests" replace />} />
              <Route path="/tenants" element={<Navigate to="/app/guests" replace />} />
              <Route path="/apartments" element={<Navigate to="/app/apartments" replace />} />
              <Route path="/financial" element={<Navigate to="/app/financial" replace />} />
              <Route path="/reports" element={<Navigate to="/app/reports" replace />} />
              <Route path="/analytics" element={<Navigate to="/app/analytics" replace />} />
              <Route path="/agents" element={<Navigate to="/app/agents" replace />} />
              <Route path="/maintenance" element={<Navigate to="/app/maintenance" replace />} />
              <Route path="/inspection" element={<Navigate to="/app/inspection" replace />} />
              <Route path="/audit" element={<Navigate to="/app/audit" replace />} />
              <Route path="/team" element={<Navigate to="/app/team" replace />} />
              <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
              <Route path="/404" element={<NotFoundPage />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </ToastProvider>
        </PropertyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
