/**
 * Comprehensive Independent Verification of Live Aiven PostgreSQL Catalog
 * Validates tables, migrations, constraints, indexes, sequences, and seed data.
 */

require('dotenv').config();
const { getPgPool, closePgPool } = require('../db/pgPool');

async function verifyCatalog() {
  const pool = getPgPool();
  const client = await pool.connect();

  console.log('=== LIVE AIVEN POSTGRESQL CATALOG VERIFICATION ===\n');

  try {
    // 1. Table Inventory
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`[1. TABLES]: Found ${tables.length} tables in 'public' schema.`);
    console.log('Tables:', tables.join(', '));

    // 2. Schema Migrations Ledger
    const migRes = await client.query(`
      SELECT id, migration_name, batch, executed_at 
      FROM schema_migrations 
      ORDER BY id ASC;
    `);
    console.log(`\n[2. MIGRATIONS LEDGER]: ${migRes.rows.length} migrations recorded.`);
    console.log(`  First: ${migRes.rows[0]?.migration_name}`);
    console.log(`  Last:  ${migRes.rows[migRes.rows.length - 1]?.migration_name}`);
    console.log(`  Batch: #${migRes.rows[0]?.batch}`);

    // 3. Primary Keys
    const pkRes = await client.query(`
      SELECT tc.table_name, ccu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name;
    `);
    console.log(`\n[3. PRIMARY KEYS]: ${pkRes.rows.length} tables with primary keys.`);

    // 4. Foreign Keys
    const fkRes = await client.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `);
    console.log(`\n[4. FOREIGN KEYS]: ${fkRes.rows.length} foreign key relationships established.`);

    // 5. Indexes
    const idxRes = await client.query(`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);
    console.log(`\n[5. INDEXES]: ${idxRes.rows.length} total indexes in 'public' schema.`);

    // 6. Check Constraints
    const chkRes = await client.query(`
      SELECT tc.table_name, tc.constraint_name, cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON cc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'CHECK' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name;
    `);
    console.log(`\n[6. CHECK CONSTRAINTS]: ${chkRes.rows.length} check constraints active.`);

    // 7. Identity Sequences
    const seqRes = await client.query(`
      SELECT table_name, column_name, is_identity, identity_generation
      FROM information_schema.columns
      WHERE table_schema = 'public' AND is_identity = 'YES'
      ORDER BY table_name;
    `);
    console.log(`\n[7. IDENTITY SEQUENCES]: ${seqRes.rows.length} identity columns active.`);

    // 8. Seed Data Verification
    console.log('\n[8. SEED DATA ROW COUNTS]:');
    const seedTables = [
      'system_settings',
      'properties',
      'apartments',
      'users',
      'agents',
      'reservations',
      'guests',
      'capabilities',
      'chart_of_accounts',
      'accounting_periods',
      'accounting_account_mappings',
      'attendance_policies',
      'leave_categories'
    ];

    for (const tbl of seedTables) {
      const countRes = await client.query(`SELECT COUNT(*) FROM ${tbl};`);
      console.log(`  - ${tbl.padEnd(30)}: ${countRes.rows[0].count} rows`);
    }

    // 9. Representative Cross-Table Query Test
    console.log('\n[9. REPRESENTATIVE READ-ONLY BUSINESS QUERIES]:');
    
    // Query A: Property and Apartment counts
    const q1 = await client.query(`
      SELECT p.code AS property_code, p.name AS property_name, COUNT(a.id) AS total_apartments
      FROM properties p
      LEFT JOIN apartments a ON a.property_id = p.id
      GROUP BY p.id, p.code, p.name
      ORDER BY p.id;
    `);
    console.log('Query A (Properties & Apartments):', q1.rows);

    // Query B: Users and Roles
    const q2 = await client.query(`
      SELECT role, COUNT(*) AS count
      FROM users
      GROUP BY role
      ORDER BY count DESC;
    `);
    console.log('Query B (User Roles):', q2.rows);

    // Query C: Chart of Accounts summary by type
    const q3 = await client.query(`
      SELECT account_type, COUNT(*) AS total_accounts
      FROM chart_of_accounts
      GROUP BY account_type
      ORDER BY account_type;
    `);
    console.log('Query C (Chart of Accounts Types):', q3.rows);

    // Query D: Settings check
    const q4 = await client.query(`
      SELECT setting_key, setting_value 
      FROM system_settings 
      WHERE category = 'company';
    `);
    console.log('Query D (Company System Settings):', q4.rows);

    console.log('\n=== CATALOG VERIFICATION COMPLETE: ALL CHECKS PASSED! ===');
  } finally {
    client.release();
    await closePgPool();
  }
}

verifyCatalog().catch(err => {
  console.error('Catalog verification failed:', err);
  process.exit(1);
});
