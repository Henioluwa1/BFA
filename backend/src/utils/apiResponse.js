/**
 * Standardized API Response Envelopes
 */
class ApiResponse {
  /**
   * Return success response envelope
   */
  static success(res, { statusCode = 200, message = 'Success', data = null, meta = {} } = {}) {
    const requestId = res?.req?.id || res?.getHeader('X-Request-Id') || undefined;

    return res.status(statusCode).json({
      success: true,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...(requestId ? { requestId } : {}),
        ...meta,
      },
    });
  }

  /**
   * Return created response envelope (201)
   */
  static created(res, { message = 'Resource created successfully', data = null, meta = {} } = {}) {
    return ApiResponse.success(res, { statusCode: 201, message, data, meta });
  }

  /**
   * Return paginated response envelope
   */
  static paginated(res, { data = [], page = 1, limit = 10, total = 0, message = 'Success' } = {}) {
    return ApiResponse.success(res, {
      message,
      data,
      meta: {
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Number(total),
          totalPages: Math.ceil(total / limit) || 1,
          hasNext: Number(page) * Number(limit) < total,
          hasPrev: Number(page) > 1,
        },
      },
    });
  }
}

module.exports = ApiResponse;
