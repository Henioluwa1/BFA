import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PropertyProvider } from './context/PropertyContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Loading Fallback Component for Suspense
function PageLoader() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        width: '100%',
        color: '#64748b',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(212, 175, 55, 0.2)',
          borderTopColor: '#d4af37',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span style={{ fontSize: '0.9rem', fontWeight: 500, letterSpacing: '0.05em' }}>
        LOADING BFA PORTAL...
      </span>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Lazy-Loaded Public Pages
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

// Lazy-Loaded Authenticated Pages
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const FrontOfficePage = lazy(() => import('./pages/FrontOfficePage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const ReservationsPage = lazy(() => import('./pages/ReservationsPage'));
const GuestsPage = lazy(() => import('./pages/GuestsPage'));
const ApartmentsPage = lazy(() => import('./pages/ApartmentsPage'));
const FinancialPage = lazy(() => import('./pages/FinancialPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AgentsPage = lazy(() => import('./pages/AgentsPage'));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'));
const InspectionPage = lazy(() => import('./pages/InspectionPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AccessControlPage = lazy(() => import('./pages/AccessControlPage'));
const CommunicationsPage = lazy(() => import('./pages/CommunicationsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Lazy-Loaded Phase 11 Employee Pages
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const EmployeeProfilePage = lazy(() => import('./pages/EmployeeProfilePage'));
const EmployeeEvaluationPage = lazy(() => import('./pages/EmployeeEvaluationPage'));
const EmployeePerformancePage = lazy(() => import('./pages/EmployeePerformancePage'));
const EmployeeIdCardPage = lazy(() => import('./pages/EmployeeIdCardPage'));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PropertyProvider>
          <ToastProvider>
            <NotificationProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />

                  {/* Authenticated Portal Shell */}
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
                      <Route path="employees" element={<EmployeesPage />} />
                      <Route path="employees/:id" element={<EmployeeProfilePage />} />
                      <Route path="employees/:id/id-card" element={<EmployeeIdCardPage />} />
                      <Route path="employees/:id/performance" element={<EmployeePerformancePage />} />
                      <Route path="employees/:id/evaluation" element={<EmployeeEvaluationPage />} />
                      <Route path="evaluations" element={<EmployeeEvaluationPage />} />
                      <Route path="performance" element={<EmployeePerformancePage />} />
                      <Route path="id-cards" element={<EmployeeIdCardPage />} />
                      <Route path="my-profile" element={<EmployeeProfilePage isSelfService={true} />} />
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
                  <Route path="/employees" element={<Navigate to="/app/employees" replace />} />
                  <Route path="/evaluations" element={<Navigate to="/app/evaluations" replace />} />
                  <Route path="/performance" element={<Navigate to="/app/performance" replace />} />
                  <Route path="/id-cards" element={<Navigate to="/app/id-cards" replace />} />
                  <Route path="/my-profile" element={<Navigate to="/app/my-profile" replace />} />
                  <Route path="/maintenance" element={<Navigate to="/app/maintenance" replace />} />
                  <Route path="/inspection" element={<Navigate to="/app/inspection" replace />} />
                  <Route path="/audit" element={<Navigate to="/app/audit" replace />} />
                  <Route path="/team" element={<Navigate to="/app/team" replace />} />
                  <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
                  <Route path="/404" element={<NotFoundPage />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
              </Suspense>
            </NotificationProvider>
          </ToastProvider>
        </PropertyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
