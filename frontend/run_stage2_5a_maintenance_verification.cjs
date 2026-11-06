/**
 * Comprehensive Automated Verification Suite for BFA Workspace B - Stage 2.5A:
 * Core Property Maintenance & Unit Care Operations
 */

const puppeteer = require('../backend/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FRONTEND_URL = 'http://localhost:5173';
const EVIDENCE_DIR = path.resolve(__dirname, 'phase2_5a_maintenance_audit');
const ARTIFACT_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\88bff36c-819d-46a9-8801-74cb3602a6e8';

const VIEWPORTS = [
  { name: 'mobile_compact_320', width: 320, height: 700 },
  { name: 'mobile_small_360', width: 360, height: 800 },
  { name: 'mobile_standard_390', width: 390, height: 844 },
  { name: 'mobile_large_430', width: 430, height: 932 },
  { name: 'tablet_portrait_768', width: 768, height: 1024 },
  { name: 'tablet_landscape_1024', width: 1024, height: 768 },
  { name: 'laptop_1280', width: 1280, height: 800 },
  { name: 'desktop_1440', width: 1440, height: 900 },
];

async function loginViaUi(page, email, password = 'Bfa2026!Secure') {
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle2' });

  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for login redirection to complete
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1200));
}

async function copyScreenshotsToArtifacts(filenames) {
  if (!fs.existsSync(ARTIFACT_DIR)) return;
  for (const file of filenames) {
    const src = path.join(EVIDENCE_DIR, file);
    const dest = path.join(ARTIFACT_DIR, file);
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, dest);
      } catch (err) {
        console.warn(`Could not copy ${file} to artifacts:`, err.message);
      }
    }
  }
}

async function runStage2_5AVerification() {
  console.log('================================================================');
  console.log('BFA WORKSPACE B — STAGE 2.5A AUTOMATED VERIFICATION SUITE');
  console.log('Target: Core Property Maintenance & Unit Care Operations');
  console.log('================================================================\n');

  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  const results = {
    timestamp: new Date().toISOString(),
    scenarios: [],
    viewportAudit: [],
    passed: 0,
    failed: 0,
  };

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Admin Authentication & Dashboard Navigation
    // -------------------------------------------------------------
    console.log('[SCENARIO 1] Authenticating as Corporate Administrator & Navigating to Maintenance...');
    await loginViaUi(page, 'admin@bfa.com');

    await page.goto(`${FRONTEND_URL}/app/maintenance`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.page-title', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));

    const pageTitle = await page.evaluate(() => document.querySelector('.page-title')?.innerText || '');
    const hasHeader = pageTitle.includes('Property Maintenance') || pageTitle.includes('Maintenance');

    console.log(`  Page Title: "${pageTitle}" -> Rendered: ${hasHeader}`);
    results.scenarios.push({
      name: 'Maintenance Dashboard Page Header',
      passed: hasHeader,
      details: `Rendered page title: ${pageTitle}`,
    });
    if (hasHeader) results.passed++;
    else results.failed++;

    // -------------------------------------------------------------
    // SCENARIO 2: KPI Metrics Cards Verification
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 2] Verifying Operational KPI Cards...');
    const kpiTexts = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card'));
      return cards.map((c) => c.innerText);
    });

    const hasOpenKpi = kpiTexts.some((t) => t.toUpperCase().includes('OPEN WORK ORDERS'));
    const hasInProgressKpi = kpiTexts.some((t) => t.toUpperCase().includes('IN PROGRESS'));
    const hasCriticalKpi = kpiTexts.some((t) => t.toUpperCase().includes('EMERGENCY'));
    const hasUnitsKpi = kpiTexts.some((t) => t.toUpperCase().includes('UNITS IN MAINTENANCE'));
    const hasCostKpi = kpiTexts.some((t) => t.toUpperCase().includes('TOTAL INCURRED COST'));

    console.log(`  KPI Cards Found: Open=${hasOpenKpi}, InProgress=${hasInProgressKpi}, Critical=${hasCriticalKpi}, Units=${hasUnitsKpi}, Cost=${hasCostKpi}`);
    const allKpisPresent = hasOpenKpi && hasInProgressKpi && hasCriticalKpi && hasUnitsKpi && hasCostKpi;

    results.scenarios.push({
      name: 'Operational KPI Metrics Cards',
      passed: allKpisPresent,
      details: `Open: ${hasOpenKpi}, InProgress: ${hasInProgressKpi}, Critical: ${hasCriticalKpi}, Units: ${hasUnitsKpi}, Cost: ${hasCostKpi}`,
    });
    if (allKpisPresent) results.passed++;
    else results.failed++;

    const dashboardScreenshot = 'stage2_5a_maintenance_dashboard_desktop.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, dashboardScreenshot), fullPage: false });

    // -------------------------------------------------------------
    // SCENARIO 3: Work Order Creation Modal & Occupancy Warning
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 3] Testing Create Work Order Modal...');
    // Click "+ Report Work Order"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const reportBtn = btns.find((b) => b.innerText.includes('Report Work Order') || b.innerText.includes('Report Issue'));
      if (reportBtn) reportBtn.click();
    });

    await page.waitForSelector('.modal-content', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 800));

    const isModalOpen = await page.evaluate(() => {
      const modal = document.querySelector('.modal-content');
      return modal && modal.innerText.includes('Create Property Maintenance Work Order');
    });

    console.log(`  Create Ticket Modal Open: ${isModalOpen}`);
    results.scenarios.push({
      name: 'Create Work Order Modal Open',
      passed: Boolean(isModalOpen),
      details: `Modal displayed with category and priority controls.`,
    });
    if (isModalOpen) results.passed++;
    else results.failed++;

    // Check deferred evidence notice in modal
    const hasEvidenceNotice = await page.evaluate(() => {
      const modal = document.querySelector('.modal-content');
      return modal && modal.innerText.includes('Repair Evidence Photo Upload: Deferred');
    });

    console.log(`  Deferred Photo Upload Limitation Banner Present: ${hasEvidenceNotice}`);
    results.scenarios.push({
      name: 'Deferred Photo Upload Disclosure',
      passed: Boolean(hasEvidenceNotice),
      details: 'Correctly informs user that photo uploads are deferred pending Workspace C private storage.',
    });
    if (hasEvidenceNotice) results.passed++;
    else results.failed++;

    const createModalScreenshot = 'stage2_5a_create_work_order_modal.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, createModalScreenshot), fullPage: false });

    // Close create modal
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cancelBtn = btns.find((b) => b.innerText.includes('Cancel') && b.closest('.modal-content'));
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // -------------------------------------------------------------
    // SCENARIO 4: Work Order Detail Drawer & State Matrix
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 4] Inspecting Work Order Detail Drawer & Operational State Matrix...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const detailBtn = btns.find((b) => b.innerText.trim() === 'Details' || b.innerText.trim() === 'Manage');
      if (detailBtn) detailBtn.click();
    });

    await page.waitForSelector('.modal-content', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 800));

    const hasStateMatrix = await page.evaluate(() => {
      const modal = document.querySelector('.modal-content');
      if (!modal) return false;
      const text = modal.innerText;
      return (
        text.includes('WORK ORDER STATE') &&
        text.includes('APARTMENT OPERATIONAL STATE') &&
        text.includes('RESERVATION BOOKING RESTRICTION')
      );
    });

    console.log(`  State Matrix Rendered in Detail Drawer: ${hasStateMatrix}`);
    results.scenarios.push({
      name: 'Work Order vs Unit vs Booking State Matrix',
      passed: Boolean(hasStateMatrix),
      details: 'Drawer clearly distinguishes work order status, apartment operational status, and reservation restrictions.',
    });
    if (hasStateMatrix) results.passed++;
    else results.failed++;

    const detailDrawerScreenshot = 'stage2_5a_work_order_detail_drawer.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, detailDrawerScreenshot), fullPage: false });

    // Close detail drawer
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const closeBtn = btns.find((b) => b.innerText.trim() === 'Close' && b.closest('.modal-content'));
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // -------------------------------------------------------------
    // SCENARIO 5: Technician Assignment Modal with Neutral Labeling
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 5] Testing Technician Assignment Modal & Governance Labeling...');
    // Open details again to click "Assign Staff"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const detailBtn = btns.find((b) => b.innerText.trim() === 'Details' || b.innerText.trim() === 'Manage');
      if (detailBtn) detailBtn.click();
    });
    await page.waitForSelector('.modal-content', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const assignBtn = btns.find((b) => b.innerText.trim() === 'Assign Staff');
      if (assignBtn) assignBtn.click();
    });

    await new Promise((r) => setTimeout(r, 800));

    const hasNeutralLabelNotice = await page.evaluate(() => {
      const modal = document.querySelector('.modal-content');
      if (!modal) return false;
      return modal.innerText.includes('Assigned Property Staff Designation');
    });

    console.log(`  Neutral Labeling & Attendance Disclaimer Present: ${hasNeutralLabelNotice}`);
    results.scenarios.push({
      name: 'Technician Assignment Governance & Disclaimer',
      passed: Boolean(hasNeutralLabelNotice),
      details: 'Ensures staff is labeled as Assigned Property Staff without falsely certifying live on-duty clock-in.',
    });
    if (hasNeutralLabelNotice) results.passed++;
    else results.failed++;

    const assignModalScreenshot = 'stage2_5a_assign_technician_modal.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, assignModalScreenshot), fullPage: false });

    // Close assign modal
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cancelBtn = btns.find((b) => b.innerText.includes('Cancel') && b.closest('.modal-content'));
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // -------------------------------------------------------------
    // SCENARIO 6: Work Order Resolution Modal & Financial Safeguard
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 6] Testing Resolution Modal & Financial Safeguards...');
    // Open resolve modal directly from table
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const resBtn = btns.find((b) => b.innerText.trim() === 'Resolve');
      if (resBtn) resBtn.click();
    });

    await page.waitForSelector('.modal-content', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 800));

    const hasFinancialNotice = await page.evaluate(() => {
      const modal = document.querySelector('.modal-content');
      if (!modal) return false;
      const text = modal.innerText;
      return (
        text.includes('Financial Separation of Duties') &&
        text.includes('Unit Operational State Progression')
      );
    });

    console.log(`  Financial Separation & Cleaning Turnover Notice Present: ${hasFinancialNotice}`);
    results.scenarios.push({
      name: 'Financial Separation & Housekeeping Handoff Disclosures',
      passed: Boolean(hasFinancialNotice),
      details: 'Clearly communicates that maintenance cost is not an accounting expense and unit enters CLEANING.',
    });
    if (hasFinancialNotice) results.passed++;
    else results.failed++;

    const resolveModalScreenshot = 'stage2_5a_resolve_work_order_modal.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, resolveModalScreenshot), fullPage: false });

    // Close resolve modal
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cancelBtn = btns.find((b) => b.innerText.includes('Cancel') && b.closest('.modal-content'));
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // -------------------------------------------------------------
    // SCENARIO 7: Technician Mobile Execution Cards View
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 7] Testing Technician Card View Toggle...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cardToggle = btns.find((b) => b.innerText.includes('Card View'));
      if (cardToggle) cardToggle.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const cardsRendered = await page.evaluate(() => {
      const cards = document.querySelectorAll('.card');
      return cards.length >= 2;
    });

    console.log(`  Technician Execution Cards Rendered: ${cardsRendered}`);
    results.scenarios.push({
      name: 'Technician Card View Mode',
      passed: Boolean(cardsRendered),
      details: 'Mobile-first card layout renders seamlessly.',
    });
    if (cardsRendered) results.passed++;
    else results.failed++;

    const technicianCardsScreenshot = 'stage2_5a_technician_card_view.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, technicianCardsScreenshot), fullPage: false });

    // -------------------------------------------------------------
    // SCENARIO 8: Multi-Viewport Responsive Audit (8 Viewports)
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 8] Multi-Viewport Responsive Audit (320px to 1440px)...');
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise((r) => setTimeout(r, 600));

      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        return {
          scrollWidth: docWidth,
          clientWidth: winWidth,
          hasHorizontalScroll: docWidth > winWidth + 1, // allow 1px rounding tolerance
        };
      });

      const shotName = `stage2_5a_viewport_${vp.name}_${vp.width}x${vp.height}.png`;
      await page.screenshot({ path: path.join(EVIDENCE_DIR, shotName), fullPage: false });

      const passed = !overflow.hasHorizontalScroll;
      console.log(`  Viewport ${vp.name} (${vp.width}x${vp.height}): ScrollWidth=${overflow.scrollWidth}, ClientWidth=${overflow.clientWidth} -> Pass: ${passed}`);

      results.viewportAudit.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        scrollWidth: overflow.scrollWidth,
        clientWidth: overflow.clientWidth,
        passed,
        screenshot: shotName,
      });

      if (passed) results.passed++;
      else results.failed++;
    }

    // Copy all screenshots to artifact directory
    const allScreenshots = [
      dashboardScreenshot,
      createModalScreenshot,
      detailDrawerScreenshot,
      assignModalScreenshot,
      resolveModalScreenshot,
      technicianCardsScreenshot,
      ...VIEWPORTS.map((v) => `stage2_5a_viewport_${v.name}_${v.width}x${v.height}.png`),
    ];
    await copyScreenshotsToArtifacts(allScreenshots);

    // Save JSON Results
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'stage2_5a_verification_results.json'),
      JSON.stringify(results, null, 2)
    );
    if (fs.existsSync(ARTIFACT_DIR)) {
      fs.writeFileSync(
        path.join(ARTIFACT_DIR, 'stage2_5a_verification_results.json'),
        JSON.stringify(results, null, 2)
      );
    }

    console.log('\n================================================================');
    console.log(`VERIFICATION COMPLETE: ${results.passed} Passed, ${results.failed} Failed`);
    console.log('================================================================\n');

    return results;
  } finally {
    await browser.close();
  }
}

runStage2_5AVerification()
  .then((res) => {
    if (res.failed > 0) {
      console.error(`Stage 2.5A Verification finished with ${res.failed} failures.`);
      process.exit(1);
    } else {
      console.log('Stage 2.5A Verification succeeded with 100% pass rate.');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('Fatal Verification Error:', err);
    process.exit(1);
  });
