const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db/pool');
const config = require('../src/config');

describe('Global Search Engine API Tests (Section 5, 6, 7)', () => {
  afterAll(async () => {
    await pool.closePool();
  });

  const agentToken = jwt.sign({ id: 6, email: 'agent@bfa.com', role: 'AGENT', agentId: 2 }, config.security.jwtSecret);

  it('should return categorized matches for "Horizon"', async () => {
    const res = await request(app).get('/api/v1/search?q=Horizon');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('categories');
    expect(res.body.data.categories).toHaveProperty('properties');
    expect(res.body.data.categories).toHaveProperty('apartments');
    expect(res.body.data.totalResults).toBeGreaterThan(0);
  });

  it('should return empty categories structure for blank search query', async () => {
    const res = await request(app).get('/api/v1/search?q=');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalResults).toBe(0);
  });

  it('should respect property filtering and scope search to property 1', async () => {
    const res = await request(app).get('/api/v1/search?q=Suite&propertyId=1');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    // Should not return units from property 2 or 3
    const apartments = res.body.data.categories.apartments;
    apartments.forEach((apt) => {
      expect(apt.property_code).toBe('GHT');
    });
  });

  it('should enforce Agent data isolation: Agent cannot view other agents in search', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=Alexander')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    // Agents category must not be visible or returned to Agent role
    expect(res.body.data.categories.agents.length).toBe(0);
  });
});
