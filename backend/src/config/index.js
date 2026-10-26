const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  app: {
    name: process.env.APP_NAME || 'BFA Apartments Management System',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 5000,
    url: process.env.APP_URL || 'http://localhost:5000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
  },
  db: {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'bfa_apartments_db',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT, 10) || 0,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 60000,
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 10000,
    timezone: '+00:00',
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
