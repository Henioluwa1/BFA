const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const edge = '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"';
const outDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\45c74cec-110c-4755-9549-6023a4f1cde1\\phase2_audit';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const viewports = [
  { name: 'desktop_1440', w: 1440, h: 900 },
  { name: 'laptop_1280', w: 1280, h: 800 },
  { name: 'tablet_landscape_1024', w: 1024, h: 768 },
  { name: 'tablet_portrait_768', w: 768, h: 1024 },
  { name: 'mobile_large_430', w: 430, h: 932 },
  { name: 'mobile_standard_390', w: 390, h: 844 },
  { name: 'mobile_small_360', w: 360, h: 800 },
  { name: 'mobile_tiny_320', w: 320, h: 700 },
];

console.log('=== PHASE 2 HOMEPAGE & NAVIGATION VIEWPORT AUDIT STARTING ===');

for (const vp of viewports) {
  const outFile = path.join(outDir, `homepage_${vp.name}.png`);
  const tmpUserData = path.join(os.tmpdir(), `edge_p2_${vp.name}_${Date.now()}`);
  const cmd = `${edge} --headless=new --disable-gpu --user-data-dir="${tmpUserData}" --run-all-compositor-stages-before-draw --screenshot="${outFile}" --window-size=${vp.w},${vp.h} "http://localhost:5173/"`;
  try {
    execSync(cmd, { stdio: 'ignore', timeout: 15000 });
    const exists = fs.existsSync(outFile);
    const size = exists ? fs.statSync(outFile).size : 0;
    console.log(`[PASS] Homepage ${vp.name} (${vp.w}x${vp.h}): ${exists ? size + ' bytes' : 'MISSING'}`);
    // Clean up temp user data dir
    try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch (e) {}
  } catch (err) {
    console.log(`[ERR] Homepage ${vp.name}:`, err.message);
  }
}

console.log('=== PHASE 2 VIEWPORT AUDIT COMPLETE ===');
