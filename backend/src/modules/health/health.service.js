const os = require('os');
const pool = require('../../db/pool');
const config = require('../../config');

/**
 * Health Service to inspect database connectivity, migrations, memory, and uptime
 */
class HealthService {
  static async getHealthStatus() {
    let dbStatus = {
      status: 'disconnected',
      latencyMs: null,
      error: null,
    };

    let migrationsCount = 0;

    try {
      const dbTest = await pool.testConnection();
      dbStatus = {
        status: dbTest.healthy ? 'connected' : 'degraded',
        latencyMs: dbTest.latencyMs,
        database: dbTest.database,
        serverTime: dbTest.serverTime,
      };

      // Check migration count
      const migrationRows = await pool.query('SELECT COUNT(*) as count FROM schema_migrations;');
      migrationsCount = migrationRows[0]?.count || 0;
    } catch (err) {
      dbStatus = {
        status: 'error',
        latencyMs: null,
        error: err.message,
      };
    }

    const memoryUsage = process.memoryUsage();
    const systemUptimeSeconds = Math.floor(process.uptime());

    return {
      status: dbStatus.status === 'connected' ? 'healthy' : 'degraded',
      service: config.app.name,
      environment: config.app.env,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: systemUptimeSeconds,
      database: {
        ...dbStatus,
        appliedMigrations: migrationsCount,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cpus: os.cpus().length,
        memoryUsageMb: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        },
      },
    };
  }
}

module.exports = HealthService;
