const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const auditService = require('../src/core/audit/audit.service');

describe('Operations Center API role boundary', () => {
  const token = (id, role) => jwt.sign({ id, email: `${role.toLowerCase()}@test.invalid`, role, propertyId: null }, config.security.jwtSecret, { expiresIn: '5m' });
  let auditRecord;

  beforeAll(() => { auditRecord = jest.spyOn(auditService, 'record').mockResolvedValue(undefined); });
  afterAll(() => auditRecord.mockRestore());

  it.each(['ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT'])('%s cannot read OCC migration catalog', async (role) => {
    const response = await request(app).get('/api/v1/system/operations/migrations').set('Authorization', `Bearer ${token(99, role)}`);
    expect(response.status).toBe(403);
  });

  it.each(['ADMIN', 'OWNER'])('%s health response does not expose applied migration counts', async (role) => {
    const response = await request(app).get('/api/v1/health').set('Authorization', `Bearer ${token(80, role)}`);
    expect(response.status).toBe(200);
    expect(response.body.data.database).not.toHaveProperty('appliedMigrations');
  });

  it.each(['ADMIN', 'OWNER'])('%s cannot read the Operations overview', async (role) => {
    const response = await request(app).get('/api/v1/system/operations/overview').set('Authorization', `Bearer ${token(80, role)}`);
    expect(response.status).toBe(403);
  });

  it('requires authentication for direct access to restricted Operations endpoints', async () => {
    const migrationCatalog = await request(app).get('/api/v1/system/operations/migrations');
    const moduleToggle = await request(app).put('/api/v1/system/operations/modules/maintenance/toggle').send({ isEnabled: false, reason: 'Unauthenticated test' });
    const backup = await request(app).post('/api/v1/system/operations/backup');
    const systemStatus = await request(app).post('/api/v1/automation/execute').send({ actionId: 'dev.get_system_status', parameters: {} });
    expect(migrationCatalog.status).toBe(401);
    expect(moduleToggle.status).toBe(401);
    expect(backup.status).toBe(401);
    expect(systemStatus.status).toBe(401);
  });

  it('SUPER_ADMIN retains migration count in the health response', async () => {
    const response = await request(app).get('/api/v1/health').set('Authorization', `Bearer ${token(1, 'SUPER_ADMIN')}`);
    expect(response.status).toBe(200);
    expect(response.body.data.database.appliedMigrations).toBeGreaterThan(0);
  });

  it.each(['ADMIN', 'OWNER'])('%s cannot retrieve the system module list from the general info endpoint', async (role) => {
    const response = await request(app).get('/api/v1/system/info').set('Authorization', `Bearer ${token(81, role)}`);
    expect(response.status).toBe(200);
    expect(response.body.data).not.toHaveProperty('modules');
  });

  it('SUPER_ADMIN retains system info module listing', async () => {
    const response = await request(app).get('/api/v1/system/info').set('Authorization', `Bearer ${token(1, 'SUPER_ADMIN')}`);
    expect(response.status).toBe(200);
    expect(response.body.data.modules.length).toBe(12);
  });

  it.each(['ADMIN', 'OWNER'])('%s cannot use module or backup endpoints', async (role) => {
    const auth = `Bearer ${token(7, role)}`;
    const moduleToggle = await request(app).put('/api/v1/system/operations/modules/maintenance/toggle').set('Authorization', auth).send({ isEnabled: false, reason: 'test' });
    const backup = await request(app).post('/api/v1/system/operations/backup').set('Authorization', auth);
    expect(moduleToggle.status).toBe(403);
    expect(backup.status).toBe(403);
  });

  it('OWNER cannot update system settings or execute development actions', async () => {
    const auth = `Bearer ${token(7, 'OWNER')}`;
    const settings = await request(app).put('/api/v1/system/settings').set('Authorization', auth).send({ checkin_time: '15:00' });
    const status = await request(app).post('/api/v1/automation/execute').set('Authorization', auth).send({ actionId: 'dev.get_system_status', parameters: {} });
    const plan = await request(app).post('/api/v1/automation/execute').set('Authorization', auth).send({ actionId: 'dev.plan_task', parameters: { taskTitle: 'Restricted plan' } });
    expect(settings.status).toBe(403);
    expect(status.status).toBe(403);
    expect(plan.status).toBe(403);
  });

  it('ADMIN cannot execute system development status but can use existing task planning', async () => {
    const auth = `Bearer ${token(8, 'ADMIN')}`;
    const status = await request(app).post('/api/v1/automation/execute').set('Authorization', auth).send({ actionId: 'dev.get_system_status', parameters: {} });
    const plan = await request(app).post('/api/v1/automation/execute').set('Authorization', auth).send({ actionId: 'dev.plan_task', parameters: {
      taskTitle: 'Improve room readiness',
      taskDescription: 'Clarify the status transitions and handoff sequence for an apartment turnover.',
      category: 'OPERATIONS',
      priority: 'HIGH',
      expectedOutcome: 'A reviewed readiness workflow with clear owner responsibilities.',
      implementationContext: 'Keep current route contracts and role permissions intact.',
    } });
    expect(status.status).toBe(403);
    expect(plan.status).toBe(200);
    expect(plan.body.data.result.task.title).toBe('Improve room readiness');
    expect(plan.body.data.result.task.expectedOutcome).toBe('A reviewed readiness workflow with clear owner responsibilities.');
    expect(plan.body.data.result.task.implementationContext).toContain('current route contracts');
    expect(plan.body.data.result.inputHandling).toContain('untrusted input data');
  });
});
