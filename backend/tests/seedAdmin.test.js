jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
  closePool: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/core/logging/logger', () => ({ info: jest.fn(), error: jest.fn() }));

const pool = require('../src/db/pool');
const { seedAdmin } = require('../src/scripts/seedAdmin');

const productionEnv = {
  NODE_ENV: 'production',
  SUPER_ADMIN_EMAIL: 'configured@example.test',
  SUPER_ADMIN_PASSWORD: 'long-random-test-password',
  SUPER_ADMIN_NAME: 'Configured Admin',
};

describe('configured administrator bootstrap', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ...productionEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('creates the configured identity without querying for an arbitrary Super Admin', async () => {
    pool.query.mockResolvedValueOnce([]).mockResolvedValueOnce({ insertId: 41 });

    const result = await seedAdmin();

    expect(result).toEqual({ created: true, id: 41, email: productionEnv.SUPER_ADMIN_EMAIL });
    expect(pool.query.mock.calls[0]).toEqual([
      'SELECT id, email, role, status FROM users WHERE email = ? LIMIT 1',
      [productionEnv.SUPER_ADMIN_EMAIL],
    ]);
    expect(pool.query.mock.calls[1][0]).toContain("VALUES (?, ?, ?, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())");
    expect(pool.query.mock.calls[1][1].slice(0, 2)).toEqual([
      productionEnv.SUPER_ADMIN_NAME,
      productionEnv.SUPER_ADMIN_EMAIL,
    ]);
  });

  test('does not duplicate the configured Super Admin on rerun', async () => {
    pool.query.mockResolvedValueOnce([{ id: 9, email: productionEnv.SUPER_ADMIN_EMAIL, role: 'SUPER_ADMIN', status: 'ACTIVE' }]);

    await expect(seedAdmin()).resolves.toMatchObject({ created: false, user: { id: 9 } });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('rejects sample credentials when production configuration is absent', async () => {
    delete process.env.SUPER_ADMIN_EMAIL;
    delete process.env.SUPER_ADMIN_PASSWORD;

    await expect(seedAdmin()).rejects.toThrow('must be explicitly configured');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects the documented production password placeholder', async () => {
    process.env.SUPER_ADMIN_PASSWORD = 'REPLACE_WITH_STRONG_INITIAL_SUPERADMIN_PASSWORD';

    await expect(seedAdmin()).rejects.toThrow('must be explicitly configured');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('treats Render as production even when NODE_ENV is not production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.RENDER = 'true';
    delete process.env.SUPER_ADMIN_EMAIL;
    delete process.env.SUPER_ADMIN_PASSWORD;

    await expect(seedAdmin()).rejects.toThrow('must be explicitly configured');
    expect(pool.query).not.toHaveBeenCalled();
  });
});
