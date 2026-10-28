const logger = require('../../utils/logger');

let ioInstance = null;

/**
 * Register active Socket.IO server instance
 * @param {import('socket.io').Server} io
 */
function setIO(io) {
  ioInstance = io;
  logger.info('[SOCKET_EMITTER] Socket.IO instance registered for operational broadcasting.');
}

/**
 * Get active Socket.IO server instance
 * @returns {import('socket.io').Server|null}
 */
function getIO() {
  return ioInstance;
}

/**
 * Broadcast operational event to all connected clients or specific rooms
 * @param {string} event
 * @param {object} payload
 * @param {object} [options]
 * @param {number|string} [options.propertyId]
 * @param {string|string[]} [options.roles]
 */
function broadcastOperationalEvent(event, payload, options = {}) {
  if (!ioInstance) {
    logger.debug(`[SOCKET_EMITTER] Skip broadcast (engine not mounted): ${event}`);
    return false;
  }

  try {
    const enrichedPayload = {
      ...payload,
      _broadcastTimestamp: new Date().toISOString(),
    };

    if (options.propertyId) {
      ioInstance.to(`property_${options.propertyId}`).emit(event, enrichedPayload);
    }

    // Always emit on main channel for real-time dashboards & front desk operations
    ioInstance.emit(event, enrichedPayload);
    return true;
  } catch (err) {
    logger.warn(`[SOCKET_EMITTER] Failed to broadcast event ${event}: ${err.message}`);
    return false;
  }
}

module.exports = {
  setIO,
  getIO,
  broadcastOperationalEvent,
};

