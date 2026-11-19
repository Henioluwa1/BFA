const os = require('os');
const pool = require('../../db/pool');
const { testPgConnection } = require('../../db/pgPool');
const config = require('../../config');

/**
 * Health Service to inspect database connectivity, migrations, memory, and uptime
 */
class HealthService {
  static async getHealthStatus(caller = null) {
    const includeMigrationDetails = (caller?.role || '').toUpperCase() === 'SUPER_ADMIN';
    let dbStatus = {
      status: 'disconnected',
      latencyMs: null,
      error: null,
    };

    let migrationsCount;

    try {
      if (pool.isPostgres()) {
        const pgTest = await testPgConnection();
        dbStatus = {
          status: pgTest.healthy ? 'connected' : 'degraded',
          provider: 'Aiven PostgreSQL',
          latencyMs: pgTest.latencyMs,
          database: pgTest.database,
          serverTime: pgTest.serverTime,
        };
      } else {
        const dbTest = await pool.testConnection();
        dbStatus = {
          status: dbTest.healthy ? 'connected' : 'degraded',
          provider: 'MySQL / TiDB',
          latencyMs: dbTest.latencyMs,
          database: dbTest.database,
          serverTime: dbTest.serverTime,
        };
      }

      if (includeMigrationDetails) {
        const migrationRows = await pool.query('SELECT COUNT(*) as count FROM schema_migrations;');
        migrationsCount = parseInt(migrationRows[0]?.count || 0, 10);
      }
    } catch (err) {
      dbStatus = {
        status: 'error',
        provider: pool.isPostgres() ? 'Aiven PostgreSQL' : 'MySQL / TiDB',
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
        ...(includeMigrationDetails ? { appliedMigrations: migrationsCount } : {}),
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
