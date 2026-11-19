/**
 * Aiven PostgreSQL Target Database Safety Check
 * Inspects existing schemas, tables, extensions, and migration state.
 */

require('dotenv').config();
const { getPgPool, closePgPool } = require('../db/pgPool');

async function safetyCheck() {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    console.log('=== DATABASE SAFETY CHECK ===');

    // 1. Schemas
    const schemas = await client.query('SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;');
    console.log('Schemas:', schemas.rows.map(r => r.schema_name));

    // 2. Tables
    const tables = await client.query(`
      SELECT table_schema, table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_schema, table_name;
    `);
    console.log('Application / User Tables Count:', tables.rows.length);
    if (tables.rows.length > 0) {
      console.log('Existing tables:', tables.rows);
    }

    // 3. Extensions
    const ext = await client.query('SELECT extname, extversion FROM pg_extension ORDER BY extname;');
    console.log('Installed Extensions:', ext.rows);

    // 4. Custom Types
    const types = await client.query(`
      SELECT typname FROM pg_type t 
      JOIN pg_namespace n ON n.oid = t.typnamespace 
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog');
    `);
    console.log('User Types Count:', types.rows.length);

    // 5. Existing Migration History
    const hasMigrations = tables.rows.some(r => r.table_name === 'schema_migrations');
    console.log('Has schema_migrations table:', hasMigrations);

    console.log('=== SAFETY CHECK SUMMARY ===');
    if (tables.rows.length === 0) {
      console.log('Target database is pristine and empty (0 tables). SAFE TO PROCEED.');
    } else {
      console.log('Tables already present:', tables.rows.map(r => r.table_name));
    }
  } finally {
    client.release();
    await closePgPool();
  }
}

safetyCheck().catch(e => {
  console.error('Safety check error:', e.message);
  process.exit(1);
});
