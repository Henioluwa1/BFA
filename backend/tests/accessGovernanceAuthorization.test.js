const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const pool = require('../src/db/pool');
const AccessControlService = require('../src/core/access/accessControl.service');

describe('Access governance authorization used by Operations Center', () => {
  const token = (role) => jwt.sign({ id: 42, email: `${role.toLowerCase()}@test.invalid`, role }, config.security.jwtSecret, { expiresIn: '5m' });
  let spies;

  beforeEach(() => {
    spies = {
      capabilities: jest.spyOn(AccessControlService, 'listCapabilities').mockResolvedValue([]),
      approvals: jest.spyOn(AccessControlService, 'listApprovalRequests').mockResolvedValue([]),
      review: jest.spyOn(AccessControlService, 'reviewApprovalRequest').mockResolvedValue({ success: true }),
      update: jest.spyOn(AccessControlService, 'updateCapability').mockResolvedValue({ success: true }),
      check: jest.spyOn(AccessControlService, 'canAccess').mockResolvedValue({
        allowed: true,
        reason: 'Active override in place',
        capability: { id: 5, name: 'SENSITIVE_TEST', restriction_level: 'OWNER_RESTRICTED' },
        override: { id: 9, override_type: 'SUPER_ADMIN_FORCED' },
      }),
      query: jest.spyOn(pool, 'query').mockResolvedValue([]),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows ADMIN and SUPER_ADMIN to read capabilities and overrides, but denies OWNER', async () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN']) {
      const auth = `Bearer ${token(role)}`;
      expect((await request(app).get('/api/v1/access/capabilities').set('Authorization', auth)).status).toBe(200);
      expect((await request(app).get('/api/v1/access/overrides').set('Authorization', auth)).status).toBe(200);
    }

    const ownerAuth = `Bearer ${token('OWNER')}`;
    expect((await request(app).get('/api/v1/access/capabilities').set('Authorization', ownerAuth)).status).toBe(403);
    expect((await request(app).get('/api/v1/access/overrides').set('Authorization', ownerAuth)).status).toBe(403);
    expect(spies.capabilities).toHaveBeenCalledTimes(2);
    expect(spies.query).toHaveBeenCalledTimes(2);
  });

  it('restricts approval requests and reviews to SUPER_ADMIN', async () => {
    const superAuth = `Bearer ${token('SUPER_ADMIN')}`;
    expect((await request(app).get('/api/v1/access/approvals?status=PENDING').set('Authorization', superAuth)).status).toBe(200);
    expect((await request(app).post('/api/v1/access/approvals/123/review').set('Authorization', superAuth).send({ approved: false })).status).toBe(200);

    for (const role of ['ADMIN', 'OWNER']) {
      const auth = `Bearer ${token(role)}`;
      expect((await request(app).get('/api/v1/access/approvals?status=ALL').set('Authorization', auth)).status).toBe(403);
      expect((await request(app).post('/api/v1/access/approvals/123/review').set('Authorization', auth).send({ approved: true })).status).toBe(403);
    }
    expect(spies.approvals).toHaveBeenCalledTimes(1);
    expect(spies.review).toHaveBeenCalledTimes(1);
  });

  it('only includes pending approval details in the SUPER_ADMIN capability response', async () => {
    spies.capabilities.mockImplementation(async ({ includePendingApprovalDetails }) => includePendingApprovalDetails
      ? [{ name: 'SENSITIVE_TEST', pending_requests_count: 1, latest_pending_reason: 'Restricted reason' }]
      : [{ name: 'SENSITIVE_TEST' }]);

    const adminResponse = await request(app).get('/api/v1/access/capabilities').set('Authorization', `Bearer ${token('ADMIN')}`);
    const superAdminResponse = await request(app).get('/api/v1/access/capabilities').set('Authorization', `Bearer ${token('SUPER_ADMIN')}`);

    expect(adminResponse.body.data[0]).not.toHaveProperty('pending_requests_count');
    expect(adminResponse.body.data[0]).not.toHaveProperty('latest_pending_reason');
    expect(superAdminResponse.body.data[0].pending_requests_count).toBe(1);
    expect(spies.capabilities).toHaveBeenNthCalledWith(1, { includePendingApprovalDetails: false });
    expect(spies.capabilities).toHaveBeenNthCalledWith(2, { includePendingApprovalDetails: true });
  });

  it('denies OWNER capability changes and requires authentication on governance endpoints', async () => {
    const ownerAuth = `Bearer ${token('OWNER')}`;
    expect((await request(app).post('/api/v1/access/capabilities/update').set('Authorization', ownerAuth).send({ capabilityName: 'TEST', isEnabled: false })).status).toBe(403);

    for (const path of ['/api/v1/access/capabilities', '/api/v1/access/overrides', '/api/v1/access/approvals']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect((await request(app).post('/api/v1/access/approvals/123/review').send({ approved: true })).status).toBe(401);
    expect(spies.update).not.toHaveBeenCalled();
  });

  it('does not expose capability or override records through the operational check endpoint', async () => {
    const response = await request(app)
      .get('/api/v1/access/check/SENSITIVE_TEST')
      .set('Authorization', `Bearer ${token('OWNER')}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ allowed: true });
    expect(response.body.data).not.toHaveProperty('capability');
    expect(response.body.data).not.toHaveProperty('override');
  });
});
