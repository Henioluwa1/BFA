function isEnabled(value) {
  return value === true || value === 1 || ['1', 'ON', 'TRUE'].includes(String(value).trim().toUpperCase());
}

/**
 * TiDB silently ignores CHECK constraints when the cluster feature is disabled.
 * Check enforcement settings before the first migration can alter the schema.
 * Non-TiDB MySQL/MariaDB deployments retain their existing behavior.
 * @param {{ query: Function }} connection
 */
async function assertTiDbMigrationRequirements(connection) {
  const [versionRows] = await connection.query('SELECT VERSION() AS version');
  const version = versionRows[0]?.version || '';
  if (!/tidb/i.test(version)) return;

  const [settingsRows] = await connection.query(
    'SELECT @@GLOBAL.tidb_enable_check_constraint AS checkConstraints, @@GLOBAL.tidb_enable_foreign_key AS foreignKeyFeature, @@GLOBAL.foreign_key_checks AS foreignKeyChecks'
  );
  const settings = settingsRows[0] || {};
  const missing = [];

  if (!isEnabled(settings.checkConstraints)) missing.push('tidb_enable_check_constraint=ON');
  if (!isEnabled(settings.foreignKeyFeature)) missing.push('tidb_enable_foreign_key=ON');
  if (!isEnabled(settings.foreignKeyChecks)) missing.push('foreign_key_checks=ON');

  if (missing.length) {
    throw new Error(
      `TiDB migration prerequisites are not met: ${missing.join(', ')}. ` +
      'Enable and verify these cluster settings before applying migrations; no migration SQL was executed.'
    );
  }
}

module.exports = { assertTiDbMigrationRequirements };
