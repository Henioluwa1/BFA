/**
 * Production Admin Bootstrap Script
 * Creates ONLY the initial Super Admin account if not already present.
 * Does NOT populate demo properties, apartments, reservations, or demo entities.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const logger = require('../core/logging/logger');

async function seedAdmin() {
  try {
    logger.info('Running production admin bootstrap...');

    const isProd = process.env.NODE_ENV === 'production';
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || (isProd ? null : 'admin@bfagroup.com');
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD || (isProd ? null : 'Admin@123456');
    const adminName = process.env.SUPER_ADMIN_NAME || 'BFA Super Admin';

    if (isProd && (!adminEmail || !adminPassword || adminPassword === 'Admin@123456' || adminPassword.length < 12)) {
      throw new Error(
        'In production, SUPER_ADMIN_EMAIL and a secure SUPER_ADMIN_PASSWORD (min 12 chars) must be explicitly configured.'
      );
    }

    // 1. Check if super admin already exists
    const existing = await pool.query('SELECT id, email, role, status FROM users WHERE role = ? LIMIT 1', [
      'SUPER_ADMIN',
    ]);

    if (existing && existing.length > 0) {
      logger.info(`Super Admin account already exists (ID: ${existing[0].id}, Email: ${existing[0].email}). No action needed.`);
      return { created: false, user: existing[0] };
    }

    // 2. Hash password securely
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    // 3. Insert initial Super Admin record
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [adminName, adminEmail, passwordHash]
    );

    logger.info(`Super Admin account successfully bootstrapped! (ID: ${result.insertId}, Email: ${adminEmail})`);
    return { created: true, id: result.insertId, email: adminEmail };
  } catch (error) {
    logger.error('Failed to bootstrap Super Admin account:', { error: error.message });
    throw error;
  } finally {
    await pool.closePool();
  }
}

if (require.main === module) {
  seedAdmin()
    .then(() => {
      logger.info('Production admin bootstrap completed.');
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = { seedAdmin };
