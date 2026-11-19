const dotenv = require('dotenv');
const path = require('path');

// Load environment variables (.env.test takes precedence in test mode)
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
}
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isTest = process.env.NODE_ENV === 'test';
const resolvedDatabase = isTest
  ? (process.env.DB_NAME_TEST || process.env.TEST_DB_NAME || 'bfa_apartments_test_db')
  : (process.env.DB_NAME || process.env.MYSQLDATABASE || 'bfa_apartments_db');

// Migration lifecycle configuration:
// - In production: autoMigrate strictly defaults to FALSE (controlled manual execution via npm run db:migrate).
// - In test: autoMigrate defaults to FALSE (isolated test scripts manage test DB).
// - In development: autoMigrate defaults to TRUE unless explicitly set to false/0.
const rawAutoMigrate = (process.env.AUTO_MIGRATE || process.env.DB_AUTO_MIGRATE || '').trim().toLowerCase();
let resolvedAutoMigrate = false;
if (process.env.NODE_ENV === 'production' || isTest) {
  resolvedAutoMigrate = rawAutoMigrate === 'true' || rawAutoMigrate === '1';
} else {
  resolvedAutoMigrate = rawAutoMigrate === '' ? true : (rawAutoMigrate === 'true' || rawAutoMigrate === '1');
}

const rawStrictSchema = (process.env.STRICT_SCHEMA_CHECK || '').trim().toLowerCase();
const resolvedStrictSchema = rawStrictSchema === 'true' || rawStrictSchema === '1';

const config = {
  app: {
    name: process.env.APP_NAME || 'BFA Apartments Management System',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 5000,
    url: process.env.APP_URL || 'http://localhost:5000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    isProduction: process.env.NODE_ENV === 'production',
    isTest,
  },
  db: {
    host: isTest ? (process.env.TEST_DB_HOST || '127.0.0.1') : (process.env.DB_HOST || process.env.MYSQLHOST || 'localhost'),
    port: isTest
      ? (parseInt(process.env.TEST_DB_PORT, 10) || 3306)
      : (parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10) || 3306),
    user: isTest ? (process.env.TEST_DB_USER || 'root') : (process.env.DB_USER || process.env.MYSQLUSER || 'root'),
    password: isTest ? (process.env.TEST_DB_PASSWORD || '') : (process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || ''),
    database: resolvedDatabase,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT, 10) || 0,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 60000,
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 10000,
    tls: {
      enabled: isTest
        ? ['true', '1'].includes((process.env.TEST_DB_TLS || '').trim().toLowerCase())
        : ['true', '1'].includes((process.env.DB_TLS || '').trim().toLowerCase()),
      ca: isTest ? (process.env.TEST_DB_TLS_CA || '') : (process.env.DB_TLS_CA || ''),
      caPath: isTest ? (process.env.TEST_DB_TLS_CA_PATH || '') : (process.env.DB_TLS_CA_PATH || ''),
    },
    timezone: '+00:00',
    autoMigrate: resolvedAutoMigrate,
    strictSchemaCheck: resolvedStrictSchema,
  },
  pg: {
    enabled: isTest
      ? (process.env.TEST_DB_ENGINE || 'postgres').trim().toLowerCase() !== 'mysql'
      : ((process.env.DB_ENGINE || '').trim().toLowerCase() === 'mysql')
      ? false
      : (
          ['postgres', 'postgresql'].includes((process.env.DB_ENGINE || '').trim().toLowerCase()) ||
          Boolean(
            process.env.PGHOST ||
            process.env.DATABASE_URL ||
            process.env.AIVEN_PG_HOST ||
            process.env.PG_HOST ||
            process.env.DB_PROVIDER === 'aiven' ||
            process.env.DB_CLIENT === 'postgres'
          )
        ),
    engine: isTest
      ? (process.env.TEST_DB_ENGINE || 'postgres').trim().toLowerCase()
      : ((process.env.DB_ENGINE || '').trim().toLowerCase() === 'mysql')
      ? 'mysql'
      : (
          ['postgres', 'postgresql'].includes((process.env.DB_ENGINE || '').trim().toLowerCase()) ||
          process.env.PGHOST ||
          process.env.DATABASE_URL
            ? 'postgres'
            : 'mysql'
        ),
    connectionString: isTest
      ? (process.env.TEST_DATABASE_URL || null)
      : (process.env.DATABASE_URL || process.env.PG_URI || process.env.AIVEN_PG_URI || null),
    host: isTest
      ? (process.env.TEST_PGHOST || '127.0.0.1')
      : (process.env.PGHOST || process.env.AIVEN_PG_HOST || process.env.PG_HOST || 'localhost'),
    port: isTest
      ? (parseInt(process.env.TEST_PGPORT, 10) || 5432)
      : (parseInt(process.env.PGPORT || process.env.AIVEN_PG_PORT || process.env.PG_PORT, 10) || 5432),
    database: isTest
      ? (process.env.TEST_PGDATABASE || resolvedDatabase)
      : (process.env.PGDATABASE || process.env.AIVEN_PG_DATABASE || process.env.PG_DATABASE || 'defaultdb'),
    user: isTest
      ? (process.env.TEST_PGUSER || 'postgres')
      : (process.env.PGUSER || process.env.AIVEN_PG_USER || process.env.PG_USER || 'avnadmin'),
    password: isTest
      ? (process.env.TEST_PGPASSWORD || '')
      : (process.env.PGPASSWORD || process.env.AIVEN_PG_PASSWORD || process.env.PG_PASSWORD || ''),
    ssl: {
      rejectUnauthorized: true,
      ca: isTest
        ? (process.env.TEST_PG_CA_CERT || '')
        : (process.env.PG_CA_CERT || process.env.AIVEN_CA_CERT || process.env.PG_CA || process.env.DB_TLS_CA || ''),
      caPath: isTest
        ? (process.env.TEST_PG_CA_PATH || '')
        : (process.env.PG_CA_PATH || process.env.AIVEN_CA_PATH || process.env.PG_SSL_CA_PATH || process.env.DB_TLS_CA_PATH || ''),
    },
    max: isTest
      ? (parseInt(process.env.TEST_PG_MAX_POOL, 10) || 5)
      : (parseInt(process.env.PG_MAX_POOL || process.env.PG_CONNECTION_LIMIT, 10) || 10),
    idleTimeoutMillis: isTest
      ? (parseInt(process.env.TEST_PG_IDLE_TIMEOUT_MS, 10) || 10000)
      : (parseInt(process.env.PG_IDLE_TIMEOUT_MS, 10) || 30000),
    connectionTimeoutMillis: isTest
      ? (parseInt(process.env.TEST_PG_CONNECT_TIMEOUT_MS, 10) || 2000)
      : (parseInt(process.env.PG_CONNECT_TIMEOUT_MS, 10) || 10000),
  },
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 1000,
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || 'bfa_super_secret_default_key',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  currency: {
    default: process.env.DEFAULT_CURRENCY || 'NGN',
    symbol: process.env.CURRENCY_SYMBOL || '₦',
    locale: process.env.CURRENCY_LOCALE || 'en-NG',
  },
};

module.exports = config;
