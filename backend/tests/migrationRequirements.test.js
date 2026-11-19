const { assertTiDbMigrationRequirements } = require('../src/db/migrationRequirements');

function connectionFor(version, settings) {
  return {
    query: jest.fn()
      .mockResolvedValueOnce([[{ version }]])
      .mockResolvedValueOnce([[settings]]),
  };
}

describe('TiDB migration prerequisites', () => {
  test('does not query TiDB-only settings for MySQL-compatible servers', async () => {
    const connection = { query: jest.fn().mockResolvedValue([[{ version: '8.0.36 MySQL' }]]) };
    await expect(assertTiDbMigrationRequirements(connection)).resolves.toBeUndefined();
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  test('requires CHECK and both foreign-key switches to be enabled on TiDB', async () => {
    const connection = connectionFor('8.5.3-TiDB', {
      checkConstraints: 'ON',
      foreignKeyFeature: 'OFF',
      foreignKeyChecks: 1,
    });
    await expect(assertTiDbMigrationRequirements(connection)).rejects.toThrow('tidb_enable_foreign_key=ON');
  });

  test('accepts an enforced TiDB constraint configuration', async () => {
    const connection = connectionFor('8.5.3-TiDB', {
      checkConstraints: 1,
      foreignKeyFeature: 'ON',
      foreignKeyChecks: true,
    });
    await expect(assertTiDbMigrationRequirements(connection)).resolves.toBeUndefined();
  });
});
