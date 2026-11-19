jest.mock('../src/db/pool', () => ({ query: jest.fn(async () => []) }));

const pool = require('../src/db/pool');
const AccessControlService = require('../src/core/access/accessControl.service');

describe('Capability data projection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not query pending access-request details for non-SUPER_ADMIN projection', async () => {
    await AccessControlService.listCapabilities();

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).not.toContain('access_approval_requests');
    expect(pool.query.mock.calls[0][0]).not.toContain('latest_pending_reason');
  });

  it('includes pending access-request details only when explicitly authorized', async () => {
    await AccessControlService.listCapabilities({ includePendingApprovalDetails: true });

    expect(pool.query.mock.calls[0][0]).toContain('access_approval_requests');
    expect(pool.query.mock.calls[0][0]).toContain('latest_pending_reason');
  });
});
