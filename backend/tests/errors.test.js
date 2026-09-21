const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Error Handling & Security Middleware Tests', () => {
  afterAll(async () => {
    await pool.closePool();
  });

  describe('404 Route Not Found', () => {
    it('should return 404 with standardized error envelope on nonexistent route', async () => {
      const res = await request(app).get('/api/v1/non-existent-endpoint');

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toHaveProperty('code', 'ROUTE_NOT_FOUND');
      expect(res.body.error.message).toContain('was not found');
      expect(res.body.meta).toHaveProperty('timestamp');
      expect(res.headers).toHaveProperty('x-request-id');
    });
  });

  describe('Security Headers', () => {
    it('should include Helmet security headers in responses', async () => {
      const res = await request(app).get('/api/v1/health/ping');

      expect(res.headers).toHaveProperty('x-dns-prefetch-control', 'off');
      expect(res.headers).toHaveProperty('x-frame-options');
      expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
    });
  });
});
