/**
 * Standard Structured Logger
 */
const config = require('../config');

const formatTime = () => new Date().toISOString();

const logger = {
  info: (msg, meta = {}) => {
    console.log(`[${formatTime()}] [INFO]: ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  },
  warn: (msg, meta = {}) => {
    console.warn(`[${formatTime()}] [WARN]: ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  },
  error: (msg, meta = {}) => {
    console.error(`[${formatTime()}] [ERROR]: ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  },
  debug: (msg, meta = {}) => {
    if (!config.app.isProduction) {
      console.debug(`[${formatTime()}] [DEBUG]: ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
    }
  },
};

module.exports = logger;
