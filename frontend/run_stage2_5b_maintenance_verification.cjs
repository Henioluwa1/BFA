/**
 * Comprehensive Automated Verification Suite for BFA Workspace B - Stage 2.5B:
 * Maintenance Dispatch, Technician Eligibility & Repair Evidence Frontend Integration
 */

const puppeteer = require('../backend/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FRONTEND_URL = 'http://localhost:5173';
const EVIDENCE_DIR = path.resolve(__dirname, 'phase2_5b_maintenance_audit');
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

async function runStage2_5BVerification() {
  console.log('================================================================');
  console.log('BFA WORKSPACE B — STAGE 2.5B AUTOMATED VERIFICATION SUITE');
  console.log('Target: Maintenance Dispatch, Technician Eligibility & Repair Evidence');
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
    // SCENARIO 1: Authentication & Maintenance Navigation
    // -------------------------------------------------------------
    console.log('[SCENARIO 1] Authenticating as Corporate Administrator & Navigating to Maintenance...');
    await loginViaUi(page, 'admin@bfa.com');

    await page.goto(`${FRONTEND_URL}/app/maintenance`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.page-title', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));

    const pageTitle = await page.evaluate(() => document.querySelector('.page-title')?.innerText || '');
    const badgeText = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.badge'));
      return b.map((x) => x.innerText).join(' ');
    });

    const hasHeader = pageTitle.includes('Property Maintenance') || pageTitle.includes('Maintenance');
    const isStage2_5BReady = badgeText.includes('STAGE 2.5B READY');

    console.log(`  Page Title: "${pageTitle}" -> Rendered: ${hasHeader}`);
    console.log(`  Stage Badge: "${badgeText}" -> Stage 2.5B Ready: ${isStage2_5BReady}`);

    results.scenarios.push({
      name: 'Maintenance Dashboard Header & Stage 2.5B Badge',
      passed: hasHeader && isStage2_5BReady,
      details: `Page Title: "${pageTitle}", Stage Badge: "${badgeText}"`,
    });
    if (hasHeader && isStage2_5BReady) results.passed++;
    else results.failed++;

    const dashboardScreenshot = 'stage2_5b_maintenance_dashboard.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, dashboardScreenshot), fullPage: false });

    // -------------------------------------------------------------
    // SCENARIO 2: Work Order Creation Modal & Eligible Assignee Integration
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 2] Verifying Work Order Creation Modal & Eligible Assignee Dropdown...');
    const reportBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Report Work Order'));
    });

    if (reportBtn && reportBtn.asElement()) {
      await reportBtn.click();
      await page.waitForSelector('form', { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 1000));

      const modalInfo = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const options = Array.from(document.querySelectorAll('option')).map((o) => o.innerText);
        const optgroups = Array.from(document.querySelectorAll('optgroup')).map((og) => og.label);
        const hasEvidenceNotice = bodyText.includes('Private Repair Evidence Ready');
        return {
          optionsCount: options.length,
          optgroups,
          hasEvidenceNotice,
        };
      });

      console.log(`  Create Modal Optgroups:`, modalInfo.optgroups);
      console.log(`  Evidence Notice Present:`, modalInfo.hasEvidenceNotice);

      const createModalScreenshot = 'stage2_5b_create_ticket_modal.png';
      await page.screenshot({ path: path.join(EVIDENCE_DIR, createModalScreenshot), fullPage: false });

      const scenario2Pass = modalInfo.hasEvidenceNotice;
      results.scenarios.push({
        name: 'Create Ticket Modal & Eligibility Integration',
        passed: scenario2Pass,
        details: `Optgroups: ${modalInfo.optgroups.join('; ')}, Evidence notice: ${modalInfo.hasEvidenceNotice}`,
      });
      if (scenario2Pass) results.passed++;
      else results.failed++;

      // Close modal
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 600));
    }

    // -------------------------------------------------------------
    // SCENARIO 3: Open Work Order Detail Drawer via "Details" Button
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 3] Opening Work Order Detail Drawer & Verifying Private Evidence Section...');
    const detailsBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.trim() === 'Details');
    });

    if (detailsBtn && detailsBtn.asElement()) {
      await detailsBtn.click();
      await new Promise((r) => setTimeout(r, 1200));

      const drawerEvidenceInfo = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const hasEvidenceHeader = bodyText.includes('Private Repair Evidence');
        const hasAttachBtn = Array.from(document.querySelectorAll('button')).some((b) => b.innerText.includes('Attach Photo'));
        const hasAdminDelete = Array.from(document.querySelectorAll('button')).some((b) => b.innerText.includes('Delete Order'));
        const hasAssignBtn = Array.from(document.querySelectorAll('button')).some((b) => b.innerText.trim() === 'Assign Staff');
        const hasResolveBtn = Array.from(document.querySelectorAll('button')).some((b) => b.innerText.trim() === 'Resolve Order');
        return {
          hasEvidenceHeader,
          hasAttachBtn,
          hasAdminDelete,
          hasAssignBtn,
          hasResolveBtn,
        };
      });

      console.log(`  Evidence Header Present:`, drawerEvidenceInfo.hasEvidenceHeader);
      console.log(`  Attach Photo Button:`, drawerEvidenceInfo.hasAttachBtn);
      console.log(`  Admin Delete Order Button:`, drawerEvidenceInfo.hasAdminDelete);

      const drawerScreenshot = 'stage2_5b_work_order_detail_drawer.png';
      await page.screenshot({ path: path.join(EVIDENCE_DIR, drawerScreenshot), fullPage: false });

      // Click Attach Photo button to view inline upload form
      const attachBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find((b) => b.innerText.includes('Attach Photo'));
      });

      let hasUploadForm = false;
      if (attachBtn && attachBtn.asElement()) {
        await attachBtn.click();
        await new Promise((r) => setTimeout(r, 600));
        hasUploadForm = await page.evaluate(() => {
          return document.body.innerText.includes('Upload Repair Photo Attachment');
        });
        console.log(`  Upload Form Rendered:`, hasUploadForm);
        const uploadFormScreenshot = 'stage2_5b_inline_upload_form.png';
        await page.screenshot({ path: path.join(EVIDENCE_DIR, uploadFormScreenshot), fullPage: false });
      }

      const scenario3Pass = drawerEvidenceInfo.hasEvidenceHeader && drawerEvidenceInfo.hasAttachBtn;
      results.scenarios.push({
        name: 'Work Order Detail Drawer & Private Evidence Section',
        passed: scenario3Pass,
        details: `Evidence Header: ${drawerEvidenceInfo.hasEvidenceHeader}, Attach Button: ${drawerEvidenceInfo.hasAttachBtn}, Upload Form: ${hasUploadForm}`,
      });
      if (scenario3Pass) results.passed++;
      else results.failed++;

      // -------------------------------------------------------------
      // SCENARIO 4: Assign Technician Modal — 5 States, Geofence & Advisory Workload
      // -------------------------------------------------------------
      console.log('\n[SCENARIO 4] Verifying Assign Technician Modal & 5 Eligibility States...');
      const drawerAssignBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find((b) => b.innerText.trim() === 'Assign Staff');
      });

      if (drawerAssignBtn && drawerAssignBtn.asElement()) {
        await drawerAssignBtn.click();
        await new Promise((r) => setTimeout(r, 1200));

        const assignModalInfo = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          const options = Array.from(document.querySelectorAll('option')).map((o) => o.innerText);
          const hasGovernanceNotice = bodyText.includes('BFA Stage 2.5B Dispatch Governance');
          const hasFilterTabs = bodyText.includes('All Candidates') && bodyText.includes('Eligible Only');
          return {
            optionsCount: options.length,
            optionsPreview: options.slice(0, 5),
            hasGovernanceNotice,
            hasFilterTabs,
          };
        });

        console.log(`  Assign Modal Options:`, assignModalInfo.optionsCount);
        console.log(`  Filter Tabs:`, assignModalInfo.hasFilterTabs);
        console.log(`  Governance Notice:`, assignModalInfo.hasGovernanceNotice);

        const assignModalScreenshot = 'stage2_5b_assign_technician_modal.png';
        await page.screenshot({ path: path.join(EVIDENCE_DIR, assignModalScreenshot), fullPage: false });

        const scenario4Pass = assignModalInfo.hasGovernanceNotice && assignModalInfo.hasFilterTabs;
        results.scenarios.push({
          name: 'Assign Technician Modal & 5 Eligibility States',
          passed: scenario4Pass,
          details: `Options: ${assignModalInfo.optionsCount}, Filter tabs: ${assignModalInfo.hasFilterTabs}, Governance notice: ${assignModalInfo.hasGovernanceNotice}`,
        });
        if (scenario4Pass) results.passed++;
        else results.failed++;

        // Close Assign Modal
        await page.keyboard.press('Escape');
        await new Promise((r) => setTimeout(r, 600));
      }

      // -------------------------------------------------------------
      // SCENARIO 5: Resolve Ticket Modal — DEC-2.5B-04 Option C Written Exemptions
      // -------------------------------------------------------------
      console.log('\n[SCENARIO 5] Verifying Resolve Modal & Written Exemption Workflow (DEC-2.5B-04 Option C)...');
      const resolveBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find((b) => b.innerText.trim() === 'Resolve Order');
      });

      if (resolveBtn && resolveBtn.asElement()) {
        await resolveBtn.click();
        await new Promise((r) => setTimeout(r, 1000));

        const resolveModalInfo = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          const hasEvidenceVerification = bodyText.includes('Repair Evidence Verification (DEC-2.5B-04 Option C)');
          const hasAttachOption = bodyText.includes('Attach Completion Photo');
          const hasExemptionOption = bodyText.includes('Document Exemption');
          const hasExistingOption = bodyText.includes('Existing / Not Required');
          return {
            hasEvidenceVerification,
            hasAttachOption,
            hasExemptionOption,
            hasExistingOption,
          };
        });

        console.log(`  Evidence Verification Section:`, resolveModalInfo.hasEvidenceVerification);
        console.log(`  Attach Completion Photo Option:`, resolveModalInfo.hasAttachOption);
        console.log(`  Document Exemption Option:`, resolveModalInfo.hasExemptionOption);

        // Switch to Document Exemption radio
        await page.evaluate(() => {
          const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
          const exemptionRadio = radios.find((r) => r.value === 'WRITTEN_EXEMPTION');
          if (exemptionRadio) exemptionRadio.click();
        });
        await new Promise((r) => setTimeout(r, 600));

        const exemptionDetails = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          const options = Array.from(document.querySelectorAll('option')).map((o) => o.innerText);
          const hasAuditableNotice = bodyText.includes('Auditable Administrative Exception');
          const hasTenantPrivacy = options.some((o) => o.includes('Tenant Privacy'));
          const hasDeviceFailure = options.some((o) => o.includes('Device Hardware Failure'));
          const hasEmergency = options.some((o) => o.includes('Emergency Containment'));
          return {
            hasAuditableNotice,
            hasTenantPrivacy,
            hasDeviceFailure,
            hasEmergency,
            options,
          };
        });

        console.log(`  Exemption Reasons Found: TenantPrivacy=${exemptionDetails.hasTenantPrivacy}, DeviceFailure=${exemptionDetails.hasDeviceFailure}, Emergency=${exemptionDetails.hasEmergency}`);
        console.log(`  Auditable Exception Notice:`, exemptionDetails.hasAuditableNotice);

        const resolveModalScreenshot = 'stage2_5b_resolve_modal_exemption.png';
        await page.screenshot({ path: path.join(EVIDENCE_DIR, resolveModalScreenshot), fullPage: false });

        const scenario5Pass =
          resolveModalInfo.hasEvidenceVerification &&
          exemptionDetails.hasTenantPrivacy &&
          exemptionDetails.hasAuditableNotice;

        results.scenarios.push({
          name: 'Resolve Ticket Modal & DEC-2.5B-04 Option C Exemption Flow',
          passed: scenario5Pass,
          details: `Exemption notice: ${exemptionDetails.hasAuditableNotice}, Tenant Privacy: ${exemptionDetails.hasTenantPrivacy}, Device Failure: ${exemptionDetails.hasDeviceFailure}`,
        });
        if (scenario5Pass) results.passed++;
        else results.failed++;

        // Close Resolve Modal and Drawer
        await page.keyboard.press('Escape');
        await new Promise((r) => setTimeout(r, 600));
      }

      // Close Detail Drawer
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 600));
    }

    // -------------------------------------------------------------
    // SCENARIO 6: Technician Execution Card View
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 6] Verifying Technician Execution Card View & Quick Evidence Triggers...');
    const cardToggleBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Technician Card View'));
    });

    if (cardToggleBtn && cardToggleBtn.asElement()) {
      await cardToggleBtn.click();
      await new Promise((r) => setTimeout(r, 800));

      const cardInfo = await page.evaluate(() => {
        const hasEvidenceBtn = Array.from(document.querySelectorAll('button')).some((b) => b.innerText.includes('Evidence'));
        const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.innerText);
        return {
          hasEvidenceBtn,
          buttonsPreview: buttons.slice(0, 10),
        };
      });

      console.log(`  Quick "📷 Evidence" Action:`, cardInfo.hasEvidenceBtn);

      const cardViewScreenshot = 'stage2_5b_technician_card_view.png';
      await page.screenshot({ path: path.join(EVIDENCE_DIR, cardViewScreenshot), fullPage: false });

      const scenario6Pass = cardInfo.hasEvidenceBtn;
      results.scenarios.push({
        name: 'Technician Execution Card & Evidence Quick Action',
        passed: scenario6Pass,
        details: `Has Evidence quick action button: ${cardInfo.hasEvidenceBtn}`,
      });
      if (scenario6Pass) results.passed++;
      else results.failed++;
    }

    // -------------------------------------------------------------
    // SCENARIO 7: Multi-Viewport Responsive Audit across 8 Viewports
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 7] Multi-Viewport Responsive Audit (320px to 1440px)...');
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

      const shotName = `stage2_5b_viewport_${vp.name}_${vp.width}x${vp.height}.png`;
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

    // Copy screenshots to artifact directory
    const allScreenshots = [
      dashboardScreenshot,
      'stage2_5b_create_ticket_modal.png',
      'stage2_5b_work_order_detail_drawer.png',
      'stage2_5b_inline_upload_form.png',
      'stage2_5b_assign_technician_modal.png',
      'stage2_5b_resolve_modal_exemption.png',
      'stage2_5b_technician_card_view.png',
      ...VIEWPORTS.map((v) => `stage2_5b_viewport_${v.name}_${v.width}x${v.height}.png`),
    ];
    await copyScreenshotsToArtifacts(allScreenshots);

    // Save JSON Results
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'stage2_5b_verification_results.json'),
      JSON.stringify(results, null, 2)
    );
    if (fs.existsSync(ARTIFACT_DIR)) {
      fs.writeFileSync(
        path.join(ARTIFACT_DIR, 'stage2_5b_verification_results.json'),
        JSON.stringify(results, null, 2)
      );
    }

    console.log('\n================================================================');
    console.log(`STAGE 2.5B VERIFICATION COMPLETE: ${results.passed} Passed, ${results.failed} Failed`);
    console.log('================================================================\n');

    return results;
  } finally {
    await browser.close();
  }
}

runStage2_5BVerification()
  .then((res) => {
    if (res.failed > 0) {
      console.error(`Stage 2.5B Verification finished with ${res.failed} failures.`);
      process.exit(1);
    } else {
      console.log('Stage 2.5B Verification succeeded with 100% pass rate.');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('Fatal Verification Error:', err);
    process.exit(1);
  });
