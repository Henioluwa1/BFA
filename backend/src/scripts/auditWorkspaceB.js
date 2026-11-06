const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const config = require('../config');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\88bff36c-819d-46a9-8801-74cb3602a6e8';
const BASE_URL = 'http://localhost:5173';

const VIEWPORTS = [
  { name: 'desktop_1440x900', width: 1440, height: 900 },
  { name: 'laptop_1280x800', width: 1280, height: 800 },
  { name: 'tablet_landscape_1024x768', width: 1024, height: 768 },
  { name: 'tablet_portrait_768x1024', width: 768, height: 1024 },
  { name: 'mobile_large_430x932', width: 430, height: 932 },
  { name: 'mobile_standard_390x844', width: 390, height: 844 },
  { name: 'mobile_small_360x800', width: 360, height: 800 },
  { name: 'mobile_compact_320x700', width: 320, height: 700 },
];

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      propertyId: user.property_id || null,
      agentId: user.agentId || null,
    },
    config.security.jwtSecret,
    { expiresIn: '2h' }
  );
}

const ROLES_TO_AUDIT = [
  {
    role: 'SUPER_ADMIN',
    user: { id: 1, name: 'BFA Super Admin', email: 'superadmin@bfa.com', role: 'SUPER_ADMIN', property_id: null },
    expectedTheme: 'super_admin',
  },
  {
    role: 'OWNER',
    user: { id: 7, name: 'Chief Emeka BFA (Owner)', email: 'owner@bfa.com', role: 'OWNER', property_id: null },
    expectedTheme: 'owner',
  },
  {
    role: 'ADMIN',
    user: { id: 2, name: 'Sarah Jenkins (Admin)', email: 'admin@bfa.com', role: 'ADMIN', property_id: null },
    expectedTheme: 'admin',
  },
  {
    role: 'OPERATIONS_MANAGER',
    user: { id: 3, name: 'Marcus Vance (Manager)', email: 'manager@bfa.com', role: 'OPERATIONS_MANAGER', property_id: 1 },
    expectedTheme: 'manager',
  },
  {
    role: 'RECEPTIONIST',
    user: { id: 4, name: 'Elena Ramos (Reception)', email: 'receptionist@bfa.com', role: 'RECEPTIONIST', property_id: 1 },
    expectedTheme: 'receptionist',
  },
  {
    role: 'STAFF',
    user: { id: 5, name: 'David Kalu (Staff)', email: 'staff@bfa.com', role: 'STAFF', property_id: 1 },
    expectedTheme: 'staff',
  },
  {
    role: 'AGENT',
    user: { id: 6, name: 'Alexander Wright (Agent)', email: 'agent@bfa.com', role: 'AGENT', property_id: null, agentId: 1 },
    expectedTheme: 'agent',
  },
];

async function runAudit() {
  console.log('=== WORKSPACE B: ACCEPTANCE AUDIT & BROWSER VERIFICATION ===\n');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const auditReport = {
    timestamp: new Date().toISOString(),
    roleAssessments: {},
    ownerModalAssessment: {},
    idCardAssessment: {},
    navigationAssessment: {},
    responsiveMatrix: [],
    consoleErrors: [],
    failedRequests: [],
  };

  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon.ico') && !text.includes('Failed to load resource')) {
        auditReport.consoleErrors.push(text);
      }
    }
  });

  page.on('requestfailed', (req) => {
    auditReport.failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ROLE-BY-ROLE DASHBOARD AND THEME AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- AUDIT A & B: Role Dashboards & Theme Verification ---');

  for (const r of ROLES_TO_AUDIT) {
    console.log(`\nAuditing Role: ${r.role} (${r.user.email})...`);
    const token = createToken(r.user);

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((tok, usr) => {
      localStorage.setItem('bfa_auth_token', tok);
      localStorage.setItem('bfa_auth_user', JSON.stringify(usr));
    }, token, r.user);

    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: 'networkidle0' });

    // Inspect Dashboard DOM
    const roleInfo = await page.evaluate((expectedTheme) => {
      const themeAttr = document.documentElement.getAttribute('data-portal-theme');
      const title = document.querySelector('h1')?.innerText?.trim() || '';
      const subtitle = document.querySelector('.page-subtitle, p')?.innerText?.trim() || '';
      const badges = Array.from(document.querySelectorAll('.role-badge, [class*="role-badge"], .brand-tag')).map(el => el.innerText.trim());
      const sidebarLinks = Array.from(document.querySelectorAll('.sidebar-nav a, .nav-item a, nav a')).map(el => el.innerText.trim());
      
      const noPropEl = document.querySelector('h2');
      const hasNoPropertyGuard = Boolean(noPropEl && noPropEl.innerText.includes('No Property Assigned'));
      const hasNoAgentGuard = Boolean(noPropEl && noPropEl.innerText.includes('No Agent Profile Linked'));

      return {
        themeAttr,
        themeMatches: themeAttr === expectedTheme,
        title,
        subtitle,
        badges,
        sidebarLinksCount: sidebarLinks.length,
        hasNoPropertyGuard,
        hasNoAgentGuard,
      };
    }, r.expectedTheme);

    const screenshotName = `audit_dashboard_${r.role.toLowerCase()}.png`;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, screenshotName), fullPage: false });

    console.log(` - Theme Attribute: "${roleInfo.themeAttr}" (Expected: "${r.expectedTheme}") -> ${roleInfo.themeMatches ? 'PASS' : 'FAIL'}`);
    console.log(` - Dashboard Header: "${roleInfo.title}"`);
    console.log(` - Sidebar Item Count: ${roleInfo.sidebarLinksCount}`);
    console.log(` - Guard States: NoPropertyGuard=${roleInfo.hasNoPropertyGuard}, NoAgentGuard=${roleInfo.hasNoAgentGuard}`);

    auditReport.roleAssessments[r.role] = {
      ...roleInfo,
      screenshot: screenshotName,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. OWNER GLASS MODAL VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- AUDIT A: Owner Portal Glassmorphism & Modal System ---');
  const ownerUser = ROLES_TO_AUDIT.find((r) => r.role === 'OWNER').user;
  const ownerToken = createToken(ownerUser);

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok, usr) => {
    localStorage.setItem('bfa_auth_token', tok);
    localStorage.setItem('bfa_auth_user', JSON.stringify(usr));
  }, ownerToken, ownerUser);

  await page.goto(`${BASE_URL}/app/access-control`, { waitUntil: 'networkidle0' });
  const ownerPageData = await page.evaluate(() => {
    const theme = document.documentElement.getAttribute('data-portal-theme');
    const computedBtn = window.getComputedStyle(document.querySelector('.btn-primary') || document.body);
    return {
      theme,
      btnBackground: computedBtn.background || computedBtn.backgroundImage,
    };
  });

  const ownerModalScreenshot = `audit_owner_glass_portal.png`;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, ownerModalScreenshot), fullPage: false });

  auditReport.ownerModalAssessment = {
    theme: ownerPageData.theme,
    isThemeOwner: ownerPageData.theme === 'owner',
    screenshot: ownerModalScreenshot,
  };
  console.log(`Owner Theme Active: ${ownerPageData.theme} -> ${ownerPageData.theme === 'owner' ? 'PASS' : 'FAIL'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. EMPLOYEE ID CARD & PRINT LAYOUT AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- AUDIT C: Employee ID Cards & Print Verification ---');
  await page.goto(`${BASE_URL}/app/id-cards`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.badge-stage, .badge-card-deck', { timeout: 10000 });

  const idCardData = await page.evaluate(() => {
    const frontCard = document.querySelector('.badge-face-front');
    const backCard = document.querySelector('.badge-face-back');
    const qrImg = document.querySelector('.badge-qr-container img');
    const staffName = document.querySelector('.badge-staff-name')?.innerText?.trim() || '';
    const staffRole = document.querySelector('.badge-staff-role')?.innerText?.trim() || '';
    const staffCode = document.querySelector('.badge-code-val')?.innerText?.trim() || '';
    const propertyScope = document.querySelector('.badge-front-meta strong:last-child')?.innerText?.trim() || '';
    const roleCardAttr = frontCard?.getAttribute('data-role-card') || '';

    // Check media print rules
    const printRulesExist = Array.from(document.styleSheets).some((sheet) => {
      try {
        return Array.from(sheet.cssRules).some((rule) => rule.media && rule.media.mediaText.includes('print'));
      } catch {
        return false;
      }
    });

    return {
      hasFront: Boolean(frontCard),
      hasBack: Boolean(backCard),
      hasQr: Boolean(qrImg),
      staffName,
      staffRole,
      staffCode,
      propertyScope,
      roleCardAttr,
      printRulesExist,
    };
  });

  const idCardScreenshot = `audit_employee_id_card.png`;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, idCardScreenshot), fullPage: false });

  console.log(` - ID Front Card Rendered: ${idCardData.hasFront ? 'PASS' : 'FAIL'}`);
  console.log(` - ID Back Card Rendered: ${idCardData.hasBack ? 'PASS' : 'FAIL'}`);
  console.log(` - QR Code Rendered: ${idCardData.hasQr ? 'PASS' : 'FAIL'}`);
  console.log(` - Card Attributes: Role Theme=${idCardData.roleCardAttr}, Name=${idCardData.staffName}, Code=${idCardData.staffCode}`);
  console.log(` - Print Stylesheet Verified in CSS: ${idCardData.printRulesExist ? 'PASS' : 'FAIL'}`);

  auditReport.idCardAssessment = {
    ...idCardData,
    screenshot: idCardScreenshot,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. ROUTE ACCESS CONTROL AND BOUNDARIES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- AUDIT D: Route Access Control & Least Privilege ---');

  // Test STAFF attempting to access /app/financial (should fail-closed / redirect to dashboard)
  const staffUser = ROLES_TO_AUDIT.find((r) => r.role === 'STAFF').user;
  const staffToken = createToken(staffUser);

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok, usr) => {
    localStorage.setItem('bfa_auth_token', tok);
    localStorage.setItem('bfa_auth_user', JSON.stringify(usr));
  }, staffToken, staffUser);

  await page.goto(`${BASE_URL}/app/financial`, { waitUntil: 'networkidle0' });
  const staffFinUrl = page.url();
  const staffBlockedFromFinancial = !staffFinUrl.endsWith('/app/financial');
  console.log(` - STAFF -> /app/financial: Redirected to ${staffFinUrl} -> ${staffBlockedFromFinancial ? 'PASS (Protected)' : 'FAIL (Leaked)'}`);

  // Test SUPER_ADMIN attempting to access /app/financial (SUPER_ADMIN has NO financial access)
  const superUser = ROLES_TO_AUDIT.find((r) => r.role === 'SUPER_ADMIN').user;
  const superToken = createToken(superUser);

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok, usr) => {
    localStorage.setItem('bfa_auth_token', tok);
    localStorage.setItem('bfa_auth_user', JSON.stringify(usr));
  }, superToken, superUser);

  await page.goto(`${BASE_URL}/app/financial`, { waitUntil: 'networkidle0' });
  const superAdminFinUrl = page.url();
  const superAdminBlockedFromFinancial = !superAdminFinUrl.endsWith('/app/financial');
  console.log(` - SUPER_ADMIN -> /app/financial: Redirected to ${superAdminFinUrl} -> ${superAdminBlockedFromFinancial ? 'PASS (Protected)' : 'FAIL (Leaked)'}`);

  auditReport.navigationAssessment = {
    staffBlockedFromFinancial,
    staffRedirectUrl: staffFinUrl,
    superAdminBlockedFromFinancial,
    superAdminRedirectUrl: superAdminFinUrl,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. RESPONSIVE MATRIX ACROSS 8 VIEWPORTS (ADMIN PORTAL)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- AUDIT E: Responsive Layout Testing Across All 8 Viewports ---');
  const adminUser = ROLES_TO_AUDIT.find((r) => r.role === 'ADMIN').user;
  const adminToken = createToken(adminUser);

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok, usr) => {
    localStorage.setItem('bfa_auth_token', tok);
    localStorage.setItem('bfa_auth_user', JSON.stringify(usr));
  }, adminToken, adminUser);

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: 'networkidle0' });

    const overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    const vpScreenshot = `audit_responsive_admin_${vp.name}.png`;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, vpScreenshot), fullPage: false });

    console.log(`[${vp.name}] (${vp.width}x${vp.height}) - ScrollWidth: ${overflow.scrollWidth}, ClientWidth: ${overflow.clientWidth}, Overflow: ${overflow.hasHorizontalOverflow ? 'FAIL' : 'PASS'}`);

    auditReport.responsiveMatrix.push({
      ...vp,
      overflow,
      screenshot: vpScreenshot,
    });
  }

  // Save audit data
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'workspace_b_audit_results.json'),
    JSON.stringify(auditReport, null, 2)
  );

  console.log('\n--- Audit Data and Evidence Summary ---');
  console.log(`Console Errors: ${auditReport.consoleErrors.length}`);
  console.log(`Failed Requests: ${auditReport.failedRequests.length}`);

  await browser.close();
  console.log('\n=== Automated Browser Audit Run Completed ===');
}

runAudit().catch((err) => {
  console.error('Audit script failed:', err);
  process.exit(1);
});
