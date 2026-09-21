/**
 * Structured Application Logger with Sensitive Data Scrubbing
 */
const config = require('../../config');

const SENSITIVE_KEYS = [
  'password',
  'token',
  'jwt',
  'secret',
  'authorization',
  'creditcard',
  'cardnumber',
  'cvv',
  'api_key',
  'apikey',
];

/**
 * Recursively scrub sensitive keys from log metadata
 */
function sanitizeMeta(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeMeta);

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeMeta(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

const formatTime = () => new Date().toISOString();

const logger = {
  info: (msg, meta = {}) => {
    const clean = sanitizeMeta(meta);
    const metaStr = Object.keys(clean).length ? ` ${JSON.stringify(clean)}` : '';
    console.log(`[${formatTime()}] [INFO]: ${msg}${metaStr}`);
  },
  warn: (msg, meta = {}) => {
    const clean = sanitizeMeta(meta);
    const metaStr = Object.keys(clean).length ? ` ${JSON.stringify(clean)}` : '';
    console.warn(`[${formatTime()}] [WARN]: ${msg}${metaStr}`);
  },
  error: (msg, meta = {}) => {
    const clean = sanitizeMeta(meta);
    const metaStr = Object.keys(clean).length ? ` ${JSON.stringify(clean)}` : '';
    console.error(`[${formatTime()}] [ERROR]: ${msg}${metaStr}`);
  },
  debug: (msg, meta = {}) => {
    if (!config.app.isProduction) {
      const clean = sanitizeMeta(meta);
      const metaStr = Object.keys(clean).length ? ` ${JSON.stringify(clean)}` : '';
      console.debug(`[${formatTime()}] [DEBUG]: ${msg}${metaStr}`);
    }
  },
  sanitizeMeta,
};

module.exports = logger;
