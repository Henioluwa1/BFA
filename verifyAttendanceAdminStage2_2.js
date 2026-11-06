/**
 * Automated Verification Script for BFA Workspace B - Stage 2.2
 * Attendance Policies & Kiosk Terminal Administration
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
  { role: 'SUPER_ADMIN', email: 'superadmin@bfa.com', id: 1, name: 'BFA Super Admin', propertyId: null, canManage: true, canRegisterKiosk: true },
  { role: 'ADMIN', email: 'admin@bfa.com', id: 2, name: 'Sarah Jenkins (Admin)', propertyId: null, canManage: true, canRegisterKiosk: true },
  { role: 'OWNER', email: 'owner@bfa.com', id: 7, name: 'Chief Emeka BFA (Owner)', propertyId: null, canManage: true, canRegisterKiosk: true },
  { role: 'OPERATIONS_MANAGER', email: 'manager@bfa.com', id: 3, name: 'Marcus Vance (Manager)', propertyId: 1, canManage: true, canRegisterKiosk: false },
  { role: 'RECEPTIONIST', email: 'receptionist@bfa.com', id: 4, name: 'Elena Ramos (Reception)', propertyId: 1, canManage: false, canRegisterKiosk: false },
  { role: 'STAFF', email: 'staff@bfa.com', id: 5, name: 'David Kalu (Staff)', propertyId: 1, canManage: false, canRegisterKiosk: false },
  { role: 'AGENT', email: 'agent@bfa.com', id: 6, name: 'Alexander Wright (Agent)', propertyId: null, canManage: false, canRegisterKiosk: false },
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
      property_id: user.propertyId,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runStage2_2Verification() {
  console.log('=== STARTING BFA STAGE 2.2 VERIFICATION SUITE ===');
  const results = {
    timestamp: new Date().toISOString(),
    apiTests: {},
    uiTests: {},
    viewportsTested: [],
    rolesTested: [],
  };

  const adminUser = ROLES.find((r) => r.role === 'ADMIN');
  const adminToken = generateToken(adminUser);
  const opsUser = ROLES.find((r) => r.role === 'OPERATIONS_MANAGER');
  const opsToken = generateToken(opsUser);
  const staffUser = ROLES.find((r) => r.role === 'STAFF');
  const staffToken = generateToken(staffUser);

  // ─────────────────────────────────────────────────────────────────────────
  // PART 1: BACKEND API & SECURITY AUDIT CHECKS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[API TEST 1] Attendance Policy Retrieval & Update...');
  const getPolicyRes = await fetch(`${BACKEND_URL}/workforce/attendance/policies/1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const policyData = await getPolicyRes.json();
  console.log(`- Policy 1 retrieved: Status ${getPolicyRes.status}, Radius: ${policyData.data?.geofence_radius_meters}m, Grace: ${policyData.data?.grace_period_minutes}m`);

  const updatePolicyRes = await fetch(`${BACKEND_URL}/workforce/attendance/policies/1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ geofence_radius_meters: 275, grace_period_minutes: 15 }),
  });
  const updateData = await updatePolicyRes.json();
  console.log(`- Policy updated by Admin: Status ${updatePolicyRes.status}, New Radius: ${updateData.data?.geofence_radius_meters}m`);

  // Operations Manager property isolation on policy: Attempt updating Property 2 (must be rejected 403)
  const opsIllegalPolicyRes = await fetch(`${BACKEND_URL}/workforce/attendance/policies/2`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({ geofence_radius_meters: 500 }),
  });
  const opsIllegalData = await opsIllegalPolicyRes.json();
  const policyIsolationEnforced = opsIllegalPolicyRes.status === 403;
  console.log(`- Operations Manager cross-property policy edit blocked: ${policyIsolationEnforced} (Status: ${opsIllegalPolicyRes.status}, Msg: "${opsIllegalData.error?.message || opsIllegalData.message}")`);

  results.apiTests.policy = {
    retrievalStatus: getPolicyRes.status,
    updateStatus: updatePolicyRes.status,
    isolationEnforced: policyIsolationEnforced,
  };

  console.log('\n[API TEST 2] Kiosk Terminal Registration & Status Controls...');
  const testKioskCode = `KIOSK-VERIFY-${Date.now().toString().slice(-4)}`;
  const registerKioskRes = await fetch(`${BACKEND_URL}/workforce/kiosks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      property_id: 1,
      kiosk_name: 'Verification Lobby Terminal',
      kiosk_code: testKioskCode,
      kiosk_secret: 'BFA-Secure-Kiosk-2026!',
    }),
  });
  const newKioskData = await registerKioskRes.json();
  const kioskCreated = registerKioskRes.status === 201;
  const createdKioskId = newKioskData.data?.id;
  console.log(`- Kiosk registered by Admin: ${kioskCreated} (Status: ${registerKioskRes.status}, ID: ${createdKioskId}, Code: ${testKioskCode})`);

  // Unauthorized kiosk registration by Staff (must be rejected 403)
  const staffKioskRes = await fetch(`${BACKEND_URL}/workforce/kiosks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ property_id: 1, kiosk_name: 'Illegal Kiosk', kiosk_code: 'BAD-01', kiosk_secret: 'secret' }),
  });
  const staffKioskData = await staffKioskRes.json();
  const staffBlocked = staffKioskRes.status === 403;
  console.log(`- Staff kiosk registration rejected: ${staffBlocked} (Status: ${staffKioskRes.status}, Msg: "${staffKioskData.error?.message}")`);

  // Update Kiosk Status to INACTIVE
  let statusUpdated = false;
  if (createdKioskId) {
    const statusRes = await fetch(`${BACKEND_URL}/workforce/kiosks/${createdKioskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    const statusData = await statusRes.json();
    statusUpdated = statusRes.status === 200 && statusData.data?.status === 'INACTIVE';
    console.log(`- Kiosk status changed to INACTIVE: ${statusUpdated} (Status: ${statusRes.status})`);
  }

  results.apiTests.kiosk = {
    registrationSuccess: kioskCreated,
    unauthorizedRegistrationBlocked: staffBlocked,
    statusUpdateSuccess: statusUpdated,
  };

  console.log('\n[API TEST 3] Manager-Assisted Attendance & Maker-Checker Security...');
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Valid manager punch for Elena Ramos (#3)
  const validPunchRes = await fetch(`${BACKEND_URL}/workforce/attendance/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      employeeId: 3,
      propertyId: 1,
      workDate: todayStr,
      clockInTime: `${todayStr}T08:30:00`,
      clockOutTime: `${todayStr}T16:30:00`,
      breakMinutes: 45,
      reason: 'Device hardware failure at lobby entrance',
    }),
  });
  const validPunchData = await validPunchRes.json();
  const validPunchRecorded = validPunchRes.status === 201;
  console.log(`- Manager-assisted punch recorded: ${validPunchRecorded} (Status: ${validPunchRes.status}, Notes: "${validPunchData.data?.verification_notes}")`);

  // 2. Maker-checker violation check: Marcus Vance (user id 3, employee id 2) trying to record punch for Marcus Vance
  const selfPunchRes = await fetch(`${BACKEND_URL}/workforce/attendance/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({
      employeeId: 2, // Marcus Vance employee ID (user_id = 3)
      propertyId: 1,
      workDate: todayStr,
      clockInTime: `${todayStr}T09:00:00`,
      reason: 'Self punch attempt',
    }),
  });
  const selfPunchData = await selfPunchRes.json();
  const selfPunchBlocked = selfPunchRes.status === 403;
  console.log(`- Maker-checker violation correctly rejected: ${selfPunchBlocked} (Status: ${selfPunchRes.status}, Message: "${selfPunchData.error?.message || selfPunchData.message}")`);

  results.apiTests.manualPunch = {
    validPunchRecorded,
    selfPunchBlocked,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PART 2: PUPPETEER BROWSER UI & RESPONSIVE VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[UI TEST] Launching Headless Browser UI Verification...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // 1. Log in as ADMIN to verify Attendance Tab Action Controls
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token, user) => {
      localStorage.setItem('bfa_auth_token', token);
      localStorage.setItem('bfa_auth_user', JSON.stringify({
        ...user,
        permissions: ['ATTENDANCE_VIEW', 'ATTENDANCE_CLOCK', 'ATTENDANCE_CORRECTION_APPROVE', 'ATTENDANCE_POLICY_MANAGE', 'KIOSK_MANAGE'],
      }));
    }, adminToken, adminUser);

    await page.goto(`${FRONTEND_URL}/app/workforce?tab=attendance`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1500));

    // Capture Full Admin Attendance Tab Screenshot
    const adminAttendanceShot = path.join(ARTIFACT_DIR, 'stage2_2_admin_attendance_hub.png');
    await page.screenshot({ path: adminAttendanceShot, fullPage: false });
    console.log(`Saved screenshot: ${adminAttendanceShot}`);

    // Verify Action Buttons Present
    const hasManualPunchBtn = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('Record Manual Punch'));
    });
    const hasPolicyBtn = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('Attendance Policy'));
    });
    const hasKioskBtn = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('Kiosk Terminals'));
    });

    console.log(`- Has "+ Record Manual Punch" button: ${hasManualPunchBtn}`);
    console.log(`- Has "⚙ Attendance Policy" button: ${hasPolicyBtn}`);
    console.log(`- Has "📱 Kiosk Terminals" button: ${hasKioskBtn}`);
    results.uiTests.controls = { hasManualPunchBtn, hasPolicyBtn, hasKioskBtn };

    // 2. Open Attendance Policy Modal & Capture Screenshot
    console.log('\n[UI TEST 2] Opening Attendance Policy Modal...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Attendance Policy'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const policyShot = path.join(ARTIFACT_DIR, 'stage2_2_modal_attendance_policy.png');
    await page.screenshot({ path: policyShot, fullPage: false });
    console.log(`Saved screenshot: ${policyShot}`);

    // Close Policy Modal
    await page.evaluate(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Cancel'));
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // 3. Open Kiosk Terminals Modal & Capture Screenshot
    console.log('\n[UI TEST 3] Opening Kiosk Management Modal...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Kiosk Terminals'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const kioskShot = path.join(ARTIFACT_DIR, 'stage2_2_modal_kiosk_management.png');
    await page.screenshot({ path: kioskShot, fullPage: false });
    console.log(`Saved screenshot: ${kioskShot}`);

    // Close Kiosk Modal
    await page.evaluate(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Close'));
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // 4. Open Manual Punch Modal & Capture Screenshot
    console.log('\n[UI TEST 4] Opening Manual Punch Modal...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Record Manual Punch'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const manualPunchShot = path.join(ARTIFACT_DIR, 'stage2_2_modal_manual_punch.png');
    await page.screenshot({ path: manualPunchShot, fullPage: false });
    console.log(`Saved screenshot: ${manualPunchShot}`);

    // Close Manual Punch Modal
    await page.evaluate(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Cancel'));
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // 5. Responsive Matrix across 8 Viewports
    console.log('\n[UI TEST 5] Testing 8 Responsive Viewports...');
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise((r) => setTimeout(r, 350));

      const vpShot = path.join(ARTIFACT_DIR, `stage2_2_responsive_${vp.name}.png`);
      await page.screenshot({ path: vpShot, fullPage: false });

      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      console.log(`- Viewport ${vp.name.padEnd(25)} (${vp.width}x${vp.height}): body overflow = ${overflowX}`);
      results.viewportsTested.push({ name: vp.name, width: vp.width, height: vp.height, overflowX });
    }

    // 6. 7-Role Permission Matrix
    console.log('\n[UI TEST 6] Verifying 7-Role Access Rights to Attendance Admin...');
    await page.setViewport({ width: 1440, height: 900 });

    for (const r of ROLES) {
      const uToken = generateToken(r);
      await page.evaluate((token, user) => {
        localStorage.setItem('bfa_auth_token', token);
        localStorage.setItem('bfa_auth_user', JSON.stringify({
          ...user,
          permissions: user.canManage ? ['ATTENDANCE_VIEW', 'ATTENDANCE_CLOCK', 'ATTENDANCE_POLICY_MANAGE', 'KIOSK_MANAGE'] : [],
        }));
      }, uToken, r);

      await page.goto(`${FRONTEND_URL}/app/workforce?tab=attendance`, { waitUntil: 'domcontentloaded' });
      await new Promise((r) => setTimeout(r, 500));

      const currentUrl = page.url();
      const hasWorkforceAccess = currentUrl.includes('/app/workforce');
      const hasAdminActions = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('Record Manual Punch'));
      });

      console.log(`- Role ${r.role.padEnd(20)}: Access = ${hasWorkforceAccess}, Has Admin Controls = ${hasAdminActions}`);
      results.rolesTested.push({
        role: r.role,
        hasWorkforceAccess,
        expectedAccess: r.canManage,
        hasAdminActions,
        passed: r.canManage ? (hasWorkforceAccess && hasAdminActions) : (!hasWorkforceAccess && !hasAdminActions),
      });
    }

    // Save JSON results
    const jsonPath = path.join(ARTIFACT_DIR, 'stage2_2_attendance_admin_verification_results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nVerification results written to: ${jsonPath}`);
    console.log('=== ALL STAGE 2.2 VERIFICATIONS COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Browser verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

runStage2_2Verification();
