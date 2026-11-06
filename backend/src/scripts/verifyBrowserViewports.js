const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

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

async function runBrowserVerification() {
  console.log('--- Launching Automated Headless Browser (Edge Chromium) ---');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const results = {
    viewports: [],
    navigations: {},
    authGuards: {},
    consoleErrors: [],
    failedRequests: [],
  };

  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter harmless icon or favicon 404s
      if (!text.includes('favicon.ico')) {
        results.consoleErrors.push(text);
      }
    }
  });

  page.on('requestfailed', (req) => {
    results.failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
  });

  // ─── 1. Viewport & Overflow Tests on /properties ────────────────────
  console.log('\n--- 1. Testing Viewports & Horizontal Overflow on /properties ---');
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/properties`, { waitUntil: 'networkidle0' });

    // Check horizontal overflow
    const overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    const screenshotPath = path.join(ARTIFACT_DIR, `viewport_${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(`[${vp.name}] (${vp.width}x${vp.height}) - ScrollWidth: ${overflow.scrollWidth}, ClientWidth: ${overflow.clientWidth}, Overflow: ${overflow.hasHorizontalOverflow ? 'FAIL' : 'PASS'}`);

    results.viewports.push({
      ...vp,
      overflow,
      screenshot: `viewport_${vp.name}.png`,
    });
  }

  // ─── 2. Direct Navigation & Refresh Tests ───────────────────────────
  console.log('\n--- 2. Direct Navigation & Refresh Verification ---');
  
  // Direct /properties
  await page.setViewport({ width: 1440, height: 900 });
  const navProps = await page.goto(`${BASE_URL}/properties`, { waitUntil: 'networkidle0' });
  results.navigations['direct_properties'] = {
    status: navProps.status(),
    url: page.url(),
  };

  // Refresh on /properties
  const refreshProps = await page.reload({ waitUntil: 'networkidle0' });
  results.navigations['refresh_properties'] = {
    status: refreshProps.status(),
    url: page.url(),
  };

  // Direct /explore
  const navExplore = await page.goto(`${BASE_URL}/explore`, { waitUntil: 'networkidle0' });
  results.navigations['direct_explore'] = {
    status: navExplore.status(),
    url: page.url(),
  };

  console.log('Direct /properties:', results.navigations['direct_properties']);
  console.log('Refresh /properties:', results.navigations['refresh_properties']);
  console.log('Direct /explore:', results.navigations['direct_explore']);

  // ─── 3. Route Protection & Auth Guard Verification ──────────────────
  console.log('\n--- 3. Internal Route Protection Verification (/app/properties) ---');
  
  // Unauthenticated access
  await page.evaluate(() => {
    localStorage.removeItem('bfa_auth_token');
    localStorage.removeItem('bfa_auth_user');
  });
  await page.goto(`${BASE_URL}/app/properties`, { waitUntil: 'networkidle0' });
  const unauthUrl = page.url();
  results.authGuards['unauthenticated'] = {
    requested: '/app/properties',
    finalUrl: unauthUrl,
    blocked: unauthUrl.includes('/login') || !unauthUrl.endsWith('/app/properties'),
  };
  console.log('Unauthenticated /app/properties -> Redirected to:', unauthUrl);

  const unauthScreenshot = path.join(ARTIFACT_DIR, 'auth_guard_unauthenticated.png');
  await page.screenshot({ path: unauthScreenshot });

  // Authenticated access with OPERATIONS_MANAGER
  console.log('\nLogging in via UI as OPERATIONS_MANAGER (manager@bfa.com)...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#login-email, input[type="email"]', 'manager@bfa.com');
  await page.type('#login-password, input[type="password"]', 'Bfa2026!Secure');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]'),
  ]);

  console.log('Post-login URL:', page.url());

  // Navigate to /app/properties
  await page.goto(`${BASE_URL}/app/properties`, { waitUntil: 'networkidle0' });
  const authUrl = page.url();
  const pageTitle = await page.evaluate(() => document.title || document.querySelector('h1')?.innerText || '');

  results.authGuards['authenticated_operations_manager'] = {
    requested: '/app/properties',
    finalUrl: authUrl,
    allowed: authUrl.includes('/app/properties'),
    pageTitle,
  };
  console.log('Authenticated OPERATIONS_MANAGER /app/properties -> Final URL:', authUrl, '| Header/Title:', pageTitle);

  const authScreenshot = path.join(ARTIFACT_DIR, 'auth_guard_operations_manager.png');
  await page.screenshot({ path: authScreenshot, fullPage: false });

  await browser.close();

  console.log('\n--- Verification Summary ---');
  console.log('Console Errors:', results.consoleErrors.length);
  console.log('Failed Requests:', results.failedRequests.length);

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'browser_verification_results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('Browser verification completed successfully! Results saved.');
}

runBrowserVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
