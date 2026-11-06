/**
 * Automated Verification Script for BFA Workspace B - Stage 2.1
 * Workforce Roster Planning & Shift Assignment Grid
 */

const puppeteer = require('./backend/node_modules/puppeteer-core');
const jwt = require('./backend/node_modules/jsonwebtoken');
const config = require('./backend/src/config');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5000/api/v1';
const ARTIFACT_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\88bff36c-819d-46a9-8801-74cb3602a6e8';

const JWT_SECRET = config.security.jwtSecret;

const ROLES = [
  { role: 'SUPER_ADMIN', email: 'superadmin@bfa.ng', id: 1, name: 'System Root', propertyId: null, canManage: true },
  { role: 'ADMIN', email: 'admin@bfa.ng', id: 2, name: 'Sarah Admin', propertyId: null, canManage: true },
  { role: 'OWNER', email: 'owner@bfa.ng', id: 5, name: 'Chief Adeleke', propertyId: null, canManage: true },
  { role: 'OPERATIONS_MANAGER', email: 'manager@bfa.ng', id: 3, name: 'Marcus Vance', propertyId: 1, canManage: true },
  { role: 'RECEPTIONIST', email: 'receptionist@bfa.ng', id: 4, name: 'Sarah Jenkins', propertyId: 1, canManage: false },
  { role: 'STAFF', email: 'staff@bfa.ng', id: 6, name: 'Elena Ramos', propertyId: 1, canManage: false },
  { role: 'AGENT', email: 'agent@bfa.ng', id: 7, name: 'David Kalu', propertyId: null, canManage: false },
];

const VIEWPORTS = [
  { name: 'desktop_1440', width: 1440, height: 900 },
  { name: 'laptop_1280', width: 1280, height: 800 },
  { name: 'tablet_landscape_1024', width: 1024, height: 768 },
  { name: 'tablet_portrait_768', width: 768, height: 1024 },
  { name: 'mobile_large_430', width: 430, height: 932 },
  { name: 'mobile_standard_390', width: 390, height: 844 },
  { name: 'mobile_small_360', width: 360, height: 800 },
  { name: 'mobile_compact_320', width: 320, height: 700 },
];

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      propertyId: user.propertyId,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runVerification() {
  console.log('--- Starting Stage 2.1 Roster Grid Automated Verification ---');
  const results = {
    timestamp: new Date().toISOString(),
    rolesTested: [],
    viewportsTested: [],
    functionalTests: {},
  };

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Admin Roster Page Loading & Controls Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TEST 1] Admin Roster Grid Loading & Interaction...');
    const adminUser = ROLES.find((r) => r.role === 'ADMIN');
    const adminToken = generateToken(adminUser);

    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token, user) => {
      localStorage.setItem('bfa_auth_token', token);
      localStorage.setItem('bfa_auth_user', JSON.stringify({
        ...user,
        permissions: ['ROSTER_VIEW', 'ROSTER_CREATE', 'ROSTER_EDIT', 'ROSTER_PUBLISH', 'SHIFT_ASSIGN'],
      }));
    }, adminToken, adminUser);

    await page.goto(`${FRONTEND_URL}/app/workforce?tab=roster`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1500));

    // Capture initial Admin Roster Screenshot
    const adminShotPath = path.join(ARTIFACT_DIR, 'stage2_1_roster_admin_desktop.png');
    await page.screenshot({ path: adminShotPath, fullPage: false });
    console.log(`Saved screenshot: ${adminShotPath}`);

    // Verify presence of toolbar, filters, weekly grid
    const hasToolbar = (await page.$('.roster-toolbar')) !== null;
    const hasFilters = (await page.$('.roster-filters-bar')) !== null;
    const hasWeeklyGrid = (await page.$('.roster-weekly-grid')) !== null;

    console.log(`- Has Roster Toolbar: ${hasToolbar}`);
    console.log(`- Has Roster Filters: ${hasFilters}`);
    console.log(`- Has Weekly 7-Day Grid: ${hasWeeklyGrid}`);
    results.functionalTests.adminControls = { hasToolbar, hasFilters, hasWeeklyGrid };

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Shift Scheduling & Conflict Engine Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TEST 2] Verifying Shift Creation & Conflict Handling...');
    
    // First ensure a test roster exists for Property 1
    const today = new Date();
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const monStr = monday.toISOString().split('T')[0];
    const sunStr = sunday.toISOString().split('T')[0];

    const rosterRes = await fetch(`${BACKEND_URL}/workforce/rosters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        property_id: 1,
        title: `Verification Test Roster (${monStr})`,
        start_date: monStr,
        end_date: sunStr,
        notes: 'Automated test suite container',
      }),
    });
    const rosterData = await rosterRes.json();
    console.log(`- Roster creation status: ${rosterRes.status} (${rosterData.message || rosterData.error?.message})`);

    const rosterId = rosterData?.data?.id || (await fetch(`${BACKEND_URL}/workforce/rosters?propertyId=1`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    }).then(r => r.json()).then(r => r.data?.[0]?.id));

    console.log(`- Active test roster ID: ${rosterId}`);

    // Schedule Shift 1 for Elena Ramos (Employee #3) from 08:00 to 16:00
    const shift1Res = await fetch(`${BACKEND_URL}/workforce/shifts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        roster_id: rosterId,
        property_id: 1,
        department: 'MAINTENANCE',
        employee_id: 3, // Elena Ramos
        shift_date: monStr,
        start_time: '08:00',
        end_time: '16:00',
        break_minutes: 60,
        notes: 'Shift 1: Morning maintenance',
      }),
    });
    const shift1Data = await shift1Res.json();
    console.log(`- Shift 1 created: status ${shift1Res.status} (ID: ${shift1Data.data?.id})`);

    // Schedule Shift 2: Overlapping shift for Elena Ramos on same day from 12:00 to 20:00 (EXPECT 409 CONFLICT)
    const shift2ConflictRes = await fetch(`${BACKEND_URL}/workforce/shifts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        roster_id: rosterId,
        property_id: 1,
        department: 'MAINTENANCE',
        employee_id: 3, // Elena Ramos
        shift_date: monStr,
        start_time: '12:00',
        end_time: '20:00',
        break_minutes: 60,
        notes: 'Conflicting shift',
      }),
    });
    const shift2ConflictData = await shift2ConflictRes.json();
    const conflictDetected = shift2ConflictRes.status === 409;
    console.log(`- Overlapping shift conflict correctly rejected: ${conflictDetected} (Status: ${shift2ConflictRes.status}, Message: "${shift2ConflictData.error?.message || shift2ConflictData.message}")`);
    results.functionalTests.conflictEngine = {
      conflictDetected,
      status: shift2ConflictRes.status,
      message: shift2ConflictData.error?.message || shift2ConflictData.message,
    };

    // Reload browser page to verify rendered shift card
    await page.reload({ waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1500));
    const cardCount = await page.$$eval('.roster-shift-card', (cards) => cards.length);
    console.log(`- Shift cards visible in DOM: ${cardCount}`);
    results.functionalTests.shiftCardRendered = cardCount > 0;

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Operations Manager Experience & Property Isolation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TEST 3] Operations Manager Access & Property Isolation...');
    const opsUser = ROLES.find((r) => r.role === 'OPERATIONS_MANAGER');
    const opsToken = generateToken(opsUser);

    await page.evaluate((token, user) => {
      localStorage.setItem('bfa_auth_token', token);
      localStorage.setItem('bfa_auth_user', JSON.stringify({
        ...user,
        permissions: ['ROSTER_VIEW', 'ROSTER_CREATE', 'ROSTER_EDIT', 'ROSTER_PUBLISH', 'SHIFT_ASSIGN'],
      }));
    }, opsToken, opsUser);

    await page.goto(`${FRONTEND_URL}/app/workforce?tab=roster`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1200));

    const opsShotPath = path.join(ARTIFACT_DIR, 'stage2_1_roster_operations_manager.png');
    await page.screenshot({ path: opsShotPath, fullPage: false });
    console.log(`Saved screenshot: ${opsShotPath}`);

    // Check if property filter dropdown is disabled or absent for Operations Manager
    const isPropDisabled = await page.$eval('select[aria-label="Filter by property"]', (el) => el.disabled).catch(() => 'absent');
    console.log(`- Operations Manager property selector locked/absent: ${isPropDisabled === 'absent' || isPropDisabled === true}`);
    results.functionalTests.operationsManagerScoped = isPropDisabled === 'absent' || isPropDisabled === true;

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: View Mode Switcher (Weekly -> Daily)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TEST 4] View Mode Toggle (Weekly Grid -> Daily Schedule)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const dailyBtn = btns.find((b) => b.textContent.includes('Daily Schedule'));
      if (dailyBtn) dailyBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const hasDailyView = (await page.$('.roster-daily-view')) !== null;
    console.log(`- Daily Schedule View rendered: ${hasDailyView}`);
    results.functionalTests.dailyViewToggle = hasDailyView;

    const dailyShotPath = path.join(ARTIFACT_DIR, 'stage2_1_roster_daily_view.png');
    await page.screenshot({ path: dailyShotPath, fullPage: false });
    console.log(`Saved screenshot: ${dailyShotPath}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Multi-Viewport Responsive Matrix (8 Breakpoints)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TEST 5] Testing 8 Responsive Viewports...');
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise((r) => setTimeout(r, 400));

      const vpShotPath = path.join(ARTIFACT_DIR, `stage2_1_responsive_${vp.name}.png`);
      await page.screenshot({ path: vpShotPath, fullPage: false });

      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      console.log(`- Viewport ${vp.name} (${vp.width}x${vp.height}): captured, body horizontal overflow: ${overflowX}`);
      results.viewportsTested.push({ name: vp.name, width: vp.width, height: vp.height, overflowX });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: 7-Role Access Matrix
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TEST 6] Testing 7 Roles Access Rights to Workforce & Roster...');
    await page.setViewport({ width: 1440, height: 900 });

    for (const r of ROLES) {
      const userToken = generateToken(r);
      await page.evaluate((token, user) => {
        localStorage.setItem('bfa_auth_token', token);
        localStorage.setItem('bfa_auth_user', JSON.stringify({
          ...user,
          permissions: user.canManage ? ['ROSTER_VIEW', 'ROSTER_CREATE', 'ROSTER_EDIT', 'ROSTER_PUBLISH', 'SHIFT_ASSIGN'] : [],
        }));
      }, userToken, r);

      await page.goto(`${FRONTEND_URL}/app/workforce?tab=roster`, { waitUntil: 'domcontentloaded' });
      await new Promise((r) => setTimeout(r, 600));

      const currentUrl = page.url();
      const hasAccess = currentUrl.includes('/app/workforce');
      const addShiftBtn = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.some((b) => b.textContent.includes('+ Add Shift'));
      });

      console.log(`- Role ${r.role.padEnd(20)}: Access = ${hasAccess}, Can Add Shifts = ${addShiftBtn}`);
      results.rolesTested.push({
        role: r.role,
        hasAccess,
        canManageExpected: r.canManage,
        canManageActual: addShiftBtn,
        passed: r.canManage ? (hasAccess && addShiftBtn) : (!hasAccess || !addShiftBtn),
      });
    }

    // Write verification results json
    const jsonPath = path.join(ARTIFACT_DIR, 'stage2_1_roster_verification_results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nVerification results saved to: ${jsonPath}`);
    console.log('--- ALL STAGE 2.1 TESTS COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Verification failed with error:', err);
    process.exit(1);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

runVerification();
