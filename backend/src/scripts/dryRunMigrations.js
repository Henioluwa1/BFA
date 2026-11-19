/**
 * Dry-Run Verification of all 31 PostgreSQL Migrations on Live Aiven Cluster
 * Executes all 31 migrations inside a single isolated transaction and then rolls back.
 * Guarantees zero schema changes while testing actual PostgreSQL engine execution.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPgPool, closePgPool } = require('../db/pgPool');

async function dryRun() {
  const migrationsDir = path.resolve(__dirname, '../db/pgMigrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`=== DRY-RUN VERIFICATION: ${files.length} MIGRATIONS ON LIVE POSTGRESQL ===`);

  const pool = getPgPool();
  const client = await pool.connect();

  try {
    console.log('Starting transaction (BEGIN)...');
    await client.query('BEGIN;');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const start = Date.now();
      try {
        await client.query(sql);
        console.log(`  ✓ [${i+1}/${files.length}] ${file} (${Date.now() - start}ms)`);
      } catch (err) {
        console.error(`\n❌ ERROR in ${file}: ${err.message}`);
        console.error(`Position/Line: ${err.position || 'N/A'}`);
        await client.query('ROLLBACK;');
        throw err;
      }
    }

    // Inspect tables created inside transaction
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log(`\nAll 31 migrations succeeded in dry-run! Total tables in public schema: ${tables.rows.length}`);

    console.log('\nRolling back dry-run transaction (ROLLBACK)...');
    await client.query('ROLLBACK;');
    console.log('✓ Dry-run transaction rolled back. Database remains pristine.');
  } finally {
    client.release();
    await closePgPool();
  }
}

dryRun().catch(e => {
  console.error('\nDry run failed:', e.message);
  process.exit(1);
});
