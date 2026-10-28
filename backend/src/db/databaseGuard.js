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

module.exports = {
  isTestDatabase,
  assertTestDatabase,
  BLOCKED_SHARED_DATABASES,
};

