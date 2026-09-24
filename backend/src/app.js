const express = require('express');
const { helmetMiddleware, corsMiddleware, apiLimiter } = require('./core/security/security');
const requestLogger = require('./core/middleware/requestLogger');
const { authContext } = require('./core/middleware/authContext');
const { errorHandler, notFoundHandler } = require('./core/middleware/errorHandler');

// Domain Modules
const authRoutes = require('./modules/auth/auth.routes');
const publicRoutes = require('./modules/public/public.routes');
const healthRoutes = require('./modules/health/health.routes');
const systemRoutes = require('./modules/system/system.routes');
const propertiesRoutes = require('./modules/properties/properties.routes');
const apartmentsRoutes = require('./modules/apartments/apartments.routes');
const reservationsRoutes = require('./modules/reservations/reservations.routes');
const searchRoutes = require('./modules/search/search.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const accessRoutes = require('./modules/access/access.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const bookingAuthRoutes = require('./modules/bookingAuth/bookingAuth.routes');
const communicationsRoutes = require('./modules/communications/communications.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const announcementsRoutes = require('./modules/announcements/announcements.routes');
const calendarRoutes = require('./modules/calendar/calendar.routes');
const frontOfficeRoutes = require('./modules/frontOffice/frontOffice.routes');
const guestsRoutes = require('./modules/guests/guests.routes');
const inspectionsRoutes = require('./modules/inspections/inspections.routes');
const maintenanceRoutes = require('./modules/maintenance/maintenance.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const financialRoutes = require('./modules/financial/financial.routes');
const agentsRoutes = require('./modules/agents/agents.routes');
const commissionsRoutes = require('./modules/commissions/commissions.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const employeesRoutes = require('./modules/employees/employees.routes');

const app = express();

app.set('trust proxy', 1);

// Standard security & cors
app.use(helmetMiddleware);
app.use(corsMiddleware);

// Request body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request tracing & logging
app.use(requestLogger);

// Auth context cryptographic token extraction
app.use(authContext);

// Rate limiter for API
app.use('/api/', apiLimiter);

// API v1 Versioned Router
const apiV1Router = express.Router();

apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/public', publicRoutes);
apiV1Router.use('/health', healthRoutes);
apiV1Router.use('/system', systemRoutes);
apiV1Router.use('/properties', propertiesRoutes);
apiV1Router.use('/apartments', apartmentsRoutes);
apiV1Router.use('/reservations', reservationsRoutes);
apiV1Router.use('/search', searchRoutes);
apiV1Router.use('/reports', reportsRoutes);
apiV1Router.use('/audit', auditRoutes);
apiV1Router.use('/access', accessRoutes);
apiV1Router.use('/payments', paymentsRoutes);
apiV1Router.use('/booking-authentication', bookingAuthRoutes);
apiV1Router.use('/communications', communicationsRoutes);
apiV1Router.use('/notifications', notificationsRoutes);
apiV1Router.use('/announcements', announcementsRoutes);
apiV1Router.use('/calendar', calendarRoutes);
apiV1Router.use('/front-office', frontOfficeRoutes);
apiV1Router.use('/guests', guestsRoutes);
apiV1Router.use('/tenants', guestsRoutes); // Backward-compatible alias
apiV1Router.use('/inspections', inspectionsRoutes);
apiV1Router.use('/maintenance', maintenanceRoutes);
apiV1Router.use('/expenses', expensesRoutes);
apiV1Router.use('/financial', financialRoutes);
apiV1Router.use('/agents', agentsRoutes);
apiV1Router.use('/commissions', commissionsRoutes);
apiV1Router.use('/analytics', analyticsRoutes);
apiV1Router.use('/employees', employeesRoutes);

app.use('/api/v1', apiV1Router);

// 404 Route Not Found Handler
app.use(notFoundHandler);

// Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
