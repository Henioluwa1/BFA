jest.mock('../src/db/pool', () => ({
  getEngine: jest.fn(() => 'postgres'),
  isPostgres: jest.fn(() => true),
  testConnection: jest.fn(async () => ({ healthy: true, latencyMs: 12, database: 'bfa_test' })),
  query: jest.fn(),
}));

jest.mock('../src/modules/users/users.service', () => ({
  listUsers: jest.fn(async () => [{ id: 2, name: 'Test Admin', role: 'ADMIN', permissions: ['settings.read'] }]),
  getRoles: jest.fn(() => [{ role: 'ADMIN', name: 'Admin', capabilities: ['settings.read'] }]),
}));

const db = require('../src/db/pool');
const OperationsControlService = require('../src/modules/system/operationsControl.service');

describe('Operations overview restricted data projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM audit_logs')) return [];
      if (sql.includes('COUNT(id) as total_users')) return [{ total_users: 2, active_users: 2, inactive_users: 0 }];
      if (sql.includes('GROUP BY role')) return [{ role: 'ADMIN', total_count: 1 }, { role: 'OWNER', total_count: 1 }];
      throw new Error(`Unexpected query in read-only overview test: ${sql}`);
    });
  });

  it.each(['ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT'])('%s is rejected before any overview read', async (role) => {
    await expect(OperationsControlService.getOverview({ id: 8, role })).rejects.toThrow('restricted to Super Admin');
    expect(db.testConnection).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });
});
