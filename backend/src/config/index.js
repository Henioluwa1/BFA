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
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: resolvedDatabase,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT, 10) || 0,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 60000,
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 10000,
    tls: {
      enabled: ['true', '1'].includes((process.env.DB_TLS || '').trim().toLowerCase()),
      ca: process.env.DB_TLS_CA || '',
      caPath: process.env.DB_TLS_CA_PATH || '',
    },
    timezone: '+00:00',
    autoMigrate: resolvedAutoMigrate,
    strictSchemaCheck: resolvedStrictSchema,
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
