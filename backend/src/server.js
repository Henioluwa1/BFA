const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const pool = require('./db/pool');
const { runMigrations } = require('./db/migrator');
const { validateEnvironment } = require('./config/envValidator');
const HealthController = require('./modules/health/health.controller');
const http = require('http');
const { Server } = require('socket.io');
const { initializeChatSocket } = require('./modules/chat/chat.socket');
const { setIO } = require('./core/socket/socketEmitter');

const PORT = config.app.port;

async function startServer() {
  try {
    logger.info(`Starting ${config.app.name}...`);

    // 1. Validate environment configuration
    const envCheck = validateEnvironment();
    if (!envCheck.valid) {
      process.exit(1);
    }

    // 2. Run pending database migrations
    logger.info('Running database migrations...');
    await runMigrations();

    // 3. Test database connection
    const dbTest = await pool.testConnection();
    logger.info(`MySQL database connected successfully. Database: ${dbTest.database} (Latency: ${dbTest.latencyMs}ms)`);

    // 4. Start HTTP & Socket.IO server
    const httpServer = http.createServer(app);
    const io = new Server(httpServer, {
      path: '/api/v1/socket.io',
      cors: {
        origin: config.cors.origin,
        credentials: true,
      },
      pingTimeout: 20000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6,
      transports: ['websocket', 'polling'],
    });

    setIO(io);
    initializeChatSocket(io);

    const server = httpServer.listen(PORT, () => {
      logger.info(`BFA Backend API server running on port ${PORT} [${config.app.env}]`);
      logger.info(`Liveness probe: http://localhost:${PORT}/api/v1/health/live`);
      logger.info(`Readiness probe: http://localhost:${PORT}/api/v1/health/ready`);
      logger.info(`Socket.IO real-time engine initialized on path: /api/v1/socket.io`);
    });

    // Track active connections for graceful draining
    let connections = new Set();
    server.on('connection', (conn) => {
      connections.add(conn);
      conn.on('close', () => connections.delete(conn));
    });

    // Graceful Shutdown Handler
    let isTerminating = false;
    const shutdown = async (signal) => {
      if (isTerminating) return;
      isTerminating = true;

      logger.info(`[${signal}] Initiating graceful shutdown...`);

      // Mark readiness probe as not ready so load balancers stop routing new traffic
      HealthController.setShuttingDown(true);

      // Close active Socket.IO connections
      try {
        io.close();
        logger.info('Socket.IO engine cleanly closed.');
      } catch (ioErr) {
        logger.error('Error closing Socket.IO engine:', { error: ioErr.message });
      }

      // Stop accepting new HTTP connections
      server.close(async (err) => {
        if (err) {
          logger.error('Error during HTTP server close:', { error: err.message });
        } else {
          logger.info('HTTP server closed. No new incoming connections.');
        }

        // Close connection pool
        try {
          await pool.closePool();
          logger.info('MySQL database connection pool cleanly closed.');
        } catch (poolErr) {
          logger.error('Error closing database pool:', { error: poolErr.message });
        }

        logger.info('Graceful shutdown process completed successfully.');
        process.exit(0);
      });

      // Allow 8 seconds for in-flight requests to complete before destroying idle connections
      setTimeout(() => {
        if (connections.size > 0) {
          logger.warn(`Destroying ${connections.size} remaining open connections...`);
          connections.forEach((conn) => conn.destroy());
        }
      }, 8000);

      // Hard timeout safety ceiling
      setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded (10s). Forcing termination.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (err) {
    logger.error('Fatal error during server startup:', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
