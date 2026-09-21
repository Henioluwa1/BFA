const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Migration Engine for BFA Apartments Management System
 */
async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  logger.info(`Checking database migrations in: ${migrationsDir}`);

  // Create direct connection to run DDL statements
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
  });

  try {
    // 1. Ensure schema_migrations table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        batch INT NOT NULL DEFAULT 1,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_migration_name (migration_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Fetch applied migrations
    const [appliedRows] = await connection.query('SELECT migration_name FROM schema_migrations ORDER BY id ASC;');
    const appliedSet = new Set(appliedRows.map((r) => r.migration_name));

    // 3. Read migration files
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const pending = files.filter((file) => !appliedSet.has(file));

    if (pending.length === 0) {
      logger.info('Database is up to date. No pending migrations.');
      return { appliedCount: 0, totalMigrations: files.length };
    }

    logger.info(`Found ${pending.length} pending migration(s) to execute.`);

    // Determine current batch number
    const [batchRows] = await connection.query('SELECT COALESCE(MAX(batch), 0) + 1 AS nextBatch FROM schema_migrations;');
    const nextBatch = batchRows[0]?.nextBatch || 1;

    let appliedCount = 0;
    for (const file of pending) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      logger.info(`Applying migration: ${file}...`);
      await connection.beginTransaction();

      try {
        await connection.query(sql);
        await connection.query('INSERT INTO schema_migrations (migration_name, batch) VALUES (?, ?);', [file, nextBatch]);
        await connection.commit();
        logger.info(`Successfully applied: ${file}`);
        appliedCount++;
      } catch (err) {
        await connection.rollback();
        logger.error(`Migration failed at ${file}: ${err.message}`);
        throw err;
      }
    }

    logger.info(`Successfully executed ${appliedCount} migration(s). Batch #${nextBatch}`);
    return { appliedCount, totalMigrations: files.length };
  } finally {
    await connection.end();
  }
}

// Allow direct execution via CLI
if (require.main === module) {
  runMigrations()
    .then((result) => {
      console.log('Migrations completed successfully:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
