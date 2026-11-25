/**
 * Secure Runtime Password Rotation Utility
 * Rotates credentials for BFA user accounts from process environment variables only.
 * Never store plaintext passwords in source code, git history, or reports.
 *
 * Usage:
 *   BFA_ROTATE_SUPERADMIN_PW=... BFA_ROTATE_ADMIN_PW=... node src/scripts/rotateUserPasswords.js --execute
 *   Or supply BFA_ROTATE_MAP_JSON='{"superadmin@bfa.com":"..."}' node src/scripts/rotateUserPasswords.js --execute
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { verifyDatabaseSafety } = require('../utils/databaseGuard');

const ROLE_ENV_MAP = {
  'superadmin@bfa.com': 'BFA_ROTATE_SUPERADMIN_PW',
  'admin@bfa.com': 'BFA_ROTATE_ADMIN_PW',
  'owner@bfa.com': 'BFA_ROTATE_OWNER_PW',
  'manager@bfa.com': 'BFA_ROTATE_MANAGER_PW',
  'receptionist@bfa.com': 'BFA_ROTATE_RECEPTIONIST_PW',
  'staff@bfa.com': 'BFA_ROTATE_STAFF_PW',
  'agent@bfa.com': 'BFA_ROTATE_AGENT_PW',
};

async function main() {
  verifyDatabaseSafety();
  const isExecute = process.argv.includes('--execute');

  let updates = {};
  if (process.env.BFA_ROTATE_MAP_JSON) {
    updates = JSON.parse(process.env.BFA_ROTATE_MAP_JSON);
  } else {
    for (const [email, envKey] of Object.entries(ROLE_ENV_MAP)) {
      if (process.env[envKey]) {
        updates[email] = process.env[envKey];
      }
    }
  }

  const emails = Object.keys(updates);
  if (emails.length === 0) {
    console.log('No runtime password env vars supplied (set BFA_ROTATE_MAP_JSON or BFA_ROTATE_*_PW). Exiting cleanly.');
    process.exit(0);
  }

  for (const email of emails) {
    const pw = String(updates[email] || '');
    if (pw.length < 12) {
      throw new Error(`Password supplied for ${email} must be at least 12 characters.`);
    }
  }

  console.log(`Target accounts: ${emails.length} | Mode: ${isExecute ? 'EXECUTE' : 'DRY-RUN'}`);
  if (!isExecute) {
    console.log('Dry run complete. Pass --execute to persist bcrypt password hashes.');
    process.exit(0);
  }

  for (const [email, pw] of Object.entries(updates)) {
    const hash = await bcrypt.hash(pw, 12);
    const res = await pool.query(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER(?)',
      [hash, email]
    );
    const affected = res.rowCount ?? res.affectedRows ?? (Array.isArray(res.rows) ? res.rows.length : 0);
    console.log(`Rotated ${email}: ${affected} row(s) updated`);
  }

  console.log('Credential rotation complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Rotation failed:', err.message);
  process.exit(1);
});
