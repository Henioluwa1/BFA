const { runMigrations } = require('../db/migrator');

(async () => {
  try {
    process.env.NODE_ENV = 'test';
    await runMigrations('bfa_apartments_test_db');
    console.log('Test DB migrated successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Test DB migration failed:', err);
    process.exit(1);
  }
})();

