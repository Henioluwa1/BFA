const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const pool = require('./db/pool');
const { runMigrations } = require('./db/migrator');

const PORT = config.app.port;

async function startServer() {
  try {
    logger.info(`Starting ${config.app.name}...`);

    // 1. Run pending database migrations
    logger.info('Running database migrations...');
    await runMigrations();

    // 2. Test database connection
    const dbTest = await pool.testConnection();
    logger.info(`MySQL database connected successfully. Database: ${dbTest.database} (Latency: ${dbTest.latencyMs}ms)`);

    // 3. Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`BFA Backend API server running on port ${PORT} [${config.app.env}]`);
      logger.info(`Health check available at: http://localhost:${PORT}/api/v1/health`);
    });

    // Graceful Shutdown Handler
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        await pool.closePool();
        logger.info('Process termination complete.');
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout.');
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
