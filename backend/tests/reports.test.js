const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const jwt = require('jsonwebtoken');
const config = require('../src/config');

describe('Reporting Engine API Tests (Section 11, 12, 13, 15)', () => {
  let adminToken = '';

  beforeAll(() => {
    adminToken = jwt.sign(
      { id: 1, email: 'admin@bfa.com', role: 'ADMIN', propertyId: null },
      config.security.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await pool.closePool();
  });

  it('should return financial summary report in JSON format', async () => {
    const res = await request(app)
      .get('/api/v1/reports/financial')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('summary');
    expect(res.body.data.summary).toHaveProperty('totalRevenue');
    expect(res.body.data.summary).toHaveProperty('totalCollected');
    expect(res.body.data.summary).toHaveProperty('netProfit');
    expect(res.body.data.reservations.length).toBeGreaterThan(0);
  });

  it('should export reservations report as RFC 4180 CSV file', async () => {
    const res = await request(app)
      .get('/api/v1/reports/reservations?format=csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment; filename="bfa-reservations-report-');
    expect(res.text).toContain('Reservation Code');
    expect(res.text).toContain('Tenant Name');
    expect(res.text).toContain('RES-BFA-1001');
  });

  it('should export financial summary as PDF binary document', async () => {
    const res = await request(app)
      .get('/api/v1/reports/financial?format=pdf')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, callback) => {
        res.data = '';
        res.on('data', (chunk) => {
          res.data += chunk;
        });
        res.on('end', () => {
          callback(null, res.data);
        });
      });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment; filename="bfa-financial-summary-');
    // PDF files start with %PDF-
    expect(res.body.toString().startsWith('%PDF-')).toBe(true);
  });
});
