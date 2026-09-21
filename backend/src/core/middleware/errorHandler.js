const { ApiError } = require('../errors/apiError');
const config = require('../../config');
const logger = require('../logging/logger');

function errorHandler(err, req, res, next) {
  const requestId = req.id || req.headers['x-request-id'];

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal error occurred';
  let details = null;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ZodError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'BAD_JSON';
    message = 'Malformed JSON payload provided in request';
  } else if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    statusCode = 422;
    code = 'DATABASE_CONSTRAINT_VIOLATION';
    message = 'Operation violates database business constraint (e.g. one-night maximum duration).';
  }

  if (statusCode >= 500) {
    logger.error(`Unhandled Error [${code}]: ${err.message}`, {
      stack: err.stack,
      requestId,
      url: req.originalUrl,
      method: req.method,
    });
  }

  const responseBody = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(!config.app.isProduction && statusCode >= 500 ? { stack: err.stack } : {}),
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    },
  };

  res.status(statusCode).json(responseBody);
}

function notFoundHandler(req, res, next) {
  const requestId = req.id || req.headers['x-request-id'];
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint ${req.method} ${req.originalUrl} was not found on this server.`,
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    },
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
