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

app.use('/api/v1', apiV1Router);

// 404 Route Not Found Handler
app.use(notFoundHandler);

// Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
