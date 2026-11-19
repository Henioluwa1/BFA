jest.mock('../src/db/pool', () => ({ query: jest.fn(async () => []) }));

const pool = require('../src/db/pool');
const MaintenanceRepository = require('../src/modules/maintenance/maintenance.repository');

describe('Maintenance repository PostgreSQL list compatibility', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses portable CASE expressions instead of MySQL FIELD for priority ordering', async () => {
    await MaintenanceRepository.findAll({ status: 'OPEN' });

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("CASE m.priority");
    expect(sql).toContain("WHEN 'CRITICAL' THEN 1");
    expect(sql).not.toMatch(/\bFIELD\s*\(/i);
  });

  it('adds property filters to the work-order and stats queries', async () => {
    await MaintenanceRepository.findAll({ propertyId: 3 });
    expect(pool.query.mock.calls[0][0]).toContain('m.property_id = ?');
    expect(pool.query.mock.calls[0][1]).toContain(3);

    jest.clearAllMocks();
    await MaintenanceRepository.getStats({ propertyId: 3 });
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls.every(([sql, params]) => sql.includes('property_id = ?') && params.includes(3))).toBe(true);
  });

  it('searches technician names and keeps parameterized search terms', async () => {
    await MaintenanceRepository.findAll({ search: 'Daniel' });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('asg.name LIKE ?');
    expect(params.filter((value) => value === '%Daniel%')).toHaveLength(6);
  });
});
