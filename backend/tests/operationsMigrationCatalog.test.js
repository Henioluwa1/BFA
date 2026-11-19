jest.mock('../src/db/pool', () => ({
  getEngine: jest.fn(() => 'postgres'),
  query: jest.fn(),
}));

const fs = require('fs');
const db = require('../src/db/pool');
const OperationsControlService = require('../src/modules/system/operationsControl.service');

describe('Operations Center migration catalog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns active-engine catalog data and never reports another engine history', async () => {
    const names = fs.readdirSync(require('path').join(__dirname, '..', 'src', 'db', 'pgMigrations')).filter((name) => name.endsWith('.sql')).sort();
    db.query.mockResolvedValue(names.slice(0, 1).map((migration_name) => ({ migration_name, executed_at: '2026-01-01T00:00:00Z' })));
    const catalog = await OperationsControlService.getMigrationCatalog({ role: 'SUPER_ADMIN' });

    expect(catalog.engine).toBe('PostgreSQL');
    expect(catalog.migrationSystem).toContain('PostgreSQL');
    expect(catalog.totalMigrations).toBe(names.length);
    expect(catalog.appliedMigrations).toBe(1);
    expect(catalog.pendingMigrations).toBe(names.length - 1);
    expect(catalog.migrations[0].status).toBe('APPLIED');
    expect(catalog.migrations[0].executedAt).toBe('2026-01-01T00:00:00Z');
    expect(db.query).toHaveBeenCalledWith('SELECT migration_name, executed_at FROM schema_migrations ORDER BY id ASC');
  });
});
