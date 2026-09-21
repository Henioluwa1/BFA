const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Health & Diagnostics API Tests', () => {
  afterAll(async () => {
    await pool.closePool();
  });

  describe('GET /api/v1/health/ping', () => {
    it('should return pong with 200 OK and standardized envelope', async () => {
      const res = await request(app).get('/api/v1/health/ping');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('pong');
      expect(res.body.data).toHaveProperty('alive', true);
      expect(res.body.meta).toHaveProperty('timestamp');
      expect(res.headers).toHaveProperty('x-request-id');
    });
  });

  describe('GET /api/v1/health', () => {
    it('should return system and database operational metrics', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status', 'healthy');
      expect(res.body.data).toHaveProperty('service', 'BFA Apartments Management System');
      expect(res.body.data.database).toHaveProperty('status', 'connected');
      expect(res.body.data.database).toHaveProperty('appliedMigrations');
      expect(res.body.data.database.appliedMigrations).toBeGreaterThanOrEqual(2);
      expect(res.body.data.system).toHaveProperty('nodeVersion');
      expect(res.body.data.system.memoryUsageMb).toBeDefined();
    });
  });

  describe('GET /api/v1/system/info', () => {
    it('should return system settings and registered navigation modules', async () => {
      const res = await request(app).get('/api/v1/system/info');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('name', 'BFA Apartments Management System');
      expect(res.body.data).toHaveProperty('modules');
      expect(res.body.data.modules.length).toBe(11);
      expect(res.body.data.settings).toHaveProperty('company');
      expect(res.body.data.settings.company).toHaveProperty('company_name', 'BFA Apartments');
    });
  });
});
