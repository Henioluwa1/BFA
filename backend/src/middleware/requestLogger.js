const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Middleware to assign request ID and log incoming HTTP requests
 */
function requestLogger(req, res, next) {
  // Attach or propagate X-Request-Id
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip || req.connection?.remoteAddress,
    };

    if (res.statusCode >= 500) {
      logger.error(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, logData);
    } else if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, logData);
    } else {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, logData);
    }
  });

  next();
}

module.exports = requestLogger;
