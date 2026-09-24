const fs = require('fs');
const path = require('path');
const HealthService = require('./health.service');
const ApiResponse = require('../../utils/apiResponse');
const pool = require('../../db/pool');
const logger = require('../../core/logging/logger');

// Global flag to track server shutdown state
let isShuttingDown = false;

function setShuttingDown(val) {
  isShuttingDown = val;
}

/**
 * Production Health & Observability Controller
 */
class HealthController {
  /**
   * General health status (legacy backward-compatible)
   */
  static async check(req, res, next) {
    try {
      const health = await HealthService.getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      return ApiResponse.success(res, {
        statusCode,
        message:
          health.status === 'healthy'
            ? 'System is operational and database connected'
            : 'System operational with degraded components',
        data: health,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Ping / heartbeat
   */
  static ping(req, res) {
    return ApiResponse.success(res, {
      message: 'pong',
      data: {
        alive: true,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Gate 7.1 — Liveness Probe
   * Indicates whether the Node.js process is alive and responsive.
   * Does NOT fail if external dependencies (database) are experiencing transient lag.
   */
  static live(req, res) {
    return res.status(200).json({
      status: 'live',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage().rss,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Gate 7.2 — Readiness Probe
   * Indicates whether the server is ready to accept user traffic.
   * Verifies:
   * 1. Database connectivity
   * 2. Filesystem write permissions for PDF document generation
   * 3. Server is not in graceful shutdown draining phase
   */
  static async ready(req, res) {
    if (isShuttingDown) {
      return res.status(503).json({
        status: 'not_ready',
        message: 'Server is undergoing graceful shutdown',
        checks: {
          server: 'draining',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const checks = {
      database: 'unknown',
      pdfStorage: 'unknown',
    };

    let isDbHealthy = false;
    let isStorageHealthy = false;

    // 1. Check Database connection
    try {
      const dbTest = await pool.testConnection();
      if (dbTest && dbTest.healthy) {
        checks.database = 'ok';
        isDbHealthy = true;
      } else {
        checks.database = 'unhealthy';
      }
    } catch (err) {
      logger.error('Readiness probe failed database check:', { error: err.message });
      checks.database = 'unreachable';
    }

    // 2. Check PDF Storage / Temporary Write Access
    try {
      const testDir = path.resolve(__dirname, '../../../scratch');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFilePath = path.join(testDir, `.health_write_test_${Date.now()}.tmp`);
      fs.writeFileSync(testFilePath, 'health_check');
      fs.unlinkSync(testFilePath);
      checks.pdfStorage = 'ok';
      isStorageHealthy = true;
    } catch (err) {
      logger.error('Readiness probe failed storage write check:', { error: err.message });
      checks.pdfStorage = 'write_failed';
    }

    const isReady = isDbHealthy && isStorageHealthy;
    const statusCode = isReady ? 200 : 503;

    return res.status(statusCode).json({
      status: isReady ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}

HealthController.setShuttingDown = setShuttingDown;

module.exports = HealthController;
