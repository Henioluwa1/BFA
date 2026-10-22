const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('../../config');

// Production Content Security Policy Directives
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:'],
  connectSrc: [
    "'self'",
    config.app.url,
    config.app.frontendUrl,
    ...config.cors.origin,
    'ws:',
    'wss:',
  ],
  frameAncestors: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: cspDirectives,
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: config.app.isProduction
    ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: false,
      }
    : false, // Do not force HSTS on local HTTP development
  frameguard: {
    action: 'sameorigin',
  },
  noSniff: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
});

const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, server-to-server, mobile app) without origin header
    if (!origin) return callback(null, true);

    const isExplicitlyAllowed = config.cors.origin.includes(origin);

    // In development or test, allow local development origins
    if (!config.app.isProduction) {
      if (
        isExplicitlyAllowed ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return callback(null, true);
      }
    } else {
      // In production, strictly enforce explicit origin allowlist
      if (isExplicitlyAllowed) {
        return callback(null, true);
      }
    }

    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    'X-Property-Id',
    'X-User-Role',
    'X-Agent-Id',
  ],
});

// General API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  skip: () => config.app.isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
  },
});

// Dedicated Authentication Rate Limiter (Brute-Force Protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20, // 20 attempts per window
  skip: () => config.app.isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
    },
  },
});

// Dedicated Public Booking Rate Limiter (Denial-of-Service Protection)
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: parseInt(process.env.BOOKING_RATE_LIMIT_MAX, 10) || 60, // 60 booking requests per window
  skip: () => config.app.isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'BOOKING_RATE_LIMIT_EXCEEDED',
      message: 'Too many booking requests from this IP. Please try again later.',
    },
  },
});

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  apiLimiter,
  authLimiter,
  bookingLimiter,
};
