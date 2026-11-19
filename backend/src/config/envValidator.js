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
  const INSECURE_DEFAULT_SECRETS = [
    'bfa_super_secret_default_key',
    'bfa_super_secret_jwt_key_production_random_entropy_32_chars',
    'your_production_jwt_secret_min_32_chars_long_entropy_here',
  ];
  if (!jwtSecret) {
    errors.push('JWT_SECRET is not defined.');
  } else if (isProduction && (INSECURE_DEFAULT_SECRETS.includes(jwtSecret) || jwtSecret.length < 32)) {
    errors.push('JWT_SECRET must be at least 32 characters long and cannot use the development default or example placeholders.');
  }

  // 2. Database Configuration Validation (Supports PostgreSQL/Aiven and MySQL/TiDB)
  const rawDbEngine = (process.env.DB_ENGINE || '').trim().toLowerCase();
  if (rawDbEngine && !['postgres', 'postgresql', 'mysql'].includes(rawDbEngine)) {
    errors.push(`Invalid DB_ENGINE value: "${process.env.DB_ENGINE}". Expected "postgres" or "mysql".`);
  }

  const isPgConfigured = rawDbEngine === 'mysql'
    ? false
    : (
        ['postgres', 'postgresql'].includes(rawDbEngine) ||
        Boolean(
          process.env.DATABASE_URL ||
          process.env.PGHOST ||
          process.env.AIVEN_PG_HOST ||
          process.env.PG_HOST ||
          process.env.DB_PROVIDER === 'aiven' ||
          process.env.DB_CLIENT === 'postgres'
        )
      );

  if (isPgConfigured) {
    if (process.env.DATABASE_URL) {
      if (!process.env.DATABASE_URL.startsWith('postgres://') && !process.env.DATABASE_URL.startsWith('postgresql://')) {
        errors.push('DATABASE_URL must be a valid PostgreSQL connection URI (postgres:// or postgresql://).');
      }
    } else {
      const pgHost = process.env.PGHOST || process.env.AIVEN_PG_HOST || process.env.PG_HOST || process.env.DB_HOST;
      const pgUser = process.env.PGUSER || process.env.AIVEN_PG_USER || process.env.PG_USER || process.env.DB_USER;
      const pgName = process.env.PGDATABASE || process.env.AIVEN_PG_DATABASE || process.env.PG_DATABASE || process.env.DB_NAME;
      const pgPassword = process.env.PGPASSWORD || process.env.AIVEN_PG_PASSWORD || process.env.PG_PASSWORD || process.env.DB_PASSWORD;

      if (!pgHost) errors.push('PostgreSQL host (PGHOST, AIVEN_PG_HOST, or DB_HOST) is required.');
      if (!pgUser) errors.push('PostgreSQL user (PGUSER, AIVEN_PG_USER, or DB_USER) is required.');
      if (!pgName) errors.push('PostgreSQL database name (PGDATABASE, AIVEN_PG_DATABASE, or DB_NAME) is required.');
      if (isProduction && !pgPassword) {
        errors.push('PostgreSQL password (PGPASSWORD, AIVEN_PG_PASSWORD, or DB_PASSWORD) must be configured for production.');
      }
    }
  } else {
    const dbHost = process.env.DB_HOST || process.env.MYSQLHOST;
    const dbUser = process.env.DB_USER || process.env.MYSQLUSER;
    const dbName = process.env.DB_NAME || process.env.MYSQLDATABASE;
    const dbPassword = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD;

    if (!dbHost) errors.push('DB_HOST (or MYSQLHOST) is required.');
    if (!dbUser) errors.push('DB_USER (or MYSQLUSER) is required.');
    if (!dbName) errors.push('DB_NAME (or MYSQLDATABASE) is required.');
    if (isProduction && !dbPassword) {
      errors.push('DB_PASSWORD (or MYSQLPASSWORD) must be configured for production deployment.');
    }
  }

  // 3. CORS Allowed Origins Validation
  if (isProduction) {
    const corsOrigin = process.env.CORS_ORIGIN;
    if (!corsOrigin || corsOrigin.trim() === '') {
      errors.push('CORS_ORIGIN must be explicitly configured with trusted production domain(s).');
    } else {
      // Parse each comma-separated origin individually to prevent bypass via
      // mixed values such as 'https://real.com,*' slipping past a substring check.
      const parsedOrigins = corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
      const hasWildcard = parsedOrigins.some((o) => o === '*');
      if (hasWildcard) {
        errors.push('CORS_ORIGIN cannot contain a wildcard "*" in production. Provide explicit trusted domain(s).');
      }
    }
  }

  // 4. Migration Controls Validation
  const rawAutoMigrate = process.env.AUTO_MIGRATE || process.env.DB_AUTO_MIGRATE;
  if (rawAutoMigrate !== undefined && rawAutoMigrate !== '') {
    const norm = String(rawAutoMigrate).trim().toLowerCase();
    if (!['true', 'false', '1', '0'].includes(norm)) {
      errors.push(`Invalid AUTO_MIGRATE value: "${rawAutoMigrate}". Expected "true", "false", "1", or "0".`);
    }
  }

  const rawStrictSchema = process.env.STRICT_SCHEMA_CHECK;
  if (rawStrictSchema !== undefined && rawStrictSchema !== '') {
    const norm = String(rawStrictSchema).trim().toLowerCase();
    if (!['true', 'false', '1', '0'].includes(norm)) {
      errors.push(`Invalid STRICT_SCHEMA_CHECK value: "${rawStrictSchema}". Expected "true", "false", "1", or "0".`);
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
