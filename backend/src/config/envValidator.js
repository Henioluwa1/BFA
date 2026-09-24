/**
 * Startup Environment Validation for Production Readiness
 * Verifies that all mandatory production configuration is present and secure.
 * Guarantees zero leakage of secrets in diagnostic logs.
 */
const logger = require('../core/logging/logger');

function validateEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors = [];

  // 1. Mandatory JWT Secret Validation
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is not defined.');
  } else if (isProduction && (jwtSecret === 'bfa_super_secret_default_key' || jwtSecret.length < 32)) {
    errors.push('JWT_SECRET must be at least 32 characters long and cannot use the development default.');
  }

  // 2. Database Configuration Validation
  if (!process.env.DB_HOST) errors.push('DB_HOST is required.');
  if (!process.env.DB_USER) errors.push('DB_USER is required.');
  if (!process.env.DB_NAME) errors.push('DB_NAME is required.');
  if (isProduction && !process.env.DB_PASSWORD) {
    errors.push('DB_PASSWORD must be configured for production deployment.');
  }

  // 3. CORS Allowed Origins Validation
  if (isProduction) {
    const corsOrigin = process.env.CORS_ORIGIN;
    if (!corsOrigin || corsOrigin.trim() === '') {
      errors.push('CORS_ORIGIN must be explicitly configured with trusted production domain(s).');
    } else if (corsOrigin.includes('*') && !corsOrigin.startsWith('http')) {
      errors.push('CORS_ORIGIN cannot be wildcard "*" in production.');
    }
  }

  if (errors.length > 0) {
    logger.error('CRITICAL: Startup Environment Validation Failed!');
    errors.forEach((err) => logger.error(`  - ${err}`));
    logger.error('Server startup aborted to prevent insecure production execution.');
    return { valid: false, errors };
  }

  logger.info(`Environment validation passed [Mode: ${process.env.NODE_ENV || 'development'}].`);
  return { valid: true, errors: [] };
}

module.exports = { validateEnvironment };
