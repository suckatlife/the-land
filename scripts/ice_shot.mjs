// Ice-age harness. Scrubs the ice extent directly (__hier.ice) rather than
// waiting minutes of wall clock for a world to reach its glacial — captures
// the whole arc: onset, mid-advance, maximum, mid-retreat, and the pale ground
// and moraine left behind after the thaw.
// Usage: node scripts/ice_shot.mjs <url> <outdir>
import { chromium } from 'playwright';

const [url, outdir] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1900, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

for (let i = 0; i < 3; i++) {
  await page.evaluate(() => document.getElementById('skip').click());
  await page.waitForTimeout(600);
}
await page.evaluate(() => {
  for (const c of window.__sim.civs.values()) if (c.phase !== 'dead') c.era = 'medieval';
});
await page.waitForTimeout(2000);

// Drive the glacial by the WORLD CLOCK, not by pinning the extent: step()
// recomputes iceExtent from the tick every tick, so a pinned value is
// overwritten immediately. Setting the tick exercises the real path.
const PHASES = [
  ['onset',   0.32],
  ['advance', 0.44],
  ['maximum', 0.55],
  ['retreat', 0.75],
  ['thaw',    0.975],
];
for (const [name, frac] of PHASES) {
  await page.evaluate((f) => { window.__sim.tick = Math.floor(f * 30000); }, frac);
  await page.waitForTimeout(1600); // let the sim recompute and the layer re-bake
  console.log(name, JSON.stringify(await page.evaluate(() => window.__hier.iceState())));
  await page.screenshot({ path: `${outdir}/ice_${name}.png` });
}
console.log('done');
await browser.close();
