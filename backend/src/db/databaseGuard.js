/**
 * Fail-Closed Database Safety Guard
 *
 * Enforces that destructive test setup, migrations, teardowns, truncations, or test fixtures
 * NEVER execute against the primary development/production database (`bfa_apartments_db`).
 */

const BLOCKED_SHARED_DATABASES = Object.freeze([
  'bfa_apartments_db',
  'bfa_production',
  'bfa_apartments_prod',
  'production',
  'staging',
]);

/**
 * Checks whether a database name qualifies as a safe isolated test database.
 * @param {string} dbName
 * @returns {boolean}
 */
function isTestDatabase(dbName) {
  if (!dbName || typeof dbName !== 'string') return false;
  const normalized = dbName.trim().toLowerCase();
  if (BLOCKED_SHARED_DATABASES.includes(normalized)) return false;
  return normalized.endsWith('_test_db') || normalized.includes('test');
}

/**
 * Asserts that the target database is an isolated test database.
 * Throws a fatal Error if the target is a shared, production, or non-test database.
 * @param {string} dbName
 * @param {string} operation
 * @throws {Error}
 */
function assertTestDatabase(dbName, operation = 'Destructive Test Operation') {
  if (!dbName || typeof dbName !== 'string') {
    throw new Error(
      `[FAIL-CLOSED DB GUARD]: ${operation} BLOCKED! Target database name is undefined or empty.`
    );
  }
  const normalized = dbName.trim().toLowerCase();
  if (BLOCKED_SHARED_DATABASES.includes(normalized)) {
    throw new Error(
      `[FAIL-CLOSED DB GUARD]: ${operation} FATALLY REJECTED! Target database '${dbName}' is a protected shared/production database.`
    );
  }
  if (!isTestDatabase(normalized)) {
    throw new Error(
      `[FAIL-CLOSED DB GUARD]: ${operation} REJECTED! Target database '${dbName}' does not follow the safe test database naming convention (*_test_db or *test*).`
    );
  }
  return true;
}

/**
 * Asserts that executing migrations on a production/shared database is explicitly authorized.
 * Throws a fatal Error if target database is a production/shared database and confirmation was not provided.
 * @param {string} dbName
 * @param {object} options
 * @throws {Error}
 */
function assertProductionMigrationAuthorized(dbName, options = {}) {
  if (!dbName || typeof dbName !== 'string') return true;
  const normalized = dbName.trim().toLowerCase();
  const isProductionTarget = BLOCKED_SHARED_DATABASES.includes(normalized) || process.env.NODE_ENV === 'production';

  if (isProductionTarget) {
    const isExplicitlyConfirmed =
      options.confirmProduction === true ||
      process.env.CONFIRM_PRODUCTION_MIGRATION === 'true' ||
      process.env.CONFIRM_PRODUCTION_MIGRATION === '1';

    if (!isExplicitlyConfirmed) {
      throw new Error(
        `[FAIL-CLOSED DB GUARD]: Execution on production database '${dbName}' BLOCKED! ` +
        `Deliberate production migration confirmation required. Pass options.confirmProduction=true, ` +
        `CLI flag --confirm-prod, or set environment variable CONFIRM_PRODUCTION_MIGRATION=true.`
      );
    }
  }
  return true;
}

module.exports = {
  isTestDatabase,
  assertTestDatabase,
  assertProductionMigrationAuthorized,
  BLOCKED_SHARED_DATABASES,
};
