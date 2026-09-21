const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Global Search Engine API Tests (Section 5, 6, 7)', () => {
  afterAll(async () => {
    await pool.closePool();
  });

  it('should return categorized matches for "Horizon"', async () => {
    const res = await request(app).get('/api/v1/search?q=Horizon');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.query).toBe('Horizon');
    expect(res.body.data.totalResults).toBeGreaterThan(0);
    expect(res.body.data.categories).toHaveProperty('properties');
    expect(res.body.data.categories).toHaveProperty('apartments');
    expect(res.body.data.categories.properties.some((p) => p.name.includes('Grand Horizon'))).toBe(true);
  });

  it('should return empty categories structure for blank search query', async () => {
    const res = await request(app).get('/api/v1/search?q=');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalResults).toBe(0);
    expect(res.body.data.categories.properties.length).toBe(0);
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
      .set('X-User-Role', 'Agent')
      .set('X-Agent-Id', '2'); // Agent 2 searching for Agent 1 Alexander

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    // Agents category must not be visible or returned to Agent role
    expect(res.body.data.categories.agents.length).toBe(0);
  });
});
