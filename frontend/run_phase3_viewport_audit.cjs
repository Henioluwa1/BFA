const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const edge = '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"';
const brainDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\45c74cec-110c-4755-9549-6023a4f1cde1\\phase3_audit';
const localDir = 'C:\\xampp\\htdocs\\BFA\\frontend\\phase3_audit';

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

const targets = [
  { prefix: 'explore', url: 'http://localhost:5173/properties' },
  { prefix: 'detail_ght', url: 'http://localhost:5173/property/1' },
];

console.log('=== PHASE 3 PROPERTY DISCOVERY & DETAIL VIEWPORT AUDIT STARTING ===');

for (const t of targets) {
  console.log(`\n--- Auditing Target: ${t.prefix} (${t.url}) ---`);
  for (const vp of viewports) {
    const fileName = `${t.prefix}_${vp.name}.png`;
    const brainFile = path.join(brainDir, fileName);
    const localFile = path.join(localDir, fileName);

    if (fs.existsSync(brainFile) && fs.statSync(brainFile).size > 1000) {
      if (!fs.existsSync(localFile)) fs.copyFileSync(brainFile, localFile);
      console.log(`[ALREADY EXISTS] ${fileName}: ${fs.statSync(brainFile).size} bytes`);
      continue;
    }

    const tmpUserData = path.join(os.tmpdir(), `edge_p3_${t.prefix}_${vp.name}_${Date.now()}`);
    const cmd = `${edge} --headless=new --disable-gpu --user-data-dir="${tmpUserData}" --virtual-time-budget=4000 --screenshot="${brainFile}" --window-size=${vp.w},${vp.h} "${t.url}"`;
    try {
      try { execSync('taskkill /F /IM msedge.exe', { stdio: 'ignore' }); } catch (k) {}
      execSync(cmd, { stdio: 'ignore', timeout: 20000 });
      if (fs.existsSync(brainFile)) {
        fs.copyFileSync(brainFile, localFile);
        const sz = fs.statSync(brainFile).size;
        console.log(`[PASS] ${fileName} (${vp.w}x${vp.h}): ${sz} bytes`);
      } else {
        console.log(`[WARN] ${fileName}: File not generated`);
      }
      try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch (e) {}
    } catch (err) {
      console.log(`[ERR] ${fileName}:`, err.message);
    }
  }
}

console.log('\n=== PHASE 3 VIEWPORT AUDIT COMPLETE ===');
