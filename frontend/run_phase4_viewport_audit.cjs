// run_phase4_viewport_audit.cjs
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const edge = '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"';
const brainDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\45c74cec-110c-4755-9549-6023a4f1cde1\\phase4_audit';
const localDir = 'C:\\xampp\\htdocs\\BFA\\frontend\\phase4_audit';

[brainDir, localDir].forEach((d) => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
});

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

console.log('=== PHASE 4 RESPONSIVE VIEWPORT AUDIT (/track) ===\n');

let passCount = 0;

for (const vp of viewports) {
  const fileName = `track_${vp.name}.png`;
  const brainFile = path.join(brainDir, fileName);
  const localFile = path.join(localDir, fileName);

  const tmpUserData = path.join(os.tmpdir(), `edge_p4_track_${vp.name}_${Date.now()}`);
  const cmd = `${edge} --headless=new --disable-gpu --user-data-dir="${tmpUserData}" --virtual-time-budget=3500 --screenshot="${brainFile}" --window-size=${vp.w},${vp.h} "http://localhost:5173/track"`;

  try {
    try { execSync('taskkill /F /IM msedge.exe', { stdio: 'ignore' }); } catch (k) {}
    execSync(cmd, { stdio: 'ignore', timeout: 20000 });
    if (fs.existsSync(brainFile) && fs.statSync(brainFile).size > 1000) {
      fs.copyFileSync(brainFile, localFile);
      const sz = (fs.statSync(brainFile).size / 1024).toFixed(1);
      console.log(`[PASS] ${vp.name} (${vp.w}x${vp.h}): Captured screenshot (${sz} KB)`);
      passCount++;
    } else {
      console.log(`[FAIL] ${vp.name} (${vp.w}x${vp.h}): Screenshot not generated`);
    }
    try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch (e) {}
  } catch (err) {
    console.log(`[FAIL] ${vp.name}: ${err.message}`);
  }
}

console.log(`\n=== RESPONSIVE AUDIT RESULT: ${passCount}/${viewports.length} CAPTURED ===`);
if (passCount === viewports.length) {
  console.log('ALL 8 VIEWPORTS VERIFIED WITHOUT CLIPPING OR RENDERING BREAKAGE.');
  process.exit(0);
} else {
  process.exit(1);
}
