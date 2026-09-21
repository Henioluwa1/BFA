const express = require('express');
const { helmetMiddleware, corsMiddleware, apiLimiter } = require('./middleware/security');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./modules/health/health.routes');
const systemRoutes = require('./modules/system/system.routes');

const app = express();

// Trust proxy for rate limiting if behind reverse proxy
app.set('trust proxy', 1);

// Standard security & cors
app.use(helmetMiddleware);
app.use(corsMiddleware);

// Request body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request tracing & logging
app.use(requestLogger);

// Rate limiter for API
app.use('/api/', apiLimiter);

// API v1 Routes
const apiV1Router = express.Router();

apiV1Router.use('/health', healthRoutes);
apiV1Router.use('/system', systemRoutes);

// Register API root
app.use('/api/v1', apiV1Router);

// 404 Route Not Found Handler
app.use(notFoundHandler);

// Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
