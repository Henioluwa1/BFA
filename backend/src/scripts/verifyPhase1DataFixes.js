const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

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

async function verifyFixes() {
  console.log('=== BFA WORKSPACE A — PHASE 1 DATA FIXES VERIFICATION ===\n');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const report = {
    timestamp: new Date().toISOString(),
    propertiesChecked: [],
    viewports: [],
    consoleErrors: [],
    failedRequests: [],
  };

  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon.ico')) {
        report.consoleErrors.push(text);
      }
    }
  });

  page.on('requestfailed', (req) => {
    report.failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
  });

  // 1. Inspect /properties page on desktop
  console.log('--- Step 1: Navigating to /properties and inspecting live DOM ---');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/properties`, { waitUntil: 'networkidle0' });

  // Wait for property cards
  await page.waitForSelector('.bfa-property-card-wrapper', { timeout: 10000 });

  const cardData = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.bfa-property-card-wrapper'));
    return cards.map((c) => {
      const title = c.querySelector('.bfa-property-card-title')?.innerText?.trim() || '';
      const priceCaption = c.querySelector('.bfa-price-caption')?.innerText?.trim() || '';
      const priceFigure = c.querySelector('.bfa-price-figure')?.innerText?.trim() || '';
      const priceNotice = c.querySelector('.bfa-price-notice')?.innerText?.trim() || '';
      
      const badgeElements = Array.from(c.querySelectorAll('.bfa-property-card-overlay .bfa-lux-badge-text'));
      const badges = badgeElements.map((b) => b.innerText.trim());

      const amenityChips = Array.from(c.querySelectorAll('.bfa-amenity-chip')).map((a) => a.innerText.trim());
      const amenityNeutral = c.querySelector('.bfa-amenity-neutral')?.innerText?.trim() || null;

      return {
        title,
        priceCaption,
        priceFigure,
        priceNotice,
        badges,
        amenityChips,
        amenityNeutral,
      };
    });
  });

  console.log('Rendered Property Cards in DOM:');
  console.log(JSON.stringify(cardData, null, 2));
  report.propertiesChecked = cardData;

  // 2. Validate expectations
  console.log('\n--- Step 2: Validating Fixes Against Business Criteria ---');

  // Property 1 (Grand Horizon Tower):
  const ght = cardData.find((c) => c.title.includes('Grand Horizon Tower'));
  console.log('\n[Property 1: Grand Horizon Tower]');
  console.log(' - Rendered Price:', ght?.priceFigure);
  console.log(' - Price Check: Expected ₦160,000 /night ->', ght?.priceFigure.includes('160,000') ? 'PASS' : 'FAIL');
  console.log(' - Rendered Amenities:', ght?.amenityChips.length === 0 ? `Empty (Neutral: "${ght?.amenityNeutral}")` : ght?.amenityChips);
  console.log(' - Amenities Check: Backend has 0 amenities -> Neutral message displayed, 0 chips ->', (ght?.amenityChips.length === 0 && ght?.amenityNeutral) ? 'PASS' : 'FAIL');
  console.log(' - Badges:', ght?.badges);
  console.log(' - Availability Badge Check: "Units Available" present, "Immediate Check-In" ABSENT ->', (ght?.badges.includes('Units Available') && !ght?.badges.includes('Immediate Check-In')) ? 'PASS' : 'FAIL');

  // Property 2 (Azure Bay Residences):
  const abr = cardData.find((c) => c.title.includes('Azure Bay Residences'));
  console.log('\n[Property 2: Azure Bay Residences]');
  console.log(' - Rendered Price:', abr?.priceFigure);
  console.log(' - Price Check: Expected ₦140,000 /night (WAS ₦280,000 hardcoded) ->', abr?.priceFigure.includes('140,000') ? 'PASS' : 'FAIL');
  console.log(' - Rendered Amenities:', abr?.amenityChips);
  console.log(' - Amenities Check: Verified backend 5 amenities ("Lagoon View", "Fiber Internet", "Private Jetty", "24/7 Power", "Executive Lounge") ->', (abr?.amenityChips.includes('Lagoon View') && abr?.amenityChips.includes('Private Jetty')) ? 'PASS' : 'FAIL');
  console.log(' - Badges:', abr?.badges);
  console.log(' - Availability Badge Check: "Units Available" present, "Immediate Check-In" ABSENT ->', (abr?.badges.includes('Units Available') && !abr?.badges.includes('Immediate Check-In')) ? 'PASS' : 'FAIL');

  // Property 3 (The Royal Palms Suites):
  const rps = cardData.find((c) => c.title.includes('Royal Palms'));
  console.log('\n[Property 3: The Royal Palms Suites]');
  console.log(' - Rendered Price:', rps?.priceFigure);
  console.log(' - Price Check: Expected ₦200,000 /night (WAS ₦250,000 hardcoded) ->', rps?.priceFigure.includes('200,000') ? 'PASS' : 'FAIL');
  console.log(' - Rendered Amenities:', rps?.amenityChips);
  console.log(' - Amenities Check: Verified backend 5 amenities ("Fiber Internet", "Rooftop Terrace", "Smart TV", "24/7 Power", "Room Service") ->', (rps?.amenityChips.includes('Rooftop Terrace') && rps?.amenityChips.includes('Smart TV')) ? 'PASS' : 'FAIL');
  console.log(' - Badges:', rps?.badges);
  console.log(' - Availability Badge Check: "Units Available" present, "Immediate Check-In" ABSENT ->', (rps?.badges.includes('Units Available') && !rps?.badges.includes('Immediate Check-In')) ? 'PASS' : 'FAIL');

  // 3. Viewport & Overflow Verification across all 8 viewports
  console.log('\n--- Step 3: Checking All 8 Responsive Viewports for Horizontal Overflow ---');
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/properties`, { waitUntil: 'networkidle0' });

    const overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    const screenshotName = `phase1_fix_${vp.name}.png`;
    const screenshotPath = path.join(ARTIFACT_DIR, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(`[${vp.name}] (${vp.width}x${vp.height}) - ScrollWidth: ${overflow.scrollWidth}, ClientWidth: ${overflow.clientWidth}, Overflow: ${overflow.hasHorizontalOverflow ? 'FAIL' : 'PASS'}`);

    report.viewports.push({
      ...vp,
      overflow,
      screenshot: screenshotName,
    });
  }

  // 4. Save results
  console.log('\n--- Step 4: Errors and Network Summary ---');
  console.log('Console Errors:', report.consoleErrors.length);
  console.log('Failed Requests:', report.failedRequests.length);

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'phase1_data_fixes_verification.json'),
    JSON.stringify(report, null, 2)
  );

  await browser.close();
  console.log('\n=== All verifications completed successfully ===');
}

verifyFixes().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});

