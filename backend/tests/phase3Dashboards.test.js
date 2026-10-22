const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const fs = require('fs');
const path = require('path');

describe('Phase 3 Role-Specific Dashboards Test Suite', () => {
  const tokens = {};
  const password = 'Bfa2026!Secure';

  const roleCredentials = {
    SUPER_ADMIN: 'superadmin@bfa.com',
    ADMIN: 'admin@bfa.com',
    MANAGER: 'manager@bfa.com',
    RECEPTIONIST: 'receptionist@bfa.com',
    STAFF: 'staff@bfa.com',
    AGENT: 'agent@bfa.com',
    OWNER: 'owner@bfa.com',
  };

  beforeAll(async () => {
    // Authenticate all 7 authoritative roles
    for (const [role, email] of Object.entries(roleCredentials)) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });
      
      expect(res.status).toBe(200);
      expect(res.body?.data?.token).toBeDefined();
      tokens[role] = res.body.data.token;
    }
  }, 30000);

  describe('1. Role-Based Access Control (RBAC) on Dashboard Data Endpoints', () => {
    test('RECEPTIONIST: Can access front-office stats, arrivals and departures; CANNOT access financial overview', async () => {
      // Allowed Front Office endpoints
      const foStatsRes = await request(app)
        .get('/api/v1/front-office/stats')
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`);
      expect(foStatsRes.status).toBe(200);
      expect(foStatsRes.body?.data).toHaveProperty('todaysArrivals');
      expect(foStatsRes.body?.data).toHaveProperty('inHouseGuests');

      const arrRes = await request(app)
        .get('/api/v1/front-office/arrivals')
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`);
      expect(arrRes.status).toBe(200);

      const depRes = await request(app)
        .get('/api/v1/front-office/departures')
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`);
      expect(depRes.status).toBe(200);

      // Forbidden Financial endpoint (HTTP 403)
      const finRes = await request(app)
        .get('/api/v1/financial/overview')
        .set('Authorization', `Bearer ${tokens.RECEPTIONIST}`);
      expect(finRes.status).toBe(403);
    });

    test('STAFF: Can access maintenance stats; CANNOT access financial overview or front-office stats', async () => {
      // Allowed Maintenance stats
      const maintRes = await request(app)
        .get('/api/v1/maintenance/stats')
        .set('Authorization', `Bearer ${tokens.STAFF}`);
      expect(maintRes.status).toBe(200);
      const maintOverview = maintRes.body?.data?.overview || maintRes.body?.data;
      expect(maintOverview).toHaveProperty('open');

      // Forbidden Front Office (HTTP 403)
      const foRes = await request(app)
        .get('/api/v1/front-office/stats')
        .set('Authorization', `Bearer ${tokens.STAFF}`);
      expect(foRes.status).toBe(403);

      // Forbidden Financial overview (HTTP 403)
      const finRes = await request(app)
        .get('/api/v1/financial/overview')
        .set('Authorization', `Bearer ${tokens.STAFF}`);
      expect(finRes.status).toBe(403);
    });

    test('AGENT: Strictly isolated; CANNOT access financial overview or front-office stats', async () => {
      // Forbidden Front Office (HTTP 403)
      const foRes = await request(app)
        .get('/api/v1/front-office/stats')
        .set('Authorization', `Bearer ${tokens.AGENT}`);
      expect(foRes.status).toBe(403);

      // Forbidden Financial overview (HTTP 403)
      const finRes = await request(app)
        .get('/api/v1/financial/overview')
        .set('Authorization', `Bearer ${tokens.AGENT}`);
      expect(finRes.status).toBe(403);

      // Allowed commissions summary
      const commRes = await request(app)
        .get('/api/v1/commissions/summary')
        .set('Authorization', `Bearer ${tokens.AGENT}`);
      expect([200, 404]).toContain(commRes.status);
    });

    test('OWNER: Can access financial overview, front-office stats, and maintenance stats', async () => {
      const finRes = await request(app)
        .get('/api/v1/financial/overview')
        .set('Authorization', `Bearer ${tokens.OWNER}`);
      expect(finRes.status).toBe(200);
      expect(finRes.body?.data).toHaveProperty('kpis');
      expect(finRes.body?.data?.kpis).toHaveProperty('grossCollected');

      const foRes = await request(app)
        .get('/api/v1/front-office/stats')
        .set('Authorization', `Bearer ${tokens.OWNER}`);
      expect(foRes.status).toBe(200);

      const maintRes = await request(app)
        .get('/api/v1/maintenance/stats')
        .set('Authorization', `Bearer ${tokens.OWNER}`);
      expect(maintRes.status).toBe(200);
    });

    test('ADMIN & MANAGER: Can access operational velocity endpoints and financial overview', async () => {
      for (const role of ['ADMIN', 'MANAGER']) {
        const foRes = await request(app)
          .get('/api/v1/front-office/stats')
          .set('Authorization', `Bearer ${tokens[role]}`);
        expect(foRes.status).toBe(200);

        const finRes = await request(app)
          .get('/api/v1/financial/overview')
          .set('Authorization', `Bearer ${tokens[role]}`);
        expect(finRes.status).toBe(200);

        const maintRes = await request(app)
          .get('/api/v1/maintenance/stats')
          .set('Authorization', `Bearer ${tokens[role]}`);
        expect(maintRes.status).toBe(200);
      }
    });

    test('SUPER_ADMIN: Can access system health, global financial overview, and telemetry', async () => {
      const healthRes = await request(app)
        .get('/api/v1/health')
        .set('Authorization', `Bearer ${tokens.SUPER_ADMIN}`);
      expect(healthRes.status).toBe(200);
      expect(healthRes.body?.data).toHaveProperty('database');
      expect(healthRes.body?.data?.database).toHaveProperty('latencyMs');

      const finRes = await request(app)
        .get('/api/v1/financial/overview?propertyId=all')
        .set('Authorization', `Bearer ${tokens.SUPER_ADMIN}`);
      expect(finRes.status).toBe(200);
      expect(finRes.body?.data).toHaveProperty('kpis');
    });
  });

  describe('2. Property-Scoping Integrity on Dashboard Feeds', () => {
    test('Front-office stats respect propertyId scoping', async () => {
      const allRes = await request(app)
        .get('/api/v1/front-office/stats')
        .set('Authorization', `Bearer ${tokens.ADMIN}`);
      expect(allRes.status).toBe(200);

      const scopedRes = await request(app)
        .get('/api/v1/front-office/stats?propertyId=1')
        .set('Authorization', `Bearer ${tokens.ADMIN}`);
      expect(scopedRes.status).toBe(200);
      expect(scopedRes.body?.data).toHaveProperty('totalUnits');
    });

    test('Financial overview respects propertyId scoping', async () => {
      const scopedRes = await request(app)
        .get('/api/v1/financial/overview?propertyId=1')
        .set('Authorization', `Bearer ${tokens.ADMIN}`);
      expect(scopedRes.status).toBe(200);
      expect(scopedRes.body?.data?.kpis).toHaveProperty('netProfit');
    });
  });

  describe('3. Architectural Integrity: Frontend Role Mapping & Components', () => {
    test('DashboardPage.jsx implements explicit routing for all 7 roles', () => {
      const dashboardPagePath = path.resolve(__dirname, '../../frontend/src/pages/DashboardPage.jsx');
      expect(fs.existsSync(dashboardPagePath)).toBe(true);

      const content = fs.readFileSync(dashboardPagePath, 'utf8');
      const requiredRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'];
      for (const role of requiredRoles) {
        expect(content).toContain(`'${role}'`);
      }
    });

    test('All 6 dedicated dashboard component files exist in frontend/src/components/dashboard/', () => {
      const dashboardDir = path.resolve(__dirname, '../../frontend/src/components/dashboard');
      const expectedFiles = [
        'SuperAdminDashboard.jsx',
        'AdminManagerDashboard.jsx',
        'ReceptionistDashboard.jsx',
        'StaffDashboard.jsx',
        'AgentDashboard.jsx',
        'OwnerDashboard.jsx',
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(dashboardDir, file);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('4. Targeted Remediation Verification (DEF-01 & DEF-02)', () => {
    test('DEF-01: StaffDashboard.jsx maps maintenance overview object fields (open, inProgress, criticalOpen)', () => {
      const staffDashboardPath = path.resolve(__dirname, '../../frontend/src/components/dashboard/StaffDashboard.jsx');
      expect(fs.existsSync(staffDashboardPath)).toBe(true);

      const content = fs.readFileSync(staffDashboardPath, 'utf8');
      // Verifies inspection of overview object
      expect(content).toContain('overview.open');
      expect(content).toContain('overview.inProgress');
      expect(content).toContain('overview.criticalOpen');
      expect(content).toContain('statsRes.data.overview || statsRes.data');
    });

    test('DEF-01: API Contract provides overview object with expected numeric keys', async () => {
      const res = await request(app)
        .get('/api/v1/maintenance/stats')
        .set('Authorization', `Bearer ${tokens.STAFF}`);
      
      expect(res.status).toBe(200);
      expect(res.body?.data).toHaveProperty('overview');
      const overview = res.body.data.overview;
      expect(typeof overview.open).toBe('number');
      expect(typeof overview.inProgress).toBe('number');
      expect(typeof overview.criticalOpen).toBe('number');
      expect(typeof overview.total).toBe('number');
    });

    test('DEF-02: Backend state machine blocks direct DIRTY -> AVAILABLE bypass transition (HTTP 409)', async () => {
      // Temporarily mark Unit 3 as DIRTY
      await pool.query('UPDATE apartments SET status = "DIRTY" WHERE id = 3');

      // Attempt invalid direct transition to AVAILABLE
      const invalidRes = await request(app)
        .patch('/api/v1/apartments/3/status')
        .set('Authorization', `Bearer ${tokens.STAFF}`)
        .send({ status: 'AVAILABLE' });

      expect(invalidRes.status).toBe(409);
      expect(invalidRes.body?.error?.message || invalidRes.body?.message).toContain('cannot bypass cleaning');
    });

    test('DEF-02: Progressive turnover transition (DIRTY -> CLEANING -> AVAILABLE) succeeds', async () => {
      // Ensure Unit 3 starts at DIRTY
      await pool.query('UPDATE apartments SET status = "DIRTY" WHERE id = 3');

      // Step 1: Valid transition from DIRTY to CLEANING
      const step1Res = await request(app)
        .patch('/api/v1/apartments/3/status')
        .set('Authorization', `Bearer ${tokens.STAFF}`)
        .send({ status: 'CLEANING' });

      expect(step1Res.status).toBe(200);
      expect(step1Res.body?.data?.status).toBe('CLEANING');

      // Step 2: Valid transition from CLEANING to AVAILABLE
      const step2Res = await request(app)
        .patch('/api/v1/apartments/3/status')
        .set('Authorization', `Bearer ${tokens.STAFF}`)
        .send({ status: 'AVAILABLE' });

      expect(step2Res.status).toBe(200);
      expect(step2Res.body?.data?.status).toBe('AVAILABLE');
    });

    test('DEF-02: StaffDashboard.jsx implements progressive buttons (Start Cleaning & Mark Available)', () => {
      const staffDashboardPath = path.resolve(__dirname, '../../frontend/src/components/dashboard/StaffDashboard.jsx');
      const content = fs.readFileSync(staffDashboardPath, 'utf8');

      expect(content).toContain("handleTurnoverTransition(unit, 'CLEANING')");
      expect(content).toContain("handleTurnoverTransition(unit, 'AVAILABLE')");
      expect(content).toContain('Start Cleaning');
      expect(content).toContain('Mark Available');
    });
  });
});

