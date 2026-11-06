import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

// Helper to preserve search params when redirecting legacy financials route
function NavigateToFinancial() {
  const location = useLocation();
  return <Navigate to={`/app/financial${location.search}`} replace />;
}

// Public Pages (Statically bundled for zero-latency public discovery)
import LandingPage from './pages/landing/LandingPage';
import ExplorePropertiesPage from './pages/landing/ExplorePropertiesPage';
import PropertyDetailPage from './pages/landing/PropertyDetailPage';
import TrackStayPage from './pages/landing/TrackStayPage';
const LoginPage = lazy(() => import('./pages/portal/LoginPage'));
const AboutPage = lazy(() => import('./pages/landing/AboutPage'));
const ContactPage = lazy(() => import('./pages/landing/ContactPage'));
const DesignSystemPage = lazy(() => import('./pages/landing/DesignSystemPage'));

// Lazy-Loaded Authenticated Pages
const DashboardPage = lazy(() => import('./pages/portal/DashboardPage'));
const FrontOfficePage = lazy(() => import('./pages/portal/FrontOfficePage'));
const CalendarPage = lazy(() => import('./pages/portal/CalendarPage'));
const ReservationsPage = lazy(() => import('./pages/portal/ReservationsPage'));
const GuestsPage = lazy(() => import('./pages/portal/GuestsPage'));
const ApartmentsPage = lazy(() => import('./pages/portal/ApartmentsPage'));
const PropertiesPage = lazy(() => import('./pages/portal/PropertiesPage'));
const FinancialPage = lazy(() => import('./pages/portal/FinancialPage'));
const ReportsPage = lazy(() => import('./pages/portal/ReportsPage'));
const AnalyticsPage = lazy(() => import('./pages/portal/AnalyticsPage'));
const AgentsPage = lazy(() => import('./pages/portal/AgentsPage'));
const MaintenancePage = lazy(() => import('./pages/portal/MaintenancePage'));
const InspectionPage = lazy(() => import('./pages/portal/InspectionPage'));
const AuditPage = lazy(() => import('./pages/portal/AuditPage'));
const TeamPage = lazy(() => import('./pages/portal/TeamPage'));
const SettingsPage = lazy(() => import('./pages/portal/SettingsPage'));
const OperationsPage = lazy(() => import('./pages/portal/OperationsPage'));
const AccessControlPage = lazy(() => import('./pages/portal/AccessControlPage'));
const CommunicationsPage = lazy(() => import('./pages/portal/CommunicationsPage'));
const NotificationsPage = lazy(() => import('./pages/portal/NotificationsPage'));
const AnnouncementsPage = lazy(() => import('./pages/portal/AnnouncementsPage'));
const NotFoundPage = lazy(() => import('./pages/portal/NotFoundPage'));

// Lazy-Loaded Phase 11 Employee Pages
const EmployeesPage = lazy(() => import('./pages/portal/EmployeesPage'));
const EmployeeProfilePage = lazy(() => import('./pages/portal/EmployeeProfilePage'));
const EmployeeEvaluationPage = lazy(() => import('./pages/portal/EmployeeEvaluationPage'));
const EmployeePerformancePage = lazy(() => import('./pages/portal/EmployeePerformancePage'));
const EmployeeIdCardPage = lazy(() => import('./pages/portal/EmployeeIdCardPage'));
const WorkforcePage = lazy(() => import('./pages/portal/WorkforcePage'));
const MySchedulePage = lazy(() => import('./pages/portal/MySchedulePage'));

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
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/properties" element={<ExplorePropertiesPage />} />
                  <Route path="/explore" element={<ExplorePropertiesPage />} />
                  <Route path="/design-system" element={<DesignSystemPage />} />
                  <Route path="/property/:id" element={<PropertyDetailPage />} />
                  <Route path="/properties/:id" element={<PropertyDetailPage />} />
                  <Route path="/track" element={<TrackStayPage />} />
                  <Route path="/tracking" element={<TrackStayPage />} />
                  <Route path="/stay-tracking" element={<TrackStayPage />} />

                  {/* Authenticated Portal Shell */}
                  <Route element={<ProtectedRoute />}>
                    <Route path="/app" element={<AppLayout />}>
                      <Route index element={<Navigate to="/app/dashboard" replace />} />
                      <Route path="dashboard" element={<DashboardPage />} />
                      <Route path="properties" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><PropertiesPage /></ProtectedRoute>} />
                      <Route path="front-office" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST']}><FrontOfficePage /></ProtectedRoute>} />
                      <Route path="calendar" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST', 'AGENT']}><CalendarPage /></ProtectedRoute>} />
                      <Route path="reservations" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST', 'AGENT']}><ReservationsPage /></ProtectedRoute>} />
                      <Route path="guests" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST']}><GuestsPage /></ProtectedRoute>} />
                      <Route path="tenants" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST']}><GuestsPage /></ProtectedRoute>} />
                      <Route path="apartments" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST', 'STAFF']}><ApartmentsPage /></ProtectedRoute>} />
                      <Route path="financial" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><FinancialPage /></ProtectedRoute>} />
                      <Route path="financials" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><NavigateToFinancial /></ProtectedRoute>} />
                      <Route path="reports" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><ReportsPage /></ProtectedRoute>} />
                      <Route path="analytics" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><AnalyticsPage /></ProtectedRoute>} />
                      <Route path="agents" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><AgentsPage /></ProtectedRoute>} />
                      <Route path="employees" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><EmployeesPage /></ProtectedRoute>} />
                      <Route path="employees/:id" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><EmployeeProfilePage /></ProtectedRoute>} />
                      <Route path="employees/:id/id-card" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><EmployeeIdCardPage /></ProtectedRoute>} />
                      <Route path="employees/:id/performance" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><EmployeePerformancePage /></ProtectedRoute>} />
                      <Route path="employees/:id/evaluation" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><EmployeeEvaluationPage /></ProtectedRoute>} />
                      <Route path="evaluations" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><EmployeeEvaluationPage /></ProtectedRoute>} />
                      <Route path="performance" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><EmployeePerformancePage /></ProtectedRoute>} />
                      <Route path="id-cards" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><EmployeeIdCardPage /></ProtectedRoute>} />
                      <Route path="workforce" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER']}><WorkforcePage /></ProtectedRoute>} />
                      <Route path="roster" element={<Navigate to="/app/workforce" replace />} />
                      <Route path="my-schedule" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST', 'STAFF']}><MySchedulePage /></ProtectedRoute>} />
                      <Route path="my-profile" element={<EmployeeProfilePage isSelfService={true} />} />
                      <Route path="maintenance" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'STAFF']}><MaintenancePage /></ProtectedRoute>} />
                      <Route path="inspection" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'STAFF']}><InspectionPage /></ProtectedRoute>} />
                      <Route path="inspections" element={<ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'STAFF']}><InspectionPage /></ProtectedRoute>} />
                      <Route path="audit" element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'OWNER', 'ADMIN']}><AuditPage /></ProtectedRoute>} />
                      <Route path="access-control" element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'OWNER', 'ADMIN']}><AccessControlPage /></ProtectedRoute>} />
                      <Route path="communications" element={<CommunicationsPage />} />
                      <Route path="notifications" element={<NotificationsPage />} />
                      <Route path="announcements" element={<AnnouncementsPage />} />
                      <Route path="team" element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'OWNER']}><TeamPage /></ProtectedRoute>} />
                      <Route path="settings" element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'OWNER']}><SettingsPage /></ProtectedRoute>} />
                      <Route path="operations" element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'OWNER']}><OperationsPage /></ProtectedRoute>} />
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
                  <Route path="/financials" element={<NavigateToFinancial />} />
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
                  <Route path="/inspections" element={<Navigate to="/app/inspection" replace />} />
                  <Route path="/audit" element={<Navigate to="/app/audit" replace />} />
                  <Route path="/team" element={<Navigate to="/app/team" replace />} />
                  <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
                  <Route path="/operations" element={<Navigate to="/app/operations" replace />} />
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
