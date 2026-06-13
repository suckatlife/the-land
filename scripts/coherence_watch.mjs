// Coherence + throughput watch: a mature world through ~1.7 day-night cycles
// at natural pacing. Captures every unique log line (narration throughput),
// FPS samples, and screenshots at day/dusk/night/dawn.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=51f518', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
// Mature world: skip a few times to get eras/cities/conflict going
await page.evaluate(() => document.getElementById('skip').click());
await page.waitForTimeout(6000);
await page.evaluate(() => document.getElementById('skip').click());
await page.waitForTimeout(6000);

const seen = new Set();
const lineTimes = [];   // ms timestamps of each new log line
const fpsSamples = [];
const measureFps = () => page.evaluate(() => new Promise(res => {
  let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(f); };
  requestAnimationFrame(loop);
}));

const DURATION_MS = 9 * 60 * 1000; // 9 minutes ~= 1.5 day cycles (6 min each)
const start = Date.now();
let shotIdx = 0;
const shotPlan = [
  { at: 30, name: 'a_day' },
  { at: 150, name: 'b_dusk' },
  { at: 270, name: 'c_night' },
  { at: 390, name: 'd_dawn' },
  { at: 510, name: 'e_day2' },
];

while (Date.now() - start < DURATION_MS) {
  const elapsedS = (Date.now() - start) / 1000;
  // capture current log lines
  const lines = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('div')].find(d =>
      d.style.cssText.includes('bottom: 12px') && d.style.cssText.includes('left: 12px'));
    return panel ? [...panel.children].map(c => c.textContent.trim()) : [];
  });
  for (const l of lines) {
    if (l && !seen.has(l)) { seen.add(l); lineTimes.push(Date.now() - start); }
  }
  // scheduled screenshot
  if (shotIdx < shotPlan.length && elapsedS >= shotPlan[shotIdx].at) {
    await page.screenshot({ path: `/tmp/landshots/coh_${shotPlan[shotIdx].name}.png` });
    const fps = await measureFps();
    fpsSamples.push({ at: Math.round(elapsedS), fps });
    console.log(`  [${Math.round(elapsedS)}s] shot ${shotPlan[shotIdx].name}, fps=${fps}, unique log lines so far=${seen.size}`);
    shotIdx++;
  }
  await page.waitForTimeout(1500);
}

// throughput analysis
const totalMin = DURATION_MS / 60000;
console.log('\n=== THROUGHPUT ===');
console.log(`unique log lines in ${totalMin} min: ${seen.size}  (${(seen.size / totalMin).toFixed(1)} lines/min)`);
// burstiness: max lines in any 20s window
let maxBurst = 0;
for (let t = 0; t < DURATION_MS; t += 5000) {
  const inWin = lineTimes.filter(x => x >= t && x < t + 20000).length;
  if (inWin > maxBurst) maxBurst = inWin;
}
console.log(`busiest 20s window: ${maxBurst} lines`);
console.log('\n=== FPS ===');
for (const s of fpsSamples) console.log(`  ${s.at}s: ${s.fps} fps`);
console.log('\n=== SAMPLE LOG LINES (chronological) ===');
[...seen].slice(0, 40).forEach(l => console.log('  ' + l));
await browser.close();
