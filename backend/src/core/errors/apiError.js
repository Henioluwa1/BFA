/**
 * Typed Application Errors Hierarchy
 */
class ApiError extends Error {
  constructor(statusCode, message, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends ApiError {
  constructor(message = 'Bad Request', details = null) {
    super(400, message, 'BAD_REQUEST', details);
  }
}

class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized access', details = null) {
    super(401, message, 'UNAUTHORIZED', details);
  }
}

class ForbiddenError extends ApiError {
  constructor(message = 'Permission denied', details = null) {
    super(403, message, 'FORBIDDEN', details);
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', details = null) {
    super(404, message, 'NOT_FOUND', details);
  }
}

class ConflictError extends ApiError {
  constructor(message = 'Resource conflict', details = null) {
    super(409, message, 'CONFLICT', details);
  }
}

class ValidationError extends ApiError {
  constructor(message = 'Validation failed', details = null) {
    super(422, message, 'VALIDATION_ERROR', details);
  }
}

class InternalServerError extends ApiError {
  constructor(message = 'Internal server error', details = null) {
    super(500, message, 'INTERNAL_SERVER_ERROR', details);
  }
}

module.exports = {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  InternalServerError,
};
