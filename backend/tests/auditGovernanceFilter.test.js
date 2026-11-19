jest.mock('../src/db/pool', () => ({ query: jest.fn(async () => []) }));

const pool = require('../src/db/pool');
const AuditService = require('../src/core/audit/audit.service');

describe('Governance history audit filter', () => {
  beforeEach(() => pool.query.mockClear());

  it('filters governance actions without treating ordinary logins as governance changes', async () => {
    await AuditService.queryLogs({ action: 'GOVERNANCE_ACTIONS', limit: 20 });

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toContain("action NOT LIKE '%LOGIN%'");
    expect(pool.query.mock.calls[0][0]).toContain("action LIKE '%CAPABILITY%'");
    expect(pool.query.mock.calls[1][0]).toContain("action NOT LIKE '%LOGIN%'");
  });
});
