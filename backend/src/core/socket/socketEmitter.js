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
 * Broadcast operational event to all connected clients or specific role-gated channels
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

    // Strict Receptionist Booking Alert Isolation:
    // Urgent customer booking alerts and claim notifications must ONLY be delivered
    // to authorized receptionists on their dedicated subscription channel.
    if (event === 'booking:new_alert' || event === 'booking:claimed') {
      if (options.propertyId) {
        ioInstance.to(`channel:receptionist:alerts:prop:${options.propertyId}`).emit(event, enrichedPayload);
      }
      // Broadcast to receptionists subscribed to the receptionist alert channel
      ioInstance.to('channel:receptionist:alerts').emit(event, enrichedPayload);
      logger.info(`[SOCKET_EMITTER] Routed '${event}' strictly to receptionist alert channel [Prop: ${options.propertyId || 'ALL'}]`);
      return true;
    }

    if (options.propertyId) {
      ioInstance.to(`property_${options.propertyId}`).emit(event, enrichedPayload);
      ioInstance.to(`channel:prop:${options.propertyId}`).emit(event, enrichedPayload);
    }

    // Role-gated broadcasts
    if (options.roles) {
      const targetRoles = Array.isArray(options.roles) ? options.roles : [options.roles];
      targetRoles.forEach((role) => {
        ioInstance.to(`role:${role.toLowerCase()}`).emit(event, enrichedPayload);
      });
      return true;
    }

    // Staff operational feed
    ioInstance.to('channel:system:staff').emit(event, enrichedPayload);
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

